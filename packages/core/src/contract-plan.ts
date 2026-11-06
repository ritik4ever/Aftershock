import { createHash } from 'node:crypto';
import { z } from 'zod';
import { quantity, hash } from './schema.js';
import { UPSTREAM } from './inspect.js';

const data = z.string().regex(/^0x(?:[a-f0-9]{2})*$/i);
const amount = quantity.refine((v) => BigInt(v) <= 50_000_000_000_000_000n);
const gasLimit = quantity.refine((v) => BigInt(v) <= 1_500_000n);
export const plannedFrame = z
  .object({
    mode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    flags: z.number().int().min(0).max(7),
    target: z.union([
      z.enum(['sender', 'contract', 'owner']),
      z.string().regex(/^0x[a-f0-9]{40}$/i),
    ]),
    execution: gasLimit,
    state: gasLimit.default('0x0'),
    value: amount.default('0x0'),
    data: data.max(4098).default('0x'),
  })
  .strict();
const action = z
  .object({
    kind: z.enum(['call', 'transaction', 'frame']),
    data: data.max(4098).default('0x'),
    value: amount.default('0x0'),
    gas: quantity
      .default('0xf4240')
      .refine((v) => BigInt(v) >= 21000n && BigInt(v) <= 1_500_000n),
    expect: z.enum(['success', 'revert']).default('success'),
    expectedReturn: data.max(8194).optional(),
    storage: z.object({ slot: hash, value: hash }).strict().optional(),
    frameSender: z.enum(['account', 'contract']).default('account'),
    verifyData: data.max(4098).default('0x'),
    nonceKeys: z.array(quantity).min(1).max(8).default(['0x0']),
    nonceSeq: quantity.optional(),
    rejectCode: z
      .number()
      .int()
      .refine((v) => [-32500, -32502, -32602].includes(v))
      .optional(),
    frames: z.array(plannedFrame).min(1).max(8).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (v.kind !== 'call' && v.expectedReturn !== undefined)
      fail('Return-data assertions require a call step');
    if (v.expect === 'revert' && v.expectedReturn !== undefined)
      fail('Return-data assertions require a successful call expectation');
    if (v.frames && v.kind !== 'frame')
      fail('Frame definitions require a Frame Transaction step');
    if (
      v.frames &&
      v.frames.reduce(
        (sum, f) => sum + BigInt(f.execution) + BigInt(f.state),
        0n,
      ) > 5_000_000n
    )
      fail('Frame transaction gas exceeds 5 million');
    if (v.rejectCode !== undefined && v.kind !== 'frame')
      fail('Admission rejection requires a Frame Transaction');
    if (
      v.kind === 'frame' &&
      v.expect === 'revert' &&
      v.rejectCode !== undefined
    )
      fail(
        'Admission rejection and execution revert are separate expectations',
      );
    if (
      v.kind === 'frame' &&
      (v.nonceKeys.length !== 1 || BigInt(v.nonceKeys[0]!) !== 0n) &&
      v.nonceSeq === undefined
    )
      fail('Nonlinear nonce keys need an explicit sequence');
  });
export const contractPlan = z
  .object({
    name: z.string().regex(/^[a-z0-9 ._-]{1,64}$/i),
    initCode: data.min(4).max(32770),
    appendOwner: z.boolean().default(false),
    deploymentValue: amount.default('0x0'),
    steps: z.array(action).min(1).max(8),
  })
  .strict()
  .refine(
    (v) => Buffer.byteLength(JSON.stringify(v)) <= 48000,
    'Plan exceeds 48 KB',
  );
export type ContractPlan = z.infer<typeof contractPlan>;
export const planHash = (plan: ContractPlan) =>
  createHash('sha256')
    .update(JSON.stringify(contractPlan.parse(plan)))
    .digest('hex');
const stepResult = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/),
    at: z.iso.datetime(),
    result: z.enum(['PASS', 'FAIL', 'BLOCKED']),
    observed: z.record(z.string(), z.unknown()),
  })
  .strict();
export const contractReport = z
  .object({
    schemaVersion: z.literal(1),
    scenarioId: z.literal('custom-contract'),
    runId: z.uuid(),
    endpointClass: z.literal('ISOLATED_LOCAL'),
    plan: contractPlan,
    planSha256: z.string().regex(/^[a-f0-9]{64}$/),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    sourcePins: z
      .object({
        workshop: z.literal(UPSTREAM.workshop),
        sidecar: z.literal(UPSTREAM.sidecar),
        ethrex: z.literal(UPSTREAM.ethrex),
      })
      .strict(),
    environment: z.record(z.string(), z.string()),
    steps: z.array(stepResult).min(1).max(20),
    result: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  })
  .strict()
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (v.planSha256 !== planHash(v.plan)) fail('Plan identity mismatch');
    const aggregate = v.steps.some((s) => s.result === 'FAIL')
      ? 'FAIL'
      : v.steps.some((s) => s.result === 'BLOCKED')
        ? 'BLOCKED'
        : 'PASS';
    if (v.result !== aggregate) fail('Invalid aggregate');
    const ids = v.steps.map((s) => s.id);
    if (new Set(ids).size !== ids.length) fail('Duplicate step IDs');
    if (
      v.result === 'PASS' &&
      (v.steps.length !== v.plan.steps.length + 3 ||
        ids[0] !== 'mining-ready' ||
        ids[1] !== 'deploy-contract' ||
        ids.at(-1) !== 'fixture-cleanup' ||
        !v.plan.steps.every((_, i) => ids[i + 2] === `action-${i + 1}`))
    )
      fail('Passing report lacks required observations');
    for (const step of v.steps.filter((s) => s.result === 'PASS')) {
      const obs = step.observed;
      if (
        step.id === 'mining-ready' &&
        !z
          .object({ number: quantity, timestamp: quantity, hash })
          .safeParse(obs).success
      )
        fail('Mining evidence missing');
      if (step.id === 'fixture-cleanup' && obs.removedOwnedResources !== true)
        fail('Cleanup evidence missing');
      if (
        step.id === 'deploy-contract' &&
        !z
          .object({
            address: z.string().regex(/^0x[a-f0-9]{40}$/i),
            runtimeHash: hash,
            runtimeBytes: z.number().int().positive(),
            receipt: z.object({
              transactionHash: hash,
              status: z.literal('0x1'),
              blockNumber: quantity,
            }),
          })
          .safeParse(obs).success
      )
        fail('Deployment evidence missing');
      const match = /^action-([1-8])$/.exec(step.id);
      if (!match) continue;
      const action = v.plan.steps[Number(match[1]) - 1];
      if (!action || obs.kind !== action.kind) {
        fail('Action identity mismatch');
        continue;
      }
      if (
        action.kind === 'call' &&
        (action.expect === 'revert'
          ? obs.rpcCode !== 3
          : !data.safeParse(obs.returned).success ||
            (action.expectedReturn !== undefined &&
              String(obs.returned).toLowerCase() !==
                action.expectedReturn.toLowerCase()))
      )
        fail('Call observation does not establish its expectation');
      if (
        action.kind === 'transaction' &&
        !z
          .object({
            transactionHash: hash,
            blockNumber: quantity,
            status: z.literal(action.expect === 'success' ? '0x1' : '0x0'),
          })
          .safeParse(obs.receipt).success
      )
        fail('Transaction receipt evidence missing');
      if (action.kind === 'frame') {
        if (action.rejectCode !== undefined) {
          if (obs.admitted === true || obs.rpcCode !== action.rejectCode)
            fail('Admission rejection evidence missing');
        } else {
          const receipt = z
            .object({
              blockNumber: quantity,
              status: z.enum(['success', 'reverted']),
              frameReceipts: z.array(
                z.object({
                  status: z.enum(['success', 'reverted', 'skipped']),
                }),
              ),
            })
            .safeParse(obs.receipt);
          const admission = z
            .object({ txHash: hash, outcome: z.literal('included') })
            .safeParse(obs.admission);
          if (
            obs.admitted !== true ||
            !hash.safeParse(obs.hash).success ||
            !admission.success ||
            String(obs.hash).toLowerCase() !==
              admission.data.txHash.toLowerCase() ||
            !receipt.success ||
            receipt.data.frameReceipts.length !==
              (action.frames?.length ?? 2) ||
            (action.expect === 'success'
              ? receipt.data.status !== 'success' ||
                receipt.data.frameReceipts.some((f) => f.status !== 'success')
              : receipt.data.status !== 'reverted' &&
                !receipt.data.frameReceipts.some(
                  (f) => f.status === 'reverted',
                ))
          )
            fail('Frame admission/execution evidence missing');
        }
      }
      if (action.storage) {
        const stored = z
          .object({ slot: hash, expected: hash, actual: hash })
          .safeParse(obs.storage);
        if (
          !stored.success ||
          stored.data.slot.toLowerCase() !==
            action.storage.slot.toLowerCase() ||
          stored.data.actual.toLowerCase() !==
            action.storage.value.toLowerCase() ||
          stored.data.expected.toLowerCase() !==
            action.storage.value.toLowerCase()
        )
          fail('Storage assertion evidence missing');
      }
    }
  });
export type ContractReport = z.infer<typeof contractReport>;

export const counterPlan: ContractPlan = contractPlan.parse({
  name: 'Counter mined frame write and read assertion',
  initCode:
    '0x6018600c60003960186000f33615600c57600035600055005b60005460005260206000f3',
  steps: [
    {
      kind: 'frame',
      data: `0x${'0'.repeat(63)}7`,
      storage: { slot: `0x${'0'.repeat(64)}`, value: `0x${'0'.repeat(63)}7` },
    },
    { kind: 'call', expectedReturn: `0x${'0'.repeat(63)}7` },
  ],
});
