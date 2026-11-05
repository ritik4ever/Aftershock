import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { runReport } from '../packages/core/src/scenario.js';

for (const [id, expected] of [
  [
    'paymaster-solvency',
    [
      'admit-base',
      'confirm-solvency-boundary',
      'reject-aggregate-overspend',
      'accept-fee-bumped-replacement',
      'verify-replacement-lifecycle',
    ],
  ],
  [
    'keyed-nonce-lifecycle',
    [
      'admit-base',
      'admit-disjoint-key',
      'reject-duplicate',
      'reject-overlapping-set',
      'reject-low-fee-bump',
      'reject-low-priority-fee-bump',
      'accept-fee-bumped-replacement',
      'verify-replacement-lifecycle',
    ],
  ],
] as const) {
  test(
    `real isolated ${id}: admission/replacement subset; mining remains blocked`,
    { timeout: 180_000 },
    async () => {
      const child = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'packages/cli/src/index.ts', 'run', id, '--local'],
        { encoding: 'utf8', timeout: 160_000, maxBuffer: 1_048_576 },
      );
      assert.equal(child.error, undefined);
      assert.equal(child.status, 3, child.stderr);
      const report = runReport.parse(JSON.parse(child.stdout));
      assert.equal(report.endpointClass, 'ISOLATED_LOCAL');
      assert.equal(report.result, 'BLOCKED');
      assert.equal(report.environment.networkInternal, 'true');
      assert.equal(report.environment.publishedPorts, 'none');
      if (id === 'keyed-nonce-lifecycle') {
        const maximumOnly = report.steps.find(
          (step) => step.id === 'reject-low-priority-fee-bump',
        )!;
        const priorityOnly = report.steps.find(
          (step) => step.id === 'reject-low-fee-bump',
        )!;
        assert.equal(maximumOnly.observed.maximumFee, '2200000000');
        assert.equal(maximumOnly.observed.priorityFee, '1050000000');
        assert.equal(priorityOnly.observed.maximumFee, '2100000000');
        assert.equal(priorityOnly.observed.priorityFee, '1100000000');
      }
      for (const action of [
        ...expected,
        'explorer-continuity',
        'fixture-cleanup',
      ]) {
        assert.equal(
          report.steps.find((step) => step.id === action)?.result,
          'PASS',
          action,
        );
      }
      assert.equal(
        report.steps.find((step) => step.id === 'mined-state-transition')
          ?.result,
        'BLOCKED',
      );
      assert.ok(
        !report.steps.some(
          (step) => step.result === 'FAIL' || step.result === 'INCONCLUSIVE',
        ),
      );
      const containerCheck = spawnSync(
        'docker',
        [
          'ps',
          '-a',
          '--filter',
          `label=aftershock.run=${report.runId}`,
          '--format',
          '{{.Names}}',
        ],
        { encoding: 'utf8' },
      );
      const networkCheck = spawnSync(
        'docker',
        [
          'network',
          'ls',
          '--filter',
          `label=aftershock.run=${report.runId}`,
          '--format',
          '{{.Name}}',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(containerCheck.stdout.trim(), '');
      assert.equal(networkCheck.stdout.trim(), '');
      await mkdir('.local/integration-results', {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(
        `.local/integration-results/${id}.json`,
        `${JSON.stringify(report, null, 2)}\n`,
        { mode: 0o600 },
      );
    },
  );
}
