import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, symlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { generatePrivateKey } from 'viem/accounts';
import {
  definitions,
  aggregateResults,
  runReport,
  scenarioDefinition,
} from '../packages/core/src/scenario.js';
import type { RunReport } from '../packages/core/src/scenario.js';
import { UPSTREAM } from '@aftershock/core';
import {
  saveRun,
  readRun,
  markdownReport,
} from '../packages/core/src/report.js';
import { fixtureTransaction } from '../packages/core/src/local/codec.js';
import { localRpc } from '../packages/core/src/local/rpc.js';
import { pendingEntry } from '../packages/core/src/local/scenarios.js';
import { validateLifecycleIdentity } from '../packages/core/src/local/lifecycle.js';

function unitReport(): RunReport {
  // Report-format tests do not claim a node run: no observation or PASS is manufactured.
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: randomUUID(),
    scenarioId: 'paymaster-solvency',
    seed: 0,
    endpointClass: 'MOCK_UNIT_TEST',
    sourcePins: UPSTREAM,
    environment: {},
    startedAt: now,
    completedAt: now,
    definition: definitions['paymaster-solvency'],
    steps: [
      {
        id: 'prerequisites-or-evidence',
        at: now,
        result: 'BLOCKED',
        observed: { scope: 'FORMAT_UNIT_ONLY' },
      },
    ],
    result: 'BLOCKED',
    limitations: ['UNIT FORMAT TEST ONLY; no node contacted'],
    reproducer: 'not executed',
  };
}

test('scenario definitions name exact rules, preconditions and ordered actions', () => {
  assert.equal(
    definitions['paymaster-solvency'].sourceCommit,
    UPSTREAM.sidecar,
  );
  assert.ok(
    definitions['keyed-nonce-lifecycle'].actions.indexOf(
      'reject-low-fee-bump',
    ) <
      definitions['keyed-nonce-lifecycle'].actions.indexOf(
        'accept-fee-bumped-replacement',
      ),
  );
  assert.throws(() =>
    scenarioDefinition.parse({
      ...definitions['paymaster-solvency'],
      script: 'arbitrary code',
    }),
  );
  assert.throws(() => runReport.parse({ ...unitReport(), seed: -1 }));
  assert.throws(
    () =>
      scenarioDefinition.parse({
        ...definitions['paymaster-solvency'],
        actions: ['admit-base', 'admit-base'],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      scenarioDefinition.parse({
        ...definitions['paymaster-solvency'],
        actions: ['fixture-cleanup'],
      }),
    /reserved/,
  );
  assert.throws(() =>
    runReport.parse({
      ...unitReport(),
      sourcePins: { ...UPSTREAM, sidecar: 'unknown' },
    }),
  );
});

test('failure and missing evidence dominate successful subsets', () => {
  assert.equal(aggregateResults(['PASS', 'BLOCKED']), 'BLOCKED');
  assert.equal(aggregateResults(['PASS', 'FAIL', 'BLOCKED']), 'FAIL');
  assert.equal(aggregateResults(['PASS', 'INCONCLUSIVE']), 'INCONCLUSIVE');
  assert.equal(aggregateResults(['SPEC_DIFFERENCE']), 'SPEC_DIFFERENCE');
  assert.equal(aggregateResults([]), 'INCONCLUSIVE');
  assert.equal(aggregateResults(['PASS', 'PASS']), 'PASS');
});

test('pending-entry wire timestamps stay exact hex and support the inspected fallback', () => {
  const txHash = `0x${'a'.repeat(64)}`;
  const entry = pendingEntry.parse({
    txHash,
    submittedTime: '0x20000000000001',
    lastUpdatedTime: '0x20000000000002',
  });
  assert.equal(BigInt(entry.submittedTime!), 9007199254740993n);
  const fallback = pendingEntry.parse({
    txHash,
    lastUpdatedTime: '0x20000000000002',
  });
  assert.equal(
    fallback.submittedTime ?? fallback.lastUpdatedTime,
    '0x20000000000002',
  );
  assert.throws(() =>
    pendingEntry.parse({ txHash, submittedTime: 123, lastUpdatedTime: '0x1' }),
  );
});

test('private lifecycle evidence refuses another transaction identity', () => {
  const expected = `0x${'a'.repeat(64)}`;
  const other = `0x${'b'.repeat(64)}`;
  validateLifecycleIdentity(
    { hash: expected, admission: null, events: [] },
    expected,
  );
  assert.throws(
    () =>
      validateLifecycleIdentity(
        { hash: other, admission: null, events: [] },
        expected,
      ),
    /identity mismatch/,
  );
  assert.throws(
    () =>
      validateLifecycleIdentity(
        {
          hash: expected,
          admission: null,
          events: [{ seq: 1, txHash: other, at: 1, kind: 'included' }],
        },
        expected,
      ),
    /identity mismatch/,
  );
});

test('reports reject false PASS, mismatched definitions, duplicate actions and invalid chronology', () => {
  const report = unitReport();
  assert.throws(
    () => runReport.parse({ ...report, result: 'PASS' }),
    /aggregate verdict|every declared action/,
  );
  assert.throws(
    () => runReport.parse({ ...report, scenarioId: 'keyed-nonce-lifecycle' }),
    /definition mismatch/,
  );
  assert.throws(
    () =>
      runReport.parse({ ...report, steps: [...report.steps, ...report.steps] }),
    /Duplicate step/,
  );
  assert.throws(
    () =>
      runReport.parse({ ...report, completedAt: '2000-01-01T00:00:00.000Z' }),
    /chronology|completion time/,
  );
  assert.throws(
    () =>
      runReport.parse({
        ...report,
        steps: [{ ...report.steps[0]!, id: 'undeclared-action' }],
      }),
    /Undeclared action/,
  );
});

test('a complete declared unit-format report must include each ordered action and cleanup', () => {
  const report = unitReport();
  report.steps = [...report.definition.actions, 'fixture-cleanup'].map(
    (id) => ({
      id,
      at: report.startedAt,
      result: 'PASS',
      observed: { scope: 'UNIT_SCHEMA_ONLY' },
    }),
  );
  report.result = 'PASS';
  assert.equal(runReport.parse(report).endpointClass, 'MOCK_UNIT_TEST');
  assert.throws(
    () => runReport.parse({ ...report, steps: report.steps.slice(1) }),
    /every declared action/,
  );
  const reversed = structuredClone(report);
  [reversed.steps[0], reversed.steps[1]] = [
    reversed.steps[1]!,
    reversed.steps[0]!,
  ];
  assert.throws(() => runReport.parse(reversed), /out of order/);
});

test('official codec signs distinct keyed identities and both sponsored signatures', async () => {
  const sender = generatePrivateKey();
  const payer = generatePrivateKey();
  const one = await fixtureTransaction(sender, sender, [1n]);
  const two = await fixtureTransaction(sender, sender, [2n]);
  const bumped = await fixtureTransaction(sender, sender, [1n], 2_200_000_000n);
  const next = await fixtureTransaction(
    sender,
    sender,
    [1n],
    2_000_000_000n,
    2_000_000_000n,
    1n,
  );
  assert.notEqual(one.hash, two.hash);
  assert.notEqual(one.hash, bumped.hash);
  assert.notEqual(one.hash, next.hash);
  const sponsored = await fixtureTransaction(sender, payer, [1n]);
  assert.match(sponsored.raw, /^0x06/);
  assert.ok(!JSON.stringify(sponsored.wire).includes(sender));
  assert.ok(!JSON.stringify(sponsored.wire).includes(payer));
});

test('local mutation transport refuses public and unrelated endpoints before Docker', async () => {
  await assert.rejects(
    Reflect.apply(localRpc, undefined, [
      {
        executor: `aftershock-${randomUUID()}-sidecar`,
        url: 'http://127.0.0.1:14337/rpc/',
      },
      'debug_bundler_clearState',
      [],
      runReport,
    ]),
  );
  await assert.rejects(
    localRpc(
      { executor: 'other-process', url: 'https://example.com' },
      'eth_chainId',
      [],
      runReport,
    ),
  );
  await assert.rejects(
    localRpc(
      {
        executor: `aftershock-${randomUUID()}-sidecar`,
        url: 'http://192.168.0.1:8545',
      },
      'eth_chainId',
      [],
      runReport,
    ),
  );
});

test('scenario reports round-trip exclusively and detect payload/digest tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-report-test-'));
  const report = unitReport();
  const path = await saveRun(root, report);
  assert.deepEqual(await readRun(root, report.runId), runReport.parse(report));
  await assert.rejects(saveRun(root, report));
  const envelope = JSON.parse(await readFile(path, 'utf8'));
  envelope.report.result = 'PASS';
  await writeFile(path, JSON.stringify(envelope));
  await assert.rejects(readRun(root, report.runId), /integrity/);
  await assert.rejects(readRun(root, '../escape'));
});

test('report reads reject symlinks and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-report-size-'));
  const report = unitReport();
  const path = await saveRun(root, report);
  await writeFile(path, 'x'.repeat(1_048_577));
  await assert.rejects(readRun(root, report.runId), /too large/);
  if (process.platform !== 'win32') {
    const other = unitReport();
    const alias = join(root, 'reports', `${other.runId}.scenario.json`);
    await symlink(path, alias);
    await assert.rejects(readRun(root, other.runId), /symlink/);
  }
});

test('Markdown preserves honest result and escapes untrusted formatting', () => {
  const report = unitReport();
  report.limitations = [
    '<script>bad</script> ![external](https://example.com)',
  ];
  const markdown = markdownReport(report);
  assert.match(markdown, /Result: BLOCKED/);
  assert.match(markdown, /No RPC journal was captured/);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('![external]'));
  assert.match(markdown, /## Expected invariant/);
  assert.ok(markdown.includes(report.definition.expectedInvariant));
  assert.ok(markdown.includes(report.sourcePins.sidecar));
  assert.ok(markdown.includes(report.startedAt));
  assert.ok(markdown.indexOf('| Step |') < markdown.indexOf('## Limitations'));
});

test('fresh-state rerun plans reject mocks, changed definitions and unsafe fixtures', async () => {
  const { replayPlan, compareRuns } =
    await import('../packages/core/src/replay.js');
  const report = unitReport();
  assert.throws(() => replayPlan(report), /isolated/);
  report.endpointClass = 'ISOLATED_LOCAL';
  assert.throws(() => replayPlan(report), /requirements/);
  report.environment = {
    executionImage: 'unit-image',
    sidecarImage: 'unit-sidecar',
    genesisSha256: 'unit-genesis',
    fixtureMode: 'admission',
    chainId: '0x9',
    networkInternal: 'true',
    publishedPorts: 'none',
    bundlingMode: 'manual',
  };
  const mined = structuredClone(report);
  mined.environment.fixtureMode = 'mining';
  assert.throws(() => replayPlan(mined), /requirements/);
  mined.environment.consensusImage = 'unit-consensus';
  mined.environment.genesisGeneratorImage = 'unit-generator';
  assert.equal(replayPlan(mined).mining, true);
  assert.match(replayPlan(mined).command, /--local --mine$/);
  const plan = replayPlan(report);
  assert.equal(plan.exactHistoricalReplay, false);
  assert.equal(plan.mining, false);
  assert.throws(
    () =>
      replayPlan({
        ...report,
        definition: { ...report.definition, title: 'changed' },
      }),
    /definition/,
  );
  assert.throws(
    () =>
      replayPlan({
        ...report,
        environment: { ...report.environment, publishedPorts: '8545' },
      }),
    /requirements/,
  );
  assert.throws(() => compareRuns(report, report), /identity/);
  const rerun = { ...structuredClone(report), runId: randomUUID() };
  let comparison = compareRuns(report, rerun);
  assert.equal(comparison.comparison, 'VERDICTS_MATCH');
  assert.equal(comparison.bothRunsPassed, false);
  rerun.environment.sidecarImage = 'other-image';
  comparison = compareRuns(report, rerun);
  assert.equal(comparison.comparison, 'ENVIRONMENT_DIFFERENT');
  assert.deepEqual(comparison.environmentDifferences, ['sidecarImage']);
  rerun.environment = {
    ...report.environment,
    genesisSha256: 'fresh-genesis',
    network: 'fresh-network',
  };
  rerun.steps[0]!.result = 'INCONCLUSIVE';
  rerun.result = 'INCONCLUSIVE';
  comparison = compareRuns(report, rerun);
  assert.equal(comparison.comparison, 'VERDICTS_DIFFER');
  assert.equal(comparison.verdictsMatch, false);
  // Schema/comparator-only inputs; never saved or published as node evidence.
  const complete = structuredClone(report);
  complete.steps = [...complete.definition.actions, 'fixture-cleanup'].map(
    (id) => ({
      id,
      at: complete.startedAt,
      result: 'PASS' as const,
      observed: { scope: 'UNIT_COMPARATOR_ONLY' },
    }),
  );
  complete.result = 'PASS';
  const repeated = { ...structuredClone(complete), runId: randomUUID() };
  assert.equal(compareRuns(complete, repeated).bothRunsPassed, true);
  repeated.steps.unshift({
    id: 'prerequisites-or-evidence',
    at: repeated.startedAt,
    result: 'PASS',
    observed: { scope: 'UNIT_COMPARATOR_ONLY' },
  });
  assert.equal(compareRuns(complete, repeated).bothRunsPassed, false);
  assert.throws(
    () => compareRuns(report, { ...rerun, seed: 1 }),
    /requirements/,
  );
  rerun.environment = {};
  assert.equal(compareRuns(report, rerun).comparison, 'ENVIRONMENT_DIFFERENT');
});

test(
  'report reads reject a FIFO without waiting for a writer',
  { timeout: 3000 },
  async (context) => {
    if (process.platform !== 'linux')
      return context.skip('Linux private report store');
    const root = await mkdtemp(join(tmpdir(), 'aftershock-report-fifo-'));
    const report = unitReport();
    await saveRun(root, report);
    const id = randomUUID();
    const fifo = join(root, 'reports', `${id}.scenario.json`);
    execFileSync('mkfifo', [fifo]);
    await assert.rejects(readRun(root, id), /regular file/);
  },
);

test('reading a missing report does not create a report directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-report-readonly-'));
  await assert.rejects(readRun(root, randomUUID()), { code: 'ENOENT' });
  await assert.rejects(stat(join(root, 'reports')), { code: 'ENOENT' });
});

test('oversized report writes fail before creating an artifact directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-report-write-limit-'));
  await assert.rejects(
    saveRun(root, { ...unitReport(), limitations: ['x'.repeat(1_048_576)] }),
    /too large/,
  );
  await assert.rejects(stat(join(root, 'reports')), { code: 'ENOENT' });
});
