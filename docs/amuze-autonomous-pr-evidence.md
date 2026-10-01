# Amuze autonomous PR evidence

Routine code issues remain owned by ClawSweeper. Business choices, explicit pause/risk labels and permission-sensitive paths retain the existing escalation gates. No protection, credential, service, schedule or access changes are part of this patch.

## Merge contract

The final live PR head must match the reviewed head. Visible checks must all pass, include a repository CI/test/build signal, and include successful Macroscope correctness coverage and exact-head Macroscope approval. Neutral, skipped, missing and failed review coverage are pending evidence, never approval. The ordinary repair/review lane uses normal GitHub merging, without admin bypass. The existing optional deterministic Dependabot lane stays bot-authored, lockfile-only, bounded and gated by its existing checks/risk rules; enabling its Macroscope requirement cannot be bypassed by an agent comment.

The independent ClawSweeper review runs in a disposable detached worktree at the exact PR head, preserving the base checkout. It must exit successfully and emit completed, successful shell tool events reading the checkout SHA and the final PR commit. The runner accepts only new `evidence=verified-v3` pass markers. Historical passes cannot qualify. Execution receipts are stored with the review artifact; failed reviews mark checkout access unverified.

Repair workers return `schema/amuze-repair-evidence.schema.json`. Every unresolved finding, including outdated threads, needs a fixed or false-positive disposition, source evidence and a successfully executed regression command. The runner verifies command completion events rather than accepting a prose claim. Dispositions bind to both the final head and a hash of the finding. Fresh independent review evaluates them. Only then can those specific threads be resolved; changed findings or a changed head invalidate the evidence. Signals are fetched again at the merge boundary.

A clean independently reviewed routine PR enters an explicit routine lane with the same final evidence, size, sensitivity, risk and permission gates as the repair lane. It uses `reviewedSha` and cannot masquerade as a pushed repair. Agents do not need to invent a code change merely to qualify for autonomous merging.

## Cost and recovery

One item is processed at a time. Repair and independent review use medium reasoning. Repair is bounded to two attempts per head (configurable, clamped to three) and three attempts across the runner's own repair lineage. Independent review is bounded to two attempts per unchanged head/evidence fingerprint. Transport/access failures remain agent-owned; new review evidence rearms the review budget. Unchanged completed independent reviews are reused. A Macroscope cost-cap skip remains pending provider evidence and must not trigger a substitute pass or require Jay to perform a code review.

## Rollout and rollback

Do not install while the amuze-vps upgrade gate is closed. After parent release of that gate and acceptance of these PRs:

1. Require green Linux CI on the accepted ClawSweeper commit and the automation CI change. Local macOS cannot execute the existing `/usr/bin/bash`/`flock` Linux installer integration fixtures.
2. Build the normal immutable ClawSweeper release from that commit (`scripts/build-release.sh`); include the rebuilt `dist/codex-command-evidence.js` and new repair evidence schema. The existing installer and manifest verification handle both directories.
3. Capture the existing release/state rollback using the established installer. Install only through the approved release procedure. Do not alter schedules, permissions, protections or review-provider spending caps.
4. Check the deployed Codex CLI's JSON command-event shape and successful checkout/PR-head access with the existing read-only runtime smoke procedure before restoring ordinary processing. A sandbox startup failure must keep merge pending.
5. Observe a naturally occurring routine PR: regression evidence, green exact-head CI, successful Macroscope coverage, fresh independent review, normal exact-head merge. Never merge an unrelated PR as a test fixture.

Rollback uses the existing previous-release/state restoration procedure. Historical v1/v2 passes are deliberately ineligible under the new runner; no state deletion is required. A failed/skipped Macroscope review may still need provider-side recovery within the existing spending cap. No protection-read permission was available in the audit, so final required-check policy must be confirmed by ordinary GitHub merge enforcement/CI; this patch does not change it.

Thread-resolution process, permission, API and malformed-response failures carry diagnostic receipts and durable failure state. They have a three-attempt budget per unchanged head/finding set. Exhausted review visits do not consume the action budget, so later PRs remain serviceable.

Acceptance regressions now cover a detached final-head worktree and preservation of the base checkout, rejection of a base-head transcript, explicit routine-versus-repair eligibility, resolver diagnostics, and action-budget fairness. Worker evidence is not relabeled as final-head evidence: the runner repeats at most three focused commands after commit, within two minutes, using the existing Codex workspace-write sandbox without a model session. It confirms the final SHA and unchanged checkout after each command before publishing a repair. Missing or unrecognized sandbox CLI support fails closed; confirm this sandbox-only command on the deployed CLI after the parent upgrade gate is released. No sandbox/profile/access configuration is changed by rollout.
