import { z } from 'zod';
import {
  contractPlan,
  contractReport,
  counterPlan,
  planHash,
} from './contract-plan.js';
import type { ContractPlan, ContractReport } from './contract-plan.js';
import { runContractPlan } from './local/contract-test.js';
import { boundedTestBody } from './user-test.js';

export function createContractJobs(
  root: string,
  otherBusy: () => boolean,
  execute: (plan: ContractPlan) => Promise<ContractReport> = (plan) =>
    runContractPlan(plan, root),
) {
  type Job = {
    id: string;
    state: 'RUNNING' | 'COMPLETED' | 'ERROR';
    planSha256: string;
    report?: ContractReport;
    error?: string;
  };
  const jobs = new Map<string, Job>();
  const busy = () => [...jobs.values()].some((j) => j.state === 'RUNNING');
  return {
    busy,
    async handle(request: Request) {
      const url = new URL(request.url);
      const reply = (status: number, value: unknown) =>
        Response.json(value, { status });
      if (
        url.pathname !== '/api/contract-run' ||
        (request.method === 'POST' && url.search)
      )
        return reply(400, { error: 'Invalid contract runner route' });
      if (
        request.headers.get('sec-fetch-site') === 'cross-site' ||
        (request.headers.has('origin') &&
          request.headers.get('origin') !== url.origin)
      )
        return reply(403, { error: 'Same-origin requests only' });
      if (request.method === 'POST') {
        if (
          request.headers.get('content-type')?.split(';')[0] !==
          'application/json'
        )
          return reply(415, { error: 'JSON plan required' });
        let input;
        try {
          input = z
            .object({ requestId: z.uuid(), plan: contractPlan })
            .strict()
            .parse(
              JSON.parse(
                (await boundedTestBody(request, 49152)).toString('utf8'),
              ),
            );
        } catch {
          return reply(400, { error: 'Invalid bounded contract test plan' });
        }
        const previous = jobs.get(input.requestId);
        if (previous)
          return reply(
            previous.planSha256 === planHash(input.plan) ? 200 : 409,
            previous.planSha256 === planHash(input.plan)
              ? { id: previous.id, state: previous.state }
              : { error: 'Request identity already used for a different plan' },
          );
        if (otherBusy() || busy())
          return reply(409, {
            error: 'An isolated run is already active in this process',
          });
        const job: Job = {
          id: input.requestId,
          state: 'RUNNING',
          planSha256: planHash(input.plan),
        };
        jobs.set(job.id, job);
        if (jobs.size > 10) jobs.delete(jobs.keys().next().value!);
        void execute(input.plan)
          .then((value) => {
            const report = contractReport.parse(value);
            if (report.planSha256 !== job.planSha256)
              throw new Error('Plan mismatch');
            job.report = report;
            job.state = 'COMPLETED';
          })
          .catch(() => {
            job.state = 'ERROR';
            job.error =
              'Contract run did not produce verified evidence; inspect private diagnostics.';
          });
        return reply(202, { id: job.id, state: job.state });
      }
      if (request.method !== 'GET')
        return reply(405, { error: 'Unsupported method' });
      if (!url.search)
        return reply(200, { available: true, example: counterPlan });
      const parsed = z
        .object({ job: z.uuid(), format: z.literal('detail').optional() })
        .strict()
        .safeParse(Object.fromEntries(url.searchParams));
      if (
        !parsed.success ||
        url.searchParams.size !== Object.keys(parsed.data).length
      )
        return reply(400, { error: 'Invalid job query' });
      const job = jobs.get(parsed.data.job);
      if (!job)
        return reply(404, {
          error: 'Local job unavailable after restart or expiry',
        });
      if (parsed.data.format)
        return job.report
          ? reply(200, { report: job.report, kind: 'custom-contract' })
          : reply(409, { error: 'Report not ready' });
      return reply(200, {
        id: job.id,
        state: job.state,
        ...(job.report
          ? {
              result: job.report.result,
              runId: job.report.runId,
              completedChecks: job.report.steps.length,
            }
          : {}),
        ...(job.error ? { error: job.error } : {}),
      });
    },
  };
}
