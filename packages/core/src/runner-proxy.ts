import { z } from 'zod';
import { startRemoteJob, remoteScenario } from './runner-contract.js';
import { runReport } from './scenario.js';
import { markdownReport } from './report.js';
import { checkEvidence } from './evidence-check.js';
import { readRunnerArtifact } from './runner-artifact.js';
import { contractReport, planHash, counterPlan } from './contract-plan.js';

const repository = 'ritik4ever/Aftershock';
const workflow = 'scenario-run.yml';
const base = `https://api.github.com/repos/${repository}`;
const runSchema = z.object({
  id: z.number().int().positive().safe(),
  path: z.literal(`.github/workflows/${workflow}`),
  event: z.literal('workflow_dispatch'),
  head_branch: z.literal('main'),
  head_sha: z.string().regex(/^[a-f0-9]{40}$/),
  display_title: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  created_at: z.iso.datetime(),
  run_started_at: z.iso.datetime().nullable(),
});
export type RunnerConfig = { token: string };

export function createRunnerProxy(
  config?: RunnerConfig,
  transport: typeof fetch = fetch,
) {
  if (config && !config.token) throw new Error('Invalid runner credentials');
  return async (request: Request): Promise<Response> => {
    const json = (status: number, data: unknown) =>
      Response.json(data, {
        status,
        headers: {
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    const url = new URL(request.url);
    if (
      (request.headers.has('origin') &&
        request.headers.get('origin') !== url.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return json(403, { error: 'Same-origin requests only' });
    if (url.pathname !== '/api/runner')
      return json(404, { error: 'Route unavailable' });
    if (!['GET', 'POST'].includes(request.method))
      return json(405, { error: 'Method unavailable' });
    if (!config)
      return request.method === 'GET' && !url.search
        ? json(200, { available: false })
        : json(503, { error: 'GitHub execution is not configured' });
    const signal = AbortSignal.timeout(16_000);
    const github = async (path: string, body?: unknown) => {
      const response = await transport(`${base}${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal,
        headers: {
          authorization: `Bearer ${config.token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2026-03-10',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error('GitHub operation unavailable');
      return JSON.parse(
        (await bounded(response, 2_097_152)).toString('utf8'),
      ) as unknown;
    };
    try {
      if (request.method === 'GET' && !url.search)
        return json(200, {
          available: true,
          provider: 'GITHUB_ACTIONS',
          scenarios: remoteScenario.options.filter(
            (id) => id !== 'custom-contract',
          ),
          contractPlans: true,
          contractExample: counterPlan,
        });
      if (request.method === 'POST') {
        if (
          url.search ||
          request.headers.get('content-type')?.split(';')[0] !==
            'application/json'
        )
          return json(400, { error: 'JSON scenario request required' });
        let input;
        try {
          input = startRemoteJob.parse(
            JSON.parse((await bounded(request, 50000)).toString('utf8')),
          );
        } catch {
          return json(400, { error: 'Invalid or oversized scenario request' });
        }
        const recent = z
          .object({ workflow_runs: z.array(runSchema) })
          .parse(
            await github(
              `/actions/workflows/${workflow}/runs?event=workflow_dispatch&branch=main&per_page=20`,
            ),
          ).workflow_runs;
        const title = `Aftershock:${input.scenarioId}:${input.requestId}${input.scenarioId === 'custom-contract' ? ':' + planHash(input.plan) : ''}`;
        const previous = recent.find((run) => run.display_title === title);
        if (previous)
          return json(200, {
            id: String(previous.id),
            state: 'RUNNING',
            provider: 'GITHUB_ACTIONS',
          });
        const active = recent.find((run) => run.status !== 'completed');
        if (active)
          return json(409, {
            error:
              'Shared runner is busy. Your test was not started. Follow the active workflow, then try again after it finishes.',
            activeRun: {
              id: String(active.id),
              state: 'RUNNING',
              workflowUrl: `https://github.com/${repository}/actions/runs/${active.id}`,
            },
          });
        if (
          recent.filter(
            (run) => Date.parse(run.created_at) >= Date.now() - 3_600_000,
          ).length >= 4
        )
          return json(429, {
            error: 'Demo limit reached: four remote runs per hour.',
          });
        const dispatch = z
          .object({ workflow_run_id: z.number().int().positive().safe() })
          .parse(
            await github(`/actions/workflows/${workflow}/dispatches`, {
              ref: 'main',
              inputs: {
                scenario: input.scenarioId,
                request_id: input.requestId,
                ...(input.scenarioId === 'custom-contract'
                  ? {
                      plan: JSON.stringify(input.plan),
                      plan_sha256: planHash(input.plan),
                    }
                  : {}),
              },
            }),
          );
        return json(202, {
          id: String(dispatch.workflow_run_id),
          state: 'RUNNING',
          provider: 'GITHUB_ACTIONS',
        });
      }
      const input = z
        .object({
          job: z.string().regex(/^[1-9][0-9]{0,15}$/),
          format: z.enum(['detail', 'report', 'md', 'evidence']).optional(),
        })
        .strict()
        .safeParse(Object.fromEntries(url.searchParams));
      if (
        !input.success ||
        url.searchParams.size !== Object.keys(input.data).length
      )
        return json(400, { error: 'Invalid job request' });
      const run = runSchema.parse(
        await github(`/actions/runs/${input.data.job}`),
      );
      if (String(run.id) !== input.data.job)
        throw new Error('Run identity mismatch');
      const title =
        /^Aftershock:(paymaster-solvency|keyed-nonce-lifecycle|keyed-replacement-ttl|custom-contract):([a-f0-9-]{36})(?::([a-f0-9]{64}))?$/i.exec(
          run.display_title,
        );
      if (
        !title ||
        !z.uuid().safeParse(title[2]).success ||
        (title[1] === 'custom-contract') !== Boolean(title[3])
      )
        throw new Error('Unexpected workflow identity');
      const job = {
        id: String(run.id),
        provider: 'GITHUB_ACTIONS',
        startedAt: run.run_started_at ?? run.created_at,
        updatedAt: run.created_at,
        completedChecks: 0,
        progress: [
          {
            at: run.created_at,
            phase: 'SETUP',
            label:
              run.status === 'queued'
                ? 'github-run-queued'
                : 'github-workflow-running',
          },
        ],
        workflowUrl: `https://github.com/${repository}/actions/runs/${run.id}`,
      };
      if (run.status !== 'completed')
        return input.data.format
          ? json(409, { error: 'Report is not ready' })
          : json(200, { ...job, state: 'RUNNING' });
      if (!['success', 'failure'].includes(run.conclusion ?? ''))
        return json(200, {
          ...job,
          state: 'ERROR',
          error:
            'Workflow stopped without a verified report. Check its GitHub run.',
          guidance: {
            code: 'WORKFLOW_STOPPED',
            message:
              'No result or cleanup success is inferred from a cancelled or timed-out workflow.',
          },
        });
      const artifacts = z
        .object({
          artifacts: z.array(
            z.object({
              id: z.number().int().positive().safe(),
              name: z.string(),
              expired: z.boolean(),
              digest: z.string().nullable(),
              size_in_bytes: z.number().int().nonnegative(),
            }),
          ),
        })
        .parse(
          await github(`/actions/runs/${run.id}/artifacts?per_page=10`),
        ).artifacts;
      const artifact = artifacts.find(
        (item) => item.name === 'aftershock-result' && !item.expired,
      );
      if (!artifact || artifact.size_in_bytes > 2_097_152 || !artifact.digest)
        return json(200, {
          ...job,
          state: 'ERROR',
          error:
            'No verified report artifact is available. Setup may have failed or the artifact expired.',
        });
      const redirect = await transport(
        `${base}/actions/artifacts/${artifact.id}/zip`,
        {
          redirect: 'manual',
          signal,
          headers: {
            authorization: `Bearer ${config.token}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2026-03-10',
          },
        },
      );
      const location = new URL(
        redirect.headers.get('location') ?? 'https://invalid.example',
      );
      if (
        redirect.status !== 302 ||
        location.protocol !== 'https:' ||
        location.username ||
        location.password ||
        !(
          location.hostname.endsWith('.blob.core.windows.net') ||
          location.hostname.endsWith('.actions.githubusercontent.com')
        )
      )
        throw new Error('Invalid artifact location');
      const archive = await transport(location.href, {
        redirect: 'error',
        signal,
      });
      if (!archive.ok) throw new Error('Artifact unavailable');
      const result = z
        .object({
          requestId: z.uuid(),
          scenarioId: remoteScenario,
          sourceCommit: z.string(),
          report: z.union([runReport, contractReport]),
        })
        .strict()
        .parse(
          readRunnerArtifact(
            await bounded(archive, 2_097_152),
            artifact.digest,
          ),
        );
      if (
        result.requestId !== title[2] ||
        result.scenarioId !== title[1] ||
        result.sourceCommit !== run.head_sha ||
        result.report.scenarioId !== result.scenarioId ||
        result.report.endpointClass !== 'ISOLATED_LOCAL'
      )
        throw new Error('Report provenance mismatch');
      const report = result.report;
      if (report.scenarioId === 'custom-contract') {
        if (report.planSha256 !== title[3])
          throw new Error('Custom plan provenance mismatch');
        if (input.data.format === 'md')
          return new Response(
            `# ${report.plan.name}\n\nResult: ${report.result}\n\nPlan SHA-256: ${report.planSha256}\n\n${report.steps.map((s) => `- ${s.id}: ${s.result}`).join('\n')}\n`,
            {
              headers: {
                'content-type': 'text/markdown; charset=utf-8',
                'cache-control': 'no-store',
              },
            },
          );
        if (input.data.format)
          return json(
            200,
            input.data.format === 'detail'
              ? { report, kind: 'custom-contract' }
              : report,
          );
        return json(200, {
          ...job,
          state: 'COMPLETED',
          kind: 'custom-contract',
          runId: report.runId,
          result: report.result,
          completedChecks: report.steps.length,
          updatedAt: report.completedAt,
          progress: report.steps.slice(-8).map((s) => ({
            at: s.at,
            phase: s.id === 'fixture-cleanup' ? 'CLEANUP' : 'EXECUTING',
            label: s.id,
            result: s.result,
          })),
        });
      }
      if (input.data.format === 'md')
        return new Response(markdownReport(report), {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      if (input.data.format === 'report') return json(200, report);
      if (input.data.format === 'evidence')
        return json(200, {
          runId: report.runId,
          evidence: report.evidence ?? null,
        });
      if (input.data.format === 'detail')
        return json(200, { report, checks: checkEvidence(report) });
      return json(200, {
        ...job,
        state: 'COMPLETED',
        runId: report.runId,
        result: report.result,
        completedChecks: report.steps.length,
        updatedAt: report.completedAt,
        progress: report.steps.slice(-8).map((step) => ({
          at: step.at,
          phase: step.id === 'fixture-cleanup' ? 'CLEANUP' : 'EXECUTING',
          label: step.id,
          result: step.result,
        })),
      });
    } catch {
      return json(502, {
        error:
          'GitHub execution or report verification unavailable. No recorded example was substituted.',
      });
    }
  };
}

async function bounded(input: Request | Response, maximum: number) {
  if (!input.body) throw new Error('Missing body');
  const reader = input.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Body timed out')), 16_000);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), expired]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error('Body too large');
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    await reader.cancel();
    reader.releaseLock();
  }
}
