import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'packages/cli/src/index.ts', ...args],
    {
      encoding: 'utf8',
      timeout: 3000,
    },
  );
}

test('help and versions work offline and versions emits JSON', () => {
  const help = cli('help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Read-only public-devnet/);
  const versions = cli('versions');
  assert.equal(versions.status, 0);
  assert.equal(JSON.parse(versions.stdout).sourcePins.sidecar.length, 40);
});

test('invalid commands, arguments and paths are rejected before network work', () => {
  for (const args of [
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
    ['replay', '../escape', '--plan'],
    ['replay', 'invalid', '--local'],
    ['replay', 'invalid', '--mine'],
    ['replay', 'invalid', '--local', '--mine', '--extra'],
    ['run'],
    ['run', 'keyed-nonce-lifecycle', '--mine'],
    ['run', 'unknown', '--local', '--mine'],
    ['run', 'keyed-nonce-lifecycle', '--local', '--mine', '--extra'],
    ['doctor', '--force'],
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
