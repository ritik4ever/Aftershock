import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { runReport } from '../packages/core/src/scenario.js';
import { docker } from '../packages/core/src/local/fixture.js';

test(
  'native CLI verifies Cancelled fee exemption and identical reactivation',
  { timeout: 900_000 },
  async () => {
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
        { encoding: 'utf8', timeout: 850_000, maxBuffer: 1_048_576 },
      );
    const child = cli('run', 'cancelled-replacement', '--local', '--mine');
    assert.equal(child.error, undefined);
    const report = runReport.parse(JSON.parse(child.stdout));
    await mkdir('.local/cancelled-results', { recursive: true, mode: 0o700 });
    await writeFile(
      `.local/cancelled-results/${report.runId}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    assert.equal(
      child.status,
      1,
      `${child.stderr}\n${JSON.stringify(report.steps.filter((s) => s.result !== 'PASS'))}`,
    );
    // At the pinned source, same-hash readmission is followed by markReplaced
    // on that same hash. Keep this real node inconsistency a scenario FAIL.
    assert.equal(report.result, 'FAIL');
    assert.equal(report.environment.fixtureMode, 'mining');
    assert.equal(report.environment.useropsTTL, '300');
    assert.equal(report.environment.networkInternal, 'true');
    assert.equal(report.environment.publishedPorts, 'none');
    assert.equal(report.evidence?.complete, true);
    assert.equal(report.steps.length, report.definition.actions.length + 1);
    assert.deepEqual(
      report.steps.filter((s) => s.result === 'FAIL').map((s) => s.id),
      ['explorer-reactivation-consistency'],
    );
    assert.deepEqual(
      report.steps.filter((s) => s.result === 'INCONCLUSIVE').map((s) => s.id),
      ['mined-state-transition'],
    );
    assert.ok(
      report.steps
        .filter(
          (s) =>
            ![
              'explorer-reactivation-consistency',
              'mined-state-transition',
            ].includes(s.id),
        )
        .every((s) => s.result === 'PASS'),
    );
    const observed = (id: string) =>
      report.steps.find((s) => s.id === id)!.observed;
    assert.equal(observed('reject-live-duplicate').actual, 'DUPLICATE');
    assert.equal(observed('reject-live-below-bump').actual, 'FEE_BUMP');
    assert.equal(observed('observe-cancelled').status, 'Cancelled');
    assert.equal(observed('accept-cancelled-below-bump').actual, 'ACCEPTED');
    assert.equal(observed('observe-recancelled').status, 'Cancelled');
    assert.equal(observed('resubmit-cancelled-identical').actual, 'ACCEPTED');
    assert.equal(observed('verify-reactivation').status, 'New');
    assert.equal(
      observed('explorer-reactivation-consistency').activeStatus,
      'New',
    );
    assert.equal(
      observed('explorer-reactivation-consistency').explorerOutcome,
      'replaced',
    );
    assert.equal(observed('reject-reactivated-duplicate').actual, 'DUPLICATE');
    assert.equal(observed('reject-reactivated-below-bump').actual, 'FEE_BUMP');
    for (const id of ['verify-terminal-replacement', 'verify-reactivation']) {
      const claim = observed(id);
      const elapsed =
        BigInt(String(claim.acceptedAt)) - BigInt(String(claim.cancelledAt));
      assert.ok(elapsed >= 0n && elapsed < 300_000n);
    }
    const receipts = report.evidence.entries.filter(
      (e) =>
        e.method === 'eth_getTransactionReceipt' &&
        e.outcome === 'RESULT' &&
        e.result !== null,
    );
    assert.equal(receipts.length, 4);
    assert.ok(
      !report.evidence.entries.some(
        (e) => e.method === 'eth_getFrameTransactionReceipt',
      ),
    );
    const exported = cli('evidence', report.runId);
    assert.equal(exported.status, 0, exported.stderr);
    assert.deepEqual(JSON.parse(exported.stdout).evidence, report.evidence);
    const saved = cli('report', report.runId, '--format', 'json');
    assert.equal(saved.status, 0, saved.stderr);
    assert.deepEqual(JSON.parse(saved.stdout), report);
    const checked = cli('check-evidence', report.runId);
    assert.equal(checked.status, 3, checked.stderr);
    const consistency = JSON.parse(checked.stdout);
    assert.equal(consistency.status, 'INSUFFICIENT');
    assert.equal(consistency.checks.length, 9);
    assert.ok(
      consistency.checks.every(
        (item: { status: string }) => item.status === 'CONSISTENT',
      ),
    );
    assert.equal(
      consistency.notReevaluatedSteps.length,
      report.steps.length - 9,
    );
    const plan = cli('replay', report.runId, '--plan');
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).mining, true);
    assert.equal(
      await docker(
        'ps',
        '-a',
        '--filter',
        `label=aftershock.run=${report.runId}`,
        '--format',
        '{{.Names}}',
      ),
      '',
    );
    assert.equal(
      await docker(
        'network',
        'ls',
        '--filter',
        `label=aftershock.run=${report.runId}`,
        '--format',
        '{{.Name}}',
      ),
      '',
    );
  },
);
