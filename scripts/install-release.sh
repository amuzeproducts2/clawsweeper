#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR="${1:?usage: install-release.sh BUNDLE_DIR VERSION}"
VERSION="${2:?usage: install-release.sh BUNDLE_DIR VERSION}"
if [[ ! "${VERSION}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "VERSION must be a full Git commit SHA" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLBACK_EVIDENCE_HELPER="${SCRIPT_DIR}/rollback-evidence.sh"
if [ ! -r "${ROLLBACK_EVIDENCE_HELPER}" ]; then
  echo "rollback evidence helper is missing" >&2
  exit 1
fi
# shellcheck source=rollback-evidence.sh
source "${ROLLBACK_EVIDENCE_HELPER}"

RELEASES_ROOT="${CLAWSWEEPER_RELEASES_ROOT:-/root/.openclaw/releases/clawsweeper}"
STATE_DIR="${CLAWSWEEPER_STATE_DIR:-/root/.openclaw/state/clawsweeper-orchestrator}"
BACKUP_ROOT="${CLAWSWEEPER_BACKUP_ROOT:-/root/.openclaw/backups/clawsweeper-cutover}"
SYSTEMD_DIR="${CLAWSWEEPER_SYSTEMD_DIR:-/etc/systemd/system}"
LOCK_PATH="${CLAWSWEEPER_LOCK_PATH:-/tmp/openclaw-repo-maintenance-orchestrator.lock}"
METRICS_PATH="${CLAWSWEEPER_METRICS_PATH:-/var/lib/node_exporter/textfile_collector/clawsweeper_orchestrator.prom}"
HEALTHCHECK_METRICS_PATH="${CLAWSWEEPER_HEALTHCHECK_METRICS_PATH:-/var/lib/node_exporter/textfile_collector/clawsweeper_healthcheck.prom}"
LEGACY_ARTIFACT_ROOT="${CLAWSWEEPER_LEGACY_ARTIFACT_ROOT:-/root/.openclaw/workspace/projects/clawsweeper-prod-3ddf8d50/artifacts/amuze-fallback}"
LEGACY_HISTORY="${CLAWSWEEPER_LEGACY_HISTORY:-/root/.openclaw/workspace/telegram-main/memory/repo-maintenance/orchestrator-history.jsonl}"
SYSTEMCTL="${CLAWSWEEPER_SYSTEMCTL:-systemctl}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}-${VERSION}"
TARGET_DIR="${RELEASES_ROOT}/releases/${VERSION}"
STAGE_DIR="${RELEASES_ROOT}/releases/.${VERSION}.staging"
CUTOVER_STARTED=0
ROLLBACK_READY=0
INSTALL_COMPLETE=0
ROLLBACK_EVIDENCE_STAGE_ROOT=""

healthcheck_timestamp() {
  if [ ! -f "${HEALTHCHECK_METRICS_PATH}" ]; then
    printf '0\n'
    return
  fi
  awk '$1 == "clawsweeper_healthcheck_last_run_timestamp_seconds" { value=$2 } END { print value+0 }' \
    "${HEALTHCHECK_METRICS_PATH}"
}

optional_checksum() {
  if [ -f "$1" ]; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf 'absent\n'
  fi
}

verify_state_archive() {
  local archive="${BACKUP_DIR}/state-before.tgz"
  local checksum="${BACKUP_DIR}/state-before.tgz.sha256"
  local listing="${BACKUP_DIR}/state-before.list"
  local state_basename
  local proof_dir
  state_basename="$(basename "${STATE_DIR}")"
  if ! (
    cd "${BACKUP_DIR}"
    sha256sum --check --strict "$(basename "${checksum}")"
  ); then
    echo "state rollback archive checksum verification failed" >&2
    return 1
  fi
  if ! tar -tzf "${archive}" > "${listing}"; then
    echo "state rollback archive listing failed" >&2
    return 1
  fi
  if ! awk -v root="${state_basename}" '
    $0 == root || index($0, root "/") == 1 { next }
    { exit 1 }
  ' "${listing}"; then
    echo "state rollback archive contains an unexpected path" >&2
    return 1
  fi
  proof_dir="${BACKUP_DIR}/state-restore-proof"
  install -d -m 0700 "${proof_dir}"
  if ! tar -C "${proof_dir}" -xzf "${archive}"; then
    echo "state rollback archive staged extraction failed" >&2
    return 1
  fi
  if [ ! -d "${proof_dir}/${state_basename}" ]; then
    echo "state rollback archive omitted its expected root" >&2
    return 1
  fi
  if ! diff -qr "${STATE_DIR}" "${proof_dir}/${state_basename}"; then
    echo "state rollback archive staged content differs from live state" >&2
    return 1
  fi
  rm -rf "${proof_dir}"
}

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  set +e
  if [ "${CUTOVER_STARTED}" -eq 1 ] && [ "${INSTALL_COMPLETE}" -ne 1 ]; then
    flock -u 9 2>/dev/null || true
    if [ "${ROLLBACK_READY}" -eq 1 ]; then
      CLAWSWEEPER_SYSTEMCTL="${SYSTEMCTL}" \
        CLAWSWEEPER_ROLLBACK_EVIDENCE_HELPER="${ROLLBACK_EVIDENCE_HELPER}" \
        "${BUNDLE_DIR}/scripts/rollback-release.sh" "${BACKUP_DIR}"
    fi
  fi
  echo "cutover failed; prior timer/unit/state restoration attempted from ${BACKUP_DIR}" >&2
  exit "${exit_code}"
}

"${BUNDLE_DIR}/scripts/verify-release.sh" "${BUNDLE_DIR}"
if [ "$(tr -d '[:space:]' < "${BUNDLE_DIR}/REVISION")" != "${VERSION}" ]; then
  echo "bundle revision does not match VERSION" >&2
  exit 1
fi
if [ -e "${TARGET_DIR}" ] || [ -e "${STAGE_DIR}" ]; then
  echo "release target or staging path already exists" >&2
  exit 1
fi
if [ -e "${BACKUP_DIR}" ]; then
  echo "cutover backup path already exists" >&2
  exit 1
fi

install -d -m 0700 "${BACKUP_DIR}"
install -d -m 0755 "${RELEASES_ROOT}/releases"
if [ -L "${RELEASES_ROOT}/current" ]; then
  readlink "${RELEASES_ROOT}/current" > "${BACKUP_DIR}/previous-target"
elif [ -e "${RELEASES_ROOT}/current" ]; then
  echo "current release path exists but is not a symbolic link" >&2
  exit 1
else
  : > "${BACKUP_DIR}/previous-target"
fi
for unit in clawsweeper-orchestrator.service clawsweeper-orchestrator.timer; do
  if [ -f "${SYSTEMD_DIR}/${unit}" ]; then
    cp -a "${SYSTEMD_DIR}/${unit}" "${BACKUP_DIR}/${unit}"
  else
    : > "${BACKUP_DIR}/${unit}.was-absent"
  fi
  if [ -d "${SYSTEMD_DIR}/${unit}.d" ]; then
    cp -a "${SYSTEMD_DIR}/${unit}.d" "${BACKUP_DIR}/${unit}.d"
  else
    : > "${BACKUP_DIR}/${unit}.d.was-absent"
  fi
done
if [ -f "${SYSTEMD_DIR}/clawsweeper-orchestrator.timer" ]; then
  timer_enabled_state="$("${SYSTEMCTL}" is-enabled clawsweeper-orchestrator.timer 2>/dev/null || true)"
  printf '%s\n' "${timer_enabled_state:-disabled}" > "${BACKUP_DIR}/timer-enabled-state"
else
  printf 'not-found\n' > "${BACKUP_DIR}/timer-enabled-state"
fi
if "${SYSTEMCTL}" is-active --quiet clawsweeper-orchestrator.timer; then
  printf 'active\n' > "${BACKUP_DIR}/timer-active-state"
else
  printf 'inactive\n' > "${BACKUP_DIR}/timer-active-state"
fi
printf '%s\n' "${STATE_DIR}" > "${BACKUP_DIR}/state-dir"
printf '%s\n' "${RELEASES_ROOT}" > "${BACKUP_DIR}/releases-root"
printf '%s\n' "${SYSTEMD_DIR}" > "${BACKUP_DIR}/systemd-dir"
printf '%s\n' "${LOCK_PATH}" > "${BACKUP_DIR}/lock-path"
printf '%s\n' "${TARGET_DIR}" > "${BACKUP_DIR}/new-target"
printf '%s\n' "${STAGE_DIR}" > "${BACKUP_DIR}/new-stage"

exec 9>"${LOCK_PATH}"
if ! flock -w 900 9; then
  echo "active run did not release the shared lock within 15 minutes" >&2
  exit 1
fi

if [ -d "${STATE_DIR}" ]; then
  tar -C "$(dirname "${STATE_DIR}")" -czf "${BACKUP_DIR}/state-before.tgz.tmp" \
    "$(basename "${STATE_DIR}")"
  mv "${BACKUP_DIR}/state-before.tgz.tmp" "${BACKUP_DIR}/state-before.tgz"
  (
    cd "${BACKUP_DIR}"
    sha256sum state-before.tgz > state-before.tgz.sha256
  )
  if [ "${CLAWSWEEPER_TEST_CORRUPT_STATE_ARCHIVE:-0}" = "1" ]; then
    printf 'injected corruption\n' >> "${BACKUP_DIR}/state-before.tgz"
  fi
  if ! verify_state_archive; then
    echo "state rollback archive verification failed before cutover" >&2
    false
  fi
else
  : > "${BACKUP_DIR}/state-was-absent"
fi

rollback_write_manifest "${BACKUP_DIR}"
if [ "${CLAWSWEEPER_TEST_CORRUPT_ROLLBACK_MANIFEST_DIGEST:-0}" = "1" ]; then
  printf '%064d\n' 0 > "${BACKUP_DIR}/rollback-manifest.sha256.digest"
fi
rollback_stage_and_verify "${BACKUP_DIR}"
find "${ROLLBACK_EVIDENCE_STAGE_ROOT}" -depth -delete
ROLLBACK_EVIDENCE_STAGE_ROOT=""
ROLLBACK_READY=1

trap rollback_on_error ERR
CUTOVER_STARTED=1
"${SYSTEMCTL}" stop clawsweeper-orchestrator.timer || true
for _ in $(seq 1 180); do
  if ! "${SYSTEMCTL}" is-active --quiet clawsweeper-orchestrator.service; then
    break
  fi
  sleep 5
done
if "${SYSTEMCTL}" is-active --quiet clawsweeper-orchestrator.service; then
  echo "active run did not drain within 15 minutes; cutover aborted" >&2
  false
fi

cp -a "${BUNDLE_DIR}" "${STAGE_DIR}"
"${STAGE_DIR}/scripts/verify-release.sh" "${STAGE_DIR}"
mv "${STAGE_DIR}" "${TARGET_DIR}"

install -d -m 0700 "${STATE_DIR}"
if [ ! -d "${STATE_DIR}/artifacts" ] && [ -d "${LEGACY_ARTIFACT_ROOT}" ]; then
  cp -a "${LEGACY_ARTIFACT_ROOT}" "${STATE_DIR}/artifacts"
fi
if [ ! -f "${STATE_DIR}/run-history.jsonl" ] && [ -f "${LEGACY_HISTORY}" ]; then
  cp -a "${LEGACY_HISTORY}" "${STATE_DIR}/run-history.jsonl"
fi

for unit in clawsweeper-orchestrator.service clawsweeper-orchestrator.timer; do
  if [ -d "${SYSTEMD_DIR}/${unit}.d" ]; then
    mv "${SYSTEMD_DIR}/${unit}.d" "${BACKUP_DIR}/${unit}.d.removed-during-cutover"
  fi
done
install -m 0644 \
  "${TARGET_DIR}/systemd/clawsweeper-orchestrator.service" \
  "${SYSTEMD_DIR}/clawsweeper-orchestrator.service"
install -m 0644 \
  "${TARGET_DIR}/systemd/clawsweeper-orchestrator.timer" \
  "${SYSTEMD_DIR}/clawsweeper-orchestrator.timer"
ln -s "${TARGET_DIR}" "${RELEASES_ROOT}/.current-${VERSION}"
mv -Tf "${RELEASES_ROOT}/.current-${VERSION}" "${RELEASES_ROOT}/current"
"${SYSTEMCTL}" daemon-reload
SMOKE_TIMESTAMP_BEFORE="$(healthcheck_timestamp)"
OPERATIONAL_METRICS_BEFORE="$(optional_checksum "${METRICS_PATH}")"
install -m 0600 /dev/null "${STATE_DIR}/.install-smoke"
"${SYSTEMCTL}" enable --now clawsweeper-orchestrator.timer
"${SYSTEMCTL}" start clawsweeper-orchestrator.service
SMOKE_TIMESTAMP_AFTER="$(healthcheck_timestamp)"
if ! awk -v before="${SMOKE_TIMESTAMP_BEFORE}" -v after="${SMOKE_TIMESTAMP_AFTER}" \
  'BEGIN { exit !(after > before) }'; then
  echo "post-cutover smoke did not advance the separate ClawSweeper healthcheck metric" >&2
  false
fi
if ! grep -Eq '^clawsweeper_healthcheck_success[[:space:]]+1([[:space:]]|$)' \
  "${HEALTHCHECK_METRICS_PATH}"; then
  echo "post-cutover smoke did not report a successful ClawSweeper run" >&2
  false
fi
if [ "$(optional_checksum "${METRICS_PATH}")" != "${OPERATIONAL_METRICS_BEFORE}" ]; then
  echo "read-only install healthcheck changed operational ClawSweeper metrics" >&2
  false
fi
mv "${STATE_DIR}/.install-smoke" "${BACKUP_DIR}/install-smoke.completed"

INSTALL_COMPLETE=1
trap - ERR
printf 'release=%s\nbackup=%s\n' "${TARGET_DIR}" "${BACKUP_DIR}"
