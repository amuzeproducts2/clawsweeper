#!/usr/bin/env bash

# Shared rollback-evidence helpers. Callers enable strict mode.

ROLLBACK_UNITS=(
  "clawsweeper-orchestrator.service"
  "clawsweeper-orchestrator.timer"
)

rollback_fail() {
  echo "rollback evidence error: $*" >&2
  return 1
}

rollback_safe_relative_path() {
  [[ "$1" =~ ^[A-Za-z0-9._/-]+$ ]] &&
    [[ "$1" != /* ]] &&
    [[ "$1" != "." ]] &&
    [[ "$1" != ".." ]] &&
    [[ "$1" != ../* ]] &&
    [[ "$1" != */../* ]] &&
    [[ "$1" != */.. ]]
}

rollback_read_one_line() {
  local path="$1"
  local value
  [ -f "${path}" ] && [ ! -L "${path}" ] || return 1
  [ "$(wc -l < "${path}")" -eq 1 ] || return 1
  value="$(cat "${path}")"
  [[ "${value}" != *$'\n'* ]] || return 1
  [ -n "${value}" ] || return 1
  printf '%s\n' "${value}"
}

rollback_read_optional_line() {
  local path="$1"
  local value
  [ -f "${path}" ] && [ ! -L "${path}" ] || return 1
  if [ ! -s "${path}" ]; then
    printf '\n'
    return
  fi
  [ "$(wc -l < "${path}")" -eq 1 ] || return 1
  value="$(cat "${path}")"
  [[ "${value}" != *$'\n'* ]] || return 1
  printf '%s\n' "${value}"
}

rollback_validate_absolute_path() {
  [[ "$1" = /* ]] && [ "$1" != "/" ] && [[ "$1" != *$'\n'* ]]
}

rollback_validate_tree_shape() {
  local evidence_dir="$1"
  local active_state
  local enabled_state
  local path_file
  local state_basename
  local state_dir
  local unit
  local value
  local current_listing
  local releases_root
  local new_stage
  local new_target

  for path_file in state-dir releases-root systemd-dir lock-path new-target new-stage; do
    if ! value="$(rollback_read_one_line "${evidence_dir}/${path_file}")" ||
      ! rollback_validate_absolute_path "${value}"; then
      rollback_fail "${path_file} must contain one scoped absolute path"
      return 1
    fi
  done
  releases_root="$(rollback_read_one_line "${evidence_dir}/releases-root")"
  new_target="$(rollback_read_one_line "${evidence_dir}/new-target")"
  new_stage="$(rollback_read_one_line "${evidence_dir}/new-stage")"
  case "${new_target}" in
    "${releases_root}/releases/"*) ;;
    *)
      rollback_fail "new-target is outside the recorded releases directory"
      return 1
      ;;
  esac
  case "${new_stage}" in
    "${releases_root}/releases/."*.staging) ;;
    *)
      rollback_fail "new-stage is outside the recorded releases directory"
      return 1
      ;;
  esac
  if ! rollback_read_optional_line "${evidence_dir}/previous-target" >/dev/null; then
    rollback_fail "previous-target must contain zero or one line"
    return 1
  fi

  if ! enabled_state="$(rollback_read_one_line "${evidence_dir}/timer-enabled-state")"; then
    rollback_fail "timer-enabled-state is missing or malformed"
    return 1
  fi
  case "${enabled_state}" in
    enabled | enabled-runtime | masked | masked-runtime | disabled | not-found) ;;
    *)
      rollback_fail "unsupported timer enabled state: ${enabled_state}"
      return 1
      ;;
  esac
  if ! active_state="$(rollback_read_one_line "${evidence_dir}/timer-active-state")"; then
    rollback_fail "timer-active-state is missing or malformed"
    return 1
  fi
  case "${active_state}" in
    active | inactive) ;;
    *)
      rollback_fail "unsupported timer active state: ${active_state}"
      return 1
      ;;
  esac

  for unit in "${ROLLBACK_UNITS[@]}"; do
    if [ -f "${evidence_dir}/${unit}" ] && [ ! -L "${evidence_dir}/${unit}" ]; then
      [ ! -e "${evidence_dir}/${unit}.was-absent" ] || {
        rollback_fail "${unit} has conflicting present/absent evidence"
        return 1
      }
    elif [ -f "${evidence_dir}/${unit}.was-absent" ] &&
      [ ! -L "${evidence_dir}/${unit}.was-absent" ] &&
      [ ! -s "${evidence_dir}/${unit}.was-absent" ]; then
      [ ! -e "${evidence_dir}/${unit}" ] || {
        rollback_fail "${unit} has conflicting present/absent evidence"
        return 1
      }
    else
      rollback_fail "${unit} is missing complete presence evidence"
      return 1
    fi

    if [ -d "${evidence_dir}/${unit}.d" ] && [ ! -L "${evidence_dir}/${unit}.d" ]; then
      [ ! -e "${evidence_dir}/${unit}.d.was-absent" ] || {
        rollback_fail "${unit}.d has conflicting present/absent evidence"
        return 1
      }
      if [ -n "$(
        find "${evidence_dir}/${unit}.d" \( -type l -o ! -type f ! -type d \) \
          -print -quit
      )" ]; then
        rollback_fail "${unit}.d contains a symlink or special file"
        return 1
      fi
    elif [ -f "${evidence_dir}/${unit}.d.was-absent" ] &&
      [ ! -L "${evidence_dir}/${unit}.d.was-absent" ] &&
      [ ! -s "${evidence_dir}/${unit}.d.was-absent" ]; then
      [ ! -e "${evidence_dir}/${unit}.d" ] || {
        rollback_fail "${unit}.d has conflicting present/absent evidence"
        return 1
      }
    else
      rollback_fail "${unit}.d is missing complete presence evidence"
      return 1
    fi
  done

  if [ -f "${evidence_dir}/state-before.tgz" ] &&
    [ -f "${evidence_dir}/state-before.tgz.sha256" ] &&
    [ -f "${evidence_dir}/state-before.list" ]; then
    [ ! -e "${evidence_dir}/state-was-absent" ] || {
      rollback_fail "state has conflicting present/absent evidence"
      return 1
    }
    if ! (
      cd "${evidence_dir}"
      sha256sum --check --strict state-before.tgz.sha256
    ); then
      rollback_fail "state archive checksum failed"
      return 1
    fi
    current_listing="$(mktemp)"
    if ! tar -tzf "${evidence_dir}/state-before.tgz" > "${current_listing}" ||
      ! cmp "${evidence_dir}/state-before.list" "${current_listing}"; then
      unlink "${current_listing}" 2>/dev/null || true
      rollback_fail "state archive listing failed"
      return 1
    fi
    state_dir="$(rollback_read_one_line "${evidence_dir}/state-dir")"
    state_basename="$(basename "${state_dir}")"
    if ! awk -v root="${state_basename}" '
      $0 ~ /^\// || $0 ~ /(^|\/)\.\.(\/|$)/ { exit 1 }
      $0 == root || $0 == root "/" || index($0, root "/") == 1 { next }
      { exit 1 }
    ' "${current_listing}"; then
      unlink "${current_listing}" 2>/dev/null || true
      rollback_fail "state archive contains an unexpected path"
      return 1
    fi
    unlink "${current_listing}"
  elif [ -f "${evidence_dir}/state-was-absent" ] &&
    [ ! -L "${evidence_dir}/state-was-absent" ] &&
    [ ! -s "${evidence_dir}/state-was-absent" ]; then
    [ ! -e "${evidence_dir}/state-before.tgz" ] &&
      [ ! -e "${evidence_dir}/state-before.tgz.sha256" ] &&
      [ ! -e "${evidence_dir}/state-before.list" ] || {
      rollback_fail "state has conflicting present/absent evidence"
      return 1
    }
  else
    rollback_fail "state rollback evidence is incomplete"
    return 1
  fi
}

rollback_emit_layout() {
  local evidence_dir="$1"
  local output="$2"
  local kind
  local mode
  local relative
  local unit
  local -a paths=(
    previous-target
    timer-enabled-state
    timer-active-state
    state-dir
    releases-root
    systemd-dir
    lock-path
    new-target
    new-stage
  )

  for unit in "${ROLLBACK_UNITS[@]}"; do
    if [ -f "${evidence_dir}/${unit}" ]; then
      paths+=("${unit}")
    else
      paths+=("${unit}.was-absent")
    fi
    if [ -d "${evidence_dir}/${unit}.d" ]; then
      while IFS= read -r relative; do
        paths+=("${relative}")
      done < <(
        cd "${evidence_dir}"
        find "${unit}.d" -mindepth 0 -printf '%P\n' |
          awk -v root="${unit}.d" '{ print $0 == "" ? root : root "/" $0 }'
      )
    else
      paths+=("${unit}.d.was-absent")
    fi
  done
  if [ -f "${evidence_dir}/state-before.tgz" ]; then
    paths+=(state-before.tgz state-before.tgz.sha256 state-before.list)
  else
    paths+=(state-was-absent)
  fi

  : > "${output}"
  while IFS= read -r relative; do
    rollback_safe_relative_path "${relative}" || {
      rollback_fail "unsafe rollback path: ${relative}"
      return 1
    }
    if [ -d "${evidence_dir}/${relative}" ] && [ ! -L "${evidence_dir}/${relative}" ]; then
      kind="d"
    elif [ -f "${evidence_dir}/${relative}" ] && [ ! -L "${evidence_dir}/${relative}" ]; then
      kind="f"
    else
      rollback_fail "unsupported rollback artifact: ${relative}"
      return 1
    fi
    mode="$(stat -c '%a' "${evidence_dir}/${relative}")"
    printf '%s\t%s\t%s\n' "${kind}" "${mode}" "${relative}" >> "${output}"
  done < <(printf '%s\n' "${paths[@]}" | LC_ALL=C sort -u)
}

rollback_write_manifest() {
  local evidence_dir="$1"
  local kind
  local mode
  local relative
  local temporary_layout="${evidence_dir}/rollback-layout.tsv.tmp"
  local temporary_manifest="${evidence_dir}/rollback-manifest.sha256.tmp"

  rollback_validate_tree_shape "${evidence_dir}"
  rollback_emit_layout "${evidence_dir}" "${temporary_layout}"
  mv "${temporary_layout}" "${evidence_dir}/rollback-layout.tsv"
  (
    cd "${evidence_dir}"
    sha256sum -- rollback-layout.tsv
    while IFS=$'\t' read -r kind mode relative; do
      if [ "${kind}" = "f" ]; then
        sha256sum -- "${relative}"
      fi
    done < rollback-layout.tsv
  ) > "${temporary_manifest}"
  mv "${temporary_manifest}" "${evidence_dir}/rollback-manifest.sha256"
  sha256sum "${evidence_dir}/rollback-manifest.sha256" |
    awk '{ print $1 }' > "${evidence_dir}/rollback-manifest.sha256.digest"
}

rollback_verify_manifest_files() {
  local evidence_dir="$1"
  local actual_digest
  local actual_kind
  local actual_manifest
  local actual_mode
  local digest
  local expected_manifest
  local kind
  local mode
  local relative

  [ -f "${evidence_dir}/rollback-layout.tsv" ] &&
    [ ! -L "${evidence_dir}/rollback-layout.tsv" ] &&
    [ -f "${evidence_dir}/rollback-manifest.sha256" ] &&
    [ ! -L "${evidence_dir}/rollback-manifest.sha256" ] &&
    [ -f "${evidence_dir}/rollback-manifest.sha256.digest" ] &&
    [ ! -L "${evidence_dir}/rollback-manifest.sha256.digest" ] || {
    rollback_fail "rollback manifest files are missing or unsafe"
    return 1
  }
  digest="$(cat "${evidence_dir}/rollback-manifest.sha256.digest")"
  [[ "${digest}" =~ ^[0-9a-f]{64}$ ]] || {
    rollback_fail "rollback manifest digest is malformed"
    return 1
  }
  if ! actual_digest="$(
    sha256sum "${evidence_dir}/rollback-manifest.sha256" | awk '{ print $1 }'
  )"; then
    rollback_fail "rollback manifest digest calculation failed"
    return 1
  fi
  if [[ "${actual_digest}" != "${digest}" ]]; then
    rollback_fail "rollback manifest digest verification failed"
    return 1
  fi
  if ! (
    cd "${evidence_dir}"
    sha256sum --check --strict rollback-manifest.sha256
  ); then
    rollback_fail "rollback artifact checksum verification failed"
    return 1
  fi

  expected_manifest="$(mktemp)"
  actual_manifest="$(mktemp)"
  {
    printf 'rollback-layout.tsv\n'
    awk -F '\t' '$1 == "f" { print $3 }' "${evidence_dir}/rollback-layout.tsv"
  } | LC_ALL=C sort -u > "${expected_manifest}"
  awk '{ print $2 }' "${evidence_dir}/rollback-manifest.sha256" |
    sed 's/^\*//' |
    LC_ALL=C sort -u > "${actual_manifest}"
  if ! cmp "${expected_manifest}" "${actual_manifest}"; then
    unlink "${expected_manifest}" 2>/dev/null || true
    unlink "${actual_manifest}" 2>/dev/null || true
    rollback_fail "rollback manifest membership differs from its layout"
    return 1
  fi
  unlink "${expected_manifest}"
  unlink "${actual_manifest}"

  while IFS=$'\t' read -r kind mode relative; do
    rollback_safe_relative_path "${relative}" || {
      rollback_fail "rollback layout contains an unsafe path"
      return 1
    }
    case "${kind}" in
      f)
        [ -f "${evidence_dir}/${relative}" ] &&
          [ ! -L "${evidence_dir}/${relative}" ] || {
          rollback_fail "rollback file is missing or unsafe: ${relative}"
          return 1
        }
        actual_kind="f"
        ;;
      d)
        [ -d "${evidence_dir}/${relative}" ] &&
          [ ! -L "${evidence_dir}/${relative}" ] || {
          rollback_fail "rollback directory is missing or unsafe: ${relative}"
          return 1
        }
        actual_kind="d"
        ;;
      *)
        rollback_fail "rollback layout contains an unsupported type"
        return 1
        ;;
    esac
    [ "${actual_kind}" = "${kind}" ] || return 1
    actual_mode="$(stat -c '%a' "${evidence_dir}/${relative}")"
    if [ "${actual_mode}" != "${mode}" ]; then
      rollback_fail "rollback artifact mode differs: ${relative}"
      return 1
    fi
  done < "${evidence_dir}/rollback-layout.tsv"
}

rollback_stage_and_verify() {
  local evidence_dir="$1"
  local kind
  local mode
  local relative
  local stage_dir
  local stage_root

  rollback_verify_manifest_files "${evidence_dir}"
  rollback_validate_tree_shape "${evidence_dir}"
  stage_root="$(mktemp -d)"
  stage_dir="${stage_root}/evidence"
  install -d -m 0700 "${stage_dir}"
  while IFS=$'\t' read -r kind mode relative; do
    case "${kind}" in
      d)
        install -d -m "${mode}" "${stage_dir}/${relative}"
        ;;
      f)
        install -D -m "${mode}" "${evidence_dir}/${relative}" "${stage_dir}/${relative}"
        ;;
    esac
  done < "${evidence_dir}/rollback-layout.tsv"
  install -m 0600 \
    "${evidence_dir}/rollback-layout.tsv" \
    "${evidence_dir}/rollback-manifest.sha256" \
    "${evidence_dir}/rollback-manifest.sha256.digest" \
    "${stage_dir}/"
  rollback_verify_manifest_files "${stage_dir}"
  rollback_validate_tree_shape "${stage_dir}"
  ROLLBACK_EVIDENCE_STAGE_ROOT="${stage_root}"
  ROLLBACK_EVIDENCE_DIR="${stage_dir}"
}
