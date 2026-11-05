# Aftershock

Find the failures before they reach Ethereum.

Aftershock is a planned stateful scenario runner for Ethereum Frame Transactions and alternative-mempool lifecycle rules. This repository currently contains the research foundation and a working read-only devnet diagnostic probe. It does not yet submit transactions, run scenarios or provide a UI.

```sh
node scripts/probe-devnet.mjs
node --test tests/probe-devnet.test.mjs
```

The probe needs Node >=20.12 and no installed packages. It only reads the configured public gateway; successful diagnostics do not demonstrate admission or execution. Unit tests use test transports, never publish mock evidence, and require no network.

- [Project scope and proposed invariants](docs/PROJECT_SPEC.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Pinned upstream sources](docs/UPSTREAM.md)
- [Protocol compatibility and differences](docs/PROTOCOL_COMPATIBILITY.md)
- [Environment, blockers and next setup steps](docs/ENVIRONMENT.md)
- [AI usage and user decisions](docs/AI_USAGE.md)

Current blockers: incompatible WSL Node version, stopped Docker daemon, missing Bun/WSL Docker integration and unknown public-node source commit. Local lifecycle tests and genuine admitted-transaction evidence remain unverified. The implementation will use Linux-home files under WSL; this Windows checkout is the initial research workspace.

No application dependency installation is required yet. The upstream workshop, sidecar and codec are existing projects credited in UPSTREAM.md. No upstream implementation has been copied into the application. A permissive license awaits the user's selection.
