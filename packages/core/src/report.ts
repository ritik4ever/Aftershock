import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { runReport } from './scenario.js';
import type { RunReport } from './scenario.js';

async function directory(root: string) {
  const path = resolve(root, 'reports');
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (relative(await realpath(root), await realpath(path)) !== 'reports')
    throw new Error('Unsafe report directory');
  return path;
}
const digest = (report: RunReport) =>
  createHash('sha256').update(JSON.stringify(report)).digest('hex');

export async function saveRun(root: string, input: RunReport): Promise<string> {
  const report = runReport.parse(input);
  const path = resolve(await directory(root), `${report.runId}.scenario.json`);
  await writeFile(
    path,
    `${JSON.stringify({ report, sha256: digest(report) }, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  return path;
}

export async function readRun(root: string, id: string): Promise<RunReport> {
  z.uuid().parse(id);
  const path = resolve(await directory(root), `${id}.scenario.json`);
  const real = await realpath(path);
  if (real !== path) throw new Error('Report file must not be a symlink');
  if ((await stat(real)).size > 1_048_576) throw new Error('Report too large');
  const text = await readFile(real, 'utf8');
  if (Buffer.byteLength(text) > 1_048_576) throw new Error('Report too large');
  const envelope = z
    .object({ report: runReport, sha256: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(JSON.parse(text));
  if (
    envelope.report.runId !== id ||
    digest(envelope.report) !== envelope.sha256
  )
    throw new Error('Report integrity mismatch');
  return envelope.report;
}

export function markdownReport(report: RunReport): string {
  const escape = (value: string) =>
    value
      .replace(/[\r\n|]/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/([\\`*_[\]])/g, '\\$1');
  return [
    `# Aftershock: ${report.scenarioId}`,
    '',
    `Result: ${report.result}`,
    `Environment: ${report.endpointClass}`,
    `Run: ${report.runId}`,
    '',
    '| Step | Result | Observed |',
    '| --- | --- | --- |',
    ...report.steps.map(
      (step) =>
        `| ${escape(step.id)} | ${step.result} | ${escape(JSON.stringify(step.observed))} |`,
    ),
    '',
    ...report.limitations.map((item) => `- ${escape(item)}`),
    '',
    `Reproduce: ${escape(report.reproducer)}`,
    '',
  ].join('\n');
}
