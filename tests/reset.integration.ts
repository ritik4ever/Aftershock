import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compareRuns, genesisResetPlan } from '../packages/core/src/replay.js';
import { readRun } from '../packages/core/src/report.js';
import { runReport } from '../packages/core/src/scenario.js';
import { checkEvidence } from '../packages/core/src/evidence-check.js';
import {
  startFixture,
  FixtureSetupError,
  docker,
} from '../packages/core/src/local/fixture.js';

test(
  'real CLI genesis reset reproduces TTL signing inputs in clean isolated state',
  { timeout: 360_000 },
  async () => {
    const cli = (...args: string[]) => {
      const child = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
        { encoding: 'utf8', timeout: 150_000, maxBuffer: 1_048_576 },
      );
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0, child.stderr + child.stdout);
      return JSON.parse(child.stdout);
    };
    const baseline = runReport.parse(
      cli('run', 'keyed-replacement-ttl', '--local'),
    );
    const keyDigest = async () =>
      createHash('sha256')
        .update(await readFile(`.local/${baseline.runId}/keys.json`))
        .digest('hex');
    const before = await keyDigest();
    const plan = cli('replay', baseline.runId, '--plan', '--reset');
    assert.deepEqual(plan, genesisResetPlan(baseline));
    const comparison = cli('replay', baseline.runId, '--local', '--reset');
    const rerun = await readRun(process.cwd(), comparison.rerunRunId);
    assert.deepEqual(comparison, compareRuns(baseline, rerun));
    assert.equal(comparison.mode, 'GENESIS_RESET_RERUN');
    assert.equal(comparison.exactHistoricalReplay, false);
    assert.equal(comparison.bothRunsPassed, true);
    assert.equal(comparison.resetInputsMatch, true);
    assert.ok(Object.values(comparison.resetChecks).every(Boolean));
    assert.notEqual(rerun.runId, baseline.runId);
    assert.notEqual(rerun.environment.network, baseline.environment.network);
    assert.equal(
      rerun.environment.genesisSha256,
      baseline.environment.genesisSha256,
    );
    assert.equal(
      rerun.environment.initialBlockHash,
      baseline.environment.initialBlockHash,
    );
    assert.match(rerun.reproducer, /--local --reset$/);
    assert.equal(
      await keyDigest(),
      before,
      'Original private keys must remain unchanged',
    );
    assert.deepEqual(await readRun(process.cwd(), baseline.runId), baseline);
    const bootId = (report: typeof baseline) =>
      (
        report.evidence!.entries.find(
          (entry) =>
            entry.method === 'skandha_explorer_info' &&
            entry.outcome === 'RESULT',
        )!.result as { bootId: string }
      ).bootId;
    assert.notEqual(bootId(rerun), bootId(baseline));
    for (const report of [baseline, rerun]) {
      assert.equal(report.result, 'PASS');
      assert.equal(report.evidence?.omitted, 0);
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
    assert.deepEqual(cli('compare', baseline.runId, rerun.runId), comparison);
    for (const field of ['genesisSha256', 'sidecarImage'] as const) {
      const runId = randomUUID();
      const input = {
        ...plan.fixtureSource,
        [field]:
          field === 'genesisSha256'
            ? '0'.repeat(64)
            : `sha256:${'0'.repeat(64)}`,
      };
      await assert.rejects(
        startFixture(process.cwd(), runId, false, 'manual', 30, input),
        (error: Error) =>
          error instanceof FixtureSetupError &&
          error.stage ===
            (field === 'genesisSha256'
              ? 'reset-genesis-identity'
              : 'reset-image-identity'),
      );
      assert.equal(
        await docker(
          'ps',
          '-a',
          '--filter',
          `label=aftershock.run=${runId}`,
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
          `label=aftershock.run=${runId}`,
          '--format',
          '{{.Name}}',
        ),
        '',
      );
    }
  },
);
