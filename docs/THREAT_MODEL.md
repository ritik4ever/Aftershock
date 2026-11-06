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
| Local browser runner | Loopback and same-origin/Host checks; JSON-only bounded scenario-start requests, fixed IDs, one active job/process; no arbitrary scripts, endpoint selection or credentials |
| Hosted site | Reviewed captures, GET-only `/api/live`, and optional access-code-gated `/api/runner`; fixed repository/workflow/scenarios, server-only token, no arbitrary shell or private-directory discovery |
| Remote execution | Disposable GitHub-hosted VMs; bounded/digest-checked artifacts, workflow/request/source identity checks, no wallet/log uploads; best-effort start limits plus workflow concurrency |
| Live public reads | Fixed gateway/method allowlist, 2.5-second read deadlines, schema/identity checks, no-store responses, two concurrent checks/instance; no archive fallback. This is not a global rate limiter |
| Replay | Built-in actions only, verified private inputs and image/state checks; no arbitrary report-supplied execution |

Journals are capped at 256 entries/64 KiB compact data; incomplete required evidence cannot PASS. Only explicitly recovered readiness failures are tolerated. Historical files are never populated with invented fields.

Checksums and image labels do not provide author authentication or source-to-binary attestation. Public source identity is unknown. The pinned sidecar's dependency advisories and known explorer inconsistency remain unresolved. Hard process termination can interrupt teardown; inspect exact run labels before removing leftovers. Never prune unrelated Docker resources.
