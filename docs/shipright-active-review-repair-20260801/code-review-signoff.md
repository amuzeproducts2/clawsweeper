# Code review signoff

**Date:** 2026-08-01
**Reviewer:** Krang, isolated reviewer phase
**Verdict:** approve with risks

## Scope reviewed

Production service boundary, release wrapper, install transaction, release
bundle/verifier, Codex runtime canary, regression tests, and Amuze operating
documentation.

## Evidence reviewed

- Failure brief, research/ADR, and test strategy in this directory.
- Complete working-tree diff against `7b447432d3ae055dfb7f384269fe9272e0190e30`.
- Node 24 `pnpm run check`: 522 unit tests and 496 repair tests passed, changed
  and full coverage gates passed, and formatting passed.
- Focused canary tests: expected response, wrong response, and non-zero Codex
  exit all behave as specified.
- Existing rollback-integrity suite, including tampered reversal members and
  failed-cutover restoration.

## Review checklist

| Area | Result | Notes |
|---|---|---|
| Acceptance criteria | Partial | Code and test criteria pass; a real production review remains a post-deploy gate. |
| ADR | Pass | Uses the smallest boundary change and does not copy credentials. |
| Test quality | Pass | Covers success, secret-bearing environment removal, fail-closed output, release packaging, and installer gating. |
| Error handling | Pass | A failed canary makes the service fail and the installer restores the captured prior state. |
| Maintainability | Pass | One standalone shell canary and existing installer transaction; no new controller. |
| Documentation | Pass | Failure, decision, verification, and runtime contract are documented. |
| Deploy/rollback | Pass with gate | Transactional rollback is tested; exact systemd proof must occur during deploy. |

## Blockers

None before PR. Before production closeout: exact-head CI and automated review
must pass, the transactional install canary must pass, and one real eligible PR
review plus two natural cycles must succeed.

## Important improvements

- Consolidate stale registry/source paths after the incident; do not mix that
  cleanup into this repair.
- Reduce alert symptom fan-out after the active-review path is proven.

## Remaining risks

- `/root/.codex` is writable to the service because Codex owns multiple session,
  cache, index, and token-refresh files there. `ProtectHome=read-only` remains in
  force for every other home subtree.
- The production sandbox contract is not proven until the installer runs the
  canary under the installed systemd unit.
