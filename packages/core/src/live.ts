import {
  doctor,
  evaluateInspection,
  historyGaps,
  UPSTREAM,
} from './inspect.js';
import { GatewayReader, GATEWAY, RpcFailure } from './rpc.js';
import {
  explorerInfo,
  explorerTransaction,
  hash,
  quantity,
  receipt,
  transactionStatus,
} from './schema.js';

function observation<T>(response: PromiseSettledResult<T>) {
  if (response.status === 'fulfilled')
    return { value: response.value, unavailable: null };
  const error: unknown = response.reason;
  return {
    value: null,
    unavailable:
      error instanceof RpcFailure
        ? {
            kind: error.kind,
            ...(error.code === undefined ? {} : { code: error.code }),
          }
        : { kind: 'UNAVAILABLE' },
  };
}

export async function liveTransaction(
  requestedHash: string,
  reader: GatewayReader,
) {
  hash.parse(requestedHash);
  const chainId = await reader.read('eth_chainId', [], quantity);
  const before = await reader.read('skandha_explorer_info', [], explorerInfo);
  const [admitted, lifecycle, mined] = await Promise.allSettled([
    reader.read(
      'skandha_explorer_getTransaction',
      [requestedHash],
      explorerTransaction,
    ),
    reader.read(
      'skandha_frameTransactionStatus',
      [requestedHash],
      transactionStatus,
    ),
    reader.read('eth_getFrameTransactionReceipt', [requestedHash], receipt),
  ]);
  const admission = observation(admitted),
    status = observation(lifecycle),
    frameReceipt = observation(mined);
  const after = await reader.read('skandha_explorer_info', [], explorerInfo);
  const issues = historyGaps(before, after);
  if (
    BigInt(chainId) !== BigInt(before.chainId) ||
    before.chainId !== after.chainId
  )
    issues.push('CHAIN_MISMATCH');
  if (before.commit !== after.commit || before.version !== after.version)
    issues.push('VERSION_CHANGED');
  const complete =
    admission.value && status.value && frameReceipt.value
      ? evaluateInspection({
          requestedHash,
          chainId,
          before,
          after,
          admission: admission.value,
          status: status.value,
          receipt: frameReceipt.value,
        })
      : null;
  if (complete) issues.push(...complete.issues);
  const expected = requestedHash.toLowerCase();
  if (
    (admission.value &&
      (admission.value.hash.toLowerCase() !== expected ||
        (admission.value.admission &&
          admission.value.admission.txHash.toLowerCase() !== expected) ||
        admission.value.events.some(
          (event) => event.txHash.toLowerCase() !== expected,
        ))) ||
    (status.value?.transaction &&
      status.value.transaction.toLowerCase() !== expected)
  )
    issues.push('HASH_MISMATCH');
  return {
    mode: 'LIVE_PUBLIC_READ',
    observedAt: new Date().toISOString(),
    endpoint: GATEWAY,
    endpointClass: 'PUBLIC_DEVNET',
    requestedHash,
    chainId,
    before,
    after,
    sourcePins: UPSTREAM,
    sourceCommitVerified:
      before.commit === UPSTREAM.sidecar && after.commit === UPSTREAM.sidecar,
    admission,
    status,
    receipt: frameReceipt,
    result: {
      admissionObserved:
        issues.length === 0 &&
        admission.value?.admission !== null &&
        admission.value?.admission !== undefined &&
        ['accepted', 'included'].includes(admission.value.admission.outcome),
      execution:
        !frameReceipt.value || !status.value || !complete || issues.length
          ? 'NOT_VERIFIED'
          : complete.executionSucceeded
            ? 'SUCCESS'
            : frameReceipt.value.status === 'reverted' ||
                frameReceipt.value.frameReceipts.some(
                  (frame) => frame.status !== 'success',
                )
              ? 'UNSUCCESSFUL'
              : 'NOT_VERIFIED',
      evidenceConsistent: issues.length === 0,
      evidenceComplete: Boolean(complete),
      issues: [...new Set(issues)],
      sourceSpecificVerdict: 'INCONCLUSIVE',
    },
  };
}

export function createLiveHandler(reader = new GatewayReader(fetch, 2500)) {
  let active = 0;
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, data: unknown) =>
      Response.json(data, {
        status,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    const url = new URL(request.url);
    if (request.method !== 'GET')
      return reply(405, { error: 'Live checks are read-only' });
    if (
      request.headers.get('sec-fetch-site') === 'cross-site' ||
      (request.headers.has('origin') &&
        request.headers.get('origin') !== url.origin)
    )
      return reply(403, { error: 'Same-origin requests only' });
    if (
      url.pathname !== '/api/live' ||
      url.searchParams.size > 1 ||
      (url.searchParams.size === 1 &&
        (!url.searchParams.has('hash') ||
          !hash.safeParse(url.searchParams.get('hash')).success))
    )
      return reply(400, {
        error:
          'Provide one valid transaction hash; custom RPC URLs and methods are unsupported',
      });
    if (active >= 2)
      return reply(429, { error: 'Live checks busy; retry shortly' });
    active++;
    try {
      const requested = url.searchParams.get('hash');
      return reply(
        200,
        requested
          ? await liveTransaction(requested, reader)
          : {
              ...(await doctor(reader)),
              mode: 'LIVE_PUBLIC_READ',
              observedAt: new Date().toISOString(),
            },
      );
    } catch (error) {
      return reply(502, {
        error:
          'Current gateway evidence unavailable; no saved result substituted',
        ...(error instanceof RpcFailure
          ? { failure: { kind: error.kind, code: error.code } }
          : {}),
      });
    } finally {
      active--;
    }
  };
}
