import { z } from 'zod';

export const quantity = z
  .string()
  .max(66)
  .regex(/^0x(?:0|[1-9a-f][0-9a-f]*)$/i);
export const hash = z.string().regex(/^0x[0-9a-f]{64}$/i);
const address = z.string().regex(/^0x[0-9a-f]{40}$/i);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const token = z.string().regex(/^[a-z0-9-]{1,64}$/i);
export const statusName = z.enum([
  'New',
  'Pending',
  'Submitted',
  'OnChain',
  'Finalized',
  'Cancelled',
  'Reverted',
]);
export const explorerInfo = z
  .object({
    protocolVersion: z.literal(1),
    chainId: integer,
    version: z.string().regex(/^v?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i),
    commit: z.string().regex(/^(?:[a-f0-9]{7,40})?$/i),
    bundlingMode: z.enum(['auto', 'manual']),
    p2pEnabled: z.boolean(),
    oldestSeq: integer,
    latestSeq: integer,
    historyCapacity: integer,
    bootId: z.string().regex(/^[a-f0-9]{16}$/i),
  })
  .refine(
    (info) => info.oldestSeq <= info.latestSeq,
    'Invalid sequence bounds',
  );
export const transactionStatus = z.object({
  sender: address,
  payer: address,
  status: statusName,
  transaction: hash.optional(),
});
export const frameReceipt = z.object({
  status: z.enum(['success', 'reverted', 'skipped']),
  gasUsed: z.object({ execution: quantity, state: quantity }),
});
export const receipt = z.object({
  blockNumber: quantity,
  status: z.enum(['success', 'reverted']),
  payer: address,
  cumulativeGasUsed: quantity,
  frameReceipts: z.array(frameReceipt).min(1).max(1024),
});
const check = z
  .object({
    rule: token,
    verdict: z.enum(['pass', 'fail', 'skipped']),
    frameIndex: integer.optional(),
    entity: z.enum(['sender', 'payer', 'factory']).optional(),
    detail: z.string().max(1024).optional(),
  })
  .transform(({ detail, ...value }) => ({
    ...value,
    waived: /waived/i.test(detail ?? ''),
  }));
export const explorerTransaction = z.object({
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
      sender: address,
      nonce: quantity,
      nonceKeys: z.array(quantity).min(1).max(16),
      checks: z.array(check).max(1024),
      frames: z
        .array(z.unknown())
        .min(1)
        .max(1024)
        .transform((frames) => frames.length),
    })
    .nullable(),
  events: z
    .array(
      z.object({
        seq: integer,
        txHash: hash,
        at: integer,
        kind: token,
        status: statusName.optional(),
      }),
    )
    .max(10_000),
});

export type ExplorerInfo = z.infer<typeof explorerInfo>;
export type Inspection = {
  requestedHash: string;
  chainId: string;
  before: ExplorerInfo;
  after: ExplorerInfo;
  admission: z.infer<typeof explorerTransaction>;
  status: z.infer<typeof transactionStatus>;
  receipt: z.infer<typeof receipt>;
};
