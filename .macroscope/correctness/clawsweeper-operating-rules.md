ClawSweeper is an autonomous maintenance loop, so correctness includes
operational safety.

Review with these repo-specific rules:
- Exact-head decisions are mandatory. Any merge, repair, or approval claim must
  name and validate the current PR head SHA.
- Macroscope approval is a positive review signal, not a replacement for green
  checks, dependency-only limits, risk-label blocks, or branch protection.
- Comments are not action receipts. A change is useful only when it merges a
  safe PR, pushes a bounded repair, opens a replacement PR, or records a
  concrete blocker.
- Never let skipped, blocked, or already-failed PR heads consume the entire cron
  budget forever. The loop must keep moving to later PRs.
- Stale branch state, stale checks, or stale review approvals must block merge
  until refreshed.
- Do not hide GitHub API or `gh` failures. Report the failed command class and
  preserve enough receipt detail to debug recurring runtime failures such as
  `spawnSync gh EPERM`.
- Do not expand admin merge behavior beyond the approved Dependabot gate without
  an explicit human approval path and regression coverage.
