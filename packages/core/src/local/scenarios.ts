import { z } from 'zod';
import { privateKeyToAccount } from 'viem/accounts';
import { fixtureTransaction } from './codec.js';
import type { startFixture } from './fixture.js';
import { localRpc } from './rpc.js';
import { frameReceipt, lifecycleOutcome, transfer } from './lifecycle.js';
import { hash, quantity, transactionStatus } from '../schema.js';
import type { RunReport } from '../scenario.js';

type Fixture = Awaited<ReturnType<typeof startFixture>>;
export type AddStep = (
  id: string,
  result: RunReport['result'],
  observed: RunReport['steps'][number]['observed'],
) => void;
export type Submit = (
  id: string,
  tx: Awaited<ReturnType<typeof fixtureTransaction>>,
  expected: string,
) => Promise<boolean>;

export const pendingEntry = z.object({
  txHash: hash,
  submittedTime: quantity.optional(),
  lastUpdatedTime: quantity,
  revertReason: z.string().optional(),
});

export async function minedKeyedLifecycle(
  fixture: Fixture,
  replacement: Awaited<ReturnType<typeof fixtureTransaction>>,
  add: AddStep,
  submit: Submit,
) {
  const { keys, executionUrl, sidecarUrl } = fixture;
  const accepted = await localRpc(
    executionUrl,
    'eth_sendRawTransaction',
    [replacement.raw],
    hash,
  );
  add(
    'canonical-submit-predecessor',
    accepted === replacement.hash ? 'PASS' : 'FAIL',
    { hash: accepted },
  );
  const receipt = await frameReceipt(sidecarUrl, replacement.hash);
  const included = await lifecycleOutcome(
    sidecarUrl,
    replacement.hash,
    'included',
  );
  const status = await localRpc(
    sidecarUrl,
    'skandha_frameTransactionStatus',
    [replacement.hash],
    transactionStatus,
  );
  add(
    'observe-inclusion',
    receipt.status === 'success' &&
      receipt.frameReceipts.length === 2 &&
      receipt.frameReceipts.every((frame) => frame.status === 'success') &&
      status.status === 'OnChain' &&
      included.events.some(
        (event) => event.kind === 'included' && event.status === 'OnChain',
      )
      ? 'PASS'
      : 'FAIL',
    {
      hash: replacement.hash,
      blockNumber: receipt.blockNumber,
      status: status.status,
      frameStatuses: receipt.frameReceipts
        .map((frame) => frame.status)
        .join(','),
    },
  );
  await submit(
    'reject-stale-sequence',
    await fixtureTransaction(
      keys[0]!,
      keys[0]!,
      [1n],
      2_420_000_000n,
      1_210_000_000n,
    ),
    'NONCE_MISMATCH',
  );
  const next = await fixtureTransaction(
    keys[0]!,
    keys[0]!,
    [1n],
    2_000_000_000n,
    1_000_000_000n,
    1n,
  );
  if (!(await submit('admit-next-sequence', next, 'ACCEPTED')))
    throw new Error('Next keyed sequence unavailable');
  const nextAccepted = await localRpc(
    executionUrl,
    'eth_sendRawTransaction',
    [next.raw],
    hash,
  );
  add(
    'canonical-submit-next-sequence',
    nextAccepted === next.hash ? 'PASS' : 'FAIL',
    { hash: nextAccepted, sequence: '1' },
  );
  const nextReceipt = await frameReceipt(sidecarUrl, next.hash);
  await lifecycleOutcome(sidecarUrl, next.hash, 'included');
  add(
    'observe-next-inclusion',
    nextReceipt.status === 'success' &&
      nextReceipt.frameReceipts.length === 2 &&
      nextReceipt.frameReceipts.every((frame) => frame.status === 'success')
      ? 'PASS'
      : 'FAIL',
    {
      hash: next.hash,
      blockNumber: nextReceipt.blockNumber,
      frameStatuses: nextReceipt.frameReceipts
        .map((frame) => frame.status)
        .join(','),
    },
  );
  const disjoint = await fixtureTransaction(keys[0]!, keys[0]!, [2n]);
  const disjointStatus = await localRpc(
    sidecarUrl,
    'skandha_frameTransactionStatus',
    [disjoint.hash],
    transactionStatus,
  );
  add(
    'verify-disjoint-survivor',
    disjointStatus.status === 'New' ? 'PASS' : 'FAIL',
    { hash: disjoint.hash, status: disjointStatus.status },
  );
}

export async function minedPayerLifecycle(
  fixture: Fixture,
  replacement: Awaited<ReturnType<typeof fixtureTransaction>>,
  add: AddStep,
  submit: Submit,
) {
  const { keys, executionUrl, sidecarUrl } = fixture;
  const payer = privateKeyToAccount(keys[3]!).address;
  const recipient = privateKeyToAccount(keys[2]!).address;
  const topup = await transfer(
    executionUrl,
    keys[2]!,
    payer,
    800_000_000_000_000n,
  );
  add('top-up-payer', 'PASS', topup);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = await fixtureTransaction(keys[1]!, keys[3]!, [1n]);
  if (!(await submit('admit-second-obligation', second, 'ACCEPTED')))
    throw new Error('Second pending obligation unavailable');
  const entry = (txHash: string) =>
    localRpc(
      sidecarUrl,
      'eth_getFrameTransactionByHash',
      [txHash],
      pendingEntry,
    );
  const firstEntry = await entry(replacement.hash);
  const secondEntry = await entry(second.hash);
  const oldestAt = firstEntry.submittedTime ?? firstEntry.lastUpdatedTime;
  const newestAt = secondEntry.submittedTime ?? secondEntry.lastUpdatedTime;
  if (BigInt(oldestAt) >= BigInt(newestAt))
    throw new Error('Eviction ordering precondition unavailable');
  add('confirm-pending-order', 'PASS', {
    oldestHash: firstEntry.txHash,
    newestHash: secondEntry.txHash,
    oldestAt,
    newestAt,
  });
  const control = await transfer(executionUrl, keys[3]!, recipient, 1n);
  add('balance-control', 'PASS', control);
  // Allow at least one subsequent block plus a reconciler interval before the control observation.
  await new Promise((resolve) => setTimeout(resolve, 8000));
  const status = (txHash: string) =>
    localRpc(
      sidecarUrl,
      'skandha_frameTransactionStatus',
      [txHash],
      transactionStatus,
    );
  const firstControl = await status(replacement.hash);
  const secondControl = await status(second.hash);
  add(
    'verify-control-survival',
    firstControl.status === 'New' && secondControl.status === 'New'
      ? 'PASS'
      : 'FAIL',
    { oldestStatus: firstControl.status, newestStatus: secondControl.status },
  );
  const costs = await Promise.all(
    [replacement, second].map((tx) =>
      localRpc(
        executionUrl,
        'ethrex_simulateFrameTransaction',
        [tx.raw, 'latest', { trace: false }],
        z.object({ maxCost: z.union([quantity, z.string().regex(/^\d+$/)]) }),
      ),
    ),
  );
  const oldestCost = BigInt(costs[0]!.maxCost);
  const newestCost = BigInt(costs[1]!.maxCost);
  const drain = await transfer(
    executionUrl,
    keys[3]!,
    recipient,
    800_000_000_000_000n,
  );
  add('drain-payer', 'PASS', drain);
  const balance = BigInt(
    await localRpc(executionUrl, 'eth_getBalance', [payer, 'latest'], quantity),
  );
  if (!(
    oldestCost <= balance &&
    newestCost <= balance &&
    oldestCost + newestCost > balance
  ))
    throw new Error('Post-drain aggregate-only boundary unavailable');
  await lifecycleOutcome(sidecarUrl, second.hash, 'dropped');
  const oldestStatus = await status(replacement.hash);
  const newestStatus = await status(second.hash);
  const cancelled = await entry(second.hash);
  const balanceEnforcement =
    /can no longer cover its pending frame transactions as of block/.test(
      cancelled.revertReason ?? '',
    );
  add(
    'verify-solvency-eviction',
    balanceEnforcement
      ? oldestStatus.status === 'New' && newestStatus.status === 'Cancelled'
        ? 'PASS'
        : 'FAIL'
      : 'INCONCLUSIVE',
    {
      oldestHash: replacement.hash,
      newestHash: second.hash,
      oldestStatus: oldestStatus.status,
      newestStatus: newestStatus.status,
      balanceEnforcement,
    },
  );
  add(
    'verify-survivor-obligations',
    oldestCost <= balance &&
      newestCost <= balance &&
      oldestCost + newestCost > balance
      ? 'PASS'
      : 'FAIL',
    {
      balance: balance.toString(),
      oldestCost: oldestCost.toString(),
      newestCost: newestCost.toString(),
      combinedCost: (oldestCost + newestCost).toString(),
    },
  );
}
