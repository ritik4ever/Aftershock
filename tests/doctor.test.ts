import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localDoctor,
  localReadiness,
} from '../packages/core/src/local/doctor.js';
import type { LocalCheck } from '../packages/core/src/local/doctor.js';
import { UPSTREAM } from '../packages/core/src/inspect.js';

test('local readiness separates admission, mining and sponsor prerequisites and rejects missing/duplicate checks', () => {
  const checks: LocalCheck[] = (
    [
      'linux',
      'node',
      'dependencies',
      'docker',
      'execution-image',
      'sidecar-image',
      'consensus-image',
      'genesis-image',
      'sponsor-artifacts',
    ] as const
  ).map((id) => ({ id, status: 'PASS' }));
  assert.deepEqual(localReadiness(checks), {
    admission: true,
    mining: true,
    sponsor: true,
  });
  assert.deepEqual(
    localReadiness(checks.filter((check) => check.id !== 'sponsor-artifacts')),
    { admission: true, mining: true, sponsor: false },
  );
  assert.deepEqual(
    localReadiness(checks.filter((check) => check.id !== 'consensus-image')),
    { admission: true, mining: false, sponsor: false },
  );
  assert.deepEqual(
    localReadiness([...checks, { id: 'docker', status: 'PASS' }]),
    { admission: false, mining: false, sponsor: false },
  );
  assert.deepEqual(
    localReadiness(
      checks.map((check) =>
        check.id === 'sidecar-image' ? { ...check, status: 'BLOCKED' } : check,
      ),
    ),
    { admission: false, mining: false, sponsor: false },
  );
});

test('local doctor uses only fixed read commands and suppresses process/artifact error text', async () => {
  const calls: string[][] = [];
  const result = await localDoctor(
    '/unit-only',
    async (file, args) => {
      calls.push([file, ...args]);
      if (file === 'npm') throw Error('PRIVATE_SENTINEL');
      if (args[0] === 'info') return 'linux';
      if (args.at(-1) === '{{.Id}}') return `sha256:${'a'.repeat(64)}`;
      return args[2]?.startsWith('aftershock-sidecar')
        ? UPSTREAM.sidecar
        : UPSTREAM.ethrex;
    },
    async () => {
      throw Error('PRIVATE_SENTINEL');
    },
  );
  assert.equal(result.result, 'BLOCKED');
  assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  assert.equal(
    result.checks.find((check) => check.id === 'dependencies')?.status,
    'BLOCKED',
  );
  assert.ok(
    calls.every(([file, first, second]) =>
      file === 'npm'
        ? first === 'ls'
        : first === 'info' || (first === 'image' && second === 'inspect'),
    ),
  );
});

test('local doctor rejects malformed image identity and mismatched revision metadata', async () => {
  const result = await localDoctor(
    '/unit-only',
    async (file, args) => {
      if (file === 'npm') return '{}';
      if (args[0] === 'info') return 'linux';
      if (args.at(-1) === '{{.Id}}')
        return args[2]?.startsWith('aftershock-sidecar')
          ? 'not-a-digest'
          : `sha256:${'b'.repeat(64)}`;
      return 'different-revision';
    },
    async () => ({ wallet: '0x01', foreign: '0x01', registry: '0x01' }),
  );
  assert.equal(
    result.checks.find((check) => check.id === 'execution-image')?.status,
    'BLOCKED',
  );
  assert.equal(
    result.checks.find((check) => check.id === 'sidecar-image')?.status,
    'BLOCKED',
  );
  assert.equal(result.readiness.admission, false);
});
