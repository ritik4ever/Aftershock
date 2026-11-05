import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { GatewayReader, RpcFailure } from '@aftershock/core';
import { quantity } from '../packages/core/src/schema.js';

test('validates envelopes and result shapes; missing methods retain only numeric code', async () => {
  for (const envelope of [
    null,
    [],
    { jsonrpc: '2.0', id: 9, result: '0x539' },
    { jsonrpc: '2.0', id: 1, result: null },
    { jsonrpc: '2.0', id: 1 },
  ]) {
    const reader = new GatewayReader(async () => Response.json(envelope));
    await assert.rejects(reader.read('eth_chainId', [], quantity), RpcFailure);
  }
  const missing = new GatewayReader(async () =>
    Response.json({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'unit-test-placeholder' },
    }),
  );
  await assert.rejects(
    missing.read('eth_chainId', [], quantity),
    (error: unknown) =>
      error instanceof RpcFailure &&
      error.code === -32601 &&
      !error.message.includes('unit-test-placeholder'),
  );
  const absent = new GatewayReader(async () =>
    Response.json({ jsonrpc: '2.0', id: 1 }),
  );
  await assert.rejects(absent.read('eth_chainId', [], z.unknown()));
});

test('rejects HTTP errors, invalid JSON, empty bodies and oversized streaming responses', async () => {
  for (const response of [
    () => new Response('unavailable', { status: 503 }),
    () => new Response('invalid'),
    () => new Response(null),
    () => new Response('x'.repeat(1_048_577)),
  ]) {
    const reader = new GatewayReader(async () => response());
    await assert.rejects(reader.read('eth_chainId', [], quantity), RpcFailure);
  }
});

test('applies a deadline and does not retry a failed read', async () => {
  let calls = 0;
  const reader = new GatewayReader(
    async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        calls++;
        const timer = setTimeout(
          () => reject(new Error('test deadline')),
          1000,
        );
        options?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('unit-test-placeholder'));
          },
          { once: true },
        );
      }),
    5,
  );
  await assert.rejects(
    reader.read('eth_chainId', [], quantity),
    (error: unknown) =>
      error instanceof RpcFailure && error.kind === 'TRANSPORT',
  );
  assert.equal(calls, 1);
});
