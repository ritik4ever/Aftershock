import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { fixtureTransaction } from '../packages/core/src/local/codec.js';
import {
  createUserTestHandler,
  decodeUserTransaction,
  runUserTest,
  userTestInput,
  publicTestReader,
  TestRpcError,
  TEST_EXECUTION_RPC,
} from '../packages/core/src/user-test.js';
import type { TestReader } from '../packages/core/src/user-test.js';

const address = `0x${'11'.repeat(20)}`;
const block = { number: '0x2', hash: `0x${'22'.repeat(32)}` };
const contract = userTestInput.parse({
  kind: 'contract',
  to: address,
  from: address,
  data: '0x12345678',
  expectedReturn: '0x42',
});
const signed = await fixtureTransaction(
  `0x${'12'.repeat(32)}`,
  `0x${'12'.repeat(32)}`,
  [0n],
);
const simulated = {
  canonicalMempoolValid: true,
  canonicalMempoolViolation: null,
  prefixShape: 'self',
  payer: address,
  maxCost: '0x10',
  gasUsed: '0x20',
  frames: [
    { gasUsed: '0x1', succeeded: true },
    { gasUsed: '0x1', succeeded: true },
  ],
  executionStatus: 'success',
  executionError: null,
};
function reader(
  options: {
    simulation?: unknown;
    returned?: string;
    code?: string;
    reorg?: boolean;
    rpcError?: boolean;
  } = {},
) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  let blocks = 0;
  const read: TestReader = async (method, params, schema) => {
    calls.push({ method, params });
    if (options.rpcError && method === 'eth_call')
      throw new TestRpcError(3, '0xdead');
    return schema.parse(
      method === 'eth_chainId'
        ? '0x9'
        : method === 'eth_getBlockByNumber'
          ? {
              ...block,
              hash:
                options.reorg && blocks++ ? `0x${'33'.repeat(32)}` : block.hash,
            }
          : method === 'eth_getCode'
            ? (options.code ?? '0x6042')
            : method === 'eth_call'
              ? (options.returned ?? '0x42')
              : (options.simulation ?? simulated),
    );
  };
  return { read, calls };
}
test('user transaction test sends exact signed bytes at one block and distinguishes execution from admission', async () => {
  const { read, calls } = reader();
  const result = await runUserTest(
    { kind: 'transaction', raw: signed.raw },
    read,
    9n,
  );
  assert.equal(result.result, 'PASS');
  assert.equal(result.broadcast, false);
  assert.equal(result.alternativeMempoolAdmission, 'NOT_TESTED');
  assert.deepEqual(
    calls.find((c) => c.method === 'ethrex_simulateFrameTransaction')!.params,
    [signed.raw, block.number, { trace: false }],
  );
  assert.ok(!JSON.stringify(result).includes(signed.raw));
  assert.ok(calls.every((c) => !c.method.includes('send')));
  for (const changed of [
    { ...simulated, canonicalMempoolValid: false },
    { ...simulated, frames: [simulated.frames[0]] },
    { ...simulated, executionStatus: 'reverted' },
  ])
    assert.equal(
      (
        await runUserTest(
          { kind: 'transaction', raw: signed.raw },
          reader({ simulation: changed }).read,
          9n,
        )
      ).result,
      'FAIL',
    );
  assert.equal(
    (
      await runUserTest(
        { kind: 'transaction', raw: signed.raw },
        reader({
          simulation: { ...simulated, frames: null, executionStatus: null },
        }).read,
        9n,
      )
    ).result,
    'NOT_VERIFIED',
  );
});
test('contract calls require deployed code, assert user return data and do not persist state', async () => {
  const { read, calls } = reader();
  assert.equal((await runUserTest(contract, read, 9n)).result, 'PASS');
  assert.deepEqual(calls.find((c) => c.method === 'eth_call')!.params, [
    {
      to: address,
      from: address,
      data: '0x12345678',
      value: '0x0',
      gas: '0xf4240',
    },
    block.number,
  ]);
  assert.equal(
    (await runUserTest(contract, reader({ returned: '0x43' }).read, 9n)).result,
    'FAIL',
  );
  assert.equal(
    (await runUserTest(contract, reader({ code: '0x' }).read, 9n)).result,
    'FAIL',
  );
  assert.equal(
    (await runUserTest(contract, reader({ rpcError: true }).read, 9n)).result,
    'FAIL',
  );
  assert.equal(
    (await runUserTest(contract, reader({ reorg: true }).read, 9n)).result,
    'NOT_VERIFIED',
  );
});
test('malformed payloads, signing keys, custom endpoints, gas abuse and chain mismatch fail closed', async () => {
  for (const value of [
    { ...contract, privateKey: 'DO_NOT_ECHO' },
    { ...contract, rpc: 'http://localhost' },
    { ...contract, gas: '0xf4241' },
    { ...contract, data: '0x1' },
  ])
    assert.equal(userTestInput.safeParse(value).success, false);
  for (const raw of ['0x06', signed.raw + '00', `0x${'12'.repeat(32)}`])
    assert.throws(() => decodeUserTransaction(raw));
  await assert.rejects(
    runUserTest({ kind: 'transaction', raw: signed.raw }, reader().read, 1337n),
  );
});
test('public user-test handler rejects invalid requests without network work and sanitizes failures', async () => {
  let called = false;
  const read: TestReader = async () => {
    called = true;
    throw new Error('PRIVATE_ERROR');
  };
  const handler = createUserTestHandler(read);
  const post = (body: unknown, origin = 'https://aftershock.example') =>
    new Request('https://aftershock.example/api/test', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await handler(post(contract, 'https://evil.example'))).status,
    403,
  );
  assert.equal(
    (await handler(post({ ...contract, privateKey: 'DO_NOT_ECHO' }))).status,
    400,
  );
  assert.equal(
    (await handler(post({ kind: 'transaction', raw: '0x06' }))).status,
    400,
  );
  const wrongChain = await handler(
    post({ kind: 'transaction', raw: signed.raw }),
  );
  assert.equal(wrongChain.status, 400);
  assert.match(await wrongChain.text(), /1337/);
  assert.equal(called, false);
  const response = await handler(post(contract));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /PRIVATE_ERROR/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('public RPC transport uses only the fixed execution endpoint and validates response identity', async () => {
  let wrongId = false;
  const read = publicTestReader(async (url, init) => {
    assert.equal(url, TEST_EXECUTION_RPC);
    const body = JSON.parse(String(init?.body));
    return Response.json({
      jsonrpc: '2.0',
      id: wrongId ? -1 : body.id,
      result: '0x539',
    });
  });
  assert.equal(await read('eth_chainId', [], z.string()), '0x539');
  wrongId = true;
  await assert.rejects(read('eth_chainId', [], z.string()));
  await assert.rejects(read('eth_sendRawTransaction' as never, [], z.string()));
});

test('public user-test capacity rejects a third concurrent request and oversized inputs', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read: TestReader = async (method, params, schema) => {
    if (method === 'eth_chainId') {
      await waiting;
      return schema.parse('0x539');
    }
    return reader().read(method, params, schema);
  };
  const handler = createUserTestHandler(read);
  const post = (input: unknown) =>
    new Request('https://aftershock.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  const first = handler(post(contract)),
    second = handler(post(contract));
  assert.equal((await handler(post(contract))).status, 429);
  release();
  assert.ok((await first).ok);
  assert.ok((await second).ok);
  assert.equal(
    (
      await handler(
        post({ kind: 'transaction', raw: '0x' + 'ff'.repeat(49152) }),
      )
    ).status,
    400,
  );
});
