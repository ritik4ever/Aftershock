import { z } from 'zod';
import { getProfile } from '@forshtat/hegota-support/profiles';
import { decodeTx, encodeTx, txHash } from '@forshtat/hegota-support/tx';
import { keccak256 } from 'viem';
import type { Hex } from 'viem';
import { quantity, hash } from './schema.js';

export const TEST_EXECUTION_RPC = 'https://altmempool.forshtat.com';
const profile = getProfile('ethrex-eip8141-tracer');
const address = z.string().regex(/^0x[0-9a-f]{40}$/i);
const hexData = z.string().regex(/^0x(?:[0-9a-f]{2})*$/i);
const bytes = hexData.max(32770);
export const userTestInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('transaction'), raw: bytes.min(6) }).strict(),
  z
    .object({
      kind: z.literal('contract'),
      to: address,
      from: address,
      data: bytes.max(8194),
      value: quantity.default('0x0'),
      gas: quantity
        .default('0xf4240')
        .refine((n) => BigInt(n) > 0n && BigInt(n) <= 1_000_000n),
      expectedReturn: bytes.optional(),
    })
    .strict(),
]);
export type UserTestInput = z.infer<typeof userTestInput>;
type Method =
  | 'eth_chainId'
  | 'eth_getBlockByNumber'
  | 'ethrex_simulateFrameTransaction'
  | 'eth_getCode'
  | 'eth_call';
export type TestReader = <T>(
  method: Method,
  params: unknown[],
  schema: z.ZodType<T>,
) => Promise<T>;
export class TestRpcError extends Error {
  constructor(
    readonly code: number,
    readonly data?: string,
  ) {
    super('Execution RPC rejected the dry run');
  }
}

export async function boundedTestBody(
  input: Request | Response,
  maximum: number,
) {
  if (!input.body) throw new Error('Missing body');
  const reader = input.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Body timeout')), 8000);
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) throw new Error('Body too large');
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function publicTestReader(transport: typeof fetch = fetch): TestReader {
  let id = 0;
  return async (method, params, schema) => {
    if (
      ![
        'eth_chainId',
        'eth_getBlockByNumber',
        'ethrex_simulateFrameTransaction',
        'eth_getCode',
        'eth_call',
      ].includes(method)
    )
      throw new Error('Unsupported dry-run method');
    const requestId = ++id;
    const response = await transport(TEST_EXECUTION_RPC, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Execution RPC unavailable');
    const value = z
      .object({
        jsonrpc: z.literal('2.0'),
        id: z.literal(requestId),
        result: z.unknown().optional(),
        error: z
          .object({ code: z.number().int(), data: z.unknown().optional() })
          .optional(),
      })
      .parse(
        JSON.parse((await boundedTestBody(response, 262144)).toString('utf8')),
      );
    if (Object.hasOwn(value, 'result') === Object.hasOwn(value, 'error'))
      throw new Error('Invalid RPC envelope');
    if (value.error)
      throw new TestRpcError(
        value.error.code,
        bytes.safeParse(value.error.data).success
          ? String(value.error.data)
          : undefined,
      );
    return schema.parse(value.result);
  };
}

export function decodeUserTransaction(raw: string) {
  bytes.min(6).parse(raw);
  const tx = decodeTx(profile, raw as Hex);
  if (encodeTx(profile, tx).toLowerCase() !== raw.toLowerCase())
    throw new Error('Noncanonical transaction');
  address.parse(tx.sender);
  if (
    !tx.frames.length ||
    tx.frames.length > 16 ||
    !tx.nonceKeys.length ||
    tx.nonceKeys.length > 16 ||
    tx.signatures.length > 8 ||
    tx.recentRootReferences.length > 16 ||
    tx.blobVersionedHashes.length
  )
    throw new Error('Unsupported transaction size or blobs');
  let gas = 0n;
  for (const frame of tx.frames) {
    if (frame.target !== null) address.parse(frame.target);
    bytes.parse(frame.data);
    gas += frame.limits.execution + frame.limits.state;
  }
  if (gas > 3_000_000n || gas === 0n)
    throw new Error('Dry-run gas limit exceeded');
  if (tx.fees.maxPriorityFeePerGas > tx.fees.maxFeePerGas)
    throw new Error('Invalid fee ordering');
  return tx;
}

const blockSchema = z.object({ number: quantity, hash });
const simulation = z
  .object({
    canonicalMempoolValid: z.boolean().optional(),
    canonicalMempoolViolation: z.string().max(4096).nullable().optional(),
    valid: z.boolean().optional(),
    violation: z.string().max(4096).nullable().optional(),
    prefixShape: z.string().max(128).nullable(),
    payer: address.nullable(),
    maxCost: quantity,
    gasUsed: quantity.nullable(),
    frames: z
      .array(z.object({ gasUsed: quantity, succeeded: z.boolean() }))
      .max(16)
      .nullable(),
    executionStatus: z.enum(['success', 'reverted']).nullable(),
    executionError: z.string().max(4096).nullable(),
  })
  .refine(
    (v) => (v.canonicalMempoolValid !== undefined) !== (v.valid !== undefined),
    'Unknown or ambiguous simulation policy',
  );

export async function runUserTest(
  input: UserTestInput,
  read: TestReader,
  expectedChain = 1337n,
) {
  const parsed = userTestInput.parse(input);
  // Decode before contacting the network. Never sign, alter or submit these bytes.
  const tx =
    parsed.kind === 'transaction' ? decodeUserTransaction(parsed.raw) : null;
  const chainId = await read('eth_chainId', [], quantity);
  if (BigInt(chainId) !== expectedChain)
    throw new Error('Unexpected execution chain');
  if (tx && tx.chainId !== BigInt(chainId))
    throw new Error('Transaction chain ID does not match the selected network');
  const block = await read(
    'eth_getBlockByNumber',
    ['latest', false],
    blockSchema,
  );
  const checks: Array<{
    name: string;
    result: 'PASS' | 'FAIL' | 'NOT_VERIFIED';
    observed: unknown;
  }> = [];
  let summary: unknown;
  if (parsed.kind === 'transaction' && tx) {
    summary = {
      hash: txHash(profile, tx),
      sender: tx.sender,
      chainId: `0x${tx.chainId.toString(16)}`,
      frameCount: tx.frames.length,
      nonceKeys: tx.nonceKeys.map(String),
      nonceSequence: String(tx.nonceSeq),
    };
    try {
      const observed = await read(
        'ethrex_simulateFrameTransaction',
        [parsed.raw, block.number, { trace: false }],
        simulation,
      );
      const canonical = observed.canonicalMempoolValid ?? observed.valid;
      checks.push({
        name: 'canonical-mempool-policy',
        result: canonical ? 'PASS' : 'FAIL',
        observed: {
          valid: canonical,
          violation:
            observed.canonicalMempoolViolation ?? observed.violation ?? null,
        },
      });
      checks.push({
        name: 'frame-execution',
        result:
          !observed.frames || !observed.executionStatus
            ? 'NOT_VERIFIED'
            : observed.executionStatus === 'success' &&
                observed.frames.length === tx.frames.length &&
                observed.frames.every((f) => f.succeeded)
              ? 'PASS'
              : 'FAIL',
        observed,
      });
    } catch (error) {
      if (!(error instanceof TestRpcError)) throw error;
      checks.push({
        name: 'simulation-rpc',
        result: 'NOT_VERIFIED',
        observed: { code: error.code, revertData: error.data ?? null },
      });
    }
  } else if (parsed.kind === 'contract') {
    summary = {
      address: parsed.to,
      caller: parsed.from,
      calldata: parsed.data,
      value: parsed.value,
      gas: parsed.gas,
      expectedReturn: parsed.expectedReturn ?? null,
    };
    const code = await read(
      'eth_getCode',
      [parsed.to, block.number],
      hexData.max(131074),
    );
    checks.push({
      name: 'deployed-code',
      result: code === '0x' ? 'FAIL' : 'PASS',
      observed: { bytes: (code.length - 2) / 2, hash: keccak256(code as Hex) },
    });
    if (code !== '0x') {
      try {
        const returned = await read(
          'eth_call',
          [
            {
              to: parsed.to,
              from: parsed.from,
              data: parsed.data,
              value: parsed.value,
              gas: parsed.gas,
            },
            block.number,
          ],
          bytes,
        );
        checks.push({
          name: 'contract-call',
          result: 'PASS',
          observed: { returned },
        });
        if (parsed.expectedReturn !== undefined)
          checks.push({
            name: 'expected-return',
            result:
              returned.toLowerCase() === parsed.expectedReturn.toLowerCase()
                ? 'PASS'
                : 'FAIL',
            observed: { expected: parsed.expectedReturn, returned },
          });
      } catch (error) {
        if (!(error instanceof TestRpcError)) throw error;
        checks.push({
          name: 'contract-call',
          result: error.code === 3 ? 'FAIL' : 'NOT_VERIFIED',
          observed: { code: error.code, revertData: error.data ?? null },
        });
      }
    }
  }
  const after = await read(
    'eth_getBlockByNumber',
    [block.number, false],
    blockSchema,
  );
  checks.push({
    name: 'snapshot-continuity',
    result:
      after.hash === block.hash && after.number === block.number
        ? 'PASS'
        : 'NOT_VERIFIED',
    observed: { before: block, after },
  });
  return {
    mode: 'USER_SUPPLIED_DRY_RUN',
    kind: parsed.kind,
    observedAt: new Date().toISOString(),
    chainId,
    block,
    summary,
    checks,
    result:
      after.hash !== block.hash || after.number !== block.number
        ? 'NOT_VERIFIED'
        : checks.some((c) => c.result === 'FAIL')
          ? 'FAIL'
          : checks.some((c) => c.result === 'NOT_VERIFIED')
            ? 'NOT_VERIFIED'
            : 'PASS',
    alternativeMempoolAdmission: 'NOT_TESTED',
    broadcast: false,
    scope:
      parsed.kind === 'transaction'
        ? 'Exact signed bytes; execution-client canonical policy and frame simulation. No alternative-mempool admission or mining is inferred.'
        : 'One eth_call against deployed code with optional exact return-data assertion. This does not certify EIP-8141 account compatibility, security or lifecycle behavior.',
  };
}

export function createUserTestHandler(read: TestReader = publicTestReader()) {
  let active = 0;
  return async (request: Request) => {
    const reply = (status: number, value: unknown) =>
      Response.json(value, {
        status,
        headers: {
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    const url = new URL(request.url);
    if (
      request.headers.get('sec-fetch-site') === 'cross-site' ||
      (request.headers.has('origin') &&
        request.headers.get('origin') !== url.origin)
    )
      return reply(403, { error: 'Same-origin requests only' });
    if (url.pathname !== '/api/test' || url.search)
      return reply(400, { error: 'Fixed test route required' });
    if (request.method !== 'POST')
      return reply(405, {
        error: 'Use POST with a transaction or contract call',
      });
    if (
      request.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      return reply(415, { error: 'JSON input required' });
    if (active >= 2)
      return reply(429, { error: 'Dry-run capacity busy; retry shortly' });
    active++;
    try {
      let input: UserTestInput;
      try {
        input = userTestInput.parse(
          JSON.parse((await boundedTestBody(request, 49152)).toString('utf8')),
        );
        if (
          input.kind === 'transaction' &&
          decodeUserTransaction(input.raw).chainId !== 1337n
        )
          return reply(400, {
            error:
              'Signed transaction chain ID must be 1337 for the sponsor devnet. Sign for that network; Aftershock will not alter your bytes.',
          });
      } catch {
        return reply(400, {
          error:
            'Invalid input. Provide canonical type-0x06 bytes (up to 16 KiB and 3 million gas), or a contract address, caller and hex calldata. Private keys, custom RPC URLs and scripts are not accepted.',
        });
      }
      const result = await runUserTest(input, read);
      return reply(200, {
        endpoint: TEST_EXECUTION_RPC,
        sourceIdentity: 'NOT_VERIFIED',
        ...result,
      });
    } catch {
      return reply(502, {
        error:
          'Dry-run evidence unavailable: check chain ID, node availability and input compatibility. No archived result was substituted.',
      });
    } finally {
      active--;
    }
  };
}
