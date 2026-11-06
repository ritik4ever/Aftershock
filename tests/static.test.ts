import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { buildStaticViewer } from '../packages/core/src/static.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'aftershock-static-'));
  await mkdir(join(root, 'docs/evidence'), { recursive: true });
  for (const name of [
    'rpc-keyed-nonce-lifecycle',
    'rpc-paymaster-solvency',
    'keyed-replacement-ttl',
    'cancelled-replacement',
    'staked-storage-boundary',
    'mined-keyed-nonce-lifecycle',
    'mined-paymaster-solvency',
    'public-mined-2026-11-06',
  ])
    await writeFile(
      join(root, 'docs/evidence', `${name}.json`),
      await readFile(`docs/evidence/${name}.json`),
    );
  await mkdir(join(root, 'reports'));
  await mkdir(join(root, '.local'));
  await writeFile(
    join(root, 'reports/private.json'),
    'PRIVATE_EXPORT_SENTINEL',
  );
  await writeFile(join(root, '.local/keys.json'), 'PRIVATE_EXPORT_SENTINEL');
  await writeFile(
    join(root, 'docs/evidence/unreviewed.json'),
    'PRIVATE_EXPORT_SENTINEL',
  );
  return root;
}

test('static export publishes only reviewed evidence with working reports, downloads, replay and comparisons', async () => {
  const root = await fixture();
  const output = await buildStaticViewer(root);
  assert.equal(output.reviewedRuns, 7);
  const context: { aftershockStatic?: Record<string, string> } = {};
  runInNewContext(
    await readFile(join(output.directory, 'static-config.js'), 'utf8'),
    context,
  );
  const routes = context.aftershockStatic!;
  assert.ok(
    !Object.keys(routes).some((route) => route.startsWith('/api/execute')),
  );
  const data = async (route: string) => {
    const url = new URL(route, 'http://localhost');
    url.searchParams.sort();
    const file = routes[url.pathname + url.search];
    assert.ok(file, route);
    return JSON.parse(
      await readFile(join(output.directory, file.slice(1)), 'utf8'),
    );
  };
  const listing = await data('/api/runs');
  assert.equal(listing.runs.length, 7);
  assert.equal(listing.unavailable, 0);
  assert.equal(
    listing.runs.filter((r: { result: string }) => r.result === 'FAIL').length,
    1,
  );
  let compatiblePairs = 0;
  for (const run of listing.runs) {
    const key = encodeURIComponent(run.key);
    const detail = await data(`/api/run?key=${key}`);
    assert.equal(detail.report.runId, run.runId);
    assert.deepEqual(
      await data(`/api/download?key=${key}&format=report`),
      detail.report,
    );
    const md = routes[`/api/download?format=md&key=${key}`]!;
    assert.match(
      await readFile(join(output.directory, md.slice(1)), 'utf8'),
      new RegExp(run.runId),
    );
    await data(`/api/replay?key=${key}`);
    for (const other of listing.runs) {
      const compared = await data(
        `/api/compare?left=${key}&right=${encodeURIComponent(other.key)}`,
      );
      if (run.key === other.key || run.scenarioId !== other.scenarioId)
        assert.ok(compared.error);
      else if (!compared.error) compatiblePairs++;
    }
  }
  assert.ok(
    compatiblePairs >= 2,
    'published captures must support a genuine compatible comparison',
  );
  const html = await readFile(join(output.directory, 'index.html'), 'utf8');
  assert.match(html, /Hosted workspace/);
  assert.match(html, /id="execute-controls" hidden/);
  assert.doesNotMatch(html, /id="local-runner-link" hidden/);
  assert.match(html, /block 2020/);
  assert.match(html, /not an original scenario or live monitoring/);
  for (const name of await readdir(output.directory)) {
    assert.match(
      name,
      /^(index\.html|app\.js|style\.css|favicon\.svg|static-config\.js|public-baseline\.json|data-\d+\.(json|md))$/,
    );
    assert.doesNotMatch(
      await readFile(join(output.directory, name), 'utf8'),
      /PRIVATE_EXPORT_SENTINEL/,
    );
  }
  await assert.rejects(buildStaticViewer(root));
});

test('static export refuses unsafe or mock reviewed captures before publishing', async () => {
  const root = await fixture();
  const file = join(root, 'docs/evidence/rpc-keyed-nonce-lifecycle.json');
  const original = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(
    file,
    JSON.stringify({ ...original, endpointClass: 'MOCK_UNIT_TEST' }),
  );
  await assert.rejects(buildStaticViewer(root), /real runs/);
  await assert.rejects(readFile(join(root, 'dist/index.html')));
  if (process.platform === 'linux') {
    const other = await fixture();
    const target = join(other, 'docs/evidence/public-mined-2026-11-06.json');
    const { unlink } = await import('node:fs/promises');
    await unlink(target);
    await symlink(join(root, '.local/keys.json'), target);
    await assert.rejects(buildStaticViewer(other));
    await assert.rejects(readFile(join(other, 'dist/index.html')));
  }
});
