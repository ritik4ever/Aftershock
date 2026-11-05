import {
  withRpcEvidence,
  evidenceSnapshot,
  evidencePosition,
  rpcEvidence,
} from './evidence.js';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { UPSTREAM, historyGaps } from './inspect.js';
import { hash, quantity, explorerInfo } from './schema.js';
import { fixtureTransaction } from './local/codec.js';
import { startFixture, FixtureSetupError } from './local/fixture.js';
import { localRpc, LocalRpcError, waitForRpc } from './local/rpc.js';
import { waitForMining } from './local/lifecycle.js';
import { keyedReplacementTTL } from './local/ttl.js';
import { minedKeyedLifecycle, minedPayerLifecycle } from './local/scenarios.js';

export const scenarioId = z.enum([
  'paymaster-solvency',
  'keyed-nonce-lifecycle',
  'keyed-replacement-ttl',
]);
export type ScenarioId = z.infer<typeof scenarioId>;
export const verdict = z.enum([
  'PASS',
  'FAIL',
  'INCONCLUSIVE',
  'BLOCKED',
  'SPEC_DIFFERENCE',
]);
export type Verdict = z.infer<typeof verdict>;
export const scenarioDefinition = z
  .object({
    id: scenarioId,
    title: z.string().min(1),
    sourceRule: z.string().min(1),
    sourceCommit: z.literal(UPSTREAM.sidecar),
    expectedInvariant: z.string().min(1),
    preconditions: z.array(z.string()).min(1),
    actions: z
      .array(z.string().regex(/^[a-z0-9-]+$/))
      .min(1)
      .refine(
        (actions) =>
          new Set(actions).size === actions.length &&
          actions.every(
            (id) =>
              !['fixture-cleanup', 'prerequisites-or-evidence'].includes(id),
          ),
        'Scenario actions must be unique and cannot use reserved step IDs',
      ),
  })
  .strict();
const step = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    at: z.iso.datetime(),
    result: verdict,
    evidenceThrough: z.number().int().nonnegative().optional(),
    observed: z.record(
      z.string(),
      z.union([z.string(), z.boolean(), z.number().finite()]),
    ),
  })
  .strict();
export const runReport = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.uuid(),
    scenarioId,
    seed: z.number().int().nonnegative(),
    endpointClass: z.enum(['ISOLATED_LOCAL', 'MOCK_UNIT_TEST']),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    sourcePins: z
      .object({
        workshop: z.literal(UPSTREAM.workshop),
        sidecar: z.literal(UPSTREAM.sidecar),
        ethrex: z.literal(UPSTREAM.ethrex),
      })
      .strict(),
    environment: z.record(z.string(), z.string()),
    evidence: rpcEvidence.optional(),
    steps: z.array(step),
    result: verdict,
    definition: scenarioDefinition,
    limitations: z.array(z.string()),
    reproducer: z.string(),
  })
  .strict()
  .superRefine((report, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: 'custom', message });
    if (report.definition.id !== report.scenarioId)
      issue('Scenario definition mismatch');
    if (
      report.result !==
      aggregateResults(report.steps.map((step) => step.result))
    )
      issue('Inconsistent aggregate verdict');
    if (report.evidence) {
      let cursor = 0;
      for (const step of report.steps) {
        if (
          step.evidenceThrough === undefined ||
          step.evidenceThrough < cursor ||
          step.evidenceThrough > report.evidence.attempts
        )
          issue('Invalid evidence reference');
        cursor = step.evidenceThrough ?? cursor;
      }
      if (cursor !== report.evidence.attempts)
        issue('Unreferenced RPC evidence');
      if (
        report.evidence.entries.some(
          (entry) =>
            Date.parse(entry.at) < Date.parse(report.startedAt) ||
            Date.parse(entry.at) > Date.parse(report.completedAt),
        )
      )
        issue('Invalid evidence chronology');
      if (!report.evidence.complete && report.result === 'PASS')
        issue('Incomplete evidence cannot PASS');
    } else if (report.steps.some((step) => step.evidenceThrough !== undefined))
      issue('Missing referenced evidence');
    const seen = new Set<string>();
    let previousAction = -1;
    let previousTime = Date.parse(report.startedAt);
    for (const step of report.steps) {
      if (seen.has(step.id)) issue('Duplicate step ID');
      seen.add(step.id);
      const index = report.definition.actions.indexOf(step.id);
      if (
        index === -1 &&
        !['fixture-cleanup', 'prerequisites-or-evidence'].includes(step.id)
      )
        issue('Undeclared action');
      if (index !== -1) {
        if (index <= previousAction) issue('Actions are out of order');
        previousAction = index;
      }
      const at = Date.parse(step.at);
      if (at < previousTime || at > Date.parse(report.completedAt))
        issue('Invalid action chronology');
      previousTime = at;
    }
    if (Date.parse(report.completedAt) < previousTime)
      issue('Invalid completion time');
    if (
      report.result === 'PASS' &&
      (report.definition.actions.some((id) => !seen.has(id)) ||
        !report.steps.some(
          (step) => step.id === 'fixture-cleanup' && step.result === 'PASS',
        ))
    )
      issue('PASS requires every declared action and verified cleanup');
  });
export type RunReport = z.infer<typeof runReport>;

export const scenarioCatalogue = [
  {
    id: 'paymaster-solvency',
    title: 'Shared payer admission and replacement obligations',
    rule: 'MempoolService/checkBalanceObligations',
    implemented: [
      'fitting admission',
      'aggregate overspend rejection',
      'replacement excludes old obligation',
      'mined balance control and newest-first solvency eviction (--mine)',
    ],
    blocked: [
      'mined checks require --mine; submitted-entry exceptions remain outside this suite',
    ],
  },
  {
    id: 'keyed-nonce-lifecycle',
    title: 'Key conflicts and replacement lifecycle',
    rule: 'MempoolService/checkNonceKeyConflict; FrameTxMempoolEntry/canReplaceWithTTL',
    implemented: [
      'disjoint keys',
      'overlapping conflict',
      'low/high fee bumps',
      'independent maximum/priority fee thresholds and duplicate rejection',
      'predecessor replacement evidence',
      'canonical inclusion, stale-sequence rejection and next sequence (--mine)',
    ],
    blocked: [
      'mined checks require --mine; terminal/TTL exceptions remain outside this suite',
    ],
  },
  {
    id: 'keyed-replacement-ttl',
    title: 'Keyed replacement TTL expiry and refresh',
    rule: 'FrameTxMempoolEntry/canReplaceWithTTL; MempoolService/validateReplaceability',
    implemented: [
      'pre-expiry fee rejection',
      'live duplicate rejection after expiry',
      'post-expiry below-bump replacement',
      'refreshed timestamp requires fee bump again',
    ],
    blocked: [
      'Exact expiry boundary and terminal-status exceptions are outside this case; no inclusion claim',
    ],
  },
] as const;

export const definitions = {
  'keyed-replacement-ttl': scenarioDefinition.parse({
    id: 'keyed-replacement-ttl',
    title: scenarioCatalogue[2].title,
    sourceRule: scenarioCatalogue[2].rule,
    sourceCommit: UPSTREAM.sidecar,
    expectedInvariant:
      'Expiry permits a different below-bump same-slot candidate, but not a live duplicate; replacement refreshes the TTL.',
    preconditions: [
      'Owned isolated pinned processes with verified 30-second TTL',
      'Live New predecessor with unchanged lastUpdatedTime',
      'No block production required; no exact boundary or terminal-state claim',
    ],
    actions: [
      'admit-base',
      'confirm-live-predecessor',
      'reject-fee-before-ttl',
      'wait-for-ttl',
      'reject-duplicate-after-ttl',
      'accept-fee-after-ttl',
      'verify-ttl-replacement',
      'reject-fee-after-refresh',
      'verify-active-replacement',
      'explorer-continuity',
    ],
  }),
  'paymaster-solvency': scenarioDefinition.parse({
    id: 'paymaster-solvency',
    title: scenarioCatalogue[0].title,
    sourceRule: scenarioCatalogue[0].rule,
    sourceCommit: UPSTREAM.sidecar,
    expectedInvariant:
      'Pending payer obligations fit its balance; a replacement excludes the displaced obligation.',
    preconditions: [
      'Owned isolated pinned processes',
      'One transaction fits the fresh payer balance but two do not',
      'Manual bundling preserves pending entries during accounting observations',
    ],
    actions: [
      'admit-base',
      'confirm-solvency-boundary',
      'reject-aggregate-overspend',
      'accept-fee-bumped-replacement',
      'verify-replacement-lifecycle',
      'top-up-payer',
      'admit-second-obligation',
      'confirm-pending-order',
      'balance-control',
      'verify-control-survival',
      'drain-payer',
      'verify-solvency-eviction',
      'verify-survivor-obligations',
      'explorer-continuity',
      'mined-state-transition',
    ],
  }),
  'keyed-nonce-lifecycle': scenarioDefinition.parse({
    id: 'keyed-nonce-lifecycle',
    title: scenarioCatalogue[1].title,
    sourceRule: scenarioCatalogue[1].rule,
    sourceCommit: UPSTREAM.sidecar,
    expectedInvariant:
      'Disjoint keys coexist; overlapping other slots conflict; same-slot replacement must satisfy both fee thresholds.',
    preconditions: [
      'Owned isolated pinned processes',
      'Fresh funded sender with sequence zero',
      'All replacements occur before TTL expiry',
    ],
    actions: [
      'admit-base',
      'reject-duplicate',
      'admit-disjoint-key',
      'reject-overlapping-set',
      'reject-low-fee-bump',
      'reject-low-priority-fee-bump',
      'accept-fee-bumped-replacement',
      'verify-replacement-lifecycle',
      'canonical-submit-predecessor',
      'observe-inclusion',
      'reject-stale-sequence',
      'admit-next-sequence',
      'canonical-submit-next-sequence',
      'observe-next-inclusion',
      'verify-disjoint-survivor',
      'explorer-continuity',
      'mined-state-transition',
    ],
  }),
};

export function aggregateResults(results: Verdict[]): Verdict {
  if (results.includes('FAIL')) return 'FAIL';
  if (results.includes('INCONCLUSIVE')) return 'INCONCLUSIVE';
  if (results.includes('BLOCKED')) return 'BLOCKED';
  if (results.includes('SPEC_DIFFERENCE')) return 'SPEC_DIFFERENCE';
  return results.length > 0 ? 'PASS' : 'INCONCLUSIVE';
}

export function runScenario(
  id: ScenarioId,
  root: string,
  seed = 0,
  mining = false,
): Promise<RunReport> {
  return withRpcEvidence(() => executeScenario(id, root, seed, mining));
}

async function executeScenario(
  id: ScenarioId,
  root: string,
  seed = 0,
  mining = false,
): Promise<RunReport> {
  scenarioId.parse(id);
  z.number().int().nonnegative().parse(seed);
  const report: RunReport = {
    schemaVersion: 1,
    runId: randomUUID(),
    scenarioId: id,
    seed,
    endpointClass: 'ISOLATED_LOCAL',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    sourcePins: UPSTREAM,
    environment: {},
    steps: [],
    result: 'INCONCLUSIVE',
    definition: definitions[id],
    limitations: [
      mining
        ? 'Fresh staged-fork mining fixture; manual sidecar bundling and ordinary canonical transfers.'
        : 'Non-mining genesis fixture. No block-production/state-transition claims.',
      'Seed identifies action order, not private signing keys; fresh accounts are random.',
      id === 'keyed-replacement-ttl'
        ? 'Admission-only TTL expiry/refresh case; no exact boundary, inclusion or terminal/submitted-entry claim.'
        : 'Only the explicitly defined actions are checked; terminal/TTL and submitted-entry exceptions are outside this run.',
    ],
    reproducer: `npm run --silent aftershock -- run ${id} --local${mining ? ' --mine' : ''}`,
  };
  let fixture: Awaited<ReturnType<typeof startFixture>> | undefined;
  const add = (
    id: string,
    result: RunReport['result'],
    observed: RunReport['steps'][number]['observed'],
  ) =>
    report.steps.push({
      id,
      at: new Date().toISOString(),
      result,
      observed,
      evidenceThrough: evidencePosition(),
    });
  try {
    fixture = await startFixture(
      root,
      report.runId,
      mining,
      'manual',
      id === 'keyed-replacement-ttl' ? 30 : 300,
    );
    report.runId = fixture.runId;
    report.environment = fixture.fingerprint;
    const { keys, executionUrl, sidecarUrl } = fixture;
    await waitForRpc(executionUrl);
    await waitForRpc(sidecarUrl);
    if (mining) {
      const ready = await waitForMining(executionUrl);
      report.environment.readyBlock = ready.number;
      report.environment.readyBlockHash = ready.hash;
    }
    const before = await localRpc(
      sidecarUrl,
      'skandha_explorer_info',
      [],
      explorerInfo,
    );
    const clientVersion = await localRpc(
      executionUrl,
      'web3_clientVersion',
      [],
      z.string(),
    );
    if (!clientVersion.includes(UPSTREAM.ethrex))
      throw new Error('Execution version mismatch');
    report.environment.clientVersion = clientVersion;
    const configuration = await localRpc(
      sidecarUrl,
      'skandha_config',
      [],
      z.object({ useropsTTL: z.number().int().positive() }),
    );
    report.environment.useropsTTL = String(configuration.useropsTTL);
    const admissionStarted = Date.now();
    const submit = async (
      action: string,
      tx: Awaited<ReturnType<typeof fixtureTransaction>>,
      expected: string,
    ) => {
      try {
        const accepted = await localRpc(
          sidecarUrl,
          'eth_sendFrameTransaction',
          [tx.wire],
          hash,
        );
        const ok =
          expected === 'ACCEPTED' &&
          accepted.toLowerCase() === tx.hash.toLowerCase();
        add(action, ok ? 'PASS' : 'FAIL', {
          hash: tx.hash,
          expected,
          actual: 'ACCEPTED',
          maximumFee: tx.maximumFee,
          priorityFee: tx.priorityFee,
        });
        return ok;
      } catch (error) {
        if (!(error instanceof LocalRpcError)) throw error;
        add(action, expected === error.reason ? 'PASS' : 'INCONCLUSIVE', {
          hash: tx.hash,
          expected,
          actual: error.reason,
          code: error.code,
          maximumFee: tx.maximumFee,
          priorityFee: tx.priorityFee,
        });
        return expected === error.reason;
      }
    };
    if (id === 'keyed-replacement-ttl') {
      if (configuration.useropsTTL !== 30)
        throw new Error('TTL configuration mismatch');
      await keyedReplacementTTL(fixture, configuration.useropsTTL, add, submit);
    } else {
      const payer = id === 'paymaster-solvency' ? keys[3]! : keys[0]!;
      const priorityFee =
        id === 'keyed-nonce-lifecycle' ? 1_000_000_000n : 2_000_000_000n;
      const base = await fixtureTransaction(
        keys[0]!,
        payer,
        [1n],
        2_000_000_000n,
        priorityFee,
      );
      if (!(await submit('admit-base', base, 'ACCEPTED')))
        throw new Error('Baseline admission unavailable');
      if (id === 'paymaster-solvency') {
        const simulation = await localRpc(
          executionUrl,
          'ethrex_simulateFrameTransaction',
          [base.raw, 'latest', { trace: false }],
          z.object({ maxCost: z.union([quantity, z.string().regex(/^\d+$/)]) }),
        );
        const payerAddress = (
          await import('viem/accounts')
        ).privateKeyToAccount(payer).address;
        const balance = await localRpc(
          executionUrl,
          'eth_getBalance',
          [payerAddress, 'latest'],
          quantity,
        );
        const cost = BigInt(simulation.maxCost);
        if (!(cost <= BigInt(balance) && 2n * cost > BigInt(balance)))
          throw new Error('Balance boundary precondition unmet');
        add('confirm-solvency-boundary', 'PASS', {
          maximumCost: cost.toString(),
          payerBalance: BigInt(balance).toString(),
        });
        await submit(
          'reject-aggregate-overspend',
          await fixtureTransaction(keys[1]!, payer, [1n]),
          'BALANCE_OBLIGATIONS',
        );
      } else {
        await submit('reject-duplicate', base, 'DUPLICATE');
        await submit(
          'admit-disjoint-key',
          await fixtureTransaction(keys[0]!, payer, [2n]),
          'ACCEPTED',
        );
        await submit(
          'reject-overlapping-set',
          await fixtureTransaction(keys[0]!, payer, [1n, 3n]),
          'KEY_CONFLICT',
        );
        if (
          Date.now() - admissionStarted + 15_000 >=
          configuration.useropsTTL * 1000
        )
          throw new Error('Replacement TTL precondition expired');
        await submit(
          'reject-low-fee-bump',
          await fixtureTransaction(
            keys[0]!,
            payer,
            [1n],
            2_100_000_000n,
            1_100_000_000n,
          ),
          'FEE_BUMP',
        );
        await submit(
          'reject-low-priority-fee-bump',
          await fixtureTransaction(
            keys[0]!,
            payer,
            [1n],
            2_200_000_000n,
            1_050_000_000n,
          ),
          'FEE_BUMP',
        );
      }
      const replacement = await fixtureTransaction(
        keys[0]!,
        payer,
        [1n],
        2_200_000_000n,
        (priorityFee * 11n) / 10n,
      );
      await submit('accept-fee-bumped-replacement', replacement, 'ACCEPTED');
      const predecessor = await localRpc(
        sidecarUrl,
        'skandha_explorer_getTransaction',
        [base.hash],
        z.object({
          hash,
          admission: z.object({ outcome: z.string() }).nullable(),
        }),
      );
      const oldEntry = await localRpc(
        sidecarUrl,
        'eth_getFrameTransactionByHash',
        [base.hash],
        z.unknown(),
      );
      const newEntry = await localRpc(
        sidecarUrl,
        'eth_getFrameTransactionByHash',
        [replacement.hash],
        z.object({ txHash: hash }),
      );
      add(
        'verify-replacement-lifecycle',
        predecessor.hash === base.hash &&
          predecessor.admission?.outcome === 'replaced' &&
          oldEntry === null &&
          newEntry.txHash === replacement.hash
          ? 'PASS'
          : 'FAIL',
        {
          oldHash: base.hash,
          newHash: replacement.hash,
          oldOutcome: predecessor.admission?.outcome ?? 'MISSING',
          oldEntryRemoved: oldEntry === null,
        },
      );
      if (mining) {
        if (id === 'keyed-nonce-lifecycle')
          await minedKeyedLifecycle(fixture, replacement, add, submit);
        else await minedPayerLifecycle(fixture, replacement, add, submit);
      }
    }
    const after = await localRpc(
      sidecarUrl,
      'skandha_explorer_info',
      [],
      explorerInfo,
    );
    const gaps = historyGaps(before, after);
    add('explorer-continuity', gaps.length ? 'INCONCLUSIVE' : 'PASS', {
      bootId: after.bootId,
      gaps: gaps.join(','),
    });
    if (id !== 'keyed-replacement-ttl') {
      if (mining)
        add(
          'mined-state-transition',
          report.steps.every((step) => step.result === 'PASS')
            ? 'PASS'
            : 'INCONCLUSIVE',
          { fixtureMode: 'mining', scope: id },
        );
      else
        add('mined-state-transition', 'BLOCKED', {
          reason:
            'This run selected the non-mining fixture; rerun with --local --mine for staged mining',
        });
    }
  } catch (error) {
    const diagnosticStored = fixture
      ? await writeFile(
          resolve(root, '.local', report.runId, 'scenario-error.log'),
          String(error),
          { mode: 0o600, flag: 'wx' },
        ).then(
          () => true,
          () => false,
        )
      : false;
    add('prerequisites-or-evidence', 'BLOCKED', {
      diagnosticStored,
      reason:
        error instanceof FixtureSetupError
          ? error.stage
          : error instanceof LocalRpcError
            ? `RPC_${error.code}_${error.reason}`
            : 'RPC_SCHEMA_OR_SCENARIO_PRECONDITION',
      successInferred: false,
    });
  } finally {
    if (fixture) {
      try {
        await fixture.cleanup();
        add('fixture-cleanup', 'PASS', { removedOwnedResources: true });
      } catch {
        add('fixture-cleanup', 'BLOCKED', {
          reason: 'Owned resources require manual inspection',
        });
      }
    }
  }
  report.evidence = evidenceSnapshot();
  if (
    report.evidence &&
    !report.evidence.complete &&
    !report.steps.some((step) => step.id === 'prerequisites-or-evidence')
  )
    add('prerequisites-or-evidence', 'INCONCLUSIVE', {
      reason: 'RPC_EVIDENCE_INCOMPLETE',
      omitted: report.evidence.omitted,
      unavailable: report.evidence.unavailable,
    });
  report.result = aggregateResults(report.steps.map((step) => step.result));
  report.completedAt = new Date().toISOString();
  return runReport.parse(report);
}
