import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

export const resetSource = z
  .object({
    runId: z.uuid(),
    genesisSha256: z.string().regex(/^[a-f0-9]{64}$/),
    executionImage: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sidecarImage: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    initialBlockHash: z.string().regex(/^0x[a-f0-9]{64}$/i),
  })
  .strict();
export type ResetSource = z.infer<typeof resetSource>;

export const minedResetSource = resetSource.extend({
  checkpointId: z.uuid(),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  initialBlockNumber: z.string().regex(/^0x[1-9a-f][a-f0-9]*$/),
  consensusImage: z.string().min(1),
  genesisGeneratorImage: z.string().min(1),
});
export type MinedResetSource = z.infer<typeof minedResetSource>;

export async function readResetKeys(root: string, input: ResetSource) {
  try {
    const source = resetSource.parse(input);
    if (process.platform !== 'linux' || !process.getuid)
      throw new Error('Linux private fixture required');
    const base = await realpath(root);
    const directory = resolve(base, '.local', source.runId);
    for (const path of [resolve(base, '.local'), directory]) {
      if ((await realpath(path)) !== path) throw new Error('Unsafe directory');
      const info = await stat(path);
      if (
        !info.isDirectory() ||
        info.uid !== process.getuid() ||
        info.mode & 0o077
      )
        throw new Error('Unsafe directory permissions');
    }
    const path = resolve(directory, 'keys.json');
    if ((await realpath(path)) !== path) throw new Error('Unsafe key file');
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (
        !info.isFile() ||
        info.uid !== process.getuid() ||
        info.mode & 0o077 ||
        info.size > 4096
      )
        throw new Error('Unsafe key file');
      const buffer = Buffer.alloc(4097);
      let size = 0;
      while (size < buffer.length) {
        const next = await file.read(buffer, size, buffer.length - size, null);
        if (!next.bytesRead) break;
        size += next.bytesRead;
      }
      if (size > 4096) throw new Error('Oversized key file');
      const keys = z
        .array(z.templateLiteral(['0x', z.string().regex(/^[a-f0-9]{64}$/i)]))
        .length(5)
        .parse(JSON.parse(buffer.toString('utf8', 0, size)));
      const accounts = keys.map((key) => privateKeyToAccount(key));
      if (new Set(accounts.map((account) => account.address)).size !== 5)
        throw new Error('Repeated fixture accounts');
      return keys;
    } finally {
      await file.close();
    }
  } catch {
    // Never propagate a parser error that might reflect private file contents.
    throw new Error('Private reset keys are missing, invalid or unsafe');
  }
}
