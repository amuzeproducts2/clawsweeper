import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("../scripts/ci-change-scope.sh", import.meta.url).pathname;

function scope(paths: string[]): string {
  const result = spawnSync("/usr/bin/env", ["bash", script], {
    input: paths.join("\n"),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("only pure documentation changes take the CI fast path", () => {
  assert.equal(scope(["docs/amuze-closed-loop.md"]), "docs");
  assert.equal(scope(["docs/a.md", "README.md", "CHANGELOG.md", "LICENSE"]), "docs");
  // Anything a build, test or release step reads is code, even next to documentation.
  for (const path of [
    "src/clawsweeper.ts",
    "scripts/ci-change-scope.sh",
    ".github/workflows/ci.yml",
    "prompts/review-item.md",
    "instructions/review.md",
    "AGENTS.md",
    "package.json",
    "docsx/a.md",
    "docs/../src/clawsweeper.ts",
  ]) {
    assert.equal(scope([path]), "code", path);
    assert.equal(scope(["docs/a.md", path]), "code", `docs plus ${path}`);
  }
  // An empty or unreadable file list never qualifies for the fast path.
  assert.equal(scope([]), "code");
  assert.equal(scope(["", ""]), "code");
});
