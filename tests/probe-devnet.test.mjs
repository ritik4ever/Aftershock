import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { probe, validateResult } from '../scripts/probe-devnet.mjs';

// Unit transports use a recorded response shape; they never write live-evidence files.
const capture = JSON.parse(await readFile(new URL('../docs/evidence/devnet-probe-2026-11-05.json', import.meta.url)));
const results = capture.observations.map((entry) => entry.result);

function transport(change = (value) => value) {
  return async (url, options) => {
    assert.equal(url, 'https://altmempoolgateway.forshtat.com/rpc');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    const request = JSON.parse(options.body);
    assert.deepEqual(request.params, []);
    assert.ok(['eth_chainId', 'skandha_explorer_info', 'skandha_config'].includes(request.method));
    return Response.json(change({ jsonrpc: '2.0', id: request.id, result: results[request.id - 1] }));
  };
}

test('preserves recorded public fields without asserting source verification', async () => {
  const evidence = await probe(transport());
  assert.deepEqual(evidence.observations.map((entry) => entry.result), results);
  assert.equal(evidence.sourceCommitVerified, false);
  assert.equal(evidence.consistencyError, undefined);
});

test('allowlists fields in config and explorer responses', async () => {
  const evidence = await probe(transport((value) => ({
    ...value,
    result: typeof value.result === 'object' ? { ...value.result, apiToken: 'unit-test-placeholder' } : value.result,
  })));
  assert.ok(!JSON.stringify(evidence).includes('unit-test-placeholder'));
});

test('rejects malformed results and unsafe metadata while preserving large amounts', () => {
  for (const result of [null, [], '1337', { ...results[2], chainId: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => validateResult('skandha_config', result));
  }
  const large = '900719925474099300000000000';
  assert.equal(validateResult('skandha_config', { ...results[2], minStake: large }).minStake, large);
  for (const value of ['1337', '0x00', '0x', -1]) assert.throws(() => validateResult('eth_chainId', value));
  assert.equal(validateResult('eth_chainId', '0x20000000000001'), '0x20000000000001');
  assert.throws(() => validateResult('eth_sendFrameTransaction', {}));
});

test('rejects unknown explorer protocol and invalid history bounds', () => {
  assert.throws(() => validateResult('skandha_explorer_info', { ...results[1], protocolVersion: 2 }));
  assert.throws(() => validateResult('skandha_explorer_info', { ...results[1], oldestSeq: 301, latestSeq: 300 }));
  assert.throws(() => validateResult('skandha_explorer_info', { ...results[1], bootId: 'invalid' }));
});

test('rejects mismatched IDs, malformed envelopes and missing-method errors', async () => {
  for (const change of [
    (value) => ({ ...value, id: 99 }),
    () => null,
    () => [],
    (value) => ({ ...value, jsonrpc: '1.0' }),
    (value) => ({ ...value, error: { code: -32601, message: 'unit-test-placeholder' } }),
    (value) => ({ jsonrpc: '2.0', id: value.id }),
  ]) {
    const evidence = await probe(transport(change));
    assert.ok(evidence.observations.every((entry) => entry.error && !entry.result));
    assert.ok(!JSON.stringify(evidence).includes('unit-test-placeholder'));
  }
});

test('records chain disagreement without declaring success', async () => {
  const evidence = await probe(transport((value) => value.id === 1 ? { ...value, result: '0x1' } : value));
  assert.ok(evidence.consistencyError);
});

test('bounds response size, rejects HTTP errors and invalid JSON', async () => {
  for (const response of [
    () => new Response('x'.repeat(1_048_577)),
    () => new Response('unit-test-placeholder', { status: 503 }),
    () => new Response('invalid JSON'),
    () => new Response(null),
  ]) {
    const evidence = await probe(async () => response());
    assert.ok(evidence.observations.every((entry) => entry.error));
    assert.ok(!JSON.stringify(evidence).includes('unit-test-placeholder'));
  }
});

test('cancels an oversized streaming body', async () => {
  let cancelled = 0;
  const evidence = await probe(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1_048_577)); },
    cancel() { cancelled++; },
  })));
  assert.equal(cancelled, 3);
  assert.ok(evidence.observations.every((entry) => entry.error));
});

test('aborts stalled requests and does not retain transport exception text', async () => {
  const evidence = await probe(async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('unit-test-placeholder')), { once: true });
    // Keep the process alive while AbortSignal.timeout's unreferenced timer fires.
    const timer = setTimeout(() => reject(new Error('unexpected test deadline')), 1000);
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  }), 5);
  assert.ok(evidence.observations.every((entry) => entry.error));
  assert.ok(!JSON.stringify(evidence).includes('unit-test-placeholder'));
});

test('invalid CLI arguments exit 2 before making a network request', () => {
  for (const args of [['--invalid'], ['--save'], ['--save', ' ']]) {
    const child = spawnSync(process.execPath, ['scripts/probe-devnet.mjs', ...args], { encoding: 'utf8', timeout: 2000 });
    assert.equal(child.status, 2);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, /Usage:/);
  }
});
