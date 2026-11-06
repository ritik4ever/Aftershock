# Threat model

Aftershock is devnet research software, not proof of production safety.

| Boundary | Control and limitation |
| --- | --- |
| Shared devnet | Ordinary funded transactions and bounded reads only; no admin, reputation, stress or privileged submission calls |
| Private fixture | Verify ownership, pins and internal networking; no published ports; fresh keys; cached images; cleanup scoped to run labels |
| Secrets | Private Linux `.local/` and restrictive modes; no personal/shared genesis keys; never publish raw wallets/logs |
| RPC | Fixed methods, schema validation, bounded bodies/deadlines and integer-safe quantities; node responses remain trusted observations |
| Evidence | Check transaction identities, explorer boot/sequence continuity and successful frame receipts; admission alone is insufficient |
| Files | Validated IDs, containment, bounded regular-file reads, no-follow leaf opens, exclusive writes and checksum/semantic validation |
| Viewer | Loopback binding, same-origin/Host checks, GET-only APIs, CSP and text rendering; no execution or credentials |
| Hosted export | Fixed reviewed-capture allowlist; no private-directory discovery, backend or live RPC; Vercel serves only generated `dist` assets with security headers |
| Replay | Built-in actions only, verified private inputs and image/state checks; no arbitrary report-supplied execution |

Journals are capped at 256 entries/64 KiB compact data; incomplete required evidence cannot PASS. Only explicitly recovered readiness failures are tolerated. Historical files are never populated with invented fields.

Checksums and image labels do not provide author authentication or source-to-binary attestation. Public source identity is unknown. The pinned sidecar's dependency advisories and known explorer inconsistency remain unresolved. Hard process termination can interrupt teardown; inspect exact run labels before removing leftovers. Never prune unrelated Docker resources.
