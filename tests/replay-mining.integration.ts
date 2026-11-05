import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { readRun, saveRun } from '../packages/core/src/report.js';
import { runReport } from '../packages/core/src/scenario.js';
import { compareRuns } from '../packages/core/src/replay.js';

function cli(...args: string[]) {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
    { encoding: 'utf8', timeout: 850_000, maxBuffer: 1_048_576 },
  );
  assert.equal(child.error, undefined);
  return child;
}

for (const id of ['keyed-nonce-lifecycle', 'paymaster-solvency']) {
  test(
    `real mined replay ${id} against a reviewed historical baseline`,
    { timeout: 900_000 },
    async () => {
      const baseline = runReport.parse(
        JSON.parse(await readFile(`docs/evidence/mined-${id}.json`, 'utf8')),
      );
      // Import a genuine reviewed capture only when its immutable envelope is absent.
      // Existing reports must match; never overwrite or replace inconsistent evidence.
      try {
        assert.deepEqual(
          await readRun(process.cwd(), baseline.runId),
          baseline,
        );
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        )
          throw error;
        await saveRun(process.cwd(), baseline);
      }
      const child = cli('replay', baseline.runId, '--local', '--mine');
      const comparison = JSON.parse(child.stdout);
      const rerun = await readRun(process.cwd(), comparison.rerunRunId);
      await mkdir('.local/replay-results', { recursive: true, mode: 0o700 });
      await writeFile(
        `.local/replay-results/${id}.json`,
        `${JSON.stringify({ comparison, rerun }, null, 2)}\n`,
        { mode: 0o600 },
      );
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(comparison, compareRuns(baseline, rerun));
      assert.equal(comparison.comparison, 'VERDICTS_MATCH');
      assert.equal(comparison.bothRunsPassed, true);
      assert.equal(comparison.exactHistoricalReplay, false);
      assert.notEqual(baseline.runId, rerun.runId);
      assert.notEqual(
        baseline.environment.genesisSha256,
        rerun.environment.genesisSha256,
      );
      assert.equal(rerun.result, 'PASS');
      for (const action of [...rerun.definition.actions, 'fixture-cleanup'])
        assert.equal(
          rerun.steps.find((step) => step.id === action)?.result,
          'PASS',
          action,
        );
      const offline = cli('compare', baseline.runId, rerun.runId);
      assert.equal(offline.status, 0, offline.stderr);
      assert.deepEqual(JSON.parse(offline.stdout), comparison);
      for (const args of [
        [
          'ps',
          '-a',
          '--filter',
          `label=aftershock.run=${rerun.runId}`,
          '--format',
          '{{.Names}}',
        ],
        [
          'network',
          'ls',
          '--filter',
          `label=aftershock.run=${rerun.runId}`,
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
    },
  );
}
