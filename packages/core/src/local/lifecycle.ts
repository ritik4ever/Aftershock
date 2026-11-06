import { z } from 'zod';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';
import type { Hex, Address } from 'viem';
import type { LocalEndpoint } from './fixture.js';
import { localRpc, LocalRpcError } from './rpc.js';
import { hash, quantity, receipt, explorerTransaction } from '../schema.js';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function waitForMining(
  endpoint: LocalEndpoint,
  // Staged forks take minutes; frequent readiness reads can exhaust the
  // bounded journal before the actual lifecycle actions begin.
  pollMilliseconds = 15000,
) {
  z.number().int().min(1000).max(15000).parse(pollMilliseconds);
  const genesis = await localRpc(
    endpoint,
    'eth_getBlockByNumber',
    ['0x0', false],
    z.object({ timestamp: quantity }),
  );
  const deadline = performance.now() + 570_000;
  while (performance.now() < deadline) {
    const block = await localRpc(
      endpoint,
      'eth_getBlockByNumber',
      ['latest', false],
      z.object({ number: quantity, timestamp: quantity, hash }),
    );
    if (
      BigInt(block.number) > 0n &&
      BigInt(block.timestamp) >= BigInt(genesis.timestamp) + 396n
    )
      return block;
    await pause(pollMilliseconds);
  }
  throw new Error('Mining readiness unavailable');
}

export async function frameReceipt(endpoint: LocalEndpoint, txHash: string) {
  hash.parse(txHash);
  const deadline = performance.now() + 75_000;
  while (performance.now() < deadline) {
    try {
      const result = await localRpc(
        endpoint,
        'eth_getFrameTransactionReceipt',
        [txHash],
        receipt.nullable(),
      );
      if (result) return result;
    } catch (error) {
      if (
        !(error instanceof LocalRpcError) ||
        error.code !== -32000 ||
        error.reason !== 'RECEIPT_UNAVAILABLE'
      )
        throw error;
    }
    await pause(1500);
  }
  throw new Error('Frame receipt unavailable');
}

export async function lifecycleOutcome(
  endpoint: LocalEndpoint,
  txHash: string,
  expected: 'included' | 'dropped' | 'replaced',
) {
  const deadline = performance.now() + 45_000;
  while (performance.now() < deadline) {
    const result = await localRpc(
      endpoint,
      'skandha_explorer_getTransaction',
      [txHash],
      explorerTransaction,
    );
    validateLifecycleIdentity(result, txHash);
    if (result.admission?.outcome === expected) return result;
    await pause(1000);
  }
  throw new Error('Lifecycle outcome unavailable');
}

export function validateLifecycleIdentity(
  result: z.infer<typeof explorerTransaction>,
  requestedHash: string,
) {
  hash.parse(requestedHash);
  const expected = requestedHash.toLowerCase();
  if (
    result.hash.toLowerCase() !== expected ||
    (result.admission && result.admission.txHash.toLowerCase() !== expected) ||
    result.events.some((event) => event.txHash.toLowerCase() !== expected)
  )
    throw new Error('Lifecycle transaction identity mismatch');
}

export async function transfer(
  endpoint: LocalEndpoint,
  key: Hex,
  recipient: Address,
  value: bigint,
) {
  const account = privateKeyToAccount(key);
  const nonce = BigInt(
    await localRpc(
      endpoint,
      'eth_getTransactionCount',
      [account.address, 'pending'],
      quantity,
    ),
  );
  if (nonce > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Canonical nonce exceeds signer range');
  const raw = await account.signTransaction({
    type: 'eip1559',
    chainId: 9,
    nonce: Number(nonce),
    gas: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    to: recipient,
    value,
  });
  const txHash = keccak256(raw);
  if (
    (await localRpc(endpoint, 'eth_sendRawTransaction', [raw], hash)) !== txHash
  )
    throw new Error('Transfer hash mismatch');
  const deadline = performance.now() + 75_000;
  while (performance.now() < deadline) {
    const result = await localRpc(
      endpoint,
      'eth_getTransactionReceipt',
      [txHash],
      z
        .object({
          transactionHash: hash,
          status: z.enum(['0x0', '0x1']),
          blockNumber: quantity,
          gasUsed: quantity,
        })
        .nullable(),
    );
    if (result) {
      if (result.transactionHash !== txHash || result.status !== '0x1')
        throw new Error('Control transfer did not succeed');
      return { ...result, value: value.toString() };
    }
    await pause(1500);
  }
  throw new Error('Transfer receipt unavailable');
}
