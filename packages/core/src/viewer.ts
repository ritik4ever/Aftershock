import { createServer } from 'node:http';
import { open, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { readRun, markdownReport } from './report.js';
import { runReport, scenarioCatalogue, definitions } from './scenario.js';
import { checkEvidence } from './evidence-check.js';
import { compareRuns, replayPlan } from './replay.js';

const samples = {
  keyed: 'rpc-keyed-nonce-lifecycle.json',
  payer: 'rpc-paymaster-solvency.json',
  ttl: 'keyed-replacement-ttl.json',
  cancelled: 'cancelled-replacement.json',
} as const;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function startViewer(root: string, port = 4318) {
  z.number().int().min(0).max(65535).parse(port);
  const assets = new Map(
    await Promise.all(
      [
        ['/', 'index.html', 'text/html'],
        ['/app.js', 'app.js', 'text/javascript'],
        ['/style.css', 'style.css', 'text/css'],
      ].map(
        async ([route, file, type]) =>
          [
            route!,
            {
              body: await readFile(
                new URL(`./viewer/${file}`, import.meta.url),
              ),
              type: `${type}; charset=utf-8`,
            },
          ] as const,
      ),
    ),
  );
  async function load(key: string) {
    const [kind, id, extra] = key.split(':');
    if (extra !== undefined || !id) throw new Error('Invalid report key');
    if (kind === 'local' && uuid.test(id)) return readRun(root, id);
    if (kind !== 'sample' || !Object.hasOwn(samples, id))
      throw new Error('Invalid report key');
    const file = await open(
      resolve(root, 'docs/evidence', samples[id as keyof typeof samples]),
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 1_048_576)
        throw new Error('Invalid example');
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
      if (length > 1_048_576) throw new Error('Example too large');
      return runReport.parse(JSON.parse(buffer.toString('utf8', 0, length)));
    } finally {
      await file.close();
    }
  }
  let boundPort = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host;
    if (
      ![`127.0.0.1:${boundPort}`, `localhost:${boundPort}`].includes(
        host ?? '',
      ) ||
      (req.headers.origin !== undefined &&
        req.headers.origin !== `http://${host}`) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      json(403, { error: 'Local same-origin requests only' });
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      json(405, { error: 'Read-only viewer' });
      return;
    }
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) {
      json(400, { error: 'Invalid route' });
      return;
    }
    const url = new URL(req.url, `http://${host}`);
    try {
      const asset = assets.get(url.pathname);
      if (asset && !url.search) {
        res.writeHead(200, { 'Content-Type': asset.type });
        res.end(asset.body);
        return;
      }
      if (url.pathname === '/api/scenarios' && !url.search) {
        json(200, {
          scenarios: scenarioCatalogue.map((scenario) => ({
            ...scenario,
            definition: definitions[scenario.id],
            command: `npm run --silent aftershock -- run ${scenario.id} --local${scenario.id === 'keyed-replacement-ttl' ? '' : ' --mine'}`,
          })),
          execution: 'CLI_ONLY',
          nodeConnectivity: 'NOT_CHECKED',
        });
        return;
      }
      if (url.pathname === '/api/runs' && !url.search) {
        let names: string[] = [];
        try {
          names = (
            await readdir(resolve(root, 'reports'), { withFileTypes: true })
          )
            .filter(
              (f) =>
                f.isFile() && /^[a-f0-9-]{36}\.scenario\.json$/i.test(f.name),
            )
            .map((f) => f.name.slice(0, -14));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        names.sort();
        const keys = [
          ...names.slice(0, 100).map((id) => `local:${id}`),
          ...Object.keys(samples).map((id) => `sample:${id}`),
        ];
        const runs = [];
        const seen = new Set<string>();
        let unavailable = 0;
        for (const key of keys) {
          try {
            const report = await load(key);
            if (seen.has(report.runId)) continue;
            seen.add(report.runId);
            runs.push({
              key,
              runId: report.runId,
              scenarioId: report.scenarioId,
              title: report.definition.title,
              result: report.result,
              startedAt: report.startedAt,
              steps: report.steps.length,
              complete: report.evidence?.complete ?? false,
              source: key.startsWith('sample:')
                ? 'Reviewed example'
                : 'Saved local run',
            });
          } catch {
            unavailable += 1;
          }
        }
        runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        json(200, { runs, unavailable, limited: names.length > 100 });
        return;
      }
      if (
        url.pathname === '/api/run' &&
        url.searchParams.size === 1 &&
        url.searchParams.has('key')
      ) {
        const report = await load(url.searchParams.get('key')!);
        json(200, { report, checks: checkEvidence(report) });
        return;
      }
      if (
        url.pathname === '/api/replay' &&
        url.searchParams.size === 1 &&
        url.searchParams.has('key')
      ) {
        const report = await load(url.searchParams.get('key')!);
        try {
          json(200, replayPlan(report));
        } catch {
          json(422, {
            error:
              'Saved run is incompatible with the current replay requirements',
          });
        }
        return;
      }
      if (
        url.pathname === '/api/download' &&
        url.searchParams.size === 2 &&
        url.searchParams.has('key') &&
        url.searchParams.has('format')
      ) {
        const format = url.searchParams.get('format');
        if (!['report', 'evidence', 'md'].includes(format ?? '')) {
          json(400, { error: 'Unknown export format' });
          return;
        }
        const report = await load(url.searchParams.get('key')!);
        if (format === 'evidence' && !report.evidence) {
          json(404, { error: 'No recorded journal' });
          return;
        }
        if (format === 'md') {
          res.writeHead(200, {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${report.runId}.md"`,
          });
          res.end(markdownReport(report));
          return;
        }
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${report.runId}.${format}.json"`,
        );
        json(
          200,
          format === 'report'
            ? report
            : { runId: report.runId, evidence: report.evidence },
        );
        return;
      }
      if (
        url.pathname === '/api/compare' &&
        url.searchParams.size === 2 &&
        url.searchParams.has('left') &&
        url.searchParams.has('right')
      ) {
        try {
          json(
            200,
            compareRuns(
              await load(url.searchParams.get('left')!),
              await load(url.searchParams.get('right')!),
            ),
          );
        } catch {
          json(422, {
            error:
              'Choose two distinct compatible runs of the same scenario. Reviewed examples may have older definitions.',
          });
        }
        return;
      }
      json(404, { error: 'Route not found' });
    } catch {
      json(404, { error: 'Report unavailable or invalid' });
    }
  });
  server.maxConnections = 16;
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  await new Promise<void>((yes, no) => {
    server.once('error', no);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', no);
      yes();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Viewer did not bind');
  boundPort = address.port;
  return {
    url: `http://127.0.0.1:${boundPort}`,
    close: () =>
      new Promise<void>((yes, no) => {
        server.close((error) => (error ? no(error) : yes()));
        server.closeAllConnections();
      }),
  };
}
