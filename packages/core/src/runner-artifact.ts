import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';

// Read one bounded JSON file in memory. Never extract archive paths to disk.
export function readRunnerArtifact(zip: Buffer, digest: string): unknown {
  if (
    zip.length > 2_097_152 ||
    !/^sha256:[a-f0-9]{64}$/.test(digest) ||
    `sha256:${createHash('sha256').update(zip).digest('hex')}` !== digest
  )
    throw new Error('Artifact integrity unavailable');
  const end = zip.length - 22;
  if (
    end < 0 ||
    zip.readUInt32LE(end) !== 0x06054b50 ||
    zip.readUInt16LE(end + 4) ||
    zip.readUInt16LE(end + 6) ||
    zip.readUInt16LE(end + 8) !== 1 ||
    zip.readUInt16LE(end + 10) !== 1 ||
    zip.readUInt16LE(end + 20)
  )
    throw new Error('Unsupported archive');
  const offset = zip.readUInt32LE(end + 16);
  if (offset + 46 > end || zip.readUInt32LE(offset) !== 0x02014b50)
    throw new Error('Invalid directory');
  const flags = zip.readUInt16LE(offset + 8),
    method = zip.readUInt16LE(offset + 10);
  const compressed = zip.readUInt32LE(offset + 20),
    size = zip.readUInt32LE(offset + 24);
  const nameSize = zip.readUInt16LE(offset + 28);
  if (
    offset +
      46 +
      nameSize +
      zip.readUInt16LE(offset + 30) +
      zip.readUInt16LE(offset + 32) !==
      end ||
    zip.readUInt32LE(end + 12) !== end - offset
  )
    throw new Error('Invalid directory bounds');
  if (
    flags & 1 ||
    ![0, 8].includes(method) ||
    size > 1_048_576 ||
    compressed > 2_097_152 ||
    zip.toString('utf8', offset + 46, offset + 46 + nameSize) !== 'result.json'
  )
    throw new Error('Unsupported artifact file');
  const local = zip.readUInt32LE(offset + 42);
  if (
    local + 30 > offset ||
    zip.readUInt32LE(local) !== 0x04034b50 ||
    zip.readUInt16LE(local + 8) !== method
  )
    throw new Error('Invalid file header');
  const start =
    local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  if (
    zip.readUInt16LE(local + 6) & 1 ||
    zip.toString(
      'utf8',
      local + 30,
      local + 30 + zip.readUInt16LE(local + 26),
    ) !== 'result.json'
  )
    throw new Error('Invalid local file identity');
  if (start + compressed > offset) throw new Error('Invalid file bounds');
  const data =
    method === 0
      ? zip.subarray(start, start + compressed)
      : inflateRawSync(zip.subarray(start, start + compressed), {
          maxOutputLength: 1_048_576,
        });
  if (data.length !== size || crc32(data) !== zip.readUInt32LE(offset + 16))
    throw new Error('Invalid file data');
  return JSON.parse(data.toString('utf8'));
}
