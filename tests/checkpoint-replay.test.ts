import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
  truncate,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runReport } from '../packages/core/src/scenario.js';
import {
  minedCheckpointPlan,
  compareRuns,
} from '../packages/core/src/replay.js';
import {
  checkpointInventory,
  prepareMinedCheckpoint,
} from '../packages/core/src/local/checkpoint.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const historical = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
  ),
);

// Synthetic comparator input derived from a real report; never node evidence.
function comparatorInput() {
  const report = structuredClone(historical);
  const first = report.evidence!.entries.find(
    (entry) => entry.method === 'eth_sendFrameTransaction',
  )!.seq;
  const entry = report
    .evidence!.entries.filter(
      (entry) =>
        entry.seq < first &&
        entry.channel === 'EXECUTION' &&
        entry.method === 'eth_getBlockByNumber' &&
        entry.outcome === 'RESULT' &&
        BigInt((entry.result as { number: string }).number) > 0n,
    )
    .at(-1)!;
  const head = entry.result as { number: string; hash: string };
  Object.assign(report.environment, {
    runtimeStateMode: 'MANAGED_PRIVATE_DIRECTORIES',
    checkpointId: randomUUID(),
    checkpointManifestSha256: 'a'.repeat(64),
    checkpointBlockNumber: head.number,
    checkpointBlockHash: head.hash,
  });
  return runReport.parse(report);
}

test('mined checkpoint plans require recorded state and comparisons require all signing inputs', () => {
  assert.throws(() => minedCheckpointPlan(historical), /checkpoint-enabled/);
  const baseline = comparatorInput();
  const plan = minedCheckpointPlan(baseline);
  assert.equal(plan.exactHistoricalReplay, false);
  const rerun = structuredClone(baseline);
  rerun.runId = randomUUID();
  Object.assign(rerun.environment, {
    fixtureInputMode: 'MINED_CHECKPOINT_RESET',
    resetBaselineRunId: baseline.runId,
    restoredBlockNumber: plan.fixtureSource.initialBlockNumber,
    restoredBlockHash: plan.fixtureSource.initialBlockHash,
  });
  assert.equal(compareRuns(baseline, rerun).bothRunsPassed, true);
  rerun.environment.restoredBlockHash = `0x${'00'.repeat(32)}`;
  assert.equal(compareRuns(baseline, rerun).bothRunsPassed, false);
  rerun.environment.restoredBlockHash = plan.fixtureSource.initialBlockHash;
  rerun.evidence!.entries.find(
    (entry) => entry.method === 'eth_sendRawTransaction',
  )!.requestSha256 = 'f'.repeat(64);
  assert.equal(compareRuns(baseline, rerun).comparison, 'RESET_INPUTS_DIFFER');
  assert.equal(compareRuns(baseline, rerun).bothRunsPassed, false);
  baseline.environment.checkpointBlockHash = `0x${'00'.repeat(32)}`;
  assert.throws(() => minedCheckpointPlan(baseline), /checkpoint-enabled/);
});

test(
  'persistent checkpoint copy preserves its source and rejects changed manifests and boot files',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'aftershock-checkpoint-copy-'));
    const runId = randomUUID();
    const checkpointId = randomUUID();
    const original = join(root, '.local', runId);
    const snapshot = join(original, `checkpoint-${checkpointId}`);
    try {
      await mkdir(join(snapshot, 'boot', 'consensus'), {
        recursive: true,
        mode: 0o700,
      });
      // mkdir recursive intermediates are owner-only under the private temp root.
      for (const role of ['beacon', 'execution', 'sidecar', 'validators'])
        await mkdir(join(snapshot, 'runtime', role), {
          recursive: true,
          mode: 0o700,
        });
      const genesis = JSON.stringify({ config: { chainId: 9 }, alloc: {} });
      await writeFile(join(snapshot, 'boot', 'genesis.json'), genesis, {
        mode: 0o600,
      });
      await writeFile(
        join(snapshot, 'boot', 'jwt'),
        'unit-only-bootstrap-input',
        { mode: 0o600 },
      );
      const config = join(snapshot, 'boot', 'consensus', 'config.yaml');
      await writeFile(config, 'unit-only-consensus-config', { mode: 0o600 });
      await writeFile(
        join(snapshot, 'runtime', 'execution', 'state'),
        'unit-only-state',
        { mode: 0o600 },
      );
      const head = {
        number: '0x44',
        hash: `0x${'ab'.repeat(32)}`,
        timestamp: '0x1',
      };
      const manifest = JSON.stringify({
        version: 2,
        runId,
        checkpointId,
        head,
        files: await checkpointInventory(join(snapshot, 'runtime')),
        bootFiles: await checkpointInventory(join(snapshot, 'boot')),
      });
      await writeFile(join(snapshot, 'manifest.json'), manifest, {
        mode: 0o600,
      });
      const source = {
        runId,
        checkpointId,
        manifestSha256: sha(manifest),
        genesisSha256: sha(genesis),
        executionImage: `sha256:${'a'.repeat(64)}`,
        sidecarImage: `sha256:${'b'.repeat(64)}`,
        initialBlockNumber: head.number,
        initialBlockHash: head.hash,
        consensusImage: 'unit-only',
        genesisGeneratorImage: 'unit-only',
      };
      const fresh = async () => {
        const path = join(root, '.local', randomUUID());
        await mkdir(path, { mode: 0o700 });
        return path;
      };
      const before = await checkpointInventory(snapshot);
      const destination = await fresh();
      assert.equal(
        (await prepareMinedCheckpoint(root, destination, source)).genesisText,
        genesis,
      );
      assert.deepEqual(await checkpointInventory(snapshot), before);
      assert.deepEqual(
        await checkpointInventory(join(destination, 'runtime')),
        JSON.parse(manifest).files,
      );
      const wrongManifest = await fresh();
      await assert.rejects(
        prepareMinedCheckpoint(root, wrongManifest, {
          ...source,
          manifestSha256: '0'.repeat(64),
        }),
        /manifest changed/,
      );
      assert.deepEqual(await readdir(wrongManifest), []);
      await writeFile(config, 'changed-unit-config');
      const wrongBoot = await fresh();
      await assert.rejects(
        prepareMinedCheckpoint(root, wrongBoot, source),
        /data changed/,
      );
      assert.deepEqual(await readdir(wrongBoot), []);
      await assert.rejects(
        prepareMinedCheckpoint(root, original, source),
        /new fixture/,
      );
      await writeFile(config, 'unit-only-consensus-config');
      const manifestPath = join(snapshot, 'manifest.json');
      await rm(manifestPath);
      const outside = join(root, 'other-manifest.json');
      await writeFile(outside, manifest, { mode: 0o600 });
      await symlink(outside, manifestPath);
      const unsafeManifest = await fresh();
      await assert.rejects(
        prepareMinedCheckpoint(root, unsafeManifest, source),
      );
      assert.deepEqual(await readdir(unsafeManifest), []);
      await rm(manifestPath);
      await writeFile(manifestPath, manifest, { mode: 0o600 });
      await truncate(manifestPath, 2_097_153);
      await assert.rejects(
        prepareMinedCheckpoint(root, unsafeManifest, source),
        /Unsafe checkpoint file/,
      );
      assert.deepEqual(await readdir(unsafeManifest), []);
    } finally {
      await rm(root, { recursive: true });
    }
  },
);
