#!/usr/bin/env bash
set -euo pipefail

RELEASE_ROOT="${1:?usage: codex-runtime-smoke.sh RELEASE_ROOT STATE_DIR HEALTHCHECK_METRICS_PATH}"
STATE_DIR="${2:?usage: codex-runtime-smoke.sh RELEASE_ROOT STATE_DIR HEALTHCHECK_METRICS_PATH}"
HEALTHCHECK_METRICS_PATH="${3:?usage: codex-runtime-smoke.sh RELEASE_ROOT STATE_DIR HEALTHCHECK_METRICS_PATH}"
CODEX_BIN="${CLAWSWEEPER_CODEX_BIN:-/usr/bin/codex}"
EXPECTED="CLAWSWEEPER_CODEX_RUNTIME_OK"
OUTPUT_PATH="${STATE_DIR}/codex-runtime-smoke.txt"
LOG_PATH="${STATE_DIR}/codex-runtime-smoke.log"
FAILED_LOG_PATH="${STATE_DIR}/codex-runtime-smoke.failed.log"
METRICS_TMP="${HEALTHCHECK_METRICS_PATH}.tmp.$$"

cleanup() {
  rm -f "${OUTPUT_PATH}" "${LOG_PATH}" "${METRICS_TMP}"
}
trap cleanup EXIT

preserve_failure_log() {
  if [ -f "${LOG_PATH}" ]; then
    chmod 0600 "${LOG_PATH}"
    mv -f "${LOG_PATH}" "${FAILED_LOG_PATH}"
  fi
}

response_is_exact() {
  printf '%s' "${EXPECTED}" | cmp -s - "${OUTPUT_PATH}" ||
    printf '%s\n' "${EXPECTED}" | cmp -s - "${OUTPUT_PATH}"
}

test -d "${RELEASE_ROOT}"
install -d -m 0700 "${STATE_DIR}"
if [[ "${CODEX_BIN}" == */* ]]; then
  test -x "${CODEX_BIN}"
else
  command -v "${CODEX_BIN}" >/dev/null
fi

if ! env \
  -u GH_TOKEN \
  -u GITHUB_TOKEN \
  -u OPENAI_API_KEY \
  -u CODEX_API_KEY \
  -u CLAWSWEEPER_INTERNAL_MODEL \
  "${CODEX_BIN}" exec \
  -c 'approval_policy="never"' \
  -C "${RELEASE_ROOT}" \
  --output-last-message "${OUTPUT_PATH}" \
  --sandbox read-only \
  "Reply with exactly ${EXPECTED} and nothing else." \
  >"${LOG_PATH}" 2>&1; then
  preserve_failure_log
  echo "Codex runtime smoke could not initialize a review session" >&2
  exit 1
fi

if [ ! -f "${OUTPUT_PATH}" ] || ! response_is_exact; then
  preserve_failure_log
  echo "Codex runtime smoke returned an unexpected response" >&2
  exit 1
fi

rm -f "${FAILED_LOG_PATH}"

test -f "${HEALTHCHECK_METRICS_PATH}"
awk '
  $1 == "#" && ($2 == "HELP" || $2 == "TYPE") &&
    ($3 == "clawsweeper_healthcheck_codex_runtime_success" ||
     $3 == "clawsweeper_healthcheck_codex_runtime_timestamp_seconds") { next }
  $1 == "clawsweeper_healthcheck_codex_runtime_success" ||
    $1 == "clawsweeper_healthcheck_codex_runtime_timestamp_seconds" { next }
  { print }
' "${HEALTHCHECK_METRICS_PATH}" > "${METRICS_TMP}"
cat >> "${METRICS_TMP}" <<EOF
# HELP clawsweeper_healthcheck_codex_runtime_success 1 when the install smoke created a Codex session in the production sandbox.
# TYPE clawsweeper_healthcheck_codex_runtime_success gauge
clawsweeper_healthcheck_codex_runtime_success 1
# HELP clawsweeper_healthcheck_codex_runtime_timestamp_seconds Unix timestamp of the last successful install-only Codex runtime smoke.
# TYPE clawsweeper_healthcheck_codex_runtime_timestamp_seconds gauge
clawsweeper_healthcheck_codex_runtime_timestamp_seconds $(date -u +%s)
EOF
chmod 0644 "${METRICS_TMP}"
mv "${METRICS_TMP}" "${HEALTHCHECK_METRICS_PATH}"
