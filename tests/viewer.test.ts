import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startViewer } from '../packages/core/src/viewer.js';
import { saveRun, markdownReport } from '../packages/core/src/report.js';
import {
  runReport,
  scenarioCatalogue,
  definitions,
} from '../packages/core/src/scenario.js';
import { replayPlan } from '../packages/core/src/replay.js';

const keyed = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
  ),
);
const previous = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/mined-keyed-nonce-lifecycle.json', 'utf8'),
  ),
);
const cancelled = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/cancelled-replacement.json', 'utf8'),
  ),
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-viewer-'));
  await saveRun(root, keyed);
  await saveRun(root, previous);
  await mkdir(join(root, 'docs/evidence'), { recursive: true });
  for (const name of [
    'rpc-keyed-nonce-lifecycle',
    'rpc-paymaster-solvency',
    'keyed-replacement-ttl',
    'cancelled-replacement',
    'staked-storage-boundary',
  ])
    await writeFile(
      join(root, 'docs/evidence', `${name}.json`),
      await readFile(`docs/evidence/${name}.json`),
    );
  const viewer = await startViewer(root, 0);
  return { root, ...viewer };
}

test('viewer serves real saved reports, reviewed examples and immutable exports', async () => {
  const v = await fixture();
  try {
    const html = await fetch(v.url);
    assert.deepEqual(await (await fetch(v.url + '/api/execute')).json(), {
      job: null,
    });
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Find the failures/);
    assert.match(
      html.headers.get('content-security-policy')!,
      /frame-ancestors 'none'/,
    );
    assert.equal(html.headers.get('cache-control'), 'no-store');
    for (const asset of ['/app.js', '/style.css'])
      assert.equal((await fetch(v.url + asset)).status, 200);
    const runs = await (await fetch(v.url + '/api/runs')).json();
    assert.equal(runs.runs.length, 6);
    assert.equal(
      new Set(runs.runs.map((r: { runId: string }) => r.runId)).size,
      6,
    );
    assert.equal(
      runs.runs.find((r: { runId: string }) => r.runId === keyed.runId).source,
      'Saved local run',
    );
    assert.equal(runs.unavailable, 0);
    assert.equal(
      runs.runs.filter(
        (r: { source: string }) => r.source === 'Reviewed example',
      ).length,
      4,
    );
    const path = join(v.root, 'reports', `${keyed.runId}.scenario.json`);
    const before = await readFile(path);
    const detail = await (
      await fetch(`${v.url}/api/run?key=local:${keyed.runId}`)
    ).json();
    assert.deepEqual(detail.report, keyed);
    assert.equal(detail.checks.status, 'CONSISTENT');
    const finding = await (
      await fetch(v.url + '/api/run?key=sample:cancelled')
    ).json();
    assert.deepEqual(finding.report, cancelled);
    assert.equal(finding.report.result, 'FAIL');
    assert.equal(finding.checks.status, 'INSUFFICIENT');
    const sponsor = await (
      await fetch(v.url + '/api/run?key=sample:sponsor')
    ).json();
    assert.deepEqual(
      sponsor.report,
      runReport.parse(
        JSON.parse(
          await readFile('docs/evidence/staked-storage-boundary.json', 'utf8'),
        ),
      ),
    );
    assert.equal(sponsor.report.result, 'PASS');
    const sponsorReplay = await fetch(v.url + '/api/replay?key=sample:sponsor');
    assert.equal(sponsorReplay.status, 200);
    assert.equal((await sponsorReplay.json()).mining, true);
    assert.equal(
      sponsor.report.steps.find(
        (step: { id: string }) => step.id === 'observe-alt-inclusion',
      ).observed.storagePassedWithoutWaiver,
      true,
    );
    const sponsorDownload = await fetch(
      v.url + '/api/download?key=sample:sponsor&format=md',
    );
    assert.equal(await sponsorDownload.text(), markdownReport(sponsor.report));
    const download = await fetch(
      `${v.url}/api/download?key=local:${keyed.runId}&format=report`,
    );
    assert.match(download.headers.get('content-disposition')!, /attachment/);
    assert.deepEqual(await download.json(), keyed);
    const markdown = await fetch(
      `${v.url}/api/download?key=local:${keyed.runId}&format=md`,
    );
    assert.equal(markdown.status, 200);
    assert.equal(
      markdown.headers.get('content-type'),
      'text/markdown; charset=utf-8',
    );
    assert.match(
      markdown.headers.get('content-disposition')!,
      new RegExp(`${keyed.runId}\\.md`),
    );
    assert.equal(await markdown.text(), markdownReport(keyed));
    const failedMarkdown = await fetch(
      `${v.url}/api/download?key=sample:cancelled&format=md`,
    );
    assert.match(await failedMarkdown.text(), /Result: FAIL/);
    const evidence = await (
      await fetch(
        `${v.url}/api/download?key=local:${keyed.runId}&format=evidence`,
      )
    ).json();
    assert.deepEqual(evidence.evidence, keyed.evidence);
    assert.deepEqual(await readFile(path), before);
    const comparison = await fetch(
      `${v.url}/api/compare?left=local:${keyed.runId}&right=local:${previous.runId}`,
    );
    assert.equal(comparison.status, 200);
    assert.equal((await comparison.json()).exactHistoricalReplay, false);
    assert.equal(
      (
        await fetch(
          `${v.url}/api/compare?left=sample:keyed&right=local:${keyed.runId}`,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await fetch(
          `${v.url}/api/download?key=local:${previous.runId}&format=evidence`,
        )
      ).status,
      404,
    );
  } finally {
    await v.close();
  }
});

test('external links can open only the top-level page while local APIs remain protected', async () => {
  const v = await fixture();
  const navigation = {
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
  };
  const get = (path: string, headers: Record<string, string>, method = 'GET') =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(v.url + path, { method, headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });
      req.on('error', reject);
      req.end();
    });
  try {
    const page = await get('/', navigation);
    assert.equal(page.status, 200);
    assert.match(page.body, /Aftershock/);
    for (const path of [
      '/api/execute',
      '/api/runs',
      '/api/live',
      '/app.js',
      '/?job=anything',
    ])
      assert.equal((await get(path, navigation)).status, 403, path);
    assert.equal(
      (await get('/', { ...navigation, 'sec-fetch-dest': 'iframe' })).status,
      403,
    );
    assert.equal(
      (await get('/', { ...navigation, 'sec-fetch-mode': 'cors' })).status,
      403,
    );
    assert.equal(
      (await get('/', { ...navigation, origin: 'https://attacker.example' }))
        .status,
      403,
    );
    assert.equal(
      (await get('/', { ...navigation, host: 'attacker.example' })).status,
      403,
    );
    assert.equal((await get('/api/execute', navigation, 'POST')).status, 403);
  } finally {
    await v.close();
  }
});

test('viewer rejects cross-origin access, write requests and filesystem routes', async () => {
  const v = await fixture();
  try {
    assert.equal(
      (await fetch(v.url + '/api/runs', { method: 'POST' })).status,
      405,
    );
    assert.equal(
      (
        await fetch(v.url + '/api/runs', {
          headers: { origin: 'https://attacker.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(v.url + '/api/runs', {
          headers: { 'sec-fetch-site': 'cross-site' },
        })
      ).status,
      403,
    );
    const rebound = await new Promise<number>((resolve) => {
      const req = httpRequest(
        v.url + '/api/runs',
        { headers: { host: 'attacker.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.end();
    });
    assert.equal(rebound, 403);
    for (const route of [
      '/.local/keys.json',
      '/api/run?key=local:../secret',
      '/api/run?key=sample:../../secret',
      '/api/runs?path=.local',
      '/api/run?key=sample:keyed&key=sample:payer',
      '/api/download?key=sample:keyed&format=html',
      '/api/replay?key=sample:keyed&key=sample:payer',
      '/api/scenarios?run=true',
    ])
      assert.ok((await fetch(v.url + route)).status >= 400, route);
  } finally {
    await v.close();
  }
});

test('local scenario start rejects cross-origin, scripts, malformed and oversized bodies before execution', async () => {
  const v = await fixture();
  try {
    const start = (body: string, headers: Record<string, string> = {}) =>
      fetch(v.url + '/api/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
      });
    assert.equal(
      (await start('{}', { origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal(
      (await start('{}', { 'sec-fetch-site': 'cross-site' })).status,
      403,
    );
    assert.equal(
      (await start('{}', { 'content-type': 'text/plain' })).status,
      415,
    );
    assert.equal((await start('{bad')).status, 400);
    assert.equal(
      (
        await start(
          JSON.stringify({
            scenarioId: 'keyed-replacement-ttl',
            script: 'anything',
          }),
        )
      ).status,
      400,
    );
    assert.equal((await start('x'.repeat(1025))).status, 413);
    assert.equal(
      (await fetch(v.url + '/api/execute?job=../secret')).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          v.url + '/api/execute?job=11111111-1111-4111-8111-111111111111',
        )
      ).status,
      404,
    );
  } finally {
    await v.close();
  }
});

test('viewer exposes current scenario definitions and replay plans without executing commands', async () => {
  const v = await fixture();
  try {
    const response = await fetch(v.url + '/api/scenarios');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.execution, 'CLI_ONLY');
    assert.equal(data.nodeConnectivity, 'NOT_CHECKED');
    assert.equal(data.scenarios.length, scenarioCatalogue.length);
    for (const item of data.scenarios) {
      const id = item.id as keyof typeof definitions;
      assert.deepEqual(item.definition, definitions[id]);
      assert.match(item.command, new RegExp(`run ${id} --local`));
      assert.equal(
        item.command.endsWith('--mine'),
        id !== 'keyed-replacement-ttl',
      );
    }
    const plan = await fetch(`${v.url}/api/replay?key=local:${keyed.runId}`);
    assert.equal(plan.status, 200);
    assert.deepEqual(await plan.json(), replayPlan(keyed));
    const incompatible = {
      ...structuredClone(keyed),
      runId: '33333333-3333-4333-8333-333333333333',
    };
    incompatible.definition.title = 'Historical definition';
    await saveRun(v.root, incompatible);
    assert.equal(
      (await fetch(`${v.url}/api/replay?key=local:${incompatible.runId}`))
        .status,
      422,
    );
    // An unsupported replay never hides an otherwise valid historical report.
    assert.equal(
      (await fetch(`${v.url}/api/run?key=local:${incompatible.runId}`)).status,
      200,
    );
    assert.equal(
      (await fetch(v.url + '/api/replay?key=local:../private')).status,
      404,
    );
    assert.equal(
      (await fetch(v.url + '/api/replay?key=sample:keyed', { method: 'POST' }))
        .status,
      405,
    );
  } finally {
    await v.close();
  }
});

test('invalid and symlinked reports never become readable viewer data', async () => {
  const v = await fixture();
  try {
    const id = '11111111-1111-4111-8111-111111111111';
    await writeFile(
      join(v.root, 'reports', `${id}.scenario.json`),
      'PRIVATE_LOCAL_SENTINEL',
    );
    const response = await fetch(`${v.url}/api/run?key=local:${id}`);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('PRIVATE_LOCAL_SENTINEL'));
    const alias = '22222222-2222-4222-8222-222222222222';
    await symlink(
      join(v.root, 'reports', `${keyed.runId}.scenario.json`),
      join(v.root, 'reports', `${alias}.scenario.json`),
    );
    assert.equal(
      (await fetch(`${v.url}/api/run?key=local:${alias}`)).status,
      404,
    );
    const listingText = await (await fetch(v.url + '/api/runs')).text();
    assert.ok(!listingText.includes('PRIVATE_LOCAL_SENTINEL'));
    const listing = JSON.parse(listingText);
    assert.equal(listing.unavailable, 1);
    assert.deepEqual(listing.unavailableReports, [
      { key: `local:${id}`, reason: 'FORMAT_OR_SCHEMA' },
    ]);
  } finally {
    await v.close();
  }
});

test('viewer reports integrity failures without exposing or rewriting report contents', async () => {
  const v = await fixture();
  try {
    const path = join(v.root, 'reports', `${keyed.runId}.scenario.json`);
    const envelope = JSON.parse(await readFile(path, 'utf8'));
    envelope.sha256 = '0'.repeat(64);
    const damaged = JSON.stringify(envelope);
    await writeFile(path, damaged);
    const listing = await (await fetch(v.url + '/api/runs')).json();
    assert.deepEqual(listing.unavailableReports, [
      { key: `local:${keyed.runId}`, reason: 'UNREADABLE_OR_INTEGRITY' },
    ]);
    assert.ok(
      listing.runs.some((run: { key: string }) => run.key === 'sample:keyed'),
    );
    assert.equal(await readFile(path, 'utf8'), damaged);
  } finally {
    await v.close();
  }
});

test('an empty workspace gets a truthful empty listing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-viewer-empty-'));
  const v = await startViewer(root, 0);
  try {
    const data = await (await fetch(v.url + '/api/runs')).json();
    assert.deepEqual(data.runs, []);
    assert.equal(data.unavailable, 5);
    assert.equal(data.unavailableReports.length, 5);
    assert.ok(
      data.unavailableReports.every(
        (item: { reason: string }) => item.reason === 'MISSING',
      ),
    );
  } finally {
    await v.close();
  }
});
