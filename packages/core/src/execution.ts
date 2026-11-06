import { randomUUID } from 'node:crypto';
import { runScenario } from './scenario.js';
import type { RunReport, ScenarioId } from './scenario.js';
import { saveRun } from './report.js';
import { withExecutionProgress } from './progress.js';
import type { ExecutionProgress } from './progress.js';

type Job = {
  id: string;
  scenarioId: ScenarioId;
  state: 'RUNNING' | 'COMPLETED' | 'ERROR';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: ExecutionProgress[];
  completedChecks: number;
  guidance?: { code: string; message: string };
  runId?: string;
  result?: string;
  error?: string;
};

export function createExecutionJobs(
  root: string,
  execute: (scenario: ScenarioId) => Promise<RunReport> = (scenario) =>
    runScenario(scenario, root, 0, scenario !== 'keyed-replacement-ttl'),
) {
  const jobs = new Map<string, Job>();
  let active = false;
  return {
    start(scenarioId: ScenarioId) {
      if (active) return null;
      active = true;
      const job: Job = {
        id: randomUUID(),
        scenarioId,
        state: 'RUNNING',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: [],
        completedChecks: 0,
      };
      jobs.set(job.id, job);
      if (jobs.size > 10) jobs.delete(jobs.keys().next().value!);
      const recordProgress = (event: ExecutionProgress) => {
        job.progress.push({ ...event });
        if (job.progress.length > 64) job.progress.shift();
        if (event.result) job.completedChecks++;
        job.updatedAt = event.at;
      };
      void (async () => {
        try {
          const report = await withExecutionProgress(recordProgress, () =>
            execute(scenarioId),
          );
          if (report.scenarioId !== scenarioId)
            throw new Error('Scenario identity mismatch');
          recordProgress({
            at: new Date().toISOString(),
            phase: 'REPORT',
            label: 'saving-validated-report',
          });
          await saveRun(root, report);
          job.runId = report.runId;
          job.result = report.result;
          job.state = 'COMPLETED';
          if (
            report.steps.some(
              (step) => step.id === 'fixture-cleanup' && step.result !== 'PASS',
            )
          )
            job.guidance = {
              code: 'CLEANUP_REQUIRED',
              message:
                'Cleanup was not verified. Inspect the report and only resources with its exact run label; do not prune unrelated Docker resources.',
            };
          else if (report.result === 'FAIL')
            job.guidance = {
              code: 'INVARIANT_FAILURE',
              message:
                'Review the failed assertion and its observations. This verdict is not automatically an exploitable vulnerability.',
            };
          else if (report.steps.some((step) => step.result === 'BLOCKED'))
            job.guidance = {
              code: 'PREREQUISITE_BLOCKED',
              message:
                'Review the blocked step and run doctor --local from the Linux checkout. Private diagnostics stay under .local/<run-id>/.',
            };
          else if (report.result !== 'PASS')
            job.guidance = {
              code: 'EVIDENCE_REVIEW',
              message:
                'Review evidence gaps and source compatibility in the report. Missing evidence cannot establish a pass.',
            };
        } catch {
          job.state = 'ERROR';
          job.error =
            'Run stopped before a valid report was saved. Check local prerequisites and private diagnostics; no recorded example was substituted.';
          job.guidance = {
            code: 'REPORT_UNAVAILABLE',
            message:
              'Run doctor --local and check local storage permissions and private diagnostics. Do not infer a result or verified cleanup from this error.',
          };
        } finally {
          job.completedAt = new Date().toISOString();
          job.updatedAt = job.completedAt;
          active = false;
        }
      })();
      return structuredClone(job);
    },
    get(id: string) {
      const job = jobs.get(id);
      return job ? structuredClone(job) : null;
    },
    current() {
      const job = [...jobs.values()].find((job) => job.state === 'RUNNING');
      return job ? structuredClone(job) : null;
    },
  };
}
