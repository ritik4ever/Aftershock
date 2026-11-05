import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid result object');
  }
  return value;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateResult(method, result) {
  if (!['eth_chainId', 'skandha_explorer_info', 'skandha_config'].includes(method)) {
    throw new Error('Unsupported diagnostic method');
  }
  if (method === 'eth_chainId') {
    if (typeof result !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(result)) {
      throw new Error('Invalid chain ID');
    }
    return result;
  }
  record(result);
  const fields = method === 'skandha_config'
    ? {
        chainId: safeInteger,
        minStake: (value) => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value),
        minUnstakeDelay: safeInteger,
        useropsTTL: safeInteger,
        bundleSize: safeInteger,
      }
    : {
        protocolVersion: (value) => value === 1,
        chainId: safeInteger,
        version: (value) => typeof value === 'string' && /^v?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(value),
        commit: (value) => typeof value === 'string' && /^(?:[a-f0-9]{7,40})?$/i.test(value),
        bundlingMode: (value) => ['manual', 'auto'].includes(value),
        p2pEnabled: (value) => typeof value === 'boolean',
        latestSeq: safeInteger,
        oldestSeq: safeInteger,
        historyCapacity: safeInteger,
        bootId: (value) => typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value),
        minInclusionDenominator: safeInteger,
        throttlingSlack: safeInteger,
        banSlack: safeInteger,
      };
  const selected = {};
  for (const [key, valid] of Object.entries(fields)) {
    if (!valid(result[key])) throw new Error(`Invalid result field: ${key}`);
    selected[key] = result[key];
  }
  if (method === 'skandha_explorer_info') {
    if (result.oldestSeq > result.latestSeq) throw new Error('Invalid history bounds');
    if (Object.hasOwn(result, 'faucetEnabled')) {
      if (typeof result.faucetEnabled !== 'boolean') throw new Error('Invalid faucet flag');
      selected.faucetEnabled = result.faucetEnabled;
    }
  }
  return selected;
}

// Dependency injection is only for unit tests; the CLI always uses native HTTPS fetch.
export async function probe(fetchImpl = fetch, timeoutMs = 15_000) {
  const endpoint = 'https://altmempoolgateway.forshtat.com/rpc';
  const methods = ['eth_chainId', 'skandha_explorer_info', 'skandha_config'];
  const evidence = {
    observedAt: new Date().toISOString(),
    endpointClass: 'PUBLIC_DEVNET',
    endpoint,
    sourceCommitVerified: false,
    observations: [],
  };
  for (const [index, method] of methods.entries()) {
    const id = index + 1;
    const request = { jsonrpc: '2.0', id, method, params: [] };
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('Missing response body');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_048_576) {
          await reader.cancel();
          throw new Error('Response exceeds 1 MiB');
        }
        chunks.push(Buffer.from(value));
      }
      const decoded = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (decoded.jsonrpc !== '2.0' || decoded.id !== id) {
        throw new Error('Invalid JSON-RPC envelope');
      }
      if (Object.hasOwn(decoded, 'error') || !Object.hasOwn(decoded, 'result')) {
        throw new Error('RPC response contains an error or no result');
      }
      const result = validateResult(method, decoded.result);
      evidence.observations.push({ request, httpStatus: response.status, result });
    } catch {
      // Untrusted error text and arbitrary server fields never enter exported evidence.
      evidence.observations.push({ request, error: 'Read failed or response invalid' });
    }
  }
  const [chain, explorer, config] = evidence.observations.map((entry) => entry.result);
  if (chain && explorer && config) {
    if (BigInt(chain) !== BigInt(explorer.chainId) || explorer.chainId !== config.chainId) {
      evidence.consistencyError = 'Chain IDs disagree across diagnostic responses';
    }
  }
  return evidence;
}

async function main() {
  const args = process.argv.slice(2);
  const save = args.length === 2 && args[0] === '--save' && args[1].trim() !== '';
  if (!save && args.length !== 0) {
    process.stderr.write('Usage: node scripts/probe-devnet.mjs [--save <new-file>]\n');
    process.exitCode = 2;
    return;
  }
  const evidence = await probe();
  if (evidence.consistencyError || evidence.observations.some((entry) => entry.error)) {
    process.exitCode = 1;
  }
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (save) {
    try {
      await writeFile(args[1], output, { flag: 'wx', mode: 0o600 });
    } catch {
      process.stderr.write('Cannot save evidence: destination must be a new writable file.\n');
      process.exitCode = 1;
      return;
    }
  }
  process.stdout.write(output);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
