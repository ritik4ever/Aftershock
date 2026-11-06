# Test your transaction or deployed contract

Open **Test yours** on the website. These are fresh dry runs against the sponsor execution RPC, chain 1337. No access code, GitHub workflow or local Docker installation is needed. Aftershock does not sign, submit or persist these requests. The RPC receives your public input; never provide keys or credentials.

- **Signed Frame Transaction:** paste canonical type-`0x06` bytes produced with the official `ethrex-eip8141-tracer` profile. The sender, nonce, balances and referenced contracts must match this devnet. Aftershock decodes with the official codec, checks chain/size/gas limits and calls `ethrex_simulateFrameTransaction` with the exact bytes at a captured block. The report separates canonical policy from frame execution. This does not establish alternative-mempool admission or inclusion.
- **Deployed contract call:** provide the devnet contract address, caller, ABI-encoded calldata, hex value/gas and optionally exact expected return bytes. Aftershock checks deployed code and runs `eth_call` at the captured block; the call's writes are discarded. The WETH button fills a documented deployment's `symbol()` call, which is sent to the real node when tested. Replace the fields to test your own deployment.

Reports include block identity, observations and declared assertions. PASS applies only to those checks. A changed snapshot or missing execution evidence cannot PASS. Contract-call success does not certify wallet validation, paymaster policy or EIP-8141 compatibility. Use a signed Frame Transaction for validation in a frame context. For deployment and mined stateful testing of uploaded bytecode, use [Contract lab](CONTRACT_LAB.md).

CLI equivalent:

```bash
npm run --silent aftershock -- test-input input.json
```

Example input (deployed sponsor-devnet WETH; addresses can change on reset):

```json
{
  "kind": "contract",
  "to": "0x1b7d32025F7cA633943BbCC9Ec61a98ef66187b6",
  "from": "0x0000000000000000000000000000000000000001",
  "data": "0x95d89b41"
}
```

Transaction input is `{ "kind": "transaction", "raw": "0x06..." }` with your full signed bytes. CLI exits 0 for PASS, 1 for FAIL/command failure, 3 for NOT_VERIFIED. Contract value/gas default to `0x0`/`0xf4240`.

Limits: 16 KiB raw transaction, 16 frames, 3 million total declared gas; contract calldata up to 4 KiB and gas up to 1 million. No blobs, custom RPCs, state overrides, scripts or signing keys. Two active requests per function instance and bounded RPC deadlines mitigate load; these are not global rate limiting. Browser JSON downloads contain the current report, not archived examples. Production deployment and visual QA of this new interface must be checked separately.
