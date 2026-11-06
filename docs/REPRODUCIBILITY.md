# Setup and replay

Use Linux/WSL with Docker's Linux daemon. Keep the checkout in the Linux filesystem; use Node from `.nvmrc` (tested 24.22.2) and npm (tested 11.19.1).

```sh
nvm use
npm ci --ignore-scripts
npm run --silent aftershock -- doctor --local
```

`doctor --local` only checks prerequisites; it does not start containers or prove a scenario passed. It exits 3 if prerequisites are blocked. Dependencies were clean-installed and tested separately; provisioning a completely empty OS/WSL/Docker host is unverified.

## Sources and images

Use separate upstream checkouts at [the recorded pins](UPSTREAM.md):

```sh
git clone https://github.com/forshtat/mempool-workshop.git ../aftershock-upstream/workshop
git -C ../aftershock-upstream/workshop checkout bcfe02a196ca97b6fb0d1044db9d0b4c673831fc
git clone https://github.com/forshtat/mempool-workshop-sidecar.git ../aftershock-upstream/sidecar
git -C ../aftershock-upstream/sidecar checkout 2e22ff0a2898e69ea4bf5275bce1be8581a8582a
bash scripts/build-local-sidecar.sh ../aftershock-upstream/sidecar
```

The helper builds `aftershock-sidecar:2e22ff0` from tracked pinned source and pulls ethrex digest `c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6`. It needs network access during preparation; fixture startup itself never pulls images. No host Bun/Foundry is required for existing fixtures.

## Private mining fixture

Prepare the additional pinned images:

```sh
docker pull ethpandaops/ethereum-genesis-generator@sha256:51decce4284d8498dabfa38ae13ddce84cbf8c7be4f33a32b798ce10c9868e77
docker pull ethpandaops/lighthouse@sha256:dd7e92e2e9c3127750e9bff5f8a0efec686f296445a44ef5d9c1eb750e8906b0
npm run test:mining
npm run test:lifecycle
npm run test:sponsor
```

Generation runs offline with fresh accounts, validator mnemonic and JWT. Runtime uses an internal four-process network, no published ports, chain 9 and staged Fulu/Gloas/Heze forks. Readiness takes several minutes; containers running is not sufficient. Original mined suites use manual sidecar reconciliation and ordinary canonical submissions; the sponsor/smoke cases use automatic sidecar inclusion.

The sponsor also needs the pinned workshop/sidecar Git objects above. Default source root is `../aftershock-upstream`; optionally export `AFTERSHOCK_UPSTREAM_ROOT=/your/source/root`. `.env` is not automatically loaded. No public wallet key is required for private tests.

## Reports and replay

Run IDs refer to validated envelopes in this checkout's `reports/`, not arbitrary paths or plain JSON captures in `docs/evidence/`.

```sh
npm run --silent aftershock -- replay <run-id> --plan
npm run --silent aftershock -- replay <run-id> --local --mine
npm run --silent aftershock -- compare <baseline-id> <rerun-id>
```

Fresh replay uses new keys/genesis and compares verdicts/stable environment, not identical execution. Match the original mining mode; omit `--mine` for admission-only baselines.

TTL genesis reset requires a complete newly recorded TTL baseline and retained private `.local/<run-id>/keys.json`:

```sh
npm run --silent aftershock -- replay <ttl-run-id> --plan --reset
npm run --silent aftershock -- replay <ttl-run-id> --local --reset
npm run test:reset
```

Mined reset supports checkpoint-enabled keyed-nonce baselines only:

```sh
npm run --silent aftershock -- run keyed-nonce-lifecycle --local --mine --checkpoint
npm run --silent aftershock -- replay <run-id> --plan --mine --reset
npm run --silent aftershock -- replay <run-id> --local --mine --reset
npm run test:replay:checkpoint
```

Keep private `.local/` snapshots. Reset verifies inputs/images/initial state; it does not reproduce clocks, explorer memory or later block hashes. Unsupported/missing inputs block replay.

## Evidence and troubleshooting

Reports have exclusive writes, SHA-256/schema checks and a 1 MiB limit. Journals retain bounded projections, not raw requests. `check-evidence` is selected offline consistency: exit 0 consistent, 1 contradiction, 3 insufficient; it never establishes full revalidation. Export success does not mean scenario PASS. Invalid CLI arguments exit 2.

Public `doctor`/`inspect` are read-only. To reproduce normal submission, use the separate pinned workshop's documented `step_1_check`/`step_2_tx_first`; read its AGENTS.md and use its faucet, never a shared genesis key. History may reset and missing receipts remain unavailable evidence.

Generated keys/logs/snapshots stay private under ignored `.local/`; generated reports are ignored too. The 13 rejected historical files are preserved, not migrated. Restart stale viewers after code updates. A hard kill can leave Docker resources: inspect exact `aftershock.run` labels and remove only owned resources; never globally prune. Agents must ask before installations/external deployment.
