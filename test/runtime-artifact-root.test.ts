import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runtimeArtifactRoot } from "../dist/clawsweeper.js";

test("runtime artifacts honor the external mutable-state root", () => {
  const externalRoot = join(tmpdir(), "clawsweeper-external-artifacts");
  assert.equal(
    runtimeArtifactRoot({ CLAWSWEEPER_ARTIFACT_ROOT: externalRoot }),
    resolve(externalRoot),
  );
  const source = readFileSync(new URL("../src/clawsweeper.ts", import.meta.url), "utf8");
  assert.equal(source.match(/join\(ROOT, "\.artifacts"/g)?.length, 1);
});
