import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate, setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createExecutionJobs } from '../packages/core/src/execution.js';
import { readRun } from '../packages/core/src/report.js';
import { runReport } from '../packages/core/src/scenario.js';

test('local execution jobs serialize real-engine calls and expose only newly saved report identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-execution-'));
  const report = runReport.parse({
    ...JSON.parse(
      await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
    ),
    endpointClass: 'MOCK_UNIT_TEST',
    runId: randomUUID(),
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const jobs = createExecutionJobs(root, async (scenario) => {
    calls++;
    assert.equal(scenario, report.scenarioId);
    await gate;
    return report;
  });
  const job = jobs.start('keyed-nonce-lifecycle')!;
  assert.equal(job.state, 'RUNNING');
  assert.equal(job.runId, undefined);
  assert.equal(jobs.start('paymaster-solvency'), null);
  release();
  for (let i = 0; i < 1000 && jobs.get(job.id)?.state === 'RUNNING'; i++)
    await delay(10);
  const finished = jobs.get(job.id)!;
  assert.equal(finished.state, 'COMPLETED');
  assert.equal(finished.runId, report.runId);
  assert.equal(
    (await readRun(root, report.runId)).endpointClass,
    'MOCK_UNIT_TEST',
  );
  assert.equal(calls, 1);
  assert.equal(jobs.get(randomUUID()), null);
});

test('failed local execution never substitutes a recorded report or leaks diagnostics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-execution-failed-'));
  const jobs = createExecutionJobs(root, async () => {
    throw new Error('PRIVATE_DIAGNOSTIC_SENTINEL');
  });
  const job = jobs.start('keyed-replacement-ttl')!;
  await setImmediate();
  assert.equal(jobs.get(job.id)?.state, 'ERROR');
  assert.equal(jobs.get(job.id)?.runId, undefined);
  assert.doesNotMatch(JSON.stringify(jobs.get(job.id)), /PRIVATE_DIAGNOSTIC/);
  assert.ok(
    jobs.start('keyed-replacement-ttl'),
    'failure must release the run slot',
  );
});
