#!/usr/bin/env bash
set -euo pipefail

PATH="/opt/clawsweeper-node-v24.18.0/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

RELEASE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${CLAWSWEEPER_STATE_DIR:-/root/.openclaw/state/clawsweeper-orchestrator}"
HISTORY_PATH="${CLAWSWEEPER_HISTORY_PATH:-${STATE_DIR}/run-history.jsonl}"
LOCK_PATH="${CLAWSWEEPER_LOCK_PATH:-/tmp/openclaw-repo-maintenance-orchestrator.lock}"
MAX_ITEMS="${REPO_MAINTENANCE_MAX_ITEMS:-10}"
MAX_ITEMS_PER_REPO="${REPO_MAINTENANCE_MAX_ITEMS_PER_REPO:-1}"
MAX_PAGES="${REPO_MAINTENANCE_MAX_PAGES:-5}"
MAX_ACTIONS="${REPO_MAINTENANCE_MAX_ACTIONS:-2}"
MAX_RUNTIME_SECONDS="${REPO_MAINTENANCE_MAX_RUNTIME_SECONDS:-780}"
PLAN_LOOKAHEAD="${REPO_MAINTENANCE_PLAN_LOOKAHEAD:-20}"

export CLAWSWEEPER_ARTIFACT_ROOT="${CLAWSWEEPER_ARTIFACT_ROOT:-${STATE_DIR}/artifacts}"
export CLAWSWEEPER_TARGET_ROOT="${CLAWSWEEPER_TARGET_ROOT:-${STATE_DIR}/targets}"
export CLAWSWEEPER_SCHEDULER_STATE_PATH="${CLAWSWEEPER_SCHEDULER_STATE_PATH:-${STATE_DIR}/scheduler-state.json}"
export CLAWSWEEPER_RUNTIME_STATE_DIR="${CLAWSWEEPER_RUNTIME_STATE_DIR:-${STATE_DIR}/xdg-state}"
export CLAWSWEEPER_RUNTIME_CONFIG_DIR="${CLAWSWEEPER_RUNTIME_CONFIG_DIR:-${STATE_DIR}/xdg-config}"
export CLAWSWEEPER_RUNTIME_CACHE_DIR="${CLAWSWEEPER_RUNTIME_CACHE_DIR:-${STATE_DIR}/xdg-cache}"
export CLAWSWEEPER_GIT_CONFIG_PATH="${CLAWSWEEPER_GIT_CONFIG_PATH:-${STATE_DIR}/gitconfig}"
export CODEX_HOME="/root/.codex"
export CLAWSWEEPER_METRICS_PATH="${CLAWSWEEPER_METRICS_PATH:-/var/lib/node_exporter/textfile_collector/clawsweeper_orchestrator.prom}"
export CLAWSWEEPER_HEALTHCHECK_METRICS_PATH="${CLAWSWEEPER_HEALTHCHECK_METRICS_PATH:-/var/lib/node_exporter/textfile_collector/clawsweeper_healthcheck.prom}"
export CLAWSWEEPER_SECURITY_ALERTS_JSON="${CLAWSWEEPER_SECURITY_ALERTS_JSON:-/var/lib/node_exporter/textfile_collector/openclaw_github_watchdog.json}"
export CLAWSWEEPER_RECEIPT_FILE="${CLAWSWEEPER_RECEIPT_FILE:-/var/lib/incidentd/spool/receipts.jsonl}"
if [ ! -x "${RELEASE_ROOT}/scripts/verify-release.sh" ]; then
  printf '{"status":"failed","processed":0,"summary":[{"error":"missing release verifier"}]}\n'
  exit 1
fi
"${RELEASE_ROOT}/scripts/verify-release.sh" "${RELEASE_ROOT}"
export CLAWSWEEPER_RELEASE_REVISION="${CLAWSWEEPER_RELEASE_REVISION:-$(tr -d '[:space:]' < "${RELEASE_ROOT}/REVISION")}"

export CLAWSWEEPER_AUTOREPAIR="${CLAWSWEEPER_AUTOREPAIR:-1}"
export CLAWSWEEPER_AUTOREPAIR_MAX_ATTEMPTS_PER_HEAD="${CLAWSWEEPER_AUTOREPAIR_MAX_ATTEMPTS_PER_HEAD:-1}"
export CLAWSWEEPER_AUTOREPAIR_MAX_FILES="${CLAWSWEEPER_AUTOREPAIR_MAX_FILES:-20}"
export CLAWSWEEPER_AUTOREPAIR_MAX_LINES="${CLAWSWEEPER_AUTOREPAIR_MAX_LINES:-800}"
export CLAWSWEEPER_AUTOMERGE_DEPENDABOT="${CLAWSWEEPER_AUTOMERGE_DEPENDABOT:-1}"
export CLAWSWEEPER_AUTOMERGE_MACROSCOPE_LOW_RISK="${CLAWSWEEPER_AUTOMERGE_MACROSCOPE_LOW_RISK:-1}"
export CLAWSWEEPER_AUTOMERGE_ADMIN="${CLAWSWEEPER_AUTOMERGE_ADMIN:-1}"
export CLAWSWEEPER_REQUIRE_MACROSCOPE_APPROVAL="${CLAWSWEEPER_REQUIRE_MACROSCOPE_APPROVAL:-1}"
export CLAWSWEEPER_AUTOMERGE_MACROSCOPE_MAX_FILES="${CLAWSWEEPER_AUTOMERGE_MACROSCOPE_MAX_FILES:-8}"
export CLAWSWEEPER_AUTOMERGE_MACROSCOPE_MAX_LINES="${CLAWSWEEPER_AUTOMERGE_MACROSCOPE_MAX_LINES:-400}"
export CLAWSWEEPER_AUTOMERGE_MAX_FILES="${CLAWSWEEPER_AUTOMERGE_MAX_FILES:-6}"
export CLAWSWEEPER_AUTOMERGE_MAX_LINES="${CLAWSWEEPER_AUTOMERGE_MAX_LINES:-500}"
export CLAWSWEEPER_ENABLE_CODEX_REVIEW="${CLAWSWEEPER_ENABLE_CODEX_REVIEW:-1}"
export CLAWSWEEPER_ALLOW_AGENT_APPROVAL_FALLBACK="${CLAWSWEEPER_ALLOW_AGENT_APPROVAL_FALLBACK:-1}"
export CLAWSWEEPER_AUTOMERGE_MAX_ATTEMPTS_PER_HEAD="${CLAWSWEEPER_AUTOMERGE_MAX_ATTEMPTS_PER_HEAD:-3}"
export CLAWSWEEPER_MAX_ITEMS_PER_REPO="${CLAWSWEEPER_MAX_ITEMS_PER_REPO:-${MAX_ITEMS_PER_REPO}}"
RUNNER_MODE_ARGS=()
INSTALL_SMOKE=0
if [ -f "${STATE_DIR}/.install-smoke" ]; then
  INSTALL_SMOKE=1
  RUNNER_MODE_ARGS+=(--healthcheck)
fi

install -d -m 0700 \
  "${STATE_DIR}" \
  "${CLAWSWEEPER_ARTIFACT_ROOT}" \
  "${CLAWSWEEPER_TARGET_ROOT}" \
  "${CLAWSWEEPER_RUNTIME_STATE_DIR}" \
  "${CLAWSWEEPER_RUNTIME_CONFIG_DIR}" \
  "${CLAWSWEEPER_RUNTIME_CACHE_DIR}"

append_history() {
  local status="$1"
  local exit_code="$2"
  local output="$3"
  node -e '
const fs = require("fs");
const [path, status, exitCode] = process.argv.slice(1);
const output = fs.readFileSync(0, "utf8");
let parsed = null;
try { parsed = JSON.parse(output); } catch {}
fs.appendFileSync(path, JSON.stringify({
  at: new Date().toISOString(),
  status,
  exitCode: Number(exitCode),
  releaseRevision: process.env.CLAWSWEEPER_RELEASE_REVISION,
  processed: parsed?.processed ?? null,
  eligibleItems: parsed?.eligibleItems ?? null,
  actionItems: parsed?.actionItems ?? null,
  progress: parsed?.progress ?? null,
	  unchangedReviewSkips: parsed?.unchangedReviewSkips ?? null,
	  unownedSecurityAlerts: parsed?.unownedSecurityAlerts ?? null,
	  securityCoverageFailures: parsed?.securityCoverageFailures ?? null,
	  expectedSecurityCoverageGaps: parsed?.expectedSecurityCoverageGaps ?? null,
	  planFailures: parsed?.planFailures ?? null,
	  reviewAttempts: parsed?.reviewAttempts ?? null,
	  reviewFailures: parsed?.reviewFailures ?? null,
	  repositoriesVisited: parsed?.repositoriesVisited ?? null,
  noProgressStreak: parsed?.noProgressStreak ?? null,
  maxRepoServiceAgeSeconds: parsed?.maxRepoServiceAgeSeconds ?? null,
  cursorRepo: parsed?.cursorRepo ?? null,
  attemptCursorRepo: parsed?.attemptCursorRepo ?? null,
  summary: Array.isArray(parsed?.summary) ? parsed.summary : null,
  output: parsed ? undefined : String(output).slice(0, 8000)
}) + "\n");
' "${HISTORY_PATH}" "${status}" "${exit_code}" <<<"${output}"
  if [ -f "${HISTORY_PATH}" ] && [ "$(wc -c < "${HISTORY_PATH}")" -gt 10485760 ]; then
    tail -n 1000 "${HISTORY_PATH}" > "${HISTORY_PATH}.tmp"
    mv "${HISTORY_PATH}.tmp" "${HISTORY_PATH}"
  fi
}

exec 9>"${LOCK_PATH}"
if ! flock -n 9; then
  printf '{"status":"skipped_lock","processed":0,"summary":[]}\n'
  exit 0
fi

if [ ! -f "${RELEASE_ROOT}/scripts/amuze-fallback-runner.mjs" ] ||
  [ ! -f "${RELEASE_ROOT}/dist/clawsweeper.js" ]; then
  printf '{"status":"failed","processed":0,"summary":[{"error":"missing release runtime"}]}\n'
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v gh >/dev/null 2>&1; then
  printf '{"status":"failed","processed":0,"summary":[{"error":"node or gh unavailable"}]}\n'
  exit 1
fi

unset GH_TOKEN
if [ -f "/root/.openclaw/credentials/github-jaywillingham.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "/root/.openclaw/credentials/github-jaywillingham.env"
  set +a
fi
if [ -n "${GITHUB_TOKEN:-}" ]; then
  export GH_TOKEN="${GITHUB_TOKEN}"
fi

XDG_STATE_HOME="${CLAWSWEEPER_RUNTIME_STATE_DIR}" \
  XDG_CONFIG_HOME="${CLAWSWEEPER_RUNTIME_CONFIG_DIR}" \
  XDG_CACHE_HOME="${CLAWSWEEPER_RUNTIME_CACHE_DIR}" \
  GIT_CONFIG_GLOBAL="${CLAWSWEEPER_GIT_CONFIG_PATH}" \
  gh auth setup-git

set +e
output="$(
  cd "${RELEASE_ROOT}" &&
    XDG_STATE_HOME="${CLAWSWEEPER_RUNTIME_STATE_DIR}" \
      XDG_CONFIG_HOME="${CLAWSWEEPER_RUNTIME_CONFIG_DIR}" \
      XDG_CACHE_HOME="${CLAWSWEEPER_RUNTIME_CACHE_DIR}" \
      GIT_CONFIG_GLOBAL="${CLAWSWEEPER_GIT_CONFIG_PATH}" \
      node scripts/amuze-fallback-runner.mjs \
      --max-items "${MAX_ITEMS}" \
      --max-items-per-repo "${MAX_ITEMS_PER_REPO}" \
      --max-pages "${MAX_PAGES}" \
      --max-actions "${MAX_ACTIONS}" \
      --max-runtime-seconds "${MAX_RUNTIME_SECONDS}" \
      --plan-lookahead "${PLAN_LOOKAHEAD}" \
      "${RUNNER_MODE_ARGS[@]}" 2>&1
)"
exit_code=$?
set -e

if [ "${exit_code}" -eq 0 ] && [ "${INSTALL_SMOKE}" -eq 1 ]; then
  if ! "${RELEASE_ROOT}/scripts/codex-runtime-smoke.sh" \
    "${RELEASE_ROOT}" \
    "${STATE_DIR}" \
    "${CLAWSWEEPER_HEALTHCHECK_METRICS_PATH}"; then
    exit_code=1
    output='{"status":"failed","processed":0,"summary":[{"error":"Codex runtime smoke failed"}]}'
  fi
fi

if [ "${exit_code}" -eq 0 ]; then
  append_history "ok" "${exit_code}" "${output}"
else
  append_history "failed" "${exit_code}" "${output}"
fi

printf '%s\n' "${output}"
exit "${exit_code}"
