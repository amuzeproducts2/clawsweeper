import assert from "node:assert/strict";
import test from "node:test";
import {
  actionableReviewThreads,
  agentRepairReadiness,
  autoMergeDependabotBlocker,
  autoRepairBlocker,
  deterministicFindings,
  latestExactHeadAgentVerdict,
  loopStateRequiresTurn,
  macroscopeApprovalBlocker,
  mergeProgressionFlags,
  mergeSignalFingerprint,
  nextMergeAttempt,
  unresolvedOutdatedReviewThreads,
} from "../scripts/amuze-fallback-runner.mjs";

const headSha = "abc123def456";

function pullRequest(overrides = {}) {
  return {
    title: "Repair the worker",
    author: { login: "dependabot[bot]" },
    headRefOid: headSha,
    headRefName: "dependabot/npm_and_yarn/example-2.0.0",
    baseRefName: "main",
    headRepositoryOwner: { login: "amuzeproducts2" },
    isCrossRepository: false,
    isDraft: false,
    mergeable: "MERGEABLE",
    reviewDecision: "REVIEW_REQUIRED",
    labels: [],
    files: [{ path: "package.json", additions: 1, deletions: 1 }],
    ...overrides,
  };
}

function passingChecks() {
  return [{ name: "CI", state: "SUCCESS", bucket: "pass" }];
}

function agentPass(sha = headSha) {
  return {
    id: 42,
    user: { login: "jaywillingham" },
    body: [
      "SHIPRIGHT review passed.",
      "<!-- clawsweeper-review item=7 -->",
      `<!-- clawsweeper-verdict:pass item=7 sha=${sha} confidence=high -->`,
    ].join("\n"),
  };
}

function activeThread(overrides = {}) {
  return {
    id: "PRRT_active",
    isResolved: false,
    isOutdated: false,
    path: "src/worker.ts",
    line: 12,
    comments: {
      nodes: [{ author: { login: "macroscopeapp[bot]" }, body: "Handle the retry." }],
    },
    ...overrides,
  };
}

test("review thread classification excludes resolved and outdated threads", () => {
  const threads = [
    activeThread(),
    activeThread({ id: "PRRT_old", isOutdated: true }),
    activeThread({ id: "PRRT_done", isResolved: true }),
  ];
  assert.deepEqual(
    actionableReviewThreads(threads).map((thread) => thread.id),
    ["PRRT_active"],
  );
  assert.deepEqual(
    unresolvedOutdatedReviewThreads(threads).map((thread) => thread.id),
    ["PRRT_old"],
  );
});

test("deterministic findings and autorepair ingest current review threads", () => {
  const pr = pullRequest({
    author: { login: "codex" },
    headRefName: "agent/fix",
    files: [{ path: "src/worker.ts", additions: 5, deletions: 2 }],
  });
  const threads = [activeThread()];
  const result = deterministicFindings(pr, passingChecks(), threads);
  assert.equal(result.findings[0]?.title, "Unresolved review threads");
  assert.match(result.findings[0]?.evidence?.[0] ?? "", /src\/worker\.ts:12/);
  assert.equal(
    autoRepairBlocker(
      "amuzeproducts2/example",
      pr,
      passingChecks(),
      result.findings,
      result.stats,
      threads,
    ),
    null,
  );
});

test("agent approval fallback is exact-head, attributed, and thread-clean", () => {
  const pr = pullRequest();
  assert.equal(latestExactHeadAgentVerdict(pr, [agentPass()])?.verdict, "pass");
  assert.equal(latestExactHeadAgentVerdict(pr, [agentPass("oldhead")]), null);
  assert.equal(
    latestExactHeadAgentVerdict(pr, [{ ...agentPass(), user: { login: "untrusted-user" } }]),
    null,
  );
  assert.equal(macroscopeApprovalBlocker(pr, passingChecks(), [], [agentPass()], []), null);
  assert.match(
    macroscopeApprovalBlocker(pr, passingChecks(), [], [agentPass()], [activeThread()]) ?? "",
    /unresolved actionable review thread/,
  );
});

test("Dependabot can merge on clean exact-head frontier approval without Macroscope deadlock", () => {
  const pr = pullRequest();
  const blocker = autoMergeDependabotBlocker(
    pr,
    passingChecks(),
    { files: 1, additions: 1, deletions: 1 },
    [],
    [agentPass()],
    [],
    true,
  );
  assert.equal(blocker, null);
});

test("failed checks and active threads progress to repair instead of stalling at merge", () => {
  assert.deepEqual(
    mergeProgressionFlags("checks are not all green", [
      { name: "CI", state: "FAILURE", bucket: "fail" },
    ]),
    { needsRepair: true, needsAgentReview: false },
  );
  assert.deepEqual(
    mergeProgressionFlags("1 unresolved actionable review thread", passingChecks(), [
      activeThread(),
    ]),
    { needsRepair: true, needsAgentReview: false },
  );
});

test("pending loop state is re-enqueued after the review planner considers it current", () => {
  const pr = pullRequest();
  assert.equal(loopStateRequiresTurn(pr, { status: "pushed", pushedSha: headSha }, {}), true);
  assert.equal(
    loopStateRequiresTurn(
      pr,
      {},
      {
        status: "blocked",
        headSha,
        reason: "missing exact-head Macroscope or agent approval",
      },
    ),
    true,
  );
  assert.equal(loopStateRequiresTurn(pr, {}, { status: "merged", headSha }), false);
  assert.equal(
    loopStateRequiresTurn(
      pr,
      {},
      {
        status: "blocked",
        headSha: "stale-head",
        reason: "checks are not all green",
      },
    ),
    false,
  );
});

test("merge attempts pause after a bounded number of same-head failures", () => {
  assert.deepEqual(nextMergeAttempt({}, headSha, "squash-v1"), {
    allowed: true,
    attempt: 1,
    maxAttempts: 3,
  });
  assert.deepEqual(
    nextMergeAttempt(
      { status: "failed", headSha, strategy: "squash-v1", attempts: 3 },
      headSha,
      "squash-v1",
    ),
    { allowed: false, attempt: 4, maxAttempts: 3 },
  );
  assert.equal(
    nextMergeAttempt(
      { status: "failed", headSha, strategy: "squash-v1", attempts: 3 },
      "new-head",
      "squash-v1",
    ).allowed,
    true,
  );
});

test("merge fingerprint changes when review signals change", () => {
  const base = {
    pr: pullRequest(),
    checks: passingChecks(),
    reviews: [],
    conversationComments: [],
    reviewThreads: [activeThread()],
  };
  assert.notEqual(
    mergeSignalFingerprint(base),
    mergeSignalFingerprint({
      ...base,
      conversationComments: [agentPass()],
      reviewThreads: [activeThread({ isResolved: true })],
    }),
  );
});

test("repaired heads wait for checks, then require exact-head review, then become ready", () => {
  const pr = pullRequest({
    author: { login: "codex" },
    headRefName: "agent/fix",
    files: [{ path: "src/worker.ts", additions: 5, deletions: 2 }],
  });
  const base = {
    pr,
    stats: { files: 1, additions: 5, deletions: 2 },
    checks: [],
    conversationComments: [],
    reviewThreads: [],
  };
  const repairState = { status: "pushed", pushedSha: headSha };
  assert.equal(
    agentRepairReadiness("amuzeproducts2/example", 7, base, repairState).status,
    "waiting",
  );
  assert.equal(
    agentRepairReadiness(
      "amuzeproducts2/example",
      7,
      { ...base, checks: passingChecks() },
      repairState,
    ).status,
    "review",
  );
  assert.equal(
    agentRepairReadiness(
      "amuzeproducts2/example",
      7,
      { ...base, checks: passingChecks(), conversationComments: [agentPass()] },
      repairState,
    ).status,
    "ready",
  );
});
