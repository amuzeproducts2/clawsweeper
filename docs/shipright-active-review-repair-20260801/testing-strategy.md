# Testing strategy: production active-review path

## Regression tests first

1. The systemd unit must retain `ProtectHome=read-only` and read-only release/credential paths while explicitly allowing `/root/.codex` to be written.
2. A focused runtime-smoke test uses a fake `codex` executable to prove the smoke writes and validates the expected output.
3. The fake executable must not receive `GH_TOKEN`, `GITHUB_TOKEN`, `OPENAI_API_KEY`, or `CODEX_API_KEY`.
4. A non-zero Codex exit or wrong output must fail the smoke.
5. Installer tests must require the new Codex runtime-success healthcheck metric before enabling the timer.

## Broader gates

- Node 24 unit suite.
- Build, format, lint/type checks, and release-bundle verification through `pnpm run check`.
- Existing rollback-integrity tests, including injected rollback corruption cases.
- Secret/config scan of the diff and release manifest.

## Production proof

1. Deploy through the existing transactional installer with the timer contained.
2. Confirm the install-only Codex canary passes from the exact systemd unit and exact deployed release.
3. Run one bounded real eligible review with no merge authority expansion and confirm a non-fallback review artifact.
4. Re-enable the timer and require two successful natural cycles before restarting the eight-hour observation window.
