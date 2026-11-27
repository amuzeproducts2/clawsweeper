#!/usr/bin/env bash
# Classify a pull request by its changed paths, read one per line from stdin.
# Prints "docs" only when every path is documentation that no build, test or release
# step reads; prints "code" for anything else, including an empty or unreadable list.
set -euo pipefail

scope=docs
seen=0
while IFS= read -r changed || [ -n "${changed}" ]; do
  [ -n "${changed}" ] || continue
  seen=1
  case "${changed}" in
    *..*) scope=code ;;
    docs/* | README.md | CHANGELOG.md | LICENSE) ;;
    *) scope=code ;;
  esac
done
if [ "${seen}" -eq 0 ]; then
  scope=code
fi
printf '%s\n' "${scope}"
