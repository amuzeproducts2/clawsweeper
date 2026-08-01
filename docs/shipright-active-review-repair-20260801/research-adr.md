# Research and ADR: writable Codex runtime boundary

## Current architecture

The production systemd unit runs an immutable release bundle with `ProtectSystem=strict` and `ProtectHome=read-only`. It grants write access only to the ClawSweeper state directory, node-exporter textfiles, the incident receipt spool, and `/tmp`; the wrapper already redirects XDG and Git state but leaves Codex home at its existing authenticated location.

## Options considered

### A. Allow the existing Codex home as a narrow writable path

Add `/root/.codex` to `ReadWritePaths`, retain `ProtectHome=read-only`, retain read-only release and credential paths, and add an install-only Codex session canary.

- Advantages: smallest change; preserves the existing login; no credential copying or new secret path; exercises the exact production binary and sandbox.
- Cost: the review subprocess can update files within its existing Codex home, which is required for sessions, cache, and token maintenance.

### B. Create an isolated Codex home inside ClawSweeper state

Set `CODEX_HOME` under the writable state directory and copy or bind authentication/configuration into it.

- Advantages: tighter per-service state isolation.
- Rejected: adds credential lifecycle and synchronization complexity, risks stale or duplicated auth material, and expands this repair into secret handling.

### C. Make the whole home directory writable

Remove `ProtectHome=read-only`.

- Advantage: Codex would run.
- Rejected: unnecessarily broad and contrary to the fail-closed review boundary.

## Decision

Choose option A. Pin ClawSweeper to the existing `/root/.codex` authenticated runtime so the service does not depend on ambient manager environment, keep the repository, release, and credential paths read-only, and allow only that Codex home plus the existing explicit service state paths to be writable.

Add an install-only runtime smoke that invokes `codex exec` with GitHub/API token environment removed, a read-only sandbox, the immutable release as its working directory, and the output file in ClawSweeper state. Deployment must fail before the timer is re-enabled unless the exact response is returned and recorded in the separate healthcheck metric.

## Rollback

The existing release installer snapshots the prior unit, release target, timer state, and state directory and verifies staged rollback before cutover. A canary failure occurs inside that transaction and therefore restores the prior production state; the containment timer remains available as the independent stop control.

## Non-goals

- Redesigning the review model or PR policy.
- Copying or reissuing credentials.
- Deleting legacy local repositories during the incident.
- Expanding GitHub workflow permissions.
- Treating alert suppression as a fix for reviewer failure.
