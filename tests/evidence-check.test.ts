import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkEvidence } from '../packages/core/src/evidence-check.js';
import { runReport } from '../packages/core/src/scenario.js';
import { saveRun } from '../packages/core/src/report.js';

const keyed = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
  ),
);
const payer = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/rpc-paymaster-solvency.json', 'utf8'),
  ),
);
const ttlCapture = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/keyed-replacement-ttl.json', 'utf8'),
  ),
);
const cancelled = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/cancelled-replacement.json', 'utf8'),
  ),
);

// Deliberately altered copies below are regression inputs, never published as live evidence.
test('genuine captures support the declared selected consistency checks', () => {
  for (const [report, count] of [
    [keyed, 2],
    [payer, 7],
  ] as const) {
    const before = JSON.stringify(report);
    const result = checkEvidence(report);
    assert.equal(JSON.stringify(report), before);
    assert.equal(result.status, 'CONSISTENT', JSON.stringify(result.checks));
    assert.equal(result.checks.length, count);
    assert.ok(result.checks.every((check) => check.rpcSequences.length > 0));
    assert.equal(result.fullScenarioRevalidated, false);
    assert.ok(result.notReevaluatedSteps.includes('admit-base'));
  }
});

test('a successful-inclusion summary cannot hide a reverted recorded receipt or wrong block', () => {
  const report = structuredClone(keyed);
  const entry = report.evidence!.entries.find(
    (item) =>
      item.method === 'eth_getFrameTransactionReceipt' &&
      item.outcome === 'RESULT' &&
      item.result !== null,
  )!;
  (entry.result as Record<string, unknown>).status = 'reverted';
  assert.equal(checkEvidence(report).status, 'CONTRADICTED');
  const wrongBlock = structuredClone(keyed);
  wrongBlock.steps.find(
    (step) => step.id === 'observe-inclusion',
  )!.observed.blockNumber = '0x999';
  assert.equal(checkEvidence(wrongBlock).status, 'CONTRADICTED');
});

test('canonical gas summaries and payer arithmetic must agree with saved responses', () => {
  const report = structuredClone(payer);
  report.steps.find((step) => step.id === 'top-up-payer')!.observed.gasUsed =
    '0x1';
  assert.equal(checkEvidence(report).status, 'CONTRADICTED');
  const wrongCost = structuredClone(payer);
  wrongCost.steps.find(
    (step) => step.id === 'verify-survivor-obligations',
  )!.observed.combinedCost = '1';
  assert.equal(checkEvidence(wrongCost).status, 'CONTRADICTED');
});

test('absent receipts and historical journals remain insufficient, never inferred successful', async () => {
  const report = structuredClone(keyed);
  for (const entry of report.evidence!.entries)
    if (
      entry.method === 'eth_getFrameTransactionReceipt' &&
      entry.outcome === 'RESULT'
    )
      entry.result = null;
  assert.equal(checkEvidence(report).status, 'INSUFFICIENT');
  const historical = runReport.parse(
    JSON.parse(
      await readFile('docs/evidence/mined-keyed-nonce-lifecycle.json', 'utf8'),
    ),
  );
  assert.equal(checkEvidence(historical).status, 'INSUFFICIENT');
});

test('redacted transfer amounts are explicitly outside this checker', () => {
  const report = structuredClone(payer);
  report.steps.find((step) => step.id === 'top-up-payer')!.observed.value = '1';
  const result = checkEvidence(report);
  assert.equal(result.status, 'CONSISTENT');
  assert.equal(result.fullScenarioRevalidated, false);
  assert.ok(
    result.limitations.some((item) => item.includes('transfer amounts')),
  );
});

test('offline CLI checks genuine and inconsistent checksum-valid reports without Docker', async () => {
  const historical = runReport.parse(
    JSON.parse(
      await readFile('docs/evidence/mined-keyed-nonce-lifecycle.json', 'utf8'),
    ),
  );
  for (const [input, expected] of [
    [keyed, 0],
    [payer, 0],
    [ttlCapture, 0],
    [cancelled, 3],
    [historical, 3],
  ] as const) {
    const root = await mkdtemp(join(tmpdir(), 'aftershock-check-cli-'));
    await saveRun(root, input);
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../packages/cli/src/index.ts', import.meta.url)),
        'check-evidence',
        input.runId,
      ],
      { cwd: root, encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(child.status, expected, child.stderr);
    assert.equal(
      JSON.parse(child.stdout).scope,
      'SELECTED_SAVED_OUTPUT_CONSISTENCY',
    );
  }
  const altered = structuredClone(keyed);
  altered.steps.find(
    (step) => step.id === 'observe-inclusion',
  )!.observed.blockNumber = '0x999';
  const root = await mkdtemp(join(tmpdir(), 'aftershock-check-inconsistent-'));
  await saveRun(root, altered);
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      fileURLToPath(new URL('../packages/cli/src/index.ts', import.meta.url)),
      'check-evidence',
      altered.runId,
    ],
    { cwd: root, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(child.status, 1, child.stderr);
  assert.equal(JSON.parse(child.stdout).status, 'CONTRADICTED');
});

test('mock labels and unknown execution identity cannot yield consistency success', () => {
  assert.equal(
    checkEvidence({ ...keyed, endpointClass: 'MOCK_UNIT_TEST' }).status,
    'INSUFFICIENT',
  );
  assert.equal(
    checkEvidence({
      ...keyed,
      environment: { ...keyed.environment, clientVersion: 'unknown' },
    }).status,
    'INSUFFICIENT',
  );
});

test('TTL outputs are consistent while a faithfully recorded failure remains globally insufficient', () => {
  const unknown = checkEvidence({
    ...cancelled,
    endpointClass: 'MOCK_UNIT_TEST',
  });
  assert.equal(unknown.status, 'INSUFFICIENT');
  assert.ok(unknown.checks.every((item) => item.status === 'INSUFFICIENT'));
  for (const [input, count, status] of [
    [ttlCapture, 3, 'CONSISTENT'],
    [cancelled, 9, 'INSUFFICIENT'],
  ] as const) {
    const before = JSON.stringify(input);
    const result = checkEvidence(input);
    assert.equal(result.status, status, JSON.stringify(result.checks));
    assert.equal(result.checks.length, count);
    assert.ok(
      result.checks.every(
        (item) => item.status === 'CONSISTENT' && item.rpcSequences.length > 0,
      ),
    );
    assert.equal(result.notReevaluatedSteps.length, input.steps.length - count);
    assert.equal(JSON.stringify(input), before);
    assert.equal(result.recordedRunResult, input.result);
  }
});

test('offline TTL arithmetic rejects wrong timestamps and the exact strict boundary', () => {
  const wrong = structuredClone(ttlCapture);
  wrong.steps.find(
    (s) => s.id === 'verify-ttl-replacement',
  )!.observed.elapsedMilliseconds = '1';
  assert.equal(checkEvidence(wrong).status, 'CONTRADICTED');
  const boundary = structuredClone(ttlCapture);
  const claim = boundary.steps.find(
    (s) => s.id === 'verify-ttl-replacement',
  )!.observed;
  const at = `0x${(BigInt(String(claim.oldLastUpdatedTime)) + 30000n).toString(16)}`;
  claim.newLastUpdatedTime = at;
  claim.elapsedMilliseconds = '30000';
  const entry = boundary.evidence!.entries.find(
    (e) =>
      e.method === 'eth_getFrameTransactionByHash' &&
      e.requestHash === claim.newHash &&
      e.outcome === 'RESULT',
  )!;
  (entry.result as Record<string, unknown>).lastUpdatedTime = at;
  assert.equal(checkEvidence(boundary).status, 'CONTRADICTED');
});

test('missing queried absence is insufficient and a present old entry contradicts removal', () => {
  const missing = structuredClone(ttlCapture);
  const step = missing.steps.find((s) => s.id === 'verify-ttl-replacement')!;
  const old = missing.evidence!.entries.find(
    (e) =>
      e.method === 'eth_getFrameTransactionByHash' &&
      e.requestHash === step.observed.oldHash &&
      e.result === null,
  )!;
  old.requestHash = `0x${'f'.repeat(64)}`;
  assert.equal(checkEvidence(missing).status, 'INSUFFICIENT');
  const present = structuredClone(ttlCapture);
  const query = present.evidence!.entries.find((e) => e.seq === old.seq)!;
  query.result = { txHash: step.observed.oldHash, balanceEnforcement: false };
  assert.equal(checkEvidence(present).status, 'CONTRADICTED');
});

test('a genuine explorer failure cannot be relabeled PASS or concealed by altered summaries', () => {
  const falsePass = structuredClone(cancelled);
  falsePass.steps.find(
    (s) => s.id === 'explorer-reactivation-consistency',
  )!.result = 'PASS';
  falsePass.steps.find((s) => s.id === 'mined-state-transition')!.result =
    'PASS';
  falsePass.result = 'PASS';
  assert.equal(checkEvidence(falsePass).status, 'CONTRADICTED');
  const hidden = structuredClone(cancelled);
  hidden.steps.find(
    (s) => s.id === 'explorer-reactivation-consistency',
  )!.observed.explorerOutcome = 'accepted';
  assert.equal(checkEvidence(hidden).status, 'CONTRADICTED');
  const expired = structuredClone(cancelled);
  expired.steps.find(
    (s) => s.id === 'verify-reactivation',
  )!.observed.elapsedMilliseconds = '300000';
  assert.equal(checkEvidence(expired).status, 'CONTRADICTED');
});

test('new selected checks exclude signed fee semantics and reject missing failed-finding responses', () => {
  const fee = structuredClone(ttlCapture);
  fee.steps.find((s) => s.id === 'accept-fee-after-ttl')!.observed.maximumFee =
    '1';
  assert.equal(checkEvidence(fee).status, 'CONSISTENT');
  assert.ok(
    checkEvidence(fee).notReevaluatedSteps.includes('accept-fee-after-ttl'),
  );
  const absent = structuredClone(cancelled);
  const hash = absent.steps.find((s) => s.id === 'verify-reactivation')!
    .observed.hash;
  const cursor = absent.steps.find(
    (s) => s.id === 'resubmit-cancelled-identical',
  )!.evidenceThrough!;
  const journal = absent.evidence!;
  const index = journal.entries.findIndex(
    (e) =>
      e.seq > cursor &&
      e.method === 'skandha_explorer_getTransaction' &&
      e.requestHash === hash,
  );
  const removedSeq = journal.entries[index]!.seq;
  journal.entries.splice(index, 1);
  journal.attempts -= 1;
  for (const e of journal.entries) if (e.seq > removedSeq) e.seq -= 1;
  for (const step of absent.steps)
    if (step.evidenceThrough! >= removedSeq) step.evidenceThrough! -= 1;
  const result = checkEvidence(absent);
  assert.equal(result.status, 'INSUFFICIENT');
  assert.equal(
    result.checks.find((c) => c.stepId === 'explorer-reactivation-consistency')!
      .status,
    'INSUFFICIENT',
  );
});
