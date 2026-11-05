import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
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
    steps: [],
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

test('official codec signs distinct keyed identities and both sponsored signatures', async () => {
  const sender = generatePrivateKey();
  const payer = generatePrivateKey();
  const one = await fixtureTransaction(sender, sender, [1n]);
  const two = await fixtureTransaction(sender, sender, [2n]);
  const bumped = await fixtureTransaction(sender, sender, [1n], 2_200_000_000n);
  assert.notEqual(one.hash, two.hash);
  assert.notEqual(one.hash, bumped.hash);
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
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('![external]'));
});
