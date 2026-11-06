import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { startFixture } from '../packages/core/src/local/fixture.js';
import { localRpc, LocalRpcError } from '../packages/core/src/local/rpc.js';
import { fixtureTransaction } from '../packages/core/src/local/codec.js';
import { runUserTest, TestRpcError } from '../packages/core/src/user-test.js';
import type { TestReader } from '../packages/core/src/user-test.js';

test(
  'user-supplied signed bytes execute in an actual isolated EIP-8141 dry run without broadcasting',
  { timeout: 180000 },
  async () => {
    const fixture = await startFixture(process.cwd());
    try {
      const signed = await fixtureTransaction(
        fixture.keys[0]!,
        fixture.keys[0]!,
        [0n],
      );
      const methods: string[] = [];
      const read: TestReader = async (method, params, schema) => {
        methods.push(method);
        try {
          return await localRpc(fixture.executionUrl, method, params, schema);
        } catch (error) {
          if (error instanceof LocalRpcError)
            throw new TestRpcError(error.code);
          throw error;
        }
      };
      const result = await runUserTest(
        { kind: 'transaction', raw: signed.raw },
        read,
        9n,
      );
      await writeFile(
        `.local/${fixture.runId}/user-dry-run.json`,
        JSON.stringify(result, null, 2),
        { mode: 0o600, flag: 'wx' },
      );
      assert.equal(result.result, 'PASS', JSON.stringify(result));
      assert.equal(result.broadcast, false);
      assert.ok(
        !methods.some(
          (method) => method.includes('send') || method.includes('submit'),
        ),
      );
    } finally {
      await fixture.cleanup();
    }
  },
);
