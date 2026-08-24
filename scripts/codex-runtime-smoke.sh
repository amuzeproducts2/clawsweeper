#!/usr/bin/env bash
set -euo pipefail

RELEASE_ROOT="${1:?usage: codex-runtime-smoke.sh RELEASE_ROOT STATE_DIR HEALTHCHECK_METRICS_PATH}"
STATE_DIR="${2:?usage: codex-runtime-smoke.sh RELEASE_ROOT STATE_DIR HEALTHCHECK_METRICS_PATH}"
HEALTHCHECK_METRICS_PATH="${3:?usage: codex-runtime-smoke.sh RELEASE_ROOT STATE_DIR HEALTHCHECK_METRICS_PATH}"
CODEX_BIN="${CLAWSWEEPER_CODEX_BIN:-/usr/bin/codex}"
NODE_BIN="${CLAWSWEEPER_NODE_BIN:-node}"
EXPECTED="CLAWSWEEPER_CODEX_RUNTIME_OK"
OUTPUT_PATH="${STATE_DIR}/codex-runtime-smoke.txt"
LOG_PATH="${STATE_DIR}/codex-runtime-smoke.log"
FAILED_LOG_PATH="${STATE_DIR}/codex-runtime-smoke.failed.log"
EVENTS_PATH="${STATE_DIR}/codex-runtime-smoke.events.jsonl"
FAILED_EVENTS_PATH="${STATE_DIR}/codex-runtime-smoke.failed.events.jsonl"
METRICS_TMP="${HEALTHCHECK_METRICS_PATH}.tmp.$$"

cleanup() {
  rm -f "${OUTPUT_PATH}" "${LOG_PATH}" "${EVENTS_PATH}" "${METRICS_TMP}"
}
trap cleanup EXIT

preserve_failure_evidence() {
  if [ -f "${LOG_PATH}" ]; then
    chmod 0600 "${LOG_PATH}"
    mv -f "${LOG_PATH}" "${FAILED_LOG_PATH}"
  fi
  if [ -f "${EVENTS_PATH}" ]; then
    chmod 0600 "${EVENTS_PATH}"
    mv -f "${EVENTS_PATH}" "${FAILED_EVENTS_PATH}"
  fi
}

response_is_exact() {
  printf '%s' "${EXPECTED}" | cmp -s - "${OUTPUT_PATH}" ||
    printf '%s\n' "${EXPECTED}" | cmp -s - "${OUTPUT_PATH}"
}

events_prove_shell_probe() {
  "${NODE_BIN}" -e '
const { readFileSync } = require("node:fs");
const acceptedCommands = new Set([
  "test -r /proc/sys/kernel/overflowuid",
  "/bin/bash -lc '\''test -r /proc/sys/kernel/overflowuid'\''",
]);
let probeSucceeded = false;
let turnCompleted = false;
try {
  for (const line of readFileSync(process.argv[1], "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "turn.completed") turnCompleted = true;
    if (
      event.type === "item.completed" &&
      event.item?.type === "command_execution" &&
      event.item?.status === "completed" &&
      event.item?.exit_code === 0 &&
      acceptedCommands.has(event.item?.command)
    ) {
      probeSucceeded = true;
    }
  }
} catch {
  process.exit(1);
}
process.exit(probeSucceeded && turnCompleted ? 0 : 1);
' "${EVENTS_PATH}"
}

test -d "${RELEASE_ROOT}"
install -d -m 0700 "${STATE_DIR}"
if [[ "${CODEX_BIN}" == */* ]]; then
  test -x "${CODEX_BIN}"
else
  command -v "${CODEX_BIN}" >/dev/null
fi
if [[ "${NODE_BIN}" == */* ]]; then
  test -x "${NODE_BIN}"
else
  command -v "${NODE_BIN}" >/dev/null
fi

if ! env \
  -u GH_TOKEN \
  -u GITHUB_TOKEN \
  -u OPENAI_API_KEY \
  -u CODEX_API_KEY \
  -u CLAWSWEEPER_INTERNAL_MODEL \
  "${CODEX_BIN}" exec \
  -c 'approval_policy="never"' \
  --skip-git-repo-check \
  -C "${RELEASE_ROOT}" \
  --output-last-message "${OUTPUT_PATH}" \
  --sandbox read-only \
  --json \
  "Use the shell tool to run test -r /proc/sys/kernel/overflowuid. Reply with exactly ${EXPECTED} and nothing else only after the command succeeds." \
  >"${EVENTS_PATH}" 2>"${LOG_PATH}"; then
  preserve_failure_evidence
  echo "Codex runtime smoke could not initialize a review session" >&2
  exit 1
fi

if [ ! -f "${OUTPUT_PATH}" ] || ! response_is_exact || ! events_prove_shell_probe; then
  preserve_failure_evidence
  echo "Codex runtime smoke did not prove a successful sandboxed shell probe" >&2
  exit 1
fi

rm -f "${FAILED_LOG_PATH}" "${FAILED_EVENTS_PATH}"

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
