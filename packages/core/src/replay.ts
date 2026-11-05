import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { definitions, runReport } from './scenario.js';
import type { RunReport } from './scenario.js';

const fingerprintFields = [
  'executionImage',
  'sidecarImage',
  'chainId',
  'networkInternal',
  'publishedPorts',
  'bundlingMode',
  'consensusImage',
  'genesisGeneratorImage',
  'fixtureMode',
  'clientVersion',
  'useropsTTL',
] as const;
const digest = (report: RunReport) =>
  createHash('sha256').update(JSON.stringify(report)).digest('hex');

export function replayPlan(input: RunReport) {
  const report = runReport.parse(input);
  if (report.endpointClass !== 'ISOLATED_LOCAL')
    throw new Error('Only isolated local reports can be rerun');
  if (!isDeepStrictEqual(report.definition, definitions[report.scenarioId]))
    throw new Error('Saved definition differs from the current implementation');
  const mining = report.environment.fixtureMode === 'mining';
  if (
    !['executionImage', 'sidecarImage', 'genesisSha256'].every((key) =>
      Boolean(report.environment[key]),
    ) ||
    report.environment.chainId !== '0x9' ||
    report.environment.networkInternal !== 'true' ||
    report.environment.publishedPorts !== 'none' ||
    report.environment.bundlingMode !== 'manual' ||
    !['admission', 'mining'].includes(report.environment.fixtureMode ?? '') ||
    (mining &&
      (!report.environment.consensusImage ||
        !report.environment.genesisGeneratorImage))
  )
    throw new Error('Saved fixture requirements are incomplete or unsupported');
  return {
    mode: 'FRESH_STATE_RERUN' as const,
    exactHistoricalReplay: false as const,
    baselineRunId: report.runId,
    baselineSha256: digest(report),
    scenarioId: report.scenarioId,
    seed: report.seed,
    mining,
    command: `npm run --silent aftershock -- replay ${report.runId} --local${mining ? ' --mine' : ''}`,
    requirements: [
      'Cached pinned images',
      'Local Docker engine',
      'Fresh isolated fixture; no snapshot restoration',
    ],
    limitations: [
      'New keys, genesis, hashes, balances and timings; seed does not reproduce private state.',
      'Comparison covers action verdicts and stable environment fields, not raw observations or exact execution.',
      'Matching blocked or inconclusive results do not establish invariant success.',
      'Checksums detect changes, not malicious authorship or fabricated evidence.',
    ],
  };
}

export function compareRuns(baselineInput: RunReport, rerunInput: RunReport) {
  const baseline = runReport.parse(baselineInput);
  const rerun = runReport.parse(rerunInput);
  const plan = replayPlan(baseline);

  if (
    baseline.runId === rerun.runId ||
    plan.scenarioId !== rerun.scenarioId ||
    plan.seed !== rerun.seed ||
    rerun.endpointClass !== 'ISOLATED_LOCAL' ||
    !isDeepStrictEqual(baseline.definition, rerun.definition)
  )
    throw new Error('Incompatible rerun identity or scenario requirements');
  const environmentDifferences = fingerprintFields.filter(
    (key) => baseline.environment[key] !== rerun.environment[key],
  );
  const ids = [
    ...new Set([...baseline.steps, ...rerun.steps].map((step) => step.id)),
  ];
  const actions = ids.map((id) => ({
    id,
    baseline:
      baseline.steps.find((step) => step.id === id)?.result ?? 'NOT_OBSERVED',
    rerun: rerun.steps.find((step) => step.id === id)?.result ?? 'NOT_OBSERVED',
  }));
  const verdictsMatch = actions.every(
    (action) => action.baseline === action.rerun,
  );
  return {
    ...plan,
    rerunRunId: rerun.runId,
    rerunSha256: digest(rerun),
    baselineResult: baseline.result,
    rerunResult: rerun.result,
    environmentDifferences,
    verdictsMatch,
    actions,
    comparison: environmentDifferences.length
      ? 'ENVIRONMENT_DIFFERENT'
      : verdictsMatch
        ? 'VERDICTS_MATCH'
        : 'VERDICTS_DIFFER',
    bothRunsPassed:
      !environmentDifferences.length &&
      verdictsMatch &&
      baseline.result === 'PASS' &&
      rerun.result === 'PASS',
  };
}
