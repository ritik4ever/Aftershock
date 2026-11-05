import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { runReport } from '../packages/core/src/scenario.js';
import { docker } from '../packages/core/src/local/fixture.js';

for (const id of ['paymaster-solvency', 'keyed-nonce-lifecycle'] as const) {
  test(
    `real mined ${id} through the native CLI`,
    { timeout: 900_000 },
    async () => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'packages/cli/src/index.ts',
          'run',
          id,
          '--local',
          '--mine',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '',
        stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      const report = runReport.parse(JSON.parse(stdout));
      await mkdir('.local/lifecycle-results', { recursive: true, mode: 0o700 });
      await writeFile(
        `.local/lifecycle-results/${id}.json`,
        `${JSON.stringify(report, null, 2)}\n`,
        { mode: 0o600 },
      );
      assert.equal(
        code,
        0,
        `${stderr}\n${JSON.stringify(report.steps.filter((step) => step.result !== 'PASS'))}`,
      );
      assert.equal(report.result, 'PASS');
      assert.equal(report.environment.fixtureMode, 'mining');
      assert.equal(report.environment.bundlingMode, 'manual');
      assert.equal(report.environment.networkInternal, 'true');
      assert.equal(report.environment.publishedPorts, 'none');
      for (const action of report.definition.actions)
        assert.equal(
          report.steps.find((step) => step.id === action)?.result,
          'PASS',
          action,
        );
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
}
