import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  hash,
  quantity,
  receipt,
  explorerInfo,
  explorerTransaction,
  transactionStatus,
} from './schema.js';

export const rpcMethod = z.enum([
  'eth_chainId',
  'web3_clientVersion',
  'eth_getBalance',
  'eth_getBlockByNumber',
  'eth_getTransactionCount',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
  'eth_sendFrameTransaction',
  'eth_getFrameTransactionByHash',
  'eth_getFrameTransactionReceipt',
  'ethrex_simulateFrameTransaction',
  'skandha_explorer_info',
  'skandha_explorer_getTransaction',
  'skandha_config',
  'skandha_frameTransactionStatus',
]);
export type RpcMethod = z.infer<typeof rpcMethod>;
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const entryMetadata = z.object({
  txHash: hash,
  submittedTime: quantity.optional(),
  lastUpdatedTime: quantity.optional(),
});
const explorerProjection = z.object({
  hash,
  admission: z
    .object({
      txHash: hash,
      outcome: z.enum([
        'accepted',
        'rejected',
        'included',
        'replaced',
        'dropped',
      ]),
      at: integer,
      sender: z.string().regex(/^0x[0-9a-f]{40}$/i),
      nonce: quantity,
      nonceKeys: z.array(quantity).min(1).max(16),
      frames: integer,
      checks: z
        .array(
          z.object({
            rule: z.string().regex(/^[a-z0-9-]{1,64}$/i),
            verdict: z.enum(['pass', 'fail', 'skipped']),
            frameIndex: integer.optional(),
            entity: z.enum(['sender', 'payer', 'factory']).optional(),
            waived: z.boolean(),
          }),
        )
        .max(1024),
    })
    .nullable(),
  events: explorerTransaction.shape.events,
});
const projections = {
  eth_chainId: quantity,
  web3_clientVersion: z
    .string()
    .max(256)
    .regex(/^[a-z0-9/._+:-]+$/i),
  eth_getBalance: quantity,
  eth_getBlockByNumber: z
    .object({ number: quantity, timestamp: quantity, hash })
    .nullable(),
  eth_getTransactionCount: quantity,
  eth_sendRawTransaction: hash,
  eth_getTransactionReceipt: z
    .object({
      transactionHash: hash,
      status: z.enum(['0x0', '0x1']),
      blockNumber: quantity,
      gasUsed: quantity,
    })
    .nullable(),
  eth_sendFrameTransaction: hash,
  eth_getFrameTransactionByHash: entryMetadata
    .extend({ balanceEnforcement: z.boolean() })
    .nullable(),
  eth_getFrameTransactionReceipt: receipt.nullable(),
  ethrex_simulateFrameTransaction: z.object({
    maxCost: z.union([quantity, z.string().max(78).regex(/^\d+$/)]),
  }),
  skandha_explorer_info: explorerInfo,
  skandha_explorer_getTransaction: explorerProjection,
  skandha_config: z.object({ useropsTTL: integer }),
  skandha_frameTransactionStatus: transactionStatus,
} satisfies Record<RpcMethod, z.ZodType>;

const reason = z.enum([
  'BALANCE_OBLIGATIONS',
  'KEY_CONFLICT',
  'FEE_BUMP',
  'DUPLICATE',
  'RECEIPT_UNAVAILABLE',
  'NONCE_MISMATCH',
  'OTHER',
  'TRANSPORT_OR_SCHEMA',
  'PROJECTION_INVALID',
]);
export const rpcEvidenceEntry = z
  .object({
    seq: integer.positive(),
    at: z.iso.datetime(),
    channel: z.enum(['SIDECAR', 'EXECUTION']),
    purpose: z.enum(['READINESS', 'SCENARIO']),
    method: rpcMethod,
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    requestHash: hash.optional(),
    outcome: z.enum(['RESULT', 'RPC_ERROR', 'UNAVAILABLE']),
    result: z.unknown().optional(),
    code: z.number().int().optional(),
    reason: reason.optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const invalid = () =>
      context.addIssue({
        code: 'custom',
        message: 'Invalid or unredacted RPC evidence',
      });
    if (entry.purpose === 'READINESS' && entry.method !== 'eth_chainId')
      invalid();
    if (entry.outcome === 'RESULT') {
      const value = entry.result as Record<string, unknown> | null;
      const referenceField =
        entry.method === 'skandha_explorer_getTransaction'
          ? 'hash'
          : entry.method === 'eth_getFrameTransactionByHash'
            ? 'txHash'
            : entry.method === 'eth_getTransactionReceipt'
              ? 'transactionHash'
              : undefined;
      if (
        referenceField &&
        (!entry.requestHash ||
          (value !== null &&
            String(value?.[referenceField]).toLowerCase() !==
              entry.requestHash.toLowerCase()))
      )
        invalid();

      const parsed = projections[entry.method].safeParse(entry.result);
      if (
        !parsed.success ||
        !isDeepStrictEqual(parsed.data, entry.result) ||
        entry.code !== undefined ||
        entry.reason !== undefined
      )
        invalid();
    } else if (
      Object.hasOwn(entry, 'result') ||
      !entry.reason ||
      (entry.outcome === 'RPC_ERROR'
        ? entry.code === undefined
        : entry.code !== undefined)
    )
      invalid();
  });
function recordingComplete(
  entries: z.infer<typeof rpcEvidenceEntry>[],
  omitted: number,
) {
  return (
    omitted === 0 &&
    !entries.some(
      (entry) =>
        entry.outcome === 'UNAVAILABLE' &&
        (entry.purpose !== 'READINESS' ||
          entry.reason === 'PROJECTION_INVALID' ||
          !entries.some(
            (later) =>
              later.seq > entry.seq &&
              later.purpose === 'READINESS' &&
              later.channel === entry.channel &&
              later.outcome === 'RESULT' &&
              later.result === '0x9',
          )),
    )
  );
}
export const rpcEvidence = z
  .object({
    format: z.literal('ALLOWLISTED_RPC_PROJECTIONS_V1'),
    attempts: integer,
    omitted: integer,
    unavailable: integer,
    complete: z.boolean(),
    entries: z.array(rpcEvidenceEntry).max(256),
  })
  .strict()
  .superRefine((journal, context) => {
    if (
      journal.attempts !== journal.entries.length + journal.omitted ||
      journal.unavailable !==
        journal.entries.filter((entry) => entry.outcome === 'UNAVAILABLE')
          .length ||
      journal.complete !==
        recordingComplete(journal.entries, journal.omitted) ||
      journal.entries.some((entry, index) => entry.seq !== index + 1) ||
      Buffer.byteLength(JSON.stringify(journal.entries)) > 65_536
    )
      context.addIssue({
        code: 'custom',
        message: 'Inconsistent RPC evidence journal',
      });
  });
type Journal = z.infer<typeof rpcEvidence>;
const scope = new AsyncLocalStorage<{ journal: Journal; bytes: number }>();
export function withRpcEvidence<T>(action: () => Promise<T>): Promise<T> {
  return scope.run(
    {
      journal: {
        format: 'ALLOWLISTED_RPC_PROJECTIONS_V1',
        attempts: 0,
        omitted: 0,
        unavailable: 0,
        complete: true,
        entries: [],
      },
      bytes: 2,
    },
    action,
  );
}
export const evidencePosition = () => scope.getStore()?.journal.attempts ?? 0;
export function evidenceSnapshot(): Journal | undefined {
  const current = scope.getStore();
  return current ? structuredClone(current.journal) : undefined;
}

export function recordRpc(
  method: RpcMethod,
  channel: 'SIDECAR' | 'EXECUTION',
  params: unknown[],
  response: { result: unknown } | { code?: number; reason: string },
  purpose: 'READINESS' | 'SCENARIO' = 'SCENARIO',
) {
  const state = scope.getStore();
  if (!state) return;
  const journal = state.journal;
  journal.attempts++;
  const reference = [
    'eth_getFrameTransactionByHash',
    'eth_getFrameTransactionReceipt',
    'eth_getTransactionReceipt',
    'skandha_explorer_getTransaction',
    'skandha_frameTransactionStatus',
  ].includes(method)
    ? hash.safeParse(params[0])
    : undefined;
  const base = {
    seq: journal.attempts,
    at: new Date().toISOString(),
    method,
    channel,
    purpose,
    requestSha256: createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex'),
    ...(reference?.success ? { requestHash: reference.data } : {}),
  };
  let entry: z.infer<typeof rpcEvidenceEntry>;
  if ('result' in response) {
    try {
      let value = response.result;
      if (method === 'skandha_explorer_getTransaction')
        value = explorerTransaction.parse(value);
      if (method === 'eth_getFrameTransactionByHash' && value !== null) {
        const input = entryMetadata
          .extend({ revertReason: z.string().optional() })
          .parse(value);
        const { revertReason, ...metadata } = input;
        value = {
          ...metadata,
          balanceEnforcement:
            /can no longer cover its pending frame transactions as of block/.test(
              revertReason ?? '',
            ),
        };
      }
      entry = {
        ...base,
        outcome: 'RESULT',
        result: projections[method].parse(value),
      };
    } catch {
      entry = { ...base, outcome: 'UNAVAILABLE', reason: 'PROJECTION_INVALID' };
    }
  } else {
    entry =
      response.code === undefined
        ? { ...base, outcome: 'UNAVAILABLE', reason: 'TRANSPORT_OR_SCHEMA' }
        : {
            ...base,
            outcome: 'RPC_ERROR',
            code: response.code,
            reason: reason.parse(response.reason),
          };
  }
  if (!rpcEvidenceEntry.safeParse(entry).success)
    entry = { ...base, outcome: 'UNAVAILABLE', reason: 'PROJECTION_INVALID' };
  const size =
    Buffer.byteLength(JSON.stringify(entry)) + (journal.entries.length ? 1 : 0);
  if (
    journal.omitted ||
    journal.entries.length >= 256 ||
    state.bytes + size > 65_536
  ) {
    journal.omitted++;
  } else {
    journal.entries.push(entry);
    state.bytes += size;
    if (entry.outcome === 'UNAVAILABLE') journal.unavailable++;
  }
  journal.complete = recordingComplete(journal.entries, journal.omitted);
}
