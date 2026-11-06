import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { UPSTREAM } from '../packages/core/src/inspect.js';

test(
  'fixture setup still cleans owned resources when its diagnostic file cannot be written',
  { timeout: 15000 },
  async (context) => {
    if (process.platform !== 'linux')
      return context.skip('Linux fixture boundary test');
    const root = await mkdtemp(join(tmpdir(), 'aftershock-cleanup-unit-'));
    const bin = join(root, 'bin');
    await mkdir(bin, { mode: 0o700 });
    const runId = randomUUID();
    // A fake executable exercises process/error cleanup only. It never contacts
    // Docker, creates a chain or emits a scenario report/admission observation.
    await writeFile(
      join(bin, 'docker'),
      `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const root = process.env.AFTERSHOCK_TEST_ROOT;
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n');
if (args[0] === 'image') {
  const revision = args[2].startsWith('aftershock-sidecar:') ? ${JSON.stringify(UPSTREAM.sidecar)} : ${JSON.stringify(UPSTREAM.ethrex)};
  console.log(JSON.stringify({'org.opencontainers.image.revision': revision}));
} else if (args[0] === 'cp') {
  fs.mkdirSync(path.join(root, '.local', process.env.AFTERSHOCK_TEST_RUN, 'setup-error.log'));
  process.exitCode = 1;
} else if (!['create', 'logs', 'rm'].includes(args[0])) {
  process.exitCode = 1;
}
`,
      { mode: 0o700 },
    );
    const fixtureURL = new URL(
      '../packages/core/src/local/fixture.ts',
      import.meta.url,
    ).href;
    const program = `const {startFixture} = await import(${JSON.stringify(fixtureURL)});
try { await startFixture(process.env.AFTERSHOCK_TEST_ROOT, process.env.AFTERSHOCK_TEST_RUN); process.exitCode = 1; }
catch (error) { console.log(JSON.stringify({stage: error.stage ?? null})); }`;
    const result = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        '--input-type=module',
        '-e',
        program,
      ],
      {
        encoding: 'utf8',
        timeout: 12000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          AFTERSHOCK_TEST_ROOT: root,
          AFTERSHOCK_TEST_RUN: runId,
        },
      },
    );
    const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    assert.ok(
      calls.some(
        (args) =>
          args[0] === 'rm' &&
          args[1] === '-f' &&
          args[2] === `aftershock-${runId}-template`,
      ),
    );
    assert.equal(JSON.parse(result.stdout).stage, 'genesis-template');
  },
);
