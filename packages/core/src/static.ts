import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { definitions, runReport, scenarioCatalogue } from './scenario.js';
import { checkEvidence } from './evidence-check.js';
import { compareRuns, replayPlan } from './replay.js';
import { markdownReport } from './report.js';
import { hash, quantity, receipt } from './schema.js';

// Deliberately excludes reports/, private run state and directory discovery.
const reviewed = {
  keyed: 'rpc-keyed-nonce-lifecycle.json',
  payer: 'rpc-paymaster-solvency.json',
  ttl: 'keyed-replacement-ttl.json',
  cancelled: 'cancelled-replacement.json',
  sponsor: 'staked-storage-boundary.json',
  'keyed-baseline': 'mined-keyed-nonce-lifecycle.json',
  'payer-baseline': 'mined-paymaster-solvency.json',
} as const;

async function capture(root: string, name: string) {
  const file = await open(
    resolve(root, 'docs/evidence', name),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1_048_576)
      throw new Error('Invalid reviewed capture');
    const buffer = Buffer.alloc(1_048_577);
    let length = 0;
    while (length < buffer.length) {
      const next = await file.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!next.bytesRead) break;
      length += next.bytesRead;
    }
    if (length > 1_048_576) throw new Error('Reviewed capture too large');
    return JSON.parse(buffer.toString('utf8', 0, length)) as unknown;
  } finally {
    await file.close();
  }
}

export async function buildStaticViewer(root: string) {
  // Build into a fresh directory; never publish stale files from an old output.
  const stage = resolve(root, `.local/static-${randomUUID()}`);
  await mkdir(stage, { recursive: true, mode: 0o700 });
  const routes: Record<string, string> = {};
  let sequence = 0;
  const emit = async (route: string, data: unknown, markdown = false) => {
    const file = `data-${++sequence}.${markdown ? 'md' : 'json'}`;
    const url = new URL(route, 'http://localhost');
    url.searchParams.sort();
    routes[url.pathname + url.search] = `/${file}`;
    await writeFile(
      resolve(stage, file),
      markdown ? String(data) : `${JSON.stringify(data)}\n`,
      { flag: 'wx' },
    );
  };
  const reports = await Promise.all(
    Object.entries(reviewed).map(async ([id, file]) => ({
      key: `sample:${id}`,
      report: runReport.parse(await capture(root, file)),
    })),
  );
  if (reports.some(({ report }) => report.endpointClass !== 'ISOLATED_LOCAL'))
    throw new Error('Only reviewed real runs may be published');
  const runs = reports.map(({ key, report }) => ({
    key,
    runId: report.runId,
    scenarioId: report.scenarioId,
    title: report.definition.title,
    result: report.result,
    startedAt: report.startedAt,
    steps: report.steps.length,
    complete: report.evidence?.complete ?? false,
    source: 'Reviewed example',
  }));
  await emit('/api/runs', {
    runs: runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    unavailable: 0,
    unavailableReports: [],
    limited: false,
  });
  await emit('/api/scenarios', {
    scenarios: scenarioCatalogue.map((scenario) => ({
      ...scenario,
      definition: definitions[scenario.id],
      command: `npm run --silent aftershock -- run ${scenario.id} --local${scenario.id === 'keyed-replacement-ttl' ? '' : ' --mine'}`,
    })),
    execution: 'CLI_ONLY',
    nodeConnectivity: 'NOT_CHECKED',
  });
  for (const { key, report } of reports) {
    const encoded = encodeURIComponent(key);
    await emit(`/api/run?key=${encoded}`, {
      report,
      checks: checkEvidence(report),
    });
    let plan: unknown;
    try {
      plan = replayPlan(report);
    } catch {
      plan = {
        error: 'Saved run is incompatible with current replay requirements',
      };
    }
    await emit(`/api/replay?key=${encoded}`, plan);
    await emit(`/api/download?key=${encoded}&format=report`, report);
    await emit(
      `/api/download?key=${encoded}&format=md`,
      markdownReport(report),
      true,
    );
    if (report.evidence)
      await emit(`/api/download?key=${encoded}&format=evidence`, {
        runId: report.runId,
        evidence: report.evidence,
      });
    for (const other of reports) {
      let comparison: unknown;
      try {
        comparison = compareRuns(report, other.report);
      } catch {
        comparison = {
          error: 'Choose two distinct compatible runs of the same scenario.',
        };
      }
      await emit(
        `/api/compare?left=${encoded}&right=${encodeURIComponent(other.key)}`,
        comparison,
      );
    }
  }
  const publicCapture = z
    .object({
      observedAt: z.iso.datetime(),
      endpointClass: z.literal('PUBLIC_DEVNET'),
      evidence: z.object({
        requestedHash: hash,
        chainId: quantity,
        receipt,
      }),
    })
    .parse(await capture(root, 'public-mined-2026-11-06.json'));
  const proof = publicCapture.evidence;
  if (
    proof.receipt.status !== 'success' ||
    proof.receipt.frameReceipts.some((frame) => frame.status !== 'success')
  )
    throw new Error('Public baseline lacks successful execution evidence');
  await writeFile(
    resolve(stage, 'public-baseline.json'),
    `${JSON.stringify(publicCapture)}\n`,
    { flag: 'wx' },
  );
  const proofHTML = `<section class="section"><p class="eyebrow">RECORDED PUBLIC DEVNET BASELINE</p><h2>Real submission. Successful frames.</h2><p>Chain ${BigInt(proof.chainId)}, block ${BigInt(proof.receipt.blockNumber)}; ${proof.receipt.frameReceipts.length} successful frames. Captured ${publicCapture.observedAt}. Workshop baseline; not an original scenario or live monitoring. Public source commit is unverified.</p><p class="data">${proof.requestedHash}</p><p><a href="https://explorer.altmempool.wtf/tx/${proof.requestedHash}?node=https%3A%2F%2Faltmempoolgateway.forshtat.com%2Frpc" target="_blank" rel="noopener noreferrer">Open explorer</a> · <a href="/public-baseline.json" download>Download recorded receipt</a></p></section>`;
  const html = (
    await readFile(new URL('./viewer/index.html', import.meta.url), 'utf8')
  )
    .replace(
      '<script src="/app.js" defer></script>',
      '<script src="/static-config.js" defer></script>\n    <script src="/app.js" defer></script>',
    )
    .replace('Local / Read only', 'Published snapshot / Read only')
    .replace('<main>', `<main>${proofHTML}`);
  await writeFile(resolve(stage, 'index.html'), html, { flag: 'wx' });
  await writeFile(
    resolve(stage, 'static-config.js'),
    `globalThis.aftershockStatic = Object.freeze(${JSON.stringify(routes)});\n`,
    { flag: 'wx' },
  );
  for (const asset of ['app.js', 'style.css'])
    await writeFile(
      resolve(stage, asset),
      await readFile(new URL(`./viewer/${asset}`, import.meta.url)),
      { flag: 'wx' },
    );
  await rename(stage, resolve(root, 'dist'));
  return { directory: resolve(root, 'dist'), reviewedRuns: reports.length };
}
