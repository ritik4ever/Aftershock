import { z } from 'zod';

export const remoteScenario = z.enum([
  'keyed-replacement-ttl',
  'paymaster-solvency',
  'keyed-nonce-lifecycle',
]);
export const startRemoteJob = z
  .object({ scenarioId: remoteScenario, requestId: z.uuid() })
  .strict();
