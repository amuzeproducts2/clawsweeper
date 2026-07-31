#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

if [ ! -f "${RELEASE_DIR}/REVISION" ] || [ ! -f "${RELEASE_DIR}/MANIFEST.sha256" ]; then
  echo "release is missing REVISION or MANIFEST.sha256" >&2
  exit 1
fi

REVISION="$(tr -d '[:space:]' < "${RELEASE_DIR}/REVISION")"
if [[ ! "${REVISION}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release REVISION is not a full Git commit SHA" >&2
  exit 1
fi

(
  cd "${RELEASE_DIR}"
  sha256sum --check --strict MANIFEST.sha256
  actual="$(find . -type f ! -name MANIFEST.sha256 -print | sort)"
  listed="$(awk '{print $2}' MANIFEST.sha256 | sort)"
  if [ "${actual}" != "${listed}" ]; then
    echo "release contains unmanifested or missing files" >&2
    exit 1
  fi
)

test -s "${RELEASE_DIR}/dist/clawsweeper.js"
test -s "${RELEASE_DIR}/scripts/amuze-fallback-runner.mjs"
test -x "${RELEASE_DIR}/scripts/amuze-orchestrator.sh"
test -x "${RELEASE_DIR}/scripts/install-release.sh"
test -x "${RELEASE_DIR}/scripts/rollback-evidence.sh"
test -x "${RELEASE_DIR}/scripts/rollback-release.sh"
test -x "${RELEASE_DIR}/scripts/smoke-release.mjs"
"${RELEASE_DIR}/scripts/smoke-release.mjs" "${RELEASE_DIR}" >/dev/null

printf 'verified clawsweeper release %s\n' "${REVISION}"
