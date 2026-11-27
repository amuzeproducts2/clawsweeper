import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canPatchReviewComment,
  closeReasonApplyAgeSkipReason,
  closeReasonsArg,
  compactMappedSlice,
  compactMappedWindow,
  compactPullRequestForTest,
  compactReferencingMergedPullRequestForTest,
  referencingMergedPullRequestCandidatesForTest,
  referencingMergedPullRequestsForIssueForTest,
  configSurfaceChangeFromPullFilesForTest,
  dataModelChangeFromPullFilesForTest,
  extractLatestClawSweeperReviewForTest,
  failedReviewRetryEligibilityForTest,
  filterReviewContextCommentsForTest,
  fixedPullRequestFromCommitPullsForTest,
  formatRecentClosedRows,
  githubContextWindowPlan,
  ghPagedLinkHeaderContextWindow,
  ghPagedContextWindow,
  githubLinkLastPageNumber,
  githubPaginatedPath,
  hotIntakeRecencyMs,
  isCodexReviewCommentBody,
  isInfrastructureFailedReviewForTest,
  isProtectedItem,
  openClosingPullRequestApplyReason,
  parseGhJson,
  parseGhJsonLines,
  parseDecision,
  prRatingLabelsForTest,
  protectedLabels,
  renderReviewStartStatusComment,
  reviewAutomationMarkersFromReport,
  reviewActionForDecision,
  reviewPriority,
  reviewPromptForTest,
  renderReviewCommentFromReport,
  renderReviewContextBudgetForTest,
  renderWorkPlanFromReport,
  reviewContextLedgerForTest,
  reviewDecisionSchemaText,
  reviewPromptTelemetryForTest,
  reviewPromptTemplate,
  sameAuthorCounterpartApplyReason,
  sanitizePublicSelfReferences,
  appendFloorBackfillCandidateNumbersForTest,
  pullRequestFilePathsFromContextForTest,
  selectDueCandidateNumbersForTest,
  shouldStopSaturatedPlanScan,
  shouldReviewItem,
  shouldPlanItem,
  stripEmptyMaintainerRulingFieldsForTest,
  validateCloseDecision,
} from "../dist/clawsweeper.js";
import { checkConclusionForFrontMatter } from "../dist/commit-checks.js";
import { skippedNonCodeReport } from "../dist/commit-classifier.js";
import {
  commitReportRelativePath,
  isReviewableCommitPath,
  parseCommitReportSince,
  parseCoAuthors,
} from "../dist/commit-sweeper.js";
import { parseArgs as parseClawsweeperArgs } from "../dist/clawsweeper-args.js";

const tmpPrefix = join(tmpdir(), "clawsweeper-test-");

function item(overrides = {}) {
  return {
    repo: "openclaw/openclaw",
    number: 123,
    kind: "issue",
    title: "Sample item",
    url: "https://github.com/openclaw/openclaw/issues/123",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    author: "contributor",
    authorAssociation: "NONE",
    labels: [],
    ...overrides,
  };
}

function closeDecision(overrides = {}) {
  return {
    decision: "close",
    closeReason: "implemented_on_main",
    confidence: "high",
    summary: "Current main already implements this.",
    changeSummary: "Requests confirmation that the feature works on current main.",
    evidence: [
      {
        label: "implementation",
        detail: "The feature is present in source.",
        file: "src/example.ts",
        line: 12,
        command: null,
        sha: "abcdef1234567890",
      },
      {
        label: "git history provenance",
        detail: "git blame traces the implemented line to abcdef1234567890.",
        file: "src/example.ts",
        line: 12,
        command: "git blame -L 12,12 -- src/example.ts",
        sha: "abcdef1234567890",
      },
      {
        label: "release provenance",
        detail: "The fix is on current main and no containing release tag was found.",
        file: null,
        line: null,
        command: "git tag --contains abcdef1234567890",
        sha: "abcdef1234567890",
      },
    ],
    likelyOwners: [
      {
        person: "@alice",
        role: "introduced behavior",
        reason: "git blame points the relevant implementation line at abcdef1234567890.",
        commits: ["abcdef1234567890"],
        files: ["src/example.ts"],
        confidence: "high",
      },
      {
        person: "@bob",
        role: "recent maintainer",
        reason: "Recent adjacent commits changed the same code path.",
        commits: ["1234567890abcdef"],
        files: ["src/example.ts"],
        confidence: "medium",
      },
    ],
    risks: [],
    bestSolution: "Keep the implementation as-is.",
    triagePriority: "P2",
    impactLabels: [],
    mergeRiskLabels: [],
    mergeRiskOptions: [],
    reviewMetrics: [],
    labelJustifications: [
      {
        label: "P2",
        reason: "Normal priority applies to this limited-scope implemented behavior check.",
      },
    ],
    itemCategory: "bug",
    reproductionStatus: "reproduced",
    reproductionConfidence: "high",
    requiresNewFeature: false,
    requiresNewConfigOption: false,
    requiresProductDecision: false,
    reproductionAssessment:
      "Yes. Current main can be checked by inspecting src/example.ts and git blame evidence.",
    solutionAssessment:
      "Yes. Keeping the implementation as-is is the narrowest maintainable outcome.",
    visionFit: "not_applicable",
    visionFitReason: "Vision-fit assessment is not needed for this implemented close decision.",
    visionFitEvidence: [],
    implementationComplexity: "not_applicable",
    autoImplementationCandidate: "none",
    agentsPolicyStatus: {
      found: true,
      readFully: true,
      applied: true,
      status: "found_applied",
      summary: "Found AGENTS.md and applied relevant repository review guidance.",
    },
    reviewFindings: [],
    securityReview: {
      status: "not_applicable",
      summary: "No patch security review is needed for this issue cleanup decision.",
      concerns: [],
    },
    realBehaviorProof: {
      status: "not_applicable",
      summary: "Real behavior proof is not required for non-PR issue triage.",
      evidenceKind: "not_applicable",
      needsContributorAction: false,
    },
    prRating: {
      proofTier: "NA",
      patchTier: "NA",
      overallTier: "NA",
      summary: "PR readiness rating is not applicable to this issue cleanup decision.",
      nextSteps: [],
    },
    telegramVisibleProof: {
      status: "not_needed",
      summary: "This non-PR issue triage does not need Telegram visible proof.",
    },
    mantisRecommendation: {
      status: "not_recommended",
      scenario: "none",
      reason: "Mantis proof is not useful for this issue triage.",
      maintainerComment: "",
    },
    featureShowcase: {
      status: "none",
      reason: "This item is not an unusually compelling feature idea.",
    },
    overallCorrectness: "not a patch",
    overallConfidenceScore: 0.75,
    fixedRelease: null,
    fixedSha: "abcdef1234567890",
    fixedAt: "2026-04-28T12:00:00Z",
    closeComment: "Closing this as implemented after Codex review.\n\n- Evidence.",
    workCandidate: "none",
    workConfidence: "low",
    workPriority: "low",
    workReason: "Close decisions do not need a fix PR.",
    workPrompt: "",
    workClusterRefs: [],
    workValidation: [],
    workLikelyFiles: [],
    ...overrides,
  };
}

function reviewFinding(overrides = {}) {
  return {
    title: "Missing changelog entry",
    body: "This user-facing fix needs a CHANGELOG.md entry.",
    priority: 3,
    confidenceScore: 0.9,
    file: "src/runtime.ts",
    lineStart: 12,
    lineEnd: 12,
    ...overrides,
  };
}

function changelogReviewDecision(overrides = {}) {
  return closeDecision({
    decision: "keep_open",
    closeReason: "none",
    confidence: "high",
    bestSolution: "Add the required changelog entry before merge.",
    reviewFindings: [reviewFinding({ title: "Add the required changelog entry" })],
    overallCorrectness: "patch is incorrect",
    workCandidate: "queue_fix_pr",
    workConfidence: "high",
    workPriority: "medium",
    workReason: "Add the required changelog entry.",
    workPrompt: "Add a CHANGELOG.md entry.",
    workLikelyFiles: ["CHANGELOG.md"],
    ...overrides,
  });
}

function issueComment(
  id: number,
  body: string,
  login = "contributor",
  updatedAt = "2026-05-24T00:00:00Z",
) {
  return {
    id,
    body,
    html_url: `https://github.com/openclaw/openclaw/pull/123#issuecomment-${id}`,
    updated_at: updatedAt,
    created_at: updatedAt,
    user: { login },
    author_association: "CONTRIBUTOR",
  };
}

const git = {
  mainSha: "abcdef1234567890",
  latestRelease: null,
};

function reportFrontMatter(overrides = {}) {
  const values = {
    repository: "openclaw/openclaw",
    type: "issue",
    decision: "keep_open",
    close_reason: "none",
    confidence: "high",
    action_taken: "kept_open",
    ...overrides,
  };
  return `---
${Object.entries(values)
  .map(([key, value]) => `${key}: ${value}`)
  .join("\n")}
---
`;
}

function realBehaviorProofReportSection(overrides = {}) {
  const values = {
    status: "sufficient",
    evidenceKind: "terminal",
    needsContributorAction: false,
    summary:
      "The PR includes a terminal transcript from a real OpenClaw setup showing the fixed behavior after the patch.",
    ...overrides,
  };
  return `## Real Behavior Proof

Status: ${values.status}

Evidence kind: ${values.evidenceKind}

Needs contributor action: ${values.needsContributorAction}

Summary: ${values.summary}
`;
}

function prRatingReportSection(overrides = {}) {
  const values = {
    overallTier: "B",
    proofTier: "A",
    patchTier: "B",
    overallLabel: "🐚 platinum hermit",
    proofLabel: "🦞 diamond lobster",
    patchLabel: "🐚 platinum hermit",
    summary: "This PR has strong proof and normal merge-ready implementation quality.",
    nextSteps: "- none",
    ...overrides,
  };
  return `## PR Rating

Overall tier: ${values.overallTier}

Proof tier: ${values.proofTier}

Patch tier: ${values.patchTier}

Overall label: ${values.overallLabel}

Proof label: ${values.proofLabel}

Patch label: ${values.patchLabel}

Summary: ${values.summary}

Next rank-up steps:

${values.nextSteps}
`;
}

function detailsBody(markdown, summary) {
  const marker = `<summary>${summary}</summary>`;
  const markerIndex = markdown.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing details summary ${summary}`);
  const bodyStart = markerIndex + marker.length;
  const bodyEnd = markdown.indexOf("</details>", bodyStart);
  assert.notEqual(bodyEnd, -1, `missing details close for ${summary}`);
  return markdown.slice(bodyStart, bodyEnd);
}

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

function failedReviewReport(overrides = {}) {
  return `${workPlanCandidateReport({
    repository: "openclaw/openclaw",
    number: 4242,
    type: "pull_request",
    review_status: "failed",
    pull_head_sha: "abc123def456",
    decision: "keep_open",
    confidence: "low",
    action_taken: "kept_open",
    work_candidate: "none",
    ...overrides,
  })}

## Summary

Codex review failed: timeout.

## Evidence

- **failure reason:** timeout
- **codex failure detail:** Codex worker timed out after 600000ms with ETIMEDOUT.
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

test("githubPaginatedPath requests maximum REST page size by default", () => {
  assert.equal(
    githubPaginatedPath("repos/openclaw/openclaw/issues/123/comments"),
    "repos/openclaw/openclaw/issues/123/comments?per_page=100",
  );
  assert.equal(
    githubPaginatedPath("repos/openclaw/openclaw/issues?state=open&sort=created"),
    "repos/openclaw/openclaw/issues?state=open&sort=created&per_page=100",
  );
  assert.equal(
    githubPaginatedPath("repos/openclaw/openclaw/issues?per_page=50&state=open"),
    "repos/openclaw/openclaw/issues?per_page=50&state=open",
  );
});

test("compactMappedSlice maps only retained prompt entries", () => {
  const mapped: number[] = [];
  const result = compactMappedSlice([1, 2, 3, 4, 5, 6], 4, (value) => {
    mapped.push(value);
    return value * 10;
  });
  assert.deepEqual(result, [
    10,
    20,
    { omitted: 2, note: "middle entries omitted from prompt context" },
    50,
    60,
  ]);
  assert.deepEqual(mapped, [1, 2, 5, 6]);
});

test("compactMappedSlice maps every entry when no compaction is needed", () => {
  const mapped: number[] = [];
  const result = compactMappedSlice([1, 2, 3], 3, (value) => {
    mapped.push(value);
    return value * 10;
  });
  assert.deepEqual(result, [10, 20, 30]);
  assert.deepEqual(mapped, [1, 2, 3]);
});

test("compactMappedWindow marks omitted entries when hydration is already bounded", () => {
  const mapped: number[] = [];
  const result = compactMappedWindow([1, 2, 5, 6], 6, 4, (value) => {
    mapped.push(value);
    return value * 10;
  });
  assert.deepEqual(result, [
    10,
    20,
    { omitted: 2, note: "middle entries omitted from prompt context" },
    50,
    60,
  ]);
  assert.deepEqual(mapped, [1, 2, 5, 6]);
});

test("compactMappedWindow keeps bounded hydrated context when total is larger than limit", () => {
  const mapped: number[] = [];
  const result = compactMappedWindow([1, 2, 99, 100], 100, 4, (value) => {
    mapped.push(value);
    return value;
  });
  assert.deepEqual(result, [
    1,
    2,
    { omitted: 96, note: "middle entries omitted from prompt context" },
    99,
    100,
  ]);
  assert.deepEqual(mapped, [1, 2, 99, 100]);
});

test("review context comment filter removes ClawSweeper self-noise and command-only comments", () => {
  const comments = [
    issueComment(
      1,
      "Codex review: needs maintainer review.\n\n<!-- clawsweeper-review item=123 -->",
      "clawsweeper[bot]",
    ),
    issueComment(
      2,
      "Legacy generated comment\n\n<!-- clawsweeper-pr-egg-hatch:123 -->",
      "openclaw-clawsweeper[bot]",
    ),
    issueComment(
      3,
      "<!-- clawsweeper-command-status:123:re_review:abc -->\nQueued.",
      "clawsweeper",
    ),
    issueComment(
      7,
      "<!-- clawsweeper-visual item=123 lens=state sha=abc -->\n# Visual brief",
      "clawsweeper",
    ),
    issueComment(4, "@clawsweeper re-review", "author"),
    issueComment(5, "Here is real behavior proof from my terminal.", "author"),
    issueComment(6, "Actionable file/line review feedback.", "chatgpt-codex-connector[bot]"),
  ];

  const result = filterReviewContextCommentsForTest(comments, 123);

  assert.equal(result.filtered, 5);
  assert.deepEqual(
    result.included.map((comment) => (comment as { id: number }).id),
    [5, 6],
  );
});

test("visual brief sanitizer removes empty maintainer ruling template fields", () => {
  const body = [
    "# Visual brief",
    "",
    "The routing path is working.",
    "",
    "## Maintainer ruling",
    "",
    "Benefit:",
    "Risk:",
    "Proof needed:",
    "Recommended next action:",
    "Question presented:",
  ].join("\n");

  const sanitized = stripEmptyMaintainerRulingFieldsForTest(body);

  assert.equal(sanitized, "# Visual brief\n\nThe routing path is working.");
});

test("visual brief sanitizer keeps concrete maintainer ruling fields", () => {
  const body = [
    "# Visual brief",
    "",
    "## Maintainer ruling",
    "",
    "Benefit: Reduces operator confusion.",
    "Risk:",
    "Proof needed: Live router and assist smoke.",
    "Recommended next action:",
    "Question presented: Should maintainers accept this proof?",
  ].join("\n");

  const sanitized = stripEmptyMaintainerRulingFieldsForTest(body);

  assert.match(sanitized, /## Maintainer ruling/);
  assert.match(sanitized, /Benefit: Reduces operator confusion\./);
  assert.doesNotMatch(sanitized, /^Risk:$/m);
  assert.doesNotMatch(sanitized, /^Recommended next action:$/m);
  assert.match(sanitized, /Proof needed: Live router and assist smoke\./);
  assert.match(sanitized, /Question presented: Should maintainers accept this proof\?/);
});

test("review context comment filter keeps contributor text that only quotes markers", () => {
  const comments = [
    issueComment(
      1,
      "I pasted a prior marker while debugging: <!-- clawsweeper-review item=123 -->",
      "contributor",
    ),
  ];

  const result = filterReviewContextCommentsForTest(comments, 123);

  assert.equal(result.filtered, 0);
  assert.equal(result.included.length, 1);
  assert.equal(extractLatestClawSweeperReviewForTest(comments, 123), null);
});

test("latest ClawSweeper durable review is extracted as compact previous review state", () => {
  const older = issueComment(
    1,
    `Codex review: needs real behavior proof before merge.

**Latest ClawSweeper review:** 2026-05-24 01:00 UTC.

**Summary**
Old summary.

<!-- clawsweeper-verdict:needs-human item=123 sha=oldsha confidence=high -->

<!-- clawsweeper-review item=123 -->`,
    "clawsweeper[bot]",
    "2026-05-24T01:00:00Z",
  );
  const latest = issueComment(
    2,
    `Codex review: found issues before merge.

**Latest ClawSweeper review:** 2026-05-24 02:00 UTC.

**Summary**
The PR changes routing behavior.

**PR rating**
Overall: unranked.

**Real behavior proof**
Needs real behavior proof before merge.

**Review findings**
- [P1] Preserve session state - src/file.ts:10

<!-- clawsweeper-verdict:needs-human item=123 sha=newsha confidence=high -->
<!-- clawsweeper-action:fix-required item=123 sha=newsha confidence=high finding=review-feedback -->

<!-- clawsweeper-review item=123 -->`,
    "clawsweeper[bot]",
    "2026-05-24T02:00:00Z",
  );

  const review = extractLatestClawSweeperReviewForTest([older, latest], 123);

  assert.ok(review);
  assert.equal(review.status, "found issues before merge.");
  assert.equal(review.reviewedSha, "newsha");
  assert.equal(review.summary, "The PR changes routing behavior.");
  assert.equal(review.proofStatus, "Needs real behavior proof before merge.");
  assert.equal(review.findings[0]?.priority, "P1");
  assert.equal(review.findings[0]?.title, "Preserve session state");
  assert.doesNotMatch(JSON.stringify(review), /How this review workflow works/);
});

test("latest ClawSweeper durable review parser supports compact merge readiness layout", () => {
  const latest = issueComment(
    2,
    `Codex review: needs real behavior proof before merge. _Reviewed May 24, 2026, 8:34 AM ET / 12:34 UTC._

**Summary**
The PR changes review comment layout.

**Merge readiness**
Overall: 🧂 unranked krab
Proof: 🧂 unranked krab
Patch quality: 🦞 diamond lobster
Result: blocked until real behavior proof is added.

Overall follows the weaker of proof and patch quality, so missing proof can cap an otherwise strong patch.

Proof guidance:
Needs real behavior proof before merge: The PR has no real ingestion-run proof yet. After adding proof, update the PR body; ClawSweeper should re-review automatically.

**Next step before merge**
Add real behavior proof.

**Review findings**
- [P2] Keep prior-review extraction in sync — src/clawsweeper.ts:11021

<details>
<summary>Label changes</summary>

- add \`P2\`

</details>

<!-- clawsweeper-verdict:needs-human item=123 sha=newsha confidence=high -->

<!-- clawsweeper-review item=123 -->`,
    "clawsweeper[bot]",
    "2026-05-24T02:00:00Z",
  );

  const review = extractLatestClawSweeperReviewForTest([latest], 123);

  assert.ok(review);
  assert.equal(review.status, "needs real behavior proof before merge.");
  assert.equal(review.reviewedAt, "May 24, 2026, 8:34 AM ET / 12:34 UTC");
  assert.equal(review.reviewedSha, "newsha");
  assert.equal(review.summary, "The PR changes review comment layout.");
  assert.equal(review.rating, "Overall: 🧂 unranked krab");
  assert.match(review.proofStatus, /^Needs real behavior proof before merge:/);
  assert.equal(review.nextStep, "Add real behavior proof.");
  assert.equal(review.findings[0]?.priority, "P2");
  assert.equal(review.findings[0]?.title, "Keep prior-review extraction in sync");
});

test("githubContextWindowPlan includes prior page when the tail crosses a page boundary", () => {
  assert.deepEqual(githubContextWindowPlan(101, 80), {
    keepStart: 40,
    keepEnd: 40,
    tailFirstPageNumber: 1,
    lastPageNumber: 2,
    tailOffset: 61,
  });
});

test("githubContextWindowPlan keeps large tails to the final page when possible", () => {
  assert.deepEqual(githubContextWindowPlan(3000, 80), {
    keepStart: 40,
    keepEnd: 40,
    tailFirstPageNumber: 30,
    lastPageNumber: 30,
    tailOffset: 60,
  });
});

test("ghPagedContextWindow reuses first page when tail overlaps the head page", () => {
  const fetchedPages: number[] = [];
  const window = ghPagedContextWindow<number>(
    "repos/openclaw/openclaw/issues/123/comments",
    101,
    80,
    {
      page: (_path, page) => {
        fetchedPages.push(page);
        const start = (page - 1) * 100 + 1;
        const end = Math.min(page * 100, 101);
        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
      },
    },
  );

  assert.deepEqual(fetchedPages, [1, 2]);
  assert.deepEqual(window.items, [
    ...Array.from({ length: 40 }, (_, index) => index + 1),
    ...Array.from({ length: 40 }, (_, index) => index + 62),
  ]);
  assert.equal(window.total, 101);
  assert.equal(window.hydrated, 80);
  assert.equal(window.truncated, true);
});

test("ghPagedContextWindow falls back to full pagination when total is missing", () => {
  const window = ghPagedContextWindow<number>(
    "repos/openclaw/openclaw/pulls/123/files",
    undefined,
    80,
    {
      paged: () => [1, 2, 3],
      page: () => {
        throw new Error("page fetch should not be used without a total count");
      },
    },
  );

  assert.deepEqual(window, {
    items: [1, 2, 3],
    total: 3,
    hydrated: 3,
    truncated: false,
  });
});

test("githubLinkLastPageNumber extracts the final REST page", () => {
  assert.equal(
    githubLinkLastPageNumber(
      '<https://api.github.com/repositories/123/issues/1/timeline?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/123/issues/1/timeline?per_page=100&page=30>; rel="last"',
    ),
    30,
  );
  assert.equal(githubLinkLastPageNumber(undefined), null);
});

test("ghPagedLinkHeaderContextWindow uses GitHub link headers for large timeline tails", () => {
  const fetchedPages: number[] = [];
  const window = ghPagedLinkHeaderContextWindow<number>(
    "repos/openclaw/openclaw/issues/123/timeline",
    80,
    {
      pageWithHeaders: (_path, page) => {
        fetchedPages.push(page);
        const start = (page - 1) * 100 + 1;
        return {
          items: Array.from({ length: 100 }, (_, index) => start + index),
          lastPageNumber: page === 1 ? 30 : null,
        };
      },
      paged: () => {
        throw new Error("full pagination should not be used with link headers");
      },
    },
  );

  assert.deepEqual(fetchedPages, [1, 30]);
  assert.deepEqual(window.items, [
    ...Array.from({ length: 40 }, (_, index) => index + 1),
    ...Array.from({ length: 40 }, (_, index) => index + 2961),
  ]);
  assert.equal(window.total, 3000);
  assert.equal(window.hydrated, 80);
  assert.equal(window.truncated, true);
});

test("ghPagedLinkHeaderContextWindow keeps timeline tails that cross the first page", () => {
  const fetchedPages: number[] = [];
  const window = ghPagedLinkHeaderContextWindow<number>(
    "repos/openclaw/openclaw/issues/123/timeline",
    80,
    {
      pageWithHeaders: (_path, page) => {
        fetchedPages.push(page);
        if (page === 1) {
          return {
            items: Array.from({ length: 100 }, (_, index) => index + 1),
            lastPageNumber: 2,
          };
        }
        return { items: [101], lastPageNumber: null };
      },
    },
  );

  assert.deepEqual(fetchedPages, [1, 2]);
  assert.deepEqual(window.items, [
    ...Array.from({ length: 40 }, (_, index) => index + 1),
    ...Array.from({ length: 40 }, (_, index) => index + 62),
  ]);
  assert.equal(window.total, 101);
  assert.equal(window.hydrated, 80);
  assert.equal(window.truncated, true);
});

test("ghPagedLinkHeaderContextWindow falls back when link headers are unavailable", () => {
  const window = ghPagedLinkHeaderContextWindow<number>(
    "repos/openclaw/openclaw/issues/123/timeline",
    80,
    {
      pageWithHeaders: () => ({
        items: Array.from({ length: 100 }, (_, index) => index + 1),
        lastPageNumber: null,
      }),
      paged: () => [1, 2, 3],
    },
  );

  assert.deepEqual(window, {
    items: [1, 2, 3],
    total: 3,
    hydrated: 3,
    truncated: false,
  });
});

test("review prompt assets match tracked files", () => {
  assert.equal(reviewPromptTemplate(), readFileSync("prompts/review-item.md", "utf8"));
  assert.deepEqual(
    JSON.parse(reviewDecisionSchemaText()),
    JSON.parse(readFileSync("schema/clawsweeper-decision.schema.json", "utf8")),
  );
});

test("main CLI args ignore package-manager double dash separators", () => {
  assert.deepEqual(parseClawsweeperArgs(["apply-decisions", "--", "--dry-run"]), {
    _: ["apply-decisions"],
    dry_run: true,
  });
  assert.deepEqual(parseClawsweeperArgs(["apply-decisions", "--limit", "1", "--", "--dry-run"]), {
    _: ["apply-decisions"],
    limit: "1",
    dry_run: true,
  });
});

test("review prompt telemetry records durable cost proxies", () => {
  const context = {
    issue: { number: 123, title: "Sample item" },
    comments: [{ author: "contributor", body: "This still reproduces." }],
    timeline: [],
    counts: { comments: 1, timeline: 0 },
  };

  const telemetry = reviewPromptTelemetryForTest(
    item({ title: "Telemetry regression" }),
    context,
    git,
    "keep extra instructions visible",
  );

  assert.ok(telemetry.staticPromptChars > 1000);
  assert.ok(telemetry.schemaChars > 1000);
  assert.ok(telemetry.contextChars >= JSON.stringify(context, null, 2).length);
  assert.ok(telemetry.promptChars > telemetry.staticPromptChars + telemetry.contextChars);
  assert.equal(telemetry.additionalPromptChars, "keep extra instructions visible".length);
});

test("review prompt includes compact previous review state without raw durable review body", () => {
  const context = {
    issue: { number: 123, title: "Sample PR" },
    comments: [{ author: "contributor", body: "After-fix proof is attached." }],
    timeline: [],
    previousClawSweeperReview: {
      status: "found issues before merge.",
      reviewedSha: "abc123",
      summary: "Prior review found one blocker.",
    },
    counts: { comments: 3, commentsIncluded: 1, commentsFiltered: 2, timeline: 0 },
  };

  const prompt = reviewPromptForTest(item({ kind: "pull_request", number: 123 }), context, git);

  assert.match(prompt, /"previousClawSweeperReview"/);
  assert.match(prompt, /Prior review found one blocker/);
  assert.match(prompt, /"commentsFiltered": 2/);
  assert.doesNotMatch(prompt, /How this review workflow works/);
});

test("review prompt includes merge state and guards clean behind-branch drift", () => {
  const compactPullRequest = compactPullRequestForTest({
    number: 123,
    title: "Sample PR",
    html_url: "https://github.com/openclaw/openclaw/pull/123",
    state: "open",
    draft: false,
    merged: false,
    mergeable: true,
    mergeable_state: "clean",
    head: { ref: "feature", sha: "head123" },
    base: { ref: "main", sha: "base123" },
    user: { login: "contributor" },
    additions: 10,
    deletions: 2,
    changed_files: 1,
  });
  const context = {
    issue: { number: 123, title: "Sample PR" },
    comments: [],
    timeline: [],
    pullRequest: compactPullRequest,
    counts: { comments: 0, timeline: 0 },
  };

  const prompt = reviewPromptForTest(item({ kind: "pull_request", number: 123 }), context, git);

  assert.deepEqual((compactPullRequest as { mergeableState?: unknown }).mergeableState, "clean");
  assert.match(prompt, /"mergeableState": "clean"/);
  assert.match(prompt, /Do not treat a branch being behind the current base as proof/);
  assert.match(prompt, /actual three-way merge result/);
});

test("review context ledger records ordered section budgets", () => {
  const context = {
    issue: { number: 123, title: "Sample PR" },
    comments: [{ author: "alice", body: "Please review this." }],
    timeline: [{ event: "committed", sha: "abc123" }],
    previousClawSweeperReview: {
      status: "found issues before merge.",
      reviewedSha: "abc123",
      summary: "Prior review found one blocker.",
    },
    relatedItems: [{ number: 122, title: "Related issue" }],
    pullRequest: { number: 123, additions: 12 },
    pullFiles: [
      { filename: "src/example.ts", patch: "line\n".repeat(20) },
      { filename: "test/example.test.ts", patch: "test\n".repeat(20) },
    ],
    pullCommits: [{ sha: "abc123", message: "fix example" }],
    pullReviewComments: [],
    counts: {
      comments: 10,
      commentsHydrated: 1,
      commentsTruncated: true,
      timeline: 1,
      timelineHydrated: 1,
      timelineTruncated: false,
      relatedItems: 1,
      pullFiles: 120,
      pullFilesHydrated: 2,
      pullFilesTruncated: true,
      pullCommits: 1,
      pullCommitsHydrated: 1,
      pullCommitsTruncated: false,
      pullReviewComments: 0,
      pullReviewCommentsHydrated: 0,
      pullReviewCommentsTruncated: false,
    },
  };

  const ledger = reviewContextLedgerForTest(context);

  assert.deepEqual(
    ledger.map(({ section, entries, total, hydrated, truncated }) => [
      section,
      entries,
      total,
      hydrated,
      truncated,
    ]),
    [
      ["issue", 1, undefined, undefined, undefined],
      ["comments", 1, 10, 1, true],
      ["timeline", 1, 1, 1, false],
      ["previousClawSweeperReview", 1, undefined, undefined, undefined],
      ["relatedItems", 1, 1, undefined, undefined],
      ["pullRequest", 1, undefined, undefined, undefined],
      ["pullFiles", 2, 120, 2, true],
      ["pullCommits", 1, 1, 1, false],
      ["counts", 16, undefined, undefined, undefined],
    ],
  );
  assert.equal(
    ledger.find((entry) => entry.section === "pullFiles")?.chars,
    JSON.stringify(context.pullFiles, null, 2).length,
  );
  assert.match(
    renderReviewContextBudgetForTest(context),
    /- PR files: 2\/120 hydrated, truncated, \d+ chars/,
  );
  assert.match(renderReviewContextBudgetForTest(context), /- timeline events: 1\/1 hydrated/);
  assert.match(renderReviewContextBudgetForTest(context), /- previous ClawSweeper review: 1 entry/);
});

test("protected labels are normalized and only maintainer-only items stay plannable", () => {
  assert.deepEqual(protectedLabels(["Security", "bug", "maintainer", "SECURITY"]), [
    "security",
    "maintainer",
  ]);
  assert.equal(isProtectedItem(item({ labels: ["release-blocker"] })), true);
  assert.equal(shouldPlanItem(item({ authorAssociation: "MEMBER" })), true);
  assert.equal(shouldPlanItem(item({ labels: ["maintainer"] })), true);
  assert.equal(shouldPlanItem(item({ labels: ["maintainer", "security"] })), false);
  assert.equal(shouldPlanItem(item({ labels: ["beta-blocker"] })), false);
  assert.equal(shouldPlanItem(item({ labels: ["bug"] })), true);
});

test("parseGhJson adds gh command context to malformed JSON errors", () => {
  assert.throws(
    () => parseGhJson("{", ["api", "repos/openclaw/openclaw/issues"]),
    /Failed to parse JSON from gh api repos\/openclaw\/openclaw\/issues:/,
  );
});

test("parseGhJsonLines adds line number and command context to malformed JSONL errors", () => {
  assert.throws(
    () => parseGhJsonLines('{"ok":true}\nnot-json\n', ["issue", "list", "--json", "number"]),
    /Failed to parse JSON line 2 from gh issue list --json:/,
  );
});

test("commit review reports use one canonical path per commit", () => {
  const sha = "abcdef1234567890abcdef1234567890abcdef12";
  assert.equal(
    commitReportRelativePath("openclaw/openclaw", sha),
    "records/openclaw-openclaw/commits/abcdef1234567890abcdef1234567890abcdef12.md",
  );
});

test("commit review parses co-authored-by trailers", () => {
  assert.deepEqual(
    parseCoAuthors(`subject

Body text.

Co-authored-by: Alice Example <alice@example.com>
Co-authored-by: Bob Example <bob@example.com>
co-authored-by: Alice Example <alice@example.com>
`),
    ["Alice Example", "Bob Example"],
  );
});

test("commit report since parser accepts compact and natural windows", () => {
  const now = new Date("2026-04-29T12:00:00.000Z");
  assert.equal(parseCommitReportSince("6h", now).toISOString(), "2026-04-29T06:00:00.000Z");
  assert.equal(
    parseCommitReportSince("24 hours ago", now).toISOString(),
    "2026-04-28T12:00:00.000Z",
  );
  assert.equal(parseCommitReportSince("last 7d", now).toISOString(), "2026-04-22T12:00:00.000Z");
});

test("skipped non-code commit reports include commit timestamps for listing", () => {
  const report = skippedNonCodeReport({
    targetRepo: "openclaw/openclaw",
    sha: "abcdef1234567890abcdef1234567890abcdef12",
    metadata: {
      parents: ["0123456789abcdef0123456789abcdef01234567"],
      authorName: "Alice",
      authorEmail: "alice@example.com",
      committerName: "Bob",
      committerEmail: "bob@example.com",
      authoredAt: "2026-04-29T10:00:00Z",
      committedAt: "2026-04-29T10:05:00Z",
      coAuthors: [],
      githubAuthor: "alice",
      githubCommitter: "bob",
    },
    changedFiles: ["docs/usage.md"],
  });
  assert.match(report, /commit_authored_at: "2026-04-29T10:00:00Z"/);
  assert.match(report, /commit_committed_at: "2026-04-29T10:05:00Z"/);
});

test("commit review cheaply skips documentation-only paths", () => {
  assert.equal(isReviewableCommitPath("docs/usage.md"), false);
  assert.equal(isReviewableCommitPath("CHANGELOG.md"), false);
  assert.equal(isReviewableCommitPath("README.md"), false);
  assert.equal(isReviewableCommitPath("assets/logo.png"), false);
  assert.equal(isReviewableCommitPath("test/clawsweeper.test.ts"), true);
  assert.equal(isReviewableCommitPath("src/clawsweeper.ts"), true);
  assert.equal(isReviewableCommitPath(".github/workflows/sweep.yml"), true);
  assert.equal(isReviewableCommitPath("package.json"), true);
});

test("skipped non-code commit reports still publish green checks", () => {
  assert.equal(
    checkConclusionForFrontMatter({ result: "skipped_non_code", highest_severity: "none" }),
    "success",
  );
});

test("commit review check conclusions stay conservative", () => {
  assert.equal(
    checkConclusionForFrontMatter({ result: "nothing_found", highest_severity: "none" }),
    "success",
  );
  assert.equal(
    checkConclusionForFrontMatter({ result: "findings", highest_severity: "high" }),
    "failure",
  );
  assert.equal(
    checkConclusionForFrontMatter({ result: "findings", highest_severity: "medium" }),
    "neutral",
  );
  assert.equal(checkConclusionForFrontMatter({ result: "inconclusive" }), "neutral");
});

test("protected labels block close proposals even for otherwise valid decisions", () => {
  const validation = validateCloseDecision(item({ labels: ["security"] }), closeDecision());
  assert.equal(validation.ok, false);
  assert.equal(validation.actionTaken, "skipped_protected_label");

  const action = reviewActionForDecision({
    item: item({ labels: ["security"] }),
    decision: closeDecision(),
    git,
  });
  assert.equal(action.actionTaken, "skipped_protected_label");
  assert.equal(action.closeComment, "");
});

test("verified fixed maintainer items can become close proposals", () => {
  const validation = validateCloseDecision(item({ labels: ["maintainer"] }), closeDecision());
  assert.deepEqual(validation, { ok: true });

  const action = reviewActionForDecision({
    item: item({ authorAssociation: "MEMBER", labels: ["maintainer"] }),
    decision: closeDecision(),
    git,
  });
  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /already implemented/);
});

test("maintainer items stay protected for non-fixed close reasons", () => {
  const validation = validateCloseDecision(
    item({ labels: ["maintainer"] }),
    closeDecision({ closeReason: "duplicate_or_superseded" }),
  );
  assert.equal(validation.ok, false);
  assert.equal(validation.actionTaken, "skipped_protected_label");

  const action = reviewActionForDecision({
    item: item({ authorAssociation: "MEMBER" }),
    decision: closeDecision({ closeReason: "duplicate_or_superseded" }),
    git,
  });
  assert.equal(action.actionTaken, "skipped_maintainer_authored");
  assert.equal(action.closeComment, "");
});

test("review actions only propose valid closes and never apply directly", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision(),
    git,
    runtime: { model: "gpt-5.5", reasoningEffort: "high" },
  });
  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /Thanks for the context here/);
  assert.match(action.closeComment, /shell check/);
  assert.match(action.closeComment, /already implemented/);
  assert.match(action.closeComment, /<details>\n<summary>Review details<\/summary>/);
  assert.match(
    action.closeComment,
    /Do we have a high-confidence way to reproduce the issue\?\n\nYes\. Current main can be checked/,
  );
  assert.match(
    action.closeComment,
    /Is this the best way to solve the issue\?\n\nYes\. Keeping the implementation as-is/,
  );
  assert.ok(
    action.closeComment.indexOf("Is this the best way to solve the issue?") <
      action.closeComment.indexOf("What I checked:"),
  );
  assert.match(action.closeComment, /Likely related people:/);
  assert.match(action.closeComment, /@alice/);
  assert.match(action.closeComment, /@bob/);
  assert.doesNotMatch(action.closeComment, /role: recent maintainer/);
  assert.match(action.closeComment, /role: recent area contributor/);
  assert.match(action.closeComment, /Codex review notes: model gpt-5\.5, reasoning high;/);
});

test("review actions render deterministic close comments when model close comment is empty", () => {
  const decision = closeDecision({ closeComment: "" });
  const action = reviewActionForDecision({
    item: item(),
    decision,
    git,
    runtime: { model: "gpt-5.5", reasoningEffort: "high" },
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /Thanks for the context here/);
  assert.match(action.closeComment, /already implemented/);

  const applyValidation = validateCloseDecision(item(), decision);
  assert.equal(applyValidation.ok, false);
  assert.equal(applyValidation.reason, "missing close comment");
});

test("close comments reference high-confidence merged fixing PRs", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      fixedPullRequest: {
        repo: "openclaw/openclaw",
        number: 456,
        url: "https://github.com/openclaw/openclaw/pull/456",
        title: "fix: wire the shell check",
        mergedAt: "2026-04-28T12:00:00Z",
        sha: "fedcba9876543210",
        confidence: "high",
        source: "GitHub closing PR reference",
      },
    }),
    git,
    runtime: { model: "gpt-5.5", reasoningEffort: "high" },
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /merged PR that appears to have closed this: \[#456: fix: wire the shell check\]\(https:\/\/github\.com\/openclaw\/openclaw\/pull\/456\)/,
  );
  assert.match(
    action.closeComment,
    /fix evidence: merged PR \[#456\]\(https:\/\/github\.com\/openclaw\/openclaw\/pull\/456\), commit/,
  );
});

test("commit PR lookup selects the newest merged pull request", () => {
  const fixedPullRequest = fixedPullRequestFromCommitPullsForTest([
    {
      number: 455,
      html_url: "https://github.com/openclaw/openclaw/pull/455",
      title: "fix: older candidate",
      merged: true,
      merged_at: "2026-04-27T12:00:00Z",
      merge_commit_sha: "1111111111111111",
    },
    {
      number: 456,
      html_url: "https://github.com/openclaw/openclaw/pull/456",
      title: "fix: wire the shell check",
      merged_at: "2026-04-28T12:00:00Z",
      merge_commit_sha: "fedcba9876543210",
    },
    {
      number: 457,
      html_url: "https://github.com/openclaw/openclaw/pull/457",
      title: "open follow-up",
      merged: false,
    },
  ]);

  assert.deepEqual(fixedPullRequest, {
    repo: "openclaw/openclaw",
    number: 456,
    url: "https://github.com/openclaw/openclaw/pull/456",
    title: "fix: wire the shell check",
    mergedAt: "2026-04-28T12:00:00Z",
    sha: "fedcba9876543210",
    confidence: "high",
    source: "GitHub commit PR lookup",
  });
});

test("report-rendered close comments keep merged fixing PR provenance", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "issue",
      number: "123",
      title: JSON.stringify("Sample item"),
      decision: "close",
      close_reason: "implemented_on_main",
      action_taken: "proposed_close",
      fixed_pr_url: "https://github.com/openclaw/openclaw/pull/456",
      fixed_pr_number: "456",
      fixed_pr_title: JSON.stringify("fix: wire the shell check"),
      fixed_pr_merged_at: "2026-04-28T12:00:00Z",
      fixed_pr_sha: "fedcba9876543210",
      fixed_pr_confidence: "high",
      fixed_pr_source: JSON.stringify("GitHub closing PR reference"),
      fixed_sha: "abcdef1234567890",
      fixed_at: "2026-04-28T12:00:00Z",
      main_sha: "abcdef1234567890",
      review_model: "gpt-5.5",
      review_reasoning_effort: "high",
    })}

## Summary

Current main already implements this.

## Best Possible Solution

Keep the implementation as-is.

## Reproduction Assessment

Yes. Current main can be checked by inspecting source and history.

## Solution Assessment

Yes. Keeping the implementation as-is is the narrowest maintainable outcome.

## Evidence

- **implementation:** The feature is present in source.
  - file: [src/example.ts:12](https://github.com/openclaw/openclaw/blob/abcdef1234567890/src/example.ts#L12)
  - sha: [abcdef1234567890](https://github.com/openclaw/openclaw/commit/abcdef1234567890)

## Likely Owners

- **@alice:** introduced behavior
  - reason: git blame points at the fix.
  - confidence: high
  - commits: abcdef1234567890
  - files: src/example.ts
`,
    "implemented_on_main",
  );

  assert.match(
    comment,
    /merged PR that appears to have closed this: \[#456: fix: wire the shell check\]\(https:\/\/github\.com\/openclaw\/openclaw\/pull\/456\)/,
  );
  assert.match(comment, /fix evidence: merged PR \[#456\]/);
});

test("close comments suppress duplicate best solution text", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      summary: "Keep the implementation as-is.",
      bestSolution: "Keep the implementation as-is.",
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.doesNotMatch(action.closeComment, /Best possible solution:/);
});

test("review details show applied AGENTS.md policy status", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision(),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /<summary>Review details<\/summary>/);
  assert.match(action.closeComment, /AGENTS\.md: found and applied where relevant\./);
});

test("review details show missing AGENTS.md policy status", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      agentsPolicyStatus: {
        found: false,
        readFully: false,
        applied: false,
        status: "not_found",
        summary: "No target repository AGENTS.md was found.",
      },
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /AGENTS\.md: not found in the target repository\./);
});

test("likely owner commit links ignore non-sha values", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      likelyOwners: [
        {
          person: "@alice",
          role: "feature contributor",
          reason: "The changelog credits a pull request for this feature surface.",
          commits: ["https://github.com/openclaw/openclaw/pull/76079", " abcdef1234567890 "],
          files: ["CHANGELOG.md"],
          confidence: "medium",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.doesNotMatch(action.closeComment, /\/commit\/https:/);
  assert.match(
    action.closeComment,
    /\[abcdef123456\]\(https:\/\/github\.com\/openclaw\/openclaw\/commit\/abcdef1234567890\)/,
  );
});

test("skill-only OpenClaw PRs can close through ClawHub with upload guidance", () => {
  const decision = closeDecision({
    closeReason: "clawhub",
    summary:
      "The branch adds an optional bundled skill and does not change required core behavior.",
    changeSummary: "Adds bundled Higgsfield skill files under skills/higgsfield.",
    bestSolution:
      "Publish the skill through ClawHub so it stays installable outside OpenClaw core.",
    itemCategory: "skill",
    reproductionStatus: "not_applicable",
    reproductionConfidence: "high",
    securityReview: {
      status: "cleared",
      summary:
        "The PR is a skill-only content addition and should move to the community skill path.",
      concerns: [],
    },
    realBehaviorProof: {
      status: "not_applicable",
      summary: "Real behavior proof is not needed for a scope-fit close.",
      evidenceKind: "not_applicable",
      needsContributorAction: false,
    },
  });
  const pr = item({
    kind: "pull_request",
    url: "https://github.com/openclaw/openclaw/pull/78018",
  });

  assert.equal(validateCloseDecision(pr, decision).ok, true);

  const action = reviewActionForDecision({
    item: pr,
    decision,
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /ClawHub\.com/);
  assert.match(action.closeComment, /upload or publish/i);
  assert.match(action.closeComment, /installable community skill/);
});

test("ClawHub policy allows main-implemented issue and PR close proposals", () => {
  const implementedPr = validateCloseDecision(
    item({
      repo: "openclaw/clawhub",
      kind: "pull_request",
      url: "https://github.com/openclaw/clawhub/pull/123",
    }),
    closeDecision(),
  );
  assert.equal(implementedPr.ok, true);

  const implementedIssue = validateCloseDecision(
    item({
      repo: "openclaw/clawhub",
      kind: "issue",
      url: "https://github.com/openclaw/clawhub/issues/123",
    }),
    closeDecision(),
  );
  assert.equal(implementedIssue.ok, true);

  const nonImplementedPr = validateCloseDecision(
    item({
      repo: "openclaw/clawhub",
      kind: "pull_request",
      url: "https://github.com/openclaw/clawhub/pull/123",
    }),
    closeDecision({ closeReason: "cannot_reproduce" }),
  );
  assert.equal(nonImplementedPr.ok, false);
  assert.equal(nonImplementedPr.actionTaken, "skipped_invalid_decision");
});

test("ClawSweeper policy allows self implemented-on-main issue and PR close proposals", () => {
  const implementedPr = validateCloseDecision(
    item({
      repo: "openclaw/clawsweeper",
      kind: "pull_request",
      url: "https://github.com/openclaw/clawsweeper/pull/17",
    }),
    closeDecision(),
  );
  assert.equal(implementedPr.ok, true);

  const implementedIssue = validateCloseDecision(
    item({
      repo: "openclaw/clawsweeper",
      kind: "issue",
      url: "https://github.com/openclaw/clawsweeper/issues/17",
    }),
    closeDecision(),
  );
  assert.equal(implementedIssue.ok, true);
});

test("review policy changes force fresh complete reports back into planning", () => {
  const reviewedAt = new Date().toISOString();
  const review = {
    path: "items/123.md",
    markdown: "",
    reviewedAt,
    itemUpdatedAt: "2026-01-01T00:00:00Z",
    decision: "keep_open",
    reviewStatus: "complete",
    reviewPolicy: "old-policy",
  };
  const now = Date.parse(reviewedAt) + 60_000;

  assert.equal(shouldReviewItem(item(), review, now, "new-policy"), true);
  assert.equal(shouldReviewItem(item(), review, now, "old-policy"), false);
});

test("hot new items review daily unless target-side activity requires hourly cadence", () => {
  const now = Date.parse("2026-04-26T12:00:00Z");
  const review = (reviewedAt, itemUpdatedAt) => ({
    path: "items/123.md",
    markdown: "",
    reviewedAt,
    itemUpdatedAt,
    decision: "keep_open",
    reviewStatus: "complete",
    reviewPolicy: "current",
  });

  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
      }),
      review("2026-04-26T10:00:00Z", "2026-04-24T00:00:00Z"),
      now,
      "current",
    ),
    false,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
      }),
      review("2026-04-25T10:00:00Z", "2026-04-24T00:00:00Z"),
      now,
      "current",
    ),
    true,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-26T11:10:00Z",
      }),
      review("2026-04-26T10:00:00Z", "2026-04-24T00:00:00Z"),
      now,
      "current",
    ),
    true,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      }),
      review("2026-04-24T12:00:00Z", "2026-03-01T00:00:00Z"),
      now,
      "current",
    ),
    false,
  );
  assert.equal(
    shouldReviewItem(
      item({
        kind: "pull_request",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      }),
      review("2026-04-25T10:00:00Z", "2026-03-01T00:00:00Z"),
      now,
      "current",
    ),
    true,
  );
});

test("scheduler ignores ClawSweeper-owned updated_at churn after review", () => {
  const reviewedAt = "2026-04-30T12:52:57Z";
  const review = {
    path: "items/123.md",
    markdown: "",
    reviewedAt,
    itemUpdatedAt: "2026-04-30T11:17:05Z",
    decision: "keep_open",
    reviewStatus: "complete",
    reviewPolicy: "current",
  };
  const now = Date.parse("2026-04-30T14:10:00Z");

  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-03-01T11:12:04Z",
        updatedAt: "2026-04-30T12:52:56Z",
      }),
      review,
      now,
      "current",
    ),
    false,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-03-01T11:12:04Z",
        updatedAt: "2026-04-30T13:05:00Z",
      }),
      { ...review, reviewCommentSyncedAt: "2026-04-30T13:04:59Z" },
      now,
      "current",
    ),
    true,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-03-01T11:12:04Z",
        updatedAt: "2026-04-30T13:04:58Z",
      }),
      { ...review, reviewCommentSyncedAt: "2026-04-30T13:04:59Z" },
      now,
      "current",
    ),
    false,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-03-01T11:12:04Z",
        updatedAt: "2026-04-30T13:04:58Z",
      }),
      { ...review, labelsSyncedAt: "2026-04-30T13:04:59Z" },
      now,
      "current",
    ),
    false,
  );
  assert.equal(
    shouldReviewItem(
      item({
        createdAt: "2026-03-01T11:12:04Z",
        updatedAt: "2026-04-30T13:05:00Z",
      }),
      { ...review, labelsSyncedAt: "2026-04-30T13:04:59Z" },
      now,
      "current",
    ),
    true,
  );
});

test("hot new item priority is protected from older activity churn", () => {
  const now = Date.parse("2026-04-30T12:00:00Z");
  const review = (reviewedAt, itemUpdatedAt) => ({
    path: "items/123.md",
    markdown: "",
    reviewedAt,
    itemUpdatedAt,
    decision: "keep_open",
    reviewStatus: "complete",
    reviewPolicy: "current",
  });

  const hotIssue = item({
    createdAt: "2026-04-28T13:38:22Z",
    updatedAt: "2026-04-29T05:46:35Z",
  });
  const olderActiveIssue = item({
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-04-30T11:00:00Z",
  });

  assert.equal(
    reviewPriority(
      hotIssue,
      review("2026-04-29T07:24:53Z", "2026-04-29T05:46:35Z"),
      now,
      "current",
    ) <
      reviewPriority(
        olderActiveIssue,
        review("2026-04-30T10:00:00Z", "2026-04-29T00:00:00Z"),
        now,
        "current",
      ),
    true,
  );
});

test("hot issue priority is protected from hot PR backlog", () => {
  const now = Date.parse("2026-04-30T12:00:00Z");
  const review = {
    path: "items/123.md",
    markdown: "",
    reviewedAt: "2026-04-29T07:24:53Z",
    itemUpdatedAt: "2026-04-29T05:46:35Z",
    decision: "keep_open",
    reviewStatus: "complete",
    reviewPolicy: "current",
  };

  assert.equal(
    reviewPriority(
      item({
        kind: "issue",
        createdAt: "2026-04-28T13:38:22Z",
        updatedAt: "2026-04-29T05:46:35Z",
      }),
      review,
      now,
      "current",
    ) <
      reviewPriority(
        item({
          kind: "pull_request",
          createdAt: "2026-04-28T13:38:22Z",
          updatedAt: "2026-04-29T05:46:35Z",
        }),
        review,
        now,
        "current",
      ),
    true,
  );
});

test("hot issue priority is protected from policy mismatch backlog", () => {
  const now = Date.parse("2026-04-30T12:00:00Z");
  const review = (reviewPolicy) => ({
    path: "items/123.md",
    markdown: "",
    reviewedAt: "2026-04-29T07:24:53Z",
    itemUpdatedAt: "2026-04-29T05:46:35Z",
    decision: "keep_open",
    reviewStatus: "complete",
    reviewPolicy,
  });

  assert.equal(
    reviewPriority(
      item({
        kind: "issue",
        createdAt: "2026-04-28T13:38:22Z",
        updatedAt: "2026-04-29T05:46:35Z",
      }),
      review("old-policy"),
      now,
      "current",
    ) <
      reviewPriority(
        item({
          kind: "issue",
          createdAt: "2026-03-01T00:00:00Z",
          updatedAt: "2026-03-01T00:00:00Z",
        }),
        review("old-policy"),
        now,
        "current",
      ),
    true,
  );
});

test("normal scheduler reserves throughput for PR and older buckets", () => {
  const due = [];
  for (let number = 1; number <= 12; number += 1) {
    due.push({
      item: item({ number, kind: "issue", createdAt: "2026-04-30T00:00:00Z" }),
      bucket: "hot_issue",
      priority: 0,
      nextDueAt: number,
    });
  }
  due.push(
    {
      item: item({
        number: 101,
        kind: "pull_request",
        createdAt: "2026-04-30T00:00:00Z",
      }),
      bucket: "hot_pull_request",
      priority: 1,
      nextDueAt: 1,
    },
    {
      item: item({
        number: 201,
        kind: "pull_request",
        createdAt: "2026-03-01T00:00:00Z",
      }),
      bucket: "daily_pull_request",
      priority: 3,
      nextDueAt: 1,
    },
    {
      item: item({ number: 301, kind: "issue", createdAt: "2026-03-01T00:00:00Z" }),
      bucket: "weekly_issue",
      priority: 6,
      nextDueAt: 1,
    },
  );

  assert.deepEqual(selectDueCandidateNumbersForTest(due, 8), [1, 2, 3, 4, 101, 201, 301, 5]);
});

test("normal scheduler can fill active floor from stale current reviews", () => {
  const selected = [
    {
      item: item({ number: 1, kind: "issue", createdAt: "2026-04-30T00:00:00Z" }),
      bucket: "hot_issue",
      priority: 0,
      nextDueAt: 1,
    },
  ];
  const backfill = [
    {
      item: item({ number: 10, kind: "pull_request", createdAt: "2026-03-01T00:00:00Z" }),
      bucket: "daily_pull_request",
      priority: 3,
      reviewedAt: 100,
      nextDueAt: 1000,
    },
    {
      item: item({ number: 11, kind: "issue", createdAt: "2026-03-01T00:00:00Z" }),
      bucket: "weekly_issue",
      priority: 6,
      reviewedAt: 50,
      nextDueAt: 2000,
    },
    {
      item: item({ number: 1, kind: "issue", createdAt: "2026-04-30T00:00:00Z" }),
      bucket: "hot_issue",
      priority: 0,
      reviewedAt: 25,
      nextDueAt: 3000,
    },
  ];

  assert.deepEqual(
    appendFloorBackfillCandidateNumbersForTest(selected, backfill, 3, 10),
    [1, 10, 11],
  );
  assert.deepEqual(appendFloorBackfillCandidateNumbersForTest(selected, backfill, 3, 2), [1, 10]);
});

test("normal scheduler can stop scanning once planned capacity is saturated", () => {
  assert.equal(shouldStopSaturatedPlanScan({ dueCount: 99, capacity: 100 }), false);
  assert.equal(shouldStopSaturatedPlanScan({ dueCount: 100, capacity: 100 }), true);
  assert.equal(shouldStopSaturatedPlanScan({ dueCount: 150, capacity: 100 }), true);
  assert.equal(shouldStopSaturatedPlanScan({ dueCount: 1, capacity: 0 }), false);
});

test("hot intake recency prefers newly updated or created issues", () => {
  assert.equal(
    hotIntakeRecencyMs(
      item({
        createdAt: "2026-04-29T21:28:12Z",
        updatedAt: "2026-04-29T21:28:12Z",
      }),
    ) >
      hotIntakeRecencyMs(
        item({
          createdAt: "2026-04-27T02:40:44Z",
          updatedAt: "2026-04-27T02:40:44Z",
        }),
      ),
    true,
  );
  assert.equal(
    hotIntakeRecencyMs(
      item({
        createdAt: "2026-04-27T02:40:44Z",
        updatedAt: "2026-04-29T22:30:00Z",
      }),
    ),
    Date.parse("2026-04-29T22:30:00Z"),
  );
});

test("invalid close semantics are rejected", () => {
  const mediumClose = reviewActionForDecision({
    item: item(),
    decision: closeDecision({ confidence: "medium" }),
    git,
  });
  assert.equal(mediumClose.actionTaken, "skipped_invalid_decision");

  const stalePr = validateCloseDecision(
    item({ kind: "pull_request" }),
    closeDecision({ closeReason: "stale_insufficient_info" }),
  );
  assert.equal(stalePr.ok, false);
  assert.equal(stalePr.actionTaken, "skipped_invalid_decision");

  const mostlyImplementedIssue = validateCloseDecision(
    item({ kind: "issue" }),
    closeDecision({ closeReason: "mostly_implemented_on_main" }),
  );
  assert.equal(mostlyImplementedIssue.ok, false);
  assert.equal(mostlyImplementedIssue.actionTaken, "skipped_invalid_decision");
  assert.equal(
    mostlyImplementedIssue.reason,
    "mostly_implemented_on_main is allowed only for pull requests",
  );

  const lowSignalIssue = validateCloseDecision(
    item({ kind: "issue" }),
    closeDecision({ closeReason: "low_signal_unmergeable_pr" }),
  );
  assert.equal(lowSignalIssue.ok, false);
  assert.equal(lowSignalIssue.actionTaken, "skipped_invalid_decision");
  assert.equal(
    lowSignalIssue.reason,
    "low_signal_unmergeable_pr is allowed only for pull requests",
  );

  const missingEvidence = validateCloseDecision(item(), closeDecision({ evidence: [] }));
  assert.equal(missingEvidence.ok, false);
  assert.equal(missingEvidence.actionTaken, "skipped_invalid_decision");

  const contradictoryClose = validateCloseDecision(
    item(),
    closeDecision({
      summary: "Keep open: this is useful but needs a wording fix before merge.",
      closeReason: "duplicate_or_superseded",
    }),
  );
  assert.equal(contradictoryClose.ok, false);
  assert.equal(contradictoryClose.actionTaken, "skipped_invalid_decision");
  assert.equal(contradictoryClose.reason, "close decision contains Keep open guidance");

  const missingSource = validateCloseDecision(
    item(),
    closeDecision({
      evidence: [
        {
          label: "claim",
          detail: "Looks implemented.",
          file: null,
          line: null,
          command: "rg feature",
          sha: null,
        },
      ],
    }),
  );
  assert.equal(missingSource.ok, false);
  assert.equal(missingSource.actionTaken, "skipped_invalid_decision");
});

test("implemented-on-main closes require fix provenance", () => {
  const missingFixedSha = validateCloseDecision(
    item(),
    closeDecision({
      fixedSha: null,
    }),
  );
  assert.equal(missingFixedSha.ok, false);
  assert.equal(missingFixedSha.reason, "implemented_on_main requires fixedSha");

  const invalidFixedAt = validateCloseDecision(
    item(),
    closeDecision({
      fixedAt: "recently",
    }),
  );
  assert.equal(invalidFixedAt.ok, false);
  assert.equal(invalidFixedAt.reason, "implemented_on_main fixedAt must be an ISO timestamp");

  const dateOnlyFixedAt = validateCloseDecision(
    item(),
    closeDecision({
      fixedAt: "2026-04-28",
    }),
  );
  assert.equal(dateOnlyFixedAt.ok, false);
  assert.equal(dateOnlyFixedAt.reason, "implemented_on_main fixedAt must be an ISO timestamp");

  const missingReleaseOrTimestamp = validateCloseDecision(
    item(),
    closeDecision({
      fixedRelease: null,
      fixedAt: null,
    }),
  );
  assert.equal(missingReleaseOrTimestamp.ok, false);
  assert.equal(
    missingReleaseOrTimestamp.reason,
    "implemented_on_main requires fixedRelease or fixedAt",
  );

  const missingProvenanceEvidence = validateCloseDecision(
    item(),
    closeDecision({
      evidence: [
        {
          label: "implementation",
          detail: "The feature is present in source.",
          file: "src/example.ts",
          line: 12,
          command: null,
          sha: "abcdef1234567890",
        },
      ],
    }),
  );
  assert.equal(missingProvenanceEvidence.ok, false);
  assert.equal(
    missingProvenanceEvidence.reason,
    "implemented_on_main requires git history provenance evidence",
  );

  const missingReleaseStateEvidence = validateCloseDecision(
    item(),
    closeDecision({
      evidence: [
        {
          label: "implementation",
          detail: "The feature is present in source.",
          file: "src/example.ts",
          line: 12,
          command: null,
          sha: "abcdef1234567890",
        },
        {
          label: "git history provenance",
          detail: "git blame traced this line to the fixed commit.",
          file: "src/example.ts",
          line: 12,
          command: "git blame -L 12,12 -- src/example.ts",
          sha: "abcdef1234567890",
        },
      ],
    }),
  );
  assert.equal(missingReleaseStateEvidence.ok, false);
  assert.equal(
    missingReleaseStateEvidence.reason,
    "implemented_on_main requires release or main-only provenance evidence",
  );

  const blameAndMainTimestamp = validateCloseDecision(
    item(),
    closeDecision({
      fixedRelease: null,
      fixedAt: "2026-04-28T12:00:00Z",
      evidence: [
        {
          label: "implementation",
          detail: "The feature is present in source.",
          file: "src/example.ts",
          line: 12,
          command: null,
          sha: "abcdef1234567890",
        },
        {
          label: "git history provenance",
          detail: "git blame traced this line to the fixed commit.",
          file: "src/example.ts",
          line: 12,
          command: "git blame -L 12,12 -- src/example.ts",
          sha: "abcdef1234567890",
        },
        {
          label: "main-only release provenance",
          detail: "No shipped release tag contains the fix; current main includes it.",
          file: null,
          line: null,
          command: "git tag --contains abcdef1234567890",
          sha: "abcdef1234567890",
        },
      ],
    }),
  );
  assert.equal(blameAndMainTimestamp.ok, true);

  const mostlyImplementedPr = validateCloseDecision(
    item({ kind: "pull_request" }),
    closeDecision({
      closeReason: "mostly_implemented_on_main",
      summary: "Current main implements the useful part of this older PR.",
      closeComment:
        "Closing this older PR because current main already covers the useful change and the remaining branch diff is obsolete.",
    }),
  );
  assert.equal(mostlyImplementedPr.ok, true);

  const lowSignalPr = validateCloseDecision(
    item({ kind: "pull_request" }),
    closeDecision({
      closeReason: "low_signal_unmergeable_pr",
      summary: "The useful docs note is tiny, but the branch adds unrelated reference churn.",
      closeComment:
        "Closing this as low-signal unmergeable after Codex review.\n\n- Useful part: the clamp note is worth preserving in a narrow PR.\n- Unmergeable branch: most of this diff is unrelated copied reference material.",
    }),
  );
  assert.equal(lowSignalPr.ok, true);
});

test("low-signal unmergeable PR closes explain the narrow useful path", () => {
  const action = reviewActionForDecision({
    item: item({ kind: "pull_request" }),
    decision: closeDecision({
      closeReason: "low_signal_unmergeable_pr",
      summary:
        "The useful clamp documentation is small, but this branch is mostly unrelated reference churn.",
      evidence: [
        {
          label: "unrelated diff",
          detail:
            "The PR adds a large copied provider reference block while the stated docs fix is one field note.",
          file: "docs/gateway/configuration-reference.md",
          line: 95,
          command: "gh pr diff 72085 --repo openclaw/openclaw --name-only",
          sha: "588bf29604ffb0d599c5acb6417e962ae9f95e1f",
        },
      ],
      closeComment:
        "Closing this as low-signal unmergeable after Codex review.\n\n- Useful part: the clamp docs note is worth preserving.\n- Unmergeable branch: this branch adds a large unrelated reference block, so it is not a good landing base.",
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /not a good landing base/);
  assert.match(action.closeComment, /new narrow PR/);
  assert.match(action.closeComment, /useful clamp documentation is small/);
  assert.match(action.closeComment, /copied provider reference block/);
});

test("duplicate or superseded closes are allowed with evidence and comment", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: "Close as duplicate: an older open tracker already covers this.",
      bestSolution:
        "Keep the design thread on https://github.com/openclaw/openclaw/issues/63829, with https://github.com/openclaw/openclaw/pull/67584 as the active implementation path.",
      evidence: [
        {
          label: "canonical issue",
          detail: "Issue #456 tracks the same remaining work.",
          file: null,
          line: null,
          command: "provided GitHub related item context",
          sha: null,
        },
      ],
      closeComment:
        "Closing this as duplicate or superseded after Codex review.\n\n- Canonical issue: #456 tracks the same remaining work.",
    }),
    git,
  });
  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /duplicate or superseded/);
  assert.match(action.closeComment, /swept through the related work/);
  assert.match(
    action.closeComment,
    /Canonical path: Keep the design thread on https:\/\/github\.com\/openclaw\/openclaw\/issues\/63829, with https:\/\/github\.com\/openclaw\/openclaw\/pull\/67584 as the active implementation path\./,
  );
  assert.match(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/63829 and https:\/\/github\.com\/openclaw\/openclaw\/pull\/67584\./,
  );
  assert.ok(
    action.closeComment.indexOf("Canonical path:") <
      action.closeComment.indexOf("<details>\n<summary>Review details</summary>"),
  );
});

test("duplicate or superseded comments surface canonical refs appended to summary text", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: "Close as duplicate: an older tracker already covers this.",
      bestSolution:
        "Close as duplicate: an older tracker already covers this in https://github.com/openclaw/openclaw/issues/63829.",
      evidence: [
        {
          label: "canonical issue",
          detail: "Older tracker exists at https://github.com/openclaw/openclaw/issues/63829.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /Canonical path: Close as duplicate: an older tracker already covers this in https:\/\/github\.com\/openclaw\/openclaw\/issues\/63829\./,
  );
});

test("duplicate or superseded comments prefer canonical refs over generic best solution", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: "Close as duplicate: an older tracker already covers this.",
      bestSolution: "Keep following the canonical issue.",
      evidence: [
        {
          label: "canonical issue",
          detail: "Older tracker exists at https://github.com/openclaw/openclaw/issues/63829.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /Canonical path: Older tracker exists at https:\/\/github\.com\/openclaw\/openclaw\/issues\/63829\./,
  );
  assert.match(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/63829\./,
  );
});

test("duplicate or superseded close sentence surfaces multiple canonical refs", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary:
        "Close as duplicate: the remaining timeout contract work is tracked in canonical timeout threads.",
      bestSolution: "Resolve timeout precedence in the canonical timeout-policy threads.",
      evidence: [
        {
          label: "Canonical provider-timeout issue remains open",
          detail:
            "Live GitHub context for https://github.com/openclaw/openclaw/issues/77744 covers provider timeout behavior.",
        },
        {
          label: "Canonical idle-timeout policy issue remains open",
          detail:
            "Live GitHub context for https://github.com/openclaw/openclaw/issues/78361 covers user-facing idle-timeout precedence.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/77744 and https:\/\/github\.com\/openclaw\/openclaw\/issues\/78361\./,
  );
  assert.ok(
    action.closeComment.indexOf("https://github.com/openclaw/openclaw/issues/77744") <
      action.closeComment.indexOf("<details>\n<summary>Review details</summary>"),
  );
});

test("duplicate or superseded close sentence ignores ambiguous shorthand refs", () => {
  const action = reviewActionForDecision({
    item: item({ number: 123 }),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: "Close #123 as duplicate of PR #456.",
      bestSolution: "Close #123 as duplicate of PR #456.",
      evidence: [
        {
          label: "canonical pull request",
          detail: "PR #456 tracks the same work.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /So I’m closing this here because the remaining work is already tracked in the canonical issue\./,
  );
  assert.doesNotMatch(
    action.closeComment,
    /https:\/\/github\.com\/openclaw\/openclaw\/issues\/123/,
  );
  assert.doesNotMatch(
    action.closeComment,
    /https:\/\/github\.com\/openclaw\/openclaw\/issues\/456/,
  );
});

test("duplicate or superseded close sentence filters current item URLs", () => {
  const action = reviewActionForDecision({
    item: item({ number: 123 }),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: "Close as duplicate of the canonical tracker.",
      bestSolution: "Keep remaining work on https://github.com/openclaw/openclaw/issues/456.",
      evidence: [
        {
          label: "Duplicate report context",
          detail:
            "https://github.com/openclaw/openclaw/issues/123 is the duplicate report being closed.",
        },
        {
          label: "Canonical issue",
          detail: "https://github.com/openclaw/openclaw/issues/456 tracks the same work.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/456\./,
  );
  assert.doesNotMatch(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/123/,
  );
});

test("duplicate or superseded reference extraction ignores repeated malformed GitHub URLs", () => {
  const repeatedMalformedUrl = Array.from({ length: 100 }, () => "https://github.com/").join("");
  const action = reviewActionForDecision({
    item: item({ number: 123 }),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: `Close as duplicate after checking ${repeatedMalformedUrl}.`,
      bestSolution: "Keep remaining work on https://github.com/openclaw/openclaw/issues/456.",
      evidence: [
        {
          label: "Malformed URL noise",
          detail: repeatedMalformedUrl,
        },
        {
          label: "Canonical issue",
          detail: "https://github.com/openclaw/openclaw/issues/456 tracks the same work.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/456\./,
  );
});

test("duplicate or superseded close sentence includes duplicate-labeled canonical URL", () => {
  const action = reviewActionForDecision({
    item: item({ number: 123 }),
    decision: closeDecision({
      closeReason: "duplicate_or_superseded",
      summary: "Close as duplicate of the older tracker.",
      bestSolution: "Follow the linked duplicate tracker.",
      evidence: [
        {
          label: "Duplicate issue",
          detail: "https://github.com/openclaw/openclaw/issues/456 is the older open tracker.",
        },
      ],
    }),
    git,
  });

  assert.equal(action.actionTaken, "proposed_close");
  assert.match(
    action.closeComment,
    /So I’m closing this here and keeping the remaining discussion on https:\/\/github\.com\/openclaw\/openclaw\/issues\/456\./,
  );
});

test("apply close reason filters support exact fast-close lanes", () => {
  assert.equal(closeReasonsArg("all"), null);
  assert.deepEqual([...closeReasonsArg("implemented_on_main, duplicate_or_superseded")].sort(), [
    "duplicate_or_superseded",
    "implemented_on_main",
  ]);
  assert.throws(() => closeReasonsArg("stale"), /Invalid apply close reason: stale/);
});

test("stale and mostly-implemented closes require older items while implemented closes can be immediate", () => {
  const now = Date.parse("2026-04-28T12:00:00Z");
  const freshItem = item({ createdAt: "2026-04-28T11:59:00Z" });
  const oldItem = item({ createdAt: "2026-01-01T00:00:00Z" });

  assert.equal(
    closeReasonApplyAgeSkipReason(freshItem, "implemented_on_main", {
      minAgeMs: 0,
      minAgeDescription: "0 minutes",
      staleMinAgeDays: 60,
      now,
    }),
    null,
  );
  assert.equal(
    closeReasonApplyAgeSkipReason(freshItem, "duplicate_or_superseded", {
      minAgeMs: 5 * 60 * 1000,
      minAgeDescription: "5 minutes",
      staleMinAgeDays: 60,
      now,
    }),
    "created less than or equal to 5 minutes ago",
  );
  assert.equal(
    closeReasonApplyAgeSkipReason(freshItem, "stale_insufficient_info", {
      minAgeMs: 0,
      minAgeDescription: "0 minutes",
      staleMinAgeDays: 60,
      now,
    }),
    "stale_insufficient_info requires item older than 60 days",
  );
  assert.equal(
    closeReasonApplyAgeSkipReason(freshItem, "mostly_implemented_on_main", {
      minAgeMs: 0,
      minAgeDescription: "0 minutes",
      staleMinAgeDays: 60,
      now,
    }),
    "mostly_implemented_on_main requires item older than 60 days",
  );
  assert.equal(
    closeReasonApplyAgeSkipReason(oldItem, "mostly_implemented_on_main", {
      minAgeMs: 0,
      minAgeDescription: "0 minutes",
      staleMinAgeDays: 60,
      now,
    }),
    null,
  );
});

test("open PRs that close an issue block apply closes", () => {
  assert.equal(
    openClosingPullRequestApplyReason([
      { number: 69425, state: "open", title: "daemon: honor OPENCLAW_WRAPPER" },
    ]),
    "open PR #69425 (daemon: honor OPENCLAW_WRAPPER) is a closing reference",
  );
  assert.equal(
    openClosingPullRequestApplyReason([{ number: 69425, state: "closed", title: "done" }]),
    null,
  );
  assert.equal(
    openClosingPullRequestApplyReason(
      [{ number: 69425, state: "open", title: "daemon: honor OPENCLAW_WRAPPER" }],
      (number) => number === 69425,
    ),
    null,
  );
  assert.equal(
    openClosingPullRequestApplyReason(
      [
        {
          number: 69425,
          repo: "other/repo",
          state: "open",
          title: "daemon: honor OPENCLAW_WRAPPER",
        },
      ],
      (number, repo) => number === 69425 && repo === "openclaw/openclaw",
    ),
    "open PR #69425 (daemon: honor OPENCLAW_WRAPPER) is a closing reference",
  );
});

test("compactReferencingMergedPullRequest extracts fields from search API response", () => {
  const result = compactReferencingMergedPullRequestForTest({
    number: 87654,
    title: "fix: handle disconnect on shutdown",
    html_url: "https://github.com/openclaw/openclaw/pull/87654",
    body: "Fixes the disconnect issue. Refs #78419",
    user: { login: "contributor" },
    pull_request: { merged_at: "2026-04-01T10:00:00Z" },
  });
  assert.deepEqual(result, {
    number: 87654,
    title: "fix: handle disconnect on shutdown",
    url: "https://github.com/openclaw/openclaw/pull/87654",
    author: "contributor",
    mergedAt: "2026-04-01T10:00:00Z",
    body: "Fixes the disconnect issue. Refs #78419",
  });
});

test("compactReferencingMergedPullRequest handles null body", () => {
  // Compact function produces body:"" for null body; rows with null merged_at are filtered
  // out upstream by referencingMergedPullRequestCandidates before reaching this function.
  const result = compactReferencingMergedPullRequestForTest({
    number: 11111,
    title: "chore: bump deps",
    html_url: "https://github.com/openclaw/openclaw/pull/11111",
    body: null,
    user: { login: "bot" },
    pull_request: { merged_at: "2026-01-01T00:00:00Z" },
  });
  assert.deepEqual(result, {
    number: 11111,
    title: "chore: bump deps",
    url: "https://github.com/openclaw/openclaw/pull/11111",
    author: "bot",
    mergedAt: "2026-01-01T00:00:00Z",
    body: "",
  });
});

test("compactReferencingMergedPullRequest truncates long bodies", () => {
  const longBody = "x".repeat(4000);
  const result = compactReferencingMergedPullRequestForTest({
    number: 22222,
    title: "refactor: big change",
    html_url: "https://github.com/openclaw/openclaw/pull/22222",
    body: longBody,
    user: { login: "alice" },
    pull_request: { merged_at: "2026-01-01T00:00:00Z" },
  });
  const body = (result as { body: string }).body;
  assert.ok(body.length < 4000, "body should be shorter than the original 4000 chars");
  assert.ok(body.length > 0, "body should be non-empty");
});

test("referencingMergedPullRequestCandidates keeps only items with non-null pull_request.merged_at", () => {
  const items = [
    // kept: PR with merge timestamp
    {
      number: 1,
      title: "fix: real fix",
      html_url: "https://github.com/openclaw/openclaw/pull/1",
      body: "Refs #999",
      user: { login: "alice" },
      pull_request: { merged_at: "2026-03-01T10:00:00Z" },
    },
    // dropped: issue (no pull_request field)
    {
      number: 2,
      title: "bug: still broken",
      html_url: "https://github.com/openclaw/openclaw/issues/2",
      body: "body",
      user: { login: "bob" },
    },
    // dropped: PR shape present but merged_at is null
    {
      number: 3,
      title: "wip: not merged",
      html_url: "https://github.com/openclaw/openclaw/pull/3",
      body: "",
      user: { login: "carol" },
      pull_request: { merged_at: null },
    },
  ];
  const result = referencingMergedPullRequestCandidatesForTest(items);
  assert.equal(result.length, 1);
  assert.equal((result[0] as { number: number }).number, 1);
});

test("referencingMergedPullRequestCandidates returns empty for all-issue input", () => {
  const result = referencingMergedPullRequestCandidatesForTest([
    {
      number: 10,
      title: "issue",
      html_url: "https://github.com/openclaw/openclaw/issues/10",
      body: "",
      user: { login: "x" },
    },
  ]);
  assert.deepEqual(result, []);
});

test("referencingMergedPullRequestsForIssue returns [] when kill-switch env disables search", () => {
  const previous = process.env.CLAWSWEEPER_REFERENCING_PR_SEARCH;
  for (const value of ["0", "false", "no", "off", "disabled", "OFF"]) {
    process.env.CLAWSWEEPER_REFERENCING_PR_SEARCH = value;
    try {
      assert.deepEqual(
        referencingMergedPullRequestsForIssueForTest(78398),
        [],
        `kill-switch should accept "${value}"`,
      );
    } finally {
      if (previous === undefined) delete process.env.CLAWSWEEPER_REFERENCING_PR_SEARCH;
      else process.env.CLAWSWEEPER_REFERENCING_PR_SEARCH = previous;
    }
  }
});

test("referencingMergedPullRequestsForIssue swallows gh failures and returns []", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    withMockGh(
      root,
      `#!/usr/bin/env node\nprocess.stderr.write("simulated gh failure\\n"); process.exit(1);\n`,
      () => {
        assert.deepEqual(referencingMergedPullRequestsForIssueForTest(78398), []);
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("referencingMergedPullRequestsForIssue filters and compacts mixed gh response", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const ghMock = `#!/usr/bin/env node
console.log(JSON.stringify({
  items: [
    {
      number: 84209,
      title: "fix: handle disconnect",
      html_url: "https://github.com/openclaw/openclaw/pull/84209",
      body: "Refs #78398",
      user: { login: "alice" },
      pull_request: { merged_at: "2026-03-04T12:00:00Z" }
    },
    {
      number: 84210,
      title: "issue, not a pr",
      html_url: "https://github.com/openclaw/openclaw/issues/84210",
      body: "mentions #78398",
      user: { login: "bob" }
    },
    {
      number: 84211,
      title: "pr, not merged",
      html_url: "https://github.com/openclaw/openclaw/pull/84211",
      body: "Refs #78398",
      user: { login: "carol" },
      pull_request: { merged_at: null }
    }
  ]
}));
`;
    withMockGh(root, ghMock, () => {
      const result = referencingMergedPullRequestsForIssueForTest(78398);
      assert.equal(result.length, 1);
      assert.deepEqual(result[0], {
        number: 84209,
        title: "fix: handle disconnect",
        url: "https://github.com/openclaw/openclaw/pull/84209",
        author: "alice",
        mergedAt: "2026-03-04T12:00:00Z",
        body: "Refs #78398",
      });
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same-author open issue and PR pairs block one-sided apply closes", () => {
  assert.equal(
    sameAuthorCounterpartApplyReason(item({ number: 42, author: "alice" }), [
      {
        issue: {
          number: 43,
          title: "Fix the same bug",
          state: "open",
          author: "alice",
        },
        pullRequest: {
          number: 43,
          title: "Fix the same bug",
          state: "open",
          author: "alice",
        },
      },
    ]),
    "open PR #43 (Fix the same bug) by the same author is paired with this issue",
  );
  assert.equal(
    sameAuthorCounterpartApplyReason(item({ number: 42, kind: "pull_request", author: "alice" }), [
      {
        localReport: {
          number: 41,
          kind: "issue",
          title: "Fix the same bug",
          author: "Alice",
          location: "items",
        },
      },
    ]),
    "open issue #41 (Fix the same bug) by the same author is paired with this PR",
  );
  assert.equal(
    sameAuthorCounterpartApplyReason(item({ number: 42, author: "alice" }), [
      { issue: { number: 43, title: "Different author", state: "open", author: "bob" } },
    ]),
    null,
  );
  assert.equal(
    sameAuthorCounterpartApplyReason(
      item({ number: 42, author: "alice" }),
      [
        {
          issue: {
            number: 43,
            title: "Fix the same bug",
            state: "open",
            author: "alice",
          },
          pullRequest: {
            number: 43,
            title: "Fix the same bug",
            state: "open",
            author: "alice",
          },
        },
      ],
      (number, kind) => number === 43 && kind === "pull_request",
    ),
    null,
  );
});

test("not-actionable-in-repo closes are allowed with evidence and comment", () => {
  const action = reviewActionForDecision({
    item: item(),
    decision: closeDecision({
      closeReason: "not_actionable_in_repo",
      evidence: [
        {
          label: "external administration",
          detail: "The request is for GitHub project settings, not OpenClaw source code.",
          file: null,
          line: null,
          command: "provided GitHub issue context",
          sha: null,
        },
      ],
      closeComment:
        "Closing this as not actionable in this repository after Codex review.\n\n- External administration: GitHub project settings are outside OpenClaw source code.",
    }),
    git,
  });
  assert.equal(action.actionTaken, "proposed_close");
  assert.match(action.closeComment, /Thanks for writing this up/);
  assert.match(action.closeComment, /outside the OpenClaw source shell/);
});

test("close reason labels keep incoherent distinct from not actionable in repo", () => {
  const rows = formatRecentClosedRows([
    {
      repo: "openclaw/openclaw",
      number: 1,
      kind: "issue",
      title: "Unclear report",
      closeReason: "incoherent",
      appliedAt: "2026-04-26T20:00:00.000Z",
      reportPath: "records/openclaw-openclaw/closed/1.md",
    },
    {
      repo: "openclaw/openclaw",
      number: 2,
      kind: "issue",
      title: "Repository settings request",
      closeReason: "not_actionable_in_repo",
      appliedAt: "2026-04-26T20:01:00.000Z",
      reportPath: "records/openclaw-openclaw/closed/2.md",
    },
  ]);

  assert.match(rows, /too unclear to act on/);
  assert.match(rows, /not actionable in this repository/);
  assert.doesNotMatch(rows, /\|\s*not actionable\s*\|/);
});

test("public comments avoid self-referencing the current item number", () => {
  const comment = sanitizePublicSelfReferences(
    "Issue #69400 is tracked by PR #69425, which says Fixes #69400. Close #69400 later.",
    69400,
    "issue",
  );

  assert.equal(
    comment,
    "This issue is tracked by PR #69425, which says Fixes this issue. Close this issue later.",
  );
});

test("comment matcher recognizes old and new Codex review comments", () => {
  assert.equal(
    isCodexReviewCommentBody(
      "Closing this as implemented after Codex review.\n\nCodex Review notes: reviewed against abc.",
    ),
    true,
  );
  assert.equal(
    isCodexReviewCommentBody(
      "Codex automated review: keeping this open.\n\nBest possible solution:\n\nShip it.",
    ),
    true,
  );
  assert.equal(
    isCodexReviewCommentBody(
      "Codex review: keeping this open for maintainer follow-up; there is still a little grit to resolve.\n\nBest possible solution:\n\nShip it.",
    ),
    true,
  );
  assert.equal(
    isCodexReviewCommentBody(
      "Codex review: needs maintainer review before merge.\n\nMaintainer follow-up before merge:\n\nShip it.",
    ),
    true,
  );
  assert.equal(isCodexReviewCommentBody("Thanks for the report, I can reproduce this."), false);
});

test("review comment patching only targets ClawSweeper-owned comments", () => {
  assert.equal(canPatchReviewComment({ user: { login: "clawsweeper" } }), true);
  assert.equal(canPatchReviewComment({ user: { login: "clawsweeper[bot]" } }), true);
  assert.equal(canPatchReviewComment({ user: { login: "openclaw-clawsweeper[bot]" } }), true);
  assert.equal(canPatchReviewComment({ user: { login: "steipete" } }), false);
  assert.equal(canPatchReviewComment(undefined), false);
});

test("review start status comment is marker-backed and crustacean-friendly", () => {
  const comment = renderReviewStartStatusComment({
    number: 74453,
    kind: "pull_request",
    title: "fix webhook limiter",
    position: 1,
    total: 3,
    shardIndex: 0,
    shardCount: 2,
  });

  assert.match(comment, /ClawSweeper status: review started\./);
  assert.match(comment, /claws on keyboard/);
  assert.match(comment, /<!-- clawsweeper-review-status:started item=74453 -->/);
  assert.match(comment, /<!-- clawsweeper-review item=74453 -->/);
  assert.doesNotMatch(comment, /Codex review:/);
});

test("pull request keep-open review comments label the change summary", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74265",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
      reviewed_at: "2026-05-22T04:43:12.000Z",
    })}

## Summary

Keep this test-only PR open for maintainer review.

## What This Changes

Adds regression coverage for session-scoped model overrides.

## Best Possible Solution

Land the tests after targeted validation is green.

## Reproduction Assessment

Not applicable. This is a test-only PR and the validation path is the targeted test lane.

## Solution Assessment

Yes. Landing the focused regression test after the targeted lane is green is the narrowest useful path.

## AGENTS.md Policy Status

Status: found_applied

Found: true

Read fully: true

Applied: true

Summary: Found AGENTS.md and applied relevant repository review guidance.

## Work Candidate

Candidate: none

Confidence: low

Priority: low

Status: none

Reason: Maintainers should review the tests after the targeted lane is green.

## Evidence

- **targeted lane:** The PR is test-only and should run the matching changed-test lane.
	`,
    "none",
  );

  assert.match(
    comment,
    /Codex review: needs maintainer review before merge\. _Reviewed May 22, 2026, 12:43 AM ET \/ 04:43 UTC\._/,
  );
  assert.doesNotMatch(comment, /\*\*Latest ClawSweeper review:\*\*/);
  assert.match(
    comment,
    /\*\*Summary\*\*\nAdds regression coverage for session-scoped model overrides\./,
  );
  assert.doesNotMatch(comment, /\*\*Workflow note:\*\*/);
  assert.match(comment, /<summary>How this review workflow works<\/summary>/);
  assert.match(
    comment,
    /- Re-runs edit this comment so the latest verdict, findings, and automation markers stay together instead of adding duplicate bot comments\./,
  );
  assert.match(
    comment,
    /- A fresh review can be triggered by eligible `@clawsweeper re-review` comments, exact-item GitHub events, scheduled\/background review runs, or manual workflow dispatch\./,
  );
  assert.match(
    comment,
    /- PR\/issue authors and users with repository write access can comment `@clawsweeper re-review` or `@clawsweeper re-run` on an open PR or issue to request a fresh review only\./,
  );
  assert.match(
    comment,
    /- Maintainers can also comment `@clawsweeper review` to request a fresh review only\./,
  );
  assert.match(
    comment,
    /- Fresh-review commands do not start repair, autofix, rebase, CI repair, or automerge\./,
  );
  assert.match(
    comment,
    /- Maintainer-only repair and merge flows require explicit commands such as `@clawsweeper autofix`, `@clawsweeper automerge`, `@clawsweeper fix ci`, or `@clawsweeper address review`\./,
  );
  assert.match(
    comment,
    /- Maintainers can comment `@clawsweeper explain` to ask for more context, or `@clawsweeper stop` to stop active automation\./,
  );
  assert.match(comment, /\*\*Next step before merge\*\*/);
  assert.match(comment, /Maintainers should review the tests after the targeted lane is green\./);
  assert.match(comment, /<details>\n<summary>Review details<\/summary>/);
  assert.match(
    comment,
    /Best possible solution:\n\nLand the tests after targeted validation is green\./,
  );
  assert.match(
    comment,
    /Do we have a high-confidence way to reproduce the issue\?\n\nNot applicable\. This is a test-only PR/,
  );
  assert.match(
    comment,
    /Is this the best way to solve the issue\?\n\nYes\. Landing the focused regression test/,
  );
  assert.match(
    detailsBody(comment, "Review details"),
    /AGENTS\.md: found and applied where relevant\./,
  );
  assert.doesNotMatch(
    detailsBody(comment, "Evidence reviewed"),
    /AGENTS\.md: found and applied where relevant\./,
  );
  assert.ok(
    comment.indexOf("Is this the best way to solve the issue?") <
      comment.indexOf("<summary>Evidence reviewed</summary>"),
  );
  assert.match(detailsBody(comment, "Evidence reviewed"), /What I checked:/);
  assert.ok(
    comment.indexOf("<summary>Review details</summary>") <
      comment.indexOf("<summary>Evidence reviewed</summary>"),
  );
  assert.ok(
    comment.indexOf("<summary>Evidence reviewed</summary>") <
      comment.indexOf("<summary>What the crustacean ranks mean</summary>"),
  );
  assert.ok(
    comment.indexOf("<summary>What the crustacean ranks mean</summary>") <
      comment.indexOf("<summary>How this review workflow works</summary>"),
  );
  assert.match(comment, /<!-- clawsweeper-verdict:needs-human item=74265 sha=abc123def456/);
});

test("issue keep-open review comments surface reproducibility in the summary", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "issue",
      number: "75877",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "queue_fix_pr",
    })}

## Summary

Keep open. Slack typing callbacks are disabled in message-tool-only group replies.

## Reproduction Assessment

Yes. A source-level reproduction is clear: set a Slack group turn to message-tool-only and inspect the dispatch typing callbacks.

## Work Candidate

Candidate: queue_fix_pr

Confidence: high

Priority: medium

Status: queued

Reason: The bug is narrow and source-reproducible.
`,
    "none",
  );

  assert.match(
    comment,
    /\*\*Summary\*\*\nKeep open\. Slack typing callbacks are disabled in message-tool-only group replies\.\n\nReproducibility: yes\. A source-level reproduction is clear/,
  );
  assert.ok(comment.indexOf("Reproducibility: yes.") < comment.indexOf("**Next step**"));
  assert.doesNotMatch(comment, /\*\*Ways to help us reproduce this\*\*/);
  assert.doesNotMatch(comment, /\*\*Security\*\*/);
  assert.doesNotMatch(comment, /Not applicable:/);
  assert.match(
    comment,
    /Do we have a high-confidence way to reproduce the issue\?\n\nYes\. A source-level reproduction is clear/,
  );
});

test("issue keep-open review comments suggest concrete reproduction help", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "issue",
      number: "75878",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "manual_review",
      reproduction_status: "unclear",
      reproduction_confidence: "low",
    })}

## Summary

Keep open. The app sometimes does the wrong thing.

## Reproduction Assessment

Unclear. The report describes an intermittent visible failure but does not include enough information to reproduce it.

## Best Possible Solution

Ask for enough details to reproduce the issue before planning a fix.
`,
    "none",
  );

  assert.match(comment, /\*\*Ways to help us reproduce this\*\*/);
  assert.match(comment, /- Add a screenshot or short recording showing the behavior\./);
  assert.match(comment, /- Include the exact command, prompt, or workflow that triggered it\./);
  assert.match(comment, /- Add expected vs actual behavior\./);
  assert.ok(
    comment.indexOf("**Ways to help us reproduce this**") < comment.indexOf("**Next step**"),
  );
});

test("pull request review comments include dedicated security review", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74265",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Updates a workflow permission for review comments.

## Best Possible Solution

Land the workflow permission change after normal CI.

## Security Review

Status: needs_attention

Summary: The workflow now asks for issue write permission, so the permission scope needs maintainer confirmation.

Concerns:

- **[medium] Confirm issue write scope:** \`.github/workflows/sweep.yml:652\`
  - body: The review shard now writes comments during review, so maintainers should confirm the app permission is intended.
  - confidence: 0.82

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.85

Full review comments:

- none

## Work Candidate

Candidate: none

Confidence: low

Priority: low

Reason: Normal maintainer review is sufficient.

## Evidence

- **workflow:** Review shard requests issue write permission.

## Likely Related People

- **@alice:** recent workflow maintainer
  - reason: touched the workflow recently
  - commits: abc123
  - files: .github/workflows/sweep.yml
  - confidence: high

## Risks / Open Questions

- none
`,
    "none",
  );

  assert.match(comment, /\*\*Security\*\*/);
  assert.match(comment, /Needs attention:/);
  assert.match(comment, /Confirm issue write scope/);
  assert.match(comment, /Review details/);
  assert.doesNotMatch(comment, /recent workflow maintainer/);
  assert.match(comment, /recent workflow contributor/);
  assert.match(comment, /<!-- clawsweeper-security:security-sensitive item=74265 sha=abc123def456/);
  assert.match(comment, /<!-- clawsweeper-verdict:needs-human item=74265 sha=abc123def456/);
});

test("pull request keep-open review comments surface Codex-style findings", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74268",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "queue_fix_pr",
      pull_head_sha: "abc123def456",
    })}

## Summary

This PR needs one correctness fix before merge.

## What This Changes

Adds a config patch command for scripted config edits.

## Best Possible Solution

Reject misspelled replacement paths before writing the updated config.

## Review Findings

Overall correctness: patch is incorrect

Overall confidence: 0.86

Full review comments:

- **[P1] Validate replace paths:** \`src/config/apply.ts:42-44\`
  - body: A misspelled replace path is currently ignored, so the command can report success while leaving the intended setting unchanged.
  - confidence: 0.9

## Work Candidate

Candidate: queue_fix_pr

Confidence: high

Priority: high

Status: candidate

Reason: The fix is narrow and can be made on the PR branch.
`,
    "none",
  );

  assert.match(comment, /Codex review: needs changes before merge\./);
  assert.doesNotMatch(comment, /\*\*Workflow note:\*\*/);
  assert.match(comment, /<summary>How this review workflow works<\/summary>/);
  assert.match(
    comment,
    /\*\*Review findings\*\*\n- \[P1\] Validate replace paths — `src\/config\/apply\.ts:42-44`/,
  );
  assert.doesNotMatch(comment, /\*\*\[P[0-2]\]\*\*/);
  assert.match(comment, /Full review comments:/);
  assert.match(comment, /A misspelled replace path is currently ignored/);
  assert.match(comment, /Overall correctness: patch is incorrect/);
  assert.match(comment, /<!-- clawsweeper-action:fix-required/);
});

test("pull request keep-open review comments suppress duplicate best solution text", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74266",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this docs-only PR open for maintainer review.

## What This Changes

Documents ClawSweeper self-review smoke coverage.

## Best Possible Solution

Land this docs-only PR after maintainer review.
`,
    "none",
  );

  assert.match(
    comment,
    /\*\*Next step before merge\*\*\n- Land this docs-only PR after maintainer review\./,
  );
  assert.doesNotMatch(comment, /\[P2\] Land this docs-only PR/);
  assert.doesNotMatch(comment, /Best possible solution:/);
});

test("pull request review comments do not priority-prefix routine no-op guidance", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74269",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this narrow PR open for maintainer review.

## PR Rating

Overall tier: B
Proof tier: B
Patch tier: B
Summary: Ready for review.
Next rank-up steps:
- none

## Best Possible Solution

No ClawSweeper repair lane is needed; the submitted PR is narrow and the remaining action is normal maintainer review and CI.
`,
    "none",
  );

  assert.match(comment, /Rank-up moves:\n- none/);
  assert.match(
    comment,
    /\*\*Next step before merge\*\*\n- No ClawSweeper repair lane is needed; the submitted PR is narrow and the remaining action is normal maintainer review and CI\./,
  );
  assert.doesNotMatch(comment, /\[P2\] none/);
  assert.doesNotMatch(comment, /\[P2\] No ClawSweeper repair lane is needed/);
});

test("pull request next-step priority prefixes classify fail-closed work as P1", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74268",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this compatibility PR open for maintainer review.

## What This Changes

Changes relay restart handling.

## Best Possible Solution

Prove the fail-closed compatibility break is handled before merge.
`,
    "none",
  );

  assert.match(
    comment,
    /\*\*Next step before merge\*\*\n- \[P1\] Prove the fail-closed compatibility break is handled before merge\./,
  );
  assert.doesNotMatch(comment, /\*\*\[P1\]\*\*/);
});

test("pull request automerge review comments can emit pass verdicts", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74453",
      decision: "keep_open",
      close_reason: "none",
      review_status: "complete",
      labels: JSON.stringify(["clawsweeper:automerge"]),
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this focused PR open for automerge.

## What This Changes

Closes the voice-call webhook limiter fail-open path.

## Best Possible Solution

Merge after required checks are green.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`,
    "none",
  );

  assert.match(comment, /Codex review: passed\./);
  assert.match(
    comment,
    /\*\*Next step before merge\*\*\n- Merge after required checks are green\./,
  );
  assert.doesNotMatch(comment, /\[P2\] Merge after required checks are green/);
  assert.doesNotMatch(comment, /Automerge follow-up:/);
  assert.match(comment, /<!-- clawsweeper-verdict:pass item=74453 sha=abc123def456/);
  assert.doesNotMatch(comment, /clawsweeper-verdict:needs-human/);
});

test("coverage-proof blocked PR reports do not emit repair pass verdicts", () => {
  const markers = reviewAutomationMarkersFromReport(`${reportFrontMatter({
    type: "pull_request",
    number: "74456",
    decision: "keep_open",
    close_reason: "none",
    action_taken: "skipped_pr_close_coverage_proof",
    review_status: "complete",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this superseded PR open until coverage proof passes.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`);

  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("config surface reports force human review instead of automerge pass", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74454",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    config_surface_change: "true",
    config_surface_keys: JSON.stringify(["contracts.embeddingProviders"]),
  })}

## Summary

Keep this config-surface PR open for maintainer review.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /clawsweeper-action:fix-required/);
});

test("config surface reports preserve security-sensitive markers", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74455",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    config_surface_change: "true",
    config_surface_keys: JSON.stringify(["unknown-config-surface-change"]),
  })}

## Summary

Keep this security-sensitive config-surface PR open for maintainer review.

## Security Review

Status: needs_attention

Summary: The config surface change may affect credential handling.

Concerns:

- **[high] Confirm credential scope:** \`src/config/zod-schema.ts:42\`
  - body: The changed config default may alter credential routing.
  - confidence: 0.91
`;

  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(markers, /clawsweeper-security:security-sensitive/);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /clawsweeper-action:fix-required/);
});

test("config surface detector finds schema and plugin manifest additions", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "src/config/zod-schema.ts",
        patch: "@@\n+  experimentalLocalModelLean: z.boolean().optional(),",
      },
      {
        filename: "src/plugins/manifest.ts",
        patch: "@@\n+    embeddingProviders?: PluginEmbeddingProviderContract[];",
      },
      {
        filename: "docs/plugins/manifest.md",
        patch: "@@\n+| `contracts.embeddingProviders` | Embedding provider contracts. |",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    keys: ["contracts.embeddingProviders", "experimentalLocalModelLean"],
  });
});

test("config surface detector ignores non-semantic docs wording", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "docs/gateway/configuration.md",
        patch: "@@\n+This section explains the existing `agents` config in clearer words.",
      },
      {
        filename: "docs/plugins/manifest.md",
        patch: "@@\n+This paragraph now describes plugin contracts more clearly.",
      },
    ],
  });

  assert.deepEqual(detection, { change: false, keys: [] });
});

test("config surface detector finds removed schema keys", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "src/config/zod-schema.ts",
        patch: "@@\n-  legacyModelProvider: z.string().optional(),",
      },
    ],
  });

  assert.deepEqual(detection, { change: true, keys: ["legacyModelProvider"] });
});

test("config surface detector finds schema assembly changes", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "src/config/schema.ts",
        patch: "@@\n+  allowedProviders: buildAllowedProviderSchema(),",
      },
    ],
  });

  assert.deepEqual(detection, { change: true, keys: ["allowedProviders"] });
});

test("config surface detector fails closed for schema continuation changes", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "src/config/zod-schema.ts",
        patch: "@@\n-    .min(1)\n+    .min(2)",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    keys: ["unknown-config-surface-change"],
  });
});

test("config surface detector fails closed for missing patches", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "docs/plugins/manifest.md",
      },
      {
        filename: "src/config/zod-schema.ts",
        patch: "",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    keys: ["unknown-config-surface-change"],
  });
});

test("config surface detector fails closed for truncated file patches", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "docs/gateway/configuration.md",
        patch:
          "@@\n+This section explains the existing `agents` config in clearer words.\n\n[truncated 120 chars]",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    keys: ["unknown-config-surface-change"],
  });
});

test("config surface detector fails closed for renamed config surface files", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "src/legacy/zod-schema.ts",
        previous_filename: "src/config/zod-schema.ts",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    keys: ["unknown-config-surface-change"],
  });
});

test("config surface detector fails closed for truncated pull files", () => {
  const detection = configSurfaceChangeFromPullFilesForTest({
    pullFilesTruncated: true,
    pullFiles: [
      {
        filename: "src/config/schema.help.ts",
        patch: '@@\n+  experimentalLocalModelLean: "Prefer lean local model routing.",',
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    keys: ["experimentalLocalModelLean", "unknown-truncated-pull-files"],
  });
});

test("data model detector finds persistent schema and embedding metadata changes", () => {
  const detection = dataModelChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "packages/database/migrations/018_sessions.sql",
        patch: "@@\n+ALTER TABLE sessions ADD COLUMN last_model TEXT;",
      },
      {
        filename: "src/memory/vector-store.ts",
        patch:
          "@@\n+  embeddingDimension: row.embedding_dimension,\n+  documentId: row.document_id,",
      },
      {
        filename: "src/doctor/backfill.ts",
        patch: "@@\n+  await backfillMissingSessionVersions(db);",
      },
      {
        filename: "packages/database/migrations/019_backfill_sessions.sql",
        patch: "@@\n+UPDATE sessions SET last_model = 'unknown' WHERE last_model IS NULL;",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    surfaces: [
      "database schema: packages/database/migrations/018_sessions.sql",
      "migration/backfill/repair: packages/database/migrations/019_backfill_sessions.sql",
      "migration/backfill/repair: src/doctor/backfill.ts",
      "vector/embedding metadata: src/memory/vector-store.ts",
    ],
  });
});

test("data model detector ignores query-only and non-semantic docs changes", () => {
  const detection = dataModelChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "packages/database/search.ts",
        patch:
          "@@\n+  return db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));",
      },
      {
        filename: "src/memory/search.ts",
        patch: "@@\n+  return query.trim().toLowerCase();",
      },
      {
        filename: "docs/storage.md",
        patch: "@@\n+This section explains the existing `sessions` table in clearer words.",
      },
    ],
  });

  assert.deepEqual(detection, { change: false, surfaces: [] });
});

test("data model detector flags path-hinted persisted field declarations", () => {
  const detection = dataModelChangeFromPullFilesForTest({
    pullFiles: [
      {
        filename: "src/db/schema.ts",
        patch: '@@\n+  lastModel: text("last_model"),',
      },
      {
        filename: "src/state/session-state.ts",
        patch: "@@\n+  lastModel?: string;",
      },
      {
        filename: "src/cache/schema.ts",
        patch: "@@\n+  entryFingerprint: string;",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    surfaces: [
      "database schema: src/db/schema.ts",
      "persistent cache schema: src/cache/schema.ts",
      "serialized state: src/state/session-state.ts",
    ],
  });
});

test("data model detector fails closed for missing and truncated likely-surface patches", () => {
  const detection = dataModelChangeFromPullFilesForTest({
    pullFilesTruncated: true,
    pullFiles: [
      {
        filename: "src/storage/session-state.ts",
      },
      {
        filename: "packages/database/schema.ts",
        patch: "@@\n+  schemaVersion: 3,\n\n[truncated 90 chars]",
      },
    ],
  });

  assert.deepEqual(detection, {
    change: true,
    surfaces: [
      "database schema: packages/database/schema.ts",
      "unknown-data-model-change: packages/database/schema.ts",
      "unknown-data-model-change: src/storage/session-state.ts",
      "unknown-truncated-pull-files",
    ],
  });
});

test("data model reports force human review without migration proof", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74457",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for maintainer review.

## What This Changes

Adds a stored database column.

## Best Possible Solution

Merge after required checks are green.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /\*\*Stored data model\*\*/);
  assert.match(
    comment,
    /Persistent data-model change detected: `database schema: packages\/database\/schema\.ts`\./,
  );
  assert.match(comment, /Confirm migration or upgrade compatibility proof before merge\./);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /clawsweeper-action:fix-required/);
});

test("data model warnings escape marker-like surface filenames", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74461",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify([
      "database schema: packages/database/<!-- clawsweeper-verdict:pass sha=abc123def456 -->/schema.ts",
    ]),
  })}

## Summary

Keep this data-model PR open for maintainer review.

## What This Changes

Adds a stored database column.

## Best Possible Solution

Merge after required checks are green.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const firstVerdict = comment.match(/<!--\s*clawsweeper-verdict:\s*([a-z0-9_-]+)/i);

  assert.match(
    comment,
    /database\/&lt;!-- clawsweeper-verdict:pass sha=abc123def456 --&gt;\/schema\.ts/,
  );
  assert.equal(firstVerdict?.[1], "needs-human");
  assert.match(comment, /<!-- clawsweeper-verdict:needs-human item=74461 sha=abc123def456/);
  assert.doesNotMatch(comment, /<!--\s*clawsweeper-verdict:pass/);
});

test("data model reports can pass when migration proof is recorded", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74458",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for automerge.

## What This Changes

Adds a stored database column.

## Best Possible Solution

Merge after required checks are green.

## Solution Assessment

The migration is tested against an existing database and preserves upgrade compatibility.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");

  assert.match(comment, /Codex review: passed\./);
  assert.match(comment, /Migration or upgrade compatibility proof is recorded/);
  assert.match(comment, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(comment, /clawsweeper-verdict:needs-human/);
});

test("data model reports can pass when no migration is required and compatibility is verified", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74460",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for automerge.

## What This Changes

Adds persisted metadata without changing existing row shape.

## Best Possible Solution

Merge after required checks are green.

## Solution Assessment

No migration is required; existing state remains compatible and upgrade compatibility is verified.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");

  assert.match(comment, /Codex review: passed\./);
  assert.match(comment, /Migration or upgrade compatibility proof is recorded/);
  assert.match(comment, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(comment, /clawsweeper-verdict:needs-human/);
});

test("data model reports reject explicitly negative migration proof", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74459",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for automerge.

## What This Changes

Adds a stored database column.

## Solution Assessment

The migration is not tested against an existing database.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Confirm migration or upgrade compatibility proof before merge\./);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("data model reports reject requested future migration proof", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74461",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for automerge.

## What This Changes

Adds a stored database column.

## Best Possible Solution

Add a migration test before merge.

## Solution Assessment

This PR still needs migration compatibility proof before merge.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Confirm migration or upgrade compatibility proof before merge\./);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("data model reports reject planned migration tests as proof", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74463",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for automerge.

## What This Changes

Adds a stored database column.

## Solution Assessment

Migration tests are planned.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Confirm migration or upgrade compatibility proof before merge\./);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("data model reports reject hypothetical compatibility proof", () => {
  const report = `${reportFrontMatter({
    repository: "openclaw/openclaw",
    type: "pull_request",
    number: "74462",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    data_model_change: "true",
    data_model_surfaces: JSON.stringify(["database schema: packages/database/schema.ts"]),
  })}

## Summary

Keep this data-model PR open for automerge.

## What This Changes

Adds a stored database column.

## Solution Assessment

The migration should preserve upgrade compatibility for existing databases.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Confirm migration or upgrade compatibility proof before merge\./);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("sufficient real behavior proof allows automerge pass markers", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74459",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this focused PR open for automerge.

## What This Changes

Fixes the gateway status output.

## Best Possible Solution

Merge after required checks are green.

${realBehaviorProofReportSection()}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none", {
    prStatusKind: "ready_for_maintainer_look",
  });
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /\*\*Merge readiness\*\*\nOverall: 🦞 diamond lobster/);
  assert.match(comment, /Proof: 🦞 diamond lobster/);
  assert.match(comment, /Patch quality: 🦞 diamond lobster/);
  assert.match(comment, /Result: ready for maintainer review\./);
  assert.match(
    comment,
    /Overall follows the weaker of proof and patch quality, so missing proof can cap an otherwise strong patch\./,
  );
  assert.doesNotMatch(comment, /\*\*PR rating\*\*/);
  assert.doesNotMatch(comment, /\*\*Real behavior proof\*\*/);
  assert.match(comment, /<summary>What the crustacean ranks mean<\/summary>/);
  assert.match(comment, /🦀 challenger crab: rare, exceptional readiness/);
  assert.match(comment, /🧂 unranked krab: not merge-ready/);
  assert.match(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:needs-human/);
});

test("proof-blocked PR comments show proof cap while preserving patch quality", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74460",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify([]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this PR open until proof is added.

## What This Changes

Filters noisy review-context comments before prompting.

## Best Possible Solution

Add real ClawSweeper ingestion proof before merge.

${realBehaviorProofReportSection({
  status: "missing",
  evidenceKind: "none",
  needsContributorAction: true,
  summary: "The PR has no real ingestion-run proof yet.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const labelDetails = detailsBody(comment, "Label changes");

  assert.match(comment, /\*\*Merge readiness\*\*\nOverall: 🧂 unranked krab/);
  assert.match(comment, /Proof: 🧂 unranked krab/);
  assert.match(comment, /Patch quality: 🦞 diamond lobster/);
  assert.match(comment, /Result: blocked until real behavior proof is added\./);
  assert.match(
    comment,
    /Overall follows the weaker of proof and patch quality, so missing proof can cap an otherwise strong patch\./,
  );
  assert.match(comment, /Proof guidance:\n- \[P1\] Needs real behavior proof before merge:/);
  assert.match(comment, /The PR has no real ingestion-run proof yet\./);
  assert.match(comment, /After adding proof, update the PR body/);
  assert.match(comment, /@clawsweeper re-review/);
  assert.match(
    labelDetails,
    /- `rating: 🧂 unranked krab`: Overall readiness is 🧂 unranked krab; proof is 🧂 unranked krab and patch quality is 🦞 diamond lobster\./,
  );
  assert.doesNotMatch(labelDetails, /PR readiness rating was derived from proof quality/);
});

test("public PR review comments explain label changes without duplicate justifications", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74461",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify([]),
    work_candidate: "none",
    triage_priority: "P1",
    impact_labels: JSON.stringify(["impact:message-loss"]),
    merge_risk_labels: JSON.stringify(["merge-risk: 🚨 compatibility"]),
    label_justifications: JSON.stringify([
      {
        label: "P1",
        reason: "The PR changes an active channel workflow affecting real users.",
      },
      {
        label: "impact:message-loss",
        reason: "The diff touches message retry and delivery ordering.",
      },
      {
        label: "merge-risk: 🚨 compatibility",
        reason: "Merging changes the default upgrade behavior for existing configs.",
      },
    ]),
  })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Changes message delivery behavior.

## Best Possible Solution

Review the compatibility impact before merge.

## Risks

Compatibility risk remains for existing configs.

${realBehaviorProofReportSection({
  status: "insufficient",
  needsContributorAction: true,
  summary: "The PR has tests but no real setup proof yet.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.8

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");

  assert.match(comment, /<summary>Label changes<\/summary>/);
  assert.ok(
    comment.indexOf("<summary>Label changes</summary>") <
      comment.indexOf("<summary>What the crustacean ranks mean</summary>"),
  );
  assert.ok(
    comment.indexOf("<summary>What the crustacean ranks mean</summary>") <
      comment.indexOf("<summary>How this review workflow works</summary>"),
  );
  if (comment.includes("<summary>Review details</summary>")) {
    assert.doesNotMatch(detailsBody(comment, "Review details"), /Label changes:/);
  }
  const labelDetails = detailsBody(comment, "Label changes");
  assert.match(labelDetails, /Label changes:/);
  assert.match(
    labelDetails,
    /- add `P1`: The PR changes an active channel workflow affecting real users\./,
  );
  assert.match(
    labelDetails,
    /- add `merge-risk: 🚨 compatibility`: Merging changes the default upgrade behavior for existing configs\./,
  );
  assert.match(labelDetails, /Label justifications:/);
  assert.match(
    labelDetails,
    /- `P1`: The PR changes an active channel workflow affecting real users\./,
  );
  assert.match(
    labelDetails,
    /- `impact:message-loss`: The diff touches message retry and delivery ordering\./,
  );
});

test("public PR review details justify derived rating label changes", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "84006",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["rating: 🦞 diamond lobster"]),
    work_candidate: "none",
    triage_priority: "none",
    impact_labels: JSON.stringify([]),
    merge_risk_labels: JSON.stringify([]),
    label_justifications: JSON.stringify([]),
  })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Changes a PR under active review.

## Best Possible Solution

Add proof before merge.

${realBehaviorProofReportSection({
  status: "insufficient",
  needsContributorAction: true,
  summary: "The PR still needs current real-environment proof for the changed behavior.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const labelDetails = detailsBody(comment, "Label changes");

  assert.match(labelDetails, /Label changes:/);
  assert.match(
    labelDetails,
    /- add `rating: 🦪 silver shellfish`: Overall readiness is 🦪 silver shellfish; proof is 🦪 silver shellfish and patch quality is 🦞 diamond lobster\. Replaced prior `rating: 🦞 diamond lobster`\./,
  );
  assert.match(
    labelDetails,
    /- remove `rating: 🦞 diamond lobster`: Current PR rating is `rating: 🦪 silver shellfish`, so this older rating label is no longer current\./,
  );
  assert.match(labelDetails, /Label justifications:/);
  assert.match(
    labelDetails,
    /- `rating: 🦪 silver shellfish`: Overall readiness is 🦪 silver shellfish; proof is 🦪 silver shellfish and patch quality is 🦞 diamond lobster\. Replaced prior `rating: 🦞 diamond lobster`\./,
  );
});

test("public PR review details justify stale owned label removals", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "84007",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["status: 📣 needs proof"]),
    work_candidate: "none",
    triage_priority: "none",
    impact_labels: JSON.stringify([]),
    merge_risk_labels: JSON.stringify([]),
    label_justifications: JSON.stringify([]),
  })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Updates an already-reviewed PR.

## Best Possible Solution

Add current real behavior proof before merge.

${realBehaviorProofReportSection({
  status: "insufficient",
  evidenceKind: "none",
  needsContributorAction: true,
  summary: "The current review has no usable real behavior proof.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none", {
    prStatusKind: "needs_proof",
    previousLabels: [
      "P1",
      "impact:message-loss",
      "merge-risk: 🚨 compatibility",
      "proof: sufficient",
      "proof: 🎥 video",
      "mantis: telegram-visible-proof",
      "status: 📣 needs proof",
    ],
  });

  assert.match(comment, /Label changes:/);
  assert.match(comment, /- remove `P1`: Current review triage priority is none\./);
  assert.match(
    comment,
    /- remove `impact:message-loss`: Current review selected no impact labels\./,
  );
  assert.match(
    comment,
    /- remove `merge-risk: 🚨 compatibility`: Current PR review selected no merge-risk labels\./,
  );
  assert.match(
    comment,
    /- remove `proof: sufficient`: Current real behavior proof status is insufficient, not sufficient\./,
  );
  assert.match(
    comment,
    /- remove `proof: 🎥 video`: Current real behavior proof evidence kind is none\./,
  );
  assert.match(
    comment,
    /- remove `mantis: telegram-visible-proof`: Current Telegram visible-proof status is not_needed\./,
  );
  assert.doesNotMatch(comment, /remove `status: 📣 needs proof`/);
});

test("public PR review details justify derived rating label changes", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "84006",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["rating: 🦞 diamond lobster"]),
    work_candidate: "none",
    triage_priority: "none",
    impact_labels: JSON.stringify([]),
    merge_risk_labels: JSON.stringify([]),
    label_justifications: JSON.stringify([]),
  })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Changes a PR under active review.

## Best Possible Solution

Add proof before merge.

${realBehaviorProofReportSection({
  status: "insufficient",
  needsContributorAction: true,
  summary: "The PR still needs current real-environment proof for the changed behavior.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const labelDetails = detailsBody(comment, "Label changes");

  assert.match(labelDetails, /Label changes:/);
  assert.match(
    labelDetails,
    /- add `rating: 🦪 silver shellfish`: Overall readiness is 🦪 silver shellfish; proof is 🦪 silver shellfish and patch quality is 🦞 diamond lobster\. Replaced prior `rating: 🦞 diamond lobster`\./,
  );
  assert.match(
    labelDetails,
    /- remove `rating: 🦞 diamond lobster`: Current PR rating is `rating: 🦪 silver shellfish`, so this older rating label is no longer current\./,
  );
  assert.match(labelDetails, /Label justifications:/);
  assert.match(
    labelDetails,
    /- `rating: 🦪 silver shellfish`: Overall readiness is 🦪 silver shellfish; proof is 🦪 silver shellfish and patch quality is 🦞 diamond lobster\. Replaced prior `rating: 🦞 diamond lobster`\./,
  );
});

test("public PR review details justify stale owned label removals", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "84007",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["status: 📣 needs proof"]),
    work_candidate: "none",
    triage_priority: "none",
    impact_labels: JSON.stringify([]),
    merge_risk_labels: JSON.stringify([]),
    label_justifications: JSON.stringify([]),
  })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Updates an already-reviewed PR.

## Best Possible Solution

Add current real behavior proof before merge.

${realBehaviorProofReportSection({
  status: "insufficient",
  evidenceKind: "none",
  needsContributorAction: true,
  summary: "The current review has no usable real behavior proof.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none", {
    prStatusKind: "needs_proof",
    previousLabels: [
      "P1",
      "impact:message-loss",
      "merge-risk: 🚨 compatibility",
      "proof: sufficient",
      "proof: 🎥 video",
      "mantis: telegram-visible-proof",
      "status: 📣 needs proof",
    ],
  });

  assert.match(comment, /Label changes:/);
  assert.match(comment, /- remove `P1`: Current review triage priority is none\./);
  assert.match(
    comment,
    /- remove `impact:message-loss`: Current review selected no impact labels\./,
  );
  assert.match(
    comment,
    /- remove `merge-risk: 🚨 compatibility`: Current PR review selected no merge-risk labels\./,
  );
  assert.match(
    comment,
    /- remove `proof: sufficient`: Current real behavior proof status is insufficient, not sufficient\./,
  );
  assert.match(
    comment,
    /- remove `proof: 🎥 video`: Current real behavior proof evidence kind is none\./,
  );
  assert.match(
    comment,
    /- remove `mantis: telegram-visible-proof`: Current Telegram visible-proof status is not_needed\./,
  );
  assert.doesNotMatch(comment, /remove `status: 📣 needs proof`/);
});

test("media proof receives a shiny proof rating boost", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74460",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify([]),
    work_candidate: "none",
  })}

## Summary

Keep this focused PR open.

## What This Changes

Fixes a visible UI behavior.

## Best Possible Solution

Merge after maintainer review.

${realBehaviorProofReportSection({
  evidenceKind: "recording",
  summary: "The PR includes a short recording from a real setup showing the fixed UI behavior.",
})}

${prRatingReportSection({
  overallTier: "S",
  proofTier: "S",
  patchTier: "S",
  overallLabel: "🦀 challenger crab",
  proofLabel: "🦀 challenger crab ✨",
  patchLabel: "🦀 challenger crab",
  summary: "The PR has direct media proof and a clean, high-confidence patch.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.98

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");

  assert.match(comment, /\*\*Merge readiness\*\*\nOverall: 🦀 challenger crab/);
  assert.match(comment, /Proof: 🦀 challenger crab ✨ media proof bonus/);
  assert.match(comment, /Shiny media proof means a screenshot, video, or linked artifact/);
  assert.doesNotMatch(comment, /Rank-up moves:/);
});

test("docs-only external PRs do not require real behavior proof", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74462",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    pull_files: JSON.stringify(["docs/usage.md", "docs/plugins/building-plugins.md"]),
    pull_files_truncated: false,
  })}

## Summary

Keep this docs-only PR open for automerge.

## What This Changes

Clarifies plugin docs.

## Best Possible Solution

Merge after required checks are green.

${realBehaviorProofReportSection({
  status: "missing",
  evidenceKind: "none",
  needsContributorAction: true,
  summary: "The PR body does not include after-fix evidence from a real setup.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /\*\*Merge readiness\*\*/);
  assert.match(comment, /Proof: 🌊 off-meta tidepool/);
  assert.match(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:needs-human/);
});

test("renamed source paths remain part of docs-only proof checks", () => {
  assert.deepEqual(
    pullRequestFilePathsFromContextForTest({
      pullFiles: [
        {
          filename: "docs/runtime.md",
          previous_filename: "src/runtime.ts",
          status: "renamed",
        },
      ],
    }),
    ["docs/runtime.md", "src/runtime.ts"],
  );
});

test("mixed docs and source external PRs still require real behavior proof", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74463",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
    pull_files: JSON.stringify(["docs/usage.md", "src/runtime.ts"]),
    pull_files_truncated: false,
  })}

## Summary

Keep this PR open until the contributor proves the fix in a real setup.

## What This Changes

Changes runtime behavior and docs.

## Best Possible Solution

Ask the contributor to add after-fix proof from their real setup.

${realBehaviorProofReportSection({
  status: "missing",
  evidenceKind: "none",
  needsContributorAction: true,
  summary: "The PR body does not include after-fix evidence from a real setup.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Codex review: needs real behavior proof before merge\./);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("screenshot-only browser runtime proof blocks pass markers", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74460",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this focused PR open for automerge.

## What This Changes

Adds tweakcn.com to the Control UI connect-src directive.

## Best Possible Solution

Ask the contributor to add browser runtime proof from their real setup.

${realBehaviorProofReportSection({
  status: "sufficient",
  evidenceKind: "screenshot",
  needsContributorAction: false,
  summary:
    "The inspected screenshot shows an after-fix Control UI import success state for a tweakcn theme, with no visible console CSP violation.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Codex review: needs real behavior proof before merge\./);
  assert.match(comment, /Needs stronger real behavior proof before merge:/);
  assert.match(comment, /not enough for browser runtime or security behavior/);
  assert.match(comment, /console, network, terminal, live output, or logs/);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /proof: sufficient/);
});

test("missing real behavior proof blocks pass and repair markers", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74460",
    decision: "keep_open",
    close_reason: "none",
    review_status: "complete",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "queue_fix_pr",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this PR open until the contributor proves the fix in a real setup.

## What This Changes

Fixes the gateway status output.

## Best Possible Solution

Ask the contributor to add after-fix proof from their real setup.

${realBehaviorProofReportSection({
  status: "missing",
  evidenceKind: "none",
  needsContributorAction: true,
  summary:
    "The PR body does not include after-fix evidence from a real setup; terminal screenshots, console output, copied live output, linked artifacts, recordings, and redacted logs count.",
})}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Codex review: needs real behavior proof before merge\./);
  assert.match(comment, /\*\*Merge readiness\*\*/);
  assert.match(comment, /terminal screenshots, console output, copied live output/);
  assert.match(comment, /update the PR body; ClawSweeper should re-review automatically/);
  assert.match(comment, /@clawsweeper re-review/);
  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(markers, /clawsweeper-action:fix-required/);
});

test("mock-only real behavior proof blocks repair markers", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74461",
    decision: "keep_open",
    close_reason: "none",
    confidence: "high",
    author: "contributor",
    author_association: "CONTRIBUTOR",
    labels: JSON.stringify(["clawsweeper:autofix"]),
    work_candidate: "queue_fix_pr",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this PR open until proof covers real behavior.

${realBehaviorProofReportSection({
  status: "mock_only",
  evidenceKind: "none",
  needsContributorAction: true,
  summary:
    "The PR only cites unit tests and CI; the contributor needs a terminal screenshot, console output, copied live output, recording, linked artifact, or redacted runtime log from a real setup.",
})}

## Review Findings

Overall correctness: patch is incorrect

Overall confidence: 0.9

Full review comments:

- **[P3] Add a changelog entry:** \`CHANGELOG.md:12\`
  - body: The PR changes user-visible behavior and needs a changelog entry.
  - confidence: 0.8
`;

  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-action:fix-required/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:needs-changes/);
});

test("OpenClaw contributor changelog-entry findings are normalized", () => {
  const decision = parseDecision(
    changelogReviewDecision({
      realBehaviorProof: {
        status: "sufficient",
        summary: "Terminal output from a real OpenClaw checkout shows the changed behavior.",
        evidenceKind: "terminal",
        needsContributorAction: false,
      },
      prRating: {
        proofTier: "A",
        patchTier: "D",
        overallTier: "D",
        summary: "The PR is blocked because the changelog entry is missing.",
        nextSteps: ["Add changelog entry."],
      },
      overallConfidenceScore: 0.9,
    }),
    item({ repo: "openclaw/openclaw", kind: "pull_request" }),
  );

  assert.deepEqual(decision.reviewFindings, []);
  assert.equal(decision.overallCorrectness, "patch is correct");
  assert.equal(decision.prRating.patchTier, "A");
  assert.equal(decision.prRating.overallTier, "A");
  assert.deepEqual(decision.prRating.nextSteps, []);
  assert.equal(decision.workCandidate, "none");
  assert.equal(decision.workReason, "");

  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74470",
      decision: "keep_open",
      close_reason: "none",
      review_status: "complete",
      confidence: "high",
      labels: JSON.stringify(["clawsweeper:automerge"]),
      work_candidate: decision.workCandidate,
      pull_head_sha: "abc123def456",
      pr_rating_overall: decision.prRating.overallTier,
      pr_rating_proof: decision.prRating.proofTier,
      pr_rating_patch: decision.prRating.patchTier,
    })}

## Summary

Keep this PR open for normal maintainer review.

## What This Changes

Removes the stale review blocker.

## Best Possible Solution

${decision.bestSolution}

${realBehaviorProofReportSection(decision.realBehaviorProof)}

## Review Findings

Overall correctness: ${decision.overallCorrectness}

Overall confidence: ${decision.overallConfidenceScore}

Full review comments:

- none

${prRatingReportSection({
  overallTier: decision.prRating.overallTier,
  proofTier: decision.prRating.proofTier,
  patchTier: decision.prRating.patchTier,
  summary: decision.prRating.summary,
  nextSteps: "- none",
})}`,
    "none",
  );

  assert.deepEqual(prRatingLabelsForTest([], decision.prRating.overallTier), [
    "rating: 🦞 diamond lobster",
  ]);
  assert.match(comment, /Patch quality: 🦞 diamond lobster/);
  assert.match(comment, /Result: ready for maintainer review\./);
  assert.doesNotMatch(comment, /Result: blocked by patch quality or review findings\./);
  assert.doesNotMatch(comment, /Add changelog entry/i);
});

test("OpenClaw maintainer changelog-entry findings stay actionable", () => {
  const decision = parseDecision(
    changelogReviewDecision(),
    item({ repo: "openclaw/openclaw", kind: "pull_request", authorAssociation: "MEMBER" }),
  );

  assert.deepEqual(
    decision.reviewFindings.map((finding) => finding.title),
    ["Add the required changelog entry"],
  );
  assert.equal(decision.overallCorrectness, "patch is incorrect");
  assert.equal(decision.workCandidate, "queue_fix_pr");
});

test("OpenClaw changelog normalization keeps real findings actionable", () => {
  const decision = parseDecision(
    changelogReviewDecision({
      reviewFindings: [
        reviewFinding({ file: "CHANGELOG.md" }),
        reviewFinding({
          title: "Preserve the existing option value",
          body: "The patch resets configured values when the dialog is reopened.",
          priority: 1,
          confidenceScore: 0.89,
          file: "src/options.ts",
          lineStart: 42,
          lineEnd: 42,
        }),
      ],
      workReason: "Fix the option reset bug.",
      workPrompt: "Fix src/options.ts and add a regression test.",
      workLikelyFiles: ["src/options.ts"],
    }),
    item({ repo: "openclaw/openclaw", kind: "pull_request" }),
  );

  assert.deepEqual(
    decision.reviewFindings.map((finding) => finding.title),
    ["Preserve the existing option value"],
  );
  assert.equal(decision.overallCorrectness, "patch is incorrect");
  assert.equal(decision.workCandidate, "queue_fix_pr");
});

test("OpenClaw changelog normalization keeps changelog tooling findings actionable", () => {
  const decision = parseDecision(
    changelogReviewDecision({
      reviewFindings: [
        reviewFinding({
          title: "Missing CHANGELOG.md entry validation",
          body: "The parser accepts malformed changelog entries.",
          priority: 2,
          confidenceScore: 0.82,
          file: "src/clawsweeper.ts",
          lineStart: 42,
          lineEnd: 42,
        }),
      ],
      workReason: "Add changelog parser coverage.",
      workPrompt: "Add parser coverage.",
      workLikelyFiles: ["test/clawsweeper.test.ts"],
    }),
    item({ repo: "openclaw/openclaw", kind: "pull_request" }),
  );

  assert.deepEqual(
    decision.reviewFindings.map((finding) => finding.title),
    ["Missing CHANGELOG.md entry validation"],
  );
  assert.equal(decision.overallCorrectness, "patch is incorrect");
  assert.equal(decision.workCandidate, "queue_fix_pr");
});

test("pull request automerge pass is not blocked by generic protected labels", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74716",
      decision: "keep_open",
      close_reason: "none",
      review_status: "complete",
      confidence: "high",
      labels: JSON.stringify(["maintainer", "size: XL", "clawsweeper:automerge"]),
      work_candidate: "manual_review",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this protected platform PR open for automerge gates.

## What This Changes

Routes Codex Computer Use through the Mac app node host.

## Best Possible Solution

Merge after ClawSweeper review and required checks are green.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`,
    "none",
  );

  assert.match(comment, /Codex review: passed\./);
  assert.doesNotMatch(comment, /Codex review: passed for ClawSweeper automerge/);
  assert.match(comment, /<!-- clawsweeper-verdict:pass item=74716 sha=abc123def456/);
  assert.doesNotMatch(comment, /clawsweeper-verdict:needs-human/);
});

test("pull request autofix review comments can emit pass verdicts without merge copy", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74610",
      decision: "keep_open",
      close_reason: "none",
      review_status: "complete",
      labels: JSON.stringify(["clawsweeper:autofix"]),
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this draft PR open for autofix.

## What This Changes

Adds the SDK package scaffolding.

## Best Possible Solution

Leave this draft open after fixes are complete.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`,
    "none",
  );

  assert.match(comment, /Codex review: passed\./);
  assert.match(
    comment,
    /\*\*Next step before merge\*\*\n- Leave this draft open after fixes are complete\./,
  );
  assert.doesNotMatch(comment, /\[P2\] Leave this draft open after fixes are complete/);
  assert.doesNotMatch(comment, /Autofix follow-up:/);
  assert.match(comment, /<!-- clawsweeper-verdict:pass item=74610 sha=abc123def456/);
  assert.doesNotMatch(comment, /Codex review: passed for ClawSweeper automerge/);
});

test("pull request automerge review comments with findings require repair", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74454",
    decision: "keep_open",
    close_reason: "none",
    confidence: "high",
    review_status: "complete",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "queue_fix_pr",
    pull_head_sha: "abc123def456",
  })}

## Summary

Keep this focused PR open for automerge repair.

## What This Changes

Updates the webhook limiter.

## Best Possible Solution

Fix the missing limiter branch, then review again.

## Review Findings

Overall correctness: patch is incorrect

Overall confidence: 0.9

Full review comments:

- **[P1] Preserve the limiter guard:** \`src/webhooks/voice.ts:42\`
  - body: The new branch can skip the limiter before accepting a webhook.
  - confidence: 0.91
`;

  const comment = renderReviewCommentFromReport(report, "none");
  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(comment, /Codex review: needs changes before merge\./);
  assert.match(comment, /\*\*Review findings\*\*/);
  assert.doesNotMatch(comment, /clawsweeper-verdict:pass/);
  assert.match(markers, /clawsweeper-verdict:needs-changes/);
  assert.match(markers, /clawsweeper-action:fix-required/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:pass/);
});

test("pull request automerge findings trigger repair without work candidate frontmatter", () => {
  const report = `${reportFrontMatter({
    type: "pull_request",
    number: "74454",
    decision: "keep_open",
    close_reason: "none",
    confidence: "high",
    review_status: "complete",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    pull_head_sha: "abc123def456",
  })}

## Review Findings

Overall correctness: patch is incorrect

Full review comments:

- **[P1] Preserve the limiter guard:** \`src/webhooks/voice.ts:42\`
  - body: The new branch can skip the limiter before accepting a webhook.
`;

  const markers = reviewAutomationMarkersFromReport(report);

  assert.match(markers, /clawsweeper-verdict:needs-changes/);
  assert.match(markers, /clawsweeper-action:fix-required/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:needs-human/);
});

test("failed review retry eligibility requires infrastructure failure and matching live head", () => {
  const markdown = failedReviewReport();
  const now = Date.parse("2026-06-05T20:00:00Z");

  assert.equal(isInfrastructureFailedReviewForTest(markdown), true);
  assert.deepEqual(
    failedReviewRetryEligibilityForTest({
      markdown,
      liveState: "open",
      liveHeadSha: "abc123def456",
      now,
      maxAttempts: 2,
      cooldownMs: 45 * 60 * 1000,
    }),
    {
      repo: "openclaw/openclaw",
      number: 4242,
      action: "planned_failed_review_retry",
      reason: "eligible infrastructure failed review at head abc123def456",
      headSha: "abc123def456",
      attempts: 0,
    },
  );
  assert.equal(
    failedReviewRetryEligibilityForTest({
      markdown,
      liveState: "open",
      liveHeadSha: "def456abc123",
      now,
      maxAttempts: 2,
      cooldownMs: 45 * 60 * 1000,
    }).action,
    "skipped_stale_head",
  );
  assert.equal(
    failedReviewRetryEligibilityForTest({
      markdown: failedReviewReport({ review_status: "complete" }),
      liveState: "open",
      liveHeadSha: "abc123def456",
      now,
      maxAttempts: 2,
      cooldownMs: 45 * 60 * 1000,
    }).action,
    "skipped_not_failed_review",
  );
});

test("failed review retry eligibility treats Codex rate limits as infrastructure failures", () => {
  const markdown = failedReviewReport({
    repository: "steipete/oracle",
    number: 250,
  }).replace(
    "Codex worker timed out after 600000ms with ETIMEDOUT.",
    "stream disconnected: Rate limit reached for hidden-model (for limit test) on tokens per min (TPM). Please try again in 581ms.",
  );

  assert.equal(isInfrastructureFailedReviewForTest(markdown), true);
});

test("failed review retry eligibility enforces cooldown and max attempts per head", () => {
  const now = Date.parse("2026-06-05T20:00:00Z");
  const recent = failedReviewReport({
    failed_review_retry_head_sha: "abc123def456",
    failed_review_retry_count: 1,
    failed_review_retry_last_at: "2026-06-05T19:30:00Z",
  });
  const exhausted = failedReviewReport({
    failed_review_retry_head_sha: "abc123def456",
    failed_review_retry_count: 2,
    failed_review_retry_last_at: "2026-06-05T18:00:00Z",
  });

  assert.equal(
    failedReviewRetryEligibilityForTest({
      markdown: recent,
      liveState: "open",
      liveHeadSha: "abc123def456",
      now,
      maxAttempts: 2,
      cooldownMs: 45 * 60 * 1000,
    }).action,
    "skipped_retry_cooldown",
  );
  assert.equal(
    failedReviewRetryEligibilityForTest({
      markdown: exhausted,
      liveState: "open",
      liveHeadSha: "abc123def456",
      now,
      maxAttempts: 2,
      cooldownMs: 45 * 60 * 1000,
    }).action,
    "skipped_retry_exhausted",
  );
});

test("failed review retry exhaustion is idempotent for the same head", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const reportPath = join(root, "failed-review-retry-report.json");
    const itemPath = join(itemsDir, "4242.md");
    mkdirSync(itemsDir, { recursive: true });
    writeFileSync(
      itemPath,
      failedReviewReport({
        failed_review_retry_head_sha: "abc123def456",
        failed_review_retry_count: 2,
        failed_review_retry_last_at: "2026-06-05T18:00:00Z",
      }),
      "utf8",
    );

    const ghMock = `#!/usr/bin/env node
const args = process.argv.slice(2);
const path = args.find((arg) => arg.startsWith("repos/")) || "";
if (path.endsWith("/issues/4242")) {
  console.log(JSON.stringify({
    number: 4242,
    title: "Failed review retry sample",
    html_url: "https://github.com/openclaw/openclaw/pull/4242",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T01:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "contributor" },
    labels: [],
    pull_request: {}
  }));
  process.exit(0);
}
if (path.endsWith("/pulls/4242")) {
  console.log("abc123def456");
  process.exit(0);
}
console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`;

    const runRetry = () => {
      execFileSync(process.execPath, [
        "dist/clawsweeper.js",
        "retry-failed-reviews",
        "--target-repo",
        "openclaw/openclaw",
        "--items-dir",
        itemsDir,
        "--item-number",
        "4242",
        "--max-attempts",
        "2",
        "--cooldown-minutes",
        "45",
        "--report-path",
        reportPath,
      ]);
    };

    withMockGh(root, ghMock, () => {
      runRetry();
      const afterFirstRun = readFileSync(itemPath, "utf8");
      assert.match(afterFirstRun, /^failed_review_retry_status: exhausted$/m);
      assert.equal((afterFirstRun.match(/^## Failed Review Retry$/gm) ?? []).length, 1);

      runRetry();
      const afterSecondRun = readFileSync(itemPath, "utf8");
      assert.equal(afterSecondRun, afterFirstRun);
    });

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      action: string;
      number: number;
    }>;
    assert.deepEqual(report, [
      {
        repo: "openclaw/openclaw",
        number: 4242,
        action: "skipped_retry_already_exhausted",
        reason: "retry attempts exhausted for head abc123def456: 2/2",
        headSha: "abc123def456",
        attempts: 2,
        reportPath: itemPath,
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderWorkPlanFromReport renders dashboard plan artifacts for fresh queue_fix_pr candidates", () => {
  const plan = renderWorkPlanFromReport(workPlanCandidateReport(), {
    reportPath: "records/openclaw-clawsweeper/items/321.md",
  });
  assert.ok(plan);
  assert.match(plan, /# Coding Plan for openclaw\/clawsweeper#321: Render work plans/);
  assert.match(plan, /Render generated plan markdown from existing report fields\./);
  assert.match(plan, /- `src\/clawsweeper\.ts`/);
  assert.match(plan, /- `pnpm run check`/);
  assert.match(plan, /openclaw\/clawsweeper#26/);
});

test("renderWorkPlanFromReport returns null for stale, reclassified, or non-candidate reports", () => {
  assert.equal(renderWorkPlanFromReport(workPlanCandidateReport({ work_candidate: "none" })), null);
  assert.equal(
    renderWorkPlanFromReport(workPlanCandidateReport({ work_status: "manual_review" })),
    null,
  );
  assert.equal(renderWorkPlanFromReport(workPlanCandidateReport({ action_taken: "closed" })), null);
  assert.equal(
    renderWorkPlanFromReport(workPlanCandidateReport({ reviewed_at: "2026-01-01T00:00:00.000Z" })),
    null,
  );
});

test("apply-artifacts writes and removes generated work plans", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const artifactDir = join(root, "artifacts");
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "321.md"), workPlanCandidateReport(), "utf8");
    execFileSync(process.execPath, [
      "dist/clawsweeper.js",
      "apply-artifacts",
      "--target-repo",
      "openclaw/clawsweeper",
      "--artifact-dir",
      artifactDir,
      "--items-dir",
      itemsDir,
      "--closed-dir",
      closedDir,
      "--plans-dir",
      plansDir,
      "--replay-closed-artifacts",
      "--skip-reconcile",
    ]);
    const planPath = join(plansDir, "321.md");
    assert.ok(existsSync(planPath));
    assert.match(readFileSync(planPath, "utf8"), /## Plan\n\nRender generated plan markdown/);

    writeFileSync(
      join(artifactDir, "321.md"),
      workPlanCandidateReport({ work_candidate: "none", work_status: "none" }),
      "utf8",
    );
    execFileSync(process.execPath, [
      "dist/clawsweeper.js",
      "apply-artifacts",
      "--target-repo",
      "openclaw/clawsweeper",
      "--artifact-dir",
      artifactDir,
      "--items-dir",
      itemsDir,
      "--closed-dir",
      closedDir,
      "--plans-dir",
      plansDir,
      "--replay-closed-artifacts",
      "--skip-reconcile",
    ]);
    assert.equal(existsSync(planPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions removes archived work plans from the scoped plans directory", () => {
  const root = mkdtempSync(tmpPrefix);
  const originalGhBin = process.env.GH_BIN;
  const originalGhBinArgs = process.env.GH_BIN_ARGS;
  const defaultPlanDir = join(process.cwd(), "records", "openclaw-clawsweeper", "plans");
  const defaultPlanPath = join(defaultPlanDir, "321.md");
  try {
    const binDir = join(root, "bin");
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    mkdirSync(defaultPlanDir, { recursive: true });
    const ghMock = `#!/usr/bin/env node
const args = process.argv.slice(2).join(" ");
if (args.includes("/comments")) {
  console.log(JSON.stringify([[]]));
} else {
  console.log(JSON.stringify({
    number: 321,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/issues/321",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: "2026-05-02T00:00:00Z",
    state: "closed",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    pull_request: null
  }));
}
`;
    writeFileSync(join(binDir, "gh.js"), ghMock, { mode: 0o755 });
    writeFileSync(
      join(itemsDir, "321.md"),
      workPlanCandidateReport({
        item_snapshot_hash: "reviewed-snapshot",
        item_updated_at: "2026-05-01T00:00:00Z",
      }),
      "utf8",
    );
    writeFileSync(join(plansDir, "321.md"), "scoped generated plan\n", "utf8");
    writeFileSync(defaultPlanPath, "default generated plan\n", "utf8");

    process.env.GH_BIN = process.execPath;
    process.env.GH_BIN_ARGS = JSON.stringify([join(binDir, "gh.js")]);
    execFileSync(process.execPath, [
      "dist/clawsweeper.js",
      "apply-decisions",
      "--target-repo",
      "openclaw/clawsweeper",
      "--items-dir",
      itemsDir,
      "--closed-dir",
      closedDir,
      "--plans-dir",
      plansDir,
      "--limit",
      "1",
      "--processed-limit",
      "1",
      "--close-delay-ms",
      "0",
    ]);

    assert.equal(existsSync(join(plansDir, "321.md")), false);
    assert.ok(existsSync(defaultPlanPath));
    assert.ok(existsSync(join(closedDir, "321.md")));
  } finally {
    if (originalGhBin === undefined) delete process.env.GH_BIN;
    else process.env.GH_BIN = originalGhBin;
    if (originalGhBinArgs === undefined) delete process.env.GH_BIN_ARGS;
    else process.env.GH_BIN_ARGS = originalGhBinArgs;
    rmSync(root, { recursive: true, force: true });
    rmSync(defaultPlanPath, { force: true });
  }
});

test("apply-decisions skips advisory label sync when a close report changed since review", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      join(itemsDir, "321.md"),
      workPlanCandidateReport({
        decision: "close",
        action_taken: "proposed_close",
        close_reason: "implemented_on_main",
        confidence: "high",
        item_snapshot_hash: "reviewed-snapshot",
        item_updated_at: "2026-05-01T00:00:00Z",
        reproduction_status: "reproduced",
        reproduction_confidence: "high",
      }),
      "utf8",
    );

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/issues/321",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-03T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    pull_request: null
  }));
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
} else if (args[0] === "label" || args[0] === "issue") {
  console.log("");
} else {
  console.error("unexpected gh args", JSON.stringify(args));
  process.exit(1);
}
`;
    withMockGh(root, ghMock, () => {
      runApplyDecisionsForTest({ itemsDir, closedDir, plansDir, reportPath });
    });

    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    assert.equal(
      calls.some((args) => args[0] === "issue" && args[1] === "edit"),
      false,
    );
    assert.equal(
      calls.some((args) => args[0] === "label" && args[1] === "create"),
      false,
    );
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "skipped_changed_since_review",
        reason: "updated_at changed",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions records PR label sync as ClawSweeper-owned churn", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    const itemPath = join(itemsDir, "74478.md");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      itemPath,
      `${reportFrontMatter({
        repository: "openclaw/clawsweeper",
        type: "pull_request",
        number: "74478",
        title: "Record PR label churn",
        url: "https://github.com/openclaw/clawsweeper/pull/74478",
        decision: "keep_open",
        close_reason: "none",
        confidence: "high",
        action_taken: "kept_open",
        review_status: "complete",
        local_checkout_access: "verified",
        author: "contributor",
        author_association: "CONTRIBUTOR",
        labels: JSON.stringify([]),
        item_category: "feature",
        requires_new_feature: "true",
        item_snapshot_hash: "snapshot-a",
        item_updated_at: "2026-05-19T20:00:00Z",
        pull_head_sha: "abc123def456",
      })}

## Summary

This PR has complete review metadata and needs only ClawSweeper-owned labels.

${realBehaviorProofReportSection({ evidenceKind: "screenshot" })}

${prRatingReportSection({ overallTier: "A" })}

## Feature Showcase

Status: showcase

Reason: This unlocks a notably useful maintainer workflow that did not exist before.

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`,
      "utf8",
    );

    const ghMock = `
const { appendFileSync, readFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && /\\/issues\\/74478$/.test(path)) {
  console.log(JSON.stringify({
    number: 74478,
    title: "Record PR label churn",
    html_url: "https://github.com/openclaw/clawsweeper/pull/74478",
    created_at: "2026-05-19T19:00:00Z",
    updated_at: "2026-05-19T20:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "contributor" },
    labels: [],
    pull_request: {}
  }));
} else if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/74478\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/74478\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/pulls\\/74478$/.test(path)) {
  console.log(JSON.stringify({
    number: 74478,
    html_url: "https://github.com/openclaw/clawsweeper/pull/74478",
    state: "open",
    changed_files: 1,
    commits: 1,
    review_comments: 0,
    head: { sha: "abc123def456", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
    user: { login: "contributor" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/74478\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/74478\\/comments(?:\\?|$)/.test(path)) {
  if (args.includes("--method") && args.includes("POST")) {
    const input = args[args.indexOf("--input") + 1];
    appendFileSync(logPath, JSON.stringify(["posted-comment-body", JSON.parse(readFileSync(input, "utf8")).body]) + "\\n");
    console.log(JSON.stringify({
      id: 987478,
      html_url: "https://github.com/openclaw/clawsweeper/pull/74478#issuecomment-987478"
    }));
  } else {
    console.log(JSON.stringify([[]]));
  }
} else if (args[0] === "label" && args[1] === "create") {
  console.log(JSON.stringify({ name: args[2] }));
} else if (args[0] === "issue" && args[1] === "edit") {
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
        extraArgs: ["--sync-comments-only", "--item-numbers", "74478"],
      });
    });

    const report = readFileSync(itemPath, "utf8");
    assert.match(report, /^labels_synced_at: /m);
    assert.match(report, /proof: sufficient/);
    assert.match(report, /proof: 📸 screenshot/);
    assert.match(report, /rating: 🦞 diamond lobster/);
    assert.match(report, /feature: ✨ showcase/);
    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert(
      calls.some(
        (args) => args[0] === "label" && args[1] === "create" && args[2] === "feature: ✨ showcase",
      ),
    );
    assert(
      calls.some(
        (args) =>
          args[0] === "issue" &&
          args[1] === "edit" &&
          args.includes("--add-label") &&
          args.includes("feature: ✨ showcase"),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions refreshes recent PR comments after label sync adds justifications", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    const itemPath = join(itemsDir, "74479.md");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      itemPath,
      `${reportFrontMatter({
        repository: "openclaw/clawsweeper",
        type: "pull_request",
        number: "74479",
        title: "Refresh label explanation",
        url: "https://github.com/openclaw/clawsweeper/pull/74479",
        decision: "keep_open",
        close_reason: "none",
        confidence: "high",
        action_taken: "kept_open",
        review_status: "complete",
        local_checkout_access: "verified",
        author: "contributor",
        author_association: "CONTRIBUTOR",
        labels: JSON.stringify([]),
        item_snapshot_hash: "snapshot-a",
        item_updated_at: "2026-05-19T20:00:00Z",
        pull_head_sha: "abc123def456",
        review_comment_synced_at: "2026-05-19T23:59:00Z",
      })}

## Summary

This PR needs labels and the latest comment must explain them.

${realBehaviorProofReportSection({ evidenceKind: "screenshot" })}

${prRatingReportSection({ overallTier: "A" })}

## Review Findings

Overall correctness: patch is correct

Overall confidence: 0.9

Full review comments:

- none
`,
      "utf8",
    );

    const staleCommentBody =
      "Codex review: needs maintainer review before merge.\n\n<!-- clawsweeper-review item=74479 -->";
    const ghMock = `
const { appendFileSync, readFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const staleCommentBody = ${JSON.stringify(staleCommentBody)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && /\\/issues\\/74479$/.test(path)) {
  console.log(JSON.stringify({
    number: 74479,
    title: "Refresh label explanation",
    html_url: "https://github.com/openclaw/clawsweeper/pull/74479",
    created_at: "2026-05-19T19:00:00Z",
    updated_at: "2026-05-19T20:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "contributor" },
    labels: [],
    pull_request: {}
  }));
} else if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/74479\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/74479\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/pulls\\/74479$/.test(path)) {
  console.log(JSON.stringify({
    number: 74479,
    html_url: "https://github.com/openclaw/clawsweeper/pull/74479",
    state: "open",
    changed_files: 1,
    commits: 1,
    review_comments: 0,
    head: { sha: "abc123def456", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
    user: { login: "contributor" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/74479\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/74479\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[
    {
      id: 987479,
      html_url: "https://github.com/openclaw/clawsweeper/pull/74479#issuecomment-987479",
      body: staleCommentBody,
      user: { login: "clawsweeper[bot]" },
      created_at: "2026-05-19T23:59:00Z",
      updated_at: "2026-05-19T23:59:00Z"
    }
  ]]));
} else if (args[0] === "api" && /\\/issues\\/comments\\/987479$/.test(path)) {
  const input = args[args.indexOf("--input") + 1];
  appendFileSync(logPath, JSON.stringify(["patched-review-body", JSON.parse(readFileSync(input, "utf8")).body]) + "\\n");
  console.log(JSON.stringify({
    id: 987479,
    html_url: "https://github.com/openclaw/clawsweeper/pull/74479#issuecomment-987479"
  }));
} else if (args[0] === "label" && args[1] === "create") {
  console.log(JSON.stringify({ name: args[2] }));
} else if (args[0] === "issue" && args[1] === "edit") {
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
          "--sync-comments-only",
          "--comment-sync-min-age-days",
          "7",
          "--item-numbers",
          "74479",
        ],
      });
    });

    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    const patchedBody = calls.find((args) => args[0] === "patched-review-body")?.[1] ?? "";
    assert.match(patchedBody, /Label justifications:/);
    assert.match(patchedBody, /`proof: sufficient`/);
    assert.match(patchedBody, /`proof: 📸 screenshot`/);
    assert.match(patchedBody, /`rating: 🦞 diamond lobster`/);
    assert.match(readFileSync(itemPath, "utf8"), /^labels_synced_at: /m);
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 74479,
        action: "review_comment_synced",
        reason: "updated durable Codex review comment",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not advisory-label close proposals before close gates finish", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const closeReport = workPlanCandidateReport({
      decision: "close",
      action_taken: "proposed_close",
      close_reason: "implemented_on_main",
      confidence: "high",
      item_snapshot_hash: "reviewed-snapshot",
      item_updated_at: "2026-05-01T00:00:00Z",
      reproduction_status: "reproduced",
      reproduction_confidence: "high",
    });
    const synced = reportWithSyncedReviewComment(closeReport, 321, "implemented_on_main");
    writeFileSync(join(itemsDir, "321.md"), synced.report, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  const timeline = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
  console.log('HTTP/2 200\\nlink: <https://api.github.com/repos/openclaw/clawsweeper/issues/321/timeline?per_page=100&page=2>; rel="last"\\n\\n' + JSON.stringify(timeline));
} else if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[{
    id: 9321,
    html_url: "https://github.com/openclaw/clawsweeper/issues/321#issuecomment-9321",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comment
  }]]));
} else if (args[0] === "api" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/issues/321",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    comments: 0,
    pull_request: null
  }));
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
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
        extraArgs: ["--apply-close-reasons", "stale_insufficient_info"],
      });
    });

    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    assert.equal(
      calls.some((args) => args[0] === "issue" && args[1] === "edit"),
      false,
    );
    assert.equal(
      calls.some((args) => args[0] === "label" && args[1] === "create"),
      false,
    );
    assert.equal(
      calls.some(
        (args) =>
          args[0] === "api" &&
          (args[1] ?? "").endsWith("/issues/321/timeline?per_page=100") &&
          args.includes("--paginate"),
      ),
      true,
    );
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "kept_open",
        reason: "close reason implemented_on_main is not enabled for this apply run",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions posts an explicit close-time note before closing PR proposals", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    const postedBodiesPath = join(root, "posted-bodies.jsonl");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const closeReport = `${workPlanCandidateReport({
      type: "pull_request",
      decision: "close",
      action_taken: "proposed_close",
      close_reason: "implemented_on_main",
      confidence: "high",
      item_snapshot_hash: "reviewed-snapshot",
      item_updated_at: "2026-05-01T00:00:00Z",
      reproduction_status: "reproduced",
      reproduction_confidence: "high",
      fixed_pr_url: "https://github.com/openclaw/clawsweeper/pull/900",
      fixed_pr_number: "900",
      fixed_sha: "1234567890abcdef1234567890abcdef12345678",
      fixed_at: "2026-05-01T02:00:00Z",
    })}\n\n## Evidence\n\n- **main fix:** git show confirms current main has the replacement implementation and it is not in the latest release yet\n  - file: [src/clawsweeper.ts](https://github.com/openclaw/clawsweeper/blob/1234567890abcdef1234567890abcdef12345678/src/clawsweeper.ts)\n  - sha: [1234567890ab](https://github.com/openclaw/clawsweeper/commit/1234567890abcdef1234567890abcdef12345678)\n\n## Close Comment\n\nClosing this PR because the fix is already on main.\n`;
    const synced = reportWithSyncedReviewComment(closeReport, 321, "implemented_on_main");
    writeFileSync(join(itemsDir, "321.md"), synced.report, "utf8");

    const ghMock = `
const { appendFileSync, readFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const postedBodiesPath = ${JSON.stringify(postedBodiesPath)};
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  if (args.includes("--method") && args.includes("POST")) {
    const input = args[args.indexOf("--input") + 1];
    const payload = JSON.parse(readFileSync(input, "utf8"));
    appendFileSync(postedBodiesPath, JSON.stringify(payload.body) + "\\n");
    console.log(JSON.stringify({ id: 9322, html_url: "https://github.com/openclaw/clawsweeper/pull/321#issuecomment-9322" }));
  } else {
    console.log(JSON.stringify([[{
      id: 9321,
      html_url: "https://github.com/openclaw/clawsweeper/pull/321#issuecomment-9321",
      created_at: "2026-05-01T01:00:00Z",
      updated_at: "2026-05-01T01:00:00Z",
      user: { login: "clawsweeper[bot]" },
      body: comment
    }]]));
  }
} else if (args[0] === "api" && /\\/issues\\/comments\\/9321$/.test(path)) {
  console.log(JSON.stringify({ id: 9321, html_url: "https://github.com/openclaw/clawsweeper/pull/321#issuecomment-9321" }));
} else if (args[0] === "api" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "MEMBER",
    user: { login: "reporter" },
    labels: ["maintainer"],
    comments: 1,
    pull_request: { url: "https://api.github.com/repos/openclaw/clawsweeper/pulls/321" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
    state: "open",
    changed_files: 0,
    commits: 0,
    review_comments: 0,
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
    user: { login: "reporter" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/321\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "pr" && args[1] === "close" && args[2] === "321") {
  console.log("");
} else if (args[0] === "issue" && args[1] === "edit") {
  console.log("");
} else if (args[0] === "label") {
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
        extraArgs: ["--apply-kind", "all", "--processed-limit", "2"],
      });
    });

    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    const postIndex = calls.findIndex(
      (args) =>
        args[0] === "api" &&
        (args[1] ?? "").endsWith("/issues/321/comments") &&
        args.includes("POST"),
    );
    const closeIndex = calls.findIndex(
      (args) => args[0] === "pr" && args[1] === "close" && args[2] === "321",
    );
    assert.ok(postIndex >= 0);
    assert.ok(closeIndex > postIndex);
    const postedBodies = readFileSync(postedBodiesPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string);
    assert.equal(postedBodies.length, 1);
    assert.match(postedBodies[0], /ClawSweeper applied the proposed close for this PR/);
    assert.match(postedBodies[0], /Close reason: already implemented on main/);
    assert.match(postedBodies[0], /durable ClawSweeper review/);
    assert.match(postedBodies[0], /clawsweeper-close-applied item=321/);
    assert.ok(existsSync(join(closedDir, "321.md")));
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "review_comment_synced",
        reason: "updated durable Codex review comment",
      },
      {
        number: 321,
        action: "closed",
        reason: "already implemented on main; posted close-applied comment",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps low-signal PRs open when live maintainer comments exist", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const closeReport = lowSignalCloseReport({ number: 322, title: "Add provider clamp" });
    const synced = reportWithSyncedReviewComment(closeReport, 322, "low_signal_unmergeable_pr");
    writeFileSync(join(itemsDir, "322.md"), synced.report, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/322\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/322\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[
    {
      id: 9322,
      html_url: "https://github.com/openclaw/clawsweeper/pull/322#issuecomment-9322",
      created_at: "2026-05-01T01:00:00Z",
      updated_at: "2026-05-01T01:00:00Z",
      author_association: "NONE",
      user: { login: "clawsweeper[bot]" },
      body: comment
    },
    {
      id: 9323,
      html_url: "https://github.com/openclaw/clawsweeper/pull/322#issuecomment-9323",
      created_at: "2026-05-01T01:30:00Z",
      updated_at: "2026-05-01T01:30:00Z",
      author_association: "MEMBER",
      user: { login: "maintainer" },
      body: "I am taking a look."
    }
  ]]));
} else if (args[0] === "api" && /\\/issues\\/322\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/322$/.test(path)) {
  console.log(JSON.stringify({
    number: 322,
    title: "Add provider clamp",
    html_url: "https://github.com/openclaw/clawsweeper/pull/322",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    assignees: [],
    comments: 2,
    pull_request: { url: "https://api.github.com/repos/openclaw/clawsweeper/pulls/322" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/322$/.test(path)) {
  console.log(JSON.stringify({
    number: 322,
    html_url: "https://github.com/openclaw/clawsweeper/pull/322",
    state: "open",
    changed_files: 4,
    commits: 1,
    review_comments: 0,
    requested_reviewers: [],
    requested_teams: [],
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
    user: { login: "reporter" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/322\\/reviews(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/pulls\\/322\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "issue" && args[1] === "edit") {
  console.log("");
} else if (args[0] === "label") {
  console.log("");
} else {
  console.error("unexpected gh args", JSON.stringify(args));
  process.exit(1);
}
`;
    withMockGh(root, ghMock, () => {
      runApplyDecisionsForTest({
        targetRepo: "openclaw/openclaw",
        itemsDir,
        closedDir,
        plansDir,
        reportPath,
        extraArgs: [
          "--apply-kind",
          "all",
          "--processed-limit",
          "2",
          "--apply-close-reasons",
          "low_signal_unmergeable_pr",
        ],
      });
    });

    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
    assert.equal(
      calls.some((args) => args[0] === "pr" && args[1] === "close"),
      false,
    );
    assert.equal(existsSync(join(closedDir, "322.md")), false);
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 322,
        action: "kept_open",
        reason: "maintainer issue comment blocks low-signal auto-close",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions retries legacy fixed close skips", () => {
  for (const actionTaken of ["skipped_maintainer_authored", "skipped_invalid_decision"]) {
    const root = mkdtempSync(tmpPrefix);
    try {
      const itemsDir = join(root, "items");
      const closedDir = join(root, "closed");
      const plansDir = join(root, "plans");
      const reportPath = join(root, "apply-report.json");
      const logPath = join(root, "gh.log");
      mkdirSync(itemsDir, { recursive: true });
      mkdirSync(plansDir, { recursive: true });
      const closeReport = implementedCloseReport({
        type: "pull_request",
        action_taken: actionTaken,
        author_association: "MEMBER",
        labels: JSON.stringify(["maintainer"]),
      }).replace(
        "## Close Comment\n\nClosing this because the requested behavior is already on main.\n",
        "## Close Comment\n\n_No close comment posted._\n",
      );
      const synced = reportWithSyncedReviewComment(closeReport, 321, "implemented_on_main");
      writeFileSync(join(itemsDir, "321.md"), synced.report, "utf8");

      const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[{
    id: 9321,
    html_url: "https://github.com/openclaw/clawsweeper/pull/321#issuecomment-9321",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comment
  }]]));
} else if (args[0] === "api" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/321$/.test(path)) {
  if (args.includes("--method") && args.includes("PATCH")) {
    console.log(JSON.stringify({ state: "closed" }));
  } else {
    console.log(JSON.stringify({
      number: 321,
      title: "Render work plans",
      html_url: "https://github.com/openclaw/clawsweeper/pull/321",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      closed_at: null,
      state: "open",
      locked: false,
      active_lock_reason: null,
      author_association: "MEMBER",
      user: { login: "maintainer" },
      labels: ["maintainer"],
      comments: 1,
      pull_request: { url: "https://api.github.com/repos/openclaw/clawsweeper/pulls/321" }
    }));
  }
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
    state: "open",
    changed_files: 0,
    commits: 0,
    review_comments: 0,
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
    user: { login: "maintainer" }
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
          extraArgs: ["--dry-run", "--apply-kind", "all", "--processed-limit", "2"],
        });
      });

      assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
        {
          number: 321,
          action: "review_comment_synced",
          reason: "would update durable Codex review comment",
        },
        {
          number: 321,
          action: "closed",
          reason:
            "dry-run: would close as already implemented on main; dry-run: would post close-applied comment",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("apply-decisions retries legacy kept-open close reports", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const closeReport = implementedCloseReport({
      type: "pull_request",
      action_taken: "kept_open",
    });
    const synced = reportWithSyncedReviewComment(closeReport, 321, "implemented_on_main");
    writeFileSync(join(itemsDir, "321.md"), synced.report, "utf8");

    const ghMock = `
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[{
    id: 9321,
    html_url: "https://github.com/openclaw/clawsweeper/pull/321#issuecomment-9321",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comment
  }]]));
} else if (args[0] === "api" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
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
    pull_request: { url: "https://api.github.com/repos/openclaw/clawsweeper/pulls/321" }
  }));
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
    state: "open",
    changed_files: 0,
    commits: 0,
    review_comments: 0,
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
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
        extraArgs: ["--dry-run", "--apply-kind", "all", "--processed-limit", "2"],
      });
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "review_comment_synced",
        reason: "would update durable Codex review comment",
      },
      {
        number: 321,
        action: "closed",
        reason:
          "dry-run: would close as already implemented on main; dry-run: would post close-applied comment",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions pair-closes issues blocked by closeable linked PRs", () => {
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
        title: "Issue fixed by main",
        action_taken: "skipped_open_closing_pr",
      }),
      320,
      "implemented_on_main",
    );
    const pullSynced = reportWithSyncedReviewComment(
      implementedCloseReport({
        repository: "openclaw/openclaw",
        number: 321,
        type: "pull_request",
        title: "Obsolete linked PR",
        action_taken: "kept_open",
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
    html_url: "https://github.com/openclaw/clawsweeper/issues/" + number + "#issuecomment-" + (9000 + number),
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
    title: "Issue fixed by main",
    html_url: "https://github.com/openclaw/clawsweeper/issues/320",
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
    title: "Obsolete linked PR",
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
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
    pull_request: { url: "https://api.github.com/repos/openclaw/clawsweeper/pulls/321" }
  }));
} else if (args[0] === "issue" && args[1] === "view" && args[2] === "320") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [{ number: 321 }] }));
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Obsolete linked PR",
    html_url: "https://github.com/openclaw/clawsweeper/pull/321",
    state: "open",
    changed_files: 0,
    commits: 0,
    review_comments: 0,
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/clawsweeper" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/clawsweeper" } },
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
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.number === 320 && entry.action === "closed"),
      true,
    );
    assert.equal(
      report.some((entry) => entry.number === 321 && entry.action === "closed"),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions upgrades live no-diff kept-open PRs to duplicate closes", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      join(itemsDir, "322.md"),
      workPlanCandidateReport({
        number: 322,
        repository: "openclaw/openclaw",
        type: "pull_request",
        title: "Empty PR",
        url: "https://github.com/openclaw/openclaw/pull/322",
        decision: "keep_open",
        close_reason: "none",
        action_taken: "kept_open",
        item_snapshot_hash: "reviewed-snapshot",
        item_created_at: "2026-05-01T00:00:00Z",
        item_updated_at: "2026-05-01T00:00:00Z",
        pull_head_sha: "head-sha",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      "utf8",
    );

    const ghMock = `
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/322\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/322\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/322\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/322$/.test(path)) {
  console.log(JSON.stringify({
    number: 322,
    title: "Empty PR",
    html_url: "https://github.com/openclaw/openclaw/pull/322",
    body: "No remaining diff.",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: null,
    state: "open",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    comments: 0,
    pull_request: { url: "https://api.github.com/repos/openclaw/openclaw/pulls/322" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/322$/.test(path)) {
  console.log(JSON.stringify({
    number: 322,
    title: "Empty PR",
    html_url: "https://github.com/openclaw/openclaw/pull/322",
    state: "open",
    changed_files: 0,
    commits: 0,
    review_comments: 0,
    body: "No remaining diff.",
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/openclaw" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/openclaw" } },
    user: { login: "reporter" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/400$/.test(path)) {
  console.log(JSON.stringify({
    number: 400,
    title: "Old related PR",
    html_url: "https://github.com/openclaw/openclaw/pull/400",
    state: "closed",
    merged_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z",
    mergeable_state: "clean",
    body: "Old related PR body.",
    labels: [{ name: "proof: sufficient" }]
  }));
} else if (args[0] === "api" && /\\/issues\\/400$/.test(path)) {
  console.log(JSON.stringify({
    number: 400,
    title: "Old related PR",
    html_url: "https://github.com/openclaw/openclaw/pull/400",
    body: "Old related PR body.",
    state: "closed",
    updated_at: "2026-05-02T00:00:00Z",
    labels: [{ name: "proof: sufficient" }],
    comments: 0,
    pull_request: { url: "https://api.github.com/repos/openclaw/openclaw/pulls/400" }
  }));
} else if (args[0] === "api" && /\\/issues\\/400\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([]));
} else if (args[0] === "api" && /\\/pulls\\/400\\/files(?:\\?|$)/.test(path)) {
  const files = [{ filename: "src/runtime.ts" }];
  if (args.includes("--jq")) console.log(JSON.stringify(files.map((file) => file.filename)));
  else console.log(JSON.stringify([files]));
} else if (args[0] === "api" && /\\/pulls\\/322\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "label" || args[0] === "issue") {
  console.log("");
} else {
  console.error("unexpected gh args", JSON.stringify(args));
  process.exit(1);
}
`;
    withMockGh(root, ghMock, () => {
      withMockCodexProof(
        root,
        { type: "failure", message: "proof should not run for no-diff PR" },
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
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 322,
        action: "review_comment_synced",
        reason: "would create durable Codex review comment",
      },
      {
        number: 322,
        action: "closed",
        reason:
          "dry-run: would close as duplicate or superseded; dry-run: would post close-applied comment",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions promotes old F-rated stale PRs to duplicate closes", () => {
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
        work_cluster_refs: JSON.stringify(["Related discussion in #400"]),
      }),
      330,
      "none",
    );
    writeFileSync(join(itemsDir, "330.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 330,
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Related cleanup",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            body: "Related cleanup, not stale PR coverage evidence.",
            comments: [],
            labels: [],
          },
        },
      }),
      () => {
        withMockCodexProof(
          root,
          { type: "failure", message: "proof should not run for stale promotion incidental ref" },
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
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.some((entry) => entry.action === "review_comment_synced"),
      true,
    );
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      true,
    );
    assert.match(
      report.find((entry) => entry.action === "closed")?.reason ?? "",
      /duplicate or superseded/,
    );
    assert.doesNotMatch(JSON.stringify(report), /proof should not run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions promotes stale PRs after automation-only drift", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(stalePullRequestReport(), 330, "none");
    writeFileSync(join(itemsDir, "330.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 330,
        comment: synced.comment,
        itemUpdatedAt: "2026-05-02T00:00:00Z",
      }),
      () => {
        withMockCodexProof(
          root,
          {
            type: "decision",
            decision: "covered",
            reason: "PR B is the canonical PR covering PR A.",
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

test("apply-decisions does not promote stale PRs from truncated activity", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(stalePullRequestReport(), 330, "none");
    writeFileSync(join(itemsDir, "330.md"), synced.report, "utf8");

    const comments = Array.from({ length: 24 }, (_, index) => ({
      id: 9330 + index,
      html_url: `https://github.com/openclaw/openclaw/pull/330#issuecomment-${9330 + index}`,
      created_at: "2026-05-01T01:00:00Z",
      updated_at: "2026-05-01T01:00:00Z",
      user: { login: "clawsweeper[bot]" },
      body: index === 0 ? synced.comment : "automation label sync",
    }));

    withMockGh(
      root,
      promotionGhMock({
        number: 330,
        comment: synced.comment,
        comments,
        issueCommentCount: 25,
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

test("apply-decisions does not promote stale PRs after human follow-up", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const synced = reportWithSyncedReviewComment(stalePullRequestReport(), 330, "none");
    writeFileSync(join(itemsDir, "330.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 330,
        comment: synced.comment,
        comments: [
          {
            id: 9330,
            html_url: "https://github.com/openclaw/openclaw/pull/330#issuecomment-9330",
            created_at: "2026-05-01T01:00:00Z",
            updated_at: "2026-05-01T01:00:00Z",
            user: { login: "clawsweeper[bot]" },
            body: synced.comment,
          },
          {
            id: 9331,
            html_url: "https://github.com/openclaw/openclaw/pull/330#issuecomment-9331",
            created_at: "2026-05-01T02:00:00Z",
            updated_at: "2026-05-01T02:00:00Z",
            user: { login: "reporter" },
            body: "I can still work on this.",
          },
        ],
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
    assert.match(readFileSync(join(itemsDir, "330.md"), "utf8"), /^action_taken: kept_open$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions promotes recommended pause-or-close PRs", () => {
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
        number: 331,
        title: "Superseded prompt PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        merge_risk_options: JSON.stringify([
          {
            title: "Close as superseded after maintainer decision",
            body: "Current-main prompt work already covers the useful guidance.",
            category: "pause_or_close",
            recommended: true,
            automergeInstruction: "",
          },
        ]),
      }),
      331,
      "none",
    );
    writeFileSync(join(itemsDir, "331.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({ number: 331, title: "Superseded prompt PR", comment: synced.comment }),
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
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions promotes PRs superseded by linked pull requests", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const proofLogPath = join(root, "proof.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const linkedMarkdownLabelReport = stalePullRequestReport({
      number: 332,
      title: "Old activity PR",
      pr_rating_overall: "D",
      pr_rating_proof: "D",
      pr_rating_patch: "D",
      work_cluster_refs: JSON.stringify([
        "[replacement PR](https://github.com/openclaw/openclaw/pull/400)",
      ]),
    })
      .replace("Overall tier: F", "Overall tier: D")
      .replace("Proof tier: F", "Proof tier: D")
      .replace("Patch tier: F", "Patch tier: D");
    const synced = reportWithSyncedReviewComment(linkedMarkdownLabelReport, 332, "none");
    writeFileSync(join(itemsDir, "332.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 332,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical activity PR",
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
            reason: "PR B is the canonical PR covering PR A.",
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

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
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
    assert.match(readFileSync(proofLogPath, "utf8"), /proof/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions does not promote docs-only PRs superseded by code-only pull requests", () => {
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
        title: "ENETDOWN docs companion",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        pr_rating_patch: "D",
        pull_files: JSON.stringify(["docs/gateway/troubleshooting.md", "docs/platforms/macos.md"]),
        pull_files_truncated: false,
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      337,
      "none",
    );
    writeFileSync(join(itemsDir, "337.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 337,
        title: "ENETDOWN docs companion",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical ENETDOWN runtime fix",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-26T17:40:32Z",
            mergeable_state: "clean",
            labels: ["proof: sufficient"],
            files: [
              "src/infra/unhandled-rejections.ts",
              "extensions/telegram/src/network-errors.ts",
            ],
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

test("apply-decisions keeps promoted PR close proposals open when coverage proof fails", () => {
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
        number: 352,
        title: "Old activity PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      352,
      "none",
    );
    writeFileSync(join(itemsDir, "352.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 352,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical activity PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            labels: ["proof: sufficient"],
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

test("apply-decisions promotes PRs superseded by merged linked pull requests without proof labels", () => {
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
        title: "Old merged-replacement PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      333,
      "none",
    );
    writeFileSync(join(itemsDir, "333.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 333,
        title: "Old merged-replacement PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Merged canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "closed",
            merged_at: "2026-05-02T00:00:00Z",
            mergeable_state: "dirty",
            labels: ["status: needs proof", "rating: unranked krab"],
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

test("apply-decisions does not promote PRs superseded by no-proof linked pull requests", () => {
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
        title: "Old activity PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      334,
      "none",
    );
    writeFileSync(join(itemsDir, "334.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 334,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Canonical activity PR without proof",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
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

test("apply-decisions does not promote PRs superseded by unsafe linked pull requests", () => {
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
        number: 335,
        title: "Old activity PR",
        pr_rating_overall: "D",
        pr_rating_proof: "D",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      335,
      "none",
    );
    writeFileSync(join(itemsDir, "335.md"), synced.report, "utf8");

    withMockGh(
      root,
      promotionGhMock({
        number: 335,
        title: "Old activity PR",
        comment: synced.comment,
        linkedPulls: {
          400: {
            number: 400,
            title: "Unsafe canonical PR",
            html_url: "https://github.com/openclaw/openclaw/pull/400",
            state: "open",
            merged_at: null,
            mergeable_state: "clean",
            labels: ["triage: needs-real-behavior-proof", "status: 📣 needs proof"],
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
