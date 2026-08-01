import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const smokeScript = new URL("../scripts/codex-runtime-smoke.sh", import.meta.url);

function fixture(mode: "ok" | "wrong" | "split" | "extra-lines" | "fail") {
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
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    output="$2"
    shift 2
    continue
  fi
  shift
done
[ -n "$output" ]
case "${mode}" in
  ok) printf 'CLAWSWEEPER_CODEX_RUNTIME_OK\n' > "$output" ;;
  wrong) printf 'WRONG\n' > "$output" ;;
  split) printf 'CLAWSWEEPER_CODEX_\nRUNTIME_OK\n' > "$output" ;;
  extra-lines) printf 'CLAWSWEEPER_CODEX_RUNTIME_OK\n\n' > "$output" ;;
  fail) printf 'fake codex failure\n' >&2; exit 17 ;;
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

for (const mode of ["wrong", "split", "extra-lines", "fail"] as const) {
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
