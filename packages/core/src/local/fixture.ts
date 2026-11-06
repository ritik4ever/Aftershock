import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, rename } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { UPSTREAM } from '../inspect.js';
import { readResetKeys, resetSource, minedResetSource } from './reset.js';
import type { ResetSource, MinedResetSource } from './reset.js';
import { prepareMinedCheckpoint } from './checkpoint.js';
import { localRpc, waitForRpc } from './rpc.js';
import { hash, quantity } from '../schema.js';
import {
  generateMiningGenesis,
  LIGHTHOUSE_IMAGE,
  GENESIS_IMAGE,
} from './mining.js';

const execute = promisify(execFile);
export const ETHREX_IMAGE =
  'ghcr.io/forshtat/eip8141-devnet@sha256:c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6';
export const SIDECAR_IMAGE = 'aftershock-sidecar:2e22ff0';
export class FixtureSetupError extends Error {
  constructor(readonly stage: string) {
    super(`Isolated fixture failed at ${stage}`);
  }
}
export type LocalEndpoint = { executor: string; url: string };

export async function docker(...args: string[]): Promise<string> {
  const { stdout } = await execute('docker', args, {
    timeout: 120_000,
    maxBuffer: 1_048_576,
  });
  return stdout.trim();
}

type Genesis = {
  config: { chainId: number };
  alloc: Record<
    string,
    { code?: string | undefined; balance: string; nonce?: string | undefined }
  >;
};

export async function startFixture(
  root: string,
  runId: string = randomUUID(),
  mining = false,
  bundlingMode: 'auto' | 'manual' = mining ? 'auto' : 'manual',
  useropsTTL = 300,
  reset?: ResetSource,
  checkpointMining = false,
  minedReset?: MinedResetSource,
) {
  z.uuid().parse(runId);
  z.number().int().min(10).max(300).parse(useropsTTL);
  if (checkpointMining && (!mining || reset || process.platform !== 'linux'))
    throw new Error('Managed checkpoints require a fresh Linux mining fixture');
  if (minedReset) {
    minedResetSource.parse(minedReset);
    if (
      !checkpointMining ||
      !mining ||
      bundlingMode !== 'manual' ||
      reset ||
      minedReset.runId === runId
    )
      throw new Error('Unsupported mined checkpoint fixture');
  }
  if (reset) {
    resetSource.parse(reset);
    if (mining || bundlingMode !== 'manual' || useropsTTL !== 30)
      throw new Error('Genesis reset supports the admission-only TTL fixture');
  }
  const prefix = `aftershock-${runId}`;
  const directory = resolve(root, '.local', runId);
  await mkdir(resolve(root, '.local'), { recursive: true, mode: 0o700 });
  if (
    relative(await realpath(root), await realpath(resolve(root, '.local'))) !==
    '.local'
  )
    throw new Error('Fixture directory must stay inside workspace');
  await mkdir(directory, { mode: 0o700 });
  if (
    relative(await realpath(root), await realpath(directory)) !==
    `.local/${runId}`
  )
    throw new Error('Fixture directory must stay inside workspace');
  const network = `${prefix}-net`;
  const execution = `${prefix}-ethrex`;
  const sidecar = `${prefix}-sidecar`;
  const reader = `${prefix}-template`;
  const owned: string[] = [];
  let networkCreated = false;
  let stage = 'image-provenance';
  const cleanup = async () => {
    const failures: string[] = [];
    for (const name of [...owned].reverse()) {
      const logs = await execute('docker', ['logs', '--tail', '40', name], {
        timeout: 5000,
        maxBuffer: 100_000,
      }).then(
        (result) => `${result.stdout}\n${result.stderr}`,
        () => 'No container logs available',
      );
      try {
        await writeFile(`${directory}/${name}.log`, logs, { mode: 0o600 });
      } catch {
        failures.push('diagnostic-write');
      }
      try {
        await docker('rm', '-f', name);
      } catch {
        failures.push(name);
      }
    }
    if (networkCreated) {
      try {
        await docker('network', 'rm', network);
      } catch {
        failures.push(network);
      }
    }
    if (failures.length)
      throw new Error(
        'Fixture cleanup incomplete; inspect owned aftershock resources',
      );
  };
  try {
    const labels = async (image: string) =>
      JSON.parse(
        await docker(
          'image',
          'inspect',
          image,
          '--format',
          '{{json .Config.Labels}}',
        ),
      ) as Record<string, string>;
    if (
      (await labels(ETHREX_IMAGE))['org.opencontainers.image.revision'] !==
        UPSTREAM.ethrex ||
      (await labels(SIDECAR_IMAGE))['org.opencontainers.image.revision'] !==
        UPSTREAM.sidecar
    ) {
      throw new Error('Pinned image source revision mismatch');
    }
    const identity = reset ?? minedReset;
    if (identity) {
      stage = 'reset-image-identity';
      for (const [image, expected] of [
        [ETHREX_IMAGE, identity.executionImage],
        [SIDECAR_IMAGE, identity.sidecarImage],
      ]) {
        if (
          (await docker('image', 'inspect', image!, '--format', '{{.Id}}')) !==
          expected
        )
          throw new Error('Reset image differs from baseline');
      }
    }
    stage = 'genesis-template';
    await docker(
      'create',
      '--pull',
      'never',
      '--network',
      'none',
      '--label',
      `aftershock.run=${runId}`,
      '--name',
      reader,
      ETHREX_IMAGE,
    );
    owned.push(reader);
    await docker(
      'cp',
      `${reader}:/fixtures/genesis/l1-hegota.json`,
      `${directory}/template.json`,
    );
    const template = await readFile(`${directory}/template.json`, 'utf8');
    if (
      createHash('sha256')
        .update(template.replaceAll('\r\n', '\n'))
        .digest('hex') !==
      '5fe93acb7674db5d809aae4d66bff742121ed718bcddd327efcb8c1a9e631fb4'
    )
      throw new Error('Genesis template differs from pinned source');
    let genesis = JSON.parse(template) as Genesis;
    if (genesis.config.chainId !== 9)
      throw new Error('Unexpected fixture chain');
    stage = reset ? 'reset-private-inputs' : 'fresh-private-inputs';
    const keys = identity
      ? await readResetKeys(root, {
          runId: identity.runId,
          genesisSha256: identity.genesisSha256,
          executionImage: identity.executionImage,
          sidecarImage: identity.sidecarImage,
          initialBlockHash: identity.initialBlockHash,
        })
      : Array.from({ length: 5 }, () => generatePrivateKey());
    // Preserve protocol predeploys, remove every shared funded EOA from the upstream template.
    genesis.alloc = Object.fromEntries(
      Object.entries(genesis.alloc).filter(
        ([, account]) => account.code && account.code !== '0x',
      ),
    );
    keys.forEach((key, index) => {
      genesis.alloc[privateKeyToAccount(key).address.slice(2).toLowerCase()] = {
        balance: index === 3 ? '1000000000000000' : '1000000000000000000',
      };
    });
    if (minedReset) {
      stage = 'mined-checkpoint-inputs';
      if (
        minedReset.consensusImage !== LIGHTHOUSE_IMAGE ||
        minedReset.genesisGeneratorImage !== GENESIS_IMAGE ||
        (await docker(
          'ps',
          '-q',
          '--filter',
          `label=aftershock.run=${minedReset.runId}`,
        ))
      )
        throw new Error(
          'Checkpoint images differ or original fixture is still running',
        );
      const restored = await prepareMinedCheckpoint(
        root,
        directory,
        minedReset,
      );
      genesis = JSON.parse(restored.genesisText) as Genesis;
    } else if (mining) {
      stage = 'mining-genesis';
      genesis = (
        await generateMiningGenesis(directory, keys, runId, docker, (name) =>
          owned.push(name),
        )
      ).genesis;
    }
    if (reset) {
      stage = 'reset-genesis-identity';
      if (
        createHash('sha256').update(JSON.stringify(genesis)).digest('hex') !==
        reset.genesisSha256
      )
        throw new Error('Reset genesis differs from baseline');
    }
    await writeFile(`${directory}/genesis.json`, JSON.stringify(genesis), {
      mode: 0o600,
    });
    await writeFile(`${directory}/keys.json`, JSON.stringify(keys), {
      mode: 0o600,
    });
    if (checkpointMining && !minedReset) {
      await mkdir(`${directory}/runtime`, { mode: 0o700 });
      for (const name of ['execution', 'beacon', 'sidecar'])
        await mkdir(`${directory}/runtime/${name}`, { mode: 0o700 });
      await rename(
        `${directory}/validators`,
        `${directory}/runtime/validators`,
      );
    }
    const entryPoint = '0x00000000000000000000000000000000000000aa';
    const mempoolId = 'QmcFZKUX9qoo3StwVycJTAhwdiqbEjcwNvQVK246p3z1rk';
    await writeFile(
      `${directory}/sidecar.json`,
      JSON.stringify({
        entryPoints: [entryPoint],
        canonicalEntryPoint: entryPoint,
        standardMempoolId: mempoolId,
        supportedMempools: [{ mempoolId, entryPoint }],
        relayers: [keys[4]],
        useropsTTL,
        rpcEndpoint: `http://${execution}:8545`,
        rpcEndpointSubmit: `http://${execution}:8545`,
      }),
      { mode: 0o600 },
    );
    stage = 'private-network';
    await docker(
      'network',
      'create',
      '--internal',
      '--label',
      `aftershock.run=${runId}`,
      network,
    );
    networkCreated = true;
    const common = [
      '--network',
      network,
      '--label',
      `aftershock.run=${runId}`,
      '--memory',
      '1g',
      '--cpus',
      '2',
      '--pids-limit',
      '256',
      ...(checkpointMining
        ? ['--user', `${process.getuid!()}:${process.getgid!()}`]
        : []),
    ];
    stage = 'execution-start';
    await docker(
      'run',
      '--pull',
      'never',
      '-d',
      '--name',
      execution,
      ...common,
      '-v',
      `${directory}/genesis.json:/aftershock/genesis.json:ro`,
      ...(checkpointMining
        ? ['-v', `${directory}/runtime/execution:/aftershock/state`]
        : []),
      ...(mining ? ['-v', `${directory}/jwt:/aftershock/jwt:ro`] : []),
      ETHREX_IMAGE,
      '--network',
      '/aftershock/genesis.json',
      ...(checkpointMining ? ['--datadir', '/aftershock/state'] : []),
      '--p2p.disabled',
      '--syncmode',
      'full',
      '--p2p.addr',
      '127.0.0.1',
      '--http.addr',
      '0.0.0.0',
      '--http.api',
      mining ? 'eth,net,web3,ethrex,debug' : 'eth,net,web3,ethrex',
      ...(mining
        ? [
            '--authrpc.addr',
            '0.0.0.0',
            '--authrpc.jwtsecret',
            '/aftershock/jwt',
          ]
        : []),
    );
    owned.push(execution);
    const executionUrl: LocalEndpoint = {
      executor: sidecar,
      url: `http://${execution}:8545`,
    };
    stage = 'sidecar-start';
    await docker(
      'run',
      '--pull',
      'never',
      '-d',
      '--name',
      sidecar,
      ...common,
      '-v',
      `${directory}/sidecar.json:/aftershock/config.json:ro`,
      ...(checkpointMining
        ? ['-v', `${directory}/runtime/sidecar:/aftershock/state`]
        : []),
      identity?.sidecarImage ?? SIDECAR_IMAGE,
      'node',
      '--configFile',
      '/aftershock/config.json',
      '--dataDir',
      checkpointMining ? '/aftershock/state' : '/tmp/aftershock',
      '--api.address',
      '0.0.0.0',
      '--api.port',
      '14337',
      '--api.wsPort',
      '14337',
      '--p2p.host',
      '0.0.0.0',
      '--p2p.enrHost',
      '127.0.0.1',
      '--p2p.port',
      '4337',
      '--p2p.enrPort',
      '4337',
      '--executor.bundlingMode',
      bundlingMode,
      '--explorer.enable',
    );
    owned.push(sidecar);
    if (minedReset) {
      stage = 'mined-checkpoint-head';
      await waitForRpc(executionUrl);
      const actual = await localRpc(
        executionUrl,
        'eth_getBlockByNumber',
        ['latest', false],
        z.object({ number: quantity, hash }),
      );
      if (
        actual.hash !== minedReset.initialBlockHash ||
        actual.number !== minedReset.initialBlockNumber
      )
        throw new Error('Restored mined checkpoint head differs from baseline');
    }
    if (mining) {
      stage = 'consensus-start';
      const beacon = `${prefix}-beacon`;
      const validator = `${prefix}-validator`;
      const feeRecipient = privateKeyToAccount(keys[4]!).address;
      await docker(
        'run',
        '--pull',
        'never',
        '-d',
        '--name',
        beacon,
        ...common,
        '-v',
        `${directory}/consensus:/aftershock/consensus:ro`,
        '-v',
        `${directory}/jwt:/aftershock/jwt:ro`,
        ...(checkpointMining
          ? ['-v', `${directory}/runtime/beacon:/aftershock/state`]
          : []),
        LIGHTHOUSE_IMAGE,
        'lighthouse',
        'beacon_node',
        '--testnet-dir=/aftershock/consensus',
        checkpointMining
          ? '--datadir=/aftershock/state'
          : '--datadir=/tmp/beacon',
        '--http',
        '--http-address=0.0.0.0',
        '--http-port=4000',
        '--disable-discovery',
        '--disable-upnp',
        '--enable-private-discovery',
        '--allow-insecure-genesis-sync',
        '--supernode',
        `--execution-endpoints=http://${execution}:8551`,
        '--jwt-secrets=/aftershock/jwt',
        `--suggested-fee-recipient=${feeRecipient}`,
      );
      owned.push(beacon);
      await docker(
        'run',
        '--pull',
        'never',
        '-d',
        '--name',
        validator,
        ...common,
        '-v',
        `${directory}/consensus:/aftershock/consensus:ro`,
        '-v',
        `${directory}/${checkpointMining ? 'runtime/' : ''}validators:/aftershock/validators`,
        LIGHTHOUSE_IMAGE,
        'lighthouse',
        'vc',
        '--testnet-dir=/aftershock/consensus',
        '--validators-dir=/aftershock/validators/keys',
        '--secrets-dir=/aftershock/validators/secrets',
        '--init-slashing-protection',
        `--beacon-nodes=http://${beacon}:4000`,
        `--suggested-fee-recipient=${feeRecipient}`,
      );
      owned.push(validator);
    }
    stage = 'isolation-verification';
    const sidecarUrl: LocalEndpoint = {
      executor: sidecar,
      url: 'http://127.0.0.1:14337/rpc/',
    };
    const networkInfo = z
      .array(
        z.object({
          Internal: z.literal(true),
          Containers: z.record(z.string(), z.unknown()),
        }),
      )
      .parse(JSON.parse(await docker('network', 'inspect', network)))[0]!;
    if (Object.keys(networkInfo.Containers).length !== (mining ? 4 : 2))
      throw new Error('Unexpected peer in isolated network');
    const processes = z
      .array(
        z.object({
          Config: z.object({ Labels: z.record(z.string(), z.string()) }),
          HostConfig: z.object({
            Privileged: z.literal(false),
            PublishAllPorts: z.literal(false),
            PortBindings: z.record(z.string(), z.unknown()).nullable(),
          }),
          NetworkSettings: z.object({
            Networks: z.record(z.string(), z.unknown()),
          }),
          State: z.object({ Running: z.literal(true) }),
        }),
      )
      .parse(
        JSON.parse(
          await docker(
            'inspect',
            ...owned.filter(
              (name) => name !== reader && !name.endsWith('-generator'),
            ),
          ),
        ),
      );
    for (const process of processes) {
      if (
        process.Config.Labels['aftershock.run'] !== runId ||
        Object.keys(process.HostConfig.PortBindings ?? {}).length !== 0 ||
        Object.keys(process.NetworkSettings.Networks).join(',') !== network
      ) {
        throw new Error('Container ownership or network isolation mismatch');
      }
    }
    const fingerprint = {
      network,
      executionImage: await docker(
        'inspect',
        execution,
        '--format',
        '{{.Image}}',
      ),
      sidecarImage: await docker('inspect', sidecar, '--format', '{{.Image}}'),
      chainId: '0x9',
      networkInternal: 'true',
      publishedPorts: 'none',
      bundlingMode,
      genesisSha256: createHash('sha256')
        .update(JSON.stringify(genesis))
        .digest('hex'),
      ...(reset
        ? { fixtureInputMode: 'GENESIS_RESET', resetBaselineRunId: reset.runId }
        : {}),
      ...(minedReset
        ? {
            fixtureInputMode: 'MINED_CHECKPOINT_RESET',
            resetBaselineRunId: minedReset.runId,
            checkpointId: minedReset.checkpointId,
            checkpointManifestSha256: minedReset.manifestSha256,
            restoredBlockNumber: minedReset.initialBlockNumber,
            restoredBlockHash: minedReset.initialBlockHash,
          }
        : {}),
      ...(checkpointMining
        ? { runtimeStateMode: 'MANAGED_PRIVATE_DIRECTORIES' }
        : {}),
      ...(mining
        ? {
            consensusImage: LIGHTHOUSE_IMAGE,
            genesisGeneratorImage: GENESIS_IMAGE,
            fixtureMode: 'mining',
          }
        : { fixtureMode: 'admission' }),
    };
    return { runId, keys, executionUrl, sidecarUrl, fingerprint, cleanup };
  } catch (error) {
    await writeFile(`${directory}/setup-error.log`, String(error), {
      mode: 0o600,
    });
    await cleanup();
    throw new FixtureSetupError(stage);
  }
}
