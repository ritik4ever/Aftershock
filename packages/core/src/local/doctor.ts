import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { UPSTREAM } from '../inspect.js';
import { ETHREX_IMAGE, SIDECAR_IMAGE } from './fixture.js';
import { LIGHTHOUSE_IMAGE, GENESIS_IMAGE } from './mining.js';
import { sponsorArtifacts } from './sponsor.js';

type CheckId =
  | 'linux'
  | 'node'
  | 'dependencies'
  | 'docker'
  | 'execution-image'
  | 'sidecar-image'
  | 'consensus-image'
  | 'genesis-image'
  | 'sponsor-artifacts';
export type LocalCheck = { id: CheckId; status: 'PASS' | 'BLOCKED' };
type Command = (file: string, args: string[], cwd: string) => Promise<string>;
const execute = promisify(execFile);
const command: Command = async (file, args, cwd) =>
  (
    await execute(file, args, {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 1048576,
    })
  ).stdout.trim();

export function localReadiness(checks: readonly LocalCheck[]) {
  // Missing, repeated or failed prerequisite observations cannot imply readiness.
  const passed = (id: CheckId) =>
    checks.filter((check) => check.id === id).length === 1 &&
    checks.find((check) => check.id === id)?.status === 'PASS';
  const admission = (
    [
      'linux',
      'node',
      'dependencies',
      'docker',
      'execution-image',
      'sidecar-image',
    ] as const
  ).every(passed);
  const mining =
    admission && passed('consensus-image') && passed('genesis-image');
  return { admission, mining, sponsor: mining && passed('sponsor-artifacts') };
}

// Dependency injection is for imported tests only, never a CLI endpoint/program option.
export async function localDoctor(
  root: string,
  run: Command = command,
  artifacts = sponsorArtifacts,
) {
  const checks: LocalCheck[] = [
    { id: 'linux', status: process.platform === 'linux' ? 'PASS' : 'BLOCKED' },
    {
      id: 'node',
      status:
        Number(process.versions.node.split('.')[0]) >= 24 ? 'PASS' : 'BLOCKED',
    },
  ];
  const observe = async (id: CheckId, action: () => Promise<boolean>) => {
    let status: LocalCheck['status'] = 'BLOCKED';
    try {
      if (await action()) status = 'PASS';
    } catch {
      /* Untrusted process errors/paths never enter diagnostic output. */
    }
    checks.push({ id, status });
  };
  await observe('dependencies', async () => {
    await run('npm', ['ls', '--all', '--json'], root);
    return true;
  });
  await observe(
    'docker',
    async () =>
      (await run('docker', ['info', '--format', '{{.OSType}}'], root)) ===
      'linux',
  );
  const image = async (name: string, revision?: string) => {
    const id = await run(
      'docker',
      ['image', 'inspect', name, '--format', '{{.Id}}'],
      root,
    );
    if (
      !z
        .string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .safeParse(id).success
    )
      return false;
    return (
      revision === undefined ||
      (await run(
        'docker',
        [
          'image',
          'inspect',
          name,
          '--format',
          '{{index .Config.Labels "org.opencontainers.image.revision"}}',
        ],
        root,
      )) === revision
    );
  };
  await observe('execution-image', () => image(ETHREX_IMAGE, UPSTREAM.ethrex));
  await observe('sidecar-image', () => image(SIDECAR_IMAGE, UPSTREAM.sidecar));
  await observe('consensus-image', () => image(LIGHTHOUSE_IMAGE));
  await observe('genesis-image', () => image(GENESIS_IMAGE));
  await observe('sponsor-artifacts', async () => {
    await artifacts(root);
    return true;
  });
  const readiness = localReadiness(checks);
  return {
    mode: 'LOCAL_PREREQUISITES' as const,
    result: readiness.sponsor ? ('PASS' as const) : ('BLOCKED' as const),
    nodeVersion: process.version,
    checks,
    readiness,
    limitations: [
      'Read-only prerequisite checks: no containers started, packages installed or public RPCs contacted.',
      'PASS means cached prerequisites are available, not that a scenario or node isolation check passed.',
      'Image revision labels are trusted local metadata, not cryptographic source attestation.',
      'Sponsor sources are additional prerequisites; admission/mining readiness is reported separately.',
    ],
  };
}
