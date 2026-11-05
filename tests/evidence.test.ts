import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordRpc,
  withRpcEvidence,
  evidenceSnapshot,
  rpcEvidence,
} from '../packages/core/src/evidence.js';
import { runReport } from '../packages/core/src/scenario.js';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { saveRun } from '../packages/core/src/report.js';

const txHash = `0x${'a'.repeat(64)}`;
test('journal projects receipts and lifecycle responses without request payloads, logs or arbitrary details', async () => {
  const unit = 'UNIT_SECRET_SENTINEL_NEVER_PUBLISH';
  const observation = JSON.parse(
    await readFile('docs/evidence/workshop-admission-2026-11-05.json', 'utf8'),
  );
  // Unit transport-format inputs only; never saved as a node run.
  await withRpcEvidence(async () => {
    recordRpc(
      'eth_sendFrameTransaction',
      'SIDECAR',
      [{ signature: unit, calldata: unit }],
      { result: txHash },
    );
    recordRpc('eth_getFrameTransactionReceipt', 'EXECUTION', [txHash], {
      result: { ...observation.evidence.receipt, logs: [unit], secret: unit },
    });
    recordRpc('eth_getFrameTransactionByHash', 'SIDECAR', [txHash], {
      result: {
        txHash,
        lastUpdatedTime: '0x20000000000001',
        transaction: unit,
        revertReason: unit,
      },
    });
    const rawExplorer = structuredClone(observation.evidence.admission);
    rawExplorer.admission.frames = Array.from(
      { length: rawExplorer.admission.frames },
      () => ({ calldata: unit }),
    );
    rawExplorer.admission.checks = rawExplorer.admission.checks.map(
      (check: Record<string, unknown>, index: number) => ({
        ...check,
        detail: index === 0 ? `waived ${unit}` : unit,
      }),
    );
    recordRpc(
      'skandha_explorer_getTransaction',
      'SIDECAR',
      [rawExplorer.hash],
      { result: rawExplorer },
    );
    const journal = rpcEvidence.parse(evidenceSnapshot());
    assert.equal(journal.complete, true);
    assert.equal(journal.entries[1]!.requestHash, txHash);
    assert.ok(!JSON.stringify(journal).includes(unit));
    assert.equal(journal.entries[2]!.outcome, 'RESULT');
    assert.equal(
      (
        journal.entries[3]!.result as {
          admission: { checks: { waived: boolean }[] };
        }
      ).admission.checks[0]!.waived,
      true,
    );
    assert.equal(
      (journal.entries[2]!.result as { lastUpdatedTime: string })
        .lastUpdatedTime,
      '0x20000000000001',
    );
    const invalid = structuredClone(journal);
    (invalid.entries[2]!.result as Record<string, unknown>).secret = unit;
    assert.throws(() => rpcEvidence.parse(invalid), /unredacted/);
  });
  assert.equal(evidenceSnapshot(), undefined);
});

test('journal marks projection failures and recording limits explicitly', async () => {
  await withRpcEvidence(async () => {
    recordRpc('eth_getFrameTransactionReceipt', 'EXECUTION', [txHash], {
      result: { bad: 'sensitive' },
    });
    let journal = rpcEvidence.parse(evidenceSnapshot());
    assert.equal(journal.complete, false);
    assert.equal(journal.unavailable, 1);
    assert.equal(journal.entries[0]!.reason, 'PROJECTION_INVALID');
    for (let n = 0; n < 300; n++)
      recordRpc('eth_chainId', 'EXECUTION', [], { result: '0x9' });
    journal = rpcEvidence.parse(evidenceSnapshot());
    assert.ok(journal.omitted > 0);
    assert.equal(journal.attempts, 301);
    assert.equal(journal.entries.length + journal.omitted, 301);
    assert.equal(journal.entries.at(-1)!.seq, journal.entries.length);
  });
});

test('concurrent journal scopes stay separate and normalized errors carry no raw server text', async () => {
  const journals = await Promise.all(
    ['FEE_BUMP', 'KEY_CONFLICT'].map((reason) =>
      withRpcEvidence(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        recordRpc('eth_sendFrameTransaction', 'SIDECAR', [], {
          code: -32602,
          reason,
        });
        return rpcEvidence.parse(evidenceSnapshot());
      }),
    ),
  );
  assert.deepEqual(
    journals.map((journal) => journal.entries[0]!.reason),
    ['FEE_BUMP', 'KEY_CONFLICT'],
  );
  assert.ok(journals.every((journal) => journal.attempts === 1));
});

test('historical reports remain readable and incomplete new evidence cannot PASS', async () => {
  const historical = runReport.parse(
    JSON.parse(
      await readFile('docs/evidence/mined-keyed-nonce-lifecycle.json', 'utf8'),
    ),
  );
  assert.equal(historical.evidence, undefined);
  await withRpcEvidence(async () => {
    recordRpc('eth_chainId', 'EXECUTION', [], {
      reason: 'TRANSPORT_OR_SCHEMA',
    });
    const journal = evidenceSnapshot()!;
    journal.entries[0]!.at = historical.startedAt;
    const enriched = {
      ...historical,
      evidence: journal,
      steps: historical.steps.map((step) => ({ ...step, evidenceThrough: 1 })),
    };
    assert.throws(() => runReport.parse(enriched), /Incomplete evidence/);
    assert.throws(
      () => runReport.parse({ ...enriched, steps: historical.steps }),
      /evidence reference/,
    );
  });
});

test('only recovered readiness failures on the same channel permit complete recording', async () => {
  await withRpcEvidence(async () => {
    recordRpc(
      'eth_chainId',
      'SIDECAR',
      [],
      { reason: 'TRANSPORT_OR_SCHEMA' },
      'READINESS',
    );
    assert.equal(rpcEvidence.parse(evidenceSnapshot()).complete, false);
    recordRpc('eth_chainId', 'EXECUTION', [], { result: '0x9' }, 'READINESS');
    assert.equal(rpcEvidence.parse(evidenceSnapshot()).complete, false);
    recordRpc('eth_chainId', 'SIDECAR', [], { result: '0x9' }, 'READINESS');
    const journal = rpcEvidence.parse(evidenceSnapshot());
    assert.equal(journal.complete, true);
    assert.equal(journal.unavailable, 1);
    recordRpc('eth_getBalance', 'EXECUTION', [], {
      reason: 'TRANSPORT_OR_SCHEMA',
    });
    assert.equal(rpcEvidence.parse(evidenceSnapshot()).complete, false);
  });
});

test('journal refuses mismatched response identities', async () => {
  await withRpcEvidence(async () => {
    recordRpc('eth_getFrameTransactionByHash', 'SIDECAR', [txHash], {
      result: { txHash: `0x${'b'.repeat(64)}` },
    });
    const journal = rpcEvidence.parse(evidenceSnapshot());
    assert.equal(journal.complete, false);
    assert.equal(journal.entries[0]!.reason, 'PROJECTION_INVALID');
  });
});

test('legacy evidence export is explicitly unavailable and does not fabricate a journal', async () => {
  const historical = runReport.parse(
    JSON.parse(
      await readFile('docs/evidence/mined-keyed-nonce-lifecycle.json', 'utf8'),
    ),
  );
  const root = await mkdtemp(join(tmpdir(), 'aftershock-legacy-export-'));
  await saveRun(root, historical);
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      fileURLToPath(new URL('../packages/cli/src/index.ts', import.meta.url)),
      'evidence',
      historical.runId,
    ],
    { cwd: root, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(child.status, 3, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    runId: historical.runId,
    evidence: null,
  });
});
