import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { createLiveHandler } from '../packages/core/src/live.js';
import { GatewayReader } from '../packages/core/src/rpc.js';
import deployedHandler from '../api/live.js';

const recorded = JSON.parse(
  await readFile('docs/evidence/public-mined-2026-11-06.json', 'utf8'),
);
const txHash: string = recorded.evidence.requestedHash;
const request = (query = '') =>
  new Request(`https://viewer.example/api/live${query}`);

function fixture(
  options: {
    missingReceipt?: boolean;
    unknown?: boolean;
    mismatch?: boolean;
    outage?: boolean;
  } = {},
) {
  const methods: string[] = [];
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://altmempoolgateway.forshtat.com/rpc');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    methods.push(body.method);
    assert.ok(
      [
        'eth_chainId',
        'skandha_explorer_info',
        'skandha_explorer_getTransaction',
        'skandha_frameTransactionStatus',
        'eth_getFrameTransactionReceipt',
      ].includes(body.method),
    );
    if (options.outage) throw new Error('PRIVATE_TRANSPORT_SENTINEL');
    const evidence = structuredClone(recorded.evidence);
    if (
      (options.unknown && body.params.length) ||
      (options.missingReceipt &&
        body.method === 'eth_getFrameTransactionReceipt')
    )
      return Response.json({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32000, message: 'PRIVATE_SERVER_SENTINEL' },
      });
    let result: unknown;
    switch (body.method) {
      case 'eth_chainId':
        result = evidence.chainId;
        break;
      case 'skandha_explorer_info':
        result = evidence.before;
        break;
      case 'skandha_explorer_getTransaction':
        evidence.admission.admission.frames = [{}, {}];
        if (options.mismatch) evidence.admission.hash = `0x${'a'.repeat(64)}`;
        result = evidence.admission;
        break;
      case 'skandha_frameTransactionStatus':
        if (options.missingReceipt) {
          evidence.status.status = 'New';
          delete evidence.status.transaction;
        }
        result = evidence.status;
        break;
      case 'eth_getFrameTransactionReceipt':
        result = evidence.receipt;
        break;
    }
    return Response.json({ jsonrpc: '2.0', id: body.id, result });
  };
  return { handler: createLiveHandler(new GatewayReader(transport)), methods };
}

test('live endpoint uses current allowlisted reads and never serves archived evidence as a fallback', async () => {
  const { handler, methods } = fixture();
  const response = await handler(request(`?hash=${txHash}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.mode, 'LIVE_PUBLIC_READ');
  assert.equal(result.requestedHash, txHash);
  assert.equal(result.result.execution, 'SUCCESS');
  assert.equal(result.result.evidenceComplete, true);
  assert.equal(result.sourceCommitVerified, false);
  assert.equal(result.result.sourceSpecificVerdict, 'INCONCLUSIVE');
  assert.equal(methods.length, 6);
  const failed = await fixture({ outage: true }).handler(request());
  assert.equal(failed.status, 502);
  const text = await failed.text();
  assert.doesNotMatch(text, /PRIVATE_|2020|SUCCESS/);
  assert.match(text, /no saved result substituted/);
});

test('live inspection preserves pending, unknown and mismatched evidence without a false success', async () => {
  for (const options of [
    { missingReceipt: true },
    { unknown: true },
    { mismatch: true },
  ]) {
    const response = await fixture(options).handler(request(`?hash=${txHash}`));
    const value = await response.json();
    assert.equal(value.result.execution, 'NOT_VERIFIED');
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE_/);
    if (options.missingReceipt) {
      assert.equal(value.status.value.status, 'New');
      assert.equal(value.result.admissionObserved, true);
      assert.equal(value.receipt.value, null);
    }
    if (options.unknown) assert.equal(value.result.evidenceComplete, false);
    if (options.mismatch) {
      assert.equal(value.result.evidenceConsistent, false);
      assert.equal(value.result.admissionObserved, false);
      assert.ok(value.result.issues.includes('HASH_MISMATCH'));
    }
  }
});

test('live endpoint rejects writes, extra parameters, custom endpoints and cross-origin requests before RPC', async () => {
  const { handler, methods } = fixture();
  for (const query of [
    '?hash=bad',
    `?hash=${txHash}&hash=${txHash}`,
    '?url=https://evil.example',
    '?method=eth_sendFrameTransaction',
  ])
    assert.equal((await handler(request(query))).status, 400);
  assert.equal(
    (await handler(new Request(request(), { method: 'POST' }))).status,
    405,
  );
  for (const headers of [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' },
  ])
    assert.equal(
      (await handler(new Request(request(), { headers }))).status,
      403,
    );
  assert.equal(methods.length, 0);
  assert.equal((await deployedHandler.fetch(request('?hash=bad'))).status, 400);
});

test('live endpoint bounds concurrent checks per instance and releases capacity', async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reader = new GatewayReader(async (_url, init) => {
    await gate;
    const body = JSON.parse(String(init?.body));
    return Response.json({
      jsonrpc: '2.0',
      id: body.id,
      result:
        body.method === 'eth_chainId'
          ? recorded.evidence.chainId
          : recorded.evidence.before,
    });
  });
  const handler = createLiveHandler(reader);
  const first = handler(request()),
    second = handler(request());
  await setImmediate();
  assert.equal((await handler(request())).status, 429);
  release();
  assert.ok(
    (await Promise.all([first, second])).every(
      (response) => response.status === 200,
    ),
  );
  assert.equal((await handler(request())).status, 200);
});
