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
import { executionProgress } from '../packages/core/src/progress.js';

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
    executionProgress('SETUP', 'image-provenance');
    for (let i = 0; i < 70; i++)
      executionProgress('EXECUTING', 'test-check', 'PASS');
    await gate;
    return report;
  });
  assert.equal(jobs.current(), null);
  const job = jobs.start('keyed-nonce-lifecycle')!;
  assert.deepEqual(jobs.current(), job);
  const snapshot = jobs.current()!;
  snapshot.state = 'ERROR';
  assert.equal(jobs.current()?.state, 'RUNNING');
  assert.equal(job.completedChecks, 70);
  assert.equal(job.progress.length, 64);
  snapshot.progress[0]!.label = 'changed-copy';
  assert.equal(jobs.current()?.progress[0]?.label, 'test-check');
  assert.equal(job.state, 'RUNNING');
  assert.equal(job.runId, undefined);
  assert.equal(jobs.start('paymaster-solvency'), null);
  release();
  for (let i = 0; i < 1000 && jobs.get(job.id)?.state === 'RUNNING'; i++)
    await delay(10);
  const finished = jobs.get(job.id)!;
  assert.equal(finished.state, 'COMPLETED');
  assert.equal(jobs.current(), null);
  assert.equal(finished.runId, report.runId);
  assert.equal(finished.progress.at(-1)?.phase, 'REPORT');
  assert.ok(finished.completedAt);
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
  assert.equal(jobs.get(job.id)?.guidance?.code, 'REPORT_UNAVAILABLE');
  assert.ok(
    jobs.start('keyed-replacement-ttl'),
    'failure must release the run slot',
  );
});

test('completed reports retain their verdict and get safe actionable guidance', async () => {
  const template = JSON.parse(
    await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
  );
  for (const [result, code, cleanup] of [
    ['BLOCKED', 'PREREQUISITE_BLOCKED', false],
    ['BLOCKED', 'CLEANUP_REQUIRED', true],
    ['FAIL', 'INVARIANT_FAILURE', false],
    ['INCONCLUSIVE', 'EVIDENCE_REVIEW', false],
  ] as const) {
    const root = await mkdtemp(join(tmpdir(), 'aftershock-guidance-'));
    const report = runReport.parse({
      ...template,
      endpointClass: 'MOCK_UNIT_TEST',
      runId: randomUUID(),
      result,
      steps: template.steps.map((step: { id: string }, index: number) => ({
        ...step,
        ...((cleanup ? step.id === 'fixture-cleanup' : index === 0)
          ? { result }
          : {}),
      })),
    });
    const jobs = createExecutionJobs(root, async () => report);
    const job = jobs.start(report.scenarioId)!;
    for (let i = 0; i < 1000 && jobs.get(job.id)?.state === 'RUNNING'; i++)
      await delay(10);
    const done = jobs.get(job.id)!;
    assert.equal(done.state, 'COMPLETED');
    assert.equal(done.result, result);
    assert.equal(done.guidance?.code, code);
    assert.equal((await readRun(root, report.runId)).result, result);
  }
});

test('concurrent job managers keep progress scoped to their own execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-progress-scope-'));
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const managers = ['first-job', 'second-job'].map((label) =>
    createExecutionJobs(root, async () => {
      await gate;
      executionProgress('SETUP', label);
      await setImmediate();
      executionProgress('EXECUTING', label);
      throw new Error('PRIVATE_CONTEXT_SENTINEL');
    }),
  );
  const jobs = managers.map((manager) =>
    manager.start('keyed-replacement-ttl')!,
  );
  release();
  for (
    let i = 0;
    i < 1000 &&
    managers.some(
      (manager, index) => manager.get(jobs[index]!.id)?.state === 'RUNNING',
    );
    i++
  )
    await delay(10);
  for (const [index, manager] of managers.entries()) {
    const done = manager.get(jobs[index]!.id)!;
    assert.equal(done.state, 'ERROR');
    assert.deepEqual(
      done.progress.map((event) => event.label),
      [
        index === 0 ? 'first-job' : 'second-job',
        index === 0 ? 'first-job' : 'second-job',
      ],
    );
    assert.doesNotMatch(JSON.stringify(done), /PRIVATE_CONTEXT_SENTINEL/);
  }
});
