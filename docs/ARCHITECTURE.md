# Architecture

`packages/cli` validates commands and calls `packages/core`. Core contains:

- Public gateway reads and schema-projected transaction inspection.
- Fixed scenario definitions, official-codec signing and isolated Docker fixtures.
- Lifecycle/receipt assertions and bounded per-run RPC evidence.
- Immutable report storage, selected offline checking, comparison and replay.
- A loopback-only HTTP viewer with same-origin, read-only APIs.

State-changing scenarios use owned internal networks and fresh private keys. The public reader has no mutation methods. The viewer cannot run shell commands, sign transactions or start containers.

Reports retain allowlisted node outputs and request digests, not signatures, calldata, logs or complete raw transcripts. SHA-256 detects changes but does not authenticate authorship. Offline checking does not rerun the protocol.

Replay executes built-in scenarios only; saved command text is never executed. Fresh reruns change keys/genesis. Supported reset modes require private retained inputs and identical images; they do not reproduce clocks or later block hashes.

[Setup](REPRODUCIBILITY.md) · [Security boundaries](THREAT_MODEL.md)
