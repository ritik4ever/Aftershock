import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  encodeDeployData,
  encodeFunctionData,
  decodeAbiParameters,
  getContractAddress,
  keccak256,
} from 'viem';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getProfile } from '@forshtat/hegota-support/profiles';
import {
  frame,
  newTx,
  secp256k1Placeholder,
  signTx,
  txHash,
  encodeTx,
} from '@forshtat/hegota-support/tx';
import { toWire } from '@forshtat/hegota-support/rpc';
import { UPSTREAM } from '../inspect.js';
import { hash, quantity } from '../schema.js';
import { localRpc, LocalRpcError } from './rpc.js';
import { frameReceipt, lifecycleOutcome } from './lifecycle.js';
import type { startFixture, LocalEndpoint } from './fixture.js';
import type { AddStep } from './scenarios.js';

const execute = promisify(execFile);
const profile = getProfile('ethrex-eip8141-tracer');
const address = z.templateLiteral([
  '0x',
  z.string().regex(/^[a-fA-F0-9]{40}$/),
]);
const bytecode = z.templateLiteral([
  '0x',
  z
    .string()
    .min(2)
    .max(131072)
    .regex(/^(?:[a-f0-9]{2})+$/i),
]);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const stakeABI = [
  {
    type: 'function',
    name: 'addStake',
    stateMutability: 'payable',
    inputs: [{ type: 'uint32' }],
    outputs: [],
  },
] as const;
const depositABI = [
  {
    type: 'function',
    name: 'getDepositInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }, { type: 'uint32' }, { type: 'uint64' }],
  },
] as const;
export const sponsorConfig = z.object({
  stakingRegistryAddress: address,
  minStake: z.string().max(78).regex(/^\d+$/),
  minUnstakeDelay: z.number().int().nonnegative(),
});

export class SponsorInputError extends Error {
  constructor() {
    super('Pinned workshop/sidecar sponsor artifacts unavailable');
    this.name = 'SponsorInputError';
  }
}

export function sponsorStorageAllowed(
  checks: ReadonlyArray<{ rule: string; verdict: string; waived: boolean }>,
) {
  return (
    checks.some(
      (check) => check.rule === 'storage' && check.verdict === 'pass',
    ) && checks.every((check) => !check.waived && check.verdict !== 'fail')
  );
}

export async function sponsorArtifacts(root: string) {
  try {
    const directory = resolve(
      process.env.AFTERSHOCK_UPSTREAM_ROOT ??
        resolve(root, '..', 'aftershock-upstream'),
    );
    const read = async (repo: 'workshop' | 'sidecar', path: string) =>
      (
        await execute(
          'git',
          [
            '--no-pager',
            '-C',
            resolve(directory, repo),
            'show',
            `${UPSTREAM[repo]}:${path}`,
          ],
          { encoding: 'utf8', maxBuffer: 262144, timeout: 10000 },
        )
      ).stdout;
    const wallet = bytecode.parse(
      JSON.parse(
        await read('workshop', 'contracts/artifacts/ViolatingWallet.json'),
      ).bytecode,
    );
    const foreign = bytecode.parse(
      JSON.parse(await read('workshop', 'contracts/artifacts/Foreign.json'))
        .bytecode,
    );
    const source = await read(
      'sidecar',
      'deploy/predeploy/src/protocols/staking-registry-deployment.ts',
    );
    const registry = bytecode.parse(
      /export const STAKING_REGISTRY_INIT_CODE: Hex = "(0x[a-f0-9]+)";/.exec(
        source,
      )?.[1],
    );
    return { wallet, foreign, registry };
  } catch {
    throw new SponsorInputError();
  }
}

export async function sponsorWalletTransaction(
  ownerKey: Hex,
  wallet: Address,
  nonce: bigint,
  recipient: Address,
  registry?: Address,
) {
  const owner = privateKeyToAccount(ownerKey).address;
  const tx = newTx({
    chainId: 9n,
    sender: wallet,
    nonceKeys: [0n],
    nonceSeq: nonce,
    frames: [
      frame(profile, 'VERIFY', {
        scope: 'EXECUTION_AND_PAYMENT',
        execution: 70000n,
        data: registry ? '0x' : '0x01',
      }),
      frame(profile, 'SENDER', {
        target: registry ?? recipient,
        execution: registry ? 150000n : 50000n,
        state: 300000n,
        value: registry ? 12_000_000_000_000_000n : 1n,
        data: registry
          ? encodeFunctionData({
              abi: stakeABI,
              functionName: 'addStake',
              args: [86400],
            })
          : '0x',
      }),
    ],
    signatures: [secp256k1Placeholder(profile, owner)],
    fees: { maxFeePerGas: 2_000_000_000n },
  });
  const signed = await signTx(profile, tx, ownerKey);
  return {
    hash: txHash(profile, signed),
    wire: toWire(signed),
    raw: encodeTx(profile, signed),
  };
}

async function deploy(
  endpoint: LocalEndpoint,
  key: Hex,
  data: Hex,
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
    throw new Error('Deployment nonce exceeds signer range');
  const expected = getContractAddress({ from: account.address, nonce });
  const raw = await account.signTransaction({
    type: 'eip1559',
    chainId: 9,
    nonce: Number(nonce),
    gas: 15000000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    data,
    value,
  });
  const txHash = keccak256(raw);
  if (
    (await localRpc(endpoint, 'eth_sendRawTransaction', [raw], hash)) !== txHash
  )
    throw new Error('Deployment hash mismatch');
  const deadline = performance.now() + 90000;
  while (performance.now() < deadline) {
    const receipt = await localRpc(
      endpoint,
      'eth_getTransactionReceipt',
      [txHash],
      z
        .object({
          transactionHash: hash,
          status: z.enum(['0x0', '0x1']),
          blockNumber: quantity,
          contractAddress: address.nullable(),
        })
        .nullable(),
    );
    if (receipt) {
      if (
        receipt.transactionHash !== txHash ||
        receipt.status !== '0x1' ||
        receipt.contractAddress?.toLowerCase() !== expected.toLowerCase()
      )
        throw new Error('Deployment failed');
      const code = await localRpc(
        endpoint,
        'eth_getCode',
        [expected, 'latest'],
        bytecode,
      );
      return {
        address: expected,
        hash: txHash,
        block: receipt.blockNumber,
        runtimeBytes: (code.length - 2) / 2,
        initSha256: createHash('sha256')
          .update(Buffer.from(data.slice(2), 'hex'))
          .digest('hex'),
      };
    }
    await pause(1500);
  }
  throw new Error('Deployment receipt unavailable');
}

async function canonicalRejected(
  endpoint: LocalEndpoint,
  tx: Awaited<ReturnType<typeof sponsorWalletTransaction>>,
  add: AddStep,
  id: string,
) {
  try {
    await localRpc(endpoint, 'eth_sendRawTransaction', [tx.raw], hash);
  } catch (error) {
    if (!(error instanceof LocalRpcError)) throw error;
    add(
      id,
      error.reason === 'CANONICAL_FOREIGN_STORAGE' ? 'PASS' : 'INCONCLUSIVE',
      { hash: tx.hash, code: error.code, reason: error.reason },
    );
    if (error.reason !== 'CANONICAL_FOREIGN_STORAGE')
      throw new Error('Expected canonical storage rejection unavailable');
    return;
  }
  add(id, 'FAIL', {
    hash: tx.hash,
    expected: 'CANONICAL_FOREIGN_STORAGE',
    actual: 'ACCEPTED',
  });
  throw new Error('Canonical mempool accepted the foreign-storage candidate');
}

export async function stakedStorageDemo(
  fixture: Awaited<ReturnType<typeof startFixture>>,
  add: AddStep,
  assets: Awaited<ReturnType<typeof sponsorArtifacts>>,
) {
  const { keys, executionUrl, sidecarUrl } = fixture;
  const registry = await deploy(executionUrl, keys[2]!, assets.registry, 0n);
  add('deploy-registry', 'PASS', registry);
  const foreign = await deploy(executionUrl, keys[2]!, assets.foreign, 0n);
  add('deploy-foreign', 'PASS', foreign);
  const owner = privateKeyToAccount(keys[0]!).address;
  const wallet = await deploy(
    executionUrl,
    keys[2]!,
    encodeDeployData({
      abi: [
        {
          type: 'constructor',
          stateMutability: 'payable',
          inputs: [{ type: 'address' }, { type: 'address' }],
        },
      ],
      bytecode: assets.wallet,
      args: [owner, foreign.address],
    }),
    50_000_000_000_000_000n,
  );
  add('deploy-wallet', 'PASS', wallet);
  const config = await localRpc(
    sidecarUrl,
    'skandha_config',
    [],
    sponsorConfig,
  );
  if (
    config.stakingRegistryAddress.toLowerCase() !==
      registry.address.toLowerCase() ||
    BigInt(config.minStake) >= 12_000_000_000_000_000n ||
    config.minUnstakeDelay > 86400
  )
    throw new Error('Staking configuration precondition unavailable');
  add('verify-fixture-config', 'PASS', {
    registry: config.stakingRegistryAddress,
    minimumStake: config.minStake,
    minimumDelay: config.minUnstakeDelay,
  });
  const stake = async () => {
    const data = encodeFunctionData({
      abi: depositABI,
      functionName: 'getDepositInfo',
      args: [wallet.address],
    });
    const value = await localRpc(
      executionUrl,
      'eth_call',
      [{ to: registry.address, data }, 'latest'],
      z.templateLiteral(['0x', z.string().regex(/^[a-f0-9]{192}$/i)]),
    );
    const [amount, delay, withdrawTime] = decodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint32' }, { type: 'uint64' }],
      value,
    );
    return { amount, delay, withdrawTime };
  };
  const nonce = BigInt(
    await localRpc(
      executionUrl,
      'eth_getTransactionCount',
      [wallet.address, 'latest'],
      quantity,
    ),
  );
  const balanceBefore = BigInt(
    await localRpc(
      executionUrl,
      'eth_getBalance',
      [wallet.address, 'latest'],
      quantity,
    ),
  );
  const before = await stake();
  if (before.amount !== 0n || before.withdrawTime !== 0n)
    throw new Error('Fresh wallet unexpectedly staked');
  add('verify-initial-state', 'PASS', {
    walletNonce: nonce.toString(),
    walletBalance: balanceBefore.toString(),
    stake: before.amount.toString(),
  });
  const initial = await sponsorWalletTransaction(
    keys[0]!,
    wallet.address,
    nonce,
    owner,
  );
  await canonicalRejected(
    executionUrl,
    initial,
    add,
    'canonical-unstaked-reject',
  );
  try {
    await localRpc(
      sidecarUrl,
      'eth_sendFrameTransaction',
      [initial.wire],
      hash,
    );
    add('alt-unstaked-reject', 'FAIL', {
      hash: initial.hash,
      actual: 'ACCEPTED',
    });
    throw new Error('Unstaked candidate unexpectedly admitted');
  } catch (error) {
    if (!(error instanceof LocalRpcError)) throw error;
    add(
      'alt-unstaked-reject',
      error.reason === 'UNSTAKED_FOREIGN_STORAGE' ? 'PASS' : 'INCONCLUSIVE',
      { hash: initial.hash, code: error.code, reason: error.reason },
    );
    if (error.reason !== 'UNSTAKED_FOREIGN_STORAGE')
      throw new Error('Expected unstaked rejection unavailable');
  }
  const fundingBefore = BigInt(
    await localRpc(
      executionUrl,
      'eth_getBalance',
      [registry.address, 'latest'],
      quantity,
    ),
  );
  const clean = await sponsorWalletTransaction(
    keys[0]!,
    wallet.address,
    nonce,
    owner,
    registry.address,
  );
  if (
    (await localRpc(
      executionUrl,
      'eth_sendRawTransaction',
      [clean.raw],
      hash,
    )) !== clean.hash
  )
    throw new Error('Stake transaction hash mismatch');
  const stakeReceipt = await frameReceipt(sidecarUrl, clean.hash);
  const stakeOK =
    stakeReceipt.status === 'success' &&
    stakeReceipt.frameReceipts.length === 2 &&
    stakeReceipt.frameReceipts.every((frame) => frame.status === 'success');
  add('stake-wallet', stakeOK ? 'PASS' : 'FAIL', {
    hash: clean.hash,
    block: stakeReceipt.blockNumber,
    frameStatuses: stakeReceipt.frameReceipts
      .map((frame) => frame.status)
      .join(','),
  });
  if (!stakeOK) throw new Error('Stake execution failed');
  const after = await stake();
  const fundingAfter = BigInt(
    await localRpc(
      executionUrl,
      'eth_getBalance',
      [registry.address, 'latest'],
      quantity,
    ),
  );
  const nextNonce = BigInt(
    await localRpc(
      executionUrl,
      'eth_getTransactionCount',
      [wallet.address, 'latest'],
      quantity,
    ),
  );
  const balanceAfter = BigInt(
    await localRpc(
      executionUrl,
      'eth_getBalance',
      [wallet.address, 'latest'],
      quantity,
    ),
  );
  const transitioned =
    after.amount === 12_000_000_000_000_000n &&
    after.delay === 86400 &&
    after.withdrawTime === 0n &&
    fundingAfter - fundingBefore === after.amount &&
    nextNonce === nonce + 1n &&
    balanceAfter < balanceBefore - after.amount;
  add('verify-stake-transition', transitioned ? 'PASS' : 'FAIL', {
    stake: after.amount.toString(),
    delay: after.delay,
    withdrawTime: after.withdrawTime.toString(),
    registryBalance: fundingAfter.toString(),
    walletNonce: nextNonce.toString(),
    walletBalance: balanceAfter.toString(),
  });
  if (!transitioned)
    throw new Error('On-chain stake transition not established');
  const candidate = await sponsorWalletTransaction(
    keys[0]!,
    wallet.address,
    nextNonce,
    owner,
  );
  const recipientBefore = BigInt(
    await localRpc(executionUrl, 'eth_getBalance', [owner, 'latest'], quantity),
  );
  await canonicalRejected(
    executionUrl,
    candidate,
    add,
    'canonical-staked-reject',
  );
  const accepted = await localRpc(
    sidecarUrl,
    'eth_sendFrameTransaction',
    [candidate.wire],
    hash,
  );
  add('alt-staked-admit', accepted === candidate.hash ? 'PASS' : 'FAIL', {
    hash: candidate.hash,
    acceptedHash: accepted,
    sameCanonicalCandidate: true,
  });
  if (accepted !== candidate.hash)
    throw new Error('Sidecar admission hash mismatch');
  const receipt = await frameReceipt(sidecarUrl, candidate.hash);
  const record = await lifecycleOutcome(sidecarUrl, candidate.hash, 'included');
  const detail = record;
  const checks = detail.admission?.checks ?? [];
  const storagePassed = sponsorStorageAllowed(checks);
  const success =
    receipt.status === 'success' &&
    receipt.frameReceipts.length === 2 &&
    receipt.frameReceipts.every((frame) => frame.status === 'success') &&
    storagePassed;
  add('observe-alt-inclusion', success ? 'PASS' : 'FAIL', {
    hash: candidate.hash,
    block: receipt.blockNumber,
    frameStatuses: receipt.frameReceipts.map((frame) => frame.status).join(','),
    storagePassedWithoutWaiver: storagePassed,
    outcome: detail.admission?.outcome ?? 'MISSING',
  });
  const recipientAfter = BigInt(
    await localRpc(executionUrl, 'eth_getBalance', [owner, 'latest'], quantity),
  );
  const walletNonceAfter = BigInt(
    await localRpc(
      executionUrl,
      'eth_getTransactionCount',
      [wallet.address, 'latest'],
      quantity,
    ),
  );
  add(
    'verify-alt-state-change',
    recipientAfter === recipientBefore + 1n &&
      walletNonceAfter === nextNonce + 1n
      ? 'PASS'
      : 'FAIL',
    {
      recipientBefore: recipientBefore.toString(),
      recipientAfter: recipientAfter.toString(),
      walletNonceBefore: nextNonce.toString(),
      walletNonceAfter: walletNonceAfter.toString(),
    },
  );
}
