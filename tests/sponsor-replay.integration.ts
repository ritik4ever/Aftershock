import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runReport } from '../packages/core/src/scenario.js';
import { readRun, saveRun } from '../packages/core/src/report.js';
import { docker } from '../packages/core/src/local/fixture.js';

const execute = promisify(execFile);
test(
  'native CLI fresh replay executes the genuine automatic-bundling sponsor scenario',
  { timeout: 960000 },
  async () => {
    const baseline = runReport.parse(
      JSON.parse(
        await readFile('docs/evidence/staked-storage-boundary.json', 'utf8'),
      ),
    );
    // The baseline is an unchanged genuine capture, never a manufactured report.
    try {
      await readRun(process.cwd(), baseline.runId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await saveRun(process.cwd(), baseline);
    }
    const before = await readFile(`reports/${baseline.runId}.scenario.json`);
    assert.deepEqual(await readRun(process.cwd(), baseline.runId), baseline);
    const cli = [
      '--import',
      'tsx',
      'packages/cli/src/index.ts',
      'replay',
      baseline.runId,
    ];
    const planned = await execute(process.execPath, [...cli, '--plan'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(JSON.parse(planned.stdout).mining, true);
    const child = await execute(
      process.execPath,
      [...cli, '--local', '--mine'],
      { encoding: 'utf8', timeout: 900000, maxBuffer: 2097152 },
    );
    const comparison = JSON.parse(child.stdout);
    assert.equal(comparison.mode, 'FRESH_STATE_RERUN');
    assert.equal(comparison.exactHistoricalReplay, false);
    assert.equal(comparison.bothRunsPassed, true);
    assert.deepEqual(comparison.environmentDifferences, []);
    assert.ok(
      comparison.actions.every(
        (action: { baseline: string; rerun: string }) =>
          action.baseline === 'PASS' && action.rerun === 'PASS',
      ),
    );
    const rerun = await readRun(process.cwd(), comparison.rerunRunId);
    assert.equal(rerun.scenarioId, baseline.scenarioId);
    assert.equal(rerun.environment.bundlingMode, 'auto');
    assert.equal(rerun.evidence?.complete, true);
    assert.notEqual(rerun.runId, baseline.runId);
    assert.notEqual(
      rerun.environment.genesisSha256,
      baseline.environment.genesisSha256,
    );
    assert.equal(
      rerun.steps.find((step) => step.id === 'verify-initial-state')?.observed
        .stake,
      '0',
    );
    assert.equal(
      rerun.steps.find((step) => step.id === 'observe-alt-inclusion')?.observed
        .storagePassedWithoutWaiver,
      true,
    );
    assert.deepEqual(
      await readFile(`reports/${baseline.runId}.scenario.json`),
      before,
    );
    for (const [kind, format] of [
      ['ps', '{{.Names}}'],
      ['network', '{{.Name}}'],
    ] as const) {
      const args = kind === 'ps' ? ['ps', '-a'] : ['network', 'ls'];
      assert.equal(
        await docker(
          ...args,
          '--filter',
          `label=aftershock.run=${rerun.runId}`,
          '--format',
          format,
        ),
        '',
      );
    }
    console.log(
      `Verified sponsor fresh replay: ${baseline.runId} -> ${rerun.runId}`,
    );
  },
);
