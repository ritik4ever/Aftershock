import {
  doctor,
  localDoctor,
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
  genesisResetPlan,
  minedCheckpointPlan,
  compareGenesisResetRuns,
  compareRuns,
  checkEvidence,
  startViewer,
  runUserTest,
  userTestInput,
  publicTestReader,
  contractPlan,
  runContractPlan,
} from '@aftershock/core';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

const help = `Aftershock core integration
  npm run aftershock -- doctor
  npm run aftershock -- doctor --local
  npm run aftershock -- inspect <transaction-hash> [--save]
  npm run aftershock -- test-input <input.json>
  npm run aftershock -- contract-test <plan.json> --local
  npm run aftershock -- versions
  npm run aftershock -- scenarios
  npm run aftershock -- run <scenario-id> --local [--mine]
  npm run aftershock -- run keyed-nonce-lifecycle --local --mine --checkpoint
  npm run aftershock -- report <run-id> --format json|md
  npm run aftershock -- replay <run-id> --plan
  npm run aftershock -- replay <run-id> --local [--mine]
  npm run aftershock -- replay <run-id> --plan --reset
  npm run aftershock -- replay <run-id> --local --reset
  npm run aftershock -- replay <run-id> --plan --mine --reset
  npm run aftershock -- replay <run-id> --local --mine --reset
  npm run aftershock -- evidence <run-id>
  npm run aftershock -- check-evidence <run-id>
  npm run aftershock -- compare <baseline-run-id> <rerun-run-id>
  npm run aftershock -- serve [--port <1-65535>]
  npm run aftershock -- help

Read-only public-devnet doctor/inspect commands. --save writes under reports/.
run --local creates owned isolated Docker fixtures and never contacts public nodes.
Receipt absence is unavailable evidence, not proof that execution failed.
--mine uses cached mining images and waits for staged forks. Checkpoint reset does not reproduce historical timing.
`;

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (
    (command === 'test-input' && rest.length === 1) ||
    (command === 'contract-test' && rest.length === 2 && rest[1] === '--local')
  ) {
    const file = await open(
      rest[0]!,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    let input;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 49152)
        throw new Error('Invalid input file');
      const buffer = Buffer.alloc(49153);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const chunk = await file.read(
          buffer,
          bytesRead,
          buffer.length - bytesRead,
          null,
        );
        if (!chunk.bytesRead) break;
        bytesRead += chunk.bytesRead;
      }
      if (bytesRead > 49152) throw new Error('Input too large');
      const decoded: unknown = JSON.parse(
        buffer.toString('utf8', 0, bytesRead),
      );
      input =
        command === 'contract-test'
          ? contractPlan.parse(decoded)
          : userTestInput.parse(decoded);
    } finally {
      await file.close();
    }
    const result =
      command === 'contract-test'
        ? await runContractPlan(contractPlan.parse(input), process.cwd())
        : await runUserTest(userTestInput.parse(input), publicTestReader());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.result === 'PASS' ? 0 : result.result === 'FAIL' ? 1 : 3;
  }
  if (command === 'doctor' && rest.length === 1 && rest[0] === '--local') {
    const result = await localDoctor(process.cwd());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.result === 'PASS' ? 0 : 3;
  }
  if (command === 'serve') {
    if (
      rest.length &&
      (rest.length !== 2 ||
        rest[0] !== '--port' ||
        !/^[0-9]{1,5}$/.test(rest[1] ?? ''))
    )
      return 2;
    const port = rest.length ? Number(rest[1]) : 4318;
    if (port < 1 || port > 65535) return 2;
    let viewer: Awaited<ReturnType<typeof startViewer>>;
    try {
      viewer = await startViewer(process.cwd(), port);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      ) {
        process.stderr.write(
          `Port ${port} is already in use. If Aftershock is already running, open http://127.0.0.1:${port}. Otherwise choose another port with serve --port <port>.\n`,
        );
        return 1;
      }
      throw error;
    }
    process.stdout.write(
      `Aftershock local viewer/isolated runner: ${viewer.url} (wait for active runs to finish cleanup before Ctrl+C)\n`,
    );
    return 0;
  }
  if (command === 'check-evidence' && rest.length === 1) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rest[0] ?? ''))
      return 2;
    const result = checkEvidence(await readRun(process.cwd(), rest[0]!));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'CONSISTENT'
      ? 0
      : result.status === 'INSUFFICIENT'
        ? 3
        : 1;
  }
  if (command === 'evidence' && rest.length === 1) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rest[0] ?? ''))
      return 2;
    const report = await readRun(process.cwd(), rest[0]!);
    process.stdout.write(
      `${JSON.stringify({ runId: report.runId, evidence: report.evidence ?? null }, null, 2)}\n`,
    );
    return report.evidence ? 0 : 3;
  }
  if (command === 'compare' && rest.length === 2) {
    if (
      !rest.every((id) =>
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
      )
    )
      return 2;
    const comparison = compareRuns(
      await readRun(process.cwd(), rest[0]!),
      await readRun(process.cwd(), rest[1]!),
    );
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    return 0;
  }
  if (command === 'scenarios' && rest.length === 0) {
    process.stdout.write(`${JSON.stringify(scenarioCatalogue, null, 2)}\n`);
    return 0;
  }
  if (
    command === 'run' &&
    (rest.length === 2 ||
      (rest.length === 3 && rest[2] === '--mine') ||
      (rest.length === 4 &&
        rest[2] === '--mine' &&
        rest[3] === '--checkpoint' &&
        rest[0] === 'keyed-nonce-lifecycle')) &&
    rest[1] === '--local'
  ) {
    const selected = scenarioId.safeParse(rest[0]);
    if (!selected.success) return 2;
    const report = await runScenario(
      selected.data,
      process.cwd(),
      0,
      rest[2] === '--mine',
      undefined,
      rest[3] === '--checkpoint' ? { capture: true } : undefined,
    );
    await saveRun(process.cwd(), report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.result === 'PASS' ? 0 : report.result === 'BLOCKED' ? 3 : 1;
  }
  if (
    command === 'replay' &&
    ((rest.length === 4 &&
      ['--plan', '--local'].includes(rest[1] ?? '') &&
      rest[2] === '--mine' &&
      rest[3] === '--reset') ||
      (rest.length === 2 && ['--plan', '--local'].includes(rest[1] ?? '')) ||
      (rest.length === 3 && rest[1] === '--local' && rest[2] === '--mine') ||
      (rest.length === 3 &&
        ['--plan', '--local'].includes(rest[1] ?? '') &&
        rest[2] === '--reset'))
  ) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(rest[0] ?? ''))
      return 2;
    const baseline = await readRun(process.cwd(), rest[0]!);
    const minedPlan =
      rest[3] === '--reset' ? minedCheckpointPlan(baseline) : undefined;
    const resetPlan =
      rest[2] === '--reset' ? genesisResetPlan(baseline) : undefined;
    const plan = minedPlan ?? resetPlan ?? replayPlan(baseline);
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
      resetPlan?.fixtureSource,
      minedPlan ? { restore: minedPlan.fixtureSource } : undefined,
    );
    await saveRun(process.cwd(), rerun);
    const comparison = resetPlan
      ? compareGenesisResetRuns(baseline, rerun)
      : compareRuns(baseline, rerun);
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    return rerun.result === 'BLOCKED' ? 3 : comparison.bothRunsPassed ? 0 : 1;
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
