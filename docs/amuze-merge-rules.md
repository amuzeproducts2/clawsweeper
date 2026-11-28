# Amuze merge rules (2026-11-28)

The Amuze runner (`scripts/amuze-fallback-runner.mjs`) reviewed every pull request
in the `amuzeproducts2` organization but ended most of them at the label
`status: 👀 ready for maintainer look`, which meant Jay. Jay asked for pull
requests to be reviewed, fixed and merged without him, and approved the rules
below on 2026-11-28. Risk and pause labels, drafts, forks, schema and migration
changes, auth and secret paths, and deploy or infrastructure configuration still
stop for a person.

## Why pull requests were parked

Measured on 2026-11-28 against live GitHub data and the runner's state on the
Amuze host. 33 of the 35 open pull requests already had a passing exact-head
ClawSweeper review, and 33 of the 34 Dependabot pull requests had an exact-head
Macroscope approval. Gates after the review stopped them:

1. **The Dependabot lane never matched.** `gh pr view --json author` reports
   Dependabot as `{"login":"app/dependabot","is_bot":true}`. The runner compared
   against `dependabot[bot]`, so neither the Dependabot merge lane nor the
   security-alert linkage had matched a live pull request since 2026-07-31.
2. **A relay job counted as a failed check.** Every repository runs
   "ClawSweeper Dispatch" (job `dispatch`), which only forwards activity. The
   runner's own comment and label updates cancel its runs, and a cancelled run
   read as a failed check. That parked all 25 GitHub Actions version bumps.
3. **Dependency files were human-only.** Any change to a manifest or lockfile
   paused the pull request for a person; the pause never lifted on its own.
   It produced over 9,000 "needs human" records in five days, each with an
   incident receipt.
4. **CI was recognized by name.** A green repository whose required checks are
   not named like CI, test, check or build (amuze-live-data: "Service
   acceptance", "Planning package integrity") waited forever.
5. **Macroscope's approval check was off in 11 repositories.** Its Correctness
   check runs everywhere, but its Approvability check (which posts the approving
   review) was set to "Never run" in amuze-live-data, amuze-excel-connector,
   amuze-exit-dashboard-v2, amuze-mail-connector, amuze-cinema-intel,
   apple-notes-daily-os, quality-plush-photo-pipeline, prize-trend-dashboard,
   openclaw-setup-diet, weekly-content-calendar-email and floor-planner, because
   the workspace default for newly linked repositories was "Never run". Jay's
   session switched all 48 repositories and the default to "Always run" at about
   02:25 UTC on 2026-11-28. The runner keeps a fallback for a repository where the
   check is missing (below). Separately, Macroscope skips its Correctness check
   with "No code objects were reviewed." for lockfile-only diffs, and the runner
   read that as missing coverage even when Macroscope had approved.
6. **The repair worker rarely got a real chance.** 17 attempts and 2 pushes on
   record. It was refused on any pull request that touched a dependency or
   workflow file, Macroscope's review-thread comments were hidden from it (GraphQL
   returns the login `macroscopeapp` without `[bot]`), it never saw failing-check
   logs, it was not told that the runner commits for it, and it could not push a
   fix it was unable to test because the project's dependencies are not installed
   in its sandbox. The bot's own "needs changes" verdict never started a repair.

"Ready for maintainer review" in the public review comment is only wording; the
verdict marker behind it was `pass`.

## The rules

| | Pull request | Rule |
|---|---|---|
| **Merges alone** | Dependabot patch or minor update, lockfile-only, every commit Dependabot's own and signed by GitHub (and exactly the inspected commits), update type declared in Dependabot's commit metadata, no hard-stop path (including the old side of a rename) | Merges when every check is green (required checks and the rest), Macroscope approved the exact head, no ClawSweeper review of that head said otherwise, and GitHub's branch rules allow it. |
| **Second agent instead of a person** | Any other Dependabot patch or minor update: manifest changes, Actions bumps, range-floor or indirect updates, 0.x minor updates, a history with someone else's commits | Goes to ClawSweeper's independent exact-head review. A pass, green checks and Macroscope's approval merge it. |
| | Any pull request that changes dependency manifests or lockfiles | The review must be complete (whole patch read) and security-cleared, as workflow changes already required. |
| | A repository explicitly listed in `CLAWSWEEPER_MACROSCOPE_APPROVABILITY_OFF_REPOS` (empty by default; Approvability runs in every repository since 2026-11-28 02:25 UTC) | ClawSweeper's complete, security-cleared exact-head pass stands in for Macroscope's approval, once Macroscope's Correctness check has finished on that head and unless Macroscope requested changes. A missing Approvability check in an unlisted repository is never treated as "off": the runner waits. Where Approvability runs, its approval is required, and a "neutral" result (Macroscope declining to approve) stops. |
| | A review verdict of `needs-changes` or `needs-repair` on the exact head | Becomes repair work, followed by a fresh review. |
| | Red checks | The repair worker gets the failing job logs (up to two, capped and redacted) and Macroscope's thread comments, makes a narrow fix, and the runner pushes it. Two tries per commit, three per pull request. A fix the worker could not test may still be pushed if no review thread needs a ruling and the change is small (at most 5 files and 150 lines); CI on the pushed commit and a fresh review decide. |
| **Still stops** | Risk or pause labels, drafts, pull requests from forks, Dependabot major updates, and Dependabot updates whose size neither the metadata nor the title shows | A person decides. |
| | Database schema or migrations, auth or secret paths, Docker files, deploy and infrastructure configuration | Unchanged; a person decides. |
| | A reviewer or repair worker asks for a business or permission decision, or flags a security concern; repair budgets are used up | Stops with the reason recorded. |
| | GitHub's own branch rules (for example a code-owner review) | The runner waits and records why. It never uses admin override; that option is removed. |

Other details:

- The relay job is excluded only as `dispatch` in the workflow "ClawSweeper
  Dispatch" (and the existing `notify` relay), and only when branch protection
  does not require it.
- Required checks come from `gh pr checks --required`; every one must pass. The
  CI signal must be a real check (not a relay, not Macroscope): a required one,
  or, when the branch requires none, a CI-named one, as before. Macroscope's
  Correctness and Approvability checks are judged separately; any other Macroscope
  check is an ordinary check. If the required-check list cannot be read, the
  runner waits.
- A ClawSweeper review of the exact head that asked for changes sends the pull
  request to repair even if Macroscope approved it; an escalation stops both
  merge and repair.
- A pass that lacks the evidence a pull request needs (security clearance for
  workflow or dependency changes, complete-patch coverage for large ones) re-arms
  the review at most twice per head; after that the pull request waits with the
  reason recorded.
- The review-free lanes cache a blocker only until GitHub's merge state, the
  required checks or the separately fetched evidence change.
- A skipped Correctness check counts as coverage only when Macroscope's own check
  title says it reviewed no code. A skip for any other reason (for example a
  spend cap) stays pending, as `docs/amuze-autonomous-pr-evidence.md` requires.
- Pauses that only restate the pull request's current shape (draft, fork, label,
  path, major update) are re-evaluated every cycle, so changing the cause or the
  rule releases them. Escalations and permission failures stay until the head
  changes. A pause is written and announced once instead of every two minutes.
- Merge lanes whose stored blocker came from the old rules use new strategy names
  (`dependabot-squash-v2`, `macroscope-low-risk-squash-v2`), so the first cycle
  after deployment re-evaluates them instead of replaying the old reason.
- The runner checkpoints a repair's commit before pushing it, so a crash between
  push and the state write cannot reset the per-pull-request repair budget.

## Expected effect

On the pull requests open on 2026-11-28, after deployment. A read-only dry run of
this code against those 34 pull requests (`inspectPr` plus the lane functions,
with the stored "reviewed" state the host already holds) gave the same result:

- **Merge on their own:** 23 GitHub Actions bumps, amuze-prize-orders 155 and
  156, and canva-mcp-dummy 19 (after one agent review, since its update type is
  not declared).
- **Still blocked by GitHub:** amuze-automation 129 and 130, amuze-exit-dashboard
  105 to 108, and amuze-prizepulse 28. Those repositories require a code-owner
  review and CODEOWNERS names only Jay. Removing or changing that rule is Jay's
  decision; until then the runner waits and records the reason.
- **Merge conflict:** openclaw-incidents 15 (not handled by this change).

At most two merges or repairs happen per two-minute run.

## Rollout

Nothing is deployed by merging this pull request. Deploying needs Jay's word.

1. Wait for green CI on the merge commit (`pnpm check`, `build`,
   `transport-smoke`).
2. Build the release from that commit with the normal procedure
   (`scripts/build-release.sh`, upload, `MANIFEST.sha256`,
   `scripts/verify-release.sh`, `diff -rq` against the live release). No unit,
   drop-in or credential changes are needed; the release's own wrapper drops the
   admin-merge and Macroscope-approval variables and raises repair tries per
   commit from one to two.
3. Switch `/opt/clawsweeper/current` to the new release while the service is
   inactive, as on 2026-11-27.
4. Watch the first runs (each run merges or repairs at most two pull requests):
   the run history, `artifacts/merges/*.json`, incident receipts, and the merged
   pull requests on GitHub. Expected first merges are the GitHub Actions bumps.
   Check that each merged head matched its reviewed head and had green checks.
5. After a day, confirm the `repair_needs_human` count has dropped and that no
   pause receipts repeat every cycle.

## Rollback

1. Point `/opt/clawsweeper/current` back at the previous release while the
   service is inactive. The release carries its own wrapper, so the old defaults
   return with it.
2. No state migration is needed either way. The new fields (`candidateSha`,
   `ciValidationPending`, the `-v2` strategy names) are additive; the previous
   release ignores them and re-evaluates merge lanes whose strategy differs.
3. A merge cannot be undone by rollback. Every merge receipt names its reverse
   command (`git revert <merge sha>`, published through a pull request). An
   untested repair commit on a pull request branch is reverted the same way on
   that branch.

## Independent reviews of this change

Codex (read-only, high effort) and ClawSweeper's own review of the first commit
found these gaps; all are fixed with tests: a missing Approvability check
waiving Macroscope's approval (the fallback is now an explicit opt-in list), a
lockfile under a deploy directory or a renamed protected file passing the
review-free lanes, a negative ClawSweeper review or a Macroscope refusal being
overridden, a required relay counting as CI, a required non-review Macroscope
check being ignored, an undetermined Dependabot update size merging, commit
evidence not bound to the inspected commits, free text releasing a sticky pause,
cached blockers surviving a change in GitHub's merge state, and a pass without
dependency clearance never being re-reviewed.

Found but not changed here, because they predate this change (follow-ups):

- An earlier pass on the same head can let a later no-change adjudication of a
  new review thread proceed to thread resolution without a review that saw it,
  and the no-change path does not rerun its regression on a clean checkout.
- Failed reviews of unchanged evidence keep retrying daily without a terminal
  cap (deliberate today as a health signal).
- A branch that moves away and back to the same commit during one inspection
  could mix evidence from two heads; merges still require the inspected head.
- `gh pr merge` on a repository with a merge queue would enqueue rather than
  merge; none of the organization's repositories uses one today.

## Residual risks

- Someone with push access could add a commit that GitHub signs while naming
  Dependabot as author (through the API). The review-free lane still requires
  Macroscope's approval, a lockfile-only diff and Dependabot's metadata.
- Where Macroscope's Approvability check is off, ClawSweeper's review is the only
  model review before merge. It must be complete and security-cleared, and
  Macroscope's Correctness check must have finished on the head.
- Failed-job logs come from code under review. They reach the worker as quoted
  data, capped and redacted. The worker has no network and no GitHub access, and
  anything it changes needs green CI and a fresh review before a merge.
- A repository with no Macroscope checks at all still waits, because nothing
  shows that Macroscope has finished.
- This repository's own `.macroscope/approvability.md` tells Macroscope not to
  approve changes to ClawSweeper's merge gates. This change is one, so it needs a
  person's go-ahead to merge; that rule is left as it is.
