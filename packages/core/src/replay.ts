import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { definitions, runReport } from './scenario.js';
import type { RunReport } from './scenario.js';
import { resetSource, minedResetSource } from './local/reset.js';

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

function compareFreshRuns(baselineInput: RunReport, rerunInput: RunReport) {
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

function initialStateObserved(report: RunReport) {
  const firstSubmission =
    report.evidence?.entries.find(
      (entry) => entry.method === 'eth_sendFrameTransaction',
    )?.seq ?? 0;
  return (
    report.evidence?.entries.some((entry) => {
      const value = entry.result as { number?: unknown; hash?: unknown } | null;
      return (
        entry.seq < firstSubmission &&
        entry.method === 'eth_getBlockByNumber' &&
        entry.channel === 'EXECUTION' &&
        entry.outcome === 'RESULT' &&
        value?.number === '0x0' &&
        value.hash === report.environment.initialBlockHash
      );
    }) ?? false
  );
}

export function genesisResetPlan(input: RunReport) {
  const report = runReport.parse(input);
  const plan = replayPlan(report);
  if (
    plan.mining ||
    report.scenarioId !== 'keyed-replacement-ttl' ||
    !report.evidence?.complete ||
    !['PASS', 'FAIL'].includes(report.result) ||
    report.environment.initialBlockNumber !== '0x0' ||
    !initialStateObserved(report) ||
    report.environment.useropsTTL !== '30' ||
    !report.steps.some(
      (step) => step.id === 'fixture-cleanup' && step.result === 'PASS',
    )
  )
    throw new Error(
      'Genesis reset requires a complete admission-only TTL run with recorded initial state',
    );
  const fixtureSource = resetSource.parse({
    runId: report.runId,
    genesisSha256: report.environment.genesisSha256,
    executionImage: report.environment.executionImage,
    sidecarImage: report.environment.sidecarImage,
    initialBlockHash: report.environment.initialBlockHash,
  });
  return {
    ...plan,
    mode: 'GENESIS_RESET_RERUN' as const,
    fixtureSource,
    command: `npm run --silent aftershock -- replay ${report.runId} --local --reset`,
    requirements: [
      'Cached identical pinned images',
      'Local Docker engine',
      'Original private .local/<run-id>/keys.json with restrictive Linux permissions',
      'Reconstructed pinned genesis and empty disposable node/sidecar state',
    ],
    limitations: [
      'Admission-only TTL scenario; mined chain snapshots are unsupported.',
      'Restores initial genesis and signing inputs, not historical timestamps, explorer boot IDs or exact execution.',
      'Private keys remain local and are never included in reports or commands.',
      'Digests establish stored input consistency, not independent authorship or node attestation.',
    ],
  };
}

export function compareGenesisResetRuns(
  baselineInput: RunReport,
  rerunInput: RunReport,
) {
  const baseline = runReport.parse(baselineInput);
  const rerun = runReport.parse(rerunInput);
  const plan = genesisResetPlan(baseline);
  const basic = compareFreshRuns(baseline, rerun);
  const requests = (report: RunReport) =>
    report.evidence?.entries
      .filter(
        (entry) =>
          entry.method === 'eth_sendFrameTransaction' &&
          entry.channel === 'SIDECAR' &&
          entry.purpose === 'SCENARIO',
      )
      .map((entry) => entry.requestSha256) ?? [];
  const originalRequests = requests(baseline);
  const resetChecks = {
    linkedBaseline:
      rerun.environment.fixtureInputMode === 'GENESIS_RESET' &&
      rerun.environment.resetBaselineRunId === baseline.runId,
    sameGenesis:
      rerun.environment.genesisSha256 === baseline.environment.genesisSha256,
    sameInitialBlock:
      rerun.environment.initialBlockNumber === '0x0' &&
      rerun.environment.initialBlockHash ===
        baseline.environment.initialBlockHash &&
      initialStateObserved(rerun),
    sameSignedRequests:
      baseline.evidence?.complete === true &&
      rerun.evidence?.complete === true &&
      originalRequests.length === 5 &&
      isDeepStrictEqual(originalRequests, requests(rerun)),
  };
  const resetInputsMatch = Object.values(resetChecks).every(Boolean);
  return {
    ...basic,
    ...plan,
    resetChecks,
    resetInputsMatch,
    comparison:
      !basic.environmentDifferences.length && !resetInputsMatch
        ? 'RESET_INPUTS_DIFFER'
        : basic.comparison,
    bothRunsPassed: basic.bothRunsPassed && resetInputsMatch,
  };
}

export function compareRuns(baseline: RunReport, rerun: RunReport) {
  const parsed = runReport.parse(rerun);
  if (parsed.environment.fixtureInputMode === 'MINED_CHECKPOINT_RESET')
    return compareMinedCheckpointRuns(baseline, parsed);
  return parsed.environment.fixtureInputMode === 'GENESIS_RESET'
    ? compareGenesisResetRuns(baseline, parsed)
    : compareFreshRuns(baseline, parsed);
}

function checkpointHeadObserved(
  report: RunReport,
  number: string,
  blockHash: string,
) {
  const first =
    report.evidence?.entries.find(
      (entry) => entry.method === 'eth_sendFrameTransaction',
    )?.seq ?? 0;
  return (
    report.evidence?.entries.some((entry) => {
      const value = entry.result as { number?: unknown; hash?: unknown } | null;
      return (
        entry.seq < first &&
        entry.channel === 'EXECUTION' &&
        entry.method === 'eth_getBlockByNumber' &&
        entry.outcome === 'RESULT' &&
        value?.number === number &&
        value.hash === blockHash
      );
    }) ?? false
  );
}

export function minedCheckpointPlan(input: RunReport) {
  const report = runReport.parse(input);
  const plan = replayPlan(report);
  const env = report.environment;
  if (
    !plan.mining ||
    report.scenarioId !== 'keyed-nonce-lifecycle' ||
    env.runtimeStateMode !== 'MANAGED_PRIVATE_DIRECTORIES' ||
    env.useropsTTL !== '300' ||
    !report.evidence?.complete ||
    !['PASS', 'FAIL'].includes(report.result) ||
    !report.steps.some(
      (step) => step.id === 'fixture-cleanup' && step.result === 'PASS',
    ) ||
    !checkpointHeadObserved(
      report,
      env.checkpointBlockNumber ?? '',
      env.checkpointBlockHash ?? '',
    )
  )
    throw new Error(
      'Mined reset requires a complete checkpoint-enabled keyed-nonce run',
    );
  const fixtureSource = minedResetSource.parse({
    runId: report.runId,
    genesisSha256: env.genesisSha256,
    executionImage: env.executionImage,
    sidecarImage: env.sidecarImage,
    initialBlockHash: env.checkpointBlockHash,
    initialBlockNumber: env.checkpointBlockNumber,
    checkpointId: env.checkpointId,
    manifestSha256: env.checkpointManifestSha256,
    consensusImage: env.consensusImage,
    genesisGeneratorImage: env.genesisGeneratorImage,
  });
  return {
    ...plan,
    mode: 'MINED_CHECKPOINT_RERUN' as const,
    fixtureSource,
    command: `npm run --silent aftershock -- replay ${report.runId} --local --mine --reset`,
    requirements: [
      'Identical cached pinned images',
      'Private Linux .local/<baseline-run-id> keys and version-2 checkpoint',
      'Stopped original fixture; fresh owned isolated containers and network',
    ],
    limitations: [
      'Restores pre-scenario execution, beacon, validator and sidecar disk state.',
      'Explorer memory/boot IDs, wall-clock time and subsequent block hashes/timing are new.',
      'Compares signing request digests, restored head, environment and action verdicts; not exact historical execution.',
      'Private checksums establish consistency, not independent attestation.',
    ],
  };
}

export function compareMinedCheckpointRuns(
  baselineInput: RunReport,
  rerunInput: RunReport,
) {
  const baseline = runReport.parse(baselineInput);
  const rerun = runReport.parse(rerunInput);
  const plan = minedCheckpointPlan(baseline);
  const basic = compareFreshRuns(baseline, rerun);
  const source = plan.fixtureSource;
  const requests = (report: RunReport) =>
    report.evidence?.entries
      .filter(
        (entry) =>
          ['eth_sendFrameTransaction', 'eth_sendRawTransaction'].includes(
            entry.method,
          ) && entry.purpose === 'SCENARIO',
      )
      .map(
        (entry) => `${entry.channel}:${entry.method}:${entry.requestSha256}`,
      ) ?? [];
  const original = requests(baseline);
  const resetChecks = {
    linkedBaseline:
      rerun.environment.fixtureInputMode === 'MINED_CHECKPOINT_RESET' &&
      rerun.environment.resetBaselineRunId === baseline.runId,
    sameCheckpoint:
      rerun.environment.checkpointId === source.checkpointId &&
      rerun.environment.checkpointManifestSha256 === source.manifestSha256,
    sameGenesis: rerun.environment.genesisSha256 === source.genesisSha256,
    sameInitialBlock:
      rerun.environment.restoredBlockNumber === source.initialBlockNumber &&
      rerun.environment.restoredBlockHash === source.initialBlockHash &&
      checkpointHeadObserved(
        rerun,
        source.initialBlockNumber,
        source.initialBlockHash,
      ),
    sameSignedRequests:
      baseline.evidence?.complete === true &&
      rerun.evidence?.complete === true &&
      original.length === 11 &&
      isDeepStrictEqual(original, requests(rerun)),
  };
  const resetInputsMatch = Object.values(resetChecks).every(Boolean);
  return {
    ...basic,
    ...plan,
    resetChecks,
    resetInputsMatch,
    comparison:
      !basic.environmentDifferences.length && !resetInputsMatch
        ? 'RESET_INPUTS_DIFFER'
        : basic.comparison,
    bothRunsPassed: basic.bothRunsPassed && resetInputsMatch,
  };
}
