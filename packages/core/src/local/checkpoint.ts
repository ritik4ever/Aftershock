import { createReadStream } from 'node:fs';
import {
  cp,
  mkdir,
  lstat,
  readdir,
  realpath,
  chmod,
  readFile,
  writeFile,
  rm,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { z } from 'zod';
import { docker } from './fixture.js';
import type { startFixture } from './fixture.js';
import { localRpc, waitForRpc } from './rpc.js';
import { hash, quantity, explorerInfo } from '../schema.js';

const MAX_BYTES = 2_147_483_648;
const MAX_FILES = 10_000;
const block = z.object({ number: quantity, hash, timestamp: quantity });
const fileEntry = z
  .object({
    path: z.string().min(1).max(512),
    bytes: z.number().int().nonnegative().max(MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    checkpointId: z.uuid(),
    head: block,
    files: z.array(fileEntry).max(MAX_FILES),
  })
  .strict();
type Fixture = Awaited<ReturnType<typeof startFixture>>;
const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');

async function privateDirectory(path: string) {
  if (
    process.platform !== 'linux' ||
    !process.getuid ||
    (await realpath(path)) !== path
  )
    throw new Error('Checkpoint requires a private Linux directory');
  const info = await lstat(path);
  if (!info.isDirectory() || info.uid !== process.getuid() || info.mode & 0o077)
    throw new Error('Unsafe checkpoint directory');
}

// Only stopped, owned runtime trees are copied. Special files and symlinks are
// rejected rather than followed; key/validator contents never enter diagnostics.
export async function checkpointInventory(
  directory: string,
  makePrivate = false,
) {
  await privateDirectory(directory);
  const files: z.infer<typeof fileEntry>[] = [];
  let total = 0;
  let entries = 0;
  async function visit(path: string) {
    const info = await lstat(path);
    if (
      ++entries > MAX_FILES ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid!()
    )
      throw new Error('Unsupported checkpoint entry');
    if (info.isDirectory()) {
      if (makePrivate) await chmod(path, 0o700);
      for (const name of (await readdir(path)).sort())
        await visit(resolve(path, name));
    } else if (info.isFile()) {
      total += info.size;
      if (total > MAX_BYTES)
        throw new Error('Checkpoint exceeds its size bound');
      if (makePrivate) await chmod(path, 0o600);
      const sha = createHash('sha256');
      let bytes = 0;
      for await (const chunk of createReadStream(path)) {
        bytes += chunk.length;
        if (bytes > info.size)
          throw new Error('Checkpoint file changed while reading');
        sha.update(chunk);
      }
      if (bytes !== info.size)
        throw new Error('Checkpoint file changed while reading');
      files.push({
        path: relative(directory, path),
        bytes,
        sha256: sha.digest('hex'),
      });
    } else throw new Error('Unsupported checkpoint entry');
  }
  await visit(directory);
  return files;
}

// Internal filesystem primitive. The checkpoint controller must stop and verify
// the owned containers first; this function preserves their mounted root inode.
export async function replaceStoppedMountContents(
  source: string,
  destination: string,
) {
  await privateDirectory(source);
  await privateDirectory(destination);
  if (
    source === destination ||
    source.startsWith(`${destination}/`) ||
    destination.startsWith(`${source}/`)
  )
    throw new Error('Checkpoint copy directories must not overlap');
  const expected = await checkpointInventory(source);
  await checkpointInventory(destination);
  for (const entry of await readdir(destination))
    await rm(resolve(destination, entry), { recursive: true });
  for (const entry of await readdir(source))
    await cp(resolve(source, entry), resolve(destination, entry), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  if (
    JSON.stringify(await checkpointInventory(destination)) !==
    JSON.stringify(expected)
  )
    throw new Error('Mounted restored data differs from checkpoint');
}

export async function createMinedCheckpoint(root: string, fixture: Fixture) {
  z.uuid().parse(fixture.runId);
  if (
    fixture.fingerprint.runtimeStateMode !== 'MANAGED_PRIVATE_DIRECTORIES' ||
    fixture.fingerprint.bundlingMode !== 'manual'
  )
    throw new Error('Fixture was not created for managed mining checkpoints');
  const base = await realpath(root);
  const directory = resolve(base, '.local', fixture.runId);
  await privateDirectory(resolve(base, '.local'));
  await privateDirectory(directory);
  const runtime = resolve(directory, 'runtime');
  await privateDirectory(runtime);
  const prefix = `aftershock-${fixture.runId}`;
  const names = {
    execution: `${prefix}-ethrex`,
    sidecar: `${prefix}-sidecar`,
    beacon: `${prefix}-beacon`,
    validators: `${prefix}-validator`,
  };
  const stopOrder = [
    names.validators,
    names.beacon,
    names.sidecar,
    names.execution,
  ];
  const startOrder = [...stopOrder].reverse();
  const network = `${prefix}-net`;
  async function owned() {
    const containers = z
      .array(
        z.object({
          Name: z.string(),
          Config: z.object({
            User: z.string(),
            Labels: z.record(z.string(), z.string()),
          }),
          HostConfig: z.object({
            Privileged: z.literal(false),
            PublishAllPorts: z.literal(false),
            PortBindings: z.record(z.string(), z.unknown()).nullable(),
          }),
          NetworkSettings: z.object({
            Networks: z.record(z.string(), z.unknown()),
          }),
          Mounts: z.array(
            z.object({
              Type: z.string(),
              Source: z.string(),
              Destination: z.string(),
              RW: z.boolean(),
            }),
          ),
          State: z.object({
            Running: z.boolean(),
            ExitCode: z.number(),
            OOMKilled: z.boolean(),
          }),
        }),
      )
      .parse(JSON.parse(await docker('inspect', ...startOrder)));
    const net = z
      .array(
        z.object({
          Internal: z.literal(true),
          Labels: z.record(z.string(), z.string()),
        }),
      )
      .parse(JSON.parse(await docker('network', 'inspect', network)))[0]!;
    if (net.Labels['aftershock.run'] !== fixture.runId)
      throw new Error('Checkpoint network ownership mismatch');
    for (const container of containers) {
      const role = (Object.keys(names) as Array<keyof typeof names>).find(
        (key) => `/${names[key]}` === container.Name,
      );
      if (
        !role ||
        container.Config.Labels['aftershock.run'] !== fixture.runId ||
        container.Config.User !== `${process.getuid!()}:${process.getgid!()}` ||
        Object.keys(container.HostConfig.PortBindings ?? {}).length ||
        Object.keys(container.NetworkSettings.Networks).join(',') !== network
      )
        throw new Error('Checkpoint container ownership mismatch');
      const mounts = container.Mounts.filter((mount) => mount.RW);
      if (
        mounts.length !== 1 ||
        mounts[0]!.Type !== 'bind' ||
        mounts[0]!.Source !== resolve(runtime, role) ||
        mounts[0]!.Destination !==
          (role === 'validators'
            ? '/aftershock/validators'
            : '/aftershock/state')
      )
        throw new Error('Checkpoint runtime mount mismatch');
    }
    return containers;
  }
  async function stopAll() {
    await owned();
    for (const name of stopOrder) await docker('stop', '-t', '30', name);
    const stopped = await owned();
    if (
      stopped.some(
        (container) =>
          container.State.Running ||
          container.State.OOMKilled ||
          container.State.ExitCode === 137,
      )
    )
      throw new Error('Checkpoint requires stopped healthy processes');
  }
  async function start(namesToStart: string[]) {
    await owned();
    for (const name of namesToStart) await docker('start', name);
  }

  await owned();
  const before = await localRpc(
    fixture.sidecarUrl,
    'skandha_explorer_info',
    [],
    explorerInfo,
  );
  if (before.latestSeq !== 0)
    throw new Error('Checkpoint capture supports pre-scenario state only');
  // Freeze block production first, then observe the canonical head while the
  // executor remains available to proxy reads. All databases are stopped next.
  await docker('stop', '-t', '30', names.validators);
  await docker('stop', '-t', '30', names.beacon);
  const head = await localRpc(
    fixture.executionUrl,
    'eth_getBlockByNumber',
    ['latest', false],
    block,
  );
  if (BigInt(head.number) === 0n)
    throw new Error('Checkpoint requires a mined state');
  await stopAll();
  const checkpointId = randomUUID();
  const snapshot = resolve(directory, `checkpoint-${checkpointId}`);
  await mkdir(snapshot, { mode: 0o700 });
  let manifestText: string;
  try {
    const original = await checkpointInventory(runtime);
    await cp(runtime, resolve(snapshot, 'runtime'), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const files = await checkpointInventory(resolve(snapshot, 'runtime'), true);
    if (JSON.stringify(files) !== JSON.stringify(original))
      throw new Error('Checkpoint copy differs from stopped state');
    manifestText = JSON.stringify(
      manifestSchema.parse({
        version: 1,
        runId: fixture.runId,
        checkpointId,
        head,
        files,
      }),
    );
    if (Buffer.byteLength(manifestText) > 2_097_152)
      throw new Error('Checkpoint manifest too large');
    await writeFile(resolve(snapshot, 'manifest.json'), manifestText, {
      mode: 0o600,
      flag: 'wx',
    });
  } finally {
    await start(startOrder);
    await waitForRpc(fixture.executionUrl);
    await waitForRpc(fixture.sidecarUrl);
  }
  const manifestSha256 = digest(manifestText);
  const metadata = Object.freeze({
    checkpointId,
    manifestSha256,
    head,
    scope: 'PRE_SCENARIO_MINED_STATE' as const,
  });
  let restoredPaused = false;
  return {
    metadata,
    async restore() {
      await privateDirectory(snapshot);
      const manifestPath = resolve(snapshot, 'manifest.json');
      const info = await lstat(manifestPath);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size > 2_097_152 ||
        info.uid !== process.getuid!() ||
        info.mode & 0o077
      )
        throw new Error('Unsafe checkpoint manifest');
      const text = await readFile(manifestPath, 'utf8');
      if (digest(text) !== manifestSha256)
        throw new Error('Checkpoint manifest changed');
      const manifest = manifestSchema.parse(JSON.parse(text));
      const files = await checkpointInventory(resolve(snapshot, 'runtime'));
      if (JSON.stringify(files) !== JSON.stringify(manifest.files))
        throw new Error('Checkpoint data changed');
      const staged = resolve(directory, `restore-${randomUUID()}`);
      await cp(resolve(snapshot, 'runtime'), staged, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await privateDirectory(staged);
      if (
        JSON.stringify(await checkpointInventory(staged)) !==
        JSON.stringify(manifest.files)
      )
        throw new Error('Restored copy differs from checkpoint');
      await stopAll();
      await privateDirectory(runtime);
      const previous = resolve(directory, `retired-${randomUUID()}`);
      await cp(runtime, previous, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      // Docker Desktop can retain the bind-mounted directory inode across
      // container restarts. Preserve every mount root and replace only its
      // stopped contents; renaming the parent can restart the OLD database.
      const roles = Object.keys(names).sort();
      if (
        JSON.stringify((await readdir(runtime)).sort()) !==
        JSON.stringify(roles)
      )
        throw new Error('Unexpected checkpoint runtime directories');
      for (const role of roles) {
        await replaceStoppedMountContents(
          resolve(staged, role),
          resolve(runtime, role),
        );
      }
      if (
        JSON.stringify(await checkpointInventory(runtime)) !==
        JSON.stringify(manifest.files)
      )
        throw new Error('Mounted restored data differs from checkpoint');
      await start([names.execution, names.sidecar]);
      await waitForRpc(fixture.executionUrl);
      await waitForRpc(fixture.sidecarUrl);
      const actual = await localRpc(
        fixture.executionUrl,
        'eth_getBlockByNumber',
        ['latest', false],
        block,
      );
      if (
        actual.hash !== manifest.head.hash ||
        actual.number !== manifest.head.number
      )
        throw new Error('Restored execution head differs from checkpoint');
      restoredPaused = true;
      // The replaced working copy is removed only after the restored head is
      // verified. Failure retains private state for investigation.
      await privateDirectory(previous);
      await rm(previous, { recursive: true });
      await privateDirectory(staged);
      await rm(staged, { recursive: true });
      return {
        ...metadata,
        restoredHead: actual,
        miningResumed: false as const,
      };
    },
    async resumeMining() {
      if (!restoredPaused)
        throw new Error('Restore must complete before mining resumes');
      await start([names.beacon, names.validators]);
      restoredPaused = false;
    },
  };
}
