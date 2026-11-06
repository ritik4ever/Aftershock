import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  writeFile,
  chmod,
  symlink,
  rm,
  lstat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkpointInventory,
  replaceStoppedMountContents,
} from '../packages/core/src/local/checkpoint.js';
import { startFixture } from '../packages/core/src/local/fixture.js';

test(
  'checkpoint inventory hashes stopped private state and rejects unsafe entries',
  { skip: process.platform !== 'linux' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aftershock-checkpoint-'));
    try {
      await mkdir(join(directory, 'db'), { mode: 0o700 });
      await writeFile(join(directory, 'db', 'state'), 'checkpoint-unit-data', {
        mode: 0o600,
      });
      assert.deepEqual(await checkpointInventory(directory), [
        {
          path: 'db/state',
          bytes: 20,
          sha256: createHash('sha256')
            .update('checkpoint-unit-data')
            .digest('hex'),
        },
      ]);
      await symlink(join(directory, 'db'), join(directory, 'link'));
      await assert.rejects(
        checkpointInventory(directory),
        /Unsupported checkpoint entry/,
      );
      await rm(join(directory, 'link'));
      execFileSync('mkfifo', [join(directory, 'fifo')]);
      await assert.rejects(
        checkpointInventory(directory),
        /Unsupported checkpoint entry/,
      );
      await rm(join(directory, 'fifo'));
      // A sparse file tests the size guard without allocating or reading 2 GiB.
      execFileSync('truncate', [
        '-s',
        '2147483649',
        join(directory, 'oversized'),
      ]);
      await assert.rejects(checkpointInventory(directory), /size bound/);
      await rm(join(directory, 'oversized'));
      await chmod(directory, 0o755);
      await assert.rejects(
        checkpointInventory(directory),
        /Unsafe checkpoint directory/,
      );
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test(
  'restoring stopped contents preserves the bind-mounted directory inode',
  { skip: process.platform !== 'linux' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aftershock-mount-'));
    const source = join(directory, 'source');
    const destination = join(directory, 'destination');
    try {
      for (const path of [source, destination])
        await mkdir(path, { mode: 0o700 });
      await mkdir(join(source, 'db'), { mode: 0o700 });
      await writeFile(join(source, 'db', 'state'), 'saved-state', {
        mode: 0o600,
      });
      await writeFile(join(destination, 'obsolete'), 'later-state', {
        mode: 0o600,
      });
      const originalInode = (await lstat(destination)).ino;
      const expected = await checkpointInventory(source);
      await replaceStoppedMountContents(source, destination);
      assert.equal((await lstat(destination)).ino, originalInode);
      assert.deepEqual(await checkpointInventory(destination), expected);
      assert.deepEqual(await checkpointInventory(source), expected);
      await assert.rejects(
        replaceStoppedMountContents(source, source),
        /must not overlap/,
      );
      await assert.rejects(
        replaceStoppedMountContents(source, join(source, 'db')),
        /must not overlap/,
      );
      assert.deepEqual(await checkpointInventory(source), expected);
    } finally {
      await rm(directory, { recursive: true });
    }
  },
);

test('managed checkpoint mode rejects admission-only fixtures before starting Docker', async () => {
  await assert.rejects(
    startFixture(
      process.cwd(),
      undefined,
      false,
      'manual',
      300,
      undefined,
      true,
    ),
    /fresh Linux mining fixture/,
  );
});
