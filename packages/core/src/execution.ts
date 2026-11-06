import { randomUUID } from 'node:crypto';
import { runScenario } from './scenario.js';
import type { RunReport, ScenarioId } from './scenario.js';
import { saveRun } from './report.js';

type Job = {
  id: string;
  scenarioId: ScenarioId;
  state: 'RUNNING' | 'COMPLETED' | 'ERROR';
  startedAt: string;
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
      };
      jobs.set(job.id, job);
      if (jobs.size > 10) jobs.delete(jobs.keys().next().value!);
      void (async () => {
        try {
          const report = await execute(scenarioId);
          if (report.scenarioId !== scenarioId)
            throw new Error('Scenario identity mismatch');
          await saveRun(root, report);
          job.runId = report.runId;
          job.result = report.result;
          job.state = 'COMPLETED';
        } catch {
          job.state = 'ERROR';
          job.error =
            'Run stopped before a valid report was saved. Check local prerequisites and private diagnostics; no recorded example was substituted.';
        } finally {
          active = false;
        }
      })();
      return { ...job };
    },
    get(id: string) {
      const job = jobs.get(id);
      return job ? { ...job } : null;
    },
  };
}
