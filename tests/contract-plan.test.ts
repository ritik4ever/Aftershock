import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import {
  contractPlan,
  contractReport,
  counterPlan,
  planHash,
} from '../packages/core/src/contract-plan.js';
import { createContractJobs } from '../packages/core/src/contract-jobs.js';
import { UPSTREAM } from '../packages/core/src/inspect.js';
import { readFile } from 'node:fs/promises';

export const unitContractReport = contractReport.parse({
  schemaVersion: 1,
  scenarioId: 'custom-contract',
  endpointClass: 'ISOLATED_LOCAL',
  runId: randomUUID(),
  plan: counterPlan,
  planSha256: planHash(counterPlan),
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  sourcePins: UPSTREAM,
  environment: { scope: 'UNIT_TEST_ONLY_SYNTHETIC' },
  steps: [
    {
      id: 'prerequisites-or-evidence',
      at: new Date().toISOString(),
      result: 'BLOCKED',
      observed: { scope: 'UNIT_TEST_ONLY' },
    },
  ],
  result: 'BLOCKED',
});
test('contract plans accept bounded public bytecode and reject scripts, keys, gas abuse and incompatible assertions', () => {
  assert.equal(contractPlan.parse(counterPlan).steps.length, 2);
  for (const changed of [
    { privateKey: 'secret' },
    { command: 'shell' },
    { rpc: 'http://localhost' },
    { initCode: '$(command)' },
    { initCode: '0x' + 'ff'.repeat(16385) },
    { steps: [] },
    { steps: Array(9).fill(counterPlan.steps[0]) },
  ])
    assert.equal(
      contractPlan.safeParse({ ...counterPlan, ...changed }).success,
      false,
    );
  assert.equal(
    contractPlan.safeParse({
      ...counterPlan,
      steps: [{ kind: 'transaction', expectedReturn: '0x' }],
    }).success,
    false,
  );
  assert.equal(
    contractPlan.safeParse({
      ...counterPlan,
      steps: [{ kind: 'call', expect: 'revert', expectedReturn: '0x1234' }],
    }).success,
    false,
  );
  assert.equal(
    contractPlan.safeParse({
      ...counterPlan,
      steps: [{ kind: 'frame', nonceKeys: ['0x1'] }],
    }).success,
    false,
  );
  assert.equal(
    contractPlan.safeParse({
      ...counterPlan,
      steps: [
        {
          kind: 'frame',
          frames: Array(8).fill({
            mode: 2,
            flags: 0,
            target: 'contract',
            execution: '0x16e360',
          }),
        },
      ],
    }).success,
    false,
  );
  assert.notEqual(
    planHash(counterPlan),
    planHash(contractPlan.parse({ ...counterPlan, name: 'Changed' })),
  );
});
test('contract result validation rejects tampered plans, missing observations and aggregate mismatches', () => {
  assert.equal(
    contractReport.safeParse({
      ...unitContractReport,
      steps: unitContractReport.steps.slice(1),
    }).success,
    false,
  );
  assert.equal(
    contractReport.safeParse({
      ...unitContractReport,
      planSha256: '0'.repeat(64),
    }).success,
    false,
  );
  assert.equal(
    contractReport.safeParse({ ...unitContractReport, result: 'FAIL' }).success,
    false,
  );
});

test('recorded real contract deployment evidence passes validation and rejects a missing frame receipt', async () => {
  const observed = contractReport.parse(
    JSON.parse(
      await readFile('docs/evidence/custom-contract-2026-11-07.json', 'utf8'),
    ),
  );
  assert.equal(observed.result, 'PASS');
  assert.equal(observed.planSha256, planHash(counterPlan));
  assert.deepEqual(
    contractPlan.parse(
      JSON.parse(await readFile('examples/counter.plan.json', 'utf8')),
    ),
    counterPlan,
  );
  assert.equal(
    observed.steps.find((s) => s.id === 'action-1')?.observed.admitted,
    true,
  );
  const changed = structuredClone(observed);
  delete changed.steps.find((s) => s.id === 'action-1')!.observed.receipt;
  assert.equal(contractReport.safeParse(changed).success, false);
});
test('local contract jobs deduplicate requests, enforce busy state, bind reports to input and recover failures', async () => {
  let finish!: (value: typeof unitContractReport) => void;
  const jobs = createContractJobs(
    '.',
    () => false,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const id = randomUUID();
  const post = (requestId = id, plan = counterPlan) =>
    new Request('http://localhost/api/contract-run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, plan }),
    });
  assert.equal((await jobs.handle(post())).status, 202);
  assert.equal((await jobs.handle(post())).status, 200);
  assert.equal((await jobs.handle(post(randomUUID()))).status, 409);
  assert.equal(
    (await jobs.handle(post(id, { ...counterPlan, name: 'Changed' }))).status,
    409,
  );
  finish(unitContractReport);
  await setImmediate();
  assert.equal(
    (
      await (
        await jobs.handle(
          new Request(
            `http://localhost/api/contract-run?job=${id}&format=detail`,
          ),
        )
      ).json()
    ).report.result,
    'BLOCKED',
  );
  assert.equal(jobs.busy(), false);
  const failed = createContractJobs(
    '.',
    () => false,
    async () => {
      throw new Error('PRIVATE');
    },
  );
  const started = await (await failed.handle(post())).json();
  await setImmediate();
  const result = await failed.handle(
    new Request(`http://localhost/api/contract-run?job=${started.id}`),
  );
  assert.doesNotMatch(await result.text(), /PRIVATE/);
});
