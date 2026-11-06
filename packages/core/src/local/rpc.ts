import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rpcMethod, recordRpc } from '../evidence.js';
import type { RpcMethod } from '../evidence.js';
import type { LocalEndpoint } from './fixture.js';

export class LocalRpcError extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
    readonly detail: string | undefined = undefined,
  ) {
    super(`Local RPC rejected (${code}, ${reason})`);
  }
}

export async function localRpc<T>(
  endpoint: LocalEndpoint,
  method: RpcMethod,
  params: unknown[],
  schema: z.ZodType<T>,
  purpose: 'READINESS' | 'SCENARIO' = 'SCENARIO',
): Promise<T> {
  rpcMethod.parse(method);
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
  const channel = url.hostname === '127.0.0.1' ? 'SIDECAR' : 'EXECUTION';
  try {
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
    const input: unknown = JSON.parse(stdout);
    const result = decodeLocalResponse(input, method, params, schema);
    recordRpc(
      method,
      channel,
      params,
      { result: (input as { result: unknown }).result },
      purpose,
    );
    return result;
  } catch (error) {
    recordRpc(
      method,
      channel,
      params,
      error instanceof LocalRpcError
        ? { code: error.code, reason: error.reason }
        : { reason: 'TRANSPORT_OR_SCHEMA' },
      purpose,
    );
    throw error;
  }
}

export function decodeLocalResponse<T>(
  input: unknown,
  method: RpcMethod,
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
      method === 'eth_sendRawTransaction' &&
      envelope.error.code === -32000 &&
      /^Invalid params: Frame transaction validation-prefix simulation failed: .*StorageReadNonSender/.test(
        message,
      )
        ? 'CANONICAL_FOREIGN_STORAGE'
        : method === 'eth_sendFrameTransaction' &&
            envelope.error.code === -32502 &&
            /^unstaked (sender|payer|factory) accessed .* slot /.test(message)
          ? 'UNSTAKED_FOREIGN_STORAGE'
          : admission &&
              /cannot cover its pending frame transactions/.test(message)
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
                      message ===
                        `transaction receipt not found for ${params[0]}`
                    ? 'RECEIPT_UNAVAILABLE'
                    : method === 'eth_sendFrameTransaction' &&
                        envelope.error.code === -32500 &&
                        /Nonce mismatch: expected \d+, got \d+/.test(message)
                      ? 'NONCE_MISMATCH'
                      : 'OTHER';
    throw new LocalRpcError(
      envelope.error.code,
      reason,
      message.slice(0, 2048),
    );
  }
  if (!Object.hasOwn(envelope, 'result')) throw new Error('Missing RPC result');
  return schema.parse(envelope.result);
}

export async function waitForRpc(endpoint: LocalEndpoint): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if (
        (await localRpc(
          endpoint,
          'eth_chainId',
          [],
          z.literal('0x9'),
          'READINESS',
        )) === '0x9'
      )
        return;
    } catch {
      if (attempt === 19) throw new Error('Local fixture did not become ready');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
