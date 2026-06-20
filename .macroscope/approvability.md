---
waitsFor:
  - "*"
waitsForTimeout: 45
conclusion: neutral
---

ClawSweeper is allowed to approve only low-risk maintenance PRs.

DO auto-approve when all of these are true:
- the PR is dependency-only, docs-only, tests-only, or a tiny deterministic
  repair;
- the PR is bound to the current head SHA and all GitHub checks are green;
- no correctness, security, auth, deployment, data, schema, migration, billing,
  or secret-handling risk is present;
- no human reviewer or review bot has requested changes;
- the PR does not broaden automation permissions, repository settings, tokens,
  workflow permissions, or merge authority;
- the PR includes tests or a clear no-test rationale appropriate to the change.

DO NOT auto-approve when any of these are true:
- the PR changes auth, secrets, credentials, token handling, GitHub Actions
  permissions, deployment config, infrastructure, migrations, schema, or
  production data pipelines;
- the PR changes ClawSweeper merge gates, admin merge behavior, review
  decision parsing, exact-head checks, branch protection assumptions, or
  security boundaries;
- the diff is large, mixes unrelated concerns, or includes generated churn that
  is not mechanically explained;
- checks are failing, cancelled, pending beyond the configured wait, missing for
  executable-code changes, or stale for the current head;
- the PR relies on a comment as the action receipt. Value requires merged PRs,
  pushed repairs, replacement PRs, or explicit blocked receipts.

When in doubt, leave the check neutral and require human review.
