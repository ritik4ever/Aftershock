import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createServer } from 'node:net';

test('occupied viewer ports produce actionable output without hiding the original listener', async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const result = cli('serve', '--port', String(address.port));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /already in use/);
    assert.ok(result.stderr.includes(`http://127.0.0.1:${address.port}`));
    assert.match(result.stderr, /serve --port/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
    {
      encoding: 'utf8',
      // Allow cold TypeScript loading while isolated consensus tests run.
      timeout: 10_000,
    },
  );
}

test('help and versions work offline and versions emits JSON', () => {
  const help = cli('help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Read-only public-devnet/);
  assert.match(help.stdout, /--checkpoint/);
  const versions = cli('versions');
  assert.equal(versions.status, 0);
  assert.equal(JSON.parse(versions.stdout).sourcePins.sidecar.length, 40);
});

test('invalid commands, arguments and paths are rejected before network work', () => {
  for (const args of [
    ['serve', '--port', '0'],
    ['serve', '--port', '65536'],
    ['serve', '--port', 'abc'],
    ['serve', '--host', '0.0.0.0'],
    ['check-evidence'],
    ['check-evidence', '../escape'],
    ['check-evidence', 'invalid', '--force'],
    ['evidence'],
    ['evidence', '../escape'],
    ['evidence', 'invalid', '--save'],
    ['compare'],
    ['compare', '../escape', 'invalid'],
    ['compare', 'invalid', 'invalid', '--local'],
    ['replay'],
    ['replay', 'invalid', '--local', '--reset'],
    ['replay', 'invalid', '--plan', '--reset'],
    ['replay', 'invalid', '--local', '--mine', '--reset'],
    ['replay', 'invalid', '--reset'],
    ['replay', '../escape', '--plan'],
    ['replay', 'invalid', '--local'],
    ['replay', 'invalid', '--mine'],
    ['replay', 'invalid', '--local', '--mine', '--extra'],
    ['run'],
    ['run', 'paymaster-solvency', '--local', '--mine', '--checkpoint'],
    ['run', 'keyed-nonce-lifecycle', '--local', '--checkpoint'],
    ['replay', 'invalid', '--plan', '--mine', '--reset'],
    ['run', 'keyed-nonce-lifecycle', '--mine'],
    ['run', 'unknown', '--local', '--mine'],
    ['run', 'keyed-nonce-lifecycle', '--local', '--mine', '--extra'],
    ['doctor', '--force'],
    ['doctor', '--local', '--force'],
    ['inspect', '../escape'],
    ['inspect'],
    ['inspect', '--save'],
    ['versions', 'extra'],
  ]) {
    const result = cli(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
  }
});
