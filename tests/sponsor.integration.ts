import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { runReport } from '../packages/core/src/scenario.js';
import { readRun } from '../packages/core/src/report.js';
import { docker } from '../packages/core/src/local/fixture.js';

const execute = promisify(execFile);
test(
  'real staking makes foreign validation storage sidecar-admissible while canonical rejection persists',
  { timeout: 960000 },
  async () => {
    const child = await execute(
      process.execPath,
      [
        '--import',
        'tsx',
        'packages/cli/src/index.ts',
        'run',
        'staked-storage-boundary',
        '--local',
        '--mine',
      ],
      { encoding: 'utf8', timeout: 900000, maxBuffer: 2097152 },
    ).then(
      (result) => ({ ...result, code: 0 }),
      (error) => ({ stdout: String(error.stdout ?? ''), code: error.code }),
    );
    const report = runReport.parse(JSON.parse(child.stdout));
    assert.equal(child.code, 0, JSON.stringify(report.steps));
    assert.equal(report.result, 'PASS');
    assert.equal(report.evidence?.complete, true);
    assert.deepEqual(await readRun(process.cwd(), report.runId), report);
    const steps = new Map(report.steps.map((step) => [step.id, step]));
    assert.equal(steps.get('verify-initial-state')?.observed.stake, '0');
    assert.equal(
      steps.get('verify-stake-transition')?.observed.stake,
      '12000000000000000',
    );
    assert.equal(
      steps.get('canonical-staked-reject')?.observed.hash,
      steps.get('alt-staked-admit')?.observed.hash,
    );
    assert.equal(
      steps.get('observe-alt-inclusion')?.observed.storagePassedWithoutWaiver,
      true,
    );
    assert.equal(
      steps.get('observe-alt-inclusion')?.observed.frameStatuses,
      'success,success',
    );
    assert.equal(
      BigInt(
        String(steps.get('verify-alt-state-change')?.observed.recipientAfter),
      ),
      BigInt(
        String(steps.get('verify-alt-state-change')?.observed.recipientBefore),
      ) + 1n,
    );
    for (const id of ['deploy-registry', 'deploy-foreign', 'deploy-wallet'])
      assert.ok(Number(steps.get(id)?.observed.runtimeBytes) > 0);
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
    console.log(`Genuine sponsor demo report: ${report.runId}`);
  },
);
