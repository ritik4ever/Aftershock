import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { inspectTransaction } from './inspect.js';

export async function saveObservation(
  root: string,
  observation: Omit<Awaited<ReturnType<typeof inspectTransaction>>, 'runId'> & {
    runId: string;
  },
): Promise<string> {
  if (
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(observation.runId)
  ) {
    throw new Error('Invalid run ID');
  }
  const directory = resolve(root, 'reports');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (relative(await realpath(root), await realpath(directory)) !== 'reports') {
    throw new Error('Report directory must stay inside the workspace');
  }
  const destination = resolve(directory, `${observation.runId}.json`);
  await writeFile(destination, `${JSON.stringify(observation, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  return destination;
}
