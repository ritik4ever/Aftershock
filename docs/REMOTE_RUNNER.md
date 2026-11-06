# Browser runs through GitHub Actions

Vercel dispatches a fixed workflow in `ritik4ever/Aftershock`. A fresh GitHub-hosted Ubuntu VM prepares pinned Docker images, runs an isolated scenario and uploads one validated report. Visitors need only a browser; neither their computer nor the maintainer's laptop executes the test.

## Enable after reviewing and pushing the code

1. Open GitHub Actions and confirm **Checks** passes. The `scenario-run.yml` workflow must exist on `main`.
2. Create a fine-grained GitHub token restricted to **Aftershock**, with **Actions: read and write** and a short expiry. Do not grant repository-content write permission. Keep the token private.
3. In Vercel's **Production** environment settings, add only `AFTERSHOCK_GITHUB_TOKEN`. Keep it server-only and private. No visitor code or login is required. The old `AFTERSHOCK_RUNNER_ACCESS_CODE` variable can be deleted; it is no longer read.
4. Redeploy Vercel. The hosted test controls appear when configured; otherwise the local-runner fallback remains available.
5. Start with `keyed-replacement-ttl`. Follow the GitHub progress link, then inspect the newly returned report and downloads. Verify this actual hosted run before claiming remote execution works. Repeat a mined original suite before final release.

The [workflow REST API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) requires Actions write permission. Standard public-repository compute is free; [artifact/storage allowances and platform limits](https://docs.github.com/en/billing/concepts/product-billing/github-actions) still apply. No paid runner is configured.

## Boundaries and limits

- Payer, keyed-nonce and TTL scenarios plus strict custom contract plans are accepted. No user scripts, RPC targets, branches or shell commands are accepted.
- Starts are public. The API checks recent workflow runs for a four-per-hour limit and active work; these are best-effort checks, not an atomic distributed rate limiter. Workflow concurrency serializes runs; racing submissions may queue or be cancelled by GitHub. Limits are shared across all visitors. Public starts consume owner allowances; no bot protection or atomic budget is implemented. Remove the server token to disable execution.
- Queueing, image preparation and mining take minutes. The site polls workflow status; detailed engine results arrive with the final report. The GitHub progress link shows provisioning/execution steps.
- A request UUID supports retry deduplication against recent runs. Browser session storage retains accepted job IDs and pending request IDs. If storage is blocked, keep the tab open. Do not assume a timed-out dispatch means no job started.
- Only `.local/remote-export/result.json` is uploaded, retained for five days. Wallets, raw logs and other private state are not artifacts. Normal engine cleanup is checked; cancelled/timed-out jobs cannot imply PASS or verified cleanup. The hosted VM is disposable.
- The API verifies workflow identity, request/scenario/source commit, artifact digest and report schema. It bounds reads/decompression and never extracts ZIP paths to disk. These checks are not independent proof that an operator is honest.
- Remote reports are displayed separately from the fixed published archive. They are not automatically added to archive comparisons. Artifact expiry, setup failure and missing evidence remain unavailable/error states; no saved example substitutes for a fresh run.

No separately provisioned VM, tunnel, custom Solidity or new npm dependency is required for this design. User screenshots show hosted TTL (11 checks), payer (16) and keyed-nonce (18) runs passing with reports. A downloaded hosted counter report also records deployment, Frame admission/mining, state assertions and cleanup. Starts are public without a shared code; active-work and rate guards still apply.

Custom contract plans use the same workflow and capacity limits, with an additional public JSON plan and SHA-256 input. The run name and returned report must match that hash. See [Contract lab](CONTRACT_LAB.md). No new environment variable is required. Never upload private code, credentials or keys.
