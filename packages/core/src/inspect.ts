import { randomUUID } from 'node:crypto';
import { GatewayReader, GATEWAY } from './rpc.js';
import {
  explorerInfo,
  explorerTransaction,
  hash,
  quantity,
  receipt,
  transactionStatus,
} from './schema.js';
import type { ExplorerInfo, Inspection } from './schema.js';

export const UPSTREAM = {
  workshop: 'bcfe02a196ca97b6fb0d1044db9d0b4c673831fc',
  sidecar: '2e22ff0a2898e69ea4bf5275bce1be8581a8582a',
  ethrex: '9aa3645d795945c64400f41a70aace0edfa7f383',
} as const;

export function historyGaps(
  before: ExplorerInfo,
  after: ExplorerInfo,
): string[] {
  const gaps: string[] = [];
  if (before.bootId !== after.bootId) gaps.push('EXPLORER_RESTART');
  if (after.oldestSeq > before.latestSeq + 1) gaps.push('HISTORY_OVERWRITTEN');
  if (after.latestSeq < before.latestSeq) gaps.push('SEQUENCE_REGRESSION');
  return gaps;
}

export function evaluateInspection(value: Inspection) {
  const issues = historyGaps(value.before, value.after);
  const expected = value.requestedHash.toLowerCase();
  const admission = value.admission.admission;
  if (
    value.admission.hash.toLowerCase() !== expected ||
    (admission && admission.txHash.toLowerCase() !== expected) ||
    value.status.transaction?.toLowerCase() !== expected ||
    value.admission.events.some(
      (event) => event.txHash.toLowerCase() !== expected,
    )
  ) {
    issues.push('HASH_MISMATCH');
  }
  if (
    BigInt(value.chainId) !== BigInt(value.before.chainId) ||
    value.before.chainId !== value.after.chainId
  )
    issues.push('CHAIN_MISMATCH');
  if (
    value.before.commit !== value.after.commit ||
    value.before.version !== value.after.version
  )
    issues.push('VERSION_CHANGED');
  if (value.status.payer.toLowerCase() !== value.receipt.payer.toLowerCase())
    issues.push('PAYER_MISMATCH');
  if (
    admission &&
    value.status.sender.toLowerCase() !== admission.sender.toLowerCase()
  )
    issues.push('SENDER_MISMATCH');
  if (admission && admission.frames !== value.receipt.frameReceipts.length)
    issues.push('FRAME_COUNT_MISMATCH');
  const admissionObserved =
    admission !== null && ['accepted', 'included'].includes(admission.outcome);
  const executionSucceeded =
    value.receipt.status === 'success' &&
    value.receipt.frameReceipts.every((frame) => frame.status === 'success') &&
    ['OnChain', 'Finalized'].includes(value.status.status);
  return {
    admissionObserved,
    executionSucceeded,
    evidenceConsistent: issues.length === 0,
    issues,
    sourceSpecificVerdict: 'INCONCLUSIVE' as const,
    reportedUnwaivedPassChecks:
      admission?.checks.filter(
        (check) => check.verdict === 'pass' && !check.waived,
      ).length ?? 0,
    skippedChecks:
      admission?.checks.filter((check) => check.verdict === 'skipped').length ??
      0,
  };
}

export async function doctor(reader = new GatewayReader()) {
  const chainId = await reader.read('eth_chainId', [], quantity);
  const info = await reader.read('skandha_explorer_info', [], explorerInfo);
  return {
    endpoint: GATEWAY,
    endpointClass: 'PUBLIC_DEVNET',
    chainId,
    info,
    sourcePins: UPSTREAM,
    sourceCommitVerified: info.commit === UPSTREAM.sidecar,
    chainConsistent: BigInt(chainId) === BigInt(info.chainId),
  };
}

export async function inspectTransaction(
  requestedHash: string,
  reader = new GatewayReader(),
) {
  hash.parse(requestedHash);
  const chainId = await reader.read('eth_chainId', [], quantity);
  const before = await reader.read('skandha_explorer_info', [], explorerInfo);
  const admission = await reader.read(
    'skandha_explorer_getTransaction',
    [requestedHash],
    explorerTransaction,
  );
  const status = await reader.read(
    'skandha_frameTransactionStatus',
    [requestedHash],
    transactionStatus,
  );
  const observedReceipt = await reader.read(
    'eth_getFrameTransactionReceipt',
    [requestedHash],
    receipt,
  );
  const after = await reader.read('skandha_explorer_info', [], explorerInfo);
  const evidence: Inspection = {
    requestedHash,
    chainId,
    before,
    after,
    admission,
    status,
    receipt: observedReceipt,
  };
  return {
    runId: randomUUID(),
    observedAt: new Date().toISOString(),
    purpose: 'workshop-admission-baseline',
    endpointClass: 'PUBLIC_DEVNET',
    endpoint: GATEWAY,
    sourcePins: UPSTREAM,
    limitations: [
      'This observation is not an original Aftershock lifecycle scenario.',
      'Unknown node commit prevents source-specific invariant conclusions.',
      'Projection omits signatures, calldata, logs and arbitrary server text.',
      'Historical events before capture may already be unavailable.',
    ],
    evidence,
    result: evaluateInspection(evidence),
  };
}
