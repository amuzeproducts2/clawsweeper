# Production readiness

**Date:** 2026-08-01
**Owner:** Krang
**Verdict:** approve with gated cutover

## Scope

Deploy the exact reviewed ClawSweeper revision through its transactional
installer while the production timer is contained.

## Smoke path

- Action: build and verify the immutable release, then run
  `scripts/install-release.sh BUNDLE_DIR REVISION`.
- Expected: existing healthcheck advances; install-only Codex session returns
  `CLAWSWEEPER_CODEX_RUNTIME_OK`; dedicated Codex timestamp advances; timer is
  enabled only afterward.
- Evidence: installer output, systemd journal, healthcheck metrics, release
  symlink, and captured backup path.

## Monitoring and observability

- Logs: `journalctl -u clawsweeper-orchestrator.service`.
- Metrics: operational and healthcheck node-exporter textfiles, including Codex
  runtime success/timestamp, review attempts/failures, and no-progress streak.
- Alerts: last-run failure, review failure, no progress, security coverage, and
  repository service age.
- Post-deploy: one real eligible review without `agent_review_failed`, then two
  successful natural cycles.

## Rollback

- Installer captures and verifies prior unit files, drop-ins, release target,
  timer enabled/active state, and mutable-state archive before mutation.
- Any cutover/canary error invokes `rollback-release.sh` automatically.
- Owner: Krang.

## Watch window

- Start only after the active-review proof and two natural successful cycles.
- Duration: fresh eight-hour observation with repeat checkpoints.
- Failure action: disable the timer using the tested containment reversal,
  preserve artifacts, and keep closeout open.

## Cutover gates

1. Exact-head CI and release bundle green.
2. Automated-reviewer findings fully triaged.
3. Clean immutable bundle verifies locally.
4. Production rollback evidence stages and verifies before cutover.

## Risks accepted

The exact systemd/Codex proof necessarily occurs inside the rollback-protected
install transaction; any failure restores the contained prior state.
