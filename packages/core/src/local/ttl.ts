import { fixtureTransaction } from './codec.js';
import type { startFixture } from './fixture.js';
import { localRpc } from './rpc.js';
import { pendingEntry, type AddStep, type Submit } from './scenarios.js';
import { lifecycleOutcome } from './lifecycle.js';
import { transactionStatus } from '../schema.js';

// A scoped admission case, not inclusion or wall-clock boundary proof.
export async function keyedReplacementTTL(
  fixture: Awaited<ReturnType<typeof startFixture>>,
  ttl: number,
  add: AddStep,
  submit: Submit,
) {
  const key = fixture.keys[0]!;
  const base = await fixtureTransaction(
    key,
    key,
    [1n],
    2_000_000_000n,
    1_000_000_000n,
  );
  const candidate = await fixtureTransaction(
    key,
    key,
    [1n],
    2_100_000_000n,
    1_050_000_000n,
  );
  const entry = (txHash: string) =>
    localRpc(
      fixture.sidecarUrl,
      'eth_getFrameTransactionByHash',
      [txHash],
      pendingEntry.nullable(),
    );
  const status = (txHash: string) =>
    localRpc(
      fixture.sidecarUrl,
      'skandha_frameTransactionStatus',
      [txHash],
      transactionStatus,
    );
  if (!(await submit('admit-base', base, 'ACCEPTED')))
    throw new Error('TTL baseline unavailable');
  const old = await entry(base.hash);
  const live = await status(base.hash);
  if (!old || old.txHash !== base.hash || live.status !== 'New')
    throw new Error('Live TTL predecessor unavailable');
  add('confirm-live-predecessor', 'PASS', {
    hash: base.hash,
    lastUpdatedTime: old.lastUpdatedTime,
    status: live.status,
    ttlSeconds: ttl,
  });
  if (!(await submit('reject-fee-before-ttl', candidate, 'FEE_BUMP')))
    throw new Error('Pre-expiry rejection unavailable');
  const unchanged = await entry(base.hash);
  if (!unchanged || unchanged.lastUpdatedTime !== old.lastUpdatedTime)
    throw new Error('Predecessor timestamp changed');
  const remaining =
    BigInt(old.lastUpdatedTime) +
    BigInt(ttl) * 1000n +
    1500n -
    BigInt(Date.now());
  if (remaining < 0n || remaining > 45_000n)
    throw new Error('TTL clock precondition unavailable');
  await new Promise((resolve) => setTimeout(resolve, Number(remaining)));
  const expired = await entry(base.hash);
  const stillLive = await status(base.hash);
  if (
    !expired ||
    expired.txHash !== base.hash ||
    expired.lastUpdatedTime !== old.lastUpdatedTime ||
    stillLive.status !== 'New'
  )
    throw new Error('Expired live predecessor unavailable');
  add('wait-for-ttl', 'PASS', {
    hash: base.hash,
    lastUpdatedTime: old.lastUpdatedTime,
    status: stillLive.status,
    ttlSeconds: ttl,
    waitMilliseconds: remaining.toString(),
  });
  if (!(await submit('reject-duplicate-after-ttl', base, 'DUPLICATE')))
    throw new Error('Post-expiry duplicate check unavailable');
  if (!(await submit('accept-fee-after-ttl', candidate, 'ACCEPTED')))
    throw new Error('TTL replacement unavailable');
  const fresh = await entry(candidate.hash);
  const removed = await entry(base.hash);
  const replaced = await lifecycleOutcome(
    fixture.sidecarUrl,
    base.hash,
    'replaced',
  );
  if (!fresh || fresh.txHash !== candidate.hash)
    throw new Error('Fresh TTL entry unavailable');
  const elapsed = BigInt(fresh.lastUpdatedTime) - BigInt(old.lastUpdatedTime);
  add(
    'verify-ttl-replacement',
    removed === null &&
      elapsed > BigInt(ttl) * 1000n &&
      replaced.admission?.outcome === 'replaced'
      ? 'PASS'
      : 'FAIL',
    {
      oldHash: base.hash,
      newHash: candidate.hash,
      oldLastUpdatedTime: old.lastUpdatedTime,
      newLastUpdatedTime: fresh.lastUpdatedTime,
      elapsedMilliseconds: elapsed.toString(),
      ttlSeconds: ttl,
      oldEntryRemoved: removed === null,
    },
  );
  const refreshedCandidate = await fixtureTransaction(
    key,
    key,
    [1n],
    2_150_000_000n,
    1_075_000_000n,
  );
  if (
    !(await submit('reject-fee-after-refresh', refreshedCandidate, 'FEE_BUMP'))
  )
    throw new Error('Refreshed TTL rejection unavailable');
  const active = await entry(candidate.hash);
  const activeStatus = await status(candidate.hash);
  const rejected = await entry(refreshedCandidate.hash);
  add(
    'verify-active-replacement',
    active?.txHash === candidate.hash &&
      active.lastUpdatedTime === fresh.lastUpdatedTime &&
      activeStatus.status === 'New' &&
      rejected === null
      ? 'PASS'
      : 'FAIL',
    {
      hash: candidate.hash,
      status: activeStatus.status,
      lastUpdatedTime: active?.lastUpdatedTime ?? 'MISSING',
      rejectedEntryAbsent: rejected === null,
    },
  );
}
