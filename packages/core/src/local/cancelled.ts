import { z } from 'zod';
import { privateKeyToAccount } from 'viem/accounts';
import { fixtureTransaction } from './codec.js';
import type { startFixture } from './fixture.js';
import { localRpc } from './rpc.js';
import { pendingEntry, type AddStep, type Submit } from './scenarios.js';
import { transfer, lifecycleOutcome } from './lifecycle.js';
import { quantity, transactionStatus, explorerTransaction } from '../schema.js';

// Cancelled only: no inferred coverage of OnChain, Finalized or Reverted.
export async function cancelledReplacement(
  fixture: Awaited<ReturnType<typeof startFixture>>,
  ttl: number,
  add: AddStep,
  submit: Submit,
) {
  const { keys, executionUrl, sidecarUrl } = fixture;
  const payer = privateKeyToAccount(keys[3]!).address;
  const funding = privateKeyToAccount(keys[2]!).address;
  const base = await fixtureTransaction(keys[0]!, keys[3]!, [1n]);
  const candidate = await fixtureTransaction(
    keys[0]!,
    keys[3]!,
    [1n],
    2_100_000_000n,
  );
  const entry = (hash: string) =>
    localRpc(
      sidecarUrl,
      'eth_getFrameTransactionByHash',
      [hash],
      pendingEntry.nullable(),
    );
  const status = (hash: string) =>
    localRpc(
      sidecarUrl,
      'skandha_frameTransactionStatus',
      [hash],
      transactionStatus,
    );
  const balance = () =>
    localRpc(executionUrl, 'eth_getBalance', [payer, 'latest'], quantity);
  const cost = async (tx: typeof base) =>
    BigInt(
      (
        await localRpc(
          executionUrl,
          'ethrex_simulateFrameTransaction',
          [tx.raw, 'latest', { trace: false }],
          z.object({ maxCost: z.union([quantity, z.string().regex(/^\d+$/)]) }),
        )
      ).maxCost,
    );
  if (!(await submit('admit-base', base, 'ACCEPTED')))
    throw new Error('Cancellation baseline unavailable');
  if (!(await submit('reject-live-duplicate', base, 'DUPLICATE')))
    throw new Error('Live duplicate check unavailable');
  if (!(await submit('reject-live-below-bump', candidate, 'FEE_BUMP')))
    throw new Error('Live fee check unavailable');

  async function cancel(tx: typeof base, drainId: string, observeId: string) {
    const required = await cost(tx);
    const before = await balance();
    const receipt = await transfer(
      executionUrl,
      keys[3]!,
      funding,
      800_000_000_000_000n,
    );
    const after = await balance();
    if (!(BigInt(before) >= required && BigInt(after) < required))
      throw new Error('Cancellation balance boundary unavailable');
    add(drainId, 'PASS', {
      ...receipt,
      balanceBefore: before,
      balanceAfter: after,
      maximumCost: required.toString(),
    });
    // Poll the compact status response, then retain the complete projected
    // explorer history once cancellation is observed. Repeated full histories
    // during block reconciliation would waste the bounded evidence budget.
    const deadline = performance.now() + 45_000;
    let observed = await status(tx.hash);
    while (observed.status === 'New' && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      observed = await status(tx.hash);
    }
    if (observed.status !== 'Cancelled')
      throw new Error('Cancelled status unavailable');
    const history = await lifecycleOutcome(sidecarUrl, tx.hash, 'dropped');
    const metadata = await entry(tx.hash);
    if (
      !metadata ||
      metadata.txHash !== tx.hash ||
      observed.status !== 'Cancelled' ||
      !history.events.some(
        (e) => e.kind === 'dropped' && e.status === 'Cancelled',
      )
    )
      throw new Error('Real Cancelled predecessor unavailable');
    add(observeId, 'PASS', {
      hash: tx.hash,
      status: observed.status,
      lastUpdatedTime: metadata.lastUpdatedTime,
      outcome: history.admission!.outcome,
    });
    return metadata;
  }
  async function restore(
    tx: typeof base,
    metadata: NonNullable<Awaited<ReturnType<typeof entry>>>,
    restoreId: string,
    windowId: string,
  ) {
    const before = await balance();
    const receipt = await transfer(
      executionUrl,
      keys[2]!,
      payer,
      800_000_000_000_000n,
    );
    const after = await balance();
    const required = await cost(tx);
    if (!(BigInt(after) > BigInt(before) && BigInt(after) >= required))
      throw new Error('Restored affordability unavailable');
    add(restoreId, 'PASS', {
      ...receipt,
      balanceBefore: before,
      balanceAfter: after,
      maximumCost: required.toString(),
    });
    const held = await entry(metadata.txHash);
    const heldStatus = await status(metadata.txHash);
    const elapsed = BigInt(Date.now()) - BigInt(metadata.lastUpdatedTime);
    if (
      !held ||
      held.txHash !== metadata.txHash ||
      held.lastUpdatedTime !== metadata.lastUpdatedTime ||
      heldStatus.status !== 'Cancelled' ||
      elapsed < 0n ||
      elapsed + 15_000n >= BigInt(ttl) * 1000n
    )
      throw new Error('Terminal non-expired window unavailable');
    add(windowId, 'PASS', {
      hash: held.txHash,
      status: heldStatus.status,
      lastUpdatedTime: held.lastUpdatedTime,
      ttlSeconds: ttl,
    });
  }
  const cancelled = await cancel(
    base,
    'drain-for-cancellation',
    'observe-cancelled',
  );
  await restore(
    candidate,
    cancelled,
    'restore-payer',
    'confirm-terminal-window',
  );
  if (!(await submit('accept-cancelled-below-bump', candidate, 'ACCEPTED')))
    throw new Error('Cancelled fee exemption unavailable');
  const fresh = await entry(candidate.hash);
  const removed = await entry(base.hash);
  const replaced = await lifecycleOutcome(sidecarUrl, base.hash, 'replaced');
  if (!fresh || fresh.txHash !== candidate.hash)
    throw new Error('Replacement entry unavailable');
  const elapsed =
    BigInt(fresh.lastUpdatedTime) - BigInt(cancelled.lastUpdatedTime);
  add(
    'verify-terminal-replacement',
    removed === null &&
      elapsed >= 0n &&
      elapsed < BigInt(ttl) * 1000n &&
      replaced.admission?.outcome === 'replaced'
      ? 'PASS'
      : 'FAIL',
    {
      oldHash: base.hash,
      newHash: candidate.hash,
      cancelledAt: cancelled.lastUpdatedTime,
      acceptedAt: fresh.lastUpdatedTime,
      elapsedMilliseconds: elapsed.toString(),
      ttlSeconds: ttl,
      oldEntryRemoved: removed === null,
    },
  );
  const recancelled = await cancel(
    candidate,
    'drain-for-recancel',
    'observe-recancelled',
  );
  await restore(
    candidate,
    recancelled,
    'restore-payer-again',
    'confirm-resubmission-window',
  );
  if (!(await submit('resubmit-cancelled-identical', candidate, 'ACCEPTED')))
    throw new Error('Cancelled identical resubmission unavailable');
  const active = await entry(candidate.hash);
  const activeStatus = await status(candidate.hash);
  const history = await localRpc(
    sidecarUrl,
    'skandha_explorer_getTransaction',
    [candidate.hash],
    explorerTransaction,
  );
  if (!active || active.txHash !== candidate.hash)
    throw new Error('Reactivated entry unavailable');
  const reactivatedAfter =
    BigInt(active.lastUpdatedTime) - BigInt(recancelled.lastUpdatedTime);
  add(
    'verify-reactivation',
    activeStatus.status === 'New' &&
      history.hash === candidate.hash &&
      history.admission?.txHash === candidate.hash &&
      reactivatedAfter >= 0n &&
      reactivatedAfter < BigInt(ttl) * 1000n
      ? 'PASS'
      : 'FAIL',
    {
      hash: candidate.hash,
      status: activeStatus.status,
      cancelledAt: recancelled.lastUpdatedTime,
      acceptedAt: active.lastUpdatedTime,
      elapsedMilliseconds: reactivatedAfter.toString(),
      ttlSeconds: ttl,
    },
  );
  add(
    'explorer-reactivation-consistency',
    history.admission?.outcome === 'accepted' ? 'PASS' : 'FAIL',
    {
      hash: candidate.hash,
      activeStatus: activeStatus.status,
      explorerOutcome: history.admission?.outcome ?? 'MISSING',
      expectedOutcome: 'accepted',
    },
  );
  if (!(await submit('reject-reactivated-duplicate', candidate, 'DUPLICATE')))
    throw new Error('Reactivated duplicate check unavailable');
  const low = await fixtureTransaction(
    keys[0]!,
    keys[3]!,
    [1n],
    2_150_000_000n,
  );
  if (!(await submit('reject-reactivated-below-bump', low, 'FEE_BUMP')))
    throw new Error('Reactivated fee check unavailable');
}
