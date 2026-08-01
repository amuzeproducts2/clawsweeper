# Mandatory adversarial review

**Date:** 2026-08-01
**Reviewer:** Krang, separate skeptical review pass
**Verdict:** approve with risks

## Blockers

None before PR. Do not merge or deploy unless exact-head CI, release-bundle
verification, and the repository's automated reviewer are green with every
finding triaged.

## Important improvements

1. Do not call a no-work cycle proof of active-review health again. Closeout
   requires the install-only runtime canary and a real eligible review.
2. Keep legacy-source consolidation and alert regrouping outside this incident
   patch so the failure surface does not expand.
3. After production evidence, consider a measured per-file Codex-home boundary;
   do not infer one from incomplete documentation.

## What was verified

- The release smoke previously bypassed Codex and the new canary is invoked only
  from the install marker path.
- The canary strips secret-bearing environment, runs the immutable release
  read-only, requires exact output, and publishes a dedicated freshness metric.
- The wrapper pins the Codex home to the same path the systemd unit makes
  writable.
- Installer ordering keeps the timer stopped until both healthchecks pass and
  sends any canary failure through verified rollback.
- The change adds no queue, watcher, workflow, GitHub permission, or credential
  copy.

## What is still unproven

- Exact systemd execution with the live Codex authentication and current CLI.
- A non-fallback review artifact for an eligible PR on the deployed revision.
- Two subsequent natural successful cycles and the full observation window.

## Verdict

Approve with risks for PR. Production closeout remains prohibited until every
unproven item above has direct evidence.
