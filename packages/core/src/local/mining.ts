import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateMnemonic, english, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { z } from 'zod';

export const GENESIS_IMAGE =
  'ethpandaops/ethereum-genesis-generator@sha256:51decce4284d8498dabfa38ae13ddce84cbf8c7be4f33a32b798ce10c9868e77';
export const LIGHTHOUSE_IMAGE =
  'ethpandaops/lighthouse@sha256:dd7e92e2e9c3127750e9bff5f8a0efec686f296445a44ef5d9c1eb750e8906b0';

// Fixed offline program. Its output may contain validator material and must stay private.
const generate = `set -eu
exec > /aftershock/generator.log 2>&1
umask 077
cp /aftershock/values.env /config/values.env
/work/entrypoint.sh el
jq '.alloc |= with_entries(if (.key | ascii_downcase | ltrimstr("0x")) == "0000bff46984e3725691fa540a8c7589300d8282" then .value.storage["0x0000000000000000000000000000000000000000000000000000000000000000"]="0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" else . end)' /data/metadata/genesis.json > /data/genesis-fixed.json
mv /data/genesis-fixed.json /data/metadata/genesis.json
/work/entrypoint.sh cl
source /aftershock/values.env
eth2-val-tools keystores --insecure --out-loc /data/validators --source-mnemonic "$EL_AND_CL_MNEMONIC" --source-min 0 --source-max 32
cp -a /data/metadata/. /aftershock/consensus/
cp -a /data/validators /aftershock/validators
find /aftershock/consensus /aftershock/validators -type d -exec chmod 700 {} +
find /aftershock/consensus /aftershock/validators -type f -exec chmod 600 {} +
chown -R "$AFTERSHOCK_UID:$AFTERSHOCK_GID" /aftershock/consensus /aftershock/validators /aftershock/generator.log
`;

export async function generateMiningGenesis(
  directory: string,
  keys: Hex[],
  runId: string,
  docker: (...args: string[]) => Promise<string>,
  register: (name: string) => void,
) {
  const mnemonic = generateMnemonic(english);
  const allocations = Object.fromEntries(
    keys.map((key, index) => [
      privateKeyToAccount(key).address,
      {
        balance: index === 3 ? '1000000000000000' : '1000000000000000000',
      },
    ]),
  );
  const timestamp = Math.floor(Date.now() / 1000) + 60;
  const values: Record<string, string> = {
    CHAIN_ID: '9',
    GENESIS_TIMESTAMP: String(timestamp),
    GENESIS_DELAY: '0',
    SLOT_DURATION_MS: '6000',
    NUMBER_OF_VALIDATORS: '32',
    EL_AND_CL_MNEMONIC: mnemonic,
    EL_PREMINE_COUNT: '0',
    EL_PREMINE_ADDRS: JSON.stringify(allocations),
    FULU_FORK_EPOCH: '0',
    GLOAS_FORK_EPOCH: '1',
    HEZE_FORK_EPOCH: '2',
    BEACON_STATIC_ENR: '',
  };
  await mkdir(`${directory}/consensus`, { mode: 0o700 });
  await writeFile(
    `${directory}/values.env`,
    Object.entries(values)
      .map(([key, value]) => `export ${key}='${value}'`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  await writeFile(`${directory}/jwt`, randomBytes(32).toString('hex'), {
    mode: 0o600,
  });
  // Redirect all generator output inside the private mount, including shell tracing.
  await docker(
    'create',
    '--network',
    'none',
    '--label',
    `aftershock.run=${runId}`,
    '--name',
    `aftershock-${runId}-generator`,
    '--memory',
    '2g',
    '--cpus',
    '2',
    '--pids-limit',
    '256',
    '-v',
    `${directory}:/aftershock`,
    '--entrypoint',
    '/bin/bash',
    '--env',
    `AFTERSHOCK_UID=${process.getuid!()}`,
    '--env',
    `AFTERSHOCK_GID=${process.getgid!()}`,
    GENESIS_IMAGE,
    '-c',
    generate,
  );
  const generator = `aftershock-${runId}-generator`;
  register(generator);
  await docker('start', '-a', generator);
  const genesis = validateMiningGenesis(
    JSON.parse(await readFile(`${directory}/consensus/genesis.json`, 'utf8')),
    timestamp,
    allocations,
  );
  return { genesis, timestamp };
}

export function validateMiningGenesis(
  input: unknown,
  timestamp: number,
  allocations: Record<string, { balance: string }>,
) {
  const genesis = z
    .object({
      config: z
        .object({
          chainId: z.number(),
          amsterdamTime: z.number(),
          bogotaTime: z.number(),
        })
        .passthrough(),
      alloc: z.record(
        z.string(),
        z
          .object({
            code: z.string().optional(),
            balance: z.string().regex(/^(?:0x[0-9a-f]+|[0-9]+)$/i),
            storage: z.record(z.string(), z.string()).optional(),
          })
          .passthrough(),
      ),
    })
    .passthrough()
    .parse(input);
  if (
    genesis.config.chainId !== 9 ||
    genesis.config.amsterdamTime !== timestamp + 192 ||
    genesis.config.bogotaTime !== timestamp + 384
  )
    throw new Error('Unexpected mining fork schedule');
  const funded = Object.entries(genesis.alloc)
    .filter(
      ([address, account]) =>
        (!account.code || account.code === '0x') &&
        BigInt(account.balance) > 0n &&
        !(
          BigInt(address.startsWith('0x') ? address : `0x${address}`) <= 255n &&
          BigInt(account.balance) === 1n
        ),
    )
    .map(([address]) => address.replace(/^0x/, '').toLowerCase())
    .sort();
  const expected = Object.keys(allocations)
    .map((address) => address.replace(/^0x/, '').toLowerCase())
    .sort();
  if (funded.join(',') !== expected.join(','))
    throw new Error('Unexpected funded genesis accounts');
  for (const [address, account] of Object.entries(genesis.alloc)) {
    const allocation = Object.entries(allocations).find(
      ([expected]) =>
        expected.replace(/^0x/, '').toLowerCase() ===
        address.replace(/^0x/, '').toLowerCase(),
    );
    if (allocation && BigInt(allocation[1].balance) !== BigInt(account.balance))
      throw new Error('Unexpected fixture balance');
  }
  const deposit = Object.entries(genesis.alloc).find(
    ([address]) =>
      address.replace(/^0x/, '').toLowerCase() ===
      '0000bff46984e3725691fa540a8c7589300d8282',
  )?.[1];
  if (
    !deposit?.code ||
    deposit.code === '0x' ||
    deposit.storage?.[`0x${'0'.repeat(64)}`] !== `0x${'f'.repeat(64)}`
  )
    throw new Error('Missing armed builder deposit predeploy');
  return genesis;
}
