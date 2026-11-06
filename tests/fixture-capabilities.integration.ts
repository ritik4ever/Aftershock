import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { getProfile } from '@forshtat/hegota-support/profiles';
import { encodeAbiParameters, keccak256, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { startFixture, docker } from '../packages/core/src/local/fixture.js';
import { localRpc, waitForRpc } from '../packages/core/src/local/rpc.js';
import { fixtureTransaction } from '../packages/core/src/local/codec.js';
import {
  frameReceipt,
  lifecycleOutcome,
  transfer,
  waitForMining,
} from '../packages/core/src/local/lifecycle.js';
import {
  evidenceSnapshot,
  withRpcEvidence,
  rpcEvidence,
} from '../packages/core/src/evidence.js';
import { hash, quantity } from '../packages/core/src/schema.js';
import { UPSTREAM } from '../packages/core/src/inspect.js';

test(
  'existing native fixtures suffice for keyed state and EOA balance transitions',
  { timeout: 900_000 },
  async () => {
    await withRpcEvidence(async () => {
      const startedAt = new Date().toISOString();
      const fixture = await startFixture(
        process.cwd(),
        undefined,
        true,
        'manual',
      );
      let observations: Record<string, unknown> | undefined;
      try {
        await waitForRpc(fixture.executionUrl);
        await waitForRpc(fixture.sidecarUrl);
        await waitForMining(fixture.executionUrl);
        const sender = privateKeyToAccount(fixture.keys[0]!).address;
        const payer = privateKeyToAccount(fixture.keys[3]!).address;
        const recipient = privateKeyToAccount(fixture.keys[2]!).address;
        const manager = getProfile('ethrex-eip8141-tracer').predeploys!
          .NONCE_MANAGER as Address;
        const codeSchema = z
          .string()
          .max(131074)
          .regex(/^0x(?:[0-9a-f]{2})*$/i);
        const code = await localRpc(
          fixture.executionUrl,
          'eth_getCode',
          [manager, 'latest'],
          codeSchema,
        );
        assert.notEqual(code, '0x');
        // Pinned ethrex crates/vm/system_contracts.rs:142; installed at Hegota.
        // This protocol storage namespace rejects direct user calls.
        const expected = '0x60006000fd' as const;
        assert.equal(code.toLowerCase(), expected);
        for (const address of [sender, payer])
          assert.equal(
            await localRpc(
              fixture.executionUrl,
              'eth_getCode',
              [address, 'latest'],
              codeSchema,
            ),
            '0x',
          );
        // EIP-8250 slot derivation inspected in the pinned workshop predeploys.ts:
        // keccak256(pad32(sender) || uint256(key)); ABI encoding has those exact words.
        const slot = (key: bigint) =>
          keccak256(
            encodeAbiParameters(
              [{ type: 'address' }, { type: 'uint256' }],
              [sender, key],
            ),
          );
        const sequence = (key: bigint) =>
          localRpc(
            fixture.executionUrl,
            'eth_getStorageAt',
            [manager, slot(key), 'latest'],
            hash,
          );
        const nonce = () =>
          localRpc(
            fixture.executionUrl,
            'eth_getTransactionCount',
            [sender, 'latest'],
            quantity,
          );
        const before = {
          key1: await sequence(1n),
          key2: await sequence(2n),
          accountNonce: await nonce(),
        };
        assert.equal(BigInt(before.key1), 0n);
        assert.equal(BigInt(before.key2), 0n);
        const tx = await fixtureTransaction(
          fixture.keys[0]!,
          fixture.keys[0]!,
          [1n],
        );
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
        await lifecycleOutcome(fixture.sidecarUrl, tx.hash, 'included');
        const after = {
          key1: await sequence(1n),
          key2: await sequence(2n),
          accountNonce: await nonce(),
        };
        assert.equal(BigInt(after.key1), BigInt(before.key1) + 1n);
        assert.equal(after.key2, before.key2);
        assert.equal(after.accountNonce, before.accountNonce);
        const balance = () =>
          localRpc(
            fixture.executionUrl,
            'eth_getBalance',
            [payer, 'latest'],
            quantity,
          );
        const balanceBefore = await balance();
        const moved = await transfer(
          fixture.executionUrl,
          fixture.keys[3]!,
          recipient,
          1n,
        );
        const balanceAfter = await balance();
        assert.ok(BigInt(balanceAfter) < BigInt(balanceBefore));
        observations = {
          nonceManager: manager,
          runtimeCodeKeccak256: keccak256(code as `0x${string}`),
          runtimeMatchesPinnedSource: true,
          sender,
          payer,
          before,
          after,
          frameTransactionHash: tx.hash,
          frameReceipt: receipt,
          balanceBefore,
          balanceAfter,
          ordinaryTransferReceipt: moved,
          newSolidityRequired: false,
        };
      } finally {
        await fixture.cleanup();
      }
      assert.equal(
        await docker(
          'ps',
          '-a',
          '--filter',
          `label=aftershock.run=${fixture.runId}`,
          '--format',
          '{{.Names}}',
        ),
        '',
      );
      assert.equal(
        await docker(
          'network',
          'ls',
          '--filter',
          `label=aftershock.run=${fixture.runId}`,
          '--format',
          '{{.Name}}',
        ),
        '',
      );
      assert.ok(observations);
      const journal = rpcEvidence.parse(evidenceSnapshot());
      assert.equal(journal.complete, true);
      const capture = {
        schemaVersion: 1,
        scope: 'ISOLATED_NATIVE_FIXTURE_CAPABILITIES',
        endpointClass: 'ISOLATED_LOCAL',
        runId: fixture.runId,
        sourcePins: UPSTREAM,
        startedAt,
        completedAt: new Date().toISOString(),
        environment: fixture.fingerprint,
        result: 'PASS',
        observations,
        evidence: journal,
        limitations: [
          'Native EOA and protocol predeploy checks only; workshop Solidity contracts were not deployed or rebuilt.',
          'Filtered observations, not a full raw trace or independent attestation.',
        ],
      };
      await mkdir('.local/fixture-capabilities-results', {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(
        `.local/fixture-capabilities-results/${fixture.runId}.json`,
        `${JSON.stringify(capture, null, 2)}\n`,
        { flag: 'wx', mode: 0o600 },
      );
    });
  },
);
