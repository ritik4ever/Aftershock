import {
  doctor,
  inspectTransaction,
  RpcFailure,
  UPSTREAM,
  hash,
  saveObservation,
  runScenario,
  scenarioCatalogue,
  scenarioId,
  saveRun,
  readRun,
  markdownReport,
  replayPlan,
  compareRuns,
} from '@aftershock/core';

const help = `Aftershock core integration
  npm run aftershock -- doctor
  npm run aftershock -- inspect <transaction-hash> [--save]
  npm run aftershock -- versions
  npm run aftershock -- scenarios
  npm run aftershock -- run <scenario-id> --local [--mine]
  npm run aftershock -- report <run-id> --format json|md
  npm run aftershock -- replay <run-id> --plan
  npm run aftershock -- replay <run-id> --local [--mine]
  npm run aftershock -- help

Read-only public-devnet doctor/inspect commands. --save writes under reports/.
run --local creates owned isolated Docker fixtures and never contacts public nodes.
Receipt absence is unavailable evidence, not proof that execution failed.
--mine uses cached mining images and waits for staged forks. Exact replay remains unimplemented.
`;

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === 'scenarios' && rest.length === 0) {
    process.stdout.write(`${JSON.stringify(scenarioCatalogue, null, 2)}\n`);
    return 0;
  }
  if (
    command === 'run' &&
    (rest.length === 2 || (rest.length === 3 && rest[2] === '--mine')) &&
    rest[1] === '--local'
  ) {
    const selected = scenarioId.safeParse(rest[0]);
    if (!selected.success) return 2;
    const report = await runScenario(
      selected.data,
      process.cwd(),
      0,
      rest[2] === '--mine',
    );
    await saveRun(process.cwd(), report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.result === 'PASS' ? 0 : report.result === 'BLOCKED' ? 3 : 1;
  }
  if (
    command === 'replay' &&
    ((rest.length === 2 && ['--plan', '--local'].includes(rest[1] ?? '')) ||
      (rest.length === 3 && rest[1] === '--local' && rest[2] === '--mine'))
  ) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rest[0] ?? ''))
      return 2;
    const baseline = await readRun(process.cwd(), rest[0]!);
    const plan = replayPlan(baseline);
    if (rest[1] === '--plan') {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }
    if (plan.mining !== (rest[2] === '--mine')) {
      process.stderr.write(
        'Fixture mode must match the saved run; inspect replay --plan.\n',
      );
      return 2;
    }
    const rerun = await runScenario(
      plan.scenarioId,
      process.cwd(),
      plan.seed,
      plan.mining,
    );
    await saveRun(process.cwd(), rerun);
    const comparison = compareRuns(baseline, rerun);
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    return comparison.environmentDifferences.length
      ? 1
      : rerun.result === 'BLOCKED'
        ? 3
        : comparison.bothRunsPassed
          ? 0
          : 1;
  }
  if (
    command === 'report' &&
    rest.length === 3 &&
    rest[1] === '--format' &&
    (rest[2] === 'json' || rest[2] === 'md')
  ) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rest[0] ?? ''))
      return 2;
    const report = await readRun(process.cwd(), rest[0]!);
    process.stdout.write(
      rest[2] === 'md'
        ? markdownReport(report)
        : `${JSON.stringify(report, null, 2)}\n`,
    );
    return 0;
  }
  if ((command === 'help' || command === undefined) && rest.length === 0) {
    process.stdout.write(help);
    return 0;
  }
  if (command === 'versions' && rest.length === 0) {
    process.stdout.write(
      `${JSON.stringify({ node: process.version, sourcePins: UPSTREAM }, null, 2)}\n`,
    );
    return 0;
  }
  if (command === 'doctor' && rest.length === 0) {
    const result = await doctor();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.chainConsistent ? 0 : 1;
  }
  if (
    command === 'inspect' &&
    (rest.length === 1 || (rest.length === 2 && rest[1] === '--save'))
  ) {
    const requestedHash = hash.safeParse(rest[0]);
    if (!requestedHash.success) {
      process.stderr.write('Expected a 32-byte transaction hash.\n');
      return 2;
    }
    const result = await inspectTransaction(requestedHash.data);
    if (rest[1] === '--save') {
      await saveObservation(process.cwd(), result);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.result.evidenceConsistent &&
      result.result.admissionObserved &&
      result.result.executionSucceeded
      ? 0
      : 1;
  }
  process.stderr.write(help);
  return 2;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    error instanceof RpcFailure
      ? `${error.message}. Evidence unavailable; no invariant failure inferred.\n`
      : 'Command failed; no conclusive result was produced.\n',
  );
  process.exitCode = 1;
}
