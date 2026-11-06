import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { startRemoteJob } from '../packages/core/src/runner-contract.js';
import { runScenario } from '../packages/core/src/scenario.js';
import { saveRun } from '../packages/core/src/report.js';
import { runContractPlan } from '../packages/core/src/local/contract-test.js';
import { planHash } from '../packages/core/src/contract-plan.js';

try {
  const input = startRemoteJob.parse({
    scenarioId: process.env.AFTERSHOCK_SCENARIO,
    requestId: process.env.AFTERSHOCK_REQUEST_ID,
    ...(process.env.AFTERSHOCK_SCENARIO === 'custom-contract'
      ? { plan: JSON.parse(process.env.AFTERSHOCK_CONTRACT_PLAN ?? '') }
      : {}),
  });
  const sourceCommit = z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .parse(process.env.GITHUB_SHA);
  if (
    input.scenarioId === 'custom-contract' &&
    process.env.AFTERSHOCK_PLAN_SHA256 !== planHash(input.plan)
  )
    throw new Error('Plan identity mismatch');
  const report =
    input.scenarioId === 'custom-contract'
      ? await runContractPlan(input.plan, process.cwd())
      : await runScenario(
          input.scenarioId,
          process.cwd(),
          0,
          input.scenarioId !== 'keyed-replacement-ttl',
        );
  if (report.scenarioId !== 'custom-contract')
    await saveRun(process.cwd(), report);
  const data = JSON.stringify({
    scenarioId: input.scenarioId,
    requestId: input.requestId,
    sourceCommit,
    report,
  });
  if (Buffer.byteLength(data) + 1 > 1_048_576)
    throw new Error('Export too large');
  await mkdir(resolve('.local/remote-export'), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(resolve('.local/remote-export/result.json'), `${data}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(JSON.stringify({ runId: report.runId, result: report.result }));
  if (report.result !== 'PASS') process.exitCode = 1;
} catch {
  console.error(
    'Remote scenario did not produce a publishable report. Private diagnostics were not uploaded.',
  );
  process.exitCode = 2;
}
