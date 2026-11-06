import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { startFixture } from '../packages/core/src/local/fixture.js';
import {
  localRpc,
  waitForRpc,
  LocalRpcError,
} from '../packages/core/src/local/rpc.js';
import { fixtureTransaction } from '../packages/core/src/local/codec.js';
import {
  hash,
  quantity,
  receipt as receiptSchema,
} from '../packages/core/src/schema.js';

test(
  'private staged consensus mines and includes an ordinary frame transaction',
  { timeout: 720_000 },
  async () => {
    const fixture = await startFixture(process.cwd(), undefined, true);
    const observations: unknown[] = [];
    try {
      await waitForRpc(fixture.executionUrl);
      await waitForRpc(fixture.sidecarUrl);
      let ready = false;
      for (let attempt = 0; attempt < 110; attempt++) {
        const block = await localRpc(
          fixture.executionUrl,
          'eth_getBlockByNumber',
          ['latest', false],
          z.object({ number: quantity, timestamp: quantity, hash }),
        );
        observations.push({ at: new Date().toISOString(), block });
        // The genesis timestamp is the first block's clock; wait beyond both staged forks.
        const genesis = await localRpc(
          fixture.executionUrl,
          'eth_getBlockByNumber',
          ['0x0', false],
          z.object({ timestamp: quantity }),
        );
        if (
          BigInt(block.number) > 0n &&
          BigInt(block.timestamp) >= BigInt(genesis.timestamp) + 396n
        ) {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      assert.equal(ready, true, 'No blocks observed beyond the Hegota fork');
      const tx = await fixtureTransaction(fixture.keys[0]!, fixture.keys[0]!, [
        1n,
      ]);
      assert.equal(
        await localRpc(
          fixture.sidecarUrl,
          'eth_sendFrameTransaction',
          [tx.wire],
          hash,
        ),
        tx.hash,
      );
      let receipt: z.infer<typeof receiptSchema> | null = null;
      observations.push({
        at: new Date().toISOString(),
        admittedHash: tx.hash,
      });
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          receipt = await localRpc(
            fixture.sidecarUrl,
            'eth_getFrameTransactionReceipt',
            [tx.hash],
            receiptSchema.nullable(),
          );
        } catch (error) {
          if (
            !(error instanceof LocalRpcError) ||
            error.reason !== 'RECEIPT_UNAVAILABLE'
          )
            throw error;
        }
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      assert.ok(receipt, 'Admitted transaction was not mined');
      assert.equal(receipt.status, 'success');
      assert.equal(receipt.frameReceipts.length, 2);
      assert.ok(
        receipt.frameReceipts.every((frame) => frame.status === 'success'),
      );
      observations.push({ hash: tx.hash, receipt });
    } finally {
      await fixture.cleanup();
      await mkdir('.local/mining-results', { recursive: true, mode: 0o700 });
      await writeFile(
        `.local/mining-results/${fixture.runId}.json`,
        JSON.stringify(
          {
            runId: fixture.runId,
            environment: fixture.fingerprint,
            observations,
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }
  },
);
