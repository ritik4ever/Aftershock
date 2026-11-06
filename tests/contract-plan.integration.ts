import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { runContractPlan } from '../packages/core/src/local/contract-test.js';
import { counterPlan } from '../packages/core/src/contract-plan.js';

test(
  'uploaded constructor bytecode is deployed and mutated through a real mined alternative-mempool Frame Transaction',
  { timeout: 900000 },
  async () => {
    const report = await runContractPlan(counterPlan, process.cwd());
    await mkdir('.local/contract-results', { recursive: true, mode: 0o700 });
    await writeFile(
      `.local/contract-results/${report.runId}.json`,
      JSON.stringify(report, null, 2),
      { mode: 0o600, flag: 'wx' },
    );
    assert.equal(report.result, 'PASS', JSON.stringify(report));
    assert.equal(
      report.steps.find((s) => s.id === 'action-1')?.observed.admitted,
      true,
    );
    assert.equal(report.steps.at(-1)?.id, 'fixture-cleanup');
  },
);
