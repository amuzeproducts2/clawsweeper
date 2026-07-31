#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:?usage: rollback-release.sh BACKUP_DIR}"
test -d "${BACKUP_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLBACK_EVIDENCE_HELPER="${CLAWSWEEPER_ROLLBACK_EVIDENCE_HELPER:-${SCRIPT_DIR}/rollback-evidence.sh}"
if [ ! -r "${ROLLBACK_EVIDENCE_HELPER}" ]; then
  echo "rollback evidence helper is missing" >&2
  exit 1
fi
# shellcheck source=rollback-evidence.sh
source "${ROLLBACK_EVIDENCE_HELPER}"

SYSTEMCTL="${CLAWSWEEPER_SYSTEMCTL:-systemctl}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK_EVIDENCE_STAGE_ROOT=""
ROLLBACK_EVIDENCE_DIR=""
STAGED_STATE=""

cleanup_preflight() {
  if [ -n "${ROLLBACK_EVIDENCE_STAGE_ROOT}" ] &&
    [ -d "${ROLLBACK_EVIDENCE_STAGE_ROOT}" ]; then
    find "${ROLLBACK_EVIDENCE_STAGE_ROOT}" -depth -delete
  fi
}
trap cleanup_preflight EXIT

# The checksum, complete membership layout, modes, schemas, and state archive are
# all validated and copied into private staging before any live path is read or
# any systemd/state/release mutation occurs.
rollback_stage_and_verify "${BACKUP_DIR}"

STATE_DIR="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/state-dir")"
RELEASES_ROOT="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/releases-root")"
SYSTEMD_DIR="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/systemd-dir")"
LOCK_PATH="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/lock-path")"
NEW_TARGET="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/new-target")"
NEW_STAGE="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/new-stage")"
PREVIOUS_TARGET="$(rollback_read_optional_line "${ROLLBACK_EVIDENCE_DIR}/previous-target")"
ENABLED_STATE="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/timer-enabled-state")"
ACTIVE_STATE="$(rollback_read_one_line "${ROLLBACK_EVIDENCE_DIR}/timer-active-state")"

[ -d "${RELEASES_ROOT}" ] || {
  echo "recorded release root does not exist" >&2
  exit 1
}
[ -d "${SYSTEMD_DIR}" ] || {
  echo "recorded systemd directory does not exist" >&2
  exit 1
}
[ -d "$(dirname "${LOCK_PATH}")" ] || {
  echo "recorded lock parent does not exist" >&2
  exit 1
}
if [ -L "${STATE_DIR}" ] || { [ -e "${STATE_DIR}" ] && [ ! -d "${STATE_DIR}" ]; }; then
  echo "live state path is not a directory" >&2
  exit 1
fi
if [ -e "${RELEASES_ROOT}/current" ] && [ ! -L "${RELEASES_ROOT}/current" ]; then
  echo "live current path is not a symbolic link" >&2
  exit 1
fi
for release_path in "${NEW_TARGET}" "${NEW_STAGE}"; do
  if [ -L "${release_path}" ] ||
    { [ -e "${release_path}" ] && [ ! -d "${release_path}" ]; }; then
    echo "recorded new release path has an unsafe live type: ${release_path}" >&2
    exit 1
  fi
done
for unit in "${ROLLBACK_UNITS[@]}"; do
  if [ -L "${SYSTEMD_DIR}/${unit}" ] ||
    { [ -e "${SYSTEMD_DIR}/${unit}" ] && [ ! -f "${SYSTEMD_DIR}/${unit}" ]; }; then
    echo "live systemd unit has an unsafe type: ${unit}" >&2
    exit 1
  fi
  if [ -L "${SYSTEMD_DIR}/${unit}.d" ] ||
    { [ -e "${SYSTEMD_DIR}/${unit}.d" ] && [ ! -d "${SYSTEMD_DIR}/${unit}.d" ]; }; then
    echo "live systemd drop-in path has an unsafe type: ${unit}.d" >&2
    exit 1
  fi
done

if [ -f "${ROLLBACK_EVIDENCE_DIR}/state-before.tgz" ]; then
  state_basename="$(basename "${STATE_DIR}")"
  state_stage="${ROLLBACK_EVIDENCE_STAGE_ROOT}/state"
  install -d -m 0700 "${state_stage}"
  tar -C "${state_stage}" -xzf "${ROLLBACK_EVIDENCE_DIR}/state-before.tgz"
  STAGED_STATE="${state_stage}/${state_basename}"
  test -d "${STAGED_STATE}"
fi

"${SYSTEMCTL}" stop clawsweeper-orchestrator.timer || true
for _ in $(seq 1 180); do
  if ! "${SYSTEMCTL}" is-active --quiet clawsweeper-orchestrator.service; then
    break
  fi
  sleep 5
done
if "${SYSTEMCTL}" is-active --quiet clawsweeper-orchestrator.service; then
  echo "active run did not drain within 15 minutes; rollback aborted" >&2
  exit 1
fi

exec 9>"${LOCK_PATH}"
flock -w 30 9

# Remove activation enablement while the new unit still exists. This prevents a
# rollback-to-absent from leaving a dangling timers.target.wants symlink.
"${SYSTEMCTL}" disable clawsweeper-orchestrator.timer || true

if [ -d "${STATE_DIR}" ]; then
  mv "${STATE_DIR}" "${STATE_DIR}.failed-${STAMP}"
fi
if [ -n "${STAGED_STATE}" ]; then
  mv "${STAGED_STATE}" "${STATE_DIR}"
fi

for unit in "${ROLLBACK_UNITS[@]}"; do
  if [ -f "${ROLLBACK_EVIDENCE_DIR}/${unit}" ]; then
    cp -a "${ROLLBACK_EVIDENCE_DIR}/${unit}" "${SYSTEMD_DIR}/${unit}"
  elif [ -f "${ROLLBACK_EVIDENCE_DIR}/${unit}.was-absent" ] &&
    [ -e "${SYSTEMD_DIR}/${unit}" ]; then
    mv "${SYSTEMD_DIR}/${unit}" "${BACKUP_DIR}/${unit}.new-removed-${STAMP}"
  fi
  if [ -d "${SYSTEMD_DIR}/${unit}.d" ]; then
    mv "${SYSTEMD_DIR}/${unit}.d" "${BACKUP_DIR}/${unit}.d.failed-${STAMP}"
  fi
  if [ -d "${ROLLBACK_EVIDENCE_DIR}/${unit}.d" ]; then
    cp -a "${ROLLBACK_EVIDENCE_DIR}/${unit}.d" "${SYSTEMD_DIR}/${unit}.d"
  fi
done

if [ -n "${PREVIOUS_TARGET}" ]; then
  ln -s "${PREVIOUS_TARGET}" "${RELEASES_ROOT}/.current-rollback-${STAMP}"
  mv -Tf "${RELEASES_ROOT}/.current-rollback-${STAMP}" "${RELEASES_ROOT}/current"
elif [ -L "${RELEASES_ROOT}/current" ]; then
  mv "${RELEASES_ROOT}/current" "${BACKUP_DIR}/new-current-${STAMP}"
fi
if [ -d "${NEW_TARGET}" ]; then
  mv "${NEW_TARGET}" "${BACKUP_DIR}/failed-release-${STAMP}"
fi
if [ -d "${NEW_STAGE}" ]; then
  mv "${NEW_STAGE}" "${BACKUP_DIR}/failed-stage-${STAMP}"
fi

"${SYSTEMCTL}" daemon-reload
case "${ENABLED_STATE}" in
  enabled)
    "${SYSTEMCTL}" enable clawsweeper-orchestrator.timer
    ;;
  enabled-runtime)
    "${SYSTEMCTL}" enable --runtime clawsweeper-orchestrator.timer
    ;;
  masked)
    "${SYSTEMCTL}" mask clawsweeper-orchestrator.timer
    ;;
  masked-runtime)
    "${SYSTEMCTL}" mask --runtime clawsweeper-orchestrator.timer
    ;;
  disabled)
    "${SYSTEMCTL}" disable clawsweeper-orchestrator.timer
    ;;
  not-found)
    "${SYSTEMCTL}" disable clawsweeper-orchestrator.timer || true
    ;;
esac
if [ "${ACTIVE_STATE}" = "active" ]; then
  "${SYSTEMCTL}" start clawsweeper-orchestrator.timer
else
  "${SYSTEMCTL}" stop clawsweeper-orchestrator.timer || true
fi
printf 'rolled back using %s; failed state preserved beside %s\n' "${BACKUP_DIR}" "${STATE_DIR}"
