import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderReviewCommentFromReport } from "../dist/clawsweeper.js";

const tmpPrefix = join(tmpdir(), "clawsweeper-test-");

function workPlanCandidateReport(overrides = {}) {
  const frontmatter = {
    number: 321,
    repository: "openclaw/clawsweeper",
    type: "issue",
    title: "Render work plans",
    reviewed_at: new Date().toISOString(),
    review_status: "complete",
    local_checkout_access: "verified",
    decision: "keep_open",
    action_taken: "kept_open",
    work_candidate: "queue_fix_pr",
    work_status: "candidate",
    work_priority: "medium",
    work_confidence: "high",
    work_likely_files: JSON.stringify(["src/clawsweeper.ts", "test/clawsweeper.test.ts"]),
    work_validation: JSON.stringify(["pnpm run check"]),
    work_cluster_refs: JSON.stringify(["openclaw/clawsweeper#26"]),
    ...overrides,
  };
  return `---
${Object.entries(frontmatter)
  .map(([key, value]) => `${key}: ${value}`)
  .join("\n")}
---

# #321: Render work plans

## Summary

The dashboard has queue_fix_pr candidates but no generated coding plan.

## Repair Work Prompt

Render generated plan markdown from existing report fields.
`;
}

function lowSignalCloseReport(overrides = {}) {
  return `${workPlanCandidateReport({
    repository: "openclaw/openclaw",
    type: "pull_request",
    decision: "close",
    action_taken: "proposed_close",
    close_reason: "low_signal_unmergeable_pr",
    confidence: "high",
    work_candidate: "none",
    work_status: "none",
    item_snapshot_hash: "reviewed-snapshot",
    item_created_at: "2026-05-01T00:00:00Z",
    item_updated_at: "2026-05-01T00:00:00Z",
    author_association: "CONTRIBUTOR",
    ...overrides,
  })}\n\n## Evidence\n\n- **branch shape:** PR diff is mostly unrelated provider churn around a tiny possible useful tweak\n\n## Close Comment\n\nClosing this PR because the branch is not a useful landing base.\n`;
}

function stalePullRequestReport(overrides = {}) {
  return `${workPlanCandidateReport({
    repository: "openclaw/openclaw",
    number: 330,
    type: "pull_request",
    title: "Stale F PR",
    url: "https://github.com/openclaw/openclaw/pull/330",
    author: "reporter",
    author_association: "CONTRIBUTOR",
    decision: "keep_open",
    close_reason: "none",
    confidence: "high",
    action_taken: "kept_open",
    work_candidate: "manual_review",
    work_status: "manual_review",
    item_snapshot_hash: "reviewed-snapshot",
    item_created_at: "2026-02-01T00:00:00Z",
    item_updated_at: "2026-05-01T00:00:00Z",
    reviewed_at: "2026-05-01T00:00:00Z",
    labels: JSON.stringify(["status: 📣 needs proof"]),
    pr_rating_overall: "F",
    pr_rating_proof: "F",
    pr_rating_patch: "F",
    ...overrides,
  })}\n\n## Real Behavior Proof\n\nStatus: missing\nEvidence kind: none\nNeeds contributor action: true\nSummary: No live proof was supplied.\n\n## PR Rating\n\nOverall tier: F\nProof tier: F\nPatch tier: F\nSummary: The PR is not merge-ready.\nNext rank-up steps:\n- Rebase and provide proof.\n`;
}

function stripProofAndRatingFrontMatter(report: string): string {
  return report.replace(
    /\n(?:real_behavior_proof_status|pr_rating_overall|pr_rating_proof|pr_rating_patch):[^\n]*/g,
    "",
  );
}

function promotionGhMock(options: {
  number: number;
  title?: string;
  itemCreatedAt?: string;
  itemUpdatedAt?: string;
  itemUpdatedAtAfterLabelSync?: string;
  itemUpdatedAtAfterLabelSyncLogPath?: string;
  itemUpdatedAtAfterProof?: string;
  itemUpdatedAtAfterProofLogPath?: string;
  issueCommentCount?: number;
  comment: string;
  commentWriteLogPath?: string;
  closeAppliedBodyLogPath?: string;
  comments?: unknown[];
  timeline?: unknown[];
  linkedPulls?: Record<number, unknown>;
  linkedPullsAfterProof?: Record<number, unknown>;
  linkedIssues?: Record<number, unknown>;
}) {
  const title = options.title ?? "Stale F PR";
  const itemCreatedAt = options.itemCreatedAt ?? "2026-02-01T00:00:00Z";
  const itemUpdatedAt = options.itemUpdatedAt ?? "2026-05-01T00:00:00Z";
  const comments = options.comments ?? [
    {
      id: 9000 + options.number,
      html_url: `https://github.com/openclaw/openclaw/pull/${options.number}#issuecomment-${
        9000 + options.number
      }`,
      created_at: "2026-05-01T01:00:00Z",
      updated_at: "2026-05-01T01:00:00Z",
      user: { login: "clawsweeper[bot]" },
      body: options.comment,
    },
  ];
  const issueCommentCount = options.issueCommentCount ?? comments.length;
  const timeline = options.timeline ?? [];
  const linkedPulls = options.linkedPulls ?? {};
  const linkedIssues = options.linkedIssues ?? {};
  return `
	const { appendFileSync, existsSync } = require("fs");
	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
	const path = args[1] || "";
	const slurp = args.includes("--slurp");
	const jqIndex = args.indexOf("--jq");
	const jq = jqIndex >= 0 ? args[jqIndex + 1] : "";
	const comments = ${JSON.stringify(comments)};
	const timeline = ${JSON.stringify(timeline)};
	const linkedPulls = ${JSON.stringify(linkedPulls)};
	const linkedPullsAfterProof = ${JSON.stringify(options.linkedPullsAfterProof ?? {})};
	const linkedIssues = ${JSON.stringify(linkedIssues)};
	const commentWriteLogPath = ${JSON.stringify(options.commentWriteLogPath ?? "")};
	const closeAppliedBodyLogPath = ${JSON.stringify(options.closeAppliedBodyLogPath ?? "")};
	const number = ${options.number};
		const title = ${JSON.stringify(title)};
		const itemCreatedAt = ${JSON.stringify(itemCreatedAt)};
		const itemUpdatedAt = ${JSON.stringify(itemUpdatedAt)};
		const itemUpdatedAtAfterLabelSync = ${JSON.stringify(
      options.itemUpdatedAtAfterLabelSync ?? "",
    )};
		const itemUpdatedAtAfterLabelSyncLogPath = ${JSON.stringify(
      options.itemUpdatedAtAfterLabelSyncLogPath ?? "",
    )};
		const itemUpdatedAtAfterProof = ${JSON.stringify(options.itemUpdatedAtAfterProof ?? "")};
		const itemUpdatedAtAfterProofLogPath = ${JSON.stringify(
      options.itemUpdatedAtAfterProofLogPath ?? "",
    )};
		const proofHasRun = () =>
		  itemUpdatedAtAfterProofLogPath &&
		  existsSync(itemUpdatedAtAfterProofLogPath);
		const liveLinkedPulls = proofHasRun()
		  ? { ...linkedPulls, ...linkedPullsAfterProof }
		  : linkedPulls;
		const liveUpdatedAt =
		  itemUpdatedAtAfterProof &&
		  itemUpdatedAtAfterProofLogPath &&
		  existsSync(itemUpdatedAtAfterProofLogPath)
		    ? itemUpdatedAtAfterProof
		    : itemUpdatedAtAfterLabelSync &&
		        itemUpdatedAtAfterLabelSyncLogPath &&
		        existsSync(itemUpdatedAtAfterLabelSyncLogPath)
		      ? itemUpdatedAtAfterLabelSync
		      : itemUpdatedAt;
	const issueCommentCount = ${issueCommentCount};
	if (args[0] === "api" && args[1] === "-i" && new RegExp("/issues/" + number + "/timeline(?:\\\\?|$)").test(args[2] || "")) {
	  console.log("HTTP/2 200\\n\\n" + JSON.stringify(timeline));
	} else if (args[0] === "api" && new RegExp("/issues/" + number + "/comments$").test(path) && args.includes("--method")) {
	  if (commentWriteLogPath) appendFileSync(commentWriteLogPath, args.join(" ") + "\\n");
	  if (closeAppliedBodyLogPath) {
	    const input = args[args.indexOf("--input") + 1];
	    appendFileSync(closeAppliedBodyLogPath, JSON.parse(require("fs").readFileSync(input, "utf8")).body + "\\n---body---\\n");
	  }
	  console.log("");
	} else if (args[0] === "api" && new RegExp("/issues/comments/\\\\d+$").test(path) && args.includes("--method")) {
	  if (commentWriteLogPath) appendFileSync(commentWriteLogPath, args.join(" ") + "\\n");
	  console.log("");
	} else if (args[0] === "api" && new RegExp("/issues/" + number + "/comments(?:\\\\?|$)").test(path)) {
	  console.log(JSON.stringify(slurp ? [comments] : comments));
	} else if (args[0] === "api" && new RegExp("/issues/" + number + "/timeline(?:\\\\?|$)").test(path)) {
  console.log(JSON.stringify(slurp ? [timeline] : timeline));
} else if (args[0] === "api" && new RegExp("/issues/" + number + "$").test(path)) {
  console.log(JSON.stringify({
    number,
    title,
    html_url: "https://github.com/openclaw/openclaw/pull/" + number,
    body: "Stale PR body.",
    created_at: itemCreatedAt,
    updated_at: liveUpdatedAt,
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: ["status: 📣 needs proof"],
    comments: issueCommentCount,
    pull_request: { url: "https://api.github.com/repos/openclaw/openclaw/pulls/" + number }
  }));
} else if (args[0] === "api" && new RegExp("/pulls/" + number + "$").test(path)) {
  console.log(JSON.stringify({
    number,
    title,
    html_url: "https://github.com/openclaw/openclaw/pull/" + number,
    state: "open",
    changed_files: 2,
    commits: 1,
    review_comments: 0,
    body: "Stale PR body.",
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/openclaw" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/openclaw" } },
    user: { login: "reporter" }
  }));
	} else if (args[0] === "api" && /\\/pulls\\/(\\d+)$/.test(path)) {
	  const linkedNumber = Number((path.match(/\\/pulls\\/(\\d+)$/) || [])[1]);
	  if (!liveLinkedPulls[linkedNumber]) {
	    console.error("unexpected linked pull", linkedNumber);
	    process.exit(1);
	  }
	  console.log(JSON.stringify(liveLinkedPulls[linkedNumber]));
	} else if (args[0] === "api" && /\\/issues\\/(\\d+)\\/comments(?:\\?|$)/.test(path)) {
	  const linkedNumber = Number((path.match(/\\/issues\\/(\\d+)\\/comments/) || [])[1]);
	  const linkedIssue = liveLinkedPulls[linkedNumber] || linkedIssues[linkedNumber];
  if (!linkedIssue) {
    console.error("unexpected linked comments", linkedNumber);
    process.exit(1);
  }
  if (linkedIssue.commentsError) {
    console.error(linkedIssue.commentsError);
    process.exit(1);
  }
  const linkedComments = Array.isArray(linkedIssue.comments)
    ? linkedIssue.comments
    : [];
  console.log(JSON.stringify(slurp ? [linkedComments] : linkedComments));
	} else if (args[0] === "api" && /\\/issues\\/(\\d+)$/.test(path)) {
	  const linkedNumber = Number((path.match(/\\/issues\\/(\\d+)$/) || [])[1]);
	  const linkedIssue = liveLinkedPulls[linkedNumber] || linkedIssues[linkedNumber];
  if (!linkedIssue) {
    console.error("unexpected linked issue", linkedNumber);
    process.exit(1);
  }
  const labels = Array.isArray(linkedIssue.labels)
    ? linkedIssue.labels.map((label) =>
        typeof label === "string" ? label : label && label.name ? label.name : null,
      ).filter(Boolean)
    : [];
  if (jq === "[.labels[].name]") {
    console.log(JSON.stringify(labels));
  } else {
    console.log(JSON.stringify({
      number: linkedNumber,
      title: linkedIssue.title || ("PR #" + linkedNumber),
      html_url: linkedIssue.html_url || ("https://github.com/openclaw/openclaw/pull/" + linkedNumber),
      body: linkedIssue.body || "",
      state: linkedIssue.state || "open",
      labels: labels.map((name) => ({ name })),
      comments: Array.isArray(linkedIssue.comments) ? linkedIssue.comments.length : 0,
      pull_request: linkedIssue.pull_request || null,
    }));
  }
	} else if (args[0] === "api" && /\\/pulls\\/(\\d+)\\/files(?:\\?|$)/.test(path)) {
	  const linkedNumber = Number((path.match(/\\/pulls\\/(\\d+)\\/files/) || [])[1]);
	  if (linkedNumber !== number && !liveLinkedPulls[linkedNumber]) {
	    console.error("unexpected linked pull files", linkedNumber);
	    process.exit(1);
	  }
	  const sourceFiles = [{ filename: "src/runtime.ts" }, { filename: "test/runtime.test.ts" }];
	  const files = linkedNumber === number ? sourceFiles : liveLinkedPulls[linkedNumber].files || sourceFiles;
  if (jq === "[.[].filename]") {
    console.log(JSON.stringify(files.map((file) =>
      typeof file === "string" ? file : file && file.filename ? file.filename : null,
    ).filter(Boolean)));
  } else {
    console.log(JSON.stringify([files]));
  }
} else if (args[0] === "api" && new RegExp("/pulls/" + number + "/(files|commits|comments)(?:\\\\?|$)").test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "pr" && args[1] === "close" && args[2] === String(number)) {
  console.log("");
	} else if (args[0] === "issue" && args[1] === "edit") {
	  if (itemUpdatedAtAfterLabelSyncLogPath) appendFileSync(itemUpdatedAtAfterLabelSyncLogPath, args.join(" ") + "\\n");
	  console.log("");
	} else if (args[0] === "label" || args[0] === "issue") {
	  console.log("");
	} else {
  console.error("unexpected gh args", JSON.stringify(args));
  process.exit(1);
}
`;
}

function markedReviewCommentForTest(number: number, body: string): string {
  return `${body.trimEnd()}\n\n<!-- clawsweeper-review item=${number} -->`;
}

function sha256ForTest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function reportWithSyncedReviewComment(
  report: string,
  number: number,
  reason = "none",
): {
  report: string;
  comment: string;
} {
  const comment = markedReviewCommentForTest(number, renderReviewCommentFromReport(report, reason));
  return {
    report: report.replace(
      /^---\n/,
      [
        "---",
        `review_comment_sha256: ${sha256ForTest(comment)}`,
        `review_comment_id: ${9000 + number}`,
        `review_comment_url: https://github.com/openclaw/clawsweeper/issues/${number}#issuecomment-${9000 + number}`,
        "review_comment_synced_at: 2026-05-01T01:00:00Z",
        "",
      ].join("\n"),
    ),
    comment,
  };
}

function withMockGh(root: string, script: string, run: () => void): void {
  const originalGhBin = process.env.GH_BIN;
  const originalGhBinArgs = process.env.GH_BIN_ARGS;
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const ghPath = join(binDir, "gh.js");
  writeFileSync(ghPath, script, { mode: 0o755 });
  try {
    process.env.GH_BIN = process.execPath;
    process.env.GH_BIN_ARGS = JSON.stringify([ghPath]);
    run();
  } finally {
    if (originalGhBin === undefined) delete process.env.GH_BIN;
    else process.env.GH_BIN = originalGhBin;
    if (originalGhBinArgs === undefined) delete process.env.GH_BIN_ARGS;
    else process.env.GH_BIN_ARGS = originalGhBinArgs;
  }
}

function withMockCodexProof(
  root: string,
  result:
    | {
        type: "decision";
        decision: "covered" | "keep_open";
        reason: string;
        invocationLogPath?: string;
        expectedPromptIncludes?: string;
        unexpectedPromptIncludes?: string;
        coveredPromptIncludes?: string;
        keepOpenPromptIncludes?: string;
      }
    | { type: "failure"; message: string; invocationLogPath?: string },
  run: () => void,
): void {
  const originalPath = process.env.PATH;
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const codexPath = join(binDir, "codex");
  const script =
    result.type === "decision"
      ? `#!/usr/bin/env node
	const { appendFileSync, writeFileSync } = require("fs");
	const args = process.argv.slice(2);
	const outputPath = args[args.indexOf("--output-last-message") + 1];
	const invocationLogPath = ${JSON.stringify(result.invocationLogPath ?? "")};
	const prompt = require("fs").readFileSync(0, "utf8");
	const expectedPrompt = ${JSON.stringify(result.expectedPromptIncludes ?? "")};
	if (expectedPrompt && !prompt.includes(expectedPrompt)) {
	  process.stderr.write("missing expected proof prompt text: " + expectedPrompt);
	  process.exit(1);
	}
	const unexpectedPrompt = ${JSON.stringify(result.unexpectedPromptIncludes ?? "")};
		if (unexpectedPrompt && prompt.includes(unexpectedPrompt)) {
		  process.stderr.write("unexpected proof prompt text: " + unexpectedPrompt);
		  process.exit(1);
		}
		const coveredPrompt = ${JSON.stringify(result.coveredPromptIncludes ?? "")};
		const keepOpenPrompt = ${JSON.stringify(result.keepOpenPromptIncludes ?? "")};
		const decision = coveredPrompt && prompt.includes(coveredPrompt)
		  ? "covered"
		  : keepOpenPrompt && prompt.includes(keepOpenPrompt)
		    ? "keep_open"
		    : ${JSON.stringify(result.decision)};
		if (invocationLogPath) appendFileSync(invocationLogPath, "proof\\n");
		writeFileSync(outputPath, JSON.stringify({
	  sourceSummary: "PR A updates the provider route.",
	  coveringSummary: "PR B updates a different provider path.",
	  coveredWork: decision === "covered" ? ["PR B includes PR A's provider route update."] : [],
	  uniqueSourceWork: decision === "covered" ? [] : ["PR A's provider route update is still unique."],
	  decision,
	  reason: ${JSON.stringify(result.reason)}
	}));
`
      : `#!/usr/bin/env node
const { appendFileSync } = require("fs");
const invocationLogPath = ${JSON.stringify(result.invocationLogPath ?? "")};
if (invocationLogPath) appendFileSync(invocationLogPath, "proof\\n");
console.error(${JSON.stringify(result.message)});
process.exit(1);
`;
  writeFileSync(codexPath, script, { mode: 0o755 });
  try {
    process.env.PATH = `${binDir}:${originalPath ?? ""}`;
    run();
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }
}

function runApplyDecisionsForTest(options: {
  targetRepo?: string;
  itemsDir: string;
  closedDir: string;
  plansDir: string;
  reportPath: string;
  extraArgs?: string[];
}): void {
  execFileSync(process.execPath, [
    "dist/clawsweeper.js",
    "apply-decisions",
    "--target-repo",
    options.targetRepo ?? "openclaw/clawsweeper",
    "--items-dir",
    options.itemsDir,
    "--closed-dir",
    options.closedDir,
    "--plans-dir",
    options.plansDir,
    "--report-path",
    options.reportPath,
    "--limit",
    "10",
    "--processed-limit",
    "1",
    "--close-delay-ms",
    "0",
    ...(options.extraArgs ?? []),
  ]);
}

test("apply-decisions does not promote PRs superseded by F-rated linked pull requests", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 338,
      title: "Old activity PR",
      labels: JSON.stringify([]),
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    })
      .replace("Status: missing", "Status: sufficient")
      .replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      );
    const synced = reportWithSyncedReviewComment(sourceReport, 338, "none");
    writeFileSync(join(itemsDir, "338.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 338,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "F-rated canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            labels: ["proof: sufficient", "rating: unranked krab"],
          },
        },
      }),
      () => {
        withMockCodexProof(root, { type: "failure", message: "proof should not run" }, () => {
          runApplyDecisionsForTest({
            itemsDir,
            closedDir,
            plansDir,
            reportPath,
            extraArgs: [
              "--target-repo",
              "openclaw/openclaw",
              "--dry-run",
              "--apply-kind",
              "all",
              "--processed-limit",
              "3",
            ],
          });
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.doesNotMatch(JSON.stringify(report), /proof should not run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not promote PRs superseded by section-only unsafe linked reports", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 340,
      title: "Old activity PR",
      labels: JSON.stringify([]),
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    })
      .replace("Status: missing", "Status: sufficient")
      .replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      );
    const synced = reportWithSyncedReviewComment(sourceReport, 340, "none");
    writeFileSync(join(itemsDir, "340.md"), synced.report, "utf8");
    writeFileSync(
      join(itemsDir, "400.md"),
      stripProofAndRatingFrontMatter(
        stalePullRequestReport({
          number: 400,
          title: "Canonical PR with old section-only blockers",
          labels: JSON.stringify([]),
        }),
      ),
      "utf8",
    );

    withMockGh(
      root,
      promotionGhMock({
        number: 340,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical PR with old section-only blockers",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(root, { type: "failure", message: "proof should not run" }, () => {
          runApplyDecisionsForTest({
            itemsDir,
            closedDir,
            plansDir,
            reportPath,
            extraArgs: [
              "--target-repo",
              "openclaw/openclaw",
              "--dry-run",
              "--apply-kind",
              "all",
              "--item-numbers",
              "340",
              "--processed-limit",
              "3",
            ],
          });
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.doesNotMatch(JSON.stringify(report), /proof should not run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions promotes PRs when live proof labels supersede stale linked reports", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 342,
      title: "Old activity PR",
      labels: JSON.stringify([]),
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    })
      .replace("Status: missing", "Status: sufficient")
      .replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      );
    const synced = reportWithSyncedReviewComment(sourceReport, 342, "none");
    writeFileSync(join(itemsDir, "342.md"), synced.report, "utf8");
    writeFileSync(
      join(itemsDir, "400.md"),
      stalePullRequestReport({
        number: 400,
        title: "Canonical PR with stale proof report",
        labels: JSON.stringify(["status: needs proof"]),
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        pr_rating_patch: "D",
      }).replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      ),
      "utf8",
    );

    withMockGh(
      root,
      promotionGhMock({
        number: 342,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical PR with live proof label",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            labels: ["proof: sufficient"],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "covered",
            reason: "PR B is the live proof-backed canonical PR covering PR A.",
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--dry-run",
                "--apply-kind",
                "all",
                "--item-numbers",
                "342",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not promote PRs when live labels supersede stale proof reports", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 344,
      title: "Old activity PR",
      labels: JSON.stringify([]),
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    })
      .replace("Status: missing", "Status: sufficient")
      .replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      );
    const synced = reportWithSyncedReviewComment(sourceReport, 344, "none");
    writeFileSync(join(itemsDir, "344.md"), synced.report, "utf8");
    writeFileSync(
      join(itemsDir, "400.md"),
      stalePullRequestReport({
        number: 400,
        title: "Canonical PR with stale sufficient proof report",
        labels: JSON.stringify(["proof: sufficient"]),
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        pr_rating_patch: "D",
      })
        .replace("Status: missing", "Status: sufficient")
        .replace(
          "Overall tier: F\nProof tier: F\nPatch tier: F",
          "Overall tier: D\nProof tier: D\nPatch tier: D",
        ),
      "utf8",
    );

    withMockGh(
      root,
      promotionGhMock({
        number: 344,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical PR with current needs-proof labels",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            labels: ["triage: needs-real-behavior-proof", "status: needs proof"],
          },
        },
      }),
      () => {
        runApplyDecisionsForTest({
          itemsDir,
          closedDir,
          plansDir,
          reportPath,
          extraArgs: [
            "--target-repo",
            "openclaw/openclaw",
            "--dry-run",
            "--apply-kind",
            "all",
            "--item-numbers",
            "344",
            "--processed-limit",
            "3",
          ],
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not promote PRs superseded by unknown-mergeability PRs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 343,
      title: "Old activity PR",
      labels: JSON.stringify([]),
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    })
      .replace("Status: missing", "Status: sufficient")
      .replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      );
    const synced = reportWithSyncedReviewComment(sourceReport, 343, "none");
    writeFileSync(join(itemsDir, "343.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 343,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical PR still computing mergeability",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: null,
            labels: ["proof: sufficient"],
          },
        },
      }),
      () => {
        runApplyDecisionsForTest({
          itemsDir,
          closedDir,
          plansDir,
          reportPath,
          extraArgs: [
            "--target-repo",
            "openclaw/openclaw",
            "--dry-run",
            "--apply-kind",
            "all",
            "--processed-limit",
            "3",
          ],
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not promote PRs superseded by non-clean linked pull requests", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 345,
      title: "Old activity PR",
      labels: JSON.stringify([]),
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    })
      .replace("Status: missing", "Status: sufficient")
      .replace(
        "Overall tier: F\nProof tier: F\nPatch tier: F",
        "Overall tier: D\nProof tier: D\nPatch tier: D",
      );
    const synced = reportWithSyncedReviewComment(sourceReport, 345, "none");
    writeFileSync(join(itemsDir, "345.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 345,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Blocked canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "blocked",
            labels: ["proof: sufficient"],
          },
        },
      }),
      () => {
        runApplyDecisionsForTest({
          itemsDir,
          closedDir,
          plansDir,
          reportPath,
          extraArgs: [
            "--target-repo",
            "openclaw/openclaw",
            "--dry-run",
            "--apply-kind",
            "all",
            "--processed-limit",
            "3",
          ],
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions blocks duplicate close when linked canonical PR closed unmerged", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 336,
        title: "Already proposed duplicate close",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      336,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "336.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 336,
        title: "Already proposed duplicate close",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Closed unmerged canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: null,
            labels: [],
          },
        },
      }),
      () => {
        runApplyDecisionsForTest({
          itemsDir,
          closedDir,
          plansDir,
          reportPath,
          extraArgs: [
            "--target-repo",
            "openclaw/openclaw",
            "--dry-run",
            "--apply-kind",
            "all",
            "--processed-limit",
            "3",
          ],
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.match(
      report.find((entry) => entry.action === "kept_open")?.reason ?? "",
      /closed and unmerged/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions blocks duplicate close when canonical PR is only in close comment", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const reportMarkdown = lowSignalCloseReport({
      number: 346,
      title: "Already proposed duplicate close",
      close_reason: "duplicate_or_superseded",
      work_cluster_refs: JSON.stringify([]),
    }).replace(
      "Closing this PR because the branch is not a useful landing base.",
      [
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
        "",
        "Earlier context also mentioned https://github.com/openclaw/openclaw/pull/401.",
      ].join("\n"),
    );
    const synced = reportWithSyncedReviewComment(reportMarkdown, 346, "duplicate_or_superseded");
    writeFileSync(join(itemsDir, "346.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 346,
        title: "Already proposed duplicate close",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Closed unmerged canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: null,
            labels: [],
          },
        },
      }),
      () => {
        runApplyDecisionsForTest({
          itemsDir,
          closedDir,
          plansDir,
          reportPath,
          extraArgs: [
            "--target-repo",
            "openclaw/openclaw",
            "--dry-run",
            "--apply-kind",
            "all",
            "--processed-limit",
            "3",
          ],
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.match(
      report.find((entry) => entry.action === "kept_open")?.reason ?? "",
      /closed and unmerged/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps existing duplicate PR close proposals open when coverage proof says keep_open", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const commentWriteLogPath = join(root, "comment-write.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 348,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      348,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "348.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 348,
        title: "Provider route fallback",
        comment: synced.comment,
        commentWriteLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [
              {
                id: 9400,
                html_url: "https://github.com/openclaw/openclaw/pull/400#issuecomment-9400",
                created_at: "2026-05-01T02:00:00Z",
                updated_at: "2026-05-01T02:00:00Z",
                user: { login: "maintainer" },
                body: "This does not include the fallback route behavior from PR 348.",
              },
            ],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "keep_open",
            reason: "PR A still has unique fallback route behavior that PR B does not cover.",
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.equal(
      report.find((entry) => entry.number === 348)?.action,
      "skipped_pr_close_coverage_proof",
    );
    assert.match(
      report.find((entry) => entry.action === "skipped_pr_close_coverage_proof")?.reason ?? "",
      /unique fallback route behavior/,
    );
    assert.match(
      readFileSync(join(itemsDir, "348.md"), "utf8"),
      /action_taken: skipped_pr_close_coverage_proof/,
    );
    const blockedReport = readFileSync(join(itemsDir, "348.md"), "utf8");
    assert.match(blockedReport, /^decision: keep_open$/m);
    assert.match(blockedReport, /^close_reason: none$/m);
    assert.match(blockedReport, /## PR Close Coverage Proof\n\nDecision: keep_open/);
    assert.match(blockedReport, /unique fallback route behavior/);
    assert.match(readFileSync(commentWriteLogPath, "utf8"), /issues\/comments\/9348/);
    assert.doesNotMatch(
      renderReviewCommentFromReport(blockedReport, "none"),
      /I’m closing this PR/,
    );

    writeFileSync(commentWriteLogPath, "", "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 348,
        title: "Provider route fallback",
        comment: synced.comment,
        commentWriteLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(root, { type: "failure", message: "proof should not rerun" }, () => {
          runApplyDecisionsForTest({
            itemsDir,
            closedDir,
            plansDir,
            reportPath,
            extraArgs: [
              "--target-repo",
              "openclaw/openclaw",
              "--apply-kind",
              "all",
              "--sync-comments-only",
              "--processed-limit",
              "3",
            ],
          });
        });
      },
    );

    const retryReport = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      retryReport.some((entry) => entry.action === "closed"),
      false,
    );
    assert.equal(
      retryReport.find((entry) => entry.number === 348)?.action,
      "review_comment_synced",
    );
    assert.equal(
      retryReport.some((entry) => /proof should not rerun/.test(entry.reason)),
      false,
    );
    assert.match(readFileSync(commentWriteLogPath, "utf8"), /issues\/comments\/9348/);
    assert.equal(existsSync(join(closedDir, "348.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions skips duplicate PR coverage proof during synced comment-only runs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const reportMarkdown = lowSignalCloseReport({
      number: 348,
      title: "Provider route fallback",
      close_reason: "duplicate_or_superseded",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    }).replace(
      "Closing this PR because the branch is not a useful landing base.",
      "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
    );
    const synced = reportWithSyncedReviewComment(reportMarkdown, 348, "duplicate_or_superseded");
    writeFileSync(join(itemsDir, "348.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 348,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          { type: "failure", message: "proof should not run", invocationLogPath: proofLogPath },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--sync-comments-only",
                "--processed-limit",
                "1",
              ],
            });
          },
        );
      },
    );

    assert.equal(existsSync(proofLogPath), false);
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => /proof should not run/.test(entry.reason)),
      false,
    );
    assert.equal(existsSync(join(closedDir, "348.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions skips duplicate PR coverage proof during stale comment-only sync", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    const commentWriteLogPath = join(root, "comment-write.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const reportMarkdown = lowSignalCloseReport({
      number: 349,
      title: "Provider route fallback",
      close_reason: "duplicate_or_superseded",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    }).replace(
      "Closing this PR because the branch is not a useful landing base.",
      "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
    );
    const synced = reportWithSyncedReviewComment(reportMarkdown, 349, "duplicate_or_superseded");
    writeFileSync(join(itemsDir, "349.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 349,
        title: "Provider route fallback",
        comment: markedReviewCommentForTest(349, "Stale durable review comment."),
        commentWriteLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          { type: "failure", message: "proof should not run", invocationLogPath: proofLogPath },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--sync-comments-only",
                "--processed-limit",
                "1",
              ],
            });
          },
        );
      },
    );

    assert.equal(existsSync(proofLogPath), false);
    assert.match(readFileSync(commentWriteLogPath, "utf8"), /issues\/comments\/9349/);
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 349,
        action: "review_comment_synced",
        reason: "updated durable Codex review comment",
      },
    ]);
    assert.equal(existsSync(join(closedDir, "349.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions gates duplicate PR closes with shorthand canonical refs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 356,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify(["Superseded by #400"]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by openclaw/openclaw#400.",
      ),
      356,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "356.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 356,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [
              {
                id: 9400,
                html_url: "https://github.com/openclaw/openclaw/pull/400#issuecomment-9400",
                created_at: "2026-05-01T02:00:00Z",
                updated_at: "2026-05-01T02:00:00Z",
                user: { login: "maintainer" },
                body: "This does not include the fallback route behavior from PR 356.",
              },
            ],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "keep_open",
            reason: "PR A still has unique fallback route behavior that PR B does not cover.",
            invocationLogPath: proofLogPath,
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.equal(
      report.find((entry) => entry.number === 356)?.action,
      "skipped_pr_close_coverage_proof",
    );
    assert.match(readFileSync(proofLogPath, "utf8"), /proof/);
    assert.match(
      report.find((entry) => entry.number === 356)?.reason ?? "",
      /unique fallback route behavior/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions gates duplicate PR closes when unrelated bare issue refs accompany one PR URL", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 359,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Related pull request: https://github.com/openclaw/openclaw/pull/400",
          "Background issue: #500",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR because the related pull request is the better review target.",
      ),
      359,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "359.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 359,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [],
            labels: [],
          },
        },
        linkedIssues: {
          500: {
            number: 500,
            title: "Related provider issue",
            html_url: "https://github.com/openclaw/openclaw/issues/500",
            state: "open",
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "keep_open",
            reason: "PR A still has unique fallback route behavior that PR B does not cover.",
            invocationLogPath: proofLogPath,
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.equal(
      report.find((entry) => entry.number === 359)?.action,
      "skipped_pr_close_coverage_proof",
    );
    assert.match(readFileSync(proofLogPath, "utf8"), /proof/);
    assert.match(
      report.find((entry) => entry.number === 359)?.reason ?? "",
      /unique fallback route behavior/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions ignores bare refs inside cross-repo markdown link labels for duplicate proof", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 357,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by [PR #400](https://github.com/other/repo/pull/400)",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by the linked external PR.",
      ),
      357,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "357.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 357,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Unrelated same-repo PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Unrelated provider cleanup.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "failure",
            message: "coverage proof should not run for cross-repo markdown link labels",
            invocationLogPath: proofLogPath,
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--dry-run",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    assert.equal(existsSync(proofLogPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions ignores bare refs inside same-repo markdown link labels for duplicate proof", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 358,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by [fixes #123](https://github.com/openclaw/openclaw/pull/400)",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by the linked canonical PR.",
      ),
      358,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "358.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 358,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          123: {
            number: 123,
            title: "Unrelated draft PR",
            html_url: "https://github.com/openclaw/openclaw/pull/123",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            draft: true,
            body: "Unrelated provider cleanup.",
            comments: [],
            labels: [],
          },
          400: {
            number: 400,
            title: "Canonical provider replacement",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Covers the provider route fallback behavior.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "keep_open",
            reason: "PR A still has unique fallback route behavior that PR B does not cover.",
            invocationLogPath: proofLogPath,
            expectedPromptIncludes: "Canonical provider replacement",
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
    }>;
    assert.equal(
      report.find((entry) => entry.number === 358)?.action,
      "skipped_pr_close_coverage_proof",
    );
    assert.match(readFileSync(proofLogPath, "utf8"), /proof/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps newline-start bare PR refs tied to their own line", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 358,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify(["Links:\n#400 supersedes this PR and #500 is related"]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by the linked canonical PR.",
      ),
      358,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "358.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 358,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [],
            labels: [],
          },
        },
        linkedIssues: {
          500: {
            number: 500,
            title: "Related provider issue",
            html_url: "https://github.com/openclaw/openclaw/issues/500",
            state: "open",
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "keep_open",
            reason: "PR A still has unique fallback route behavior that PR B does not cover.",
            invocationLogPath: proofLogPath,
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.equal(
      report.find((entry) => entry.number === 358)?.action,
      "skipped_pr_close_coverage_proof",
    );
    assert.match(readFileSync(proofLogPath, "utf8"), /proof/);
    assert.match(
      report.find((entry) => entry.number === 358)?.reason ?? "",
      /unique fallback route behavior/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions ignores unrelated same-line bare PR refs for duplicate proof", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 361,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify(["Superseded by #400; #500 is related"]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by the linked canonical PR.",
      ),
      361,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "361.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 361,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 361.",
            comments: [],
            labels: [],
          },
          500: {
            number: 500,
            title: "Related draft PR",
            html_url: "https://github.com/openclaw/openclaw/pull/500",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            draft: true,
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--dry-run",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
      JSON.stringify(report),
    );
    assert.match(
      report.find((entry) => entry.action === "closed")?.reason ?? "",
      /duplicate or superseded/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const scenario of [
  { name: "and", number: 364, refs: "#400 and #401" },
  { name: "comma", number: 365, refs: "#400, #401" },
  { name: "semicolon", number: 366, refs: "#400; #401" },
  { name: "comma and and", number: 367, refs: "#400, #401, and #402" },
  {
    name: "markdown links",
    number: 368,
    refs: "[first](https://github.com/openclaw/openclaw/pull/400), [second](https://github.com/openclaw/openclaw/pull/401)",
  },
]) {
  test(`apply-decisions preserves supersession context across shorthand PR ref lists with ${scenario.name}`, () => {
    const root = mkdtempSync(tmpPrefix);
    try {
      const itemsDir = join(root, "items");
      const closedDir = join(root, "closed");
      const plansDir = join(root, "plans");
      const reportPath = join(root, "apply-report.json");
      mkdirSync(itemsDir, { recursive: true });
      mkdirSync(plansDir, { recursive: true });
      const synced = reportWithSyncedReviewComment(
        lowSignalCloseReport({
          number: scenario.number,
          title: "Provider route fallback",
          close_reason: "duplicate_or_superseded",
          work_cluster_refs: JSON.stringify([`Superseded by ${scenario.refs}`]),
        }).replace(
          "Closing this PR because the branch is not a useful landing base.",
          "Closing this PR as superseded by the linked canonical PRs.",
        ),
        scenario.number,
        "duplicate_or_superseded",
      );
      writeFileSync(join(itemsDir, `${scenario.number}.md`), synced.report, "utf8");

      withMockGh(
        root,
        promotionGhMock({
          number: scenario.number,
          title: "Provider route fallback",
          comment: synced.comment,
          linkedPulls: {
            400: {
              number: 400,
              title: "Initial provider cleanup",
              html_url: "https://github.com/openclaw/openclaw/pull/400",
              state: "closed",
              merged_at: "2026-05-01T00:00:00Z",
              body: "Cleans up provider setup without changing the fallback route.",
              comments: [],
              labels: [],
            },
            401: {
              number: 401,
              title: "Provider cleanup",
              html_url: "https://github.com/openclaw/openclaw/pull/401",
              state: "closed",
              merged_at: "2026-05-02T00:00:00Z",
              body: `Includes the fallback route behavior from PR ${scenario.number}.`,
              comments: [],
              labels: [],
            },
            402: {
              number: 402,
              title: "Later provider cleanup",
              html_url: "https://github.com/openclaw/openclaw/pull/402",
              state: "closed",
              merged_at: "2026-05-03T00:00:00Z",
              body: "Follow-up provider cleanup.",
              comments: [],
              labels: [],
            },
          },
        }),
        () => {
          withMockCodexProof(
            root,
            {
              type: "decision",
              decision: "keep_open",
              reason: "PR B carries forward PR A's fallback route behavior.",
              keepOpenPromptIncludes:
                "Cleans up provider setup without changing the fallback route.",
              coveredPromptIncludes: `Includes the fallback route behavior from PR ${scenario.number}.`,
            },
            () => {
              runApplyDecisionsForTest({
                itemsDir,
                closedDir,
                plansDir,
                reportPath,
                extraArgs: [
                  "--target-repo",
                  "openclaw/openclaw",
                  "--dry-run",
                  "--apply-kind",
                  "all",
                  "--processed-limit",
                  "3",
                ],
              });
            },
          );
        },
      );

      const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
        action: string;
        reason: string;
      }>;
      assert.equal(
        report.some((entry) => entry.action === "closed"),
        true,
        JSON.stringify(report),
      );
      assert.match(
        report.find((entry) => entry.action === "closed")?.reason ?? "",
        /duplicate or superseded/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("apply-decisions does not proof-gate duplicate PR closes with bare issue refs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 357,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify(["Duplicate of #456"]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as a duplicate of canonical issue #456.",
      ),
      357,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "357.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 357,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedIssues: {
          456: {
            number: 456,
            title: "Provider fallback tracker",
            html_url: "https://github.com/openclaw/openclaw/issues/456",
            state: "open",
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(root, { type: "failure", message: "proof should not run" }, () => {
          runApplyDecisionsForTest({
            itemsDir,
            closedDir,
            plansDir,
            reportPath,
            extraArgs: [
              "--target-repo",
              "openclaw/openclaw",
              "--dry-run",
              "--apply-kind",
              "all",
              "--processed-limit",
              "3",
            ],
          });
        });
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
    );
    assert.equal(JSON.stringify(report).includes("proof should not run"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions preserves full PR URL evidence over later bare refs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 348,
        title: "Already proposed duplicate close",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.\nLater issue discussion also mentions #400.",
      ),
      348,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "348.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 348,
        title: "Already proposed duplicate close",
        comment: synced.comment,
        linkedIssues: {
          400: {
            number: 400,
            title: "Issue with same number",
            html_url: "https://github.com/openclaw/openclaw/issues/400",
            state: "open",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "failure",
            message: "proof should not run",
            invocationLogPath: proofLogPath,
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.match(
      report.find((entry) => entry.action === "kept_open")?.reason ?? "",
      /linked canonical PR #400 could not be read/,
    );
    assert.equal(existsSync(proofLogPath), false);
    assert.equal(existsSync(join(closedDir, "348.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions checks duplicate PR coverage proof before syncing corrected review comments", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const commentWriteLogPath = join(root, "comment-writes.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const reportMarkdown = lowSignalCloseReport({
      number: 354,
      title: "Unsynced duplicate close",
      close_reason: "duplicate_or_superseded",
      work_cluster_refs: JSON.stringify([
        "Superseded by https://github.com/openclaw/openclaw/pull/400",
      ]),
    }).replace(
      "Closing this PR because the branch is not a useful landing base.",
      "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
    );
    writeFileSync(join(itemsDir, "354.md"), reportMarkdown, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 354,
        title: "Unsynced duplicate close",
        comment: "",
        comments: [],
        issueCommentCount: 0,
        commentWriteLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Cleans up provider setup without changing the fallback route.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "keep_open",
            reason: "PR A still has unique fallback route behavior that PR B does not cover.",
          },
          () => {
            runApplyDecisionsForTest({
              itemsDir,
              closedDir,
              plansDir,
              reportPath,
              extraArgs: [
                "--target-repo",
                "openclaw/openclaw",
                "--apply-kind",
                "all",
                "--processed-limit",
                "3",
              ],
            });
          },
        );
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "review_comment_synced"),
      false,
    );
    assert.equal(
      report.find((entry) => entry.number === 354)?.action,
      "skipped_pr_close_coverage_proof",
    );
    assert.match(
      report.find((entry) => entry.number === 354)?.reason ?? "",
      /unique fallback route behavior/,
    );
    assert.match(readFileSync(commentWriteLogPath, "utf8"), /issues\/354\/comments/);
    const blockedReport = readFileSync(join(itemsDir, "354.md"), "utf8");
    assert.match(blockedReport, /^decision: keep_open$/m);
    assert.match(blockedReport, /^review_comment_synced_at:/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
