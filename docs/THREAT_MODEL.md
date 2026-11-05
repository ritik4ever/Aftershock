# Threat model

This is a devnet research tool, not an auditor's proof of safety. Source-backed proposed invariants are in [PROJECT_SPEC](PROJECT_SPEC.md).

| Boundary | Risk | Required control before implementation |
| --- | --- | --- |
| Shared devnet | Disrupting other participants | Only normal funded workshop transactions and bounded reads; no stress, reputation/admin mutations or privileged relay calls |
| Isolated stack | A localhost proxy may still point at shared infrastructure | Verify process ownership, chain configuration, upstream RPCs, peer isolation and loopback bindings before stateful tests; localhost alone is insufficient |
| Signing state | Secrets in logs, reports or Git | Fresh throwaway keys, faucet funding, private ignored state, allowlisted exports and redaction; never shared genesis keys or personal wallets |
| RPC responses | Malformed, huge, stale or dishonest data | Validate schemas and quantities, response size/time bounds, explicit source/channel; a response is node-reported evidence, not independent cryptographic proof |
| Version identity | Applying a source rule to another build | Record source pins separately from observed commit; unknown identity yields INCONCLUSIVE for version-dependent assertions |
| Explorer history | Restart or eviction hides lifecycle actions | Capture bootId and sequence bounds before/after; resync with explicit gaps, preserve opaque cursors; skipped and waived checks are not independent enforcement |
| Execution | Admission/inclusion mistaken for success | Inspect actual per-frame receipts and status; pending receipt absence is not a failure |
| Replay/report files | Traversal, script injection, forged findings | Validated IDs, containment checks, immutable exclusive writes, integrity checks; no arbitrary payload execution; local reset snapshots required for deterministic replay |
| Future UI | Remote shell access or credentials exposed | Local read-only report browsing; no deployed transaction runner or shell interface; escape untrusted content |

Trusted inputs are our pinned inspected source and explicit fixture definitions. Live node metadata is an assertion by that node. The public gateway exposes no source commit, so its responses cannot establish the pinned implementation's invariants. Private admission/replacement checks now run on owned processes with pinned image provenance; mining-dependent invariants remain untested.

Paymaster accounting requires the balance callback; executor.ts wires it in at the inspected commit. Current fixtures start fresh non-mining genesis state, inspect the actual TTL and reject expired replacement-test preconditions. Reconciliation requires a mining-capable stack, which is not yet provided.

Diagnostic exports validate and allowlist explorer/config fields, discard untrusted server error text and fail on inconsistent chain IDs. They do not authenticate the operator's claims or provide a signed attestation. Unit-test transports are injected only through module imports, never through CLI options; unit tests do not save mock results as public evidence.

Private fixtures use Docker internal networks, no published ports, disabled execution-client P2P, unique names/labels, resource limits and freshly generated keys. All shared funded EOAs are removed from the upstream genesis template before funding our fresh accounts. No shared genesis credentials are used. Private state/logs remain ignored and mode-restricted; teardown removes owned containers/network. Docker daemon access is a trusted local CLI capability and must never be exposed to the future web viewer.

The pinned upstream sidecar dependency audit has advisories; Docker isolation is a containment boundary, not proof those dependencies are safe. No public deployment is appropriate. Report SHA-256 checks detect accidental modification, not malicious authors who can recompute checksums. Fresh-account reruns are not exact snapshot replay.
