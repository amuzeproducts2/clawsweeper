# Amuze closed-loop runner

The Amuze host runner is a bounded, stateful lane over ClawSweeper. It reviews,
repairs, and safely merges eligible pull requests without allowing one
repository or unchanged pull-request head to monopolize every cycle.

## Scheduling

- Repository order has independent priority and all-repository fairness lanes.
  With at least two work slots, high/critical Dependabot repositories receive
  the first slot while one slot advances the persistent all-repository attempt
  cursor. That fairness slot is reserved in both the item and action budgets,
  so a priority repository cannot consume it by returning multiple due items
  even when the per-repository cap is greater than one. Earlier failed or empty
  lanes release their reservations to later lanes. The attempt cursor is
  atomically checkpointed before planning and advances even when that
  repository's plan fails or the process crashes after the checkpoint.
  Successful-service state is separate: `cursorRepo`, `lastVisitedAt`, and item
  service counters advance only after planning succeeds. Routine work therefore
  receives service within at most one full repository rotation even when the
  priority backlog remains larger than the cycle budget or one repository
  persistently fails planning.
- `REPO_MAINTENANCE_MAX_ITEMS` defaults to 10 examined items per cycle.
- `REPO_MAINTENANCE_MAX_ITEMS_PER_REPO` defaults to one examined item per
  repository per cycle.
- `REPO_MAINTENANCE_PLAN_LOOKAHEAD` defaults to 20, so the per-repository PR
  cursor rotates over more than the one item executed in that cycle.
- `REPO_MAINTENANCE_MAX_ACTIONS` defaults to two and
  `REPO_MAINTENANCE_MAX_RUNTIME_SECONDS` defaults to 780. The runner
  checkpoints after each repository and item before either budget can stop it.
- Pull requests rotate within each repository. The runner checkpoints the item
  cursor and an in-flight attempt before starting a blocking review. A crashed
  attempt holds a 30-minute retry lease; peers rotate ahead of it during the
  lease, and the item becomes eligible again after expiry. A caught failure
  clears the lease but retains the advanced cursor and retry eligibility.

## Review quiescence

The runner stores the exact head SHA and a fingerprint of checks, review
decision, labels, agent/Macroscope verdicts, and review threads. An exact match
is quiescent: no frontier review or duplicate comment occurs. Any relevant
evidence change re-arms one review.

Frontier-review exceptions, timeouts, and missing verdicts increment review
failure metrics, never record a completed review state, never count as
progress, and remain retry eligible.

## Security ownership

The GitHub watchdog snapshot is read only when it has a valid generation time
and a valid Dependabot alert/error inventory. Unrelated watchdog collection
errors do not invalidate a sound Dependabot snapshot. Each alert is correlated
by `owner/repo#alert-number`.

- A matching open Dependabot PR links the alert only when the author is exactly
  the trusted `dependabot[bot]` actor, the branch identifies the same ecosystem
  as the alert, its parsed target version is at least the alert's
  `firstPatchedVersion`, and the PR changes the alert's exact dependency
  manifest. Missing, unknown, cross-ecosystem, or ambiguous evidence fails
  closed. Alert ecosystem and dependency scope must also be present. NPM
  versions use conservative stable SemVer ordering; prerelease and non-NPM
  versions fail closed unless they exactly equal the first patched version.
- A missing or unverified PR emits one failure receipt, exposes an
  unowned-alert metric, and puts the candidate security PR ahead of ordinary
  work.
- An unexpectedly failed repository inventory preserves prior alert state and
  increments the paging security-coverage metric; it can never fabricate
  recovery. A stale or malformed whole snapshot also increments that failure
  metric. Explicitly classified disabled coverage remains visible for Krang's
  daily risk receipt but uses a nonpaging receiver; it never enters the
  Telegram route. Unexpected coverage remains immediate and uninhibited.
- Linkage or alert disappearance emits an explicit recovery receipt.
- The runner never dismisses a Dependabot alert.

## Runtime state and metrics

The release wrapper keeps mutable state under
`/root/.openclaw/state/clawsweeper-orchestrator` and runs code through
`/root/.openclaw/releases/clawsweeper/current`. The service retains
`ProtectHome=read-only`; the existing authenticated Codex home at
`/root/.codex` is the only writable home subtree so Codex can update its model
cache and create review sessions without making reviewed repositories or the
credential tree writable.

The operational node_exporter textfile reports the exact release revision, last completion,
repository/item counts, action count, progress, unchanged skips, no-progress
streak, planning/review failures, unexpected security coverage failures,
expected nonpaging coverage gaps, unowned security alerts, and maximum
repository service age. Install healthchecks publish a separate
`clawsweeper_healthcheck.prom` file and are rejected if they change the
operational metric file. Any repository planning failure marks that operational
run unhealthy while leaving its successful-service timestamp unchanged, so
the planning-failure and repository-starvation alerts remain armed without
blocking peer service.

## Immutable release and cutover

CI builds `dist/`, runs a read-only production-plan smoke, packages bundle-local
`config/`, `prompts/`, and `schema/` assets with `REVISION` and
`MANIFEST.sha256`, then executes plan- and review-loading smoke checks. It
uploads a tar archive plus checksum so hidden files and executable modes
survive transport; a separate clean job extracts and reverifies that archive.
The runtime refuses a missing, hash-mismatched, or semantically incomplete
bundle.

`scripts/install-release.sh` stops new timer dispatch, drains the active
service, acquires the same lock used by the prior wrapper, captures the
existing units and mutable state, migrates the legacy merge/review ledgers,
atomically flips `current`, and restarts the timer. The returned backup path is
the input to `scripts/rollback-release.sh`; rollback preserves failed-release
state before restoring the previous unit contents, drop-ins, exact timer
enabled/active state, mutable state, and release target. Any cutover error after
the snapshot automatically invokes that rollback. Activation is not complete
until one service run succeeds and advances the separate healthcheck metric.
The state archive is checksummed, path-listed, extracted into staging, and
compared with live state before rollback is declared ready. Rollback validates
and stages that archive before moving live state. The same preflight binds the
prior units, drop-ins, exact `current` symlink target, path metadata, and timer
enabled/active states in a complete type/mode layout and SHA-256 manifest.
Install acquires the shared runtime lock, captures and stage-verifies the full
reversal set, and only then stops the timer or changes a live path. Rollback
reads only the staged, reverified evidence, so corruption of any reversal member
leaves live state, units, symlink, and timer untouched. The manifest's lowercase
SHA-256 trust-anchor file is explicitly compared with the freshly computed
manifest digest before any inner checksum is trusted.
A valid-shaped but incorrect digest, including an all-zero digest, therefore
fails both installer staging and standalone rollback before timer, unit, state,
or release-symlink mutation. A static release-script regression also rejects
any non-comment physical line that ends with a string or numeric comparison
operator, independent of whether the predicate uses `[`, `test`, an absolute
test path, or a command wrapper. This prevents conditional-command error
suppression from masking a split comparison failure. The install smoke first
uses a marker-driven read-only healthcheck to verify GitHub API access, snapshot
freshness, release provenance, and metric publication without reviewing,
commenting, repairing, or merging. It then starts one install-only `codex exec`
session from the immutable release with the review repository read-only and
GitHub/API token environment removed. The timer is not enabled unless that
session returns the exact canary response and advances its dedicated
healthcheck timestamp. A failed smoke rolls back automatically, including a
first install whose exact prior state was “absent.”

## Verification

```bash
node test/amuze-fallback-runner.test.ts
node test/release-rollback-integrity.test.ts
bash -n scripts/*.sh
promtool check metrics < /var/lib/node_exporter/textfile_collector/clawsweeper_orchestrator.prom
```

Runtime state is never stored inside an immutable release checkout.
