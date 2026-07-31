#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:?usage: build-release.sh OUTPUT_DIR}"
REVISION="$(git -C "${ROOT}" rev-parse HEAD)"

if [ -n "$(git -C "${ROOT}" status --porcelain --untracked-files=all)" ]; then
  echo "refusing to package a dirty worktree" >&2
  exit 1
fi
if [[ ! "${REVISION}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "source revision is not a full Git commit SHA" >&2
  exit 1
fi

pnpm --dir "${ROOT}" run build

install -d -m 0755 \
  "${OUTPUT_DIR}/config" \
  "${OUTPUT_DIR}/dist" \
  "${OUTPUT_DIR}/prompts" \
  "${OUTPUT_DIR}/schema" \
  "${OUTPUT_DIR}/scripts" \
  "${OUTPUT_DIR}/systemd"
cp -a "${ROOT}/config/." "${OUTPUT_DIR}/config/"
cp -a "${ROOT}/dist/." "${OUTPUT_DIR}/dist/"
cp -a "${ROOT}/prompts/." "${OUTPUT_DIR}/prompts/"
cp -a "${ROOT}/schema/." "${OUTPUT_DIR}/schema/"
install -m 0644 "${ROOT}/scripts/amuze-fallback-runner.mjs" "${OUTPUT_DIR}/scripts/"
install -m 0755 \
  "${ROOT}/scripts/amuze-orchestrator.sh" \
  "${ROOT}/scripts/install-release.sh" \
  "${ROOT}/scripts/rollback-evidence.sh" \
  "${ROOT}/scripts/rollback-release.sh" \
  "${ROOT}/scripts/smoke-release.mjs" \
  "${ROOT}/scripts/verify-release.sh" \
  "${OUTPUT_DIR}/scripts/"
install -m 0644 "${ROOT}"/systemd/clawsweeper-orchestrator.* "${OUTPUT_DIR}/systemd/"
printf '%s\n' "${REVISION}" > "${OUTPUT_DIR}/REVISION"

(
  cd "${OUTPUT_DIR}"
  find . -type f ! -name MANIFEST.sha256 -print0 |
    sort -z |
    xargs -0 sha256sum > MANIFEST.sha256
)

"${OUTPUT_DIR}/scripts/verify-release.sh" "${OUTPUT_DIR}"
