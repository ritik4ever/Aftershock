import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, getContractAddress, keccak256 } from 'viem';
import type { Hex } from 'viem';
import { getProfile } from '@forshtat/hegota-support/profiles';
import {
  frame,
  newTx,
  signTx,
  secp256k1Placeholder,
  txHash,
} from '@forshtat/hegota-support/tx';
import { toWire } from '@forshtat/hegota-support/rpc';
import { z } from 'zod';
import { contractPlan, contractReport, planHash } from '../contract-plan.js';
import type { ContractPlan, ContractReport } from '../contract-plan.js';
import { UPSTREAM } from '../inspect.js';
import { hash, quantity } from '../schema.js';
import { startFixture } from './fixture.js';
import { localRpc, LocalRpcError } from './rpc.js';
import { waitForMining, frameReceipt, lifecycleOutcome } from './lifecycle.js';

const data = z
  .string()
  .max(131074)
  .regex(/^0x(?:[a-f0-9]{2})*$/i);
const address = z.string().regex(/^0x[a-f0-9]{40}$/i);
const minedReceipt = z.object({
  transactionHash: hash,
  status: z.enum(['0x0', '0x1']),
  blockNumber: quantity,
  contractAddress: address.nullable(),
});

export async function runContractPlan(
  input: ContractPlan,
  root: string,
): Promise<ContractReport> {
  const plan = contractPlan.parse(input),
    runId = randomUUID(),
    startedAt = new Date().toISOString();
  const steps: ContractReport['steps'] = [];
  const add = (
    id: string,
    result: 'PASS' | 'FAIL' | 'BLOCKED',
    observed: Record<string, unknown>,
  ) => steps.push({ id, at: new Date().toISOString(), result, observed });
  let fixture: Awaited<ReturnType<typeof startFixture>> | undefined;
  try {
    fixture = await startFixture(root, runId, true);
    const { executionUrl, sidecarUrl } = fixture;
    const ready = await waitForMining(executionUrl);
    add('mining-ready', 'PASS', ready);
    const owner = privateKeyToAccount(fixture.keys[0]!);
    const nonce = async (sender = owner.address) =>
      BigInt(
        await localRpc(
          executionUrl,
          'eth_getTransactionCount',
          [sender, 'latest'],
          quantity,
        ),
      );
    const receiptFor = async (requested: string) => {
      const deadline = performance.now() + 90000;
      while (performance.now() < deadline) {
        const receipt = await localRpc(
          executionUrl,
          'eth_getTransactionReceipt',
          [requested],
          minedReceipt.nullable(),
        );
        if (receipt) {
          if (receipt.transactionHash.toLowerCase() !== requested.toLowerCase())
            throw new Error('Receipt identity mismatch');
          return receipt;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error('Mined receipt unavailable');
    };
    const initialNonce = await nonce();
    const deployed = getContractAddress({
      from: owner.address,
      nonce: initialNonce,
    });
    const deployData = (plan.initCode +
      (plan.appendOwner
        ? encodeAbiParameters([{ type: 'address' }], [owner.address]).slice(2)
        : '')) as Hex;
    const canonical = async (payload: {
      to?: Hex;
      data: Hex;
      gas: bigint;
      value: bigint;
    }) => {
      const sequence = await nonce();
      if (sequence > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Signer nonce range');
      const raw = await owner.signTransaction({
        type: 'eip1559',
        chainId: 9,
        nonce: Number(sequence),
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
        ...payload,
      });
      const expectedHash = keccak256(raw);
      if (
        (
          await localRpc(executionUrl, 'eth_sendRawTransaction', [raw], hash)
        ).toLowerCase() !== expectedHash.toLowerCase()
      )
        throw new Error('Submission identity mismatch');
      return receiptFor(expectedHash);
    };
    const deployment = await canonical({
      data: deployData,
      gas: 5_000_000n,
      value: BigInt(plan.deploymentValue),
    });
    if (
      deployment.status !== '0x1' ||
      deployment.contractAddress?.toLowerCase() !== deployed.toLowerCase()
    ) {
      add('deploy-contract', 'FAIL', { receipt: deployment });
    } else {
      const code = await localRpc(
        executionUrl,
        'eth_getCode',
        [deployed, deployment.blockNumber],
        data,
      );
      add('deploy-contract', code === '0x' ? 'FAIL' : 'PASS', {
        address: deployed,
        owner: owner.address,
        receipt: deployment,
        runtimeHash: keccak256(code as Hex),
        runtimeBytes: (code.length - 2) / 2,
      });
      if (code !== '0x')
        for (const [index, action] of plan.steps.entries()) {
          const observed: Record<string, unknown> = {
            kind: action.kind,
            address: deployed,
          };
          let passed = false,
            blocked = false;
          if (action.kind === 'call') {
            try {
              const returned = await localRpc(
                executionUrl,
                'eth_call',
                [
                  {
                    from: owner.address,
                    to: deployed,
                    data: action.data,
                    value: action.value,
                    gas: action.gas,
                  },
                  'latest',
                ],
                data,
              );
              observed.returned = returned;
              passed =
                action.expect === 'success' &&
                (action.expectedReturn === undefined ||
                  returned.toLowerCase() ===
                    action.expectedReturn.toLowerCase());
            } catch (error) {
              if (!(error instanceof LocalRpcError)) throw error;
              observed.rpcCode = error.code;
              observed.rpcMessage = error.detail ?? 'No diagnostic text';
              passed = action.expect === 'revert' && error.code === 3;
              blocked = error.code !== 3;
            }
          } else if (action.kind === 'transaction') {
            const receipt = await canonical({
              to: deployed,
              data: action.data as Hex,
              gas: BigInt(action.gas),
              value: BigInt(action.value),
            });
            observed.receipt = receipt;
            passed =
              receipt.status === (action.expect === 'success' ? '0x1' : '0x0');
          } else {
            const profile = getProfile('ethrex-eip8141-tracer');
            const sender =
              action.frameSender === 'contract' ? deployed : owner.address;
            const sequence =
              action.nonceSeq === undefined
                ? await nonce(sender)
                : BigInt(action.nonceSeq);
            const tx = newTx({
              chainId: 9n,
              sender,
              nonceKeys: action.nonceKeys.map(BigInt),
              nonceSeq: sequence,
              frames: action.frames
                ? action.frames.map((f) => ({
                    mode: f.mode,
                    flags: f.flags,
                    target:
                      f.target === 'sender'
                        ? null
                        : f.target === 'owner'
                          ? owner.address
                          : f.target === 'contract'
                            ? deployed
                            : (f.target as Hex),
                    limits: {
                      execution: BigInt(f.execution),
                      state: BigInt(f.state),
                    },
                    value: BigInt(f.value),
                    data: f.data as Hex,
                  }))
                : [
                    frame(profile, 'VERIFY', {
                      scope: 'EXECUTION_AND_PAYMENT',
                      execution: 70000n,
                      data: action.verifyData as Hex,
                    }),
                    frame(profile, 'SENDER', {
                      target: deployed,
                      execution: BigInt(action.gas),
                      state: 300000n,
                      value: BigInt(action.value),
                      data: action.data as Hex,
                    }),
                  ],
              signatures: [secp256k1Placeholder(profile, owner.address)],
              fees: {
                maxFeePerGas: 2_000_000_000n,
                maxPriorityFeePerGas: 1_000_000_000n,
              },
            });
            const signed = await signTx(profile, tx, fixture.keys[0]!);
            const expectedHash = txHash(profile, signed);
            observed.hash = expectedHash;
            try {
              const admitted = await localRpc(
                sidecarUrl,
                'eth_sendFrameTransaction',
                [toWire(signed)],
                hash,
              );
              if (admitted.toLowerCase() !== expectedHash.toLowerCase())
                throw new Error('Frame identity mismatch');
              observed.admitted = true;
              // A rejected expectation still follows the accepted transaction to its receipt.
              const receipt = await frameReceipt(sidecarUrl, expectedHash);
              const lifecycle = await lifecycleOutcome(
                sidecarUrl,
                expectedHash,
                'included',
              );
              observed.receipt = receipt;
              observed.admission = lifecycle.admission;
              const validFrames =
                receipt.frameReceipts.length === signed.frames.length;
              passed =
                action.rejectCode === undefined &&
                validFrames &&
                (action.expect === 'success'
                  ? receipt.status === 'success' &&
                    receipt.frameReceipts.every((f) => f.status === 'success')
                  : receipt.status === 'reverted' ||
                    receipt.frameReceipts.some((f) => f.status === 'reverted'));
            } catch (error) {
              if (!(error instanceof LocalRpcError)) throw error;
              observed.rpcCode = error.code;
              observed.rpcReason = error.reason;
              observed.rpcMessage = error.detail ?? 'No diagnostic text';
              passed =
                observed.admitted !== true &&
                action.rejectCode !== undefined &&
                error.code === action.rejectCode;
              blocked =
                observed.admitted === true ||
                ![-32500, -32502, -32602].includes(error.code);
            }
          }
          if (action.storage) {
            const value = await localRpc(
              executionUrl,
              'eth_getStorageAt',
              [deployed, action.storage.slot, 'latest'],
              hash,
            );
            observed.storage = {
              slot: action.storage.slot,
              expected: action.storage.value,
              actual: value,
            };
            passed =
              passed &&
              value.toLowerCase() === action.storage.value.toLowerCase();
          }
          add(
            `action-${index + 1}`,
            blocked ? 'BLOCKED' : passed ? 'PASS' : 'FAIL',
            observed,
          );
        }
    }
  } catch (error) {
    if (fixture)
      await writeFile(
        `${root}/.local/${runId}/contract-error.log`,
        String(error),
        { mode: 0o600 },
      ).catch(() => {});
    add('prerequisites-or-evidence', 'BLOCKED', {
      reason:
        error instanceof LocalRpcError
          ? `RPC_${error.code}_${error.reason}`
          : 'SETUP_OR_OBSERVATION_UNAVAILABLE',
    });
  } finally {
    if (fixture) {
      try {
        await fixture.cleanup();
        add('fixture-cleanup', 'PASS', { removedOwnedResources: true });
      } catch {
        add('fixture-cleanup', 'BLOCKED', { removedOwnedResources: false });
      }
    }
  }
  return contractReport.parse({
    schemaVersion: 1,
    scenarioId: 'custom-contract',
    runId,
    endpointClass: 'ISOLATED_LOCAL',
    plan,
    planSha256: planHash(plan),
    startedAt,
    completedAt: new Date().toISOString(),
    sourcePins: UPSTREAM,
    environment: fixture?.fingerprint ?? {},
    steps,
    result: steps.some((s) => s.result === 'FAIL')
      ? 'FAIL'
      : steps.some((s) => s.result === 'BLOCKED')
        ? 'BLOCKED'
        : 'PASS',
  });
}
