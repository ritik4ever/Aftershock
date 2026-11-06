import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { startViewer } from '../packages/core/src/viewer.js';
import { runReport } from '../packages/core/src/scenario.js';
import type { ExecutionProgress } from '../packages/core/src/progress.js';

for (const scenarioId of ['keyed-replacement-ttl', 'paymaster-solvency']) {
  test(
    `browser progress follows real ${scenarioId} execution through cleanup`,
    { timeout: 900_000 },
    async () => {
      const viewer = await startViewer(process.cwd(), 0);
      try {
        const response = await fetch(`${viewer.url}/api/execute`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scenarioId }),
        });
        assert.equal(response.status, 202);
        let job = await response.json();
        const deadline = performance.now() + 850_000;
        const phases = new Set<string>();
        while (job.state === 'RUNNING' && performance.now() < deadline) {
          job.progress.forEach((event: ExecutionProgress) =>
            phases.add(event.phase),
          );
          assert.ok(job.progress.length <= 64);
          await delay(1000);
          job = await (
            await fetch(`${viewer.url}/api/execute?job=${job.id}`)
          ).json();
        }
        job.progress.forEach((event: ExecutionProgress) =>
          phases.add(event.phase),
        );
        assert.equal(job.state, 'COMPLETED', JSON.stringify(job));
        assert.equal(job.result, 'PASS', JSON.stringify(job));
        for (const phase of ['SETUP', 'EXECUTING', 'CLEANUP', 'REPORT'])
          assert.ok(phases.has(phase), phase);
        const data = await (
          await fetch(`${viewer.url}/api/run?key=local:${job.runId}`)
        ).json();
        const report = runReport.parse(data.report);
        assert.equal(report.endpointClass, 'ISOLATED_LOCAL');
        assert.equal(report.result, 'PASS');
        assert.equal(job.completedChecks, report.steps.length);
        assert.ok(
          report.steps.some(
            (step) => step.id === 'fixture-cleanup' && step.result === 'PASS',
          ),
        );
        assert.equal(
          job.progress.filter((event: ExecutionProgress) => event.result)
            .length,
          job.completedChecks,
        );
        if (scenarioId === 'paymaster-solvency')
          assert.ok(
            job.progress.some(
              (event: ExecutionProgress) =>
                event.label === 'waiting-for-mining-fork-readiness',
            ),
          );
        console.log(
          JSON.stringify({
            scenarioId,
            runId: job.runId,
            result: job.result,
            checks: job.completedChecks,
            phases: [...phases],
          }),
        );
      } finally {
        await viewer.close();
      }
    },
  );
}
