import { z } from 'zod';

export const GATEWAY = 'https://altmempoolgateway.forshtat.com/rpc';
const methods = [
  'eth_chainId',
  'skandha_explorer_info',
  'skandha_frameTransactionStatus',
  'skandha_explorer_getTransaction',
  'eth_getFrameTransactionReceipt',
] as const;
type ReadMethod = (typeof methods)[number];

export class RpcFailure extends Error {
  constructor(
    readonly kind: 'TRANSPORT' | 'HTTP' | 'FORMAT' | 'RPC',
    readonly code?: number,
  ) {
    super(
      `Gateway read failed (${kind}${code === undefined ? '' : ` ${code}`})`,
    );
  }
}

export class GatewayReader {
  private nextId = 1;

  constructor(
    private readonly transport: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async read<T>(
    method: ReadMethod,
    params: readonly unknown[],
    schema: z.ZodType<T>,
  ): Promise<T> {
    if (!methods.includes(method)) throw new RpcFailure('FORMAT');
    const id = this.nextId++;
    let response: Response;
    try {
      response = await this.transport(GATEWAY, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'error',
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new RpcFailure('TRANSPORT');
    }
    if (!response.ok) throw new RpcFailure('HTTP', response.status);
    let decoded: unknown;
    try {
      if (!response.body) throw new Error('Missing body');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_048_576) {
          await reader.cancel();
          throw new Error('Oversized body');
        }
        chunks.push(value);
      }
      decoded = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new RpcFailure('FORMAT');
    }
    const envelope = z
      .object({
        jsonrpc: z.literal('2.0'),
        id: z.literal(id),
        result: z.unknown().optional(),
        error: z.object({ code: z.number().int() }).optional(),
      })
      .safeParse(decoded);
    if (!envelope.success) throw new RpcFailure('FORMAT');
    if (envelope.data.error)
      throw new RpcFailure('RPC', envelope.data.error.code);
    if (!Object.hasOwn(envelope.data, 'result')) throw new RpcFailure('FORMAT');
    const result = schema.safeParse(envelope.data.result);
    if (!result.success) throw new RpcFailure('FORMAT');
    return result.data;
  }
}
