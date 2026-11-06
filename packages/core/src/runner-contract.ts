import { z } from 'zod';
import { contractPlan } from './contract-plan.js';

export const remoteScenario = z.enum([
  'keyed-replacement-ttl',
  'paymaster-solvency',
  'keyed-nonce-lifecycle',
  'custom-contract',
]);
export const startRemoteJob = z.union([
  z
    .object({
      scenarioId: remoteScenario.exclude(['custom-contract']),
      requestId: z.uuid(),
    })
    .strict(),
  z
    .object({
      scenarioId: z.literal('custom-contract'),
      requestId: z.uuid(),
      plan: contractPlan,
    })
    .strict(),
]);
