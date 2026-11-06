import { createHash } from 'node:crypto';
import { mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { runReport } from './scenario.js';
import type { RunReport } from './scenario.js';

async function directory(root: string, create = false) {
  const path = resolve(root, 'reports');
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  if (relative(await realpath(root), await realpath(path)) !== 'reports')
    throw new Error('Unsafe report directory');
  return path;
}
const digest = (report: RunReport) =>
  createHash('sha256').update(JSON.stringify(report)).digest('hex');

export async function saveRun(root: string, input: RunReport): Promise<string> {
  const report = runReport.parse(input);
  const body = `${JSON.stringify({ report, sha256: digest(report) }, null, 2)}\n`;
  if (Buffer.byteLength(body) > 1_048_576) throw new Error('Report too large');
  const path = resolve(
    await directory(root, true),
    `${report.runId}.scenario.json`,
  );
  await writeFile(path, body, { flag: 'wx', mode: 0o600 });
  return path;
}

export async function readRun(root: string, id: string): Promise<RunReport> {
  z.uuid().parse(id);
  const path = resolve(await directory(root), `${id}.scenario.json`);
  const real = await realpath(path);
  if (real !== path) throw new Error('Report file must not be a symlink');
  // Open without following a replaced leaf symlink. Nonblocking open lets us
  // reject FIFOs/devices rather than waiting for a writer before checking type.
  const file = await open(
    real,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  let text: string;
  try {
    const metadata = await file.stat();
    if (!metadata.isFile()) throw new Error('Report must be a regular file');
    if (metadata.size > 1_048_576) throw new Error('Report too large');
    // Bound allocation and reads even if the file grows after stat().
    const buffer = Buffer.alloc(1_048_577);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > 1_048_576) throw new Error('Report too large');
    text = buffer.toString('utf8', 0, length);
  } finally {
    await file.close();
  }
  const envelope = z
    .object({
      report: z.record(z.string(), z.unknown()),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict()
    .parse(JSON.parse(text));
  if (
    envelope.report.runId !== id ||
    createHash('sha256')
      .update(JSON.stringify(envelope.report))
      .digest('hex') !== envelope.sha256
  )
    throw new Error('Report integrity mismatch');
  return runReport.parse(envelope.report);
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
    `Started: ${report.startedAt}`,
    `Completed: ${report.completedAt}`,
    '',
    '## Expected invariant',
    '',
    escape(report.definition.expectedInvariant),
    '',
    `Source rule: ${escape(report.definition.sourceRule)}`,
    '',
    ...Object.entries(report.sourcePins).map(
      ([name, pin]) => `- ${name}: ${pin}`,
    ),
    '',
    '## Preconditions',
    '',
    ...report.definition.preconditions.map((item) => `- ${escape(item)}`),
    '',
    '## Observed environment',
    '',
    ...Object.entries(report.environment).map(
      ([key, value]) => `- ${escape(key)}: ${escape(value)}`,
    ),
    '',
    '## Evidence and actions',
    '',
    `RPC evidence: ${report.evidence ? `${report.evidence.entries.length} projected responses; ${report.evidence.complete ? 'recording complete' : 'recording incomplete'}; ${report.evidence.omitted} omitted; ${report.evidence.unavailable} unavailable` : 'not captured in this historical report'}`,
    report.evidence
      ? 'Projected receipts and lifecycle responses are available in the JSON export; this is not a full raw trace.'
      : 'No RPC journal was captured for this historical report.',
    '',
    '| Step | Result | Observed |',
    '| --- | --- | --- |',
    ...report.steps.map(
      (step) =>
        `| ${escape(step.id)} | ${step.result} | ${escape(JSON.stringify(step.observed))} |`,
    ),
    '',
    '## Limitations',
    '',
    ...report.limitations.map((item) => `- ${escape(item)}`),
    '',
    `Reproduce: ${escape(report.reproducer)}`,
    '',
  ].join('\n');
}
