import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const remoteScenario = z.enum([
  'keyed-replacement-ttl',
  'paymaster-solvency',
  'keyed-nonce-lifecycle',
]);
export const startRemoteJob = z
  .object({ scenarioId: remoteScenario, requestId: z.uuid() })
  .strict();
export function equalSecret(value: string, secret: string) {
  return timingSafeEqual(
    createHash('sha256').update(value).digest(),
    createHash('sha256').update(secret).digest(),
  );
}
