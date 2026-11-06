# Demo walkthrough and three-minute script

Website: https://aftershock-sepia.vercel.app/

## Prepare before recording

- Open Contract lab, fill the executable counter plan and start one fresh hosted run. Keep its workflow link. Setup and mining take several minutes; record the start, then cut to the completed run and disclose the elapsed time.
- Have a completed genuine `paymaster-solvency` or `keyed-nonce-lifecycle` report ready. Label it as a previous execution, not the run you just started.
- Keep the contract report JSON and public explorer available. Hide credentials, environment settings, wallets and personal tabs. Hosted plans and artifacts may be public.

## Narration and screen sequence

| Time | Show | Say |
| --- | --- | --- |
| 0:00-0:25 | Homepage | "Aftershock is a developer testing tool for EIP-8141 Frame Transactions and the Alternative Mempool. Admission is only the beginning: balances, nonces and competing transactions can change before inclusion." |
| 0:25-0:55 | Contract lab; fill counter plan; inspect JSON; start once | "A developer supplies compiled contract bytecode and ordered actions with assertions. This small counter is an executable example. The runner deploys it on a fresh chain, signs a Frame Transaction and submits through the real sidecar." |
| 0:55-1:35 | Completed report from that run; admission, receipt, storage and read-back | "After setup and mining, this report shows whether the transaction was admitted and whether both frames executed successfully. We assert that storage becomes seven and an independent read returns seven. Cleanup is checked too." |
| 1:35-2:10 | Previous payer or keyed-nonce report; expand relevant actions | "Our original lifecycle suites go further. Shared-payer tests check obligations and mined balance changes. Keyed-nonce tests check independent keys, conflicts and replacement fees. An expected rejection counts as a passing assertion when the node rejects for the expected reason." |
| 2:10-2:40 | Live transaction inspection; expand receipts; open explorer | "This separate transaction is on the public sponsor devnet. This button queries the gateway now. Public observations are distinct from our isolated experiments and recorded reports." |
| 2:40-3:00 | Download report JSON; show source pins and plan hash | "Aftershock contributes orchestration, assertions and reproducible evidence. It reuses the official codec and upstream clients. Developers can use these reports to reproduce behavior and catch regressions; this is scoped testing, not a security certification." |

Use the actual verdict on screen. Never narrate PASS over a queued, blocked or failed run. Download the completed report and retain the workflow link.

## Public transaction to inspect

Paste into **Inspect transaction now**:

```text
0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03
```

Observed on the sponsor devnet: chain 1337, block 8337, type `0x06`, status OnChain and two successful frames. [Explorer](https://explorer.altmempool.wtf/tx/0x7fdbc4e04e6539bf4ef21c1876bb6a4e3a809c46319a1571fb61f1d0b8e1fa03?node=https%3A%2F%2Faltmempoolgateway.forshtat.com%2Frpc). The devnet may reset: if a new lookup is unavailable, show the saved observation with its date and say that the current lookup is unavailable. Do not replace missing live data with a recorded result.

## Optional sponsor-focused technical sequence

Prepare installed dependencies, pinned upstream sources and cached images using [setup](REPRODUCIBILITY.md). Mining takes several minutes; capture a genuine run before recording.

```sh
npm run --silent aftershock -- run staked-storage-boundary --local --mine
npm run --silent aftershock -- report <actual-run-id> --format md
npm run --silent aftershock -- evidence <actual-run-id>
npm run --silent aftershock -- serve --port 4323
```

1. Explain the problem: a single successful submission does not test behavior after replacements or state changes. Name the original payer/keyed suites.
2. Show the real isolated environment, zero stake and canonical/unstaked foreign-storage rejection.
3. Show the mined staking transaction and actual registry/nonce/balance changes.
4. Show the **same post-stake signed candidate** rejected canonically and admitted/included through the alternative mempool. Require unwaived storage checks and successful frame receipts.
5. Show the one-wei recipient increase, report export and original scenario evidence. Briefly show the separate public transaction linked in README.

Before/after-staking candidates have different nonces/hashes; only the post-stake canonical-versus-sidecar comparison uses the same hash. Private hashes have no public explorer links.

Record your own explanation of design and trade-offs. Keep keys, `.local/`, raw logs and personal tabs off-screen. Check audio, legibility, upload access and the dashboard's video requirements. Recording/upload are not yet verified.

## Full feature walkthrough: run in this order

Use this checklist for a longer mentor session or recording preparation. The short script above is the edited highlight version. Execute real mining tests before recording their results; do not try to fit the setup wait into three minutes.

### 1. Explain the product

1. Open the website and show the navigation.
2. Say: "Aftershock helps developers test Frame Transactions before and after state changes. We combine controlled execution with expected-versus-observed assertions."
3. Explain the three inputs: a hash inspects an existing transaction; signed raw bytes simulate a transaction; a contract plan deploys code and executes ordered assertions. Explorer transaction JSON is not a contract plan.

### 2. Check current public-network connectivity

1. In **Check the real network**, click **Check network now**.
2. Show the observation time, chain ID and gateway information. Chain 1337 is hex `0x539`.
3. Explain that an unknown source commit remains unknown. A reachable node does not prove a scenario passed.
4. If the network is unavailable, show the error rather than claiming a successful live check.

### 3. Inspect a real mined Frame Transaction

1. Paste the hash from **Public transaction to inspect** above.
2. Click **Inspect transaction now**.
3. Show admission observed, lifecycle, execution result and receipt block. Expand **Actual frame receipts**.
4. Open the explorer to cross-check the same hash. Public history may reset.
5. Say: "This is supporting integration evidence. The controlled experiments and assertions are the testing product. Looking up a hash does not execute another transaction."

### 4. Dry-run a deployed contract call

1. Open **Test your input** and select **Deployed contract call**.
2. Use the WETH example button. It fills the sponsor-devnet deployment, caller, `symbol()` calldata, gas and expected return bytes.
3. Click **Run dry test**. Expand the actual checks and download its JSON report.
4. Say: "This makes a fresh eth_call at a captured block. It checks the declared return assertion; no state changes are mined."
5. For a useful negative test, change only the expected return to `0x`, then rerun. If the contract returns a symbol, the mismatch must be FAIL. Restore the example afterward.
6. If deployed-code detection fails, the devnet address may have changed; do not substitute a mainnet address or claim the example passed.

### 5. Simulate a developer-supplied signed transaction

1. Select **Signed Frame Transaction**.
2. Paste full signed type-`0x06` bytes produced by the official codec for the sponsor devnet. Do not paste a hash, explorer JSON, private key or the placeholder `0x06...`.
3. Click **Run dry test** and expand the report's policy/execution observations.
4. Explain: "This simulates these exact bytes against current devnet state. It does not submit them to the alternative mempool or guarantee admission."
5. Already-mined transactions can fail current nonce or expiry checks. Report that outcome honestly; historical success does not imply present-state validity.
6. If no suitable signed bytes are available, skip the positive demonstration and explain the required input. Do not fabricate an executable payload. [Input details](USER_INPUT.md).

### 6. Deploy a supplied contract and assert mined state

1. Open **Contract lab**, then click **Fill executable counter plan**. Alternatively upload [counter.plan.json](../examples/counter.plan.json).
2. Show `initCode`, the `frame` step writing seven, its storage assertion and the following `call` expecting seven.
3. Click **Deploy and run public test plan** once. Open its GitHub workflow progress link. This uses isolated GitHub-hosted nodes, not your laptop.
4. Allow setup/mining to finish. If shared capacity is busy, follow the active workflow link when the busy-screen fix is deployed; your own plan has not started. Try again after completion.
5. Show the completed steps: `mining-ready`, `deploy-contract`, `action-1`, `action-2`, `fixture-cleanup`.
6. Expand deployment evidence: contract address, successful deployment receipt and runtime code information.
7. Expand `action-1`: actual Frame hash, admission checks, successful mined frame receipts and expected/actual slot-zero value seven.
8. Expand `action-2`: returned bytes encode seven. Download the actual contract report JSON and show its run ID, plan SHA-256 and source pins.
9. Say: "This is actual deployment and state-changing execution. Developers replace the example bytecode, calls and assertions with their own compatible contract."
10. Optional separate negative run: change only the call's `expectedReturn` from seven to eight. The write should still succeed, but the read assertion should FAIL. This costs another full run and shared capacity; it is not required for the short video.

### 7. Test shared-payer solvency

1. After the previous job finishes, open **Run a new test**, choose **paymaster-solvency** and start once.
2. Follow GitHub progress and wait for the real report.
3. Show `confirm-solvency-boundary`: actual balance and maximum liability.
4. Show `reject-aggregate-overspend`: the expected rejection is a passing assertion.
5. Show `verify-replacement-lifecycle`: predecessor and replacement hashes, old admission outcome and removal from the active pool.
6. Show `balance-control`, `drain-payer`, `verify-solvency-eviction` and the surviving-obligation check. Explain the controlled mined balance change and actual pending-state response.
7. Describe this accurately as shared-EOA-payer accounting, not testing every contract paymaster's sponsorship policy.

### 8. Test keyed-nonce conflicts and replacement

1. Choose **keyed-nonce-lifecycle**, start once and wait for completion.
2. Show duplicate rejection, disjoint-key admission and overlapping-key conflict rejection.
3. Show both fee-threshold rejection checks, accepted fee-bumped replacement and its old/new hashes.
4. Show mined inclusion, stale-sequence rejection, next-sequence admission and the disjoint-key survivor.
5. Say: "We check a sequence of related operations, rather than treating one admission response as proof of the whole lifecycle."

### 9. Test TTL expiry and refresh

1. Choose **keyed-replacement-ttl** and start a new run after capacity is free.
2. Show the below-bump rejection before expiry, actual TTL wait, acceptance after expiry and rejection after replacement refreshes the TTL.
3. Show the duplicate guard and cleanup. Explain that this is admission/lifecycle coverage; it is not a mined-execution test or an exact timing-boundary proof.

### 10. Explain scenario coverage and additional local suites

1. Open **Scenario coverage**, refresh and expand **Implemented checks**, **Prerequisites**, **Coverage limits** and **Source rule** on one card.
2. Explain that cards describe coverage; refreshing them does not start tests. Hosted predefined starts currently support payer, keyed-nonce and TTL cases.
3. For **cancelled-replacement**, show the retained genuine FAIL report. Explain the active-versus-explorer status mismatch without calling it a proven exploit.
4. For **staked-storage-boundary**, use the optional technical sequence above. Show the same post-stake signed hash rejected canonically and admitted/included through the sidecar, with unwaived checks. Attribute the workshop-derived demonstration.
5. To execute these two additional suites, use the prepared Linux/WSL checkout and the local CLI; they are not enabled as hosted predefined starts.

### 11. Browse reports and inspect evidence

1. In **Run explorer**, click **Refresh runs**, search a scenario name and filter by verdict/source.
2. Open a report. Identify its source: reviewed historical example, saved local run or fresh GitHub-hosted execution.
3. Expand the action timeline, expected/observed checks, environment/source pins and RPC journal where available.
4. Download **Report JSON**, **Report Markdown** and **Evidence JSON** for a scenario report. Contract lab has its own contract-report JSON download.
5. Explain that selected offline evidence checks are partial. A matching check does not erase a recorded FAIL or prove complete authenticity.
6. If historical reports are unavailable, show the listed reason. Do not relabel missing/incompatible data as a passing run.

### 12. Compare and explain replay

1. Open **Compare**, select two distinct available runs of the same scenario and click **Compare runs**.
2. Show verdict changes and compatibility information. If no compatible pair exists, explain that rather than comparing unrelated tests.
3. Remote reports are not automatically added to published archive comparisons. A local viewer with two genuine saved reruns is the best place to demonstrate a fresh comparison.
4. In a scenario's run details, show **Fresh-state rerun** guidance. The displayed command is for manual terminal execution; clicking or viewing it does not restore a chain.
5. Explain that fresh reruns use new accounts/state, supported reset/checkpoint modes have explicit prerequisites, and exact historical timing is not reproduced.

### 13. Optional CLI demonstration

In the existing prepared WSL build checkout:

```bash
cd /home/ritik/aftershock-build
source ~/.nvm/nvm.sh
nvm use
npm run --silent aftershock -- help
npm run --silent aftershock -- doctor --local
npm run --silent aftershock -- scenarios
npm run --silent aftershock -- run paymaster-solvency --local --mine
```

Wait for completion, then substitute its actual run ID:

```bash
npm run --silent aftershock -- report <actual-run-id> --format md
npm run --silent aftershock -- evidence <actual-run-id>
npm run --silent aftershock -- replay <actual-run-id> --plan
```

`doctor --local` checks prerequisites, not scenario correctness. `tsx: not found` means the current checkout lacks accessible dependencies; use the prepared WSL checkout above. New users must follow [reproducible setup](REPRODUCIBILITY.md).

### Finish the presentation

Say: "Aftershock's contribution is stateful orchestration, rule-aware assertions and inspectable reports. Our original payer and keyed-nonce suites exercise real infrastructure; Contract lab extends that workflow to developer-supplied compatible code. Coverage is pinned and bounded, and failures remain visible."

For a three-minute recording, prioritize sections 1, 6, 7 or 8, 3 and 11. Treat all other sections as optional mentor questions. Confirm the dashboard's actual duration requirement separately.
