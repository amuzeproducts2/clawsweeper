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

function implementedCloseReport(overrides = {}) {
  return `${workPlanCandidateReport({
    decision: "close",
    action_taken: "proposed_close",
    close_reason: "implemented_on_main",
    confidence: "high",
    work_candidate: "none",
    work_status: "none",
    item_snapshot_hash: "reviewed-snapshot",
    item_created_at: "2026-05-01T00:00:00Z",
    item_updated_at: "2026-05-01T00:00:00Z",
    reproduction_status: "reproduced",
    reproduction_confidence: "high",
    fixed_sha: "1234567890abcdef1234567890abcdef12345678",
    fixed_at: "2026-05-01T02:00:00Z",
    ...overrides,
  })}\n\n## Evidence\n\n- **main fix:** git show confirms current main has the replacement implementation and it is not in the latest release yet\n  - file: [src/clawsweeper.ts](https://github.com/openclaw/clawsweeper/blob/1234567890abcdef1234567890abcdef12345678/src/clawsweeper.ts)\n  - sha: [1234567890ab](https://github.com/openclaw/clawsweeper/commit/1234567890abcdef1234567890abcdef12345678)\n\n## Close Comment\n\nClosing this because the requested behavior is already on main.\n`;
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

test("apply-decisions closes existing duplicate PR close proposals when coverage proof says covered", () => {
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
        number: 349,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      349,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "349.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 349,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 349.",
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
    );
    assert.match(
      report.find((entry) => entry.action === "closed")?.reason ?? "",
      /duplicate or superseded/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions records successful duplicate PR coverage proof for closed PRs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const closeAppliedBodyLogPath = join(root, "close-applied-body.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 360,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      360,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "360.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 360,
        title: "Provider route fallback",
        comment: synced.comment,
        closeAppliedBodyLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 360.",
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

    const closedReport = readFileSync(join(closedDir, "360.md"), "utf8");
    assert.match(closedReport, /## PR Close Coverage Proof/);
    assert.match(closedReport, /Reason: PR B carries forward PR A's fallback route behavior\./);
    const closeAppliedBody = readFileSync(closeAppliedBodyLogPath, "utf8");
    assert.match(
      closeAppliedBody,
      /Coverage proof: PR B carries forward PR A's fallback route behavior\./,
    );
    assert.match(
      closeAppliedBody,
      /Covering PR: https:\/\/github\.com\/openclaw\/openclaw\/pull\/400\./,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions filters covering PR bot comments from coverage proof", () => {
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
        number: 363,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      363,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "363.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 363,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 363.",
            comments: [
              {
                id: 9400,
                html_url: "https://github.com/openclaw/openclaw/pull/400#issuecomment-9400",
                created_at: "2026-05-01T02:00:00Z",
                updated_at: "2026-05-01T02:00:00Z",
                user: { login: "clawsweeper[bot]" },
                body: [
                  "AUTOMATION_SHOULD_NOT_REACH_SWEEP_PROOF",
                  "",
                  "<!-- clawsweeper-review item=400 -->",
                ].join("\n"),
              },
              {
                id: 9401,
                html_url: "https://github.com/openclaw/openclaw/pull/400#issuecomment-9401",
                created_at: "2026-05-01T03:00:00Z",
                updated_at: "2026-05-01T03:00:00Z",
                user: { login: "maintainer" },
                body: "HUMAN_COVERING_CONTEXT_REACHES_SWEEP_PROOF",
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
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
            expectedPromptIncludes: "HUMAN_COVERING_CONTEXT_REACHES_SWEEP_PROOF",
            unexpectedPromptIncludes: "AUTOMATION_SHOULD_NOT_REACH_SWEEP_PROOF",
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
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions rechecks duplicate PR freshness after coverage proof passes", () => {
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
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
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
        itemUpdatedAtAfterProof: "2026-05-01T00:05:00Z",
        itemUpdatedAtAfterProofLogPath: proofLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 357.",
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
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
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
    assert.equal(report[0]?.action, "skipped_changed_since_review");
    assert.match(report[0]?.reason ?? "", /updated_at changed/);
    assert.equal(existsSync(join(closedDir, "357.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions rechecks covering PR freshness after coverage proof passes", () => {
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
        number: 360,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      360,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "360.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 360,
        title: "Provider route fallback",
        comment: synced.comment,
        itemUpdatedAtAfterProofLogPath: proofLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            updated_at: "2026-05-01T00:00:00Z",
            body: "Includes the fallback route behavior from PR 360.",
            comments: [],
            labels: [],
          },
        },
        linkedPullsAfterProof: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            updated_at: "2026-05-01T00:05:00Z",
            body: "Changed after proof ran.",
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
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
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
      report.find((entry) => entry.action === "retry_pr_close_coverage_proof")?.reason ?? "",
      /linked canonical PR #400 changed after coverage proof/,
    );
    assert.equal(existsSync(join(closedDir, "360.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions allows self-synced labels after proof with truncated context", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    const labelLogPath = join(root, "labels.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 359,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        labels: JSON.stringify(["status: 📣 needs proof"]),
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
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
        issueCommentCount: 25,
        itemUpdatedAtAfterLabelSync: "2026-05-01T00:04:00Z",
        itemUpdatedAtAfterLabelSyncLogPath: labelLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 359.",
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
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
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
      true,
    );
    assert.match(readFileSync(labelLogPath, "utf8"), /issue edit 359/);
    assert.ok(existsSync(join(closedDir, "359.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions blocks post-proof human activity hidden by self-updates", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    const labelLogPath = join(root, "labels.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        number: 362,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        labels: JSON.stringify(["status: 📣 needs proof"]),
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      362,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "362.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 362,
        title: "Provider route fallback",
        comment: synced.comment,
        comments: [
          {
            id: 9362,
            html_url: "https://github.com/openclaw/openclaw/pull/362#issuecomment-9362",
            created_at: "2099-01-01T00:00:00Z",
            updated_at: "2099-01-01T00:00:00Z",
            user: { login: "contributor" },
            body: "Please do not close this yet.",
          },
        ],
        itemUpdatedAtAfterLabelSync: "2026-05-01T00:04:00Z",
        itemUpdatedAtAfterLabelSyncLogPath: labelLogPath,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 362.",
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
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
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
    assert.equal(report[0]?.action, "skipped_changed_since_review");
    assert.match(report[0]?.reason ?? "", /non-automation activity after coverage proof/);
    assert.match(readFileSync(labelLogPath, "utf8"), /issue edit 362/);
    assert.equal(existsSync(join(closedDir, "362.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps existing duplicate PR close proposals open when coverage proof fails", () => {
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
        number: 350,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      350,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "350.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 350,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "May or may not include PR 350.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(root, { type: "failure", message: "model unavailable" }, () => {
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
      false,
    );
    assert.match(
      report.find((entry) => entry.action === "retry_pr_close_coverage_proof")?.reason ?? "",
      /PR close coverage proof failed/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions retries transient duplicate PR coverage proof failures", () => {
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
        number: 353,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      353,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "353.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 353,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 353.",
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
            message: "temporary model outage",
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

    let report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
    assert.match(
      report.find((entry) => entry.action === "retry_pr_close_coverage_proof")?.reason ?? "",
      /temporary/,
    );
    assert.match(
      readFileSync(join(itemsDir, "353.md"), "utf8"),
      /^action_taken: retry_pr_close_coverage_proof$/m,
    );

    withMockGh(
      root,
      promotionGhMock({
        number: 353,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 353.",
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
            decision: "covered",
            reason: "PR B carries forward PR A's fallback route behavior.",
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

    report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
    );
    assert.equal(readFileSync(proofLogPath, "utf8").trim().split("\n").length, 2);
    assert.ok(existsSync(join(closedDir, "353.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions checks age before duplicate PR coverage proof", () => {
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
        number: 351,
        title: "Provider route fallback",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }).replace(
        "Closing this PR because the branch is not a useful landing base.",
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
      ),
      351,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "351.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 351,
        title: "Provider route fallback",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the fallback route behavior from PR 351.",
            comments: [],
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
              "--min-age-days",
              "99999",
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
      false,
    );
    assert.match(
      report.find((entry) => entry.action === "kept_open")?.reason ?? "",
      /created less than or equal to 99999 days ago/,
    );
    assert.doesNotMatch(JSON.stringify(report), /proof should not run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions ignores unrelated unsafe PR links when canonical PR is safe", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const reportMarkdown = lowSignalCloseReport({
      number: 347,
      title: "Already proposed duplicate close",
      close_reason: "duplicate_or_superseded",
      work_cluster_refs: JSON.stringify(["https://github.com/openclaw/openclaw/pull/401"]),
    }).replace(
      "Closing this PR because the branch is not a useful landing base.",
      [
        "Closing this PR as superseded by https://github.com/openclaw/openclaw/pull/400.",
        "",
        "Earlier context also mentioned https://github.com/openclaw/openclaw/pull/401.",
      ].join("\n"),
    );
    const synced = reportWithSyncedReviewComment(reportMarkdown, 347, "duplicate_or_superseded");
    writeFileSync(join(itemsDir, "347.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 347,
        title: "Already proposed duplicate close",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Merged canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            labels: [],
          },
          401: {
            number: 401,
            title: "Unrelated closed PR",
            html_url: "https://github.com/openclaw/openclaw/pull/401",
            state: "closed",
            merged_at: null,
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
            reason: "PR B is the merged canonical PR covering PR A.",
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

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ action: string }>;
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions blocks duplicate close when canonical PR is a bare cluster ref", () => {
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
        number: 341,
        title: "Already proposed duplicate close",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify(["https://github.com/openclaw/openclaw/pull/400"]),
      }),
      341,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "341.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 341,
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

test("apply-decisions retries duplicate close when linked canonical PR comments cannot be read", () => {
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
        number: 340,
        title: "Already proposed duplicate close",
        close_reason: "duplicate_or_superseded",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      340,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "340.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 340,
        title: "Already proposed duplicate close",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Provider cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Includes the provider cleanup from PR 340.",
            comments: [{ body: "temporary hydration target" }],
            commentsError: "temporary comments outage",
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
      report.find((entry) => entry.action === "retry_pr_close_coverage_proof")?.reason ?? "",
      /temporary comments outage/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not promote PRs superseded by PRs already proposed for close", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      stalePullRequestReport({
        number: 337,
        title: "Old activity PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      337,
      "none",
    );
    writeFileSync(join(itemsDir, "337.md"), synced.report, "utf8");
    writeFileSync(
      join(itemsDir, "400.md"),
      lowSignalCloseReport({
        number: 400,
        title: "Canonical PR proposed for close",
      }),
      "utf8",
    );

    withMockGh(
      root,
      promotionGhMock({
        number: 337,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical PR proposed for close",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
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
            "--item-numbers",
            "337",
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

test("apply-decisions does not promote PRs superseded by skipped close proposal PRs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const sourceReport = stalePullRequestReport({
      number: 339,
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
    const synced = reportWithSyncedReviewComment(sourceReport, 339, "none");
    writeFileSync(join(itemsDir, "339.md"), synced.report, "utf8");
    writeFileSync(
      join(itemsDir, "400.md"),
      lowSignalCloseReport({
        number: 400,
        title: "Canonical PR blocked from close",
        action_taken: "skipped_changed_since_review",
      }),
      "utf8",
    );

    withMockGh(
      root,
      promotionGhMock({
        number: 339,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical PR blocked from close",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
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
            "--item-numbers",
            "339",
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

test("apply-decisions does not promote unrelated linked open PRs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      stalePullRequestReport({
        number: 333,
        title: "Related activity PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify(["https://github.com/openclaw/openclaw/pull/401"]),
      }),
      333,
      "none",
    );
    writeFileSync(join(itemsDir, "333.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 333,
        title: "Related activity PR",
        itemCreatedAt: "2026-05-20T00:00:00Z",
        comment: synced.comment,
        linkedPulls: {
          401: {
            number: 401,
            title: "Related activity PR",
            html_url: "https://github.com/openclaw/openclaw/pull/401",
            state: "open",
            merged_at: null,
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
            "--stale-min-age-days",
            "99999",
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

test("apply-decisions does not promote unrelated linked merged PRs", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(
      stalePullRequestReport({
        number: 334,
        title: "Related merged activity PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify(["https://github.com/openclaw/openclaw/pull/402"]),
      }),
      334,
      "none",
    );
    writeFileSync(join(itemsDir, "334.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 334,
        title: "Related merged activity PR",
        itemCreatedAt: "2026-05-20T00:00:00Z",
        comment: synced.comment,
        linkedPulls: {
          402: {
            number: 402,
            title: "Related merged PR",
            html_url: "https://github.com/openclaw/openclaw/pull/402",
            state: "closed",
            merged_at: "2026-05-21T00:00:00Z",
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
            "--stale-min-age-days",
            "99999",
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

test("apply-decisions starts same-author pair closes from the PR side", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const issueSynced = reportWithSyncedReviewComment(
      implementedCloseReport({
        repository: "openclaw/openclaw",
        number: 320,
        type: "issue",
        title: "Paired issue",
        author: "reporter",
        action_taken: "skipped_same_author_pair",
      }),
      320,
      "implemented_on_main",
    );
    const pullSynced = reportWithSyncedReviewComment(
      implementedCloseReport({
        repository: "openclaw/openclaw",
        number: 321,
        type: "pull_request",
        title: "Paired PR",
        author: "reporter",
        action_taken: "skipped_same_author_pair",
      }),
      321,
      "implemented_on_main",
    );
    writeFileSync(join(itemsDir, "320.md"), issueSynced.report, "utf8");
    writeFileSync(join(itemsDir, "321.md"), pullSynced.report, "utf8");

    const ghMock = `
const comments = {
  320: ${JSON.stringify(issueSynced.comment)},
  321: ${JSON.stringify(pullSynced.comment)}
};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
const path = args[1] || "";
const issueNumber = (path.match(/\\/issues\\/(\\d+)/) || [])[1];
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/(320|321)\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/(320|321)\\/comments(?:\\?|$)/.test(path)) {
  const number = Number(issueNumber);
  console.log(JSON.stringify([[{
    id: 9000 + number,
    html_url: "https://github.com/openclaw/openclaw/issues/" + number + "#issuecomment-" + (9000 + number),
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comments[number]
  }]]));
} else if (args[0] === "api" && /\\/issues\\/(320|321)\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/320$/.test(path)) {
  console.log(JSON.stringify({
    number: 320,
    title: "Paired issue",
    html_url: "https://github.com/openclaw/openclaw/issues/320",
    body: "See #321.",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    comments: 1,
    pull_request: null
  }));
} else if (args[0] === "api" && /\\/issues\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Paired PR",
    html_url: "https://github.com/openclaw/openclaw/pull/321",
    body: "Fixes #320.",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    comments: 1,
    pull_request: { url: "https://api.github.com/repos/openclaw/openclaw/pulls/321" }
  }));
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Paired PR",
    html_url: "https://github.com/openclaw/openclaw/pull/321",
    state: "open",
    changed_files: 0,
    commits: 0,
    review_comments: 0,
    body: "Fixes #320.",
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/openclaw" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/openclaw" } },
    user: { login: "reporter" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/321\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "label" || args[0] === "issue") {
  console.log("");
} else {
  console.error("unexpected gh args", JSON.stringify(args));
  process.exit(1);
}
`;
    withMockGh(root, ghMock, () => {
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
          "4",
        ],
      });
    });

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
    }>;
    assert.deepEqual(
      report.filter((entry) => entry.action === "closed").map((entry) => entry.number),
      [321, 320],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
