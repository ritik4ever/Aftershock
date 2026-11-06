import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { createRunnerProxy } from '../packages/core/src/runner-proxy.js';
import { readRunnerArtifact } from '../packages/core/src/runner-artifact.js';
import { runReport } from '../packages/core/src/scenario.js';

const token = 'TEST_ONLY_GITHUB_TOKEN';
const requestId = randomUUID(),
  sourceCommit = 'a'.repeat(40);
const report = runReport.parse(
  JSON.parse(
    await readFile('docs/evidence/rpc-keyed-nonce-lifecycle.json', 'utf8'),
  ),
);
function archive(value: unknown, name = 'result.json') {
  const raw = Buffer.from(JSON.stringify(value)),
    data = deflateRawSync(raw),
    filename = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(filename.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(8, 10);
  directory.writeUInt32LE(crc32(raw), 16);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt32LE(raw.length, 24);
  directory.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  return Buffer.concat([local, filename, data, directory, filename, end]);
}
const digest = (data: Buffer) =>
  `sha256:${createHash('sha256').update(data).digest('hex')}`;
const run = {
  id: 123,
  path: '.github/workflows/scenario-run.yml',
  event: 'workflow_dispatch',
  head_branch: 'main',
  head_sha: sourceCommit,
  display_title: `Aftershock:keyed-nonce-lifecycle:${requestId}`,
  status: 'completed',
  conclusion: 'success',
  created_at: new Date().toISOString(),
  run_started_at: new Date().toISOString(),
};
function setup(
  options: {
    recent?: unknown[];
    current?: unknown;
    result?: unknown;
    badHost?: boolean;
    badDigest?: boolean;
    fail?: boolean;
  } = {},
) {
  const zip = archive(
    options.result ?? {
      requestId,
      scenarioId: 'keyed-nonce-lifecycle',
      sourceCommit,
      report,
    },
  );
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const proxy = createRunnerProxy({ token }, async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      ...(init?.body ? { body: String(init.body) } : {}),
    });
    if (options.fail) throw new Error(`${token} PRIVATE_ERROR`);
    if (url.startsWith('https://artifacts.blob.core.windows.net/')) {
      assert.equal(
        new Headers(init?.headers).get('authorization'),
        null,
        'Do not forward credentials to artifact storage',
      );
      return new Response(new Uint8Array(zip));
    }
    assert.ok(
      url.startsWith('https://api.github.com/repos/ritik4ever/Aftershock/'),
    );
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      `Bearer ${token}`,
    );
    if (url.endsWith('/dispatches'))
      return Response.json({ workflow_run_id: 123 });
    if (url.includes('/workflows/'))
      return Response.json({ workflow_runs: options.recent ?? [] });
    if (url.endsWith('/artifacts/9/zip'))
      return new Response(null, {
        status: 302,
        headers: {
          location: options.badHost
            ? 'https://evil.example/archive'
            : 'https://artifacts.blob.core.windows.net/archive',
        },
      });
    if (url.includes('/artifacts?'))
      return Response.json({
        artifacts: [
          {
            id: 9,
            name: 'aftershock-result',
            expired: false,
            digest: options.badDigest
              ? `sha256:${'0'.repeat(64)}`
              : digest(zip),
            size_in_bytes: zip.length,
          },
        ],
      });
    return Response.json(options.current ?? run);
  });
  return { proxy, calls };
}
const post = (extra = {}) =>
  new Request('https://aftershock.example/api/runner', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://aftershock.example',
    },
    body: JSON.stringify({
      scenarioId: 'keyed-nonce-lifecycle',
      requestId,

      ...extra,
    }),
  });

test('public remote dispatch needs no shared code and keeps GitHub credentials server-side', async () => {
  const { proxy, calls } = setup();
  assert.equal((await proxy(post({ accessCode: 'obsolete' }))).status, 400);
  assert.equal((await proxy(post({ command: 'shell' }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await proxy(post());
  assert.equal(response.status, 202);
  const text = await response.text();
  assert.doesNotMatch(text, /TOKEN|ACCESS_CODE/);
  assert.deepEqual(JSON.parse(calls.at(-1)!.body!), {
    ref: 'main',
    inputs: { scenario: 'keyed-nonce-lifecycle', request_id: requestId },
  });
});
test('remote jobs enforce busy/rate guards and reuse observed request identity', async () => {
  assert.equal(
    (
      await setup({
        recent: [
          {
            ...run,
            display_title: `Aftershock:keyed-nonce-lifecycle:${randomUUID()}`,
            status: 'in_progress',
          },
        ],
      }).proxy(post())
    ).status,
    409,
  );
  assert.equal(
    (
      await setup({
        recent: Array.from({ length: 4 }, () => ({
          ...run,
          display_title: `Aftershock:keyed-nonce-lifecycle:${randomUUID()}`,
        })),
      }).proxy(post())
    ).status,
    429,
  );
  const duplicate = setup({ recent: [run] });
  assert.equal((await duplicate.proxy(post())).status, 200);
  assert.ok(!duplicate.calls.some((call) => call.method === 'POST'));
});
test('remote report provenance, artifact digest and schema are verified before rendering or exporting', async () => {
  const { proxy } = setup();
  const response = await proxy(
    new Request('https://aftershock.example/api/runner?job=123&format=detail'),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).report, report);
  assert.match(
    await (
      await proxy(
        new Request('https://aftershock.example/api/runner?job=123&format=md'),
      )
    ).text(),
    /Result: PASS/,
  );
  for (const options of [
    { badHost: true },
    { badDigest: true },
    {
      result: {
        requestId,
        scenarioId: 'keyed-nonce-lifecycle',
        sourceCommit: 'b'.repeat(40),
        report,
      },
    },
    {
      result: {
        requestId,
        scenarioId: 'keyed-nonce-lifecycle',
        sourceCommit,
        report: { ...report, endpointClass: 'MOCK_UNIT_TEST' },
      },
    },
  ])
    assert.equal(
      (
        await setup(options).proxy(
          new Request('https://aftershock.example/api/runner?job=123'),
        )
      ).status,
      502,
    );
});
test('a verified failing report remains FAIL even when the workflow also failed', async () => {
  const failure = runReport.parse({
    ...report,
    result: 'FAIL',
    steps: report.steps.map((step, index) =>
      index === 0 ? { ...step, result: 'FAIL' } : step,
    ),
  });
  const { proxy } = setup({
    current: { ...run, conclusion: 'failure' },
    result: {
      requestId,
      scenarioId: 'keyed-nonce-lifecycle',
      sourceCommit,
      report: failure,
    },
  });
  const response = await proxy(
    new Request('https://aftershock.example/api/runner?job=123'),
  );
  assert.equal(response.status, 200);
  const job = await response.json();
  assert.equal(job.state, 'COMPLETED');
  assert.equal(job.result, 'FAIL');
});

test('remote errors, cancellation, missing configuration and cross-origin requests cannot become a pass', async () => {
  const { proxy } = setup({ fail: true });
  const failed = await proxy(post());
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /TEST_ONLY|PRIVATE_ERROR/);
  const cancelled = await setup({
    current: { ...run, conclusion: 'cancelled' },
  }).proxy(new Request('https://aftershock.example/api/runner?job=123'));
  assert.equal((await cancelled.json()).state, 'ERROR');
  assert.deepEqual(
    await (
      await createRunnerProxy()(
        new Request('https://aftershock.example/api/runner'),
      )
    ).json(),
    { available: false },
  );
  assert.equal(
    (
      await proxy(
        new Request('https://aftershock.example/api/runner', {
          headers: { origin: 'https://evil.example' },
        }),
      )
    ).status,
    403,
  );
  for (const suffix of [
    '?job=123&job=123',
    '?job=../secret',
    '?url=https://evil.example',
  ])
    assert.equal(
      (
        await setup().proxy(
          new Request(`https://aftershock.example/api/runner${suffix}`),
        )
      ).status,
      400,
    );
});
test(
  'stalled public request bodies are cancelled without dispatching a workflow',
  { timeout: 30_000 },
  async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    };
    const { proxy, calls } = setup();
    const result = await proxy(
      new Request('https://aftershock.example/api/runner', init),
    );
    assert.equal(result.status, 400);
    assert.equal(cancelled, true);
    assert.equal(calls.length, 0);
  },
);

test('artifact reader rejects changed bytes, archive paths and oversized expanded data', () => {
  const valid = archive({ valid: true });
  assert.deepEqual(readRunnerArtifact(valid, digest(valid)), { valid: true });
  assert.throws(() => readRunnerArtifact(valid, `sha256:${'0'.repeat(64)}`));
  for (const invalid of [
    archive({}, '../result.json'),
    archive('x'.repeat(1_048_577)),
    Buffer.alloc(22),
  ])
    assert.throws(() => readRunnerArtifact(invalid, digest(invalid)));
});
