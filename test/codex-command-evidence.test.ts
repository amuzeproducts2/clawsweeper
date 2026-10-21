import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutExecutionDiagnostics,
  checkoutDiffCommand,
  checkoutInspectionContract,
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
  const patch = event(checkoutDiffCommand("base", "final"), "diff --git a/a b/a\n+fix");
  const head = event("/bin/bash -lc 'git show --format=fuller --stat final'", "commit final\n");
  assert.equal(verifiedCheckoutEvidence(`${base}\n${head}`, "base", "final"), false);
  assert.equal(
    verifiedCheckoutEvidence(
      `${event("git rev-parse HEAD", "final")}\n${head}\n${patch}`,
      "base",
      "final",
    ),
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

test("Codex 0.156 usr-bin shell events retain strict final-head evidence", () => {
  const head = "2849b391252aa8be7941320fa4c09d8d0e34ab43";
  const transcript = `${event("/usr/bin/bash -lc 'git rev-parse HEAD'", head + "\n")}\n${event(`/usr/bin/bash -lc 'git show --format=fuller --stat ${head}'`, `commit ${head}\n`)}\n${event(`/usr/bin/bash -lc '${checkoutDiffCommand("base", head)}'`, "diff --git a/a b/a\n+fix")}`;
  assert.equal(verifiedCheckoutEvidence(transcript, "base", head), true);
  assert.equal(verifiedCheckoutEvidence(transcript, "base", "stale"), false);
  assert.equal(
    matchesExecutedCommand("/usr/bin/bash -lc 'git rev-parse HEAD || true'", "git rev-parse HEAD"),
    false,
  );
  assert.equal(
    verifiedCheckoutEvidence(
      event("/usr/bin/bash -lc 'git rev-parse HEAD'", head, { exit_code: 1 }),
      "base",
      null,
    ),
    false,
  );
  assert.equal(
    matchesExecutedCommand("/tmp/bash -lc 'git rev-parse HEAD'", "git rev-parse HEAD"),
    false,
  );
});

test("checkout diagnostics distinguish absent, failed and stale evidence without retaining secrets", () => {
  const secret = "PRIVATE_CREDENTIAL_CONTENT";
  const transcript = [
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: secret } }),
    event("print-secret " + secret, secret),
    event("git rev-parse HEAD", secret, { exit_code: 1, status: secret }),
    event("git rev-parse HEAD", "stale"),
    event("git show --format=fuller --stat final", "commit final\n" + secret),
    "malformed " + secret,
  ].join("\n");
  const diagnostic = checkoutExecutionDiagnostics(transcript, "base", "final");
  assert.equal(diagnostic.commandEvents, 4);
  assert.equal(diagnostic.completedCommandEvents, 4);
  assert.equal(diagnostic.malformedLines, 1);
  assert.deepEqual(diagnostic.headIdentity, [
    { status: "unknown", exitCode: 1, matchesHead: false },
    { status: "completed", exitCode: 0, matchesHead: false },
  ]);
  assert.equal(diagnostic.verified, false);
  assert.equal(diagnostic.prHeadSummary[0].matchesHead, true);
  assert.doesNotMatch(JSON.stringify(diagnostic), /PRIVATE_CREDENTIAL|print-secret|stale/);
  assert.deepEqual(checkoutExecutionDiagnostics("", "base", "final").headIdentity, []);
  const repeated = Array.from({ length: 50 }, () => event("git rev-parse HEAD", "final")).join(
    "\n",
  );
  const bounded = checkoutExecutionDiagnostics(repeated, "base", null);
  assert.equal(bounded.commandEvents, 50);
  assert.equal(bounded.headIdentity.length, 8);
});

test("PR inspection requires the successful final patch read, not only metadata or prose", () => {
  const metadata = [
    event("git rev-parse HEAD", "final"),
    event("git show --format=fuller --stat final", "commit final"),
  ].join("\n");
  const command = checkoutDiffCommand("base", "final");
  assert.equal(verifiedCheckoutEvidence(metadata, "base", "final"), false);
  for (const wrong of [
    event(command, "patch", { exit_code: 1 }),
    event(command, "patch", { status: "in_progress" }),
    event(checkoutDiffCommand("stale-base", "final"), "patch"),
    event(checkoutDiffCommand("base", "stale-head"), "patch"),
    event(command + " || true", "patch"),
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "I inspected the final patch" },
    }),
  ])
    assert.equal(verifiedCheckoutEvidence(metadata + "\n" + wrong, "base", "final"), false);
  const inspected = metadata + "\n" + event(command, "diff --git a/a b/a\n+fixed");
  assert.equal(verifiedCheckoutEvidence(inspected, "base", "final"), true);
  const diagnostic = checkoutExecutionDiagnostics(inspected, "base", "final");
  assert.deepEqual(diagnostic.finalPatch, [
    { status: "completed", exitCode: 0, matchesHead: true },
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostic), /diff --git|fixed/);
  const contract = checkoutInspectionContract("base", "final");
  assert.match(contract, /JSON-only describes the final response/);
  assert.match(contract, /Attempt the required calls/);
  assert.ok(contract.includes(command));
});

test("complete patch coverage requires every bounded chunk, without omissions or truncation", async () => {
  const { patchInspectionPages, completePatchEvidence } =
    await import("../dist/codex-command-evidence.js");
  const patch = "diff --git a/large.txt b/large.txt\n" + "+line 🦀\n".repeat(1500);
  const pages = patchInspectionPages("base", "final", patch);
  assert.ok(pages.length > 3);
  const transcript = pages.map((page) => event(page.command, page.output)).join("\n");
  assert.equal(completePatchEvidence(transcript, pages), true);
  for (const missing of [0, Math.floor(pages.length / 2), pages.length - 1]) {
    assert.equal(
      completePatchEvidence(
        pages
          .filter((_, index) => index !== missing)
          .map((page) => event(page.command, page.output))
          .join("\n"),
        pages,
      ),
      false,
    );
  }
  assert.equal(completePatchEvidence(transcript.replace("+line", "-line"), pages), false);
  assert.equal(
    completePatchEvidence(
      pages.map((page) => event(page.command, page.output.slice(0, 100))).join("\n"),
      pages,
    ),
    false,
  );
  assert.equal(
    completePatchEvidence(
      pages.map((page) => event(page.command, page.output, { exit_code: 1 })).join("\n"),
      pages,
    ),
    false,
  );
  assert.equal(
    completePatchEvidence(event(checkoutDiffCommand("base", "final"), patch), pages),
    false,
  );
  assert.equal(
    completePatchEvidence(transcript, patchInspectionPages("base", "stale", patch)),
    false,
  );
  assert.equal(completePatchEvidence(transcript, []), false);
  const contract = checkoutInspectionContract("base", "final", pages);
  for (const page of pages) assert.ok(contract.includes(page.command));
  const small = patchInspectionPages("base", "final", "+fix\n");
  assert.equal(completePatchEvidence(event(small[0].command, "+fix\n"), small), true);
  assert.equal(completePatchEvidence(event(small[0].command, "+fi"), small), false);
});
