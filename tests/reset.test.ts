import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generatePrivateKey } from 'viem/accounts';
import { readResetKeys } from '../packages/core/src/local/reset.js';
import {
  genesisResetPlan,
  compareGenesisResetRuns,
  compareRuns,
} from '../packages/core/src/replay.js';
import { runReport, runScenario } from '../packages/core/src/scenario.js';

const historical = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/keyed-replacement-ttl.json', 'utf8'),
  ),
);

// Synthetic schema/comparator input only; never saved as a node observation.
function unitBaseline() {
  const report = structuredClone(historical);
  report.environment.initialBlockNumber = '0x0';
  report.environment.initialBlockHash = `0x${'ab'.repeat(32)}`;
  const evidence = report.evidence!;
  evidence.entries.forEach((entry) => entry.seq++);
  evidence.entries.unshift({
    seq: 1,
    at: report.startedAt,
    channel: 'EXECUTION',
    purpose: 'SCENARIO',
    method: 'eth_getBlockByNumber',
    requestSha256: 'a'.repeat(64),
    outcome: 'RESULT',
    result: {
      number: '0x0',
      hash: report.environment.initialBlockHash,
      timestamp: '0x0',
    },
  });
  evidence.attempts++;
  report.steps.forEach((step) => step.evidenceThrough!++);
  return runReport.parse(report);
}

test('genesis reset plans reject historical missing state and mined scenarios', async () => {
  assert.throws(() => genesisResetPlan(historical), /recorded initial state/);
  const baseline = unitBaseline();
  const plan = genesisResetPlan(baseline);
  assert.equal(plan.mode, 'GENESIS_RESET_RERUN');
  assert.equal(plan.exactHistoricalReplay, false);
  assert.match(plan.command, /--local --reset$/);
  const mined = runReport.parse(
    JSON.parse(
      await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
    ),
  );
  assert.throws(() => genesisResetPlan(mined), /admission-only/);
  assert.throws(
    () =>
      runScenario(
        'keyed-replacement-ttl',
        '/unused',
        0,
        true,
        plan.fixtureSource,
      ),
    /Unsupported reset/,
  );
});

test('reset comparisons require linked genesis, initial state, exact signing inputs and PASS', () => {
  const baseline = unitBaseline();
  const rerun = { ...structuredClone(baseline), runId: randomUUID() };
  rerun.environment.fixtureInputMode = 'GENESIS_RESET';
  rerun.environment.resetBaselineRunId = baseline.runId;
  const comparison = compareGenesisResetRuns(baseline, rerun);
  assert.equal(comparison.resetInputsMatch, true);
  assert.equal(comparison.bothRunsPassed, true);
  assert.deepEqual(compareRuns(baseline, rerun), comparison);
  rerun.environment.genesisSha256 = '0'.repeat(64);
  assert.equal(compareRuns(baseline, rerun).bothRunsPassed, false);
  rerun.environment.genesisSha256 = baseline.environment.genesisSha256!;
  rerun.evidence!.entries.find(
    (entry) => entry.method === 'eth_sendFrameTransaction',
  )!.requestSha256 = 'f'.repeat(64);
  assert.equal(
    compareGenesisResetRuns(baseline, rerun).resetChecks.sameSignedRequests,
    false,
  );
  assert.equal(compareRuns(baseline, rerun).comparison, 'RESET_INPUTS_DIFFER');
  const missing = structuredClone(baseline);
  missing.environment.initialBlockHash = `0x${'00'.repeat(32)}`;
  assert.throws(() => genesisResetPlan(missing), /recorded initial state/);
});

test('private reset keys reject unsafe paths, permissions, oversized files and reflected contents', async (context) => {
  if (process.platform !== 'linux')
    return context.skip('Linux-only private reset mode');
  const root = await mkdtemp(join(tmpdir(), 'aftershock-reset-'));
  const source = genesisResetPlan(unitBaseline()).fixtureSource;
  const directory = join(root, '.local', source.runId);
  await mkdir(join(root, '.local'), { mode: 0o700 });
  await mkdir(directory, { mode: 0o700 });
  const keys = Array.from({ length: 5 }, () => generatePrivateKey());
  const path = join(directory, 'keys.json');
  try {
    await assert.rejects(
      readResetKeys(root, source),
      /missing, invalid or unsafe/,
    );
    await writeFile(path, JSON.stringify(keys), { mode: 0o600, flag: 'wx' });
    const loaded = await readResetKeys(root, source);
    assert.ok(
      keys.every((key, index) => loaded[index] === key),
      'Private fixture inputs must match',
    );
    await chmod(path, 0o644);
    await assert.rejects(readResetKeys(root, source), /unsafe/);
    await chmod(path, 0o600);
    await writeFile(path, JSON.stringify([keys[0], keys[0], ...keys.slice(2)]));
    await assert.rejects(readResetKeys(root, source), /invalid/);
    await writeFile(path, 'PRIVATE_RESET_SENTINEL'.repeat(300));
    await assert.rejects(
      readResetKeys(root, source),
      (error: Error) => !error.message.includes('PRIVATE_RESET_SENTINEL'),
    );
    await rm(path);
    const target = join(root, 'other.json');
    await writeFile(target, JSON.stringify(keys), { mode: 0o600 });
    await symlink(target, path);
    await assert.rejects(readResetKeys(root, source), /unsafe/);
    await rm(path);
    execFileSync('mkfifo', ['-m', '600', path]);
    await assert.rejects(readResetKeys(root, source), /unsafe/);
    await assert.rejects(
      readResetKeys(root, { ...source, runId: '../escape' }),
      /unsafe/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
