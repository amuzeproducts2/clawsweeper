# Security and hardening review

**Date:** 2026-08-01
**Reviewer:** Krang, isolated security-review phase
**Verdict:** approve with risks

## Scope

Codex process environment, service filesystem boundary, canary output handling,
metric publication, and rollback behavior.

## Checks

| Area | Result | Notes / evidence |
|---|---|---|
| Authorization | Pass | No GitHub permission, merge policy, or credential scope changes. |
| Input validation | Pass | Release/state/metric arguments are quoted; Codex output must equal one fixed token. |
| Injection and traversal | Pass | No user-derived shell evaluation or path construction was added. |
| Secrets and config | Pass with risk | GitHub and API token environment is removed from the canary; existing Codex file authentication is reused without copying it. |
| Data exposure | Pass | Canary logs and model output are deleted; only success and timestamp metrics remain. |
| Abuse and replay | Pass | Canary is install-only and installer requires a strictly newer timestamp. |
| Concurrency and idempotency | Pass | Installer holds/stages the existing transaction and timer remains stopped through smoke. |
| Monitoring | Pass | Separate success and timestamp metrics prove the canary without mutating operational run metrics. |
| Rollback | Pass | Canary failure enters the existing verified rollback trap before timer enablement. |

## Blockers

None before PR. Production remains blocked until exact-head CI/review gates pass.

## Important improvements

Inventory the minimum Codex-home write set after production proof. Narrowing
individual files is safe only after observing version-specific writes; guessing
now would recreate the same runtime-contract failure.

## Remaining risks

Codex may legitimately update any file under its existing home. The service
still cannot write the immutable release, reviewed repositories, credential
tree, or the rest of `/root`.
