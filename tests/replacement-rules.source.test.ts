import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { SIDECAR_IMAGE } from '../packages/core/src/local/fixture.js';
import { UPSTREAM } from '../packages/core/src/inspect.js';

test(
  'pinned upstream replacement methods enforce exact TTL, status and integer fee boundaries',
  { timeout: 30_000 },
  () => {
    const labels = JSON.parse(
      execFileSync('docker', ['image', 'inspect', SIDECAR_IMAGE], {
        encoding: 'utf8',
        timeout: 10_000,
      }),
    );
    assert.equal(
      labels[0].Config.Labels['org.opencontainers.image.revision'],
      UPSTREAM.sidecar,
    );
    // Runs actual upstream methods, not a copied implementation. These inputs
    // exercise methods only: no transaction is signed, simulated or admitted.
    const script = `
import assert from 'node:assert/strict';
import { FrameTxMempoolEntry as Entry } from './packages/executor/lib/entities/FrameTxMempoolEntry.js';
import { MempoolEntryStatus as Status } from '@skandha/types/lib/executor';
const sender = '0x0000000000000000000000000000000000000001';
const entry = (options = {}) => new Entry({
  chainId: 9n, sender, nonceSeq: 0n, nonceKeys: [1n, 2n], frames: [],
  fees: { maxFeePerGas: 101n, maxPriorityFeePerGas: 101n },
}, { lastUpdatedTime: 1000, ...options });
const original = entry();
const low = entry({ lastUpdatedTime: 31000 });
assert.equal(low.canReplaceWithTTL(original, 30), false, 'TTL equality must not expire');
low.lastUpdatedTime = 30999;
assert.equal(low.canReplaceWithTTL(original, 30), false, 'TTL minus one millisecond');
low.lastUpdatedTime = 31001;
assert.equal(low.canReplaceWithTTL(original, 30), true, 'TTL plus one millisecond');
original.lastUpdatedTime = 2000;
assert.equal(low.canReplaceWithTTL(original, 30), false, 'last update refreshes the window');
const bumped = entry();
bumped.tx.fees = { maxFeePerGas: 111n, maxPriorityFeePerGas: 111n };
assert.equal(bumped.canReplace(original), true, '101 * 11 / 10 truncates to 111');
bumped.tx.fees.maxFeePerGas = 110n;
assert.equal(bumped.canReplace(original), false, 'maximum fee threshold is independent');
bumped.tx.fees = { maxFeePerGas: 111n, maxPriorityFeePerGas: 110n };
assert.equal(bumped.canReplace(original), false, 'priority fee threshold is independent');
for (const name of ['New', 'Pending', 'Submitted', 'OnChain']) {
  assert.equal(typeof Status[name], 'number');
  original.status = Status[name];
  assert.equal(low.canReplace(original), false, name + ' retains the fee guard');
}
for (const name of ['Finalized', 'Cancelled', 'Reverted']) {
  assert.equal(typeof Status[name], 'number');
  original.status = Status[name];
  assert.equal(low.canReplace(original), true, name + ' bypasses this fee guard');
}
original.status = Status.New;
const same = entry();
assert.equal(same.isEqual(original), true);
same.tx.nonceKeys = [2n, 1n];
assert.equal(same.isEqual(original), false, 'ordered key identity');
same.tx.nonceKeys = [1n, 2n];
same.tx.nonceSeq = 1n;
assert.equal(same.isEqual(original), false, 'sequence identity');
same.tx.nonceSeq = 0n;
same.chainId = 10n;
assert.equal(same.isEqual(original), false, 'chain identity');
same.chainId = 9n;
same.tx.sender = '0x0000000000000000000000000000000000000002';
assert.equal(same.isEqual(original), false, 'sender identity');
console.log('Upstream method assertions passed; SOURCE_METHOD_TEST_ONLY, not live admission or lifecycle evidence.');
`;
    const runId = randomUUID();
    try {
      const output = execFileSync(
        'docker',
        [
          'run',
          '--rm',
          '--pull',
          'never',
          '--network',
          'none',
          '--read-only',
          '--name',
          `aftershock-${runId}-source-rules`,
          '--label',
          `aftershock.run=${runId}`,
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          '--memory',
          '256m',
          '--cpus',
          '1',
          '--pids-limit',
          '64',
          '--user',
          '65534:65534',
          '--entrypoint',
          'bun',
          SIDECAR_IMAGE,
          '-e',
          script,
        ],
        { encoding: 'utf8', timeout: 20_000, maxBuffer: 65_536 },
      );
      assert.match(output, /SOURCE_METHOD_TEST_ONLY/);
    } finally {
      const remaining = execFileSync(
        'docker',
        ['ps', '-aq', '--filter', `label=aftershock.run=${runId}`],
        { encoding: 'utf8', timeout: 5000 },
      ).trim();
      if (remaining) {
        const ids = remaining.split(/\s+/);
        assert.ok(ids.every((id) => /^[a-f0-9]{12,64}$/.test(id)));
        execFileSync('docker', ['rm', '-f', ...ids], { timeout: 5000 });
      }
    }
  },
);
