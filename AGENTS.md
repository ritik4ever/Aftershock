# Aftershock working rules

Read docs/PROJECT_SPEC.md, docs/THREAT_MODEL.md and docs/UPSTREAM.md before implementation.

- Never stage, commit, push, rewrite history or create a remote. Stop after a coherent verified milestone for the user's manual commit.
- Ask before installing packages/dependencies or deploying externally. The user delegated approval for existing disposable local Docker tests; use cached images with pulls disabled. Do not run npm ci/install without approval, including routine reinstalls.
- Keep upstream checkouts and generated workshop wallets/state outside this repository. Disposable fixture keys stay in ignored Linux .local/ with restrictive modes; never copy them to the Windows review checkout. Never retrieve or use shared genesis credentials.
- Use the official @forshtat/hegota-support codec and its /rpc encoder. Do not vendor generated upstream lib artifacts.
- No public-devnet adversarial tests, node administration, reputation mutations or privileged transaction submission. Controlled state transitions require a verified private isolated deployment.
- Record source pins separately from live node identity. An empty live commit is unknown, not a match.
- Use bigint or hex for protocol quantities. Included does not mean execution succeeded. Missing evidence cannot pass an invariant.
- Build CLI and genuine transaction evidence before UI. Distinguish implemented, tested, blocked and planned in docs.
- New application code will use one npm workspace lockfile; the independent upstream workshop retains Yarn Classic and yarn.lock, and the sidecar retains Bun.
- Keep implementation and integration builds in the WSL Linux filesystem. The current build mirror is /home/ritik/aftershock-build; the Windows IDE checkout retains reviewed source for manual commits. Synchronize source before checks; do not silently relocate the user's checkout or copy node_modules/wallet state back.
- After installation approval, use npm ci --ignore-scripts with the tested Node version in .nvmrc. Otherwise validate the existing dependency tree without reinstalling. Run typecheck, Oxlint, formatting check, tests and npm audit before each implementation checkpoint.
