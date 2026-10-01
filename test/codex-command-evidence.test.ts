import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesExecutedCommand,
  successfulCodexCommands,
  verifiedCheckoutEvidence,
} from "../dist/codex-command-evidence.js";

function event(command, output, overrides = {}) {
  return JSON.stringify({
    type: "item.completed",
    item: {
      type: "command_execution",
      status: "completed",
      exit_code: 0,
      command,
      aggregated_output: output,
      ...overrides,
    },
  });
}

test("checkout evidence requires successful shell events for base and final PR head", () => {
  const base = event("git rev-parse HEAD", "base\n");
  const head = event("/bin/bash -lc 'git show --format=fuller --stat final'", "commit final\n");
  assert.equal(verifiedCheckoutEvidence(`${base}\n${head}`, "base", "final"), false);
  assert.equal(
    verifiedCheckoutEvidence(`${event("git rev-parse HEAD", "final")}\n${head}`, "base", "final"),
    true,
  );
  assert.equal(verifiedCheckoutEvidence(base, "base", "final"), false);
  assert.equal(verifiedCheckoutEvidence(`${base}\n${head}`, "base", "old"), false);
  assert.equal(verifiedCheckoutEvidence("local_checkout_access: verified", "base", null), false);
  assert.equal(
    verifiedCheckoutEvidence(event("git rev-parse HEAD", "base", { exit_code: 1 }), "base", null),
    false,
  );
});

test("model prose, failed or incomplete commands, and echo lookalikes are not execution proof", () => {
  assert.deepEqual(
    successfulCodexCommands(JSON.stringify({ type: "agent_message", text: "tests passed" })),
    [],
  );
  assert.deepEqual(
    successfulCodexCommands(event("pnpm test", "ok", { status: "in_progress" })),
    [],
  );
  assert.equal(matchesExecutedCommand("echo 'pnpm test'", "pnpm test"), false);
  assert.equal(matchesExecutedCommand("/bin/bash -lc 'pnpm test || true'", "pnpm test"), false);
});
