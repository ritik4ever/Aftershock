import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  doctor,
  evaluateInspection,
  GatewayReader,
  historyGaps,
  inspectTransaction,
  saveObservation,
} from '@aftershock/core';
import {
  explorerTransaction,
  receipt,
  quantity,
} from '../packages/core/src/schema.js';
import type { Inspection } from '../packages/core/src/schema.js';

type Observation = Awaited<ReturnType<typeof inspectTransaction>>;
const captured = JSON.parse(
  await readFile(
    new URL(
      '../docs/evidence/workshop-admission-2026-11-05.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Observation;
const fixture = (): Inspection => structuredClone(captured.evidence);

test('real captured admission and frame execution are observed, not source-invariant PASS', () => {
  const result = evaluateInspection(fixture());
  assert.equal(result.admissionObserved, true);
  assert.equal(result.executionSucceeded, true);
  assert.equal(result.evidenceConsistent, true);
  assert.equal(result.sourceSpecificVerdict, 'INCONCLUSIVE');
});

test('included is not success when transaction or any frame reverted or was skipped', () => {
  for (const status of ['reverted', 'skipped'] as const) {
    const value = fixture();
    value.receipt.frameReceipts[0]!.status = status;
    assert.equal(evaluateInspection(value).executionSucceeded, false);
  }
  const value = fixture();
  value.receipt.status = 'reverted';
  assert.equal(evaluateInspection(value).executionSucceeded, false);
});

test('detects missing admission, mismatched identities and frame counts', () => {
  const absent = fixture();
  absent.admission.admission = null;
  assert.equal(evaluateInspection(absent).admissionObserved, false);
  const hashMismatch = fixture();
  hashMismatch.requestedHash = `0x${'00'.repeat(32)}`;
  assert.ok(evaluateInspection(hashMismatch).issues.includes('HASH_MISMATCH'));
  const payerMismatch = fixture();
  payerMismatch.receipt.payer = `0x${'00'.repeat(20)}`;
  assert.ok(
    evaluateInspection(payerMismatch).issues.includes('PAYER_MISMATCH'),
  );
  const countMismatch = fixture();
  countMismatch.receipt.frameReceipts.pop();
  assert.ok(
    evaluateInspection(countMismatch).issues.includes('FRAME_COUNT_MISMATCH'),
  );
});

test('detects explorer restarts, overwritten history, regression and chain disagreement', () => {
  const value = fixture();
  assert.deepEqual(
    historyGaps(value.before, { ...value.after, bootId: '0000000000000000' }),
    ['EXPLORER_RESTART'],
  );
  assert.ok(
    historyGaps(value.before, {
      ...value.after,
      oldestSeq: value.before.latestSeq + 2,
    }).includes('HISTORY_OVERWRITTEN'),
  );
  assert.ok(
    historyGaps(value.before, { ...value.after, latestSeq: 0 }).includes(
      'SEQUENCE_REGRESSION',
    ),
  );
  value.after.chainId = 1;
  assert.ok(evaluateInspection(value).issues.includes('CHAIN_MISMATCH'));
  const versionChanged = fixture();
  versionChanged.after.version = 'v4.1.2';
  assert.ok(
    evaluateInspection(versionChanged).issues.includes('VERSION_CHANGED'),
  );
});

test('keeps large protocol quantities exact and accepts sidecar receipt status labels', () => {
  const large = '0x20000000000001';
  assert.equal(BigInt(quantity.parse(large)), 9007199254740993n);
  assert.throws(() => quantity.parse(`0x1${'0'.repeat(64)}`));
  assert.equal(
    receipt.parse({ ...fixture().receipt, cumulativeGasUsed: large })
      .cumulativeGasUsed,
    large,
  );
  assert.throws(() => receipt.parse({ ...fixture().receipt, status: '0x1' }));
});

test('filters raw fields and distinguishes waived/skipped checks', () => {
  const value = fixture();
  const admission = value.admission.admission!;
  const parsed = explorerTransaction.parse({
    ...value.admission,
    secret: 'unit-test-placeholder',
    admission: {
      ...admission,
      frames: [{ data: 'unit-test-placeholder' }],
      checks: [
        { rule: 'storage', verdict: 'pass', detail: 'waived for this entity' },
        { rule: 'OP-011', verdict: 'skipped' },
      ],
    },
  });
  assert.ok(!JSON.stringify(parsed).includes('unit-test-placeholder'));
  value.admission = parsed;
  const result = evaluateInspection(value);
  assert.equal(result.reportedUnwaivedPassChecks, 0);
  assert.equal(result.skippedChecks, 1);
});

test('inspection makes only fixed read calls and excludes signed payloads from exports', async () => {
  const value = fixture();
  const replies: Record<string, unknown> = {
    eth_chainId: value.chainId,
    skandha_explorer_info: value.before,
    skandha_explorer_getTransaction: {
      ...value.admission,
      entry: { signatures: 'unit-test-placeholder' },
      admission: { ...value.admission.admission, frames: [{}, {}] },
    },
    skandha_frameTransactionStatus: {
      ...value.status,
      tx: { signatures: 'unit-test-placeholder' },
    },
    eth_getFrameTransactionReceipt: value.receipt,
  };
  const calls: string[] = [];
  const reader = new GatewayReader(async (_url, options) => {
    const request = JSON.parse(String(options?.body)) as {
      method: string;
      id: number;
    };
    calls.push(request.method);
    return Response.json({
      jsonrpc: '2.0',
      id: request.id,
      result: replies[request.method],
    });
  });
  const result = await inspectTransaction(value.requestedHash, reader);
  assert.equal(calls.length, 6);
  assert.equal(result.result.executionSucceeded, true);
  assert.ok(!JSON.stringify(result).includes('unit-test-placeholder'));
  const diagnostic = await doctor(reader);
  assert.equal(diagnostic.sourceCommitVerified, false);
});

test('report files are exclusive and reject traversal and symlink escapes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aftershock-artifact-'));
  const saved = await saveObservation(directory, captured);
  assert.equal(JSON.parse(await readFile(saved, 'utf8')).runId, captured.runId);
  await assert.rejects(saveObservation(directory, captured));
  await assert.rejects(
    saveObservation(directory, { ...captured, runId: '../escape' }),
  );
  if (process.platform !== 'win32') {
    const other = await mkdtemp(join(tmpdir(), 'aftershock-symlink-'));
    await mkdir(join(other, 'outside'));
    await symlink(join(other, 'outside'), join(other, 'reports'));
    await assert.rejects(saveObservation(other, captured));
  }
});
