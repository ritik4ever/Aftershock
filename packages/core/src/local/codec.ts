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
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

const profile = getProfile('ethrex-eip8141-tracer');

export async function fixtureTransaction(
  senderKey: Hex,
  payerKey: Hex,
  keys: bigint[],
  fee = 2_000_000_000n,
  priorityFee = fee,
  sequence = 0n,
) {
  const sender = privateKeyToAccount(senderKey).address;
  const payer = privateKeyToAccount(payerKey).address;
  const selfPay = sender === payer;
  const tx = newTx({
    chainId: 9n,
    sender,
    nonceKeys: keys,
    nonceSeq: sequence,
    frames: selfPay
      ? [
          frame(profile, 'VERIFY', {
            scope: 'EXECUTION_AND_PAYMENT',
            execution: 30_000n,
          }),
          frame(profile, 'SENDER', {
            target: sender,
            execution: 50_000n,
            state: 200_000n,
          }),
        ]
      : [
          frame(profile, 'VERIFY', { scope: 'EXECUTION', execution: 30_000n }),
          frame(profile, 'VERIFY', {
            scope: 'PAYMENT',
            target: payer,
            execution: 30_000n,
          }),
          frame(profile, 'SENDER', {
            target: sender,
            execution: 50_000n,
            state: 200_000n,
          }),
        ],
    signatures: selfPay
      ? [secp256k1Placeholder(profile)]
      : [secp256k1Placeholder(profile), secp256k1Placeholder(profile, payer)],
    fees: { maxFeePerGas: fee, maxPriorityFeePerGas: priorityFee },
  });
  let signed = await signTx(profile, tx, senderKey);
  if (!selfPay) signed = await signTx(profile, signed, payerKey, 1);
  return {
    maximumFee: fee.toString(),
    priorityFee: priorityFee.toString(),
    hash: txHash(profile, signed),
    wire: toWire(signed),
    raw: encodeTx(profile, signed),
  };
}
