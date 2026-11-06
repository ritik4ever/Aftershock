import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { z } from 'zod';
import { privateKeyToAccount } from 'viem/accounts';
import { startFixture, docker } from '../packages/core/src/local/fixture.js';
import { createMinedCheckpoint } from '../packages/core/src/local/checkpoint.js';
import { localRpc, waitForRpc } from '../packages/core/src/local/rpc.js';
import {
  waitForMining,
  transfer,
  frameReceipt,
} from '../packages/core/src/local/lifecycle.js';
import { fixtureTransaction } from '../packages/core/src/local/codec.js';
import { quantity, hash } from '../packages/core/src/schema.js';

test(
  'stopped four-service checkpoint restores mined state and resumes real frame execution',
  { timeout: 840_000 },
  async () => {
    const fixture = await startFixture(
      process.cwd(),
      undefined,
      true,
      'manual',
      300,
      undefined,
      true,
    );
    const observations: unknown[] = [];
    let passed = false;
    try {
      await waitForRpc(fixture.executionUrl);
      await waitForRpc(fixture.sidecarUrl);
      const ready = await waitForMining(fixture.executionUrl);
      observations.push({ at: new Date().toISOString(), ready });
      console.log('Private chain ready beyond Hegota; capturing stopped state');
      const checkpoint = await createMinedCheckpoint(process.cwd(), fixture);
      observations.push({ checkpoint: checkpoint.metadata });
      const sender = privateKeyToAccount(fixture.keys[0]!).address;
      const recipient = privateKeyToAccount(fixture.keys[1]!).address;
      const state = async (tag: string) => ({
        nonce: await localRpc(
          fixture.executionUrl,
          'eth_getTransactionCount',
          [sender, tag],
          quantity,
        ),
        senderBalance: await localRpc(
          fixture.executionUrl,
          'eth_getBalance',
          [sender, tag],
          quantity,
        ),
        recipientBalance: await localRpc(
          fixture.executionUrl,
          'eth_getBalance',
          [recipient, tag],
          quantity,
        ),
      });
      const before = await state(checkpoint.metadata.head.number);
      const control = await transfer(
        fixture.executionUrl,
        fixture.keys[0]!,
        recipient,
        123456789n,
      );
      const changed = await state('latest');
      assert.equal(BigInt(changed.nonce), BigInt(before.nonce) + 1n);
      assert.equal(
        BigInt(changed.recipientBalance),
        BigInt(before.recipientBalance) + 123456789n,
      );
      assert.ok(BigInt(changed.senderBalance) < BigInt(before.senderBalance));
      observations.push({ before, control, changed });
      // Corruption must reject before shutting down the working processes.
      const extra = `.local/${fixture.runId}/checkpoint-${checkpoint.metadata.checkpointId}/runtime/tamper-test`;
      await writeFile(extra, 'unit corruption sentinel', {
        mode: 0o600,
        flag: 'wx',
      });
      await assert.rejects(checkpoint.restore(), /Checkpoint data changed/);
      await rm(extra);
      assert.equal(
        await docker(
          'inspect',
          `${fixture.sidecarUrl.executor}`,
          '--format',
          '{{.State.Running}}',
        ),
        'true',
      );
      const restored = await checkpoint.restore();
      assert.deepEqual(await state('latest'), before);
      assert.equal(
        await localRpc(
          fixture.executionUrl,
          'eth_getTransactionReceipt',
          [control.transactionHash],
          z.unknown(),
        ),
        null,
      );
      assert.equal(restored.restoredHead.hash, checkpoint.metadata.head.hash);
      observations.push({
        restored,
        restoredState: await state('latest'),
        controlReceiptAbsent: true,
        tamperedSnapshotRejected: true,
      });
      await checkpoint.resumeMining();
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
      assert.equal(
        await localRpc(
          fixture.executionUrl,
          'eth_sendRawTransaction',
          [tx.raw],
          hash,
        ),
        tx.hash,
      );
      const receipt = await frameReceipt(fixture.sidecarUrl, tx.hash);
      assert.equal(receipt.status, 'success');
      assert.equal(receipt.frameReceipts.length, 2);
      assert.ok(
        receipt.frameReceipts.every((frame) => frame.status === 'success'),
      );
      observations.push({ hash: tx.hash, receipt });
      passed = true;
    } finally {
      await fixture.cleanup();
      await mkdir('.local/checkpoint-results', {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(
        `.local/checkpoint-results/${fixture.runId}.json`,
        JSON.stringify(
          {
            runId: fixture.runId,
            kind: 'LOCAL_CHECKPOINT_CAPABILITY',
            passed,
            environment: fixture.fingerprint,
            observations,
          },
          null,
          2,
        ),
        { mode: 0o600, flag: 'wx' },
      );
    }
  },
);
