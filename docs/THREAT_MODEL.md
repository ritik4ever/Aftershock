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

Trusted inputs are our pinned inspected source and explicit fixture definitions. Live node metadata is an assertion by that node. The public gateway exposes no source commit, so its responses cannot establish the pinned implementation's invariants. No reported invariant has been tested on a real local node yet.

Paymaster accounting requires the balance callback; executor.ts wires it in at the inspected commit. Reconciliation requires new blocks and a running reconciler. Pending sets race with mining: fixtures must establish deterministic observation barriers. Replacement tests must control TTL, predecessor status and onchain nonces. These prerequisites are requirements, not currently satisfied assumptions.

Diagnostic exports validate and allowlist explorer/config fields, discard untrusted server error text and fail on inconsistent chain IDs. They do not authenticate the operator's claims or provide a signed attestation. Unit-test transports are injected only through module imports, never through CLI options; unit tests do not save mock results as public evidence.
