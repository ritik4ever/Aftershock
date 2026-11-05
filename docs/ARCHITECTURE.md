# Current architecture

The npm workspace has two packages. Core validates gateway reads and runs fixed private scenario definitions. CLI calls core; it has no arbitrary endpoint, user-supplied script or public mutation option. Private signing state stays in ignored .local/.

- rpc.ts: five allowlisted public read methods, native HTTPS fetch, redirect rejection, per-read 15-second deadline and 1 MiB response ceiling, JSON-RPC ID/error validation. No retries or mutations.
- schema.ts: actual inspected sidecar wire types projected to safe fields; protocol quantities stay hex. Payloads, signatures, calldata, receipt logs and arbitrary error/detail strings are not exported. Waiver status is derived from detail text before discarding it.
- inspect.ts: captures chain/explorer identity around transaction admission, lifecycle and receipt reads. Compares identities/frame counts and detects observable history discontinuity. Captures are sequential, not atomic snapshots; history already lost before the first read cannot be recovered.
- artifact.ts: generated UUID filenames, workspace-contained observation reports and exclusive file creation.
- scenario.ts: validated source-backed scenario definitions, sequential real actions and explicit result precedence. FAIL dominates missing prerequisites; BLOCKED branches prevent a whole-suite PASS. The seed names action order, not the random private keys.
- local/codec.ts: official profile, frame builder, signatures and wire encoder; no custom transaction serialization. The payer fixture uses a distinct EOA with its own payment signature, not a deployed paymaster contract.
- local/fixture.ts: checks image provenance/genesis template, removes shared funded accounts, generates private keys, creates internal Docker networking and bounded processes, verifies two-container isolation, then removes owned containers/network. Private keys, generated config and diagnostic logs remain under .local/ with restrictive modes.
- local/rpc.ts: runtime allowlist, fixed Bun fetch program executed via execFile argument arrays inside the owned sidecar container. No shell, no user script, no public endpoint, no published ports. Responses/time are bounded. This CLI-only transport must never become a public web API.
- report.ts: strict scenario schema, UUID paths, exclusive writes, symlink containment, size limits, SHA-256 checks and escaped Markdown. Checksum is not an authenticity attestation; exact replay remains future work.
- CLI: doctor, inspect, versions, help, scenarios, run --local and report --format json|md. JSON is native output; use npm run --silent when piping it. Native exit 2 means invalid arguments, 3 means BLOCKED, 1 means failed/inconclusive/unavailable evidence or file errors, and 0 means the command completed its declared checks. npm/WSL wrappers can normalize nonzero exits; integration tests check the native process status directly.

The bootstrap scripts/probe-devnet.mjs remains independently usable without installing npm dependencies. It is a setup diagnostic, not a second scenario/report implementation.

Tests use injected transports or copies of a real captured observation to check error handling and evaluation. Test outputs are never published as live evidence. Artifact tests create isolated /tmp/aftershock-* files/directories. CLI --save writes ignored reports in the Linux checkout.

The non-mining local fixture genuinely exercises admission, rejection and sidecar replacement state changes. It does not include transactions in blocks or exercise per-block balance enforcement. Both suites remain BLOCKED overall for those branches. There is no web server, UI or exact replay. Resource labels/unique names scope teardown; fresh genesis/key state prevents cross-run account collisions.
