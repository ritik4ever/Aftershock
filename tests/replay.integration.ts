import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readRun } from '../packages/core/src/report.js';
import { runReport } from '../packages/core/src/scenario.js';
import { compareRuns } from '../packages/core/src/replay.js';

function cli(...args: string[]) {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
    { encoding: 'utf8', timeout: 160_000, maxBuffer: 1_048_576 },
  );
  assert.equal(child.error, undefined);
  return child;
}

test(
  'real CLI fresh-state rerun preserves BLOCKED and saves both genuine runs',
  { timeout: 340_000 },
  async () => {
    const first = cli('run', 'keyed-nonce-lifecycle', '--local');
    assert.equal(first.status, 3, first.stderr);
    const baseline = runReport.parse(JSON.parse(first.stdout));
    assert.equal(baseline.environment.fixtureMode, 'admission');
    const plan = cli('replay', baseline.runId, '--plan');
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).exactHistoricalReplay, false);
    const mismatch = cli('replay', baseline.runId, '--local', '--mine');
    assert.equal(mismatch.status, 2, mismatch.stderr);
    const second = cli('replay', baseline.runId, '--local');
    assert.equal(second.status, 3, second.stderr);
    const comparison = JSON.parse(second.stdout);
    const rerun = await readRun(process.cwd(), comparison.rerunRunId);
    assert.deepEqual(await readRun(process.cwd(), baseline.runId), baseline);
    assert.deepEqual(comparison, compareRuns(baseline, rerun));
    assert.equal(comparison.comparison, 'VERDICTS_MATCH');
    assert.equal(comparison.bothRunsPassed, false);
    assert.equal(rerun.result, 'BLOCKED');
    const evidence = cli('evidence', rerun.runId);
    assert.equal(evidence.status, 0, evidence.stderr);
    assert.deepEqual(JSON.parse(evidence.stdout), {
      runId: rerun.runId,
      evidence: rerun.evidence,
    });
    const offline = cli('compare', baseline.runId, rerun.runId);
    assert.equal(offline.status, 0, offline.stderr);
    assert.deepEqual(JSON.parse(offline.stdout), comparison);
    assert.notEqual(
      rerun.environment.genesisSha256,
      baseline.environment.genesisSha256,
    );
    for (const report of [baseline, rerun]) {
      assert.equal(
        report.steps.find((step) => step.id === 'admit-base')?.result,
        'PASS',
      );
      assert.equal(
        report.steps.find((step) => step.id === 'fixture-cleanup')?.result,
        'PASS',
      );
      for (const args of [
        [
          'ps',
          '-a',
          '--filter',
          `label=aftershock.run=${report.runId}`,
          '--format',
          '{{.Names}}',
        ],
        [
          'network',
          'ls',
          '--filter',
          `label=aftershock.run=${report.runId}`,
          '--format',
          '{{.Name}}',
        ],
      ]) {
        const check = spawnSync('docker', args, {
          encoding: 'utf8',
          timeout: 10_000,
        });
        assert.equal(check.status, 0, check.stderr);
        assert.equal(check.stdout.trim(), '');
      }
    }
  },
);
