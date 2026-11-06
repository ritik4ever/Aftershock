import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  compareRuns,
  minedCheckpointPlan,
} from '../packages/core/src/replay.js';
import { runReport } from '../packages/core/src/scenario.js';
import { readRun } from '../packages/core/src/report.js';
import { checkEvidence } from '../packages/core/src/evidence-check.js';
import {
  docker,
  startFixture,
  FixtureSetupError,
} from '../packages/core/src/local/fixture.js';

const execute = promisify(execFile);
test(
  'native CLI restores a retained mined checkpoint into a new isolated keyed-nonce run',
  { timeout: 960_000 },
  async () => {
    const cli = async (...args: string[]) =>
      JSON.parse(
        (
          await execute(
            process.execPath,
            ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
            { encoding: 'utf8', timeout: 840_000, maxBuffer: 2_097_152 },
          )
        ).stdout,
      );
    const baseline = runReport.parse(
      await cli(
        'run',
        'keyed-nonce-lifecycle',
        '--local',
        '--mine',
        '--checkpoint',
      ),
    );
    assert.equal(baseline.result, 'PASS');
    console.log(`Checkpoint baseline verified: ${baseline.runId}`);
    const plan = minedCheckpointPlan(baseline);
    assert.deepEqual(
      await cli('replay', baseline.runId, '--plan', '--mine', '--reset'),
      plan,
    );
    const originalDigest = async () =>
      createHash('sha256')
        .update(await readFile(`.local/${baseline.runId}/keys.json`))
        .digest('hex');
    const before = await originalDigest();
    const manifest = `.local/${baseline.runId}/checkpoint-${plan.fixtureSource.checkpointId}/manifest.json`;
    const manifestDigest = async () =>
      createHash('sha256')
        .update(await readFile(manifest))
        .digest('hex');
    assert.equal(await manifestDigest(), plan.fixtureSource.manifestSha256);
    const comparison = await cli(
      'replay',
      baseline.runId,
      '--local',
      '--mine',
      '--reset',
    );
    const rerun = await readRun(process.cwd(), comparison.rerunRunId);
    console.log(`Checkpoint rerun verified: ${rerun.runId}`);
    assert.deepEqual(comparison, compareRuns(baseline, rerun));
    assert.deepEqual(
      await cli('compare', baseline.runId, rerun.runId),
      comparison,
    );
    assert.equal(comparison.mode, 'MINED_CHECKPOINT_RERUN');
    assert.equal(comparison.exactHistoricalReplay, false);
    assert.equal(comparison.bothRunsPassed, true);
    assert.equal(comparison.resetInputsMatch, true);
    assert.ok(Object.values(comparison.resetChecks).every(Boolean));
    assert.notEqual(rerun.environment.network, baseline.environment.network);
    assert.equal(
      rerun.environment.restoredBlockHash,
      baseline.environment.checkpointBlockHash,
    );
    assert.equal(await originalDigest(), before);
    assert.equal(await manifestDigest(), plan.fixtureSource.manifestSha256);
    assert.deepEqual(await readRun(process.cwd(), baseline.runId), baseline);
    for (const report of [baseline, rerun]) {
      assert.equal(report.result, 'PASS');
      assert.equal(report.evidence?.complete, true);
      assert.equal(checkEvidence(report).status, 'CONSISTENT');
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
    }
    const rejectedId = randomUUID();
    await assert.rejects(
      startFixture(
        process.cwd(),
        rejectedId,
        true,
        'manual',
        300,
        undefined,
        true,
        { ...plan.fixtureSource, manifestSha256: '0'.repeat(64) },
      ),
      (error: Error) =>
        error instanceof FixtureSetupError &&
        error.stage === 'mined-checkpoint-inputs',
    );
    assert.equal(
      await docker(
        'ps',
        '-a',
        '--filter',
        `label=aftershock.run=${rejectedId}`,
        '--format',
        '{{.Names}}',
      ),
      '',
    );
  },
);
