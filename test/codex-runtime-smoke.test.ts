import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const smokeScript = new URL("../scripts/codex-runtime-smoke.sh", import.meta.url);

function fixture(mode: "ok" | "wrong" | "split" | "extra-lines" | "sandbox-fail" | "fail") {
  const root = mkdtempSync(join(tmpdir(), "clawsweeper-codex-runtime-smoke-"));
  const stateDir = join(root, "state");
  const metricsPath = join(root, "health.prom");
  const fakeCodex = join(root, "codex");
  writeFileSync(metricsPath, "clawsweeper_healthcheck_success 1\n");
  writeFileSync(
    fakeCodex,
    `#!/usr/bin/env bash
set -euo pipefail
if [ -n "\${GH_TOKEN:-}\${GITHUB_TOKEN:-}\${OPENAI_API_KEY:-}\${CODEX_API_KEY:-}" ]; then
  exit 91
fi
case "\${1:-}" in
  sandbox)
    [ "\${2:-}" = "linux" ]
    shift 2
    landlock_config=0
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "-c" ]; then
        [ "$2" = "features.use_legacy_landlock=true" ] && landlock_config=1
        shift 2
        continue
      fi
      break
    done
    [ "$landlock_config" -eq 1 ]
    [ "$#" -eq 3 ]
    [ "$1" = "/usr/bin/test" ]
    [ "$2" = "-r" ]
    [ "$3" = "/proc/sys/kernel/overflowuid" ]
    if [ "${mode}" = "sandbox-fail" ]; then
      printf 'fake sandbox failure\n' >&2
      exit 17
    fi
    ;;
  exec)
    shift
    output=""
    skip_git_check=0
    ignore_user_config=0
    ignore_rules=0
    ephemeral=0
    landlock_config=0
    web_search_disabled=0
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --output-last-message) output="$2"; shift 2; continue ;;
        --skip-git-repo-check) skip_git_check=1 ;;
        --ignore-user-config) ignore_user_config=1 ;;
        --ignore-rules) ignore_rules=1 ;;
        --ephemeral) ephemeral=1 ;;
        -c)
          [ "$2" = "features.use_legacy_landlock=true" ] && landlock_config=1
          [ "$2" = 'web_search="disabled"' ] && web_search_disabled=1
          shift 2
          continue
          ;;
      esac
      shift
    done
    [ -n "$output" ]
    [ "$skip_git_check" -eq 1 ]
    [ "$ignore_user_config" -eq 1 ]
    [ "$ignore_rules" -eq 1 ]
    [ "$ephemeral" -eq 1 ]
    [ "$landlock_config" -eq 1 ]
    [ "$web_search_disabled" -eq 1 ]
    case "${mode}" in
      ok) printf 'CLAWSWEEPER_CODEX_RUNTIME_OK\n' > "$output" ;;
      wrong) printf 'WRONG\n' > "$output" ;;
      split) printf 'CLAWSWEEPER_CODEX_\nRUNTIME_OK\n' > "$output" ;;
      extra-lines) printf 'CLAWSWEEPER_CODEX_RUNTIME_OK\n\n' > "$output" ;;
      fail) printf 'fake codex failure\n' >&2; exit 17 ;;
      *) printf 'unexpected fake mode\n' >&2; exit 18 ;;
    esac
    ;;
  *) printf 'unexpected codex command\n' >&2; exit 19 ;;
esac
`,
  );
  chmodSync(fakeCodex, 0o755);
  return { fakeCodex, metricsPath, root, stateDir };
}

test("Codex runtime smoke proves session execution without passing secret-bearing env", () => {
  const { fakeCodex, metricsPath, root, stateDir } = fixture("ok");
  const result = spawnSync("/usr/bin/bash", [smokeScript.pathname, root, stateDir, metricsPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAWSWEEPER_CODEX_BIN: fakeCodex,
      GH_TOKEN: "github-secret",
      GITHUB_TOKEN: "github-secret",
      OPENAI_API_KEY: "api-secret",
      CODEX_API_KEY: "codex-secret",
    },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(
    readFileSync(metricsPath, "utf8"),
    /clawsweeper_healthcheck_codex_runtime_success 1/,
  );
  assert.equal(existsSync(join(stateDir, "codex-runtime-smoke.txt")), false);
});

test("Codex runtime smoke replaces its metric families on repeated success", () => {
  const { fakeCodex, metricsPath, root, stateDir } = fixture("ok");
  writeFileSync(
    metricsPath,
    `clawsweeper_healthcheck_success 1
# HELP clawsweeper_healthcheck_codex_runtime_success stale help
# TYPE clawsweeper_healthcheck_codex_runtime_success gauge
clawsweeper_healthcheck_codex_runtime_success 0
# HELP clawsweeper_healthcheck_codex_runtime_timestamp_seconds stale help
# TYPE clawsweeper_healthcheck_codex_runtime_timestamp_seconds gauge
clawsweeper_healthcheck_codex_runtime_timestamp_seconds 100
`,
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync("/usr/bin/bash", [smokeScript.pathname, root, stateDir, metricsPath], {
      encoding: "utf8",
      env: { ...process.env, CLAWSWEEPER_CODEX_BIN: fakeCodex },
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  }

  const metrics = readFileSync(metricsPath, "utf8");
  assert.match(metrics, /^clawsweeper_healthcheck_success 1$/m);
  for (const family of [
    "clawsweeper_healthcheck_codex_runtime_success",
    "clawsweeper_healthcheck_codex_runtime_timestamp_seconds",
  ]) {
    assert.equal(
      metrics.match(new RegExp(`^# HELP ${family} `, "gm"))?.length,
      1,
      `${family} must have one HELP line`,
    );
    assert.equal(
      metrics.match(new RegExp(`^# TYPE ${family} `, "gm"))?.length,
      1,
      `${family} must have one TYPE line`,
    );
    assert.equal(
      metrics.match(new RegExp(`^${family} `, "gm"))?.length,
      1,
      `${family} must have one sample`,
    );
  }
  assert.match(metrics, /^clawsweeper_healthcheck_codex_runtime_success 1$/m);
});

for (const mode of ["wrong", "split", "extra-lines", "sandbox-fail", "fail"] as const) {
  test(`Codex runtime smoke fails closed for ${mode} output`, () => {
    const { fakeCodex, metricsPath, root, stateDir } = fixture(mode);
    const result = spawnSync("/usr/bin/bash", [smokeScript.pathname, root, stateDir, metricsPath], {
      encoding: "utf8",
      env: { ...process.env, CLAWSWEEPER_CODEX_BIN: fakeCodex },
    });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(stateDir, "codex-runtime-smoke.log")), false);
    assert.equal(existsSync(join(stateDir, "codex-runtime-smoke.failed.log")), true);
    if (existsSync(metricsPath)) {
      assert.doesNotMatch(
        readFileSync(metricsPath, "utf8"),
        /clawsweeper_healthcheck_codex_runtime_success 1/,
      );
    }
  });
}
