import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { UPSTREAM } from '../inspect.js';

const execute = promisify(execFile);
export const ETHREX_IMAGE =
  'ghcr.io/forshtat/eip8141-devnet@sha256:c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6';
export const SIDECAR_IMAGE = 'aftershock-sidecar:2e22ff0';
export class FixtureSetupError extends Error {
  constructor(readonly stage: string) {
    super(`Isolated fixture failed at ${stage}`);
  }
}
export type LocalEndpoint = { executor: string; url: string };

export async function docker(...args: string[]): Promise<string> {
  const { stdout } = await execute('docker', args, {
    timeout: 120_000,
    maxBuffer: 1_048_576,
  });
  return stdout.trim();
}

type Genesis = {
  config: { chainId: number };
  alloc: Record<string, { code?: string; balance: string; nonce?: string }>;
};

export async function startFixture(root: string, runId: string = randomUUID()) {
  z.uuid().parse(runId);
  const prefix = `aftershock-${runId}`;
  const directory = resolve(root, '.local', runId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (
    relative(await realpath(root), await realpath(directory)) !==
    `.local/${runId}`
  )
    throw new Error('Fixture directory must stay inside workspace');
  const network = `${prefix}-net`;
  const execution = `${prefix}-ethrex`;
  const sidecar = `${prefix}-sidecar`;
  const reader = `${prefix}-template`;
  const owned: string[] = [];
  let networkCreated = false;
  let stage = 'image-provenance';
  const cleanup = async () => {
    const failures: string[] = [];
    for (const name of [...owned].reverse()) {
      const logs = await execute('docker', ['logs', '--tail', '40', name], {
        timeout: 5000,
        maxBuffer: 100_000,
      }).then(
        (result) => `${result.stdout}\n${result.stderr}`,
        () => 'No container logs available',
      );
      try {
        await writeFile(`${directory}/${name}.log`, logs, { mode: 0o600 });
      } catch {
        failures.push('diagnostic-write');
      }
      try {
        await docker('rm', '-f', name);
      } catch {
        failures.push(name);
      }
    }
    if (networkCreated) {
      try {
        await docker('network', 'rm', network);
      } catch {
        failures.push(network);
      }
    }
    if (failures.length)
      throw new Error(
        'Fixture cleanup incomplete; inspect owned aftershock resources',
      );
  };
  try {
    const labels = async (image: string) =>
      JSON.parse(
        await docker(
          'image',
          'inspect',
          image,
          '--format',
          '{{json .Config.Labels}}',
        ),
      ) as Record<string, string>;
    if (
      (await labels(ETHREX_IMAGE))['org.opencontainers.image.revision'] !==
        UPSTREAM.ethrex ||
      (await labels(SIDECAR_IMAGE))['org.opencontainers.image.revision'] !==
        UPSTREAM.sidecar
    ) {
      throw new Error('Pinned image source revision mismatch');
    }
    stage = 'genesis-template';
    await docker(
      'create',
      '--network',
      'none',
      '--label',
      `aftershock.run=${runId}`,
      '--name',
      reader,
      ETHREX_IMAGE,
    );
    owned.push(reader);
    await docker(
      'cp',
      `${reader}:/fixtures/genesis/l1-hegota.json`,
      `${directory}/template.json`,
    );
    const template = await readFile(`${directory}/template.json`, 'utf8');
    if (
      createHash('sha256')
        .update(template.replaceAll('\r\n', '\n'))
        .digest('hex') !==
      '5fe93acb7674db5d809aae4d66bff742121ed718bcddd327efcb8c1a9e631fb4'
    )
      throw new Error('Genesis template differs from pinned source');
    const genesis = JSON.parse(template) as Genesis;
    if (genesis.config.chainId !== 9)
      throw new Error('Unexpected fixture chain');
    const keys = Array.from({ length: 5 }, () => generatePrivateKey());
    // Preserve protocol predeploys, remove every shared funded EOA from the upstream template.
    genesis.alloc = Object.fromEntries(
      Object.entries(genesis.alloc).filter(
        ([, account]) => account.code && account.code !== '0x',
      ),
    );
    keys.forEach((key, index) => {
      genesis.alloc[privateKeyToAccount(key).address.slice(2).toLowerCase()] = {
        balance: index === 3 ? '1000000000000000' : '1000000000000000000',
      };
    });
    await writeFile(`${directory}/genesis.json`, JSON.stringify(genesis), {
      mode: 0o600,
    });
    await writeFile(`${directory}/keys.json`, JSON.stringify(keys), {
      mode: 0o600,
    });
    const entryPoint = '0x00000000000000000000000000000000000000aa';
    const mempoolId = 'QmcFZKUX9qoo3StwVycJTAhwdiqbEjcwNvQVK246p3z1rk';
    await writeFile(
      `${directory}/sidecar.json`,
      JSON.stringify({
        entryPoints: [entryPoint],
        canonicalEntryPoint: entryPoint,
        standardMempoolId: mempoolId,
        supportedMempools: [{ mempoolId, entryPoint }],
        relayers: [keys[4]],
        useropsTTL: 300,
        rpcEndpoint: `http://${execution}:8545`,
        rpcEndpointSubmit: `http://${execution}:8545`,
      }),
      { mode: 0o600 },
    );
    stage = 'private-network';
    await docker(
      'network',
      'create',
      '--internal',
      '--label',
      `aftershock.run=${runId}`,
      network,
    );
    networkCreated = true;
    const common = [
      '--network',
      network,
      '--label',
      `aftershock.run=${runId}`,
      '--memory',
      '1g',
      '--cpus',
      '2',
      '--pids-limit',
      '256',
    ];
    stage = 'execution-start';
    await docker(
      'run',
      '-d',
      '--name',
      execution,
      ...common,
      '-v',
      `${directory}/genesis.json:/aftershock/genesis.json:ro`,
      ETHREX_IMAGE,
      '--network',
      '/aftershock/genesis.json',
      '--p2p.disabled',
      '--p2p.addr',
      '127.0.0.1',
      '--http.addr',
      '0.0.0.0',
      '--http.api',
      'eth,net,web3,ethrex',
    );
    owned.push(execution);
    const executionUrl: LocalEndpoint = {
      executor: sidecar,
      url: `http://${execution}:8545`,
    };
    stage = 'sidecar-start';
    await docker(
      'run',
      '-d',
      '--name',
      sidecar,
      ...common,
      '-v',
      `${directory}/sidecar.json:/aftershock/config.json:ro`,
      SIDECAR_IMAGE,
      'node',
      '--configFile',
      '/aftershock/config.json',
      '--dataDir',
      '/tmp/aftershock',
      '--api.address',
      '0.0.0.0',
      '--api.port',
      '14337',
      '--api.wsPort',
      '14337',
      '--p2p.host',
      '0.0.0.0',
      '--p2p.enrHost',
      '127.0.0.1',
      '--p2p.port',
      '4337',
      '--p2p.enrPort',
      '4337',
      '--executor.bundlingMode',
      'manual',
      '--explorer.enable',
    );
    owned.push(sidecar);
    stage = 'isolation-verification';
    const sidecarUrl: LocalEndpoint = {
      executor: sidecar,
      url: 'http://127.0.0.1:14337/rpc/',
    };
    const networkInfo = z
      .array(
        z.object({
          Internal: z.literal(true),
          Containers: z.record(z.string(), z.unknown()),
        }),
      )
      .parse(JSON.parse(await docker('network', 'inspect', network)))[0]!;
    if (Object.keys(networkInfo.Containers).length !== 2)
      throw new Error('Unexpected peer in isolated network');
    const processes = z
      .array(
        z.object({
          Config: z.object({ Labels: z.record(z.string(), z.string()) }),
          HostConfig: z.object({
            Privileged: z.literal(false),
            PublishAllPorts: z.literal(false),
            PortBindings: z.record(z.string(), z.unknown()).nullable(),
          }),
          NetworkSettings: z.object({
            Networks: z.record(z.string(), z.unknown()),
          }),
          State: z.object({ Running: z.literal(true) }),
        }),
      )
      .parse(JSON.parse(await docker('inspect', execution, sidecar)));
    for (const process of processes) {
      if (
        process.Config.Labels['aftershock.run'] !== runId ||
        Object.keys(process.HostConfig.PortBindings ?? {}).length !== 0 ||
        Object.keys(process.NetworkSettings.Networks).join(',') !== network
      ) {
        throw new Error('Container ownership or network isolation mismatch');
      }
    }
    const fingerprint = {
      network,
      executionImage: await docker(
        'inspect',
        execution,
        '--format',
        '{{.Image}}',
      ),
      sidecarImage: await docker('inspect', sidecar, '--format', '{{.Image}}'),
      chainId: '0x9',
      networkInternal: 'true',
      publishedPorts: 'none',
      genesisSha256: createHash('sha256')
        .update(JSON.stringify(genesis))
        .digest('hex'),
    };
    return { runId, keys, executionUrl, sidecarUrl, fingerprint, cleanup };
  } catch (error) {
    await writeFile(`${directory}/setup-error.log`, String(error), {
      mode: 0o600,
    });
    await cleanup();
    throw new FixtureSetupError(stage);
  }
}
