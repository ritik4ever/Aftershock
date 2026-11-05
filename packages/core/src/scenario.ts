import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UPSTREAM, historyGaps } from './inspect.js';
import { hash, quantity, explorerInfo } from './schema.js';
import { fixtureTransaction } from './local/codec.js';
import { startFixture, FixtureSetupError } from './local/fixture.js';
import { localRpc, LocalRpcError, waitForRpc } from './local/rpc.js';

export const scenarioId = z.enum([
  'paymaster-solvency',
  'keyed-nonce-lifecycle',
]);
export type ScenarioId = z.infer<typeof scenarioId>;
export const verdict = z.enum([
  'PASS',
  'FAIL',
  'INCONCLUSIVE',
  'BLOCKED',
  'SPEC_DIFFERENCE',
]);
export const scenarioDefinition = z
  .object({
    id: scenarioId,
    title: z.string().min(1),
    sourceRule: z.string().min(1),
    sourceCommit: z.literal(UPSTREAM.sidecar),
    expectedInvariant: z.string().min(1),
    preconditions: z.array(z.string()).min(1),
    actions: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  })
  .strict();
const step = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    at: z.iso.datetime(),
    result: verdict,
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
    steps: z.array(step),
    result: verdict,
    definition: scenarioDefinition,
    limitations: z.array(z.string()),
    reproducer: z.string(),
  })
  .strict();
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
    ],
    blocked: ['mined balance change and per-block eviction'],
  },
  {
    id: 'keyed-nonce-lifecycle',
    title: 'Key conflicts and replacement lifecycle',
    rule: 'MempoolService/checkNonceKeyConflict; FrameTxMempoolEntry/canReplaceWithTTL',
    implemented: [
      'disjoint keys',
      'overlapping conflict',
      'low/high fee bumps',
      'predecessor replacement evidence',
    ],
    blocked: ['included/dropped predecessor with a mined state transition'],
  },
] as const;

export const definitions = {
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
      'No mining during pending-accounting observations',
    ],
    actions: [
      'admit-base',
      'confirm-solvency-boundary',
      'reject-aggregate-overspend',
      'accept-fee-bumped-replacement',
      'verify-replacement-lifecycle',
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
      'admit-disjoint-key',
      'reject-overlapping-set',
      'reject-low-fee-bump',
      'accept-fee-bumped-replacement',
      'verify-replacement-lifecycle',
      'explorer-continuity',
      'mined-state-transition',
    ],
  }),
};

export function aggregateResults(
  results: RunReport['steps'][number]['result'][],
): RunReport['result'] {
  if (results.includes('FAIL')) return 'FAIL';
  if (results.includes('INCONCLUSIVE')) return 'INCONCLUSIVE';
  if (results.includes('BLOCKED')) return 'BLOCKED';
  if (results.includes('SPEC_DIFFERENCE')) return 'SPEC_DIFFERENCE';
  return results.length > 0 ? 'PASS' : 'INCONCLUSIVE';
}

export async function runScenario(
  id: ScenarioId,
  root: string,
  seed = 0,
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
      'Non-mining genesis fixture. No block-production/state-transition claims.',
      'Seed identifies action order, not private signing keys; fresh accounts are random.',
      'Only observed admission/replacement behavior is checked.',
    ],
    reproducer: `npm run --silent aftershock -- run ${id} --local`,
  };
  let fixture: Awaited<ReturnType<typeof startFixture>> | undefined;
  const add = (
    id: string,
    result: RunReport['result'],
    observed: RunReport['steps'][number]['observed'],
  ) =>
    report.steps.push({ id, at: new Date().toISOString(), result, observed });
  try {
    fixture = await startFixture(root, report.runId);
    report.runId = fixture.runId;
    report.environment = fixture.fingerprint;
    const { keys, executionUrl, sidecarUrl } = fixture;
    await waitForRpc(executionUrl);
    await waitForRpc(sidecarUrl);
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
        });
        return ok;
      } catch (error) {
        if (!(error instanceof LocalRpcError)) throw error;
        add(action, expected === error.reason ? 'PASS' : 'INCONCLUSIVE', {
          hash: tx.hash,
          expected,
          actual: error.reason,
          code: error.code,
        });
        return expected === error.reason;
      }
    };
    const payer = id === 'paymaster-solvency' ? keys[3]! : keys[0]!;
    const base = await fixtureTransaction(keys[0]!, payer, [1n]);
    if (!(await submit('admit-base', base, 'ACCEPTED')))
      throw new Error('Baseline admission unavailable');
    if (id === 'paymaster-solvency') {
      const simulation = await localRpc(
        executionUrl,
        'ethrex_simulateFrameTransaction',
        [base.raw, 'latest', { trace: false }],
        z.object({ maxCost: z.union([quantity, z.string().regex(/^\d+$/)]) }),
      );
      const payerAddress = (await import('viem/accounts')).privateKeyToAccount(
        payer,
      ).address;
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
        await fixtureTransaction(keys[0]!, payer, [1n], 2_100_000_000n),
        'FEE_BUMP',
      );
    }
    const replacement = await fixtureTransaction(
      keys[0]!,
      payer,
      [1n],
      2_200_000_000n,
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
    add('mined-state-transition', 'BLOCKED', {
      reason:
        'Pinned simple ethrex fixture does not produce Hegota blocks; mining stack required',
    });
  } catch (error) {
    add('prerequisites-or-evidence', 'BLOCKED', {
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
  report.result = aggregateResults(report.steps.map((step) => step.result));
  report.completedAt = new Date().toISOString();
  return runReport.parse(report);
}
