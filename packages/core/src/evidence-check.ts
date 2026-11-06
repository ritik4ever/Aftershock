import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { definitions, runReport } from './scenario.js';
import type { RunReport } from './scenario.js';
import { hash, quantity, receipt, transactionStatus } from './schema.js';

type Entry = NonNullable<RunReport['evidence']>['entries'][number];
type Step = RunReport['steps'][number];
type Status = 'CONSISTENT' | 'CONTRADICTED' | 'INSUFFICIENT';
type Check = {
  stepId: string;
  check: string;
  status: Status;
  rpcSequences: number[];
};
const text = z.string();
const decimal = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/);
const metadata = z.object({
  txHash: hash,
  submittedTime: quantity.optional(),
  lastUpdatedTime: quantity.optional(),
  balanceEnforcement: z.boolean(),
});
const lifecycle = z.object({
  hash,
  admission: z.object({ txHash: hash, outcome: text }).nullable(),
  events: z.array(
    z.object({ txHash: hash, kind: text, status: text.optional() }),
  ),
});
const canonicalReceipt = z.object({
  transactionHash: hash,
  status: text,
  blockNumber: quantity,
  gasUsed: quantity,
});
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

class Missing extends Error {}
class Contradiction extends Error {}
function expect(value: boolean) {
  if (!value) throw new Contradiction();
}

// Checks intentionally cover selected persisted output claims. They cannot
// authenticate a node or reconstruct redacted signing/request semantics.
export function checkEvidence(input: RunReport) {
  const report = runReport.parse(input);
  const checks: Check[] = [];
  const unsupportedSteps = new Set(report.steps.map((step) => step.id));
  const limitations = [
    'Selected saved-output consistency checks only; not full invariant revalidation, a new node run or an independent audit.',
    'Request signatures, keys, nonce/fee semantics, transfer amounts, account-query targets and simulation-to-transaction associations cannot be reconstructed from redacted request digests.',
    'Checksums and matching saved fields do not authenticate the report author or node; coordinated forgery is outside this check.',
    'Step cursors group completion-order responses; they do not provide atomic state snapshots.',
    'Covered steps have selected fields only; cancellation receipt checks exclude balance/cost boundaries and transfer values.',
  ];
  const requirements = {
    isolatedLocal: report.endpointClass === 'ISOLATED_LOCAL',
    chain9Reported: report.environment.chainId === '0x9',
    clientPinReported:
      report.environment.clientVersion?.includes(report.sourcePins.ethrex) ===
      true,
    currentDefinition: isDeepStrictEqual(
      report.definition,
      definitions[report.scenarioId],
    ),
    journalPresent: report.evidence !== undefined,
    recordingComplete: report.evidence?.complete === true,
    recordedRunPassed: report.result === 'PASS',
  };
  const eligible =
    requirements.isolatedLocal &&
    requirements.chain9Reported &&
    requirements.clientPinReported &&
    requirements.currentDefinition;
  const entries = report.evidence?.entries ?? [];
  const ranges = new Map<string, Entry[]>();
  let previous = 0;
  for (const step of report.steps) {
    const end = step.evidenceThrough ?? 0;
    ranges.set(
      step.id,
      entries.filter((entry) => entry.seq > previous && entry.seq <= end),
    );
    previous = end;
  }
  const results = (
    source: Entry[],
    method: Entry['method'],
    requested?: string,
  ) =>
    source.filter(
      (entry) =>
        entry.purpose === 'SCENARIO' &&
        entry.method === method &&
        entry.outcome === 'RESULT' &&
        entry.result !== null &&
        (!requested ||
          (entry.requestHash !== undefined &&
            same(entry.requestHash, requested))),
    );

  function check(
    step: Step,
    name: string,
    action: (source: Entry[], used: Set<number>) => void,
    allowRecordedFailure = false,
  ) {
    unsupportedSteps.delete(step.id);
    const used = new Set<number>();
    let status: Status = 'INSUFFICIENT';
    if (
      eligible &&
      report.evidence &&
      (step.result === 'PASS' ||
        (allowRecordedFailure && step.result === 'FAIL'))
    ) {
      try {
        action(ranges.get(step.id) ?? [], used);
        status = 'CONSISTENT';
      } catch (error) {
        if (error instanceof Contradiction || error instanceof z.ZodError)
          status = 'CONTRADICTED';
        else if (!(error instanceof Missing)) throw error;
      }
    }
    checks.push({
      stepId: step.id,
      check: name,
      status,
      rpcSequences: [...used].sort((a, b) => a - b),
    });
  }
  function latest<T>(
    source: Entry[],
    method: Entry['method'],
    schema: z.ZodType<T>,
    used: Set<number>,
    requested?: string,
  ): T {
    const entry = results(source, method, requested).at(-1);
    if (!entry) throw new Missing();
    used.add(entry.seq);
    return schema.parse(entry.result);
  }
  function included(source: Entry[], txHash: string, used: Set<number>) {
    const value = latest(
      source,
      'skandha_explorer_getTransaction',
      lifecycle,
      used,
      txHash,
    );
    if (!value.admission) throw new Missing();
    expect(
      same(value.hash, txHash) &&
        same(value.admission.txHash, txHash) &&
        value.admission.outcome === 'included',
    );
    if (
      !value.events.some(
        (event) =>
          same(event.txHash, txHash) &&
          event.kind === 'included' &&
          event.status === 'OnChain',
      )
    )
      throw new Missing();
  }

  function absent(source: Entry[], txHash: string, used: Set<number>) {
    const entry = source
      .filter(
        (item) =>
          item.purpose === 'SCENARIO' &&
          item.method === 'eth_getFrameTransactionByHash' &&
          item.outcome === 'RESULT' &&
          item.requestHash !== undefined &&
          same(item.requestHash, txHash),
      )
      .at(-1);
    if (!entry) throw new Missing();
    used.add(entry.seq);
    expect(entry.result === null);
  }
  function entryAt(source: Entry[], txHash: string, used: Set<number>) {
    const value = latest(
      source,
      'eth_getFrameTransactionByHash',
      metadata.extend({ lastUpdatedTime: quantity }),
      used,
      txHash,
    );
    expect(same(value.txHash, txHash));
    return value.lastUpdatedTime;
  }
  function lifecycleAt(
    source: Entry[],
    txHash: string,
    outcome: string,
    used: Set<number>,
  ) {
    const value = latest(
      source,
      'skandha_explorer_getTransaction',
      lifecycle,
      used,
      txHash,
    );
    if (!value.admission) throw new Missing();
    expect(
      same(value.hash, txHash) &&
        same(value.admission.txHash, txHash) &&
        value.admission.outcome === outcome,
    );
    expect(
      value.events.some(
        (event) =>
          same(event.txHash, txHash) &&
          event.kind === outcome &&
          (outcome !== 'dropped' || event.status === 'Cancelled'),
      ),
    );
  }
  function ttl(used: Set<number>, claimed: number) {
    const value = latest(
      ranges.get('admit-base') ?? [],
      'skandha_config',
      z.object({ useropsTTL: z.number().int().positive() }),
      used,
    );
    expect(
      value.useropsTTL ===
        (report.scenarioId === 'keyed-replacement-ttl' ? 30 : 300) &&
        value.useropsTTL === claimed &&
        String(value.useropsTTL) === report.environment.useropsTTL,
    );
    return BigInt(value.useropsTTL) * 1000n;
  }

  for (const step of report.steps) {
    if (
      [
        'confirm-live-predecessor',
        'observe-cancelled',
        'observe-recancelled',
      ].includes(step.id)
    ) {
      check(step, 'recorded-entry-time-and-status', (source, used) => {
        const claim = z
          .object({ hash, lastUpdatedTime: quantity, status: text })
          .parse(step.observed);
        const at = entryAt(source, claim.hash, used);
        const value = latest(
          source,
          'skandha_frameTransactionStatus',
          transactionStatus,
          used,
          claim.hash,
        );
        const expected =
          step.id === 'confirm-live-predecessor' ? 'New' : 'Cancelled';
        expect(
          value.status === expected &&
            claim.status === value.status &&
            BigInt(at) === BigInt(claim.lastUpdatedTime),
        );
        if (expected === 'Cancelled') {
          expect(step.observed.outcome === 'dropped');
          lifecycleAt(source, claim.hash, 'dropped', used);
        } else
          ttl(
            used,
            z.number().int().positive().parse(step.observed.ttlSeconds),
          );
      });
    } else if (
      ['verify-ttl-replacement', 'verify-terminal-replacement'].includes(
        step.id,
      )
    ) {
      check(step, 'recorded-replacement-window-and-history', (source, used) => {
        const claim = z
          .object({
            oldHash: hash,
            newHash: hash,
            elapsedMilliseconds: decimal,
            ttlSeconds: z.number().int().positive(),
            oldEntryRemoved: z.boolean(),
          })
          .parse(step.observed);
        const expired = step.id === 'verify-ttl-replacement';
        const previous =
          ranges.get(
            expired ? 'confirm-live-predecessor' : 'observe-cancelled',
          ) ?? [];
        const oldAt = entryAt(previous, claim.oldHash, used);
        const newAt = entryAt(source, claim.newHash, used);
        const claimedOld = quantity.parse(
          step.observed[expired ? 'oldLastUpdatedTime' : 'cancelledAt'],
        );
        const claimedNew = quantity.parse(
          step.observed[expired ? 'newLastUpdatedTime' : 'acceptedAt'],
        );
        const elapsed = BigInt(newAt) - BigInt(oldAt),
          limit = ttl(used, claim.ttlSeconds);
        expect(
          !same(claim.oldHash, claim.newHash) &&
            claim.oldEntryRemoved &&
            BigInt(claimedOld) === BigInt(oldAt) &&
            BigInt(claimedNew) === BigInt(newAt) &&
            BigInt(claim.elapsedMilliseconds) === elapsed &&
            (expired ? elapsed > limit : elapsed >= 0n && elapsed < limit),
        );
        absent(source, claim.oldHash, used);
        lifecycleAt(source, claim.oldHash, 'replaced', used);
      });
    } else if (
      step.id === 'verify-active-replacement' ||
      step.id === 'verify-reactivation'
    ) {
      check(step, 'recorded-active-entry-state', (source, used) => {
        const claim = z.object({ hash, status: text }).parse(step.observed);
        const at = entryAt(source, claim.hash, used);
        const value = latest(
          source,
          'skandha_frameTransactionStatus',
          transactionStatus,
          used,
          claim.hash,
        );
        expect(value.status === 'New' && claim.status === value.status);
        if (step.id === 'verify-reactivation') {
          const oldAt = entryAt(
            ranges.get('observe-recancelled') ?? [],
            claim.hash,
            used,
          );
          const elapsed = BigInt(at) - BigInt(oldAt);
          const limit = ttl(
            used,
            z.number().int().positive().parse(step.observed.ttlSeconds),
          );
          expect(
            BigInt(quantity.parse(step.observed.cancelledAt)) ===
              BigInt(oldAt) &&
              BigInt(quantity.parse(step.observed.acceptedAt)) === BigInt(at) &&
              BigInt(decimal.parse(step.observed.elapsedMilliseconds)) ===
                elapsed &&
              elapsed >= 0n &&
              elapsed < limit,
          );
        } else {
          const acceptedAt = entryAt(
            ranges.get('verify-ttl-replacement') ?? [],
            claim.hash,
            used,
          );
          expect(
            BigInt(quantity.parse(step.observed.lastUpdatedTime)) ===
              BigInt(at) &&
              BigInt(at) === BigInt(acceptedAt) &&
              step.observed.rejectedEntryAbsent === true,
          );
          const rejected = report.steps.find(
            (item) => item.id === 'reject-fee-after-refresh',
          );
          if (!rejected) throw new Missing();
          absent(source, hash.parse(rejected.observed.hash), used);
        }
      });
    } else if (step.id === 'explorer-reactivation-consistency') {
      check(
        step,
        'recorded-reactivation-verdict-and-responses',
        (_source, used) => {
          // This assertion shares the preceding step's RPCs; the failed verdict
          // itself must be preserved, not upgraded to an invariant PASS.
          const source = ranges.get('verify-reactivation') ?? [];
          const claim = z
            .object({
              hash,
              activeStatus: text,
              explorerOutcome: text,
              expectedOutcome: z.literal('accepted'),
            })
            .parse(step.observed);
          const active = latest(
            source,
            'skandha_frameTransactionStatus',
            transactionStatus,
            used,
            claim.hash,
          );
          const history = latest(
            source,
            'skandha_explorer_getTransaction',
            lifecycle,
            used,
            claim.hash,
          );
          if (!history.admission) throw new Missing();
          expect(
            same(history.hash, claim.hash) &&
              same(history.admission.txHash, claim.hash) &&
              active.status === 'New' &&
              claim.activeStatus === active.status &&
              claim.explorerOutcome === history.admission.outcome,
          );
          expect(
            (history.admission.outcome === claim.expectedOutcome) ===
              (step.result === 'PASS'),
          );
        },
        true,
      );
    } else if (
      ['observe-inclusion', 'observe-next-inclusion'].includes(step.id)
    ) {
      check(step, 'frame-receipt-and-inclusion', (source, used) => {
        const claim = z
          .object({ hash, blockNumber: quantity, frameStatuses: text })
          .parse(step.observed);
        const value = latest(
          source,
          'eth_getFrameTransactionReceipt',
          receipt,
          used,
          claim.hash,
        );
        expect(
          value.status === 'success' &&
            value.frameReceipts.length === 2 &&
            value.frameReceipts.every((frame) => frame.status === 'success'),
        );
        expect(
          BigInt(value.blockNumber) === BigInt(claim.blockNumber) &&
            value.frameReceipts.map((frame) => frame.status).join(',') ===
              claim.frameStatuses,
        );
        included(source, claim.hash, used);
        if (step.id === 'observe-inclusion') {
          const status = latest(
            source,
            'skandha_frameTransactionStatus',
            transactionStatus,
            used,
            claim.hash,
          );
          expect(
            status.status === 'OnChain' &&
              step.observed.status === status.status,
          );
        }
      });
    } else if (
      [
        'top-up-payer',
        'balance-control',
        'drain-payer',
        'drain-for-cancellation',
        'restore-payer',
        'drain-for-recancel',
        'restore-payer-again',
      ].includes(step.id)
    ) {
      check(step, 'canonical-receipt-status-block-and-gas', (source, used) => {
        const claim = canonicalReceipt.parse(step.observed);
        const value = latest(
          source,
          'eth_getTransactionReceipt',
          canonicalReceipt,
          used,
          claim.transactionHash,
        );
        const submitted = latest(source, 'eth_sendRawTransaction', hash, used);
        expect(
          same(submitted, claim.transactionHash) &&
            same(value.transactionHash, claim.transactionHash),
        );
        expect(
          value.status === '0x1' &&
            claim.status === value.status &&
            BigInt(claim.blockNumber) === BigInt(value.blockNumber) &&
            BigInt(claim.gasUsed) === BigInt(value.gasUsed),
        );
      });
    } else if (step.id === 'confirm-solvency-boundary') {
      check(step, 'initial-cost-balance-boundary', (source, used) => {
        const claim = z
          .object({ maximumCost: decimal, payerBalance: decimal })
          .parse(step.observed);
        const simulation = latest(
          source,
          'ethrex_simulateFrameTransaction',
          z.object({ maxCost: z.union([quantity, decimal]) }),
          used,
        );
        const balance = latest(source, 'eth_getBalance', quantity, used);
        const cost = BigInt(simulation.maxCost),
          available = BigInt(balance);
        expect(
          cost === BigInt(claim.maximumCost) &&
            available === BigInt(claim.payerBalance) &&
            cost <= available &&
            cost * 2n > available,
        );
      });
    } else if (step.id === 'confirm-pending-order') {
      check(step, 'distinct-entry-timestamp-order', (source, used) => {
        const claim = z
          .object({
            oldestHash: hash,
            newestHash: hash,
            oldestAt: quantity,
            newestAt: quantity,
          })
          .parse(step.observed);
        const older = latest(
          source,
          'eth_getFrameTransactionByHash',
          metadata,
          used,
          claim.oldestHash,
        );
        const newer = latest(
          source,
          'eth_getFrameTransactionByHash',
          metadata,
          used,
          claim.newestHash,
        );
        const oldestAt = older.submittedTime ?? older.lastUpdatedTime;
        const newestAt = newer.submittedTime ?? newer.lastUpdatedTime;
        if (!oldestAt || !newestAt) throw new Missing();
        expect(
          !same(claim.oldestHash, claim.newestHash) &&
            BigInt(oldestAt) === BigInt(claim.oldestAt) &&
            BigInt(newestAt) === BigInt(claim.newestAt) &&
            BigInt(oldestAt) < BigInt(newestAt),
        );
      });
    } else if (step.id === 'verify-solvency-eviction') {
      check(step, 'new-entry-status-and-enforcement-marker', (source, used) => {
        const claim = z
          .object({
            oldestHash: hash,
            newestHash: hash,
            oldestStatus: text,
            newestStatus: text,
            balanceEnforcement: z.boolean(),
          })
          .parse(step.observed);
        const older = latest(
          source,
          'skandha_frameTransactionStatus',
          transactionStatus,
          used,
          claim.oldestHash,
        );
        const newer = latest(
          source,
          'skandha_frameTransactionStatus',
          transactionStatus,
          used,
          claim.newestHash,
        );
        const entry = latest(
          source,
          'eth_getFrameTransactionByHash',
          metadata,
          used,
          claim.newestHash,
        );
        const dropped = latest(
          source,
          'skandha_explorer_getTransaction',
          lifecycle,
          used,
          claim.newestHash,
        );
        expect(
          older.status === 'New' &&
            newer.status === 'Cancelled' &&
            entry.balanceEnforcement &&
            dropped.admission?.outcome === 'dropped' &&
            same(dropped.admission.txHash, claim.newestHash),
        );
        expect(
          claim.oldestStatus === older.status &&
            claim.newestStatus === newer.status &&
            claim.balanceEnforcement === entry.balanceEnforcement,
        );
      });
    } else if (step.id === 'verify-survivor-obligations') {
      check(
        step,
        'recorded-cost-multiset-and-balance-arithmetic',
        (_source, used) => {
          const claim = z
            .object({
              balance: decimal,
              oldestCost: decimal,
              newestCost: decimal,
              combinedCost: decimal,
            })
            .parse(step.observed);
          const source = ranges.get('drain-payer') ?? [];
          const simulations = results(
            source,
            'ethrex_simulateFrameTransaction',
          );
          if (simulations.length !== 2) throw new Missing();
          const costs = simulations
            .map((entry) => {
              used.add(entry.seq);
              return BigInt(
                z
                  .object({ maxCost: z.union([quantity, decimal]) })
                  .parse(entry.result).maxCost,
              ).toString();
            })
            .sort();
          const balance = BigInt(
            latest(
              ranges.get('verify-solvency-eviction') ?? [],
              'eth_getBalance',
              quantity,
              used,
            ),
          );
          const older = BigInt(claim.oldestCost),
            newer = BigInt(claim.newestCost);
          expect(
            isDeepStrictEqual(
              costs,
              [older.toString(), newer.toString()].sort(),
            ),
          );
          expect(
            balance === BigInt(claim.balance) &&
              older + newer === BigInt(claim.combinedCost) &&
              older <= balance &&
              newer <= balance &&
              older + newer > balance,
          );
        },
      );
    }
  }
  const status: Status = checks.some((item) => item.status === 'CONTRADICTED')
    ? 'CONTRADICTED'
    : report.result !== 'PASS' ||
        !eligible ||
        !report.evidence?.complete ||
        !checks.length ||
        checks.some((item) => item.status === 'INSUFFICIENT')
      ? 'INSUFFICIENT'
      : 'CONSISTENT';
  return {
    scope: 'SELECTED_SAVED_OUTPUT_CONSISTENCY' as const,
    runId: report.runId,
    requirements,
    recordedRunResult: report.result,
    status,
    fullScenarioRevalidated: false as const,
    checks,
    notReevaluatedSteps: [...unsupportedSteps],
    limitations,
  };
}
