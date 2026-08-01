# Failure brief: production active-review path

## Intended outcome

The host ClawSweeper lane must review eligible Amuze PRs, fail closed when a review is uncertain, and finish each cycle with truthful metrics and bounded GitHub activity.

## Proven failure

- The `2026-08-01T15:00Z` cycle exited successfully with `reviewAttempts=0`; it did not exercise Codex.
- The natural `15:30Z` and `16:00Z` cycles both exited `1` when eligible PRs required Codex review.
- The `16:00Z` cycle attempted two reviews and recorded `reviewFailures=2`, `progress=0`, and `noProgressStreak=2`.
- Both review artifacts contain the same stderr: Codex could not update its model cache or create a session because the filesystem was read-only.
- The service unit sets `ProtectHome=read-only`. The wrapper relocates XDG state/config/cache into the writable ClawSweeper state directory but does not relocate Codex home state.
- The installer smoke creates `.install-smoke`, which switches the runner to `--healthcheck`; that path checks GitHub and metrics but never starts Codex.

## Root cause

The production sandbox contract is internally inconsistent: the service permits reading the existing Codex login but denies the writes Codex requires for session and cache state. The release gate missed the inconsistency because its smoke path intentionally bypassed the active reviewer.

## Systemic delivery failure

Component gates and no-work cycles were treated as proof of the end-to-end outcome. Multiple local source copies and stale registry paths made source-of-truth reasoning harder, but the decisive verification gap was the absence of one exact-runtime Codex canary before enabling the production timer.

## Containment

The production timer was reversibly disabled at `2026-08-01T16:20:48Z` before its next trigger. No review, merge, deployment, credential, or alert configuration changed during containment.

## Acceptance criteria

1. Codex can create a session and return a deterministic smoke response from the exact systemd sandbox used by production.
2. The release and credential trees remain read-only; only the existing Codex home and existing ClawSweeper state paths are writable.
3. A failed Codex runtime canary aborts deployment and restores the prior release, unit, timer state, and state archive.
4. One real eligible PR review completes without `agent_review_failed`, followed by at least two successful natural cycles.
5. Production closeout cannot start from a cycle with `reviewAttempts=0` unless an independent active-review canary passed on the exact deployed release.
