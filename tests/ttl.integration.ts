import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { runReport } from '../packages/core/src/scenario.js';
import { docker } from '../packages/core/src/local/fixture.js';

test(
  'native CLI verifies keyed replacement TTL expiry and refresh',
  { timeout: 180_000 },
  async () => {
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
        { encoding: 'utf8', timeout: 150_000, maxBuffer: 1_048_576 },
      );
    const child = cli('run', 'keyed-replacement-ttl', '--local');
    assert.equal(child.error, undefined);
    const report = runReport.parse(JSON.parse(child.stdout));
    await mkdir('.local/ttl-results', { recursive: true, mode: 0o700 });
    await writeFile(
      `.local/ttl-results/${report.runId}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    assert.equal(
      child.status,
      0,
      `${child.stderr}\n${JSON.stringify(report.steps.filter((s) => s.result !== 'PASS'))}`,
    );
    assert.equal(report.result, 'PASS');
    assert.equal(report.environment.fixtureMode, 'admission');
    assert.equal(report.environment.useropsTTL, '30');
    assert.equal(report.environment.networkInternal, 'true');
    assert.equal(report.environment.publishedPorts, 'none');
    assert.equal(report.evidence?.complete, true);
    assert.equal(report.steps.length, report.definition.actions.length + 1);
    assert.ok(report.steps.every((s) => s.result === 'PASS'));
    const observed = (id: string) =>
      report.steps.find((s) => s.id === id)!.observed;
    assert.equal(observed('reject-fee-before-ttl').actual, 'FEE_BUMP');
    assert.equal(observed('reject-duplicate-after-ttl').actual, 'DUPLICATE');
    assert.equal(observed('accept-fee-after-ttl').actual, 'ACCEPTED');
    assert.equal(observed('reject-fee-after-refresh').actual, 'FEE_BUMP');
    const transition = observed('verify-ttl-replacement');
    assert.ok(
      BigInt(String(transition.newLastUpdatedTime)) -
        BigInt(String(transition.oldLastUpdatedTime)) >
        30_000n,
    );
    assert.ok(
      report.evidence.entries.some(
        (e) =>
          e.method === 'skandha_explorer_getTransaction' &&
          e.outcome === 'RESULT',
      ),
    );
    assert.ok(
      !report.evidence.entries.some(
        (e) =>
          e.method === 'eth_sendRawTransaction' ||
          e.method === 'eth_getFrameTransactionReceipt',
      ),
    );
    const exported = cli('evidence', report.runId);
    assert.equal(exported.status, 0, exported.stderr);
    assert.deepEqual(JSON.parse(exported.stdout).evidence, report.evidence);
    const saved = cli('report', report.runId, '--format', 'json');
    assert.equal(saved.status, 0, saved.stderr);
    assert.deepEqual(JSON.parse(saved.stdout), report);
    const checked = cli('check-evidence', report.runId);
    assert.equal(checked.status, 0, checked.stderr);
    const consistency = JSON.parse(checked.stdout);
    assert.equal(consistency.status, 'CONSISTENT');
    assert.equal(consistency.checks.length, 3);
    assert.equal(
      consistency.notReevaluatedSteps.length,
      report.steps.length - 3,
    );
    const plan = cli('replay', report.runId, '--plan');
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).mining, false);
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
