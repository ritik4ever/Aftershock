import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import {
  sponsorStorageAllowed,
  sponsorWalletTransaction,
  sponsorArtifacts,
  SponsorInputError,
  sponsorConfig,
} from '../packages/core/src/local/sponsor.js';
import {
  decodeLocalResponse,
  LocalRpcError,
} from '../packages/core/src/local/rpc.js';
import { definitions } from '../packages/core/src/scenario.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

test('missing pinned source inputs fail safely before fixture creation', async () => {
  const previous = process.env.AFTERSHOCK_UPSTREAM_ROOT;
  process.env.AFTERSHOCK_UPSTREAM_ROOT = join(
    tmpdir(),
    `aftershock-unavailable-${randomUUID()}`,
  );
  try {
    await assert.rejects(
      sponsorArtifacts(process.cwd()),
      (error: unknown) =>
        error instanceof SponsorInputError &&
        !error.message.includes(process.env.AFTERSHOCK_UPSTREAM_ROOT!),
    );
  } finally {
    if (previous === undefined) delete process.env.AFTERSHOCK_UPSTREAM_ROOT;
    else process.env.AFTERSHOCK_UPSTREAM_ROOT = previous;
  }
});

test('storage inclusion cannot be established by waived, failed, skipped or absent checks', () => {
  const check = { rule: 'storage', verdict: 'pass', waived: false };
  assert.equal(sponsorStorageAllowed([check]), true);
  assert.equal(sponsorStorageAllowed([]), false);
  assert.equal(sponsorStorageAllowed([{ ...check, waived: true }]), false);
  assert.equal(sponsorStorageAllowed([{ ...check, verdict: 'fail' }]), false);
  assert.equal(
    sponsorStorageAllowed([{ ...check, verdict: 'skipped' }]),
    false,
  );
  assert.equal(
    sponsorStorageAllowed([
      check,
      { rule: 'gas-limit', verdict: 'fail', waived: false },
    ]),
    false,
  );
  assert.ok(
    definitions['staked-storage-boundary'].actions.includes(
      'verify-alt-state-change',
    ),
  );
});

test('staking config accepts checksummed wire addresses and rejects malformed values', () => {
  const checksum = privateKeyToAccount(generatePrivateKey()).address;
  const config = {
    stakingRegistryAddress: checksum,
    minStake: '10000000000000000',
    minUnstakeDelay: 0,
  };
  assert.equal(sponsorConfig.parse(config).stakingRegistryAddress, checksum);
  assert.equal(
    sponsorConfig.parse({
      ...config,
      stakingRegistryAddress: checksum.toLowerCase(),
    }).stakingRegistryAddress,
    checksum.toLowerCase(),
  );
  assert.throws(() =>
    sponsorConfig.parse({ ...config, stakingRegistryAddress: '0xinvalid' }),
  );
  assert.throws(() => sponsorConfig.parse({ ...config, minStake: '0.01' }));
});

test('storage rejection families require the inspected method, code and message', () => {
  const cases = [
    {
      method: 'eth_sendRawTransaction',
      code: -32000,
      message:
        'Invalid params: Frame transaction validation-prefix simulation failed: StorageReadNonSender',
      reason: 'CANONICAL_FOREIGN_STORAGE',
    },
    {
      method: 'eth_sendFrameTransaction',
      code: -32502,
      message: 'unstaked payer accessed unit-address slot unit-slot',
      reason: 'UNSTAKED_FOREIGN_STORAGE',
    },
  ] as const;
  for (const expected of cases) {
    const error = (code: number) => ({
      jsonrpc: '2.0',
      id: 1,
      error: { code, message: expected.message },
    });
    assert.throws(
      () =>
        decodeLocalResponse(
          error(expected.code),
          expected.method,
          [],
          z.unknown(),
        ),
      (failure: unknown) =>
        failure instanceof LocalRpcError && failure.reason === expected.reason,
    );
    assert.throws(
      () =>
        decodeLocalResponse(error(-32601), expected.method, [], z.unknown()),
      (failure: unknown) =>
        failure instanceof LocalRpcError && failure.reason === 'OTHER',
    );
    assert.throws(
      () =>
        decodeLocalResponse(
          error(expected.code),
          'eth_getTransactionReceipt',
          [],
          z.unknown(),
        ),
      (failure: unknown) =>
        failure instanceof LocalRpcError && failure.reason === 'OTHER',
    );
  }
});

test('official wallet codec signs distinct clean-stake and foreign-read transactions', async () => {
  const owner = generatePrivateKey();
  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  const recipient = privateKeyToAccount(owner).address;
  const registry = privateKeyToAccount(generatePrivateKey()).address;
  const stake = await sponsorWalletTransaction(
    owner,
    wallet,
    8n,
    recipient,
    registry,
  );
  const foreign = await sponsorWalletTransaction(owner, wallet, 9n, recipient);
  assert.notEqual(stake.hash, foreign.hash);
  assert.deepEqual(
    await sponsorWalletTransaction(owner, wallet, 9n, recipient),
    foreign,
  );
});
