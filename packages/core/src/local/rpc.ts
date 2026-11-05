import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LocalEndpoint } from './fixture.js';

export class LocalRpcError extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super(`Local RPC rejected (${code}, ${reason})`);
  }
}

const methodSchema = z.enum([
  'eth_chainId',
  'web3_clientVersion',
  'eth_getBalance',
  'eth_getBlockByNumber',
  'eth_getTransactionCount',
  'eth_sendRawTransaction',
  'eth_getTransactionReceipt',
  'eth_sendFrameTransaction',
  'eth_getFrameTransactionByHash',
  'eth_getFrameTransactionReceipt',
  'ethrex_simulateFrameTransaction',
  'skandha_explorer_info',
  'skandha_explorer_getTransaction',
  'skandha_config',
  'skandha_frameTransactionStatus',
]);
type Method = z.infer<typeof methodSchema>;

export async function localRpc<T>(
  endpoint: LocalEndpoint,
  method: Method,
  params: unknown[],
  schema: z.ZodType<T>,
): Promise<T> {
  methodSchema.parse(method);
  const prefix = /^aftershock-([a-f0-9-]{36})-sidecar$/;
  const match = prefix.exec(endpoint.executor);
  const url = new URL(endpoint.url);
  if (
    !match ||
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    !['127.0.0.1', `aftershock-${match[1]}-ethrex`].includes(url.hostname)
  )
    throw new Error('Local RPC requires an owned fixture');
  // Fixed program + execFile argument array; no shell or user-supplied script is evaluated.
  const program = `const r=await fetch(process.argv[1],{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:process.argv[2],signal:AbortSignal.timeout(10000)});if(!r.ok||!r.body)throw Error('HTTP');const reader=r.body.getReader();const chunks=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>1048576){await reader.cancel();throw Error('SIZE')}chunks.push(value)}console.log(Buffer.concat(chunks).toString('utf8'));`;
  const { stdout } = await promisify(execFile)(
    'docker',
    [
      'exec',
      endpoint.executor,
      'bun',
      '-e',
      program,
      endpoint.url,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    ],
    { timeout: 15_000, maxBuffer: 1_048_576 },
  );
  return decodeLocalResponse(JSON.parse(stdout), method, params, schema);
}

export function decodeLocalResponse<T>(
  input: unknown,
  method: Method,
  params: unknown[],
  schema: z.ZodType<T>,
): T {
  const envelope = z
    .object({
      jsonrpc: z.literal('2.0'),
      id: z.literal(1),
      result: z.unknown().optional(),
      error: z
        .object({ code: z.number().int(), message: z.string() })
        .optional(),
    })
    .parse(input);
  if (Object.hasOwn(envelope, 'result') === Object.hasOwn(envelope, 'error'))
    throw new Error('RPC response must contain exactly one result or error');
  if (envelope.error) {
    const message = envelope.error.message;
    const admission =
      method === 'eth_sendFrameTransaction' && envelope.error.code === -32602;
    const reason =
      admission && /cannot cover its pending frame transactions/.test(message)
        ? 'BALANCE_OBLIGATIONS'
        : admission && /nonce key .*already held/.test(message)
          ? 'KEY_CONFLICT'
          : admission && /cannot be replaced: fee too low/.test(message)
            ? 'FEE_BUMP'
            : admission && /Frame transaction already known/.test(message)
              ? 'DUPLICATE'
              : method === 'eth_getFrameTransactionReceipt' &&
                  envelope.error.code === -32000 &&
                  typeof params[0] === 'string' &&
                  /^0x[0-9a-f]{64}$/i.test(params[0]) &&
                  message === `transaction receipt not found for ${params[0]}`
                ? 'RECEIPT_UNAVAILABLE'
                : method === 'eth_sendFrameTransaction' &&
                    envelope.error.code === -32500 &&
                    /Nonce mismatch: expected \d+, got \d+/.test(message)
                  ? 'NONCE_MISMATCH'
                  : 'OTHER';
    throw new LocalRpcError(envelope.error.code, reason);
  }
  if (!Object.hasOwn(envelope, 'result')) throw new Error('Missing RPC result');
  return schema.parse(envelope.result);
}

export async function waitForRpc(endpoint: LocalEndpoint): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if (
        (await localRpc(endpoint, 'eth_chainId', [], z.literal('0x9'))) ===
        '0x9'
      )
        return;
    } catch {
      if (attempt === 19) throw new Error('Local fixture did not become ready');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
