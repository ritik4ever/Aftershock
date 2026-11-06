# Contract lab

Visitors can supply compiled constructor bytecode and a public JSON test plan. Aftershock deploys it on a fresh isolated EIP-8141 chain, executes the selected sequence, and checks return data, receipts, storage and cleanup. Hosted runs use GitHub Actions; local runs use the existing Docker companion. No signing keys are uploaded.

Open **Contract lab**, fill the executable counter example or upload your own JSON, then choose **Deploy and run public test plan**. Plans, bytecode, calldata and reports may be public through GitHub Actions. Compile Solidity and link libraries before uploading. `initCode` must include constructor arguments; `appendOwner: true` appends the generated owner's ABI-encoded address for a compatible single-address constructor. Compile a contract for the pinned execution client's supported EVM version.

Plan fields:

| Field | Meaning |
|---|---|
| `name`, `initCode` | Display name and complete constructor bytecode, up to 16 KiB |
| `deploymentValue` | Hex wei to fund a payable constructor, up to 0.05 test ETH |
| `appendOwner` | Append the generated owner's encoded address; default false |
| `steps` | One to eight ordered actions |

Action fields:

| Field | Meaning |
|---|---|
| `kind` | `call` (discard writes), `transaction` (mined EIP-1559), or `frame` (real alternative mempool and mined EIP-8141) |
| `data`, `value`, `gas` | Hex calldata/wei/gas; gas defaults to 1,000,000, maximum 1,500,000 |
| `expect` | `success` or `revert`; default success |
| `expectedReturn` | Exact hex return-data assertion for a successful call; cannot be combined with `expect: "revert"` |
| `storage` | `{ "slot": "0x…32 bytes", "value": "0x…32 bytes" }` assertion after the action |
| `frameSender` | `account` (fresh EOA) or `contract` (your compatible deployed wallet) |
| `verifyData` | Validation-frame calldata for the default two-frame transaction |
| `nonceKeys`, `nonceSeq` | Hex keys/sequence; nonzero keyed nonces require an explicit sequence |
| `rejectCode` | Expected Frame admission rejection: -32500, -32502 or -32602; separate from a mined execution revert |
| `frames` | Optional explicit frame array: mode 0/1/2, flags 0–7, target `sender`/`contract`/`owner`/address, execution/state gas, value and data. Up to eight frames and five million total gas |

Frame transactions use the official codec, chain 9, and one secp256k1 signature from the generated owner. Contract accounts must support that signature scheme and the supplied validation prefix; use `appendOwner` and constructor funding when appropriate. This does not automatically adapt arbitrary wallet authentication, external dependencies, factories or paymaster protocols. Those require explicit compatible bytecode and plan configuration.

The report preserves the plan hash, environment, deployment receipt, admission observations, mined frame receipts, assertions and cleanup. Missing evidence is BLOCKED; a confirmed mismatch is FAIL. A pass applies to the supplied assertions, not overall contract security. No private-network explorer URL is fabricated.

Local CLI:

```bash
npm run --silent aftershock -- contract-test examples/counter.plan.json --local
```

Limits: 48 KB serialized plan, eight actions, bounded gas/value, five-million-gas deployment, no custom scripts/endpoints or state overrides. The workflow never evaluates plan text as shell code. Shared hosted limits remain best-effort, not guaranteed bot protection. Artifacts expire after five days; download reports. Local job recovery lasts only for the viewer process. A user-provided hosted report (`48d1ff9f-7a9d-4037-9561-6de6f174516a`) and screenshot demonstrate counter deployment, admission, two successful mined frames, storage/read-back seven and cleanup. This does not establish every account configuration or complete visual coverage.

The bundled counter is a small hand-assembled EVM fixture, not a Solidity compiler output. Nonempty calldata stores its first word in slot zero; empty calldata returns that slot. The example proves that visitor-configured bytecode can be deployed and changed through a real Frame Transaction. Replace its constructor bytecode and encoded calls with your own compiled contract.
