# Architecture

`packages/cli` validates commands and calls `packages/core`. Core contains:

- Public gateway reads and schema-projected transaction inspection.
- Fixed scenario definitions, official-codec signing and isolated Docker fixtures.
- Lifecycle/receipt assertions and bounded per-run RPC evidence.
- Immutable report storage, selected offline checking, comparison and replay.
- A loopback-only browser runner with same-origin checks and one fixed-scenario job at a time.
- A Vercel read-only live function for current public network/transaction observations, alongside static recorded reports.

State-changing scenarios run only through the owned local engine with internal networks and fresh keys. The local UI accepts a built-in scenario ID and opens the newly generated report. It accepts no arbitrary scripts/keys/endpoints. The public live function is read-only. The optional runner function dispatches fixed isolated CI jobs; it does not run Docker or mutate shared devnet state. Hosted execution falls back to the local companion, or optionally dispatches the fixed GitHub Actions scenario workflow through an public Vercel function with best-effort shared execution limits. The website token remains server-side; only validated final report artifacts return to the browser. See [remote setup](REMOTE_RUNNER.md).

Reports retain allowlisted node outputs and request digests, not signatures, calldata, logs or complete raw transcripts. SHA-256 detects changes but does not authenticate authorship. Offline checking does not rerun the protocol.

Replay executes built-in scenarios only; saved command text is never executed. Fresh reruns change keys/genesis. Supported reset modes require private retained inputs and identical images; they do not reproduce clocks or later block hashes.

[Setup](REPRODUCIBILITY.md) · [Security boundaries](THREAT_MODEL.md)
