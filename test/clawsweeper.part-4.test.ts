import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

import {
  applyDecisionPriority,
  auditFromSnapshot,
  auditHasStrictFailures,
  auditHealthSection,
  closingPullRequestReferenceTarget,
  codexEnv,
  dashboardClosedAt,
  featureShowcaseLabelsForTest,
  formatRecentClosedRows,
  ghRetryKind,
  isGitHubNotFoundError,
  isGitHubRequiresAuthenticationError,
  isLockedConversationCommentError,
  isMissingGitHubLabelErrorForTest,
  issueAdvisoryLabelsForTest,
  labelJustificationsMarkdownForTest,
  itemNumbersArg,
  lockedConversationApplyReason,
  makeTreeReadOnlyForTest,
  parseDecision,
  mergeRiskLabelsForTest,
  mergeRiskLabelSchemeForTest,
  prRatingLabelsForTest,
  prRatingLabelSchemeForTest,
  prepareMediaProofArtifactsForTest,
  proofVideoUrlsFromContextForTest,
  prStatusLabelsForTest,
  prStatusLabelSchemeForTest,
  priorityLabelsForTest,
  priorityLabelSchemeForTest,
  proofNudgeCandidateRecordsForTest,
  proofNudgeEligibilityForTest,
  realBehaviorProofMediaLabelsForTest,
  realBehaviorProofSufficientLabelsForTest,
  botProofCandidateRecordsForTest,
  botProofEligibilityForTest,
  relatedGitHubIssueSearchQueryForTest,
  relatedTitleSearchTerms,
  renderBotProofDecisionCommentForTest,
  renderProofNudgeCommentForTest,
  reviewArtifactDestination,
  reviewAutomationMarkersFromReport,
  reviewPromptForTest,
  renderReviewCommentFromReport,
  restoreTreeModesForTest,
  reviewDecisionSchemaText,
  reviewPromptTemplate,
  runCodexForTest,
  impactLabelsForTest,
  impactLabelSchemeForTest,
  runtimeBudgetExceeded,
  safeOutputTail,
  redactInternalCodexModel,
  codexFailureDecisionForTest,
  shardItemNumbers,
  shouldSyncReviewComment,
  shouldRetryGh,
  telegramVisibleProofLabelsForTest,
} from "../dist/clawsweeper.js";
import { AUTOMATION_LIMITS } from "../dist/limits.js";

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

function detailsBody(markdown, summary) {
  const marker = `<summary>${summary}</summary>`;
  const markerIndex = markdown.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing details summary ${summary}`);
  const bodyStart = markerIndex + marker.length;
  const bodyEnd = markdown.indexOf("</details>", bodyStart);
  assert.notEqual(bodyEnd, -1, `missing details close for ${summary}`);
  return markdown.slice(bodyStart, bodyEnd);
}

function auditRecord(number, overrides = {}) {
  return {
    repo: "openclaw/openclaw",
    number,
    location: "items",
    path: `items/${number}.md`,
    kind: "issue",
    title: `Item ${number}`,
    labels: [],
    decision: "keep_open",
    closeReason: "none",
    action: "kept_open",
    reviewStatus: "complete",
    currentState: undefined,
    ...overrides,
  };
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

function mergeRiskReviewComment({
  risk,
  options,
  bestSolution = "Resolve the merge risk before maintainers decide whether to land this PR.",
}: {
  risk: string;
  options: readonly Record<string, unknown>[];
  bestSolution?: string;
}): string {
  return renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "83400",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
      merge_risk_options: JSON.stringify(options),
    })}

## Summary

Keep this fail-closed provider-routing PR open for maintainer review.

## What This Changes

Changes missing Codex harness selection from fallback-tolerant behavior to a typed fail-closed error.

## Best Possible Solution

${bestSolution}

## Risks / Open Questions

${risk}

## Work Candidate

Candidate: none

Confidence: low

Priority: low

Status: none

Reason: Confirm whether this intentional fail-closed behavior is acceptable for existing fallback users.
`,
    "none",
  );
}

function escapeRegExpForTest(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function proofNudgeReport(overrides = {}) {
  const values = {
    labels: JSON.stringify(["triage: needs-real-behavior-proof"]),
    authorAssociation: "CONTRIBUTOR",
    author: "contributor",
    reviewStatus: "complete",
    headSha: "abc123def456",
    reviewedAt: "2026-01-01T00:00:00Z",
    itemCategory: "feature",
    pullFiles: JSON.stringify(["src/app.ts"]),
    proofStatus: "missing",
    evidenceKind: "none",
    needsContributorAction: "true",
    proofSummary: "The PR needs after-fix proof from a real setup.",
    securityReviewStatus: "cleared",
    securityReviewSummary: "No security-sensitive review is needed for this proof nudge.",
    mantisStatus: "not_recommended",
    mantisScenario: "none",
    mantisReason: "Mantis proof is not useful for this sample.",
    mantisComment: "",
    ...overrides,
  };
  return `---
repository: openclaw/openclaw
number: 42
type: pull_request
title: Proof nudge sample
author: ${values.author}
author_association: ${values.authorAssociation}
labels: ${values.labels}
item_category: ${values.itemCategory}
review_status: ${values.reviewStatus}
pull_files: ${values.pullFiles}
pull_files_truncated: false
pull_head_sha: ${values.headSha}
reviewed_at: ${values.reviewedAt}
---

## Real Behavior Proof

Status: ${values.proofStatus}

Evidence kind: ${values.evidenceKind}

Needs contributor action: ${values.needsContributorAction}

Summary: ${values.proofSummary}

## Security Review

Status: ${values.securityReviewStatus}

Summary: ${values.securityReviewSummary}

## Mantis Recommendation

Status: ${values.mantisStatus}

Scenario: ${values.mantisScenario}

Reason: ${values.mantisReason}

Maintainer comment: ${values.mantisComment}
`;
}

function proofNudgeItem(overrides = {}) {
  return item({
    kind: "pull_request",
    number: 42,
    title: "Proof nudge sample",
    author: "contributor",
    authorAssociation: "CONTRIBUTOR",
    labels: ["triage: needs-real-behavior-proof"],
    locked: false,
    activeLockReason: null,
    ...overrides,
  });
}

test("apply-decisions does not start same-author pair close when PR supersession is unsafe", () => {
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
      lowSignalCloseReport({
        repository: "openclaw/openclaw",
        number: 321,
        title: "Paired PR",
        author: "reporter",
        close_reason: "duplicate_or_superseded",
        action_taken: "skipped_same_author_pair",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      321,
      "duplicate_or_superseded",
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
    body: "Fixed by #321.",
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
    changed_files: 1,
    commits: 1,
    review_comments: 0,
    body: "Fixes #320.",
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/openclaw" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/openclaw" } },
    user: { login: "reporter" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/400$/.test(path)) {
  console.log(JSON.stringify({
    number: 400,
    title: "Closed unmerged canonical PR",
    html_url: "https://github.com/openclaw/openclaw/pull/400",
    state: "closed",
    merged_at: null,
    labels: [{ name: "bug" }]
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
    assert.equal(
      report.some((entry) => entry.action === "closed"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions records PR coverage proof retry before same-author pair skip", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const pullSynced = reportWithSyncedReviewComment(
      lowSignalCloseReport({
        repository: "openclaw/openclaw",
        number: 321,
        title: "Paired PR",
        author: "reporter",
        close_reason: "duplicate_or_superseded",
        action_taken: "proposed_close",
        work_cluster_refs: JSON.stringify([
          "Superseded by https://github.com/openclaw/openclaw/pull/400",
        ]),
      }),
      321,
      "duplicate_or_superseded",
    );
    writeFileSync(join(itemsDir, "321.md"), pullSynced.report, "utf8");

    const ghMock = `
const comments = {
  321: ${JSON.stringify(pullSynced.comment)}
};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
const path = args[1] || "";
const issueNumber = (path.match(/\\/issues\\/(\\d+)/) || [])[1];
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  const number = Number(issueNumber);
  console.log(JSON.stringify([[{
    id: 9000 + number,
    html_url: "https://github.com/openclaw/openclaw/issues/" + number + "#issuecomment-" + (9000 + number),
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comments[number]
  }]]));
} else if (args[0] === "api" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/320$/.test(path)) {
  console.log(JSON.stringify({
    number: 320,
    title: "Paired issue",
    html_url: "https://github.com/openclaw/openclaw/issues/320",
    body: "Tracked by #321.",
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
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Paired PR",
    html_url: "https://github.com/openclaw/openclaw/pull/321",
    state: "open",
    changed_files: 1,
    commits: 1,
    review_comments: 0,
    body: "Fixes #320.",
    head: { sha: "head-sha", ref: "branch", repo: { full_name: "fork/openclaw" } },
    base: { sha: "base-sha", ref: "main", repo: { full_name: "openclaw/openclaw" } },
    user: { login: "reporter" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/400$/.test(path)) {
  console.log(JSON.stringify({
    number: 400,
    title: "Canonical provider cleanup",
    html_url: "https://github.com/openclaw/openclaw/pull/400",
    state: "open",
    merged_at: null,
    mergeable_state: "clean",
    draft: false,
    labels: [{ name: "proof: sufficient" }],
    body: "Carries the provider cleanup."
  }));
} else if (args[0] === "api" && /\\/issues\\/400$/.test(path)) {
  console.log(JSON.stringify({
    number: 400,
    title: "Canonical provider cleanup",
    html_url: "https://github.com/openclaw/openclaw/pull/400",
    body: "Carries the provider cleanup.",
    state: "open",
    labels: [{ name: "proof: sufficient" }],
    comments: 0,
    pull_request: { url: "https://api.github.com/repos/openclaw/openclaw/pulls/400" }
  }));
} else if (args[0] === "api" && /\\/pulls\\/321\\/(files|commits|comments)(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
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
      withMockCodexProof(root, { type: "failure", message: "temporary model outage" }, () => {
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
      });
    });

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{
      number: number;
      action: string;
      reason: string;
    }>;
    assert.equal(
      report.find((entry) => entry.number === 321)?.action,
      "retry_pr_close_coverage_proof",
    );
    assert.equal(
      report.some((entry) => entry.action === "skipped_same_author_pair"),
      false,
    );
    assert.match(
      readFileSync(join(itemsDir, "321.md"), "utf8"),
      /^action_taken: retry_pr_close_coverage_proof$/m,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps same-author PR blocked when counterpart drifted", () => {
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
    updated_at: "2026-05-02T00:00:00Z",
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
          "1",
        ],
      });
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "skipped_same_author_pair",
        reason: "open issue #320 (Paired issue) by the same author is paired with this PR",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps same-author PR blocked when counterpart comment needs sync", () => {
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
const pullComment = ${JSON.stringify(pullSynced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
const path = args[1] || "";
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/(320|321)\\/timeline(?:\\?|$)/.test(args[2] || "")) {
  console.log("HTTP/2 200\\n\\n[]");
} else if (args[0] === "api" && /\\/issues\\/320\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[]]));
} else if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[{
    id: 9321,
    html_url: "https://github.com/openclaw/openclaw/issues/321#issuecomment-9321",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: pullComment
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
    comments: 0,
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
          "1",
        ],
      });
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "skipped_same_author_pair",
        reason: "open issue #320 (Paired issue) by the same author is paired with this PR",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions keeps same-author PR blocked when counterpart reason is disabled", () => {
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
        title: "Paired duplicate PR",
        author: "reporter",
        action_taken: "skipped_same_author_pair",
        close_reason: "duplicate_or_superseded",
      }),
      321,
      "duplicate_or_superseded",
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
if (args[0] === "api" && args[1] === "-i" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(args[2] || "")) {
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
} else if (args[0] === "api" && /\\/issues\\/321\\/timeline(?:\\?|$)/.test(path)) {
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
    title: "Paired duplicate PR",
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
} else if (args[0] === "api" && /\\/pulls\\/321$/.test(path)) {
  console.log(JSON.stringify({
    number: 321,
    title: "Paired duplicate PR",
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
          "--apply-close-reasons",
          "duplicate_or_superseded",
          "--processed-limit",
          "1",
        ],
      });
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "skipped_same_author_pair",
        reason: "open issue #320 (Paired issue) by the same author is paired with this PR",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions archives live-closed skipped records without reopening close gates", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });
    const skippedReport = implementedCloseReport({
      action_taken: "skipped_open_closing_pr",
      close_reason: "duplicate_or_superseded",
    }).replace(/^local_checkout_access: verified\n/m, "");
    writeFileSync(join(itemsDir, "321.md"), skippedReport, "utf8");

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
    updated_at: "2026-05-01T00:00:00Z",
    closed_at: "2026-05-02T00:00:00Z",
    state: "closed",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "reporter" },
    labels: [],
    comments: 0,
    pull_request: null
  }));
} else {
  console.error("unexpected gh args", JSON.stringify(args));
  process.exit(1);
}
`;
    withMockGh(root, ghMock, () => {
      runApplyDecisionsForTest({ itemsDir, closedDir, plansDir, reportPath });
    });

    assert.equal(existsSync(join(itemsDir, "321.md")), false);
    assert.ok(existsSync(join(closedDir, "321.md")));
    assert.match(
      readFileSync(join(closedDir, "321.md"), "utf8"),
      /^action_taken: skipped_already_closed$/m,
    );
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "skipped_already_closed",
        reason: "state is closed",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions skips advisory labels for failed or stale kept-open reports", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });

    const failed = reportWithSyncedReviewComment(
      workPlanCandidateReport({
        number: 321,
        review_status: "failed",
        item_snapshot_hash: "reviewed-snapshot-321",
        item_updated_at: "2026-05-01T00:00:00Z",
        reproduction_status: "unclear",
        reproduction_confidence: "low",
        work_candidate: "none",
        work_status: "none",
        work_confidence: "low",
      }),
      321,
    );
    const stale = reportWithSyncedReviewComment(
      workPlanCandidateReport({
        number: 322,
        item_snapshot_hash: "reviewed-snapshot-322",
        item_updated_at: "2026-05-01T00:00:00Z",
        triage_priority: "P1",
        reproduction_status: "reproduced",
        reproduction_confidence: "high",
      }),
      322,
    );
    writeFileSync(join(itemsDir, "321.md"), failed.report, "utf8");
    writeFileSync(join(itemsDir, "322.md"), stale.report, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comments = ${JSON.stringify({ 321: failed.comment, 322: stale.comment })};
const updatedAt = { 321: "2026-05-01T00:00:00Z", 322: "2026-05-02T00:00:00Z" };
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
const commentMatch = path.match(/\\/issues\\/(\\d+)\\/comments(?:\\?|$)/);
const issueMatch = path.match(/\\/issues\\/(\\d+)$/);
if (args[0] === "api" && commentMatch) {
  const number = Number(commentMatch[1]);
  console.log(JSON.stringify([[{
    id: 9000 + number,
    html_url: "https://github.com/openclaw/clawsweeper/issues/" + number + "#issuecomment-" + (9000 + number),
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comments[number]
  }]]));
} else if (args[0] === "api" && issueMatch) {
  const number = Number(issueMatch[1]);
  console.log(JSON.stringify({
    number,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/issues/" + number,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: updatedAt[number],
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
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions counts unverified local-checkout reports against the processed limit", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });

    const unverified = workPlanCandidateReport({ number: 321 }).replace(
      /^local_checkout_access: verified\n/m,
      "",
    );
    const secondUnverified = workPlanCandidateReport({ number: 322 }).replace(
      /^local_checkout_access: verified\n/m,
      "",
    );
    writeFileSync(join(itemsDir, "321.md"), unverified, "utf8");
    writeFileSync(join(itemsDir, "322.md"), secondUnverified, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
console.error("unexpected gh call");
process.exit(1);
`;
    withMockGh(root, ghMock, () => {
      runApplyDecisionsForTest({ itemsDir, closedDir, plansDir, reportPath });
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "kept_open",
        reason: "review lacks verified local checkout access",
      },
    ]);
    assert.equal(existsSync(logPath), false);
    assert.match(readFileSync(join(itemsDir, "321.md"), "utf8"), /^apply_checked_at: /m);
    assert.doesNotMatch(readFileSync(join(itemsDir, "322.md"), "utf8"), /^apply_checked_at: /m);

    runApplyDecisionsForTest({ itemsDir, closedDir, plansDir, reportPath });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 322,
        action: "kept_open",
        reason: "review lacks verified local checkout access",
      },
    ]);
    assert.match(readFileSync(join(itemsDir, "322.md"), "utf8"), /^apply_checked_at: /m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions counts advisory label-only syncs against the processed limit", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });

    const first = reportWithSyncedReviewComment(
      workPlanCandidateReport({
        number: 321,
        reviewed_at: "2026-05-01T00:00:00Z",
        item_snapshot_hash: "reviewed-snapshot-321",
        item_updated_at: "2026-05-01T00:00:00Z",
      }),
      321,
    );
    const second = reportWithSyncedReviewComment(
      workPlanCandidateReport({
        number: 322,
        reviewed_at: "2026-05-01T00:00:00Z",
        item_snapshot_hash: "reviewed-snapshot-322",
        item_updated_at: "2026-05-01T00:00:00Z",
      }),
      322,
    );
    writeFileSync(join(itemsDir, "321.md"), first.report, "utf8");
    writeFileSync(join(itemsDir, "322.md"), second.report, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comments = ${JSON.stringify({ 321: first.comment, 322: second.comment })};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
const commentMatch = path.match(/\\/issues\\/(\\d+)\\/comments(?:\\?|$)/);
const issueMatch = path.match(/\\/issues\\/(\\d+)$/);
if (args[0] === "api" && commentMatch) {
  const number = Number(commentMatch[1]);
  const body = comments[number];
  console.log(JSON.stringify([[{
    id: 9000 + number,
    html_url: "https://github.com/openclaw/clawsweeper/issues/" + number + "#issuecomment-" + (9000 + number),
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body
  }]]));
} else if (args[0] === "api" && issueMatch) {
  const number = Number(issueMatch[1]);
  console.log(JSON.stringify({
    number,
    title: "Render work plans",
    html_url: "https://github.com/openclaw/clawsweeper/issues/" + number,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
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
} else if (args[0] === "label" && args[1] === "create") {
  console.log("");
} else if (args[0] === "issue" && args[1] === "edit") {
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
    const editCalls = calls.filter((args) => args[0] === "issue" && args[1] === "edit");
    assert.ok(editCalls.length > 0);
    assert.deepEqual([...new Set(editCalls.map((args) => args[2]))], ["321"]);
    assert.equal(
      calls.some((args) => args.some((arg) => arg.includes("/issues/322"))),
      false,
    );
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "kept_open",
        reason: "synced advisory issue labels",
      },
    ]);
    assert.match(readFileSync(join(itemsDir, "321.md"), "utf8"), /^labels_synced_at: /m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions dry-run computes advisory labels without mutating GitHub labels", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });

    const synced = reportWithSyncedReviewComment(
      workPlanCandidateReport({
        number: 321,
        reviewed_at: "2026-05-01T00:00:00Z",
        item_snapshot_hash: "reviewed-snapshot-321",
        item_updated_at: "2026-05-01T00:00:00Z",
      }),
      321,
    );
    const itemPath = join(itemsDir, "321.md");
    writeFileSync(itemPath, synced.report, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[{
    id: 9321,
    html_url: "https://github.com/openclaw/clawsweeper/issues/321#issuecomment-9321",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comment
  }]]));
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
        extraArgs: ["--dry-run"],
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
    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "kept_open",
        reason: "dry-run: would sync advisory issue labels",
      },
    ]);
    assert.doesNotMatch(readFileSync(itemPath, "utf8"), /clawsweeper:queueable-fix/);
    assert.doesNotMatch(readFileSync(itemPath, "utf8"), /^labels_synced_at: /m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-decisions skips cleanly when ClawSweeper label sync loses authentication", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const closedDir = join(root, "closed");
    const plansDir = join(root, "plans");
    const reportPath = join(root, "apply-report.json");
    const logPath = join(root, "gh.log");
    mkdirSync(itemsDir, { recursive: true });
    mkdirSync(plansDir, { recursive: true });

    const synced = reportWithSyncedReviewComment(
      workPlanCandidateReport({
        number: 321,
        reviewed_at: "2026-05-01T00:00:00Z",
        item_snapshot_hash: "reviewed-snapshot-321",
        item_updated_at: "2026-05-01T00:00:00Z",
        impact_labels: JSON.stringify(["impact:message-loss"]),
      }),
      321,
    );
    const itemPath = join(itemsDir, "321.md");
    writeFileSync(itemPath, synced.report, "utf8");

    const ghMock = `
const { appendFileSync } = require("fs");
const logPath = ${JSON.stringify(logPath)};
const comment = ${JSON.stringify(synced.comment)};
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--repo" ? rawArgs.slice(2) : rawArgs;
appendFileSync(logPath, JSON.stringify(args) + "\\n");
const path = args[1] || "";
if (args[0] === "api" && /\\/issues\\/321\\/comments(?:\\?|$)/.test(path)) {
  console.log(JSON.stringify([[{
    id: 9321,
    html_url: "https://github.com/openclaw/clawsweeper/issues/321#issuecomment-9321",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    user: { login: "clawsweeper[bot]" },
    body: comment
  }]]));
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
    pull_request: null
  }));
} else if (args[0] === "issue" && args[1] === "view") {
  console.log(JSON.stringify({ closedByPullRequestsReferences: [] }));
} else if (args[0] === "label" && args[1] === "create") {
  console.log("");
} else if (args[0] === "issue" && args[1] === "edit" && args.includes("impact:message-loss")) {
  console.error('error fetching labels: non-200 OK status code: 401 Unauthorized body: "{\\n  \\"message\\": \\"Requires authentication\\",\\n  \\"status\\": \\"401\\"\\n}"');
  process.exit(1);
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
      });
    });

    assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), [
      {
        number: 321,
        action: "kept_open",
        reason: "GitHub rejected ClawSweeper label sync with Requires authentication",
      },
    ]);
    const report = readFileSync(itemPath, "utf8");
    assert.match(report, /^apply_checked_at: /m);
    assert.doesNotMatch(report, /^labels_synced_at: /m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("security-needs-attention reports block unopted repair and automerge pass markers", () => {
  const securitySection = `
## Security Review

Status: needs_attention

Summary: The patch exposes a broader token scope and needs maintainer security review.

Concerns:

- **[high] Avoid broad token reuse:** \`src/auth/token.ts:42\`
  - body: The patch can reuse a token with broader scopes than the caller requested.
  - confidence: 0.91
`;
  const repairMarkers = reviewAutomationMarkersFromReport(`${reportFrontMatter({
    type: "pull_request",
    number: "74123",
    pull_head_sha: "abc123def456",
    decision: "keep_open",
    confidence: "high",
    work_candidate: "queue_fix_pr",
  })}

## Summary

Needs a repair.

${securitySection}
`);

  assert.match(repairMarkers, /clawsweeper-security:security-sensitive/);
  assert.match(repairMarkers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(repairMarkers, /clawsweeper-verdict:needs-changes/);
  assert.doesNotMatch(repairMarkers, /clawsweeper-action:fix-required/);

  const autofixRepairMarkers = reviewAutomationMarkersFromReport(`${reportFrontMatter({
    type: "pull_request",
    number: "74125",
    pull_head_sha: "abc789def123",
    decision: "keep_open",
    confidence: "high",
    labels: JSON.stringify(["clawsweeper:autofix"]),
    work_candidate: "queue_fix_pr",
  })}

## Summary

Needs an opted-in repair.

${securitySection}
`);

  assert.match(autofixRepairMarkers, /clawsweeper-security:security-sensitive/);
  assert.match(autofixRepairMarkers, /clawsweeper-verdict:needs-changes/);
  assert.match(autofixRepairMarkers, /clawsweeper-action:fix-required/);
  assert.match(autofixRepairMarkers, /finding=security-review/);
  assert.doesNotMatch(autofixRepairMarkers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(autofixRepairMarkers, /clawsweeper-verdict:pass/);

  const automergeMarkers = reviewAutomationMarkersFromReport(`${reportFrontMatter({
    type: "pull_request",
    number: "74124",
    pull_head_sha: "def456abc123",
    decision: "keep_open",
    confidence: "high",
    review_status: "complete",
    labels: JSON.stringify(["clawsweeper:automerge"]),
    work_candidate: "none",
  })}

## Summary

Would otherwise pass automerge.

${securitySection}
`);

  assert.match(automergeMarkers, /clawsweeper-security:security-sensitive/);
  assert.match(automergeMarkers, /clawsweeper-verdict:needs-changes/);
  assert.match(automergeMarkers, /clawsweeper-action:fix-required/);
  assert.match(automergeMarkers, /finding=security-review/);
  assert.doesNotMatch(automergeMarkers, /clawsweeper-verdict:pass/);
  assert.doesNotMatch(automergeMarkers, /clawsweeper-verdict:needs-human/);
});

test("pull request keep-open review comments suppress duplicate remaining risk text", () => {
  const duplicateRisk = "Run the automerge smoke after the repair lane is green.";
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74267",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this smoke-test PR open for maintainer review.

## What This Changes

Adds regression coverage for automerge repair smoke comments.

## Risks / Open Questions

${duplicateRisk}

## Work Candidate

Candidate: none

Confidence: low

Priority: low

Status: none

Reason: ${duplicateRisk}
`,
    "none",
  );

  assert.ok(comment.includes(`**Next step before merge**\n- [P2] ${duplicateRisk}`));
  assert.doesNotMatch(comment, /Remaining risk \/ open question:/);
  assert.doesNotMatch(comment, /\*\*Risk before merge\*\*/);
  assert.equal(comment.split(duplicateRisk).length - 1, 1);
});

test("pull request keep-open review comments prefix each merge risk bullet", () => {
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

Keep this multi-risk PR open for maintainer review.

## What This Changes

Changes generated review-comment formatting.

## Best Possible Solution

Confirm both merge risks before merge.

## Risks / Open Questions

- Blocked workflow actions must render as P1.
- Timeout fallback wording should remain scannable.
`,
    "none",
  );

  assert.match(comment, /\*\*Risk before merge\*\*/);
  assert.match(comment, /- \[P1\] Blocked workflow actions must render as P1\./);
  assert.match(comment, /- \[P2\] Timeout fallback wording should remain scannable\./);
  assert.doesNotMatch(comment, /- \[P1\] Blocked workflow actions.*\n- Timeout fallback/s);
});

test("pull request risk text does not priority-prefix routine CI noise", () => {
  const routineCiRisk = "CI checks are red on this branch and may be unrelated to the diff.";
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

Keep this PR open while maintainers verify check state.

## What This Changes

Updates review guidance.

## Best Possible Solution

Merge after the unrelated CI state is understood.

## Risks / Open Questions

${routineCiRisk}
`,
    "none",
  );

  assert.match(comment, /\*\*Risk before merge\*\*/);
  assert.match(comment, new RegExp(`- ${routineCiRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.doesNotMatch(
    comment,
    new RegExp(`\\[P[12]\\] ${routineCiRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("pull request next step does not priority-prefix routine required status checks", () => {
  const routineStatusSteps = [
    "Merge after required status checks are green.",
    "Merge after required checks pass.",
    "Merge after status checks pass.",
    "Merge once required checks have passed.",
    "Wait for status checks to pass.",
    "Merge after required checks.",
    "Wait for required checks.",
    "Merge after required checks pass and no failures are seen.",
    "Merge after required checks pass without failures.",
    "Merge after required checks pass without any failures.",
    "CI checks pass without test failures.",
    "Merge after required checks pass without any test failures.",
    "CI checks pass but no failures are seen.",
    "CI checks pass but maintainer review is still required.",
    "Required checks pass and required approvals are complete.",
    "CI checks are red but may pass on rerun.",
    "Merge after required checks and maintainer review.",
  ];
  for (const routineStatusStep of routineStatusSteps) {
    const comment = renderReviewCommentFromReport(
      `${reportFrontMatter({
        type: "pull_request",
        number: "74273",
        decision: "keep_open",
        close_reason: "none",
        work_candidate: "none",
        pull_head_sha: "abc123def460",
      })}

## Summary

Keep this PR open until normal merge gates pass.

## What This Changes

Updates review guidance.

## Best Possible Solution

${routineStatusStep}
`,
      "none",
    );

    assert.match(comment, /\*\*Next step before merge\*\*/);
    assert.match(
      comment,
      new RegExp(`- ${routineStatusStep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.doesNotMatch(
      comment,
      new RegExp(`\\[P[12]\\] ${routineStatusStep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  }
});

test("pull request risk text keeps diff-caused CI risk actionable", () => {
  const actionableCiRisk = "The workflow change could cause CI checks to fail after merge.";
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74270",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def457",
    })}

## Summary

Keep this PR open while maintainers verify workflow behavior.

## What This Changes

Updates workflow handling.

## Best Possible Solution

Merge after the workflow risk is addressed.

## Risks / Open Questions

${actionableCiRisk}
`,
    "none",
  );

  assert.match(comment, /\*\*Risk before merge\*\*/);
  assert.match(
    comment,
    new RegExp(`- \\[P1\\] ${actionableCiRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("pull request risk text keeps diff-caused status-check risk actionable", () => {
  const actionableStatusRisk = "The workflow change could cause status checks to fail after merge.";
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74271",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def458",
    })}

## Summary

Keep this PR open while maintainers verify workflow behavior.

## What This Changes

Updates workflow handling.

## Best Possible Solution

Merge after the status-check risk is addressed.

## Risks / Open Questions

${actionableStatusRisk}
`,
    "none",
  );

  assert.match(comment, /\*\*Risk before merge\*\*/);
  assert.match(
    comment,
    new RegExp(`- \\[P1\\] ${actionableStatusRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("pull request risk text keeps diff-caused required-check risk actionable", () => {
  const actionableRequiredRisk =
    "The workflow change could cause required checks to fail after merge.";
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "74272",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def459",
    })}

## Summary

Keep this PR open while maintainers verify workflow behavior.

## What This Changes

Updates workflow handling.

## Best Possible Solution

Merge after the required-check risk is addressed.

## Risks / Open Questions

${actionableRequiredRisk}
`,
    "none",
  );

  assert.match(comment, /\*\*Risk before merge\*\*/);
  assert.match(
    comment,
    new RegExp(`- \\[P1\\] ${actionableRequiredRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("pull request risk text keeps broken passing-check risk actionable", () => {
  const actionablePassingRisks = [
    "The workflow change makes required checks pass even when tests fail.",
    "CI checks are passing despite tests failing.",
    "Security exposure remains even though status checks are green.",
    "CI checks are green but snapshot drift blocks merge.",
    "CI checks are green but the app crashes on startup.",
    "Status checks pass despite data loss.",
    "CI checks pass without running tests for the changed path.",
    "CI checks pass with tests disabled.",
    "Required checks pass after skipping the changed-path tests.",
    "CI checks pass without failures, but required docs are missing.",
    "CI checks pass and tests fail.",
    "Required checks pass and required docs are missing.",
    "Required checks pass and required approvals are complete, but required docs are missing.",
    "CI checks pass and required approvals are complete, but coverage is too low.",
    "CI checks pass because tests are mock-only.",
    "Status checks pass because validation is stubbed.",
    "CI checks pass but maintainer review is still required because tests were skipped.",
    "CI checks pass and required approvals are complete, but tests are disabled.",
    "CI checks pass with no tests for the changed path.",
    "CI checks are green with no validation.",
    "CI checks pass with only mocked tests.",
    "CI checks pass with insufficient coverage.",
    "CI checks pass and no tests run for this path.",
    "CI checks pass and no validation runs.",
    "CI checks pass and do not run tests for the changed path.",
    "CI checks pass and tests do not cover the changed path.",
    "CI checks pass and the changed path is untested.",
    "CI checks pass and a manual data migration is required before merge.",
  ];
  for (const actionablePassingRisk of actionablePassingRisks) {
    const comment = renderReviewCommentFromReport(
      `${reportFrontMatter({
        type: "pull_request",
        number: "74274",
        decision: "keep_open",
        close_reason: "none",
        work_candidate: "none",
        pull_head_sha: "abc123def461",
      })}

## Summary

Keep this PR open while maintainers verify workflow behavior.

## What This Changes

Updates workflow handling.

## Best Possible Solution

Merge after the required-check risk is addressed.

## Risks / Open Questions

${actionablePassingRisk}
`,
      "none",
    );

    assert.match(comment, /\*\*Risk before merge\*\*/);
    assert.match(
      comment,
      new RegExp(`- \\[P[01]\\] ${actionablePassingRisk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  }
});

test("OpenClaw pull request comments render PR surface inside evidence details", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      repository: "openclaw/openclaw",
      type: "pull_request",
      number: "12345",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pr_surface_files: JSON.stringify([
        { path: "src/runtime.ts", additions: 10, deletions: 2 },
        { path: "src/runtime.test.ts", additions: 7, deletions: 1 },
        { path: "docs/usage.md", additions: 4, deletions: 0 },
      ]),
      pr_surface_files_truncated: "false",
      review_metrics: JSON.stringify([]),
    })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Adds a small runtime change with tests and docs.
`,
    "none",
  );

  const evidenceDetails = detailsBody(comment, "Evidence reviewed");
  const visibleBeforeEvidence = comment.slice(
    0,
    comment.indexOf("<summary>Evidence reviewed</summary>"),
  );

  assert.match(
    visibleBeforeEvidence,
    /PR surface: Source \+8, Tests \+6, Docs \+4\. Total \+18 across 3 files\./,
  );
  assert.doesNotMatch(visibleBeforeEvidence, /<summary>View PR surface stats<\/summary>/);
  assert.doesNotMatch(
    visibleBeforeEvidence,
    /\| \*\*Total\*\* \| \*\*3\*\* \| \*\*21\*\* \| \*\*3\*\* \| \*\*\+18\*\* \|/,
  );
  assert.match(
    evidenceDetails,
    /PR surface:\n\nSource \+8, Tests \+6, Docs \+4\. Total \+18 across 3 files\./,
  );
  assert.match(evidenceDetails, /<summary>View PR surface stats<\/summary>/);
  assert.match(
    evidenceDetails,
    /\| \*\*Total\*\* \| \*\*3\*\* \| \*\*21\*\* \| \*\*3\*\* \| \*\*\+18\*\* \|/,
  );
  assert.match(comment, /\*\*Review metrics:\*\* none identified\./);
  assert.ok(comment.indexOf("PR surface:") < comment.indexOf("**Review metrics:**"));
  assert.ok(comment.indexOf("**Review metrics:**") < comment.indexOf("**Merge readiness**"));
});

test("pull request comments render one review metric digest item", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      repository: "openclaw/openclaw",
      type: "pull_request",
      number: "12345",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      review_metrics: JSON.stringify([
        {
          label: "Workflow surfaces changed",
          value: "1 workflow changed",
          reason:
            "The PR changes repository automation behavior that maintainers should review before merge.",
        },
      ]),
    })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Updates repository automation.
`,
    "none",
  );

  assert.match(comment, /\*\*Review metrics:\*\* 1 noteworthy metric\./);
  assert.match(
    comment,
    /- \*\*Workflow surfaces changed:\*\* 1 workflow changed\. The PR changes repository automation behavior that maintainers should review before merge\./,
  );
});

test("pull request comments render multiple review metric digest items near PR surface", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      repository: "openclaw/openclaw",
      type: "pull_request",
      number: "12345",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pr_surface_files: JSON.stringify([{ path: "src/runtime.ts", additions: 10, deletions: 2 }]),
      pr_surface_files_truncated: "false",
      review_metrics: JSON.stringify([
        {
          label: "Config/default surfaces changed",
          value: "2 added, 1 changed, 0 removed",
          reason:
            "The PR introduces user-facing configuration behavior that maintainers should review before merge.",
        },
        {
          label: "Proof files affected",
          value: "3 files affected",
          reason:
            "The PR touches proof-related code where green unit tests do not cover every runtime path.",
        },
      ]),
    })}

## Summary

Keep this PR open for maintainer review.

## What This Changes

Adds configuration behavior and proof updates.
`,
    "none",
  );

  assert.match(comment, /\*\*Review metrics:\*\* 2 noteworthy metrics\./);
  assert.match(
    comment,
    /- \*\*Config\/default surfaces changed:\*\* 2 added, 1 changed, 0 removed\./,
  );
  assert.match(comment, /- \*\*Proof files affected:\*\* 3 files affected\./);
  assert.ok(comment.indexOf("PR surface:") < comment.indexOf("**Review metrics:**"));
  assert.ok(comment.indexOf("**Review metrics:**") < comment.indexOf("**Merge readiness**"));
});

test("PR surface is OpenClaw pull-request only", () => {
  const frontMatter = {
    decision: "keep_open",
    close_reason: "none",
    work_candidate: "none",
    pr_surface_files: JSON.stringify([{ path: "src/runtime.ts", additions: 10, deletions: 2 }]),
    pr_surface_files_truncated: "false",
  };
  const body = `

## Summary

Keep this open.
`;

  const otherRepoComment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      ...frontMatter,
      repository: "example/project",
      type: "pull_request",
    })}${body}`,
    "none",
  );
  const issueComment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      ...frontMatter,
      repository: "openclaw/openclaw",
      type: "issue",
    })}${body}`,
    "none",
  );

  assert.doesNotMatch(otherRepoComment, /PR surface:/);
  assert.doesNotMatch(issueComment, /PR surface:/);
});

test("pull request keep-open review comments render repairable merge-risk options with one copy block", () => {
  const mergeRisk =
    "Existing users configured with a missing Codex harness would fail closed instead of continuing through their fallback model.";
  const comment = mergeRiskReviewComment({
    risk: mergeRisk,
    bestSolution:
      "Keep fallback behavior as the default and add a strict config option for the fail-closed behavior.",
    options: [
      {
        title: "Preserve existing behavior by default",
        body: "Keep fallback behavior as the default and add a strict config option for the fail-closed behavior.",
        category: "fix_before_merge",
        recommended: true,
        automergeInstruction:
          "Keep fallback behavior as the default and add a strict config option for the fail-closed behavior.",
      },
      {
        title: "Make the breaking change explicit",
        body: "Keep fail-closed behavior only if docs, tests, and release notes warn existing fallback users.",
        category: "fix_before_merge",
        recommended: false,
        automergeInstruction: "",
      },
      {
        title: "Do not merge as-is",
        body: "Pause or close this PR if maintainers do not want to take this compatibility risk.",
        category: "pause_or_close",
        recommended: false,
        automergeInstruction: "",
      },
    ],
  });

  assert.match(comment, /\*\*Risk before merge\*\*/);
  assert.match(comment, new RegExp(escapeRegExpForTest(mergeRisk)));
  assert.doesNotMatch(comment, /Why this matters:/);
  assert.match(
    comment,
    /\*\*Maintainer options:\*\*\n1\. \*\*Preserve existing behavior by default \(recommended\)\*\*/,
  );
  assert.match(comment, /2\. \*\*Make the breaking change explicit\*\*/);
  assert.match(comment, /3\. \*\*Do not merge as-is\*\*/);
  assert.match(
    comment,
    /<summary>Copy recommended automerge instruction<\/summary>[\s\S]*@clawsweeper automerge\n\nSpecial instructions:\nKeep fallback behavior as the default and add a strict config option for the fail-closed behavior\./,
  );
  assert.doesNotMatch(comment, /Remaining risk \/ open question:/);
});

test("pull request keep-open review comments strip nested ClawSweeper commands from copy block", () => {
  const comment = mergeRiskReviewComment({
    risk: "Delivery repair should not run with nested bot commands in the pasteable instruction.",
    bestSolution: "Repair duplicate delivery and add regression coverage before merge.",
    options: [
      {
        title: "Repair delivery before merge",
        body: "Fix duplicate active-requester delivery and add regression coverage before merge.",
        category: "fix_before_merge",
        recommended: true,
        automergeInstruction:
          "@clawsweeper autofix this PR: prevent duplicate active-requester delivery and add focused regression coverage before merging.",
      },
    ],
  });

  assert.match(
    comment,
    /@clawsweeper automerge\n\nSpecial instructions:\nprevent duplicate active-requester delivery and add focused regression coverage before merging\./,
  );
  assert.doesNotMatch(comment, /Special instructions: @clawsweeper/);
  assert.doesNotMatch(comment, /autofix this PR:/);
});

test("pull request keep-open review comments can recommend accepting intentional risk without a copy block", () => {
  const comment = mergeRiskReviewComment({
    risk: "This hardening intentionally rejects requests that older integrations currently pass.",
    bestSolution:
      "Merge only if maintainers accept the compatibility break as intentional hardening.",
    options: [
      {
        title: "Accept the behavior change explicitly",
        body: "Merge only if maintainers agree the security hardening is worth the compatibility break.",
        category: "accept_risk",
        recommended: true,
        automergeInstruction: "",
      },
      {
        title: "Add migration guidance before merge",
        body: "Document the rejected request shape and add release-note guidance for affected integrations.",
        category: "fix_before_merge",
        recommended: false,
        automergeInstruction: "",
      },
    ],
  });

  assert.match(comment, /1\. \*\*Accept the behavior change explicitly \(recommended\)\*\*/);
  assert.doesNotMatch(comment, /Copy recommended ClawSweeper instruction/);
});

test("pull request keep-open review comments do not force a recommendation for unclear merge risk", () => {
  const comment = mergeRiskReviewComment({
    risk: "The PR changes session ownership without proving how existing resumed sessions transition.",
    options: [
      {
        title: "Require a maintainer design decision",
        body: "Decide whether resumed sessions should migrate, fail fast, or continue using the old ownership model.",
        category: "pause_or_close",
        recommended: false,
        automergeInstruction: "",
      },
      {
        title: "Add migration proof before merge",
        body: "Add tests or manual validation covering sessions created before this change.",
        category: "fix_before_merge",
        recommended: false,
        automergeInstruction: "",
      },
    ],
  });

  assert.doesNotMatch(comment, /\(recommended\)/);
  assert.doesNotMatch(comment, /Copy recommended ClawSweeper instruction/);
});

test("pull request keep-open review comments allow multiple fix-before-merge options", () => {
  const comment = mergeRiskReviewComment({
    risk: "The retry path may duplicate queued user messages after partial provider sends.",
    bestSolution: "Guard retries with delivery state before merge.",
    options: [
      {
        title: "Guard retries with delivery state",
        body: "Track whether the user message was already sent before retrying provider fallback.",
        category: "fix_before_merge",
        recommended: true,
        automergeInstruction:
          "Track whether the user message was already sent before retrying provider fallback.",
      },
      {
        title: "Disable fallback after partial sends",
        body: "Fail fast once delivery starts instead of retrying through another provider.",
        category: "fix_before_merge",
        recommended: false,
        automergeInstruction: "",
      },
    ],
  });

  assert.match(comment, /1\. \*\*Guard retries with delivery state \(recommended\)\*\*/);
  assert.match(comment, /2\. \*\*Disable fallback after partial sends\*\*/);
  assert.match(comment, /@clawsweeper automerge/);
});

test("pull request keep-open review comments include pause or close when risk may outweigh value", () => {
  const comment = mergeRiskReviewComment({
    risk: "The PR changes automation proof capture without proving failed paths still upload artifacts.",
    options: [
      {
        title: "Prove artifact parity before merge",
        body: "Show that artifacts upload on success, failure, and skipped-review paths.",
        category: "fix_before_merge",
        recommended: false,
        automergeInstruction: "",
      },
      {
        title: "Pause or close",
        body: "Close this PR if maintainers decide the proof-capture regression risk outweighs the workflow cleanup.",
        category: "pause_or_close",
        recommended: false,
        automergeInstruction: "",
      },
    ],
  });

  assert.match(
    comment,
    /2\. \*\*Pause or close\*\*  \n   Close this PR if maintainers decide the proof-capture regression risk outweighs the workflow cleanup\./,
  );
  assert.doesNotMatch(comment, /Copy recommended ClawSweeper instruction/);
});

test("pull request review reports carry verdict and repair markers", () => {
  const markdown = `${reportFrontMatter({
    type: "pull_request",
    number: "74065",
    pull_head_sha: "abc123def456",
    decision: "keep_open",
    confidence: "high",
    work_candidate: "queue_fix_pr",
  })}

## Summary

Needs one more repair.
`;

  const markers = reviewAutomationMarkersFromReport(markdown);
  assert.match(markers, /clawsweeper-verdict:needs-changes/);
  assert.match(markers, /clawsweeper-action:fix-required/);
  assert.match(markers, /item=74065/);
  assert.match(markers, /sha=abc123def456/);
});

test("pull request reports without a repair candidate pause for human review", () => {
  const markers = reviewAutomationMarkersFromReport(`${reportFrontMatter({
    type: "pull_request",
    number: "74105",
    pull_head_sha: "abc123def456",
    decision: "keep_open",
    confidence: "high",
    work_candidate: "none",
  })}

## Summary

Needs maintainer review.
`);

  assert.match(markers, /clawsweeper-verdict:needs-human/);
  assert.doesNotMatch(markers, /clawsweeper-verdict:needs-changes/);
  assert.doesNotMatch(markers, /clawsweeper-action:fix-required/);
  assert.match(markers, /item=74105/);
  assert.match(markers, /sha=abc123def456/);
});

test("non-PR review reports do not carry repair markers", () => {
  assert.equal(reviewAutomationMarkersFromReport(reportFrontMatter({ type: "issue" })), "");
});

test("item number args merge and sort workflow inputs", () => {
  assert.deepEqual(itemNumbersArg("42, 7, nope, 42", "5"), [5, 7, 42]);
  assert.deepEqual(itemNumbersArg("", undefined), []);
});

test("explicit item numbers shard targeted review runs", () => {
  assert.deepEqual(shardItemNumbers([5, 7, 42, 99], 2), [
    { shard: 0, itemNumbers: [5, 42] },
    { shard: 1, itemNumbers: [7, 99] },
  ]);
  assert.deepEqual(shardItemNumbers([5, 7], 50), [
    { shard: 0, itemNumbers: [5] },
    { shard: 1, itemNumbers: [7] },
  ]);
  assert.deepEqual(shardItemNumbers([], 50), [{ shard: 0, itemNumbers: [] }]);
});

test("planned review shards stay within the Codex worker cap", () => {
  const itemNumbers = Array.from({ length: 300 }, (_, index) => index + 1);
  const shards = shardItemNumbers(itemNumbers, 400);
  assert.equal(shards.length, AUTOMATION_LIMITS.review_shards.hard_cap);
  assert.equal(
    shards.reduce((total, shard) => total + shard.itemNumbers.length, 0),
    itemNumbers.length,
  );
});

test("apply mode prioritizes matching close proposals before comment sync", () => {
  const issueClose = reportFrontMatter({
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "proposed_close",
  });
  const legacyMaintainerSkip = reportFrontMatter({
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "skipped_maintainer_authored",
  });
  const legacyInvalidDecision = reportFrontMatter({
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "skipped_invalid_decision",
  });
  const legacyKeptOpen = reportFrontMatter({
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "kept_open",
  });
  const pairBlockedOpenClosingPr = reportFrontMatter({
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "skipped_open_closing_pr",
  });
  const pairBlockedSameAuthor = reportFrontMatter({
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "skipped_same_author_pair",
  });
  const pullRequestClose = reportFrontMatter({
    type: "pull_request",
    decision: "close",
    close_reason: "implemented_on_main",
    action_taken: "proposed_close",
  });
  const duplicateSkip = reportFrontMatter({
    decision: "close",
    close_reason: "duplicate_or_superseded",
    action_taken: "skipped_invalid_decision",
  });

  assert.equal(applyDecisionPriority(issueClose, "issue"), 0);
  assert.equal(applyDecisionPriority(legacyMaintainerSkip, "issue"), 0);
  assert.equal(applyDecisionPriority(legacyInvalidDecision, "issue"), 0);
  assert.equal(applyDecisionPriority(legacyKeptOpen, "issue"), 0);
  assert.equal(applyDecisionPriority(pairBlockedOpenClosingPr, "issue"), 1);
  assert.equal(applyDecisionPriority(pairBlockedSameAuthor, "issue"), 1);
  assert.equal(applyDecisionPriority(pullRequestClose, "issue"), 1);
  assert.equal(applyDecisionPriority(duplicateSkip, "issue"), 2);
  assert.equal(applyDecisionPriority(reportFrontMatter(), "issue"), 2);
});

test("comment-only sync creates or refreshes stale durable review comments", () => {
  const now = Date.parse("2026-04-26T12:00:00Z");
  const base = {
    syncCommentsOnly: true,
    isCloseProposal: false,
    commentSyncMinAgeDays: 7,
    reviewCommentSyncedAt: "2026-04-25T12:00:00Z",
    hasExistingReviewComment: true,
    needsReviewCommentBodySync: true,
    needsReviewCommentHashSync: true,
    needsReviewCommentReferenceSync: false,
    now,
  };

  assert.equal(shouldSyncReviewComment(base), false);
  assert.equal(
    shouldSyncReviewComment({
      ...base,
      hasExistingReviewComment: false,
    }),
    true,
  );
  assert.equal(
    shouldSyncReviewComment({
      ...base,
      needsReviewCommentBodySync: false,
      needsReviewCommentHashSync: false,
      needsReviewCommentReferenceSync: true,
    }),
    true,
  );
  assert.equal(
    shouldSyncReviewComment({
      ...base,
      reviewCommentSyncedAt: "2026-04-18T12:00:00Z",
    }),
    true,
  );
  assert.equal(
    shouldSyncReviewComment({
      ...base,
      syncCommentsOnly: false,
    }),
    true,
  );
  assert.equal(
    shouldSyncReviewComment({
      ...base,
      isCloseProposal: true,
    }),
    true,
  );
});

test("review artifacts are ignored once the live item is closed", () => {
  assert.equal(reviewArtifactDestination("kept_open", true), "items");
  assert.equal(reviewArtifactDestination("proposed_close", true), "items");
  assert.equal(reviewArtifactDestination("closed", true), "closed");
  assert.equal(reviewArtifactDestination("proposed_close", false), "skip_closed");
  assert.equal(reviewArtifactDestination("kept_open", false), "skip_closed");
});

test("runtime budget only trips after a positive elapsed limit", () => {
  assert.equal(runtimeBudgetExceeded(1000, 0, 100000), false);
  assert.equal(runtimeBudgetExceeded(1000, 5000, 5999), false);
  assert.equal(runtimeBudgetExceeded(1000, 5000, 6000), true);
});

test("runCodex rejects valid structured output after non-zero Codex exit", () => {
  const root = mkdtempSync(tmpPrefix);
  const openclawDir = join(root, "openclaw");
  const workDir = join(root, "codex-work");
  const binDir = join(root, "bin");
  mkdirSync(openclawDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: openclawDir, stdio: "ignore" });
  const codexPath = join(binDir, "codex");
  writeFileSync(
    codexPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex === -1) process.exit(2);
fs.writeFileSync(process.argv[outputIndex + 1], process.env.CODEX_DECISION_JSON);
process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"command_execution",status:"completed",exit_code:0,command:"git rev-parse HEAD",aggregated_output:"abc123"}})+"\\n");
process.stderr.write("wrote structured output before shutdown failure\\n");
process.exit(1);
`,
  );
  chmodSync(codexPath, 0o755);
  const originalPath = process.env.PATH;
  const originalDecision = process.env.CODEX_DECISION_JSON;
  process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
  process.env.CODEX_DECISION_JSON = JSON.stringify(
    closeDecision({
      decision: "keep_open",
      closeReason: "none",
      confidence: "medium",
      summary: "Keep open for maintainer follow-up.",
      bestSolution: "Review the routing invariant.",
      closeComment: "",
      workReason: "Maintainer review is required.",
    }),
  );
  try {
    assert.throws(
      () =>
        runCodexForTest({
          item: item({ number: 83393 }),
          context: { issue: {}, comments: [], timeline: [] },
          git: { mainSha: "abc123", latestRelease: null },
          model: "gpt-test",
          openclawDir,
          reasoningEffort: "high",
          sandboxMode: "read-only",
          serviceTier: "",
          timeoutMs: 10_000,
          workDir,
          prompt: "Return a review decision.",
        }),
      /exit 1/,
    );
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalDecision === undefined) delete process.env.CODEX_DECISION_JSON;
    else process.env.CODEX_DECISION_JSON = originalDecision;
    rmSync(root, { recursive: true, force: true });
  }
});

test("runCodex honors explicit runtime path and isolates automated reviews", () => {
  const root = mkdtempSync(tmpPrefix);
  const openclawDir = join(root, "openclaw");
  const workDir = join(root, "codex-work");
  const binDir = join(root, "bin");
  const argsPath = join(root, "codex-args.json");
  mkdirSync(openclawDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: openclawDir, stdio: "ignore" });
  const codexPath = join(binDir, "configured-codex");
  writeFileSync(join(binDir, "codex"), "#!/usr/bin/env node\nprocess.exit(99);\n");
  chmodSync(join(binDir, "codex"), 0o755);
  writeFileSync(
    codexPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.CODEX_ARGS_PATH, JSON.stringify(process.argv.slice(2)));
const outputIndex = process.argv.indexOf("--output-last-message");
if (outputIndex === -1) process.exit(2);
fs.writeFileSync(process.argv[outputIndex + 1], process.env.CODEX_DECISION_JSON);
process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"command_execution",status:"completed",exit_code:0,command:"git rev-parse HEAD",aggregated_output:"abc123"}})+"\\n");
`,
  );
  chmodSync(codexPath, 0o755);
  const previous = {
    CLAWSWEEPER_CODEX_BIN: process.env.CLAWSWEEPER_CODEX_BIN,
    PATH: process.env.PATH,
    CODEX_ARGS_PATH: process.env.CODEX_ARGS_PATH,
    CODEX_DECISION_JSON: process.env.CODEX_DECISION_JSON,
  };
  process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
  process.env.CLAWSWEEPER_CODEX_BIN = codexPath;
  process.env.CODEX_ARGS_PATH = argsPath;
  process.env.CODEX_DECISION_JSON = JSON.stringify(
    closeDecision({
      decision: "keep_open",
      closeReason: "none",
      confidence: "medium",
      summary: "Review completed in the isolated automation profile.",
      bestSolution: "Continue normal maintainer review.",
      closeComment: "",
      workReason: "No additional implementation is required.",
    }),
  );
  try {
    runCodexForTest({
      item: item({ number: 83395 }),
      context: { issue: {}, comments: [], timeline: [] },
      git: { mainSha: "abc123", latestRelease: null },
      model: "gpt-test",
      openclawDir,
      reasoningEffort: "high",
      sandboxMode: "read-only",
      serviceTier: "",
      timeoutMs: 10_000,
      workDir,
      prompt: "Return a review decision.",
    });

    const args = JSON.parse(readFileSync(argsPath, "utf8")) as string[];
    const diagnostic = JSON.parse(
      readFileSync(join(workDir, "83395.execution-diagnostics.json"), "utf8"),
    );
    assert.equal(diagnostic.verified, true);
    assert.equal(diagnostic.processExitCode, 0);
    assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
    assert.ok(args.includes('approval_policy="never"'));
    assert.ok(args.includes('model_reasoning_effort="high"'));
    assert.equal(args[args.indexOf("--model") + 1], "gpt-test");
    assert.ok(args.includes("--ignore-user-config"));
    assert.ok(args.includes("--ephemeral"));
    for (const config of [
      "features.use_legacy_landlock=false",
      "include_apps_instructions=false",
      "apps._default.enabled=false",
      "features.apps=false",
      "features.browser_use=false",
      "features.child_agents_md=false",
      "features.computer_use=false",
      "features.image_generation=false",
      "features.in_app_browser=false",
      "features.multi_agent=false",
      "features.remote_plugin=false",
      "features.tool_search=false",
      "features.tool_suggest=false",
      "project_doc_max_bytes=12000",
      "tool_output_token_limit=6000",
      'web_search="disabled"',
    ]) {
      assert.ok(args.includes(config), `missing isolated Codex config: ${config}`);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("runCodex preserves redacted process output when Codex exits without a decision", () => {
  const root = mkdtempSync(tmpPrefix);
  const openclawDir = join(root, "openclaw");
  const workDir = join(root, "codex-work");
  const binDir = join(root, "bin");
  mkdirSync(openclawDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: openclawDir, stdio: "ignore" });
  const codexPath = join(binDir, "codex");
  writeFileSync(
    codexPath,
    `#!/usr/bin/env node
process.stdout.write("startup banner GH_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456\\n");
process.stderr.write("Rate limit reached for gpt-test on tokens per min (TPM); OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456\\n");
process.exit(1);
`,
  );
  chmodSync(codexPath, 0o755);
  const originalPath = process.env.PATH;
  const originalAttempts = process.env.CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS;
  process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
  process.env.CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS = "1";
  try {
    assert.throws(
      () =>
        runCodexForTest({
          item: item({ number: 83394 }),
          context: { issue: {}, comments: [], timeline: [] },
          git: { mainSha: "abc123", latestRelease: null },
          model: "gpt-test",
          openclawDir,
          reasoningEffort: "high",
          sandboxMode: "read-only",
          serviceTier: "",
          timeoutMs: 10_000,
          workDir,
          prompt: "Return a review decision.",
        }),
      (error: unknown) => {
        const reviewError = error as Error & {
          status?: number | null;
          stderr?: string;
          stdout?: string;
        };
        assert.equal(reviewError.status, 1);
        assert.match(reviewError.stderr ?? "", /Rate limit reached/);
        assert.match(reviewError.stderr ?? "", /OPENAI_API_KEY=\[REDACTED\]/);
        assert.doesNotMatch(reviewError.stderr ?? "", /sk-proj-/);
        assert.match(reviewError.stdout ?? "", /startup banner/);
        assert.match(reviewError.stdout ?? "", /GH_TOKEN=\[REDACTED\]/);
        assert.doesNotMatch(reviewError.stdout ?? "", /ghp_/);
        return true;
      },
    );
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalAttempts === undefined) delete process.env.CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS;
    else process.env.CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS = originalAttempts;
    rmSync(root, { recursive: true, force: true });
  }
});

test("codex failure decisions expose stderr and stdout separately", () => {
  const decision = codexFailureDecisionForTest(
    1,
    "Codex review failed for #278 with exit 1.",
    "startup banner",
    "Rate limit reached for gpt-test on tokens per min (TPM)",
  );

  assert.equal(
    decision.summary,
    "Codex review failed: retryable codex transport failure (capacity) (exit 1).",
  );
  assert.equal(
    decision.evidence.find((entry) => entry.label === "codex stderr")?.detail,
    "Rate limit reached for [REDACTED_INTERNAL_MODEL] on tokens per min (TPM)",
  );
  assert.equal(
    decision.evidence.find((entry) => entry.label === "codex stdout")?.detail,
    "startup banner",
  );
});

test("runCodex retries a transient failure in a fresh process", () => {
  const root = mkdtempSync(tmpPrefix);
  const openclawDir = join(root, "openclaw");
  const workDir = join(root, "codex-work");
  const binDir = join(root, "bin");
  const codexHome = join(root, "codex-home");
  const attemptsPath = join(root, "attempts");
  mkdirSync(openclawDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  execFileSync("git", ["init"], { cwd: openclawDir, stdio: "ignore" });
  writeFileSync(join(codexHome, "config.toml"), 'model = "secret-model-for-test"\n');
  const codexPath = join(binDir, "codex");
  writeFileSync(
    codexPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const attemptsPath = process.env.CODEX_ATTEMPTS_PATH;
const attempt = fs.existsSync(attemptsPath) ? Number(fs.readFileSync(attemptsPath, "utf8")) + 1 : 1;
fs.writeFileSync(attemptsPath, String(attempt));
if (attempt === 1) {
  process.stderr.write("stream disconnected: Rate limit reached for secret-model-for-test (for limit test) on tokens per min (TPM). Please try again in 1ms.\\n");
  process.exit(1);
}
const outputIndex = process.argv.indexOf("--output-last-message");
fs.writeFileSync(process.argv[outputIndex + 1], process.env.CODEX_DECISION_JSON);
process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"command_execution",status:"completed",exit_code:0,command:"git rev-parse HEAD",aggregated_output:"abc123"}})+"\\n");
`,
  );
  chmodSync(codexPath, 0o755);
  const previous = {
    PATH: process.env.PATH,
    CODEX_ATTEMPTS_PATH: process.env.CODEX_ATTEMPTS_PATH,
    CODEX_DECISION_JSON: process.env.CODEX_DECISION_JSON,
    CODEX_HOME: process.env.CODEX_HOME,
    CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS: process.env.CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS,
    CLAWSWEEPER_CODEX_REVIEW_RETRY_DELAY_MS: process.env.CLAWSWEEPER_CODEX_REVIEW_RETRY_DELAY_MS,
  };
  process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
  process.env.CODEX_ATTEMPTS_PATH = attemptsPath;
  process.env.CODEX_DECISION_JSON = JSON.stringify(
    closeDecision({
      decision: "keep_open",
      closeReason: "none",
      confidence: "medium",
      summary: "Review completed after a fresh Codex process.",
      bestSolution: "Continue the existing review loop.",
      closeComment: "",
      workReason: "No additional implementation is required.",
    }),
  );
  process.env.CODEX_HOME = codexHome;
  process.env.CLAWSWEEPER_CODEX_REVIEW_ATTEMPTS = "2";
  process.env.CLAWSWEEPER_CODEX_REVIEW_RETRY_DELAY_MS = "1";
  try {
    const decision = runCodexForTest({
      item: item({ number: 83394 }),
      context: { issue: {}, comments: [], timeline: [] },
      git: { mainSha: "abc123", latestRelease: null },
      model: "internal",
      openclawDir,
      reasoningEffort: "high",
      sandboxMode: "read-only",
      serviceTier: "",
      timeoutMs: 10_000,
      workDir,
      prompt: "Return a review decision.",
    });

    assert.equal(readFileSync(attemptsPath, "utf8"), "2");
    assert.equal(decision.summary, "Review completed after a fresh Codex process.");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex failure redaction hides the configured internal model", () => {
  const root = mkdtempSync(tmpPrefix);
  writeFileSync(join(root, "config.toml"), 'model = "secret-model-for-test"\n');
  try {
    const redacted = redactInternalCodexModel(
      "selected secret-model-for-test; Rate limit reached for unknown-model (for limit test)",
      root,
    );
    assert.doesNotMatch(redacted, /secret-model-for-test|unknown-model/);
    assert.equal(redacted.match(/\[REDACTED_INTERNAL_MODEL\]/g)?.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex failure redaction reads the default home configuration", () => {
  const root = mkdtempSync(tmpPrefix);
  const codexHome = join(root, ".codex");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, "config.toml"), 'model = "default-secret-model"\n');
  const previous = {
    HOME: process.env.HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    CLAWSWEEPER_INTERNAL_MODEL: process.env.CLAWSWEEPER_INTERNAL_MODEL,
  };
  try {
    process.env.HOME = root;
    delete process.env.CODEX_HOME;
    delete process.env.CLAWSWEEPER_INTERNAL_MODEL;
    assert.equal(
      redactInternalCodexModel("selected default-secret-model"),
      "selected [REDACTED_INTERNAL_MODEL]",
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("decision parser enforces required schema-shaped evidence", () => {
  assert.equal(parseDecision(closeDecision()).decision, "close");
  assert.equal(parseDecision(closeDecision({ itemCategory: "skill" })).itemCategory, "skill");
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        evidence: [{ label: "partial", detail: "missing nullable fields" }],
      }),
    /decision\.evidence\[0\]\.file/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        likelyOwners: [],
      }),
    /decision\.likelyOwners must not be empty/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        likelyOwners: [{ person: "@alice", reason: "missing fields" }],
      }),
    /decision\.likelyOwners\[0\]\.role/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        workCandidate: "auto_everything",
      }),
    /decision\.workCandidate/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        itemCategory: "mixed_mode",
      }),
    /decision\.itemCategory/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        triagePriority: "urgent",
      }),
    /decision\.triagePriority/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        impactLabels: ["impact:unknown"],
      }),
    /decision\.impactLabels\[0\]/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        impactLabels: [
          "impact:data-loss",
          "impact:security",
          "impact:crash-loop",
          "impact:message-loss",
        ],
      }),
    /decision\.impactLabels must contain at most 3 labels/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        impactLabels: ["impact:data-loss", "impact:data-loss"],
      }),
    /decision\.impactLabels must not contain duplicates/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: ["merge-risk:unknown"],
      }),
    /decision\.mergeRiskLabels\[0\]/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: [
          "merge-risk: 🚨 compatibility",
          "merge-risk: 🚨 message-delivery",
          "merge-risk: 🚨 session-state",
          "merge-risk: 🚨 auth-provider",
        ],
      }),
    /decision\.mergeRiskLabels must contain at most 3 labels/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: ["merge-risk: 🚨 compatibility", "merge-risk: 🚨 compatibility"],
      }),
    /decision\.mergeRiskLabels must not contain duplicates/,
  );
  assert.equal(
    parseDecision({
      ...closeDecision(),
      mergeRiskOptions: undefined,
    }).mergeRiskOptions.length,
    0,
  );
  assert.deepEqual(
    parseDecision({
      ...closeDecision(),
      reviewMetrics: [
        {
          label: "Files affected",
          value: "3 files affected",
          reason: "The PR touches enough files that maintainers should scan the changed surface.",
        },
      ],
    }).reviewMetrics,
    [
      {
        label: "Files affected",
        value: "3 files affected",
        reason: "The PR touches enough files that maintainers should scan the changed surface.",
      },
    ],
  );
  assert.throws(() => {
    const decision = closeDecision();
    delete decision.reviewMetrics;
    return parseDecision(decision);
  }, /decision\.reviewMetrics must be an array/);
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        reviewMetrics: [{ label: "Files affected", value: "3 files affected" }],
      }),
    /decision\.reviewMetrics\[0\]\.reason/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskOptions: [
          {
            title: "Accept the risk",
            body: "Merge only if maintainers accept this risk.",
            category: "accept_risk",
            recommended: false,
            automergeInstruction: "",
          },
        ],
      }),
    /decision\.mergeRiskOptions must be empty when mergeRiskLabels is empty/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: ["merge-risk: 🚨 compatibility"],
      }),
    /decision\.mergeRiskOptions must include 1-3 options when mergeRiskLabels is not empty/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: ["merge-risk: 🚨 compatibility"],
        mergeRiskOptions: [
          {
            title: "Preserve behavior",
            body: "Keep the existing default behavior before merge.",
            category: "fix_before_merge",
            recommended: true,
            automergeInstruction: "Keep the existing default behavior before merge.",
          },
          {
            title: "Accept risk",
            body: "Merge only if maintainers accept the compatibility break.",
            category: "accept_risk",
            recommended: true,
            automergeInstruction: "",
          },
        ],
      }),
    /decision\.mergeRiskOptions must not contain more than one recommended option/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: ["merge-risk: 🚨 security-boundary"],
        mergeRiskOptions: [
          {
            title: "Accept risk",
            body: "Merge only if maintainers accept the hardening tradeoff.",
            category: "accept_risk",
            recommended: true,
            automergeInstruction: "Merge the intentional hardening change.",
          },
        ],
      }),
    /decision\.mergeRiskOptions\[0\]\.automergeInstruction requires fix_before_merge category/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        mergeRiskLabels: ["merge-risk: 🚨 message-delivery"],
        mergeRiskOptions: [
          {
            title: "Guard delivery",
            body: "Add delivery-state tests before merge.",
            category: "fix_before_merge",
            recommended: false,
            automergeInstruction: "Add delivery-state tests before merge.",
          },
        ],
      }),
    /decision\.mergeRiskOptions\[0\]\.automergeInstruction requires a recommended option/,
  );
  assert.deepEqual(
    parseDecision(
      closeDecision({
        impactLabels: ["impact:other"],
        labelJustifications: [
          {
            label: "P2",
            reason: "Normal priority applies to this limited-scope implemented behavior check.",
          },
          {
            label: "impact:other",
            reason: "The issue has maintainer-visible impact outside the specific taxonomy.",
          },
        ],
      }),
    ).impactLabels,
    ["impact:other"],
  );
  assert.deepEqual(
    parseDecision(
      closeDecision({
        mergeRiskLabels: ["merge-risk: 🚨 other"],
        mergeRiskOptions: [
          {
            title: "Validate the uncategorized risk",
            body: "Run targeted validation for the maintainer-visible risk before merge.",
            category: "fix_before_merge",
            recommended: true,
            automergeInstruction:
              "Run targeted validation for the maintainer-visible risk before merge.",
          },
        ],
        labelJustifications: [
          {
            label: "P2",
            reason: "Normal priority applies to this limited-scope implemented behavior check.",
          },
          {
            label: "merge-risk: 🚨 other",
            reason: "The PR has a maintainer-visible merge risk outside the specific taxonomy.",
          },
        ],
      }),
    ).mergeRiskLabels,
    ["merge-risk: 🚨 other"],
  );
  assert.throws(() => {
    const decision = closeDecision();
    delete decision.labelJustifications;
    return parseDecision(decision);
  }, /decision\.labelJustifications must be an array/);
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision({
          impactLabels: ["impact:message-loss"],
          labelJustifications: [
            {
              label: "P2",
              reason: "Normal priority applies to this limited-scope implemented behavior check.",
            },
          ],
        }),
      }),
    /decision\.labelJustifications missing selected labels: impact:message-loss/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision({
          labelJustifications: [
            {
              label: "P2",
              reason: "Normal priority applies to this limited-scope implemented behavior check.",
            },
            {
              label: "impact:data-loss",
              reason: "The selected labels did not include this impact area.",
            },
          ],
        }),
      }),
    /decision\.labelJustifications contains unselected labels: impact:data-loss/,
  );
  assert.throws(
    () =>
      parseDecision({
        ...closeDecision(),
        requiresNewConfigOption: "false",
      }),
    /decision\.requiresNewConfigOption/,
  );
  assert.throws(() => {
    const decision = closeDecision();
    delete decision.securityReview;
    return parseDecision(decision);
  }, /decision\.securityReview/);
  assert.throws(() => {
    const decision = closeDecision();
    delete decision.realBehaviorProof;
    return parseDecision(decision);
  }, /decision\.realBehaviorProof/);
  const workCandidate = parseDecision(
    closeDecision({
      decision: "keep_open",
      closeReason: "none",
      confidence: "medium",
      workCandidate: "queue_fix_pr",
      workConfidence: "high",
      workPriority: "medium",
      workReason: "The bug is narrow and reproducible.",
      workPrompt: "Fix the narrow bug and add a regression test.",
      workClusterRefs: ["#123", "#456"],
      workValidation: ["pnpm test:unit"],
      workLikelyFiles: ["src/example.ts", "test/example.test.ts"],
    }),
  );
  assert.equal(workCandidate.workCandidate, "queue_fix_pr");
  assert.equal(workCandidate.triagePriority, "P2");
  assert.equal(workCandidate.itemCategory, "bug");
  assert.equal(workCandidate.reproductionStatus, "reproduced");
  assert.equal(workCandidate.realBehaviorProof.status, "not_applicable");
  assert.deepEqual(workCandidate.workClusterRefs, ["#123", "#456"]);
});

test("review prompt routes PR likely owners through feature history", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /feature-history hunt/);
  assert.match(prompt, /who introduced the feature/);
  assert.match(prompt, /git log --follow -- <file>/);
  assert.match(prompt, /do not list the PR author solely/);
  assert.match(prompt, /not to the PR\s+author merely for writing the proposal/);
  assert.match(prompt, /Do\s+not use `maintainer` as a likely-owner role/);
  assert.match(prompt, /Do not include email\s+addresses in `likelyOwners`/);
  assert.match(prompt, /use names without email addresses/);
});

test("review prompt describes concrete review metrics without vague examples", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Always fill `reviewMetrics`/);
  assert.match(prompt, /useful, concrete, maintainer-relevant/);
  assert.match(prompt, /2 added, 1 changed, 0\s+removed/);
  assert.match(prompt, /Do not use vague\s+labels or values/);
  assert.doesNotMatch(prompt, /Risky change/);
  assert.doesNotMatch(prompt, /Some changes/);
  assert.doesNotMatch(prompt, /This seems risky/);
});

test("review prompt reads maintainer notes before PR diffs", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /\.agents\/maintainer-notes\//);
  assert.match(prompt, /before reviewing the diff/);
  assert.match(prompt, /Treat matching notes as maintainer decisions/);
  assert.match(prompt, /do not publish raw internal note contents/);
});

test("review prompts treat target AGENTS as optional review policy", () => {
  const itemPrompt = readFileSync("prompts/review-item.md", "utf8");
  const commitPrompt = readFileSync("prompts/review-commit.md", "utf8");

  for (const prompt of [itemPrompt, commitPrompt]) {
    assert.match(
      prompt,
      /Before reviewing, read the target\s+repository's full `AGENTS\.md` file if present/,
    );
    assert.match(prompt, /Do not rely only on search\s+snippets/);
    assert.match(
      prompt,
      /`head` output, local excerpts, partial line ranges, or truncated\s+copies/,
    );
    assert.match(prompt, /optional\s+repository-authored\s+review policy and review guidance/);
    assert.match(
      prompt,
      /do not conflict with this prompt or higher-priority\s+system\/developer\s+instructions/,
    );
    assert.match(prompt, /existing repository\s+profiles and owner\/default fallback behavior/);
    assert.match(prompt, /Use target `AGENTS\.md` policy as review input/);
  }

  assert.match(itemPrompt, /report it through `reviewFindings`/);
  assert.match(
    itemPrompt,
    /route the\s+concern through the existing `risks`, `bestSolution`, `solutionAssessment`, or\s+`workReason` fields/,
  );
  assert.match(
    commitPrompt,
    /Report an AGENTS-policy conflict only when the commit creates a\s+concrete bug/,
  );
  assert.match(commitPrompt, /keep it out of `result: findings`/);
});

test("review prompt requires a dedicated securityReview section", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Always summarize this pass in `securityReview`/);
  assert.match(prompt, /Always fill `securityReview`/);
  assert.match(prompt, /status: "needs_attention"/);
});

test("review prompt treats duplicated behavior as a P1 PR finding", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /dedicated solution-fit and upgrade-safety pass/);
  assert.match(prompt, /current code, documented configuration, CLI flags, env vars/);
  assert.match(prompt, /Search the codebase and docs for the existing capability/);
  assert.match(prompt, /Treat duplicated behavior as a high-priority defect/);
  assert.match(prompt, /add a P1 review finding unless the PR proves/);
  assert.match(prompt, /maintenance drift, conflicting behavior,\s+or user confusion/);
});

test("review prompt treats plugin API changes as compatibility-sensitive P1 repair work", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Treat plugin API surface changes as compatibility-sensitive/);
  assert.match(prompt, /adds,\s+removes, renames, deprecates, changes behavior for/);
  assert.match(prompt, /adds new similar\/parallel\s+calls to a plugin API/);
  assert.match(prompt, /require explicit maintainer-visible discussion/);
  assert.match(prompt, /Use\s+`merge-risk: 🚨 compatibility`/);
  assert.match(prompt, /name the plugin API concern in `risks`/);
  assert.match(prompt, /make\s+`mergeRiskOptions` spell out the maintainer choices or repair path/);
  assert.match(prompt, /Prefer a\s+resolvable P1 review finding/);
  assert.match(prompt, /preserving the existing API/);
  assert.match(prompt, /removing the duplicate\/parallel call/);
  assert.match(prompt, /clear deprecation path/);
  assert.match(prompt, /focused\s+compatibility tests/);
  assert.match(
    prompt,
    /Choose\s+`queue_fix_pr` for plugin API findings only when the\s+repair is concrete/,
  );
  assert.match(
    prompt,
    /Use\s+`manual_review` when the unresolved blocker is whether the new API should exist/,
  );
});

test("review prompt requires upgrade and preference overwrite checks", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Treat compatibility and user settings as merge-critical/);
  assert.match(prompt, /override existing preferences, persisted config, provider choices/);
  assert.match(
    prompt,
    /A new default must not change an existing user's stored\s+value during upgrade/,
  );
  assert.match(prompt, /Call out upgrade and settings breakage directly in `reviewFindings`/);
  assert.match(prompt, /existing config\/preferences can be overwritten/);
  assert.match(prompt, /preserving the existing\s+behavior as the default/);
  assert.match(prompt, /explicit strict config option/);
  assert.match(prompt, /default compatibility mode and the\s+opt-in strict mode/);
  assert.match(prompt, /require evidence for both fresh-install behavior and upgrade\s+behavior/);
  assert.match(prompt, /If upgrade behavior is ambiguous, mark the PR incorrect/);
});

test("review prompt treats stored data-model changes as compatibility-sensitive", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Treat stored data-model changes as compatibility-sensitive/);
  assert.match(prompt, /SQL\s+DDL or migrations/);
  assert.match(prompt, /persistent cache schemas/);
  assert.match(prompt, /Durable Object or hosted storage schemas/);
  assert.match(prompt, /serialized JSON state written to disk/);
  assert.match(prompt, /vector or embedding row identity\/query-compatibility metadata/);
  assert.match(prompt, /doctor, repair, migration, or backfill code/);
  assert.match(prompt, /pure query-only changes or non-semantic docs wording/);
  assert.match(prompt, /migration or upgrade compatibility proof before any pass/);
});

test("review prompt requires real behavior proof for PR reviews", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /realBehaviorProof/);
  assert.match(prompt, /Terminal screenshots|terminal screenshots/);
  assert.match(prompt, /download\/open GitHub attachment links/);
  assert.match(prompt, /generate stills or contact sheets from videos/);
  assert.match(prompt, /compare the proof against the PR diff/);
  assert.match(prompt, /Prefer asking for screenshots or videos/);
  assert.match(prompt, /redact private information like IP addresses, API keys/);
  assert.match(prompt, /screenshot-only proof sufficient/);
  assert.match(prompt, /no visible console violation/);
  assert.match(prompt, /scratch directory/);
  assert.match(prompt, /@clawsweeper re-review/);
  assert.match(
    prompt,
    /Unit tests, mocks, snapshots, lint, typechecks, and CI are supplemental only/,
  );
  assert.match(prompt, /do not request ClawSweeper repair markers/);
});

test("media proof preparation extracts browser-unplayable ffmpeg-decodeable video proof", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawsweeper-media-proof-"));
  try {
    const context = {
      issue: {},
      comments: [
        {
          body: [
            "Chromium media error code 4 on this upload, but ffmpeg can decode it:",
            "https://github.com/user/repo/releases/download/proof/Screen.Recording.mov",
          ].join("\n"),
        },
      ],
      timeline: [],
    };
    const calls: string[] = [];
    const prepared = prepareMediaProofArtifactsForTest(context, dir, (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "curl") {
        const outputIndex = args.indexOf("--output");
        assert.notEqual(outputIndex, -1);
        writeFileSync(String(args[outputIndex + 1]), "fake mov bytes");
        return { status: 0, stdout: "", stderr: "" };
      }
      if (command === "ffprobe") {
        return {
          status: 0,
          stdout: JSON.stringify({
            format: { duration: "46.49" },
            streams: [{ codec_name: "h264", width: 734, height: 1038 }],
          }),
          stderr: "",
        };
      }
      if (command === "ffmpeg") {
        const output = String(args.at(-1));
        writeFileSync(output, "fake contact sheet");
        return { status: 0, stdout: "", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: `unexpected command: ${command}` };
    });

    assert.equal(prepared.artifacts.length, 1);
    assert.equal(prepared.artifacts[0]?.status, "prepared");
    assert.ok(prepared.manifestPath);
    assert.ok(prepared.summaryPath);
    assert.ok(prepared.artifacts[0]?.metadataPath);
    assert.ok(prepared.artifacts[0]?.contactSheetPath);
    assert.equal(existsSync(prepared.manifestPath), true);
    assert.equal(existsSync(prepared.artifacts[0].metadataPath), true);
    assert.equal(existsSync(prepared.artifacts[0].contactSheetPath), true);
    assert.match(calls.join("\n"), /^curl /m);
    assert.match(calls.join("\n"), /^ffprobe /m);
    assert.match(calls.join("\n"), /^ffmpeg /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runtime prompt tells Codex to inspect ffmpeg video artifacts before browser fallback", () => {
  const context = {
    issue: {},
    comments: [{ body: "Proof: https://github.com/user/repo/releases/download/proof/demo.mov" }],
    timeline: [],
  };
  const prompt = reviewPromptForTest(
    item({ kind: "pull_request" }),
    context,
    { mainSha: "abc123", latestRelease: null },
    "",
    {
      proofScratchDir: "/tmp/proof",
      mediaProofManifestPath: "/tmp/proof/media-proof-manifest.json",
      mediaProofSummary: "prepared: https://github.com/user/repo/releases/download/proof/demo.mov",
    },
  );

  assert.deepEqual(proofVideoUrlsFromContextForTest(context), [
    "https://github.com/user/repo/releases/download/proof/demo.mov",
  ]);
  assert.match(prompt, /preprocessed linked video proof with ffprobe\/ffmpeg/);
  assert.match(prompt, /generated contact-sheet image paths before trying browser playback/);
  assert.match(
    prompt,
    /Only fall back to browser playback after checking the prepared ffmpeg artifacts/,
  );
  assert.match(
    prompt,
    /If browser playback fails but ffprobe metadata and ffmpeg contact sheets are readable/,
  );
});

test("review prompt keeps draft and protected workflow state out of PR rank", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Rate PR evidence\s+and patch quality/);
  assert.match(prompt, /weaker proof-or-patch quality signal/);
  assert.match(
    prompt,
    /Do not lower `proofTier`, `patchTier`,\s+or `overallTier` solely because the PR is draft/,
  );
  assert.match(prompt, /has protected labels/);
  assert.match(prompt, /not\s+automerge-eligible/);
  assert.match(prompt, /workflow\s+state signals, not proof or patch quality defects/);
});

test("decision schema keeps draft and protected workflow state out of PR rank", () => {
  const schema = JSON.parse(readFileSync("schema/clawsweeper-decision.schema.json", "utf8"));
  const prRating = schema.properties.prRating;

  assert.match(prRating.description, /Calibrated PR quality rating/);
  assert.match(prRating.description, /Rate the PR evidence and patch quality/);
  assert.match(prRating.description, /Do not lower any tier solely because the PR is draft/);
  assert.match(prRating.description, /has protected labels/);
  assert.match(prRating.description, /not automerge-eligible/);
  assert.match(
    prRating.properties.overallTier.description,
    /Draft, protected-label, automerge eligibility, and maintainer-waiting workflow states must not lower this tier by themselves/,
  );
});

test("review prompt and schema describe positive-only feature showcase labels", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");
  const schema = JSON.parse(readFileSync("schema/clawsweeper-decision.schema.json", "utf8"));
  const featureShowcase = schema.properties.featureShowcase;

  assert.match(prompt, /featureShowcase/);
  assert.match(prompt, /positive-only maintainer spotlight/);
  assert.match(prompt, /really compelling feature ideas/);
  assert.match(prompt, /not a merge gate/);
  assert.match(featureShowcase.description, /Positive-only maintainer spotlight/);
  assert.match(featureShowcase.description, /not a merge gate/);
  assert.deepEqual(featureShowcase.properties.status.enum, ["showcase", "none"]);
});

test("review prompt classifies Telegram visible proof candidates", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /telegramVisibleProof/);
  assert.match(prompt, /telegram-crabbox-e2e-proof/);
  assert.match(prompt, /message formatting/);
  assert.match(prompt, /mantis: telegram-visible-proof/);
  assert.match(prompt, /mantisRecommendation/);
  assert.match(prompt, /@openclaw-mantis/);
  assert.match(prompt, /ambiguous Mantis account mention/);
});

test("pull request review comments suggest copy-paste Mantis proof comments", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "83140",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this Telegram PR open for maintainer review.

## What This Changes

Fixes Telegram topic stop targeting.

## Real Behavior Proof

Status: mock_only

Evidence kind: none

Needs contributor action: true

Summary: Current proof is test-only for visible Telegram topic behavior.

## Mantis Recommendation

Status: recommended

Scenario: telegram_desktop_proof

Reason: This changes visible Telegram topic behavior that should be proven in native Telegram Desktop.

Maintainer comment: @openclaw-mantis telegram desktop proof: verify that /stop targets the active topic and does not affect other topics.

## Work Candidate

Candidate: none

Confidence: low

Priority: low

Status: none

Reason: Maintainers should review the proof before merge.
	`,
    "none",
  );

  assert.match(comment, /\*\*Mantis proof suggestion\*\*/);
  assert.match(comment, /starts with the OpenClaw Mantis account mention/);
  assert.match(comment, /```text\ntelegram desktop proof:/);
  assert.doesNotMatch(comment, /@openclaw-mantis/);
});

test("pull request review comments suppress unsafe Mantis recommendations", () => {
  const comment = renderReviewCommentFromReport(
    `${reportFrontMatter({
      type: "pull_request",
      number: "83140",
      decision: "keep_open",
      close_reason: "none",
      work_candidate: "none",
      pull_head_sha: "abc123def456",
    })}

## Summary

Keep this Telegram PR open for maintainer review.

## Mantis Recommendation

Status: recommended

Scenario: telegram_desktop_proof

Reason: This changes visible Telegram behavior.

Maintainer comment: @${"mantis"} telegram desktop proof

## Work Candidate

Candidate: none

Confidence: low

Priority: low

Status: none

Reason: Maintainers should review the proof before merge.
	`,
    "none",
  );

  assert.doesNotMatch(comment, /\*\*Mantis proof suggestion\*\*/);
  assert.doesNotMatch(comment, /@openclaw-mantis/);
});

test("ClawSweeper proof judgement controls the sufficient proof label", () => {
  assert.deepEqual(realBehaviorProofSufficientLabelsForTest(["proof: supplied"], "sufficient"), [
    "proof: supplied",
    "proof: sufficient",
  ]);
  assert.deepEqual(
    realBehaviorProofSufficientLabelsForTest(
      ["proof: supplied", "proof: sufficient"],
      "insufficient",
    ),
    ["proof: supplied"],
  );
  assert.deepEqual(realBehaviorProofSufficientLabelsForTest(["proof: sufficient"], "missing"), []);
});

test("ClawSweeper proof evidence kind controls media proof labels", () => {
  assert.deepEqual(realBehaviorProofMediaLabelsForTest(["bug"], "screenshot"), [
    "bug",
    "proof: 📸 screenshot",
  ]);
  assert.deepEqual(realBehaviorProofMediaLabelsForTest(["proof: 📸 screenshot"], "recording"), [
    "proof: 🎥 video",
  ]);
  assert.deepEqual(
    realBehaviorProofMediaLabelsForTest(["proof: 📸 screenshot", "proof: 🎥 video"], "terminal"),
    [],
  );
});

test("ClawSweeper proof label sync recognizes missing optional labels", () => {
  assert.equal(
    isMissingGitHubLabelErrorForTest(
      "failed to update https://github.com/openclaw/fs-safe/pull/18: 'proof: sufficient' not found",
      "proof: sufficient",
    ),
    true,
  );
  assert.equal(
    isMissingGitHubLabelErrorForTest(
      "failed to update https://github.com/openclaw/fs-safe/pull/18: 'other label' not found",
      "proof: sufficient",
    ),
    false,
  );
});

test("bot proof candidate scan prioritizes ClawSweeper proof blockers", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    writeFileSync(
      join(root, "41.md"),
      proofNudgeReport({
        number: 41,
        author: "contributor",
        reviewedAt: "2026-01-05T00:00:00Z",
      }),
    );
    writeFileSync(
      join(root, "42.md"),
      proofNudgeReport({
        author: "app/clawsweeper",
        reviewedAt: "2026-01-01T00:00:00Z",
      }),
    );

    assert.deepEqual(
      botProofCandidateRecordsForTest(root).map((candidate) => candidate.number),
      [42, 41],
    );
    assert.deepEqual(
      botProofCandidateRecordsForTest(root, [41]).map((candidate) => candidate.number),
      [41],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bot proof handling selects maintainer or Mantis proof path for ClawSweeper PRs", () => {
  const baseOptions = {
    item: proofNudgeItem({
      author: "app/clawsweeper",
      labels: ["triage: needs-real-behavior-proof", "status: 📣 needs proof", "stale"],
    }),
    headSha: "abc123def456",
  };
  const decision = botProofEligibilityForTest({
    ...baseOptions,
    markdown: proofNudgeReport({ author: "app/clawsweeper" }),
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.action, "bot_proof_decision_planned");

  const mantis = botProofEligibilityForTest({
    ...baseOptions,
    markdown: proofNudgeReport({
      author: "app/clawsweeper",
      mantisStatus: "recommended",
      mantisScenario: "telegram_desktop_proof",
      mantisReason: "Native Telegram Desktop proof would show the visible topic behavior.",
      mantisComment: "@openclaw-mantis telegram desktop proof: verify the topic behavior",
    }),
  });
  assert.equal(mantis.eligible, true);
  assert.equal(mantis.action, "bot_proof_mantis_request_planned");

  const manualVisual = botProofEligibilityForTest({
    ...baseOptions,
    markdown: proofNudgeReport({
      author: "app/clawsweeper",
      mantisStatus: "recommended",
      mantisScenario: "visual_task",
      mantisReason: "A visual proof task would show the fixed Control UI behavior.",
      mantisComment: "@openclaw-mantis capture Control UI proof for this PR",
    }),
  });
  assert.equal(manualVisual.eligible, true);
  assert.equal(manualVisual.action, "bot_proof_decision_planned");

  assert.equal(
    botProofEligibilityForTest({
      item: proofNudgeItem({
        author: "clawsweeper[bot]",
        labels: ["status: 📣 needs proof"],
      }),
      markdown: proofNudgeReport({ author: "app/clawsweeper" }),
      headSha: "abc123def456",
    }).action,
    "bot_proof_decision_planned",
  );
});

test("bot proof handling skips overrides, stale heads, drafts, and non-ClawSweeper PRs", () => {
  const baseItem = proofNudgeItem({
    author: "app/clawsweeper",
    labels: ["triage: needs-real-behavior-proof"],
  });
  assert.equal(
    botProofEligibilityForTest({
      item: proofNudgeItem({ author: "contributor" }),
      markdown: proofNudgeReport(),
      headSha: "abc123def456",
    }).action,
    "skipped_not_bot_authored",
  );
  assert.equal(
    botProofEligibilityForTest({
      item: baseItem,
      markdown: proofNudgeReport({ author: "app/clawsweeper" }),
      headSha: "abc123def456",
      draft: true,
    }).action,
    "skipped_draft",
  );
  for (const label of ["proof: override", "proof: supplied", "proof: sufficient"] as const) {
    assert.equal(
      botProofEligibilityForTest({
        item: proofNudgeItem({
          author: "app/clawsweeper",
          labels: ["triage: needs-real-behavior-proof", label],
        }),
        markdown: proofNudgeReport({ author: "app/clawsweeper" }),
        headSha: "abc123def456",
      }).action,
      "skipped_policy_exempt",
    );
  }
  assert.equal(
    botProofEligibilityForTest({
      item: baseItem,
      markdown: proofNudgeReport({ author: "app/clawsweeper", headSha: "oldhead" }),
      headSha: "newhead",
    }).action,
    "skipped_stale_report_head",
  );
});

test("bot proof status comment asks maintainers without contributor nudge copy", () => {
  const markdown = proofNudgeReport({
    author: "app/clawsweeper",
    mantisStatus: "recommended",
    mantisScenario: "visual_task",
    mantisReason: "A visual proof task would show the fixed Control UI behavior.",
    mantisComment: "@openclaw-mantis capture Control UI proof for this PR",
  });
  const comment = renderBotProofDecisionCommentForTest({
    number: 42,
    headSha: "abc123def456",
    markdown,
  });

  assert.match(comment, /ClawSweeper-authored replacement PR is blocked on real behavior proof/);
  assert.match(comment, /proof: override/);
  assert.match(comment, /Possible manual Mantis\/desktop proof suggestion/);
  assert.match(comment, /@openclaw-mantis capture Control UI proof/);
  assert.match(comment, /<!-- clawsweeper-bot-proof-decision item="42" sha="abc123def456"/);
  assert.doesNotMatch(comment, /thanks for the PR/);
  assert.doesNotMatch(comment, /Once proof is added/);
});

test("proof nudge candidate scan defers proof-label checks to live PR state", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    writeFileSync(join(root, "41.md"), proofNudgeReport({ reviewedAt: "2026-01-05T00:00:00Z" }));
    writeFileSync(
      join(root, "42.md"),
      `---
repository: openclaw/openclaw
number: 42
type: pull_request
labels: []
review_status: complete
reviewed_at: 2026-01-01T00:00:00Z
---

## Summary

Stored report label snapshots can be older than the live PR labels.
`,
    );

    const requestedCandidates = proofNudgeCandidateRecordsForTest(root, [42]);
    const allCandidates = proofNudgeCandidateRecordsForTest(root);

    assert.deepEqual(
      requestedCandidates.map((candidate) => candidate.number),
      [42],
    );
    assert.deepEqual(
      allCandidates.map((candidate) => candidate.number),
      [41, 42],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proof nudges skip stale targeted PRs when live GitHub state cannot be fetched", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const itemsDir = join(root, "items");
    const reportPath = join(root, "proof-nudge-report.json");
    mkdirSync(itemsDir, { recursive: true });
    writeFileSync(join(itemsDir, "42.md"), proofNudgeReport({ number: 42 }));
    writeFileSync(join(itemsDir, "43.md"), proofNudgeReport({ number: 43 }));
    withMockGh(
      root,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
const path = args[1] || "";
if (path.endsWith("/issues/42")) {
  console.error("Not Found");
  process.exit(1);
}
if (path.endsWith("/issues/43")) {
  console.log(JSON.stringify({
    number: 43,
    title: "Closed proof nudge sample",
    html_url: "https://github.com/openclaw/openclaw/pull/43",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: "2026-01-03T00:00:00Z",
    state: "closed",
    locked: false,
    active_lock_reason: null,
    author_association: "CONTRIBUTOR",
    user: { login: "contributor" },
    labels: ["triage: needs-real-behavior-proof"],
    pull_request: {}
  }));
  process.exit(0);
}
console.error("unexpected gh args: " + args.join(" "));
process.exit(1);
`,
      () => {
        execFileSync(process.execPath, [
          "dist/clawsweeper.js",
          "proof-nudges",
          "--target-repo",
          "openclaw/openclaw",
          "--items-dir",
          itemsDir,
          "--item-numbers",
          "42,43",
          "--limit",
          "10",
          "--processed-limit",
          "10",
          "--report-path",
          reportPath,
        ]);
      },
    );

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.deepEqual(
      report.map((entry: { number: number; action: string }) => [entry.number, entry.action]),
      [
        [42, "skipped_live_fetch_failed"],
        [43, "skipped_not_open"],
      ],
    );
    assert.match(report[0].reason, /live GitHub state could not be fetched/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("proof nudges become eligible only after proof policy and age gates pass", () => {
  const result = proofNudgeEligibilityForTest({
    item: proofNudgeItem(),
    markdown: proofNudgeReport(),
    headSha: "abc123def456",
    headCommittedAt: "2026-01-01T00:00:00Z",
    now: Date.parse("2026-01-10T00:00:00Z"),
    minAgeDays: 5,
    cooldownDays: 7,
  });

  assert.equal(result.eligible, true);
  assert.equal(result.action, "proof_nudge_planned");
});

test("proof nudges skip recent reviews and recent author activity", () => {
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport({ reviewedAt: "2026-01-08T00:00:00Z" }),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
      minAgeDays: 5,
      cooldownDays: 7,
    }).action,
    "skipped_recent_review",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport(),
      comments: [
        {
          author: "contributor",
          body: "I'll add proof later.",
          updatedAt: "2026-01-09T00:00:00Z",
        },
      ],
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
      minAgeDays: 5,
      cooldownDays: 7,
    }).action,
    "skipped_recent_author_activity",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport(),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      authorEditedAt: "2026-01-09T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
      minAgeDays: 5,
      cooldownDays: 7,
    }).action,
    "skipped_recent_author_activity",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport(),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      authorReviewActivityAt: "2026-01-09T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
      minAgeDays: 5,
      cooldownDays: 7,
    }).action,
    "skipped_recent_author_activity",
  );
  const maintainerActivity = proofNudgeEligibilityForTest({
    item: proofNudgeItem({ updatedAt: "2026-01-09T00:00:00Z" }),
    markdown: proofNudgeReport(),
    comments: [
      { author: "maintainer", body: "Queued for review.", updatedAt: "2026-01-09T00:00:00Z" },
    ],
    headSha: "abc123def456",
    headCommittedAt: "2026-01-01T00:00:00Z",
    now: Date.parse("2026-01-10T00:00:00Z"),
    minAgeDays: 5,
    cooldownDays: 7,
  });

  assert.equal(maintainerActivity.eligible, true);
  assert.equal(maintainerActivity.action, "proof_nudge_planned");
});

test("proof nudges use same-head cooldown markers instead of label churn", () => {
  const comment = renderProofNudgeCommentForTest({
    number: 42,
    author: "contributor",
    headSha: "abc123def456",
    timestamp: "2026-01-08T00:00:00.000Z",
  });
  const result = proofNudgeEligibilityForTest({
    item: proofNudgeItem(),
    markdown: proofNudgeReport(),
    comments: [{ author: "clawsweeper[bot]", body: comment, updatedAt: "2026-01-08T00:00:00Z" }],
    headSha: "abc123def456",
    headCommittedAt: "2026-01-01T00:00:00Z",
    now: Date.parse("2026-01-10T00:00:00Z"),
    minAgeDays: 5,
    cooldownDays: 7,
  });

  assert.equal(result.eligible, false);
  assert.equal(result.action, "skipped_recent_nudge");
  assert.match(comment, /<!-- clawsweeper-proof-nudge item="42" sha="abc123def456"/);

  const spoofedMarker = proofNudgeEligibilityForTest({
    item: proofNudgeItem(),
    markdown: proofNudgeReport(),
    comments: [{ author: "someoneelse", body: comment, updatedAt: "2026-01-08T00:00:00Z" }],
    headSha: "abc123def456",
    headCommittedAt: "2026-01-01T00:00:00Z",
    now: Date.parse("2026-01-10T00:00:00Z"),
    minAgeDays: 5,
    cooldownDays: 7,
  });

  assert.equal(spoofedMarker.eligible, true);
  assert.equal(spoofedMarker.action, "proof_nudge_planned");

  const malformedMarker = proofNudgeEligibilityForTest({
    item: proofNudgeItem(),
    markdown: proofNudgeReport(),
    comments: [
      {
        author: "clawsweeper[bot]",
        body: `<!-- clawsweeper-proof-nudge ${"a".repeat(5000)} -->`,
        updatedAt: "2026-01-08T00:00:00Z",
      },
    ],
    headSha: "abc123def456",
    headCommittedAt: "2026-01-01T00:00:00Z",
    now: Date.parse("2026-01-10T00:00:00Z"),
    minAgeDays: 5,
    cooldownDays: 7,
  });

  assert.equal(malformedMarker.eligible, true);
  assert.equal(malformedMarker.action, "proof_nudge_planned");
});

test("proof nudges skip stale report heads and proof-policy exemptions", () => {
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport({ headSha: "oldhead" }),
      headSha: "newhead",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
    }).action,
    "skipped_stale_report_head",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport({ headSha: "unknown" }),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
    }).action,
    "skipped_stale_report_head",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem({ labels: ["triage: needs-real-behavior-proof", "proof: override"] }),
      markdown: proofNudgeReport({
        labels: JSON.stringify(["triage: needs-real-behavior-proof", "proof: override"]),
      }),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
    }).action,
    "skipped_policy_exempt",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown: proofNudgeReport({
        proofStatus: "not_applicable",
        needsContributorAction: "false",
        reviewStatus: "failed",
      }),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
    }).action,
    "skipped_policy_exempt",
  );
  assert.equal(
    proofNudgeEligibilityForTest({
      item: proofNudgeItem({ labels: ["triage: needs-real-behavior-proof", "proof: supplied"] }),
      markdown: proofNudgeReport(),
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
    }).action,
    "skipped_policy_exempt",
  );
});

test("proof nudges skip maintainer, bot, security, and release PRs", () => {
  for (const [input, expected] of [
    [proofNudgeItem({ authorAssociation: "MEMBER" }), "skipped_maintainer_authored"],
    [proofNudgeItem({ author: "dependabot[bot]" }), "skipped_bot_authored"],
    [
      proofNudgeItem({
        labels: ["triage: needs-real-behavior-proof", "clawsweeper:needs-security-review"],
      }),
      "skipped_protected_label",
    ],
    [proofNudgeItem({ title: "Release 1.2.3" }), "skipped_protected_label"],
    [proofNudgeItem({ title: "chore(release): 1.2.3" }), "skipped_protected_label"],
  ] as const) {
    assert.equal(
      proofNudgeEligibilityForTest({
        item: input,
        markdown: proofNudgeReport({
          author: input.author,
          authorAssociation: input.authorAssociation,
          labels: JSON.stringify(input.labels),
        }),
        headSha: "abc123def456",
        headCommittedAt: "2026-01-01T00:00:00Z",
        now: Date.parse("2026-01-10T00:00:00Z"),
      }).action,
      expected,
    );
  }

  for (const [markdown, expectedReason] of [
    [
      proofNudgeReport({
        itemCategory: "security",
      }),
      "latest report item category is security",
    ],
    [
      proofNudgeReport({
        securityReviewStatus: "needs_attention",
        securityReviewSummary: "The patch changes token handling and needs maintainer review.",
      }),
      "latest report security review needs attention",
    ],
  ] as const) {
    const result = proofNudgeEligibilityForTest({
      item: proofNudgeItem(),
      markdown,
      headSha: "abc123def456",
      headCommittedAt: "2026-01-01T00:00:00Z",
      now: Date.parse("2026-01-10T00:00:00Z"),
    });
    assert.equal(result.action, "skipped_protected_label");
    assert.equal(result.reason, expectedReason);
  }
});

test("proof nudges skip locked PR conversations before posting", () => {
  const result = proofNudgeEligibilityForTest({
    item: proofNudgeItem({ locked: true, activeLockReason: "resolved" }),
    markdown: proofNudgeReport(),
    headSha: "abc123def456",
    headCommittedAt: "2026-01-01T00:00:00Z",
    now: Date.parse("2026-01-10T00:00:00Z"),
  });

  assert.equal(result.eligible, false);
  assert.equal(result.action, "skipped_locked_conversation");
  assert.match(result.reason, /conversation is locked \(resolved\)/);
});

test("proof nudge copy asks for evidence without promising author-only re-review access", () => {
  const comment = renderProofNudgeCommentForTest({
    number: 42,
    author: "contributor",
    headSha: "abc123def456",
  });

  assert.match(comment, /^@contributor thanks for the PR\./);
  assert.match(comment, /screenshot, short video, terminal output/);
  assert.match(comment, /ClawSweeper or a maintainer can re-check it/);
  assert.doesNotMatch(comment, /@clawsweeper re-review/);
});

test("ClawSweeper PR rating labels use one themed overall label", () => {
  assert.deepEqual(prRatingLabelsForTest(["bug"], "A"), ["bug", "rating: 🦞 diamond lobster"]);
  assert.deepEqual(
    prRatingLabelsForTest(["rating: 🦀 challenger crab", "bug", "rating: 🦐 gold shrimp"], "D"),
    ["bug", "rating: 🦪 silver shellfish"],
  );
  assert.deepEqual(prRatingLabelsForTest(["bug"], "bogus"), [
    "bug",
    "rating: 🌊 off-meta tidepool",
  ]);
});

test("ClawSweeper PR rating label scheme exposes boring internal tiers", () => {
  assert.deepEqual(
    prRatingLabelSchemeForTest().map(({ tier, name, color }) => ({ tier, name, color })),
    [
      { tier: "S", name: "rating: 🦀 challenger crab", color: "1F883D" },
      { tier: "A", name: "rating: 🦞 diamond lobster", color: "0969DA" },
      { tier: "B", name: "rating: 🐚 platinum hermit", color: "0F766E" },
      { tier: "C", name: "rating: 🦐 gold shrimp", color: "B7791F" },
      { tier: "D", name: "rating: 🦪 silver shellfish", color: "7A828E" },
      { tier: "F", name: "rating: 🧂 unranked krab", color: "8C2F39" },
      { tier: "NA", name: "rating: 🌊 off-meta tidepool", color: "6E7781" },
    ],
  );
});

test("ClawSweeper feature showcase label is positive-only and high signal", () => {
  assert.deepEqual(
    featureShowcaseLabelsForTest(["enhancement"], {
      itemCategory: "feature",
      status: "showcase",
      securityReviewStatus: "cleared",
      overallCorrectness: "patch is correct",
    }),
    ["enhancement", "feature: ✨ showcase"],
  );
  assert.deepEqual(
    featureShowcaseLabelsForTest(["enhancement"], {
      itemCategory: "feature",
      status: "none",
      securityReviewStatus: "cleared",
      overallCorrectness: "patch is correct",
    }),
    ["enhancement"],
  );
  assert.deepEqual(
    featureShowcaseLabelsForTest(["feature: ✨ showcase"], {
      itemCategory: "feature",
      status: "none",
      securityReviewStatus: "cleared",
      overallCorrectness: "patch is correct",
    }),
    ["feature: ✨ showcase"],
  );
});

test("ClawSweeper feature showcase label does not apply to unsafe or non-feature PRs", () => {
  assert.deepEqual(
    featureShowcaseLabelsForTest(["bug"], {
      itemCategory: "bug",
      status: "showcase",
      securityReviewStatus: "cleared",
      overallCorrectness: "patch is correct",
    }),
    ["bug"],
  );
  assert.deepEqual(
    featureShowcaseLabelsForTest(["enhancement"], {
      itemCategory: "feature",
      status: "showcase",
      securityReviewStatus: "needs_attention",
      overallCorrectness: "patch is correct",
    }),
    ["enhancement"],
  );
  assert.deepEqual(
    featureShowcaseLabelsForTest(["enhancement"], {
      itemCategory: "feature",
      status: "showcase",
      securityReviewStatus: "cleared",
      overallCorrectness: "patch is incorrect",
    }),
    ["enhancement"],
  );
});

test("ClawSweeper PR status labels use one current workflow status", () => {
  assert.deepEqual(
    prStatusLabelsForTest(["bug", "status: ⏳ waiting on author"], {
      findingPriorities: [2],
      hasRecentAuthorActivity: true,
    }),
    ["bug", "status: 🛠️ actively grinding"],
  );
  assert.deepEqual(
    prStatusLabelsForTest(["bug", "status: 🛠️ actively grinding"], {
      proofStatus: "sufficient",
      overallCorrectness: "patch is correct",
    }),
    ["bug", "status: 👀 ready for maintainer look"],
  );
});

test("ClawSweeper PR status labels preserve other label families", () => {
  assert.deepEqual(
    prStatusLabelsForTest(
      [
        "rating: 🦞 diamond lobster",
        "merge-risk: 🚨 compatibility",
        "proof: sufficient",
        "status: custom-user-label",
      ],
      {
        proofStatus: "missing",
      },
    ),
    [
      "rating: 🦞 diamond lobster",
      "merge-risk: 🚨 compatibility",
      "proof: sufficient",
      "status: custom-user-label",
      "status: 📣 needs proof",
    ],
  );
});

test("ClawSweeper PR status labels respect priority ordering", () => {
  assert.deepEqual(
    prStatusLabelsForTest(["clawsweeper:automerge"], {
      proofStatus: "missing",
      hasRecentReReviewRequest: true,
    }),
    ["clawsweeper:automerge", "status: 🚀 automerge armed"],
  );
  assert.deepEqual(
    prStatusLabelsForTest([], {
      proofStatus: "missing",
      hasRecentAuthorActivity: true,
      hasRecentReReviewRequest: true,
    }),
    ["status: 🔁 re-review loop"],
  );
  assert.deepEqual(
    prStatusLabelsForTest([], {
      proofStatus: "missing",
      hasRecentAuthorActivity: true,
    }),
    ["status: 🛠️ actively grinding"],
  );
  assert.deepEqual(
    prStatusLabelsForTest([], {
      proofStatus: "missing",
    }),
    ["status: 📣 needs proof"],
  );
  assert.deepEqual(
    prStatusLabelsForTest([], {
      findingPriorities: [2],
    }),
    ["status: ⏳ waiting on author"],
  );
});

test("ClawSweeper PR status ignores bot-authored re-review guidance", () => {
  assert.deepEqual(
    prStatusLabelsForTest([], {
      proofStatus: "missing",
      reviewedAt: "2026-01-01T00:00:00Z",
      comments: [
        {
          author: "openclaw-clawsweeper[bot]",
          body: "After adding proof, comment `@clawsweeper re-review`.",
          updatedAt: "2026-01-01T00:01:00Z",
        },
      ],
    }),
    ["status: 📣 needs proof"],
  );
  assert.deepEqual(
    prStatusLabelsForTest([], {
      proofStatus: "missing",
      reviewedAt: "2026-01-01T00:00:00Z",
      comments: [
        {
          author: "contributor",
          body: "@clawsweeper re-review",
          createdAt: "2026-01-01T00:01:00Z",
        },
      ],
    }),
    ["status: 🔁 re-review loop"],
  );
});

test("ClawSweeper PR status treats maintainer-only rank-up moves as ready", () => {
  assert.deepEqual(
    prStatusLabelsForTest([], {
      nextSteps: [
        "Maintainer accepts the relative details.reportPath contract change before merge.",
      ],
      proofStatus: "sufficient",
      overallCorrectness: "patch is correct",
    }),
    ["status: 👀 ready for maintainer look"],
  );
});

test("ClawSweeper PR status labels are PR-only", () => {
  assert.deepEqual(
    prStatusLabelsForTest(["bug", "status: ⏳ waiting on author"], {
      isPullRequest: false,
      nextSteps: ["Add proof."],
    }),
    ["bug"],
  );
});

test("ClawSweeper PR status label scheme exposes workflow states", () => {
  assert.deepEqual(
    prStatusLabelSchemeForTest().map(({ kind, name, color }) => ({ kind, name, color })),
    [
      { kind: "automerge_armed", name: "status: 🚀 automerge armed", color: "0E8A16" },
      { kind: "re_review_loop", name: "status: 🔁 re-review loop", color: "8250DF" },
      { kind: "actively_grinding", name: "status: 🛠️ actively grinding", color: "0969DA" },
      { kind: "needs_proof", name: "status: 📣 needs proof", color: "D93F0B" },
      {
        kind: "needs_maintainer_proof_decision",
        name: "status: needs maintainer proof decision",
        color: "D93F0B",
      },
      { kind: "waiting_on_author", name: "status: ⏳ waiting on author", color: "FBCA04" },
      {
        kind: "ready_for_maintainer_look",
        name: "status: 👀 ready for maintainer look",
        color: "2DA44E",
      },
    ],
  );
});

test("ClawSweeper Telegram proof judgement controls the Mantis proof label", () => {
  assert.deepEqual(telegramVisibleProofLabelsForTest(["channel: telegram"], "needed"), [
    "channel: telegram",
    "mantis: telegram-visible-proof",
  ]);
  assert.deepEqual(
    telegramVisibleProofLabelsForTest(
      ["channel: telegram", "mantis: telegram-visible-proof"],
      "not_needed",
    ),
    ["channel: telegram"],
  );
});

test("ClawSweeper priority label scheme exposes P0 through P3 labels", () => {
  assert.deepEqual(priorityLabelSchemeForTest(), [
    {
      name: "P0",
      color: "B60205",
      description: "Emergency: data loss, security bypass, crash loop, or unusable core runtime.",
    },
    {
      name: "P1",
      color: "D93F0B",
      description: "Urgent regression or broken agent/channel workflow affecting real users now.",
    },
    {
      name: "P2",
      color: "FBCA04",
      description: "Normal priority bug or improvement with limited blast radius.",
    },
    {
      name: "P3",
      color: "8C959F",
      description: "Low-risk cleanup, docs, polish, ergonomics, or speculative feature.",
    },
  ]);
});

test("ClawSweeper priority label descriptions fit GitHub label limits", () => {
  for (const label of priorityLabelSchemeForTest()) {
    assert.ok(
      label.description.length <= 100,
      `${label.name} description is ${label.description.length} characters`,
    );
  }
});

test("ClawSweeper priority label descriptions stay aligned with prompt and schema", () => {
  const schema = JSON.parse(reviewDecisionSchemaText()) as {
    properties?: {
      triagePriority?: {
        description?: string;
      };
    };
  };
  const schemaDescription = schema.properties?.triagePriority?.description ?? "";
  const prompt = reviewPromptTemplate();
  for (const label of priorityLabelSchemeForTest()) {
    assert.ok(
      prompt.includes(`\`${label.name}\`: ${label.description}`),
      `${label.name} description is missing from the review prompt`,
    );
    assert.ok(
      schemaDescription.includes(`${label.name}: ${label.description}`),
      `${label.name} description is missing from the schema`,
    );
  }
});

test("review prompt keeps unrelated CI noise out of triage priority", () => {
  const schema = JSON.parse(reviewDecisionSchemaText()) as {
    properties?: {
      triagePriority?: {
        description?: string;
      };
    };
  };
  const schemaDescription = schema.properties?.triagePriority?.description ?? "";
  const prompt = reviewPromptTemplate();

  assert.match(prompt, /Do not raise `triagePriority` solely because CI or status checks/);
  assert.match(
    prompt,
    /failing,\s+pending,\s+missing,\s+flaky,\s+or require routine maintainer follow-up/,
  );
  assert.match(prompt, /PR diff plausibly caused an urgent regression/);
  assert.match(schemaDescription, /Do not raise priority solely because CI or status checks/);
  assert.match(schemaDescription, /diff-caused urgent regressions/);
});

test("ClawSweeper priority labels follow triage priority", () => {
  assert.deepEqual(priorityLabelsForTest(["bug"], "P2"), ["bug", "P2"]);
  assert.deepEqual(priorityLabelsForTest(["bug", "P3"], "P1"), ["bug", "P1"]);
  assert.deepEqual(priorityLabelsForTest(["P0", "bug"], "none"), ["bug"]);
});

test("ClawSweeper label justifications render selected label reasons", () => {
  assert.equal(
    labelJustificationsMarkdownForTest([
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
    [
      "- `P1`: The PR changes an active channel workflow affecting real users.",
      "- `impact:message-loss`: The diff touches message retry and delivery ordering.",
      "- `merge-risk: 🚨 compatibility`: Merging changes the default upgrade behavior for existing configs.",
    ].join("\n"),
  );
});

test("ClawSweeper impact label scheme exposes owned impact labels", () => {
  assert.deepEqual(impactLabelSchemeForTest(), [
    {
      name: "impact:data-loss",
      color: "B60205",
      description:
        "This issue is about lost, corrupted, or silently dropped user/session/config data.",
    },
    {
      name: "impact:security",
      color: "B60205",
      description:
        "This issue is about security boundaries, credentials, authz, sandboxing, or sensitive data.",
    },
    {
      name: "impact:crash-loop",
      color: "D93F0B",
      description:
        "This issue is about crashes, hangs, restart loops, or process-level availability.",
    },
    {
      name: "impact:message-loss",
      color: "D93F0B",
      description:
        "This issue is about lost, duplicated, misrouted, or suppressed channel messages.",
    },
    {
      name: "impact:session-state",
      color: "F9D65C",
      description:
        "This issue is about session, memory, transcript, context, or agent state drift.",
    },
    {
      name: "impact:auth-provider",
      color: "F9D65C",
      description:
        "This issue is about auth, provider routing, model choice, or SecretRef resolution.",
    },
    {
      name: "impact:other",
      color: "C5DEF5",
      description:
        "This issue has meaningful maintainer-visible impact outside the owned taxonomy.",
    },
  ]);
});

test("ClawSweeper impact label descriptions fit GitHub label limits", () => {
  for (const label of impactLabelSchemeForTest()) {
    assert.ok(
      label.description.length <= 100,
      `${label.name} description is ${label.description.length} characters`,
    );
  }
});

test("ClawSweeper impact label descriptions stay aligned with prompt and schema", () => {
  const schema = JSON.parse(reviewDecisionSchemaText()) as {
    properties?: {
      impactLabels?: {
        description?: string;
      };
    };
  };
  const schemaDescription = schema.properties?.impactLabels?.description ?? "";
  const prompt = reviewPromptTemplate();
  for (const label of impactLabelSchemeForTest()) {
    assert.ok(
      prompt.includes(`\`${label.name}\`: ${label.description}`),
      `${label.name} description is missing from the review prompt`,
    );
    assert.ok(
      schemaDescription.includes(`${label.name}: ${label.description}`),
      `${label.name} description is missing from the schema`,
    );
  }
});

test("ClawSweeper impact label schema avoids unsupported response-format keywords", () => {
  const schema = JSON.parse(reviewDecisionSchemaText()) as {
    properties?: {
      impactLabels?: Record<string, unknown>;
    };
  };
  assert.equal(schema.properties?.impactLabels?.uniqueItems, undefined);
});

test("ClawSweeper merge-risk label scheme exposes PR-only merge warning labels", () => {
  assert.deepEqual(mergeRiskLabelSchemeForTest(), [
    {
      name: "merge-risk: 🚨 compatibility",
      color: "D1242F",
      description:
        "🚨 Merging this PR could break existing users, config, migrations, defaults, or upgrades.",
    },
    {
      name: "merge-risk: 🚨 message-delivery",
      color: "D1242F",
      description:
        "🚨 Merging this PR could drop, duplicate, misroute, suppress, or wrongly target messages.",
    },
    {
      name: "merge-risk: 🚨 session-state",
      color: "F97316",
      description:
        "🚨 Merging this PR could lose, corrupt, stale, or mis-associate session or agent state.",
    },
    {
      name: "merge-risk: 🚨 auth-provider",
      color: "F97316",
      description:
        "🚨 Merging this PR could break OAuth, tokens, provider routing, model choice, or credentials.",
    },
    {
      name: "merge-risk: 🚨 security-boundary",
      color: "B60205",
      description:
        "🚨 Merging this PR could weaken sandboxing, authorization, credentials, or sensitive data.",
    },
    {
      name: "merge-risk: 🚨 availability",
      color: "D93F0B",
      description:
        "🚨 Merging this PR could cause crashes, hangs, restart loops, stalls, or process outages.",
    },
    {
      name: "merge-risk: 🚨 automation",
      color: "FBCA04",
      description:
        "🚨 Merging this PR could break CI, automerge, proof capture, label sync, or automation.",
    },
    {
      name: "merge-risk: 🚨 other",
      color: "C5DEF5",
      description: "🚨 Merging this PR has meaningful risk outside the owned taxonomy.",
    },
  ]);
});

test("ClawSweeper merge-risk label descriptions fit GitHub label limits", () => {
  for (const label of mergeRiskLabelSchemeForTest()) {
    assert.ok(
      label.description.length <= 100,
      `${label.name} description is ${label.description.length} characters`,
    );
  }
});

test("ClawSweeper merge-risk label descriptions stay aligned with prompt and schema", () => {
  const schema = JSON.parse(reviewDecisionSchemaText()) as {
    properties?: {
      mergeRiskLabels?: {
        description?: string;
      };
    };
  };
  const schemaDescription = schema.properties?.mergeRiskLabels?.description ?? "";
  const prompt = reviewPromptTemplate();
  for (const label of mergeRiskLabelSchemeForTest()) {
    assert.ok(
      prompt.includes(`\`${label.name}\`: ${label.description}`),
      `${label.name} description is missing from the review prompt`,
    );
    assert.ok(
      schemaDescription.includes(`${label.name}: ${label.description}`),
      `${label.name} description is missing from the schema`,
    );
  }
});

test("review prompt uses automation merge risk only for diff-caused automation risk", () => {
  const schema = JSON.parse(reviewDecisionSchemaText()) as {
    properties?: {
      mergeRiskLabels?: {
        description?: string;
      };
    };
  };
  const schemaDescription = schema.properties?.mergeRiskLabels?.description ?? "";
  const prompt = reviewPromptTemplate();

  assert.match(prompt, /Do not use `merge-risk: 🚨 automation` only because CI is red/);
  assert.match(prompt, /pending,\s+flaky,\s+or absent/);
  assert.match(prompt, /PR diff changes automation behavior/);
  assert.match(prompt, /plausibly causes CI,\s+automerge,\s+proof capture,\s+label sync/);
  assert.match(schemaDescription, /Do not use merge-risk: 🚨 automation only because CI is red/);
  assert.match(schemaDescription, /PR diff changes automation behavior/);
});

test("ClawSweeper merge-risk labels remove stale owned labels and preserve unrelated labels", () => {
  assert.deepEqual(
    mergeRiskLabelsForTest(
      ["bug", "merge-risk: 🚨 compatibility", "merge-risk: 🚨 availability", "impact:message-loss"],
      ["merge-risk: 🚨 message-delivery", "merge-risk: 🚨 other", "not-a-merge-risk-label"],
    ),
    ["bug", "impact:message-loss", "merge-risk: 🚨 message-delivery", "merge-risk: 🚨 other"],
  );
  assert.deepEqual(mergeRiskLabelsForTest(["bug", "merge-risk: 🚨 auth-provider"], []), ["bug"]);
});

test("ClawSweeper impact labels remove stale owned labels and preserve unrelated labels", () => {
  assert.deepEqual(
    impactLabelsForTest(
      ["bug", "impact:data-loss", "impact:security", "proof: sufficient", "P1"],
      ["impact:message-loss", "impact:other", "not-an-impact-label"],
    ),
    ["bug", "proof: sufficient", "P1", "impact:message-loss", "impact:other"],
  );
  assert.deepEqual(impactLabelsForTest(["bug", "impact:auth-provider"], []), ["bug"]);
});

test("ClawSweeper impact labels do not alter PR review finding priorities", () => {
  const decision = parseDecision(
    closeDecision({
      impactLabels: ["impact:data-loss", "impact:security"],
      labelJustifications: [
        {
          label: "P2",
          reason: "Normal priority applies to this limited-scope implemented behavior check.",
        },
        {
          label: "impact:data-loss",
          reason: "The selected labels include a data-loss impact classification.",
        },
        {
          label: "impact:security",
          reason: "The selected labels include a security impact classification.",
        },
      ],
      reviewFindings: [
        {
          title: "A concrete review finding",
          body: "This remains a PR review finding priority, not an impact label.",
          priority: 1,
          confidenceScore: 0.9,
          file: "src/example.ts",
          lineStart: 10,
          lineEnd: 10,
        },
      ],
    }),
  );
  assert.deepEqual(decision.impactLabels, ["impact:data-loss", "impact:security"]);
  assert.equal(decision.reviewFindings[0]?.priority, 1);
});

test("ClawSweeper issue advisory labels expose high-confidence reproduction state", () => {
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      reproductionStatus: "reproduced",
      reproductionConfidence: "high",
    }),
    ["bug", "issue-rating: 🦀 challenger crab", "clawsweeper:current-main-repro"],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      reproductionStatus: "source_reproducible",
      reproductionConfidence: "high",
    }),
    ["bug", "issue-rating: 🦞 diamond lobster", "clawsweeper:source-repro"],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      reproductionStatus: "reproduced",
      reproductionConfidence: "medium",
    }),
    ["bug", "issue-rating: 🐚 platinum hermit"],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      reproductionStatus: "not_reproduced",
      reproductionConfidence: "high",
    }),
    ["bug", "issue-rating: 🦪 silver shellfish", "clawsweeper:not-repro-on-main"],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      reproductionStatus: "source_reproducible",
      reproductionConfidence: "medium",
    }),
    ["bug", "issue-rating: 🐚 platinum hermit", "clawsweeper:needs-live-repro"],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      reproductionStatus: "unclear",
      reproductionConfidence: "low",
    }),
    ["bug", "issue-rating: 🦪 silver shellfish", "clawsweeper:needs-info"],
  );
});

test("ClawSweeper issue advisory labels expose work-lane routing state", () => {
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["clawsweeper"], {
      type: "issue",
      workCandidate: "queue_fix_pr",
      workStatus: "candidate",
      workConfidence: "high",
      hasWorkShape: true,
    }),
    [
      "clawsweeper",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:queueable-fix",
      "clawsweeper:fix-shape-clear",
    ],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["clawsweeper"], {
      type: "issue",
      workCandidate: "queue_fix_pr",
      workStatus: "candidate",
      workConfidence: "medium",
    }),
    ["clawsweeper", "issue-rating: 🧂 unranked krab"],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["clawsweeper"], {
      type: "issue",
      workCandidate: "manual_review",
    }),
    [
      "clawsweeper",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:no-new-fix-pr",
      "clawsweeper:needs-maintainer-review",
    ],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["clawsweeper"], {
      type: "issue",
      workStatus: "manual_review",
    }),
    [
      "clawsweeper",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:no-new-fix-pr",
      "clawsweeper:needs-maintainer-review",
    ],
  );
});

test("ClawSweeper issue advisory labels expose linked PR and human decision blockers", () => {
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      hasOpenLinkedPullRequest: true,
    }),
    [
      "bug",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:linked-pr-open",
      "clawsweeper:no-new-fix-pr",
    ],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      requiresProductDecision: true,
    }),
    [
      "bug",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:no-new-fix-pr",
      "clawsweeper:needs-product-decision",
    ],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      securityReviewStatus: "needs_attention",
    }),
    [
      "bug",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:no-new-fix-pr",
      "clawsweeper:needs-security-review",
    ],
  );
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "issue",
      itemCategory: "security",
    }),
    [
      "bug",
      "issue-rating: 🧂 unranked krab",
      "clawsweeper:no-new-fix-pr",
      "clawsweeper:needs-security-review",
    ],
  );
});

test("ClawSweeper issue advisory labels remove stale owned labels and preserve other labels", () => {
  assert.deepEqual(
    issueAdvisoryLabelsForTest(
      [
        "bug",
        "clawsweeper:source-repro",
        "clawsweeper:not-repro-on-main",
        "clawsweeper:needs-live-repro",
        "clawsweeper:needs-info",
        "clawsweeper:linked-pr-open",
        "clawsweeper:no-new-fix-pr",
        "clawsweeper:queueable-fix",
        "clawsweeper:fix-shape-clear",
        "clawsweeper:needs-product-decision",
        "clawsweeper:needs-security-review",
        "issue-rating: 🦞 diamond lobster",
        "issue-rating: 🌊 off-meta tidepool",
        "clawsweeper:autofix",
        "clawsweeper:automerge",
        "clawsweeper:human-review",
        "clawsweeper:merge-ready",
        "proof: sufficient",
        "mantis: telegram-visible-proof",
      ],
      {
        type: "issue",
        reproductionStatus: "reproduced",
        reproductionConfidence: "high",
      },
    ),
    [
      "bug",
      "clawsweeper:autofix",
      "clawsweeper:automerge",
      "clawsweeper:human-review",
      "clawsweeper:merge-ready",
      "proof: sufficient",
      "mantis: telegram-visible-proof",
      "issue-rating: 🦀 challenger crab",
      "clawsweeper:current-main-repro",
    ],
  );
});

test("ClawSweeper issue advisory labels do not apply to pull requests", () => {
  assert.deepEqual(
    issueAdvisoryLabelsForTest(["bug"], {
      type: "pull_request",
      reproductionStatus: "reproduced",
      reproductionConfidence: "high",
      workCandidate: "queue_fix_pr",
      workStatus: "candidate",
      workConfidence: "high",
      hasOpenLinkedPullRequest: true,
      requiresProductDecision: true,
      securityReviewStatus: "needs_attention",
      hasWorkShape: true,
    }),
    ["bug"],
  );
});

test("review workflow gives Codex a read-only inspection token", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const eventReviewJobStart = workflow.indexOf("\n  event-review-apply:");
  const planJobStart = workflow.indexOf("\n  plan:", eventReviewJobStart);
  const eventReviewJob = workflow.slice(eventReviewJobStart, planJobStart);
  const reviewJobStart = workflow.indexOf("\n  review:");
  const publishJobStart = workflow.indexOf("\n  publish:", reviewJobStart);
  const reviewJob = workflow.slice(reviewJobStart, publishJobStart);
  const exactReviewStart = eventReviewJob.indexOf("- name: Review exact event item");
  const stateTokenStart = eventReviewJob.indexOf("- name: Create state token", exactReviewStart);
  const exactReviewStep = eventReviewJob.slice(exactReviewStart, stateTokenStart);

  assert.match(workflow, /id: codex-inspection-token/);
  assert.match(workflow, /permission-issues: read/);
  assert.match(workflow, /CLAWSWEEPER_PROOF_INSPECTION_TOKEN/);
  assert.match(
    exactReviewStep,
    /CLAWSWEEPER_PROOF_INSPECTION_TOKEN: \$\{\{ steps\.target-read-token\.outputs\.token \|\| github\.token \}\}/,
  );
  assert.match(reviewJob, /uses: \.\/clawsweeper\/\.github\/actions\/setup-codex/);
  assert.doesNotMatch(reviewJob, /uses: \.\/\.github\/actions\/setup-codex/);
});

test("dashboard syncs Worker secrets without rewriting KV-backed settings", () => {
  const workflow = readFileSync(".github/workflows/dashboard.yml", "utf8");

  assert.match(workflow, /workers\/scripts\/\$CLOUDFLARE_WORKER_NAME\/secrets-bulk/);
  assert.match(workflow, /Content-Type: application\/merge-patch\+json/);
  assert.match(workflow, /jq -e '\.success == true'/);
  assert.doesNotMatch(workflow, /wrangler@4\.90\.0 secret bulk/);
});

test("publish workflow installs Codex from the root checkout path", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const publishJobStart = workflow.indexOf("\n  publish:");
  const recoverJobStart = workflow.indexOf("\n  recover-review-failures:", publishJobStart);
  const publishJob = workflow.slice(publishJobStart, recoverJobStart);

  assert.match(publishJob, /uses: \.\/\.github\/actions\/setup-codex/);
  assert.doesNotMatch(publishJob, /uses: \.\/clawsweeper\/\.github\/actions\/setup-codex/);
  const setupCodexStart = publishJob.indexOf("- uses: ./.github/actions/setup-codex");
  const syncCommentsStart = publishJob.indexOf("- name: Sync selected review comments");
  const applySelectedStart = publishJob.indexOf("- name: Apply selected safe close proposals");
  assert.ok(setupCodexStart > syncCommentsStart);
  assert.ok(applySelectedStart > setupCodexStart);
  assert.match(
    publishJob.slice(setupCodexStart, applySelectedStart),
    /if: \$\{\{ success\(\) && steps\.target-write-token\.outputs\.token != '' && github\.event\.inputs\.apply_after_review == 'true' \}\}/,
  );
});

test("apply workflow installs Codex only when proof-eligible apply work can run", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const applyJobStart = workflow.indexOf("\n  apply-existing:");
  assert.notEqual(applyJobStart, -1);
  const applyJob = workflow.slice(applyJobStart);
  const reconcileStart = applyJob.indexOf("- name: Reconcile before apply preselect");
  const preselectStart = applyJob.indexOf("- name: Preselect apply work that can need Codex");
  const setupCodexStart = applyJob.indexOf("- uses: ./.github/actions/setup-codex", preselectStart);
  const applyStart = applyJob.indexOf(
    "- name: Apply unchanged proposed decisions with checkpoints",
  );

  assert.ok(reconcileStart !== -1);
  assert.ok(preselectStart !== -1);
  assert.ok(preselectStart > reconcileStart);
  assert.ok(setupCodexStart > preselectStart);
  assert.ok(applyStart > setupCodexStart);
  const reconcileBlock = applyJob.slice(reconcileStart, preselectStart);
  assert.match(reconcileBlock, /GH_TOKEN: \$\{\{ steps\.target-write-token\.outputs\.token \}\}/);
  assert.match(reconcileBlock, /pnpm run reconcile -- "\$\{reconcile_args\[@\]\}"/);
  assert.match(
    applyJob.slice(setupCodexStart, applyStart),
    /if: \$\{\{ steps\.apply-preselect\.outputs\.needs_codex == 'true' \}\}/,
  );
  const preselectBlock = applyJob.slice(preselectStart, setupCodexStart);
  assert.match(preselectBlock, /\[ "\$sync_comments_only" = "true" \]/);
  assert.match(preselectBlock, /comment-sync-batch/);
  assert.match(preselectBlock, /batch_count="\$\(awk -F=/);
  const syncOnlyStart = preselectBlock.indexOf('if [ "$sync_comments_only" = "true" ]; then');
  const nonSyncStart = preselectBlock.indexOf("\n          else\n            proof_args=(");
  assert.ok(syncOnlyStart !== -1);
  assert.ok(nonSyncStart > syncOnlyStart);
  assert.doesNotMatch(preselectBlock.slice(syncOnlyStart, nonSyncStart), /needs_codex=true/);
  assert.match(preselectBlock, /\[ -n "\$item_numbers" \]/);
  assert.match(preselectBlock, /proposed-pr-close-coverage-item-numbers/);
  assert.match(preselectBlock, /proof_args\+=\(--item-numbers "\$item_numbers"\)/);
  assert.match(preselectBlock, /if \[ -n "\$selected" \]; then\s+needs_codex=true/);
  assert.doesNotMatch(preselectBlock, /if \[ -n "\$item_numbers" \]; then\s+needs_codex=true/);
  assert.doesNotMatch(preselectBlock, /normalized_apply_close_reasons=/);
});

test("sweep target tokens fall back when an org app installation is missing", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const stepBlocks = (name: string) =>
    workflow
      .split(`- name: ${name}`)
      .slice(1)
      .map((block) => block.split("\n      - ")[0]);

  assert.match(
    workflow,
    /CLAWSWEEPER_INVENTORY_TOKEN_STEIPETE: \$\{\{ steps\.steipete-token\.outputs\.token \|\| '__public__' \}\}/,
  );
  const openclawInventoryBlocks = stepBlocks("Create OpenClaw inventory token");
  assert.equal(openclawInventoryBlocks.length, 1);
  assert.doesNotMatch(openclawInventoryBlocks[0] ?? "", /continue-on-error: true/);
  for (const name of [
    "Create target read token",
    "Create target write token",
    "Create target review token",
    "Create target Codex inspection token",
  ]) {
    const blocks = stepBlocks(name);
    assert.ok(blocks.length > 0, `missing workflow step: ${name}`);
    for (const block of blocks) {
      assert.match(block, /continue-on-error: true/);
    }
  }
  assert.match(
    workflow,
    /GH_TOKEN: \$\{\{ steps\.target-read-token\.outputs\.token \|\| github\.token \}\}/,
  );
  assert.match(
    workflow,
    /CLAWSWEEPER_PROOF_INSPECTION_TOKEN: \$\{\{ steps\.codex-inspection-token\.outputs\.token \|\| github\.token \}\}/,
  );
  assert.ok(
    workflow.includes(
      "if: ${{ success() && steps.target-write-token.outputs.token != '' && needs.plan.outputs.hot_intake != 'true'",
    ),
  );
  assert.ok(
    workflow.includes(
      "if: ${{ success() && steps.target-write-token.outputs.token != '' && ((github.event_name == 'repository_dispatch'",
    ),
  );
  assert.ok(
    workflow.includes(
      "if: ${{ success() && steps.target-write-token.outputs.token != '' && github.event.inputs.apply_after_review == 'true' }}",
    ),
  );
  assert.doesNotMatch(workflow, new RegExp("OPENCLAW_" + "GH_TOKEN"));
});

test("proof nudge workflow is manual-first and scheduled behind repo vars", () => {
  const sweepWorkflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const workflow = readFileSync(".github/workflows/proof-nudges.yml", "utf8");
  const job = workflow.slice(workflow.indexOf("  proof-nudges:"), workflow.length);
  const concurrency = workflow.slice(workflow.indexOf("concurrency:"), workflow.indexOf("\njobs:"));

  assert.doesNotMatch(sweepWorkflow, /proof_nudges/);
  assert.match(workflow, /execute:[\s\S]*?default: "false"/);
  assert.match(workflow, /cron: "0 10 \* \* \*"/);
  assert.doesNotMatch(workflow, /cron: "0 11 \* \* \*"/);
  assert.match(concurrency, /clawsweeper-proof-nudges/);
  assert.doesNotMatch(job, /Check scheduled Central time/);
  assert.doesNotMatch(job, /PROOF_NUDGES_SCHEDULE_TZ/);
  assert.doesNotMatch(job, /PROOF_NUDGES_EVENT_SCHEDULE/);
  assert.doesNotMatch(job, /steps\.central-time\.outputs\.should_run == 'true'/);
  assert.match(job, /github\.event_name == 'workflow_dispatch'/);
  assert.match(job, /vars\.CLAWSWEEPER_PROOF_NUDGES_SCHEDULED == '1'/);
  assert.match(job, /vars\.CLAWSWEEPER_BOT_PROOF_SCHEDULED == '1'/);
  assert.match(job, /vars\.CLAWSWEEPER_PROOF_NUDGES_EXECUTE == '1'/);
  assert.match(job, /vars\.CLAWSWEEPER_BOT_PROOF_EXECUTE == '1'/);
  assert.match(
    job,
    /github\.event_name == 'schedule' && \(vars\.CLAWSWEEPER_PROOF_NUDGES_SCHEDULED == '1' \|\| vars\.CLAWSWEEPER_BOT_PROOF_SCHEDULED == '1'\)/,
  );
  assert.match(job, /TARGET_REPO_INPUT:/);
  assert.match(job, /target_repo must be owner\/repo/);
  assert.match(job, /PROOF_NUDGES_ITEM_NUMBERS:/);
  assert.match(job, /item_numbers must be a comma-separated list/);
  assert.match(job, /PROOF_NUDGES_LIMIT:/);
  assert.match(job, /PROOF_NUDGES_MIN_AGE_DAYS:/);
  assert.match(job, /PROOF_NUDGES_COOLDOWN_DAYS:/);
  assert.match(job, /permission-pull-requests: write/);
  assert.match(
    job,
    /numeric_input in PROOF_NUDGES_LIMIT PROOF_NUDGES_MIN_AGE_DAYS PROOF_NUDGES_COOLDOWN_DAYS/,
  );
  assert.match(job, /execute_arg=\(\)/);
  assert.match(job, /if \[ "\$PROOF_NUDGES_EXECUTE" = "true" \]/);
  assert.match(job, /pnpm run proof-nudges/);
  assert.match(job, /vars\.CLAWSWEEPER_PROOF_NUDGES_LIMIT/);
});

test("read-only checkout mode restores file modes and leaves git metadata writable", () => {
  const root = mkdtempSync(tmpPrefix);
  try {
    const target = join(root, "target");
    const nested = join(target, "src");
    const gitDir = join(target, ".git");
    mkdirSync(nested, { recursive: true });
    mkdirSync(gitDir, { recursive: true });
    const sourceFile = join(nested, "app.ts");
    const executableFile = join(target, "tool.sh");
    const gitConfig = join(gitDir, "config");
    writeFileSync(sourceFile, "export const value = 1;\n");
    writeFileSync(executableFile, "#!/bin/sh\n");
    writeFileSync(gitConfig, "[core]\n");
    chmodSync(target, 0o755);
    chmodSync(nested, 0o750);
    chmodSync(sourceFile, 0o640);
    chmodSync(executableFile, 0o755);
    chmodSync(gitDir, 0o700);
    chmodSync(gitConfig, 0o600);

    const snapshots = makeTreeReadOnlyForTest(target);
    assert.equal(statSync(target).mode & 0o777, 0o555);
    assert.equal(statSync(nested).mode & 0o777, 0o555);
    assert.equal(statSync(sourceFile).mode & 0o777, 0o444);
    assert.equal(statSync(executableFile).mode & 0o777, 0o555);
    assert.equal(statSync(gitDir).mode & 0o777, 0o700);
    assert.equal(statSync(gitConfig).mode & 0o777, 0o600);

    restoreTreeModesForTest(snapshots);
    assert.equal(statSync(target).mode & 0o777, 0o755);
    assert.equal(statSync(nested).mode & 0o777, 0o750);
    assert.equal(statSync(sourceFile).mode & 0o777, 0o640);
    assert.equal(statSync(executableFile).mode & 0o777, 0o755);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("event review completion removes ClawSweeper eyes reaction", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const block = workflow.slice(
    workflow.indexOf("- name: React to target item completion"),
    workflow.indexOf("\n\n  plan:"),
  );

  assert.match(block, /-f content="\+1"/);
  assert.match(block, /-f content="eyes"/);
  assert.match(block, /repos\/\$TARGET_REPO\/issues\/\$ITEM_NUMBER\/reactions\/\$reaction_id/);
  assert.match(block, /"openclaw-clawsweeper\[bot\]"/);
  assert.doesNotMatch(block, /issues\/comments\/\$ITEM_NUMBER\/reactions/);
});

test("event re-review status explains superseded cancellations", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const block = workflow.slice(
    workflow.indexOf("- name: Mark re-review complete"),
    workflow.indexOf("- name: Commit event comment router ledger"),
  );

  assert.match(block, /\[ "\$REVIEW_OUTCOME" = "cancelled" \]/);
  assert.match(block, /state="Superseded"/);
  assert.match(block, /A newer re-review for this item started before this run finished/);
  assert.doesNotMatch(block, /CAPACITY_OUTCOME/);
  assert.doesNotMatch(block, /Capacity wait timed out/);
});

test("event repair retries wait for active worker capacity", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const block = workflow.slice(
    workflow.indexOf("- name: Detect waiting event repair dispatches"),
    workflow.indexOf("- name: Commit event comment router retry ledger"),
  );

  assert.match(block, /--status waiting,active/);
  assert.match(block, /--wait-for-capacity/);
});

test("comment commands keep the router-to-sweep dispatch contract", () => {
  const routerWorkflow = readFileSync(".github/workflows/repair-comment-router.yml", "utf8");
  const sweepWorkflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const routerSource = readFileSync("src/repair/comment-router.ts", "utf8");

  assert.match(routerWorkflow, /types:\s*\[clawsweeper_comment\]/);
  assert.match(routerWorkflow, /pnpm run repair:comment-router/);
  assert.match(
    routerWorkflow,
    /status_comment_id="\$\{\{ github\.event\.client_payload\.status_comment_id \|\| '' \}\}"/,
  );
  assert.match(routerWorkflow, /--status-comment-id "\$status_comment_id"/);
  assert.match(routerSource, /event_type:\s*"clawsweeper_item"/);
  assert.match(sweepWorkflow, /types:\s*\[clawsweeper_item,\s*clawsweeper_target_sweep\]/);
  assert.doesNotMatch(sweepWorkflow, /types:\s*\[[^\]]*clawsweeper_comment/);
});

test("comment router prunes bare ack comments after updating shared automerge status", () => {
  const routerSource = readFileSync("src/repair/comment-router.ts", "utf8");
  const postComment = routerSource.slice(
    routerSource.indexOf("function postComment("),
    routerSource.indexOf("\nfunction findExistingCommandStatusComment"),
  );

  assert.match(postComment, /const existingStatus = findExistingCommandStatusComment\(command\);/);
  assert.match(postComment, /const precreated = findPrecreatedCommandStatusComment\(command\);/);
  assert.match(postComment, /const existing = existingStatus \?\? precreated;/);
  assert.match(
    postComment,
    /if \(existingStatus && precreatedId > 0 && precreatedId !== existingId\)/,
  );
  assert.match(postComment, /issues\/comments\/\$\{precreatedId\}/);
  assert.match(postComment, /"DELETE"/);
  assert.match(postComment, /pruned_ack_comment_id: String\(precreatedId\)/);
});

test("manual exact-item review dispatches avoid broad review concurrency", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");

  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && \(github\.event\.inputs\.item_number != '' \|\| github\.event\.inputs\.item_numbers != ''\)\) && format\('clawsweeper-intake-exact-\{0\}'/,
  );
  assert.doesNotMatch(
    workflow,
    /github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.hot_intake == 'true' && \(github\.event\.inputs\.item_number != '' \|\| github\.event\.inputs\.item_numbers != ''\)\) && format\('clawsweeper-intake-exact-\{0\}'/,
  );
});

test("sweep workflow publishes target-scoped state paths", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");

  assert.match(workflow, /target_slug="\$TARGET_REPO"/);
  assert.match(workflow, /--path "records\/\$\{target_slug\}"/);
  assert.match(workflow, /--path "results\/sweep-status\/\$\{target_slug\}\.json"/);
  assert.doesNotMatch(workflow, /--path records\s*\\/);
  assert.doesNotMatch(workflow, /--path results\/sweep-status\s*\\/);
});

test("sweep workflow schedules cursor-based PR comment sync batches", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");

  assert.match(workflow, /cron: "6,21,36,51 \* \* \* \*"/);
  assert.doesNotMatch(workflow, /apply_sync_open_pr_batch:/);
  assert.match(
    workflow,
    /sync_batch_size="\$\{\{ github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.apply_limit \|\| '25' \}\}"/,
  );
  assert.match(workflow, /\$item_numbers" = "__cursor__"/);
  assert.match(workflow, /comment-sync-batch/);
  assert.match(workflow, /write-comment-sync-cursor/);
  assert.match(workflow, /results\/comment-sync-cursors\/\$\{target_slug\}\.json/);
  assert.match(workflow, /APPLY_SYNC_OPEN_PR_BATCH/);
  assert.match(workflow, /github\.event\.schedule == '6,21,36,51 \* \* \* \*'/);
});

test("sweep target checkouts retry without cached references", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const checkoutBlocks =
    workflow.match(/- name: Check out target repository[\s\S]*?rev-parse --short HEAD/g) ?? [];

  assert.equal(checkoutBlocks.length, 2);
  for (const block of checkoutBlocks) {
    assert.match(block, /Cached target repository fetch failed; rebuilding cache/);
    assert.match(block, /Cached target checkout failed; retrying without cache reference/);
    assert.match(block, /rm -rf "\$checkout_dir" "\$cache_dir"/);
    assert.match(
      block,
      /git clone --filter=blob:none --branch "\$target_branch" --single-branch "\$url" "\$checkout_dir"/,
    );
  }
});

test("target sweep runs count as background review capacity", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const capacityBlock = workflow.slice(
    workflow.indexOf("active_sweep_background_workers()"),
    workflow.indexOf(
      'active_critical_workers="$',
      workflow.indexOf("active_sweep_background_workers()"),
    ),
  );

  assert.match(workflow, /Review hot target repo/);
  assert.match(capacityBlock, /startswith\("Review target repo "\)/);
  assert.match(capacityBlock, /startswith\("Review hot target repo "\)/);
  assert.match(capacityBlock, /Review\\ hot\\ target\\ repo/);
});

test("target hot sweep dispatches honor shard cap payload", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const modeBlock = workflow.slice(
    workflow.indexOf("- id: mode"),
    workflow.indexOf("\n      - id: select"),
  );

  assert.match(modeBlock, /elif \[ "\$hot_intake" = "true" \]; then/);
  assert.match(
    modeBlock,
    /shard_count="\$\{\{ github\.event\.client_payload\.shard_count \|\| '' \}\}"/,
  );
  assert.match(modeBlock, /shard_count="\$hot_intake_shards"/);
});

test("review git info follows checked-out target branch", () => {
  const source = readFileSync("src/clawsweeper.ts", "utf8");

  assert.match(source, /function reviewTargetBranch/);
  assert.match(source, /rev-parse", "--abbrev-ref", "HEAD"/);
  assert.match(source, /refs\/remotes\/origin\/\$\{targetBranch\}/);
});

test("sweep workflow_dispatch input count stays under GitHub limit", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8").replace(/\r\n/g, "\n");
  const inputBlock = workflow.slice(
    workflow.indexOf("  workflow_dispatch:\n    inputs:"),
    workflow.indexOf("\n  schedule:"),
  );
  const inputNames = [...inputBlock.matchAll(/^      [A-Za-z0-9_]+:/gm)];

  assert.ok(inputNames.length <= 25, `workflow_dispatch has ${inputNames.length} inputs`);
});

test("sweep review continuations stay workflow-dispatch compatible", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8").replace(/\r\n/g, "\n");
  const continueBlock = workflow.slice(
    workflow.indexOf("- name: Continue sweep"),
    workflow.indexOf("\n\n  recover-review-failures:"),
  );
  const recoveryBlock = workflow.slice(
    workflow.indexOf("args=(\n            workflow run sweep.yml"),
    workflow.indexOf("\n\n  audit-dashboard:"),
  );

  for (const block of [continueBlock, recoveryBlock]) {
    assert.match(block, /-f target_repo="\$\{\{ needs\.plan\.outputs\.target_repo \}\}"/);
    assert.doesNotMatch(block, /-f target_branch=/);
  }
});

test("target sweep dispatches preserve disabled ClawHub guard", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const planHeader = workflow.slice(
    workflow.indexOf("\n  plan:"),
    workflow.indexOf("\n    runs-on:", workflow.indexOf("\n  plan:")),
  );

  assert.match(planHeader, /github\.event\.action == 'clawsweeper_target_sweep'/);
  assert.match(
    planHeader,
    /github\.event_name == 'repository_dispatch' && github\.event\.client_payload\.target_repo == 'openclaw\/clawhub' && vars\.CLAWSWEEPER_ENABLE_CLAWHUB != '1'/,
  );
});

test("sweep planning-started status publish is bounded", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const block = workflow.slice(
    workflow.indexOf("- name: Publish planning-started status"),
    workflow.indexOf("- id: mode"),
  );

  assert.match(block, /timeout 20s pnpm run repair:publish-main/);
  assert.match(block, /Skipped slow planning-started dashboard publish/);
});

test("review capacity probes use REST actions run listing", () => {
  const sweepWorkflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const sweepBlock = sweepWorkflow.slice(
    sweepWorkflow.indexOf("- id: mode"),
    sweepWorkflow.indexOf("- id: select"),
  );
  const commitWorkflow = readFileSync(".github/workflows/commit-review.yml", "utf8");
  const commitBlock = commitWorkflow.slice(
    commitWorkflow.indexOf("- name: Select commits"),
    commitWorkflow.indexOf('if [ "$ENABLED" = "false" ]'),
  );

  for (const block of [sweepBlock, commitBlock]) {
    assert.match(block, /active_runs_json\(\)/);
    assert.match(block, /actions\/runs\?per_page=100/);
    assert.match(block, /status=\$\{run_status\}/);
    assert.match(block, /workflowName:\.name/);
    assert.match(block, /displayTitle:\.display_title/);
    assert.match(block, /createdAt:\.created_at/);
    assert.match(block, /updatedAt:\.updated_at/);
    assert.match(block, /STALE_QUEUED_CUTOFF/);
    assert.doesNotMatch(block, /gh run list/);
  }
});

test("background review capacity reserves expanding matrices and caps broad manual input", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const modeBlock = workflow.slice(
    workflow.indexOf("- id: mode"),
    workflow.indexOf("- id: select"),
  );
  const commitWorkflow = readFileSync(".github/workflows/commit-review.yml", "utf8");
  const commitBlock = commitWorkflow.slice(
    commitWorkflow.indexOf("- name: Select commits"),
    commitWorkflow.indexOf('if [ "$ENABLED" = "false" ]'),
  );

  assert.match(modeBlock, /limit review_shards\.hot_intake_default/);
  assert.match(modeBlock, /limit review_shards\.normal_default/);
  assert.match(modeBlock, /STALE_QUEUED_CUTOFF/);
  assert.match(modeBlock, /updatedAt:\.updated_at/);
  assert.match(modeBlock, /lane_shard_cap="\$normal_shards"/);
  assert.match(modeBlock, /lane_shard_cap="\$hot_intake_shards"/);
  assert.match(modeBlock, /Capping broad background review shards/);
  assert.match(commitBlock, /limit review_shards\.hot_intake_default/);
  assert.match(commitBlock, /limit review_shards\.normal_default/);
  assert.match(commitBlock, /STALE_QUEUED_CUTOFF/);
  assert.match(commitBlock, /updatedAt:\.updated_at/);
});

test("sweep event reviews and target fanout avoid storm amplification", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const eventBlock = workflow.slice(
    workflow.indexOf("event-review-apply:"),
    workflow.indexOf("target-fanout:"),
  );
  const fanoutBlock = workflow.slice(workflow.indexOf("target-fanout:"), workflow.indexOf("plan:"));

  assert.match(eventBlock, /concurrency:/);
  assert.match(
    eventBlock,
    /clawsweeper-event-review-\$\{\{ github\.event\.client_payload\.target_repo/,
  );
  assert.match(eventBlock, /github\.event\.client_payload\.item_number/);
  assert.match(eventBlock, /cancel-in-progress: true/);
  assert.match(
    fanoutBlock,
    /FANOUT_LIMIT: \$\{\{ github\.event\.schedule == '41 \* \* \* \*' && '6' \|\| \(github\.event\.schedule == '37 \*\/6 \* \* \*' && '12' \|\| '6'\) \}\}/,
  );
});

test("setup-state defaults to an auth-safe shallow checkout", () => {
  const action = readFileSync(".github/actions/setup-state/action.yml", "utf8");
  const filterBlock = action.slice(action.indexOf("filter:"), action.indexOf("fetch-depth:"));
  const fetchDepthBlock = action.slice(action.indexOf("fetch-depth:"), action.indexOf("runs:"));

  assert.match(filterBlock, /default: ""/);
  assert.doesNotMatch(filterBlock, /default: blob:none/);
  assert.match(action, /filter: \$\{\{ inputs\.filter \}\}/);
  assert.match(fetchDepthBlock, /default: "1"/);
  assert.doesNotMatch(fetchDepthBlock, /default: "0"/);
  assert.match(action, /fetch-depth: \$\{\{ inputs\.fetch-depth \}\}/);
  assert.match(action, /sparse-checkout: \$\{\{ inputs\.sparse-checkout \}\}/);
  assert.doesNotMatch(action, /state-repository:/);
  assert.doesNotMatch(action, /state-ref:/);
  assert.match(action, /repository: openclaw\/clawsweeper-state/);
  assert.match(action, /ref: state/);
});

test("github activity workflow coalesces noisy observer runs", () => {
  const workflow = readFileSync(".github/workflows/github-activity.yml", "utf8");
  const concurrencyBlock = workflow.slice(
    workflow.indexOf("concurrency:"),
    workflow.indexOf("jobs:"),
  );

  assert.match(concurrencyBlock, /group: >-/);
  assert.match(
    concurrencyBlock,
    /github-activity-\$\{\{ github\.event\.client_payload\.activity\.repo/,
  );
  assert.match(concurrencyBlock, /github\.event\.repository\.full_name/);
  assert.match(concurrencyBlock, /github\.event_name == 'workflow_run'/);
  assert.match(workflow, /Check core API budget/);
  assert.match(workflow, /CLAWSWEEPER_MIN_CORE_REMAINING/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /Dispatch spam comment intake candidates/);
  assert.match(workflow, /clawsweeper_spam_comment_intake/);
  assert.match(workflow, /\["issue_comment", "pull_request_review_comment"\]/);
  assert.match(workflow, /\["created", "edited"\]/);
  const dispatchStep = workflow.slice(
    workflow.indexOf("- name: Dispatch spam comment intake candidates"),
    workflow.indexOf("\n      - uses: actions/checkout@v6"),
  );
  const dispatchScript = dispatchStep
    .slice(dispatchStep.indexOf("        run: |\n") + "        run: |\n".length)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
  execFileSync("bash", ["-n"], { input: dispatchScript });
  assert.match(concurrencyBlock, /cancel-in-progress: true/);
  assert.doesNotMatch(
    concurrencyBlock,
    /group: github-activity-\$\{\{ github\.event_name \}\}-\$\{\{ github\.run_id \}\}/,
  );
  assert.doesNotMatch(concurrencyBlock, /github\.event\.action/);
  assert.doesNotMatch(concurrencyBlock, /github\.event\.client_payload\.activity\.action/);
  assert.doesNotMatch(concurrencyBlock, /github\.event\.issue\.number/);
  assert.doesNotMatch(concurrencyBlock, /github\.event\.pull_request\.number/);
  assert.doesNotMatch(concurrencyBlock, /github\.event\.client_payload\.activity\.subject\.number/);
});

test("spam comment intake coalesces duplicate comment deliveries", () => {
  const workflow = readFileSync(".github/workflows/spam-comment-intake.yml", "utf8");

  assert.match(workflow, /types: \[clawsweeper_spam_comment_intake\]/);
  assert.doesNotMatch(workflow, /types: \[github_activity\]/);
  assert.match(workflow, /group: >-/);
  assert.match(workflow, /spam-comment-intake-\$\{\{ github\.event\.client_payload\.target_repo/);
  assert.match(workflow, /github\.event\.client_payload\.activity\.issue\.number/);
  assert.match(workflow, /github\.event\.client_payload\.activity\.pull_request\.number/);
  assert.match(workflow, /github\.event\.client_payload\.comment_id/);
  assert.match(workflow, /github\.event\.client_payload\.review_comment_id/);
  assert.match(workflow, /github\.event\.client_payload\.activity\.comment\.id/);
  assert.match(workflow, /Check core API budget/);
  assert.match(workflow, /CLAWSWEEPER_MIN_CORE_REMAINING/);
  assert.match(workflow, /github\.run_id/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test("spam scanner exact dispatches publish only per-comment audit records", () => {
  const workflow = readFileSync(".github/workflows/spam-scanner.yml", "utf8");

  assert.match(workflow, /format\('spam-scanner-\{0\}-issue-comment-\{1\}'/);
  assert.match(workflow, /format\('spam-scanner-\{0\}-review-comment-\{1\}'/);
  assert.match(workflow, /results\/spam-audit\/\$\{target_slug\}\/issue_comment-\$\{id\}\.json/);
  assert.match(
    workflow,
    /results\/spam-audit\/\$\{target_slug\}\/pull_request_review_comment-\$\{id\}\.json/,
  );
  assert.match(workflow, /--path results\/spam-scanner\.json/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("issue implementation workflow lets job intent choose dispatch capacity", () => {
  const workflow = readFileSync(".github/workflows/repair-issue-implementation-intake.yml", "utf8");

  assert.match(workflow, /cap_args=\(\)/);
  assert.match(workflow, /--max-live-workers "\$MAX_LIVE_WORKERS"/);
  assert.match(workflow, /"\$\{cap_args\[@\]\}"/);
  assert.doesNotMatch(workflow, /worker-limit issue_implementation/);
  assert.match(workflow, /owner: \$\{\{ steps\.target\.outputs\.target_owner \}\}/);
  assert.match(workflow, /id: dispatch-token/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ steps\.dispatch-token\.outputs\.token \}\}/);
  assert.match(workflow, /MODEL: internal/);
  assert.match(workflow, /echo "target_slug=\$target_slug"/);
  assert.match(workflow, /sed -E 's\/\[\^a-z0-9_\.-\]\+\/-\/g;/);
  assert.match(
    workflow,
    /sparse-checkout: \|\n\s+records\/\$\{\{ steps\.target\.outputs\.target_slug \}\}\n\s+jobs\n\s+results/,
  );
});

test("repair workers hydrate only durable jobs from generated state", () => {
  const workflow = readFileSync(".github/workflows/repair-cluster-worker.yml", "utf8");

  assert.equal(
    workflow.match(/uses: \.\/\.github\/actions\/setup-state[\s\S]*?sparse-checkout: jobs/g)
      ?.length,
    2,
  );
});

test("reviewed viable issues dispatch the existing implementation and automerge lanes", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");

  assert.match(workflow, /name: Dispatch viable issue implementation/);
  assert.match(workflow, /--candidate-kind viable/);
  assert.match(workflow, /repair-issue-implementation-intake\.yml/);
  assert.match(workflow, /-f candidate_kind=viable/);
  assert.match(workflow, /-f report_repo=openclaw\/clawsweeper-state/);
  assert.match(workflow, /steps\.target\.outputs\.target_repo != 'openclaw\/openclaw'/);
  assert.match(workflow, /steps\.target\.outputs\.target_repo != 'openclaw\/clawhub'/);
});

test("sweep workflow runs exact event reviews without a global worker gate", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8").replace(/\r\n/g, "\n");
  const eventReviewBlock = workflow.slice(
    workflow.indexOf("\n  event-review-apply:"),
    workflow.indexOf("\n  plan:"),
  );
  const setupPnpmIndex = eventReviewBlock.indexOf("- uses: ./.github/actions/setup-pnpm");
  const readTokenIndex = eventReviewBlock.indexOf("- name: Create target read token");
  const writeTokenIndex = eventReviewBlock.indexOf("- name: Create target write token");
  const inProgressStatusIndex = eventReviewBlock.indexOf(
    "- name: Mark re-review command in progress",
  );
  const setupCodexIndex = eventReviewBlock.indexOf("- uses: ./.github/actions/setup-codex");
  const exactReviewIndex = eventReviewBlock.indexOf("- name: Review exact event item");
  const exactReviewStep = eventReviewBlock.slice(
    exactReviewIndex,
    eventReviewBlock.indexOf("- name: Create state token", exactReviewIndex),
  );

  assert.match(
    eventReviewBlock,
    /group: clawsweeper-event-review-\$\{\{ github\.event\.client_payload\.target_repo/,
  );
  assert.match(eventReviewBlock, /cancel-in-progress: true/);
  assert.ok(setupPnpmIndex >= 0);
  assert.ok(readTokenIndex > setupPnpmIndex);
  assert.ok(writeTokenIndex > readTokenIndex);
  assert.ok(inProgressStatusIndex > writeTokenIndex);
  assert.ok(setupCodexIndex > inProgressStatusIndex);
  assert.ok(exactReviewIndex > setupCodexIndex);
  assert.match(exactReviewStep, /--batch-size 1/);
  assert.match(exactReviewStep, /--shard-count 1/);
  assert.doesNotMatch(eventReviewBlock, /Wait for exact event review capacity/);
  assert.doesNotMatch(eventReviewBlock, /wait-exact-event-capacity/);
  assert.doesNotMatch(eventReviewBlock, /Waiting for review capacity/);
});

test("Codex workflows install latest CLI and keep the actual model secret", () => {
  const action = readFileSync(".github/actions/setup-codex/action.yml", "utf8");
  const workflows = [
    ".github/workflows/assist.yml",
    ".github/workflows/commit-review.yml",
    ".github/workflows/maintainer-activity-report.yml",
    ".github/workflows/repair-cluster-worker.yml",
    ".github/workflows/repair-commit-finding-intake.yml",
    ".github/workflows/sweep.yml",
  ].map((file) => readFileSync(file, "utf8"));

  assert.match(action, /@openai\/codex@latest/);
  assert.match(action, /@openai\/codex-responses-api-proxy@latest/);
  assert.match(action, /env -u OPENAI_API_KEY[\s\S]*-u CLAWSWEEPER_INTERNAL_MODEL/);
  assert.equal(action.match(/--ignore-scripts/g)?.length, 2);
  assert.doesNotMatch(action, /inputs\['version'\]/);
  for (const workflow of workflows) {
    assert.match(workflow, /CLAWSWEEPER_MODEL: internal/);
    assert.match(workflow, /CLAWSWEEPER_INTERNAL_MODEL: \$\{\{ secrets\.CLAWSWEEPER_MODEL \}\}/);
    assert.doesNotMatch(workflow, /CLAWSWEEPER_CODEX_CLI_VERSION/);
    for (const line of workflow
      .split("\n")
      .filter((candidate) => /(?:OPENAI_API_KEY|CLAWSWEEPER_INTERNAL_MODEL):/.test(candidate))) {
      assert.match(line, /^\s{10,}/);
    }
  }
});

test("failed Codex workers use bounded automatic retry paths", () => {
  const worker = readFileSync("src/repair/run-worker.ts", "utf8");
  const executor = readFileSync("src/repair/execute-fix-artifact.ts", "utf8");
  const selfHeal = readFileSync("src/repair/self-heal-failed-runs.ts", "utf8");

  assert.match(worker, /Codex worker timed out[\s\S]*process\.exit\(1\)/);
  assert.match(
    worker,
    /Codex worker completed without a structured result\.json artifact[\s\S]*process\.exit\(1\)/,
  );
  assert.match(executor, /requeue_required: true/);
  assert.match(executor, /if \(outcome\.requeue_required === true\) process\.exitCode = 1/);
  assert.match(selfHeal, /CLAWSWEEPER_SELF_HEAL_MAX_ATTEMPTS_PER_JOB \?\? 3/);
  assert.match(selfHeal, /reason: "retry_limit_reached"/);
});

test("repair workflows preserve existing dispatch while scheduled cluster intake stays gated", () => {
  const cluster = readFileSync(".github/workflows/repair-cluster-worker.yml", "utf8");
  const clusterIntake = readFileSync(".github/workflows/repair-cluster-intake.yml", "utf8");
  const router = readFileSync(".github/workflows/repair-comment-router.yml", "utf8");
  const finalizer = readFileSync(".github/workflows/repair-finalize-open-prs.yml", "utf8");
  const selfHeal = readFileSync(".github/workflows/repair-self-heal.yml", "utf8");
  const sweep = readFileSync(".github/workflows/sweep.yml", "utf8").replace(/\r\n/g, "\n");
  const dispatchJobs = readFileSync("src/repair/dispatch-jobs.ts", "utf8");
  const importGitcrawl = readFileSync("src/repair/import-gitcrawl-clusters.ts", "utf8");
  const importLowSignal = readFileSync("src/repair/import-gitcrawl-low-signal-prs.ts", "utf8");
  const issueImplementation = readFileSync(
    ".github/workflows/repair-issue-implementation-intake.yml",
    "utf8",
  );
  const commitFinding = readFileSync(".github/workflows/repair-commit-finding-intake.yml", "utf8");
  const existingRepairWorkflows = [
    cluster,
    router,
    finalizer,
    selfHeal,
    sweep,
    issueImplementation,
    commitFinding,
  ].join("\n");

  assert.doesNotMatch(existingRepairWorkflows, /CLAWSWEEPER_FEATURE_REPAIR_ENABLED/);
  assert.match(sweep, /pnpm run repair:comment-router -- \\\n[\s\S]*--execute/);
  assert.match(router, /\{ \[ "\$\{\{ github\.event_name \}\}" = "repository_dispatch" \]; \}/);
  assert.match(issueImplementation, /ENABLED: \$\{\{ github\.event\.inputs\.enabled/);
  assert.match(commitFinding, /ENABLED: \$\{\{ github\.event\.inputs\.enabled/);
  assert.match(clusterIntake, /SCHEDULE_ENABLED/);
  assert.match(clusterIntake, /CLAWSWEEPER_FEATURE_CLUSTER_REPAIR_ENABLED/);
  const intakeJobHeader = clusterIntake.slice(
    clusterIntake.indexOf("  intake:"),
    clusterIntake.indexOf("    steps:"),
  );
  assert.match(
    intakeJobHeader,
    /if: \$\{\{ github\.event_name != 'schedule' \|\| vars\.CLAWSWEEPER_FEATURE_CLUSTER_REPAIR_ENABLED == '1' \}\}/,
  );
  assert.ok(
    clusterIntake.indexOf("vars.CLAWSWEEPER_FEATURE_CLUSTER_REPAIR_ENABLED") <
      clusterIntake.indexOf("actions/create-github-app-token"),
    "scheduled cluster intake gate must appear before token creation",
  );
  assert.match(dispatchJobs, /repairJobUsesClusterLane/);
  assert.doesNotMatch(dispatchJobs, /CLAWSWEEPER_FEATURE_CLUSTER_REPAIR_ENABLED/);
  assert.doesNotMatch(importGitcrawl, /CLAWSWEEPER_FEATURE_CLUSTER_REPAIR_ENABLED/);
  assert.doesNotMatch(importLowSignal, /CLAWSWEEPER_FEATURE_CLUSTER_REPAIR_ENABLED/);
});

test("cluster intake publishes generated repair state through state repo", () => {
  const workflow = readFileSync(".github/workflows/repair-cluster-intake.yml", "utf8");
  const stateTokenIndex = workflow.indexOf("uses: ./.github/actions/create-state-token");
  const setupStateIndex = workflow.indexOf("uses: ./.github/actions/setup-state");
  const importIndex = workflow.indexOf("- name: Import one cluster from gitcrawl-store");
  const publishIndex = workflow.indexOf("- name: Publish intake jobs and ledger");

  assert.notEqual(stateTokenIndex, -1);
  assert.notEqual(setupStateIndex, -1);
  assert.notEqual(importIndex, -1);
  assert.notEqual(publishIndex, -1);
  assert.ok(stateTokenIndex < setupStateIndex, "state token must be created before setup-state");
  assert.ok(setupStateIndex < importIndex, "state repo must be hydrated before job import");
  assert.ok(setupStateIndex < publishIndex, "state repo must be configured before publish-main");
  assert.match(workflow, /--path jobs/);
  assert.match(workflow, /--path results\/cluster-repair-intake/);
});

test("conflict self-heal publishes exact-head jobs before worker dispatch", () => {
  const source = readFileSync("src/repair/conflict-self-heal.ts", "utf8");
  const writeIndex = source.indexOf("writeSelfHealJob(candidate);");
  const publishIndex = source.indexOf("publishSelfHealJobs();");
  const dispatchIndex = source.indexOf("dispatchRepair(candidate);");

  assert.notEqual(writeIndex, -1);
  assert.notEqual(publishIndex, -1);
  assert.notEqual(dispatchIndex, -1);
  assert.ok(writeIndex < publishIndex, "self-heal jobs must be written before state publish");
  assert.ok(publishIndex < dispatchIndex, "self-heal jobs must be durable before worker dispatch");
  assert.match(source, /CLAWSWEEPER_STATE_DIR is required/);
  assert.match(source, /head SHA changed after state publish/);
});

test("review prompt asks for concise public review fields", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /Keep these fields concise because they become the public review comment/);
  assert.match(prompt, /one short sentence for `changeSummary`, `workReason`, `bestSolution`/);
  assert.match(
    prompt,
    /merge\s+automation is reported by the command\/status comment and hidden markers/,
  );
});

test("review prompt keeps automerge opt-in from becoming generic manual review", () => {
  const prompt = readFileSync("prompts/review-item.md", "utf8");

  assert.match(prompt, /explicitly opted into `clawsweeper:automerge`/);
  assert.match(prompt, /Do not choose `manual_review` solely because/);
  assert.match(prompt, /`maintainer` label/);
  assert.match(prompt, /large `size:\*` label/);
  assert.match(prompt, /choose `queue_fix_pr` even when the\s+finding is process-only or P3/);
  assert.match(prompt, /`CHANGELOG\.md` is release-owned/);
  assert.match(prompt, /Do not\s+make missing `CHANGELOG\.md` a review finding/i);
  assert.match(prompt, /ask for PR-body or commit\s+message context/);
  assert.doesNotMatch(prompt, /missing required changelog\s+entry/);
  assert.match(prompt, /does not by itself block a clean automerge verdict/);
});

test("review prompts require reproduction and solution assessment details", () => {
  const itemPrompt = readFileSync("prompts/review-item.md", "utf8");
  const commitPrompt = readFileSync("prompts/review-commit.md", "utf8");

  assert.match(itemPrompt, /Always fill `reproductionAssessment`/);
  assert.match(itemPrompt, /itemCategory: "bug"/);
  assert.match(itemPrompt, /itemCategory: "skill"/);
  assert.match(itemPrompt, /Always fill `triagePriority`/);
  assert.match(itemPrompt, /maintainers\s+can find issues and pull requests\s+by priority/);
  assert.match(itemPrompt, /not just\s+from PR review findings/);
  assert.match(itemPrompt, /skills\/<vendor>/);
  assert.match(itemPrompt, /upload or publish it through ClawHub\.com/);
  assert.match(itemPrompt, /requiresNewConfigOption/);
  assert.match(itemPrompt, /automatic\s+bug-fix PR creation/);
  assert.match(itemPrompt, /For every other issue or PR reference,\s+use the full GitHub URL/);
  assert.doesNotMatch(itemPrompt, /normal `#123` links/);
  assert.match(itemPrompt, /Always fill `solutionAssessment`/);
  assert.match(itemPrompt, /Do we have a high-confidence way to reproduce the\s+issue\?/);
  assert.match(itemPrompt, /Is this the best way to solve the issue\?/);
  assert.match(commitPrompt, /The checkout is current target\s+`main`, not the commit snapshot/);
  assert.match(commitPrompt, /Do we have a high-confidence way to reproduce the issue\?/);
  assert.match(commitPrompt, /Is this the best way to solve the issue\?/);
});

test("commit review workflow settles and reviews from target main", () => {
  const workflow = readFileSync(".github/workflows/commit-review.yml", "utf8");

  assert.doesNotMatch(workflow, /clawsweeper_commit_review/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /gh workflow run commit-review\.yml/);
  assert.match(workflow, /CLAWSWEEPER_COMMIT_REVIEW_SETTLE_SECONDS \|\| '60'/);
  assert.match(workflow, /sleep "\$SETTLE_SECONDS"/);
  assert.match(workflow, /Check out target main/);
  assert.match(workflow, /checkout -B main refs\/remotes\/origin\/main/);
  assert.doesNotMatch(workflow, /checkout --detach "\$COMMIT_SHA"/);
});

test("sweep target write tokens can merge pull requests", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const targetWriteTokenBlocks = workflow
    .split("- name: Create target write token")
    .slice(1)
    .map((block) => block.split("\n      - ")[0]);

  assert.equal(targetWriteTokenBlocks.length, 3);
  for (const block of targetWriteTokenBlocks) {
    assert.match(block, /permission-contents: write/);
    assert.match(block, /permission-pull-requests: write/);
  }
});

test("sweep review recovery uses explicit failed shard artifacts", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");

  assert.match(
    workflow,
    /- name: Review shard\r?\n\s+id: review-shard\r?\n\s+continue-on-error: true/,
  );
  assert.match(workflow, /- name: Record failed review shard/);
  assert.match(workflow, /steps\.review-shard\.outcome == 'failure'/);
  assert.match(workflow, /name: review-failed-shard-\$\{\{ matrix\.shard \}\}/);
  assert.match(workflow, /pattern: review-failed-shard-\*/);
  assert.match(workflow, /needs\.review\.result != 'skipped'/);
  assert.doesNotMatch(
    workflow,
    /needs\.review\.result == 'failure' \|\| needs\.review\.result == 'cancelled'/,
  );
});

test("sweep failed-review retry lane defaults to dry-run exact-item dispatch", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const retryBlock = workflow.slice(
    workflow.indexOf("retry-failed-reviews:"),
    workflow.indexOf("\n\n  audit-dashboard:"),
  );
  const planHeader = workflow.slice(
    workflow.indexOf("\n  plan:"),
    workflow.indexOf("\n    runs-on:", workflow.indexOf("\n  plan:")),
  );

  assert.match(workflow, /cron: "13 8,20 \* \* \*"/);
  assert.match(planHeader, /github\.event\.schedule == '13 8,20 \* \* \*'/);
  assert.match(retryBlock, /pnpm run retry-failed-reviews --/);
  assert.match(
    retryBlock,
    /DRY_RUN: \$\{\{ vars\.CLAWSWEEPER_FAILED_REVIEW_RETRY_ENABLED == '1' && 'false' \|\| 'true' \}\}/,
  );
  assert.match(retryBlock, /--dry-run/);
  assert.match(retryBlock, /--workflow-repo "\$GITHUB_REPOSITORY"/);
  assert.match(retryBlock, /--target-repo "\$TARGET_REPO"/);
  assert.match(retryBlock, /--path records\/openclaw-openclaw/);
});

test("sweep dashboard status writes are scoped to the target repository", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const statusCalls = [...workflow.matchAll(new RegExp("pnpm run status -- \\\\", "g"))];

  assert.ok(statusCalls.length > 0);
  for (const match of statusCalls) {
    const block = workflow.slice(match.index, match.index + 220);
    assert.match(block, /--target-repo /);
  }
});

test("review parser strips environment access caveats from risks", () => {
  const parsed = parseDecision(
    closeDecision({
      risks: [
        "GH_TOKEN was unavailable, so authenticated gh could not be used.",
        "A real product uncertainty remains.",
      ],
    }),
  );
  assert.deepEqual(parsed.risks, ["A real product uncertainty remains."]);
});

test("codex subprocess env strips GitHub and App credentials", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.GH_TOKEN = "gh";
    process.env.GITHUB_TOKEN = "github";
    process.env.COMMIT_SWEEPER_TARGET_GH_TOKEN = "target";
    process.env.CLAWSWEEPER_PROOF_INSPECTION_TOKEN = "codex-target";
    process.env.CLAWSWEEPER_APP_ID = "123";
    process.env.CLAWSWEEPER_APP_PRIVATE_KEY = "private";
    process.env.OPENAI_API_KEY = "openai";
    process.env.CODEX_API_KEY = "codex";

    const env = codexEnv();

    assert.equal(env.GH_TOKEN, undefined);
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(env.COMMIT_SWEEPER_TARGET_GH_TOKEN, undefined);
    assert.equal(env.CLAWSWEEPER_PROOF_INSPECTION_TOKEN, undefined);
    assert.equal(env.CLAWSWEEPER_APP_ID, undefined);
    assert.equal(env.CLAWSWEEPER_APP_PRIVATE_KEY, undefined);
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.CODEX_API_KEY, undefined);
    assert.equal(env.GIT_OPTIONAL_LOCKS, "0");
  } finally {
    process.env = originalEnv;
  }
});

test("codex subprocess env can expose an explicit read-only GitHub token", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.GH_TOKEN = "ambient";
    process.env.GITHUB_TOKEN = "github";
    process.env.COMMIT_SWEEPER_TARGET_GH_TOKEN = "hidden";
    process.env.CLAWSWEEPER_PROOF_INSPECTION_TOKEN = "hidden-codex";

    const env = codexEnv({ ghToken: "target-read" });

    assert.equal(env.GH_TOKEN, "target-read");
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(env.COMMIT_SWEEPER_TARGET_GH_TOKEN, undefined);
    assert.equal(env.CLAWSWEEPER_PROOF_INSPECTION_TOKEN, undefined);
    assert.equal(env.GIT_OPTIONAL_LOCKS, "0");
  } finally {
    process.env = originalEnv;
  }
});

test("related title search terms keep issue-specific words", () => {
  assert.deepEqual(
    relatedTitleSearchTerms(
      "Feature: message:before_send hook to enable content-quality fallback gating",
    ),
    ["message", "before_send", "hook", "enable", "content-quality", "fallback"],
  );
});

test("related GitHub issue search query uses issue-only title terms", () => {
  assert.equal(
    relatedGitHubIssueSearchQueryForTest(
      "openclaw/openclaw",
      "[Bug] Telegram group photo-only messages do not trigger image understanding",
    ),
    'repo:openclaw/openclaw is:issue in:title,body telegram group "photo-only" messages',
  );
  assert.equal(relatedGitHubIssueSearchQueryForTest("openclaw/openclaw", "Bug"), null);
});

test("audit detects live/local state drift and unsafe proposed records", () => {
  const result = auditFromSnapshot({
    openItems: [
      item({ number: 1, title: "tracked open" }),
      item({ number: 2, title: "missing open" }),
      item({ number: 3, title: "reopened archived" }),
      item({ number: 9, title: "maintainer implemented" }),
    ],
    itemRecords: [
      auditRecord(1),
      auditRecord(4),
      auditRecord(5),
      auditRecord(6, {
        labels: ["security"],
        decision: "close",
        closeReason: "implemented_on_main",
        action: "proposed_close",
      }),
      auditRecord(9, {
        labels: ["maintainer"],
        decision: "close",
        closeReason: "implemented_on_main",
        action: "proposed_close",
      }),
      auditRecord(7, { reviewStatus: "stale_local_checkout_blocked" }),
    ],
    closedRecords: [
      auditRecord(3, { location: "closed", path: "closed/3.md" }),
      auditRecord(5, { location: "closed", path: "closed/5.md" }),
      auditRecord(8, {
        location: "closed",
        path: "closed/8.md",
        labels: ["security"],
        action: "proposed_close",
      }),
    ],
    scanComplete: true,
    pagesScanned: 1,
    generatedAt: "2026-04-26T00:00:00.000Z",
  });

  assert.equal(result.counts.missingOpen, 1);
  assert.equal(result.counts.missingEligibleOpen, 1);
  assert.equal(result.counts.missingMaintainerOpen, 0);
  assert.equal(result.counts.missingProtectedOpen, 0);
  assert.equal(result.counts.missingRecentOpen, 0);
  assert.equal(result.findings.missingOpen[0].number, 2);
  assert.equal(result.findings.missingOpen[0].missingReason, "eligible");
  assert.equal(result.findings.missingEligibleOpen[0].number, 2);
  assert.equal(result.counts.openArchived, 1);
  assert.equal(result.findings.openArchived[0].closedPath, "closed/3.md");
  assert.equal(result.counts.staleItemRecords, 4);
  assert.equal(result.counts.duplicateRecords, 1);
  assert.equal(result.counts.protectedProposed, 1);
  assert.equal(result.findings.protectedProposed[0].number, 6);
  assert.equal(result.counts.staleReviews, 1);
});

test("audit classifies missing open records by actionable reason", () => {
  const base = {
    itemRecords: [],
    closedRecords: [],
    scanComplete: true,
    pagesScanned: 1,
    generatedAt: "2026-04-26T12:00:00.000Z",
  };
  const expectedQueueLag = auditFromSnapshot({
    ...base,
    openItems: [
      item({ number: 1, authorAssociation: "MEMBER" }),
      item({ number: 2, labels: ["beta-blocker"] }),
      item({
        number: 3,
        createdAt: "2026-04-26T11:30:00.000Z",
        updatedAt: "2026-04-26T11:30:00.000Z",
      }),
    ],
  });

  assert.equal(expectedQueueLag.counts.missingOpen, 3);
  assert.equal(expectedQueueLag.counts.missingEligibleOpen, 1);
  assert.equal(expectedQueueLag.counts.missingMaintainerOpen, 0);
  assert.equal(expectedQueueLag.counts.missingProtectedOpen, 1);
  assert.equal(expectedQueueLag.counts.missingRecentOpen, 1);
  assert.deepEqual(
    expectedQueueLag.findings.missingOpen.map((finding) => finding.missingReason),
    ["eligible", "protected_label", "recently_created"],
  );
  assert.equal(auditHasStrictFailures(expectedQueueLag), true);

  const actionableDrift = auditFromSnapshot({
    ...base,
    openItems: [item({ number: 4, createdAt: "2026-04-24T00:00:00.000Z" })],
  });

  assert.equal(actionableDrift.counts.missingEligibleOpen, 1);
  assert.equal(actionableDrift.findings.missingEligibleOpen[0].missingReason, "eligible");
  assert.equal(auditHasStrictFailures(actionableDrift), true);
});

test("audit health section summarizes strict status and actionable findings", () => {
  const result = auditFromSnapshot({
    openItems: [
      item({
        number: 10,
        title: "eligible missing",
        createdAt: "2026-04-24T00:00:00.000Z",
      }),
      item({ number: 11, title: "reopened archived" }),
      item({ number: 14, title: "stale open review" }),
    ],
    itemRecords: [
      auditRecord(12, { title: "stale local" }),
      auditRecord(13, {
        title: "protected close",
        labels: ["security"],
        action: "proposed_close",
      }),
      auditRecord(14, {
        title: "stale open review",
        currentState: "open",
        reviewStatus: "stale_reopened",
      }),
    ],
    closedRecords: [auditRecord(11, { location: "closed", path: "closed/11.md" })],
    scanComplete: true,
    pagesScanned: 1,
    generatedAt: "2026-04-26T12:00:00.000Z",
  });
  const section = auditHealthSection(result);

  assert.match(section, /### Audit Health/);
  assert.match(section, /<!-- clawsweeper-audit:openclaw-openclaw:start -->/);
  assert.match(
    section,
    /Repository: \[openclaw\/openclaw\]\(https:\/\/github\.com\/openclaw\/openclaw\)/,
  );
  assert.match(section, /Status: \*\*Action needed\*\*/);
  assert.match(section, /Targeted review input: `10,11,14`/);
  assert.match(section, /\| Missing eligible open records \| 1 \|/);
  assert.match(section, /\[#10\]\(https:\/\/github\.com\/openclaw\/openclaw\/issues\/10\)/);
  assert.match(section, /Missing eligible open/);
  assert.match(section, /\[#13\]\(https:\/\/github\.com\/openclaw\/openclaw\/issues\/13\)/);
  assert.match(section, /Protected proposed close/);
  assert.match(section, /\[#11\]\(https:\/\/github\.com\/openclaw\/openclaw\/issues\/11\)/);
  assert.match(section, /Open archived/);
  assert.doesNotMatch(section, /\[#12\]\(https:\/\/github\.com\/openclaw\/openclaw\/issues\/12\)/);
});

test("audit defers stale item drift until the open scan is complete", () => {
  const result = auditFromSnapshot({
    openItems: [item({ number: 1 })],
    itemRecords: [auditRecord(1), auditRecord(2)],
    closedRecords: [],
    scanComplete: false,
    pagesScanned: 1,
    generatedAt: "2026-04-26T00:00:00.000Z",
  });

  assert.equal(result.scan.complete, false);
  assert.equal(result.counts.staleItemRecords, 0);
  assert.deepEqual(result.findings.staleItemRecords, []);
});

test("recently closed dashboard rows link items and archived reports", () => {
  const rows = formatRecentClosedRows([
    {
      repo: "openclaw/clawhub",
      number: 42,
      kind: "pull_request",
      title: "Fix pipe | title",
      closeReason: "implemented_on_main",
      appliedAt: "2026-04-26T20:00:00.000Z",
      reportPath: "closed/42.md",
    },
  ]);

  assert.match(rows, /\[#42\]\(https:\/\/github\.com\/openclaw\/clawhub\/pull\/42\)/);
  assert.match(
    rows,
    /\[closed\/42\.md\]\(https:\/\/github\.com\/openclaw\/clawsweeper\/blob\/main\/closed\/42\.md\)/,
  );
  assert.match(rows, /Fix pipe \\| title/);
  assert.match(rows, /already implemented on main/);
  assert.match(rows, /Apr 26, 2026, 20:00 UTC/);
});

test("recently closed dashboard rows include reconciled external closes", () => {
  const markdown = reportFrontMatter({
    current_state: "closed",
    current_item_closed_at: "2026-04-28T08:15:03.000Z",
    reconciled_at: "2026-04-28T08:18:02.202Z",
    action_taken: "kept_open",
  });
  const rows = formatRecentClosedRows([
    {
      repo: "openclaw/openclaw",
      number: 73370,
      kind: "issue",
      title: "Externally closed item",
      closeReason: "closed externally after review",
      closedAt: dashboardClosedAt(markdown),
      appliedAt: undefined,
      reportPath: "records/openclaw-openclaw/closed/73370.md",
    },
  ]);

  assert.equal(dashboardClosedAt(markdown), "2026-04-28T08:15:03.000Z");
  assert.equal(
    dashboardClosedAt(
      reportFrontMatter({
        current_state: "closed",
        reconciled_at: "2026-04-28T08:18:02.202Z",
        action_taken: "kept_open",
      }),
    ),
    "2026-04-28T08:18:02.202Z",
  );
  assert.match(rows, /closed externally after review/);
  assert.match(rows, /Apr 28, 2026, 08:15 UTC/);
});

test("GitHub retry classifier distinguishes throttle and transient failures", () => {
  const throttled = new Error("API rate limit exceeded for user ID 1");
  assert.equal(ghRetryKind(throttled), "throttle");
  assert.equal(shouldRetryGh(throttled), true);

  const eof = Object.assign(new Error("Command failed: gh api repos/openclaw/openclaw/issues"), {
    stderr: 'Get "https://api.github.com/repos/openclaw/openclaw/issues?page=54": unexpected EOF\n',
  });
  assert.equal(ghRetryKind(eof), "transient");
  assert.equal(shouldRetryGh(eof), true);

  const connectionReset = new Error(
    "Post https://api.github.com/graphql: read: connection reset by peer",
  );
  assert.equal(ghRetryKind(connectionReset), "transient");

  const badGateway = Object.assign(new Error("gh: HTTP 502: Bad Gateway"), { stderr: "" });
  assert.equal(ghRetryKind(badGateway), "transient");

  const dispatchServerError = Object.assign(
    new Error(
      "could not create workflow dispatch event: HTTP 500: Failed to run workflow dispatch",
    ),
    { stderr: "" },
  );
  assert.equal(ghRetryKind(dispatchServerError), "transient");

  const htmlInsteadOfJson = Object.assign(
    new Error("Command failed: gh api repos/openclaw/openclaw/issues?page=47"),
    { stderr: "invalid character '<' looking for beginning of value\n" },
  );
  assert.equal(ghRetryKind(htmlInsteadOfJson), "transient");

  const authFailure = Object.assign(new Error("gh: HTTP 401: Bad credentials"), {
    stderr: "Bad credentials",
  });
  assert.equal(ghRetryKind(authFailure), "none");
  assert.equal(shouldRetryGh(authFailure), false);

  const authFailureForIssue502 = Object.assign(
    new Error("Command failed: gh api repos/openclaw/openclaw/issues/502/comments"),
    { stderr: "gh: HTTP 401: Bad credentials" },
  );
  assert.equal(ghRetryKind(authFailureForIssue502), "none");
});

test("GitHub not found errors are recognizable non-retryable lookup misses", () => {
  const error = new Error(
    "Command failed: gh api repos/openclaw/openclaw/pulls/228\nHTTP 404: Not Found",
  );
  assert.equal(isGitHubNotFoundError(error), true);
  assert.equal(shouldRetryGh(error), false);
});

test("closing pull request references preserve fork repository identity", () => {
  assert.deepEqual(
    closingPullRequestReferenceTarget(
      {
        number: 228,
        repository: {
          owner: { login: "BingqingLyu" },
          name: "openclaw",
        },
      },
      "openclaw/openclaw",
    ),
    { repo: "BingqingLyu/openclaw", number: 228 },
  );
  assert.deepEqual(closingPullRequestReferenceTarget({ number: 40756 }, "openclaw/openclaw"), {
    repo: "openclaw/openclaw",
    number: 40756,
  });
  assert.equal(closingPullRequestReferenceTarget({ number: "228" }, "openclaw/openclaw"), null);
});

test("GitHub requires-authentication write errors are recognizable apply skips", () => {
  const error = Object.assign(
    new Error("Command failed: gh api repos/openclaw/openclaw/issues/74425/comments"),
    {
      stdout:
        '{\n  "message": "Requires authentication",\n  "documentation_url": "https://docs.github.com/rest",\n  "status": "401"\n}',
      stderr: "gh: Requires authentication (HTTP 401)\n",
    },
  );
  assert.equal(isGitHubRequiresAuthenticationError(error), true);
  assert.equal(shouldRetryGh(error), false);

  const issueEditError = Object.assign(
    new Error("Command failed: gh issue edit 85306 --add-label impact:message-loss"),
    {
      stderr:
        'error fetching labels: non-200 OK status code: 401 Unauthorized body: "{\\n  \\"message\\": \\"Requires authentication\\",\\n  \\"status\\": \\"401\\"\\n}"',
    },
  );
  assert.equal(isGitHubRequiresAuthenticationError(issueEditError), true);
  assert.equal(shouldRetryGh(issueEditError), false);
});

test("locked conversation failures are non-retryable but recognizable apply skips", () => {
  const locked = Object.assign(
    new Error("Command failed: gh api repos/openclaw/openclaw/issues/40088/comments"),
    {
      stdout:
        '{"message":"Unable to create comment because issue is locked.","documentation_url":"https://docs.github.com/articles/locking-conversations/","status":"403"}',
      stderr: "gh: Unable to create comment because issue is locked. (HTTP 403)\n",
    },
  );

  assert.equal(ghRetryKind(locked), "none");
  assert.equal(isLockedConversationCommentError(locked), true);
  assert.equal(
    lockedConversationApplyReason({ locked: true, activeLockReason: "resolved" }),
    "conversation is locked (resolved)",
  );
  assert.equal(lockedConversationApplyReason({ locked: false, activeLockReason: null }), null);
});

test("safeOutputTail tolerates missing process output", () => {
  assert.equal(safeOutputTail(undefined), "");
  assert.equal(safeOutputTail(null), "");
  assert.equal(safeOutputTail("abcdef", 3), "def");
});

test("scheduled workflow jobs fail closed on forks without an explicit opt-in", () => {
  const workflow = readFileSync(".github/workflows/sweep.yml", "utf8");
  const scheduleGuard =
    "github.event_name != 'schedule' || github.repository == 'openclaw/clawsweeper' || vars.CLAWSWEEPER_ENABLE_SCHEDULES == '1'";

  const skipJobStart = workflow.indexOf("\n  fork-schedule-disabled:");
  const nextJobStart = workflow.indexOf("\n  event-disabled-target:", skipJobStart);
  assert.notEqual(skipJobStart, -1);
  assert.notEqual(nextJobStart, -1);
  const skipJob = workflow.slice(skipJobStart, nextJobStart);
  assert.match(skipJob, /name: Skip unconfigured fork schedule/);
  assert.match(skipJob, /github\.event_name == 'schedule'/);
  assert.match(skipJob, /github\.repository != 'openclaw\/clawsweeper'/);
  assert.match(skipJob, /vars\.CLAWSWEEPER_ENABLE_SCHEDULES != '1'/);

  for (const jobName of [
    "target-fanout",
    "plan",
    "retry-failed-reviews",
    "audit-dashboard",
    "apply-existing",
  ]) {
    const jobStart = workflow.indexOf(`\n  ${jobName}:`);
    const runsOn = workflow.indexOf("\n    runs-on:", jobStart);
    assert.notEqual(jobStart, -1, `${jobName} job exists`);
    assert.notEqual(runsOn, -1, `${jobName} job has a runs-on boundary`);
    assert.match(
      workflow.slice(jobStart, runsOn),
      new RegExp(scheduleGuard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("runCodex reviews a detached exact PR head, rejects base-head evidence, and preserves the base checkout", () => {
  const root = mkdtempSync(tmpPrefix);
  const repoDir = join(root, "repo");
  const binDir = join(root, "bin");
  mkdirSync(repoDir);
  mkdirSync(binDir);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  git("init");
  git("config", "user.name", "fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repoDir, "version.txt"), "base");
  git("add", ".");
  git("commit", "-m", "base");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(repoDir, "version.txt"), "final");
  git("commit", "-am", "final");
  const head = git("rev-parse", "HEAD");
  git("checkout", "--detach", base);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const gitPath = join(binDir, "git");
  writeFileSync(
    gitPath,
    `#!/usr/bin/env node
const cp=require("node:child_process"),fs=require("node:fs");
if(process.argv[2]==="status" && process.env.CODEX_FIXTURE_STATUS_HANG) {
 const counter=process.env.CODEX_FIXTURE_STATUS_COUNTER;
 const count=fs.existsSync(counter) ? Number(fs.readFileSync(counter,"utf8")) : 0;
 fs.writeFileSync(counter,String(count+1));
 if(process.env.CODEX_FIXTURE_STATUS_HANG==="before" || count>0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60_000);
}
if(process.env.CODEX_FIXTURE_FAIL_CLEANUP && process.argv[2]==="worktree" && process.argv[3]==="remove") process.exit(1);
const result=cp.spawnSync(${JSON.stringify(realGit)},process.argv.slice(2),{stdio:"inherit"});
process.exit(result.status ?? 1);
`,
  );
  chmodSync(gitPath, 0o755);
  const codexPath = join(binDir, "codex");
  writeFileSync(
    codexPath,
    `#!/usr/bin/env node
const fs=require("node:fs"), cp=require("node:child_process");
fs.readFileSync(0,"utf8");
const head=cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
if(head!==process.env.CODEX_FIXTURE_HEAD || fs.readFileSync("version.txt","utf8")!=="final") process.exit(5);
const event=(command,output)=>process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"command_execution",status:"completed",exit_code:0,command,aggregated_output:output}})+"\\n");
event("git rev-parse HEAD",process.env.CODEX_FIXTURE_WRONG_HEAD || head);
event("git show --format=fuller --stat "+head,"commit "+head);
if (!process.env.CODEX_FIXTURE_SKIP_PATCH) event("git diff --no-ext-diff --no-textconv --unified=3 "+process.env.CODEX_FIXTURE_BASE+" "+head+" --",cp.execFileSync("git",["diff","--no-ext-diff","--no-textconv","--unified=3",process.env.CODEX_FIXTURE_BASE,head,"--"],{encoding:"utf8"}));
fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],process.env.CODEX_DECISION_JSON);
`,
  );
  chmodSync(codexPath, 0o755);
  const prior = {
    GIT_BIN: process.env.GIT_BIN,
    CODEX_FIXTURE_STATUS_HANG: process.env.CODEX_FIXTURE_STATUS_HANG,
    CODEX_FIXTURE_STATUS_COUNTER: process.env.CODEX_FIXTURE_STATUS_COUNTER,
    PATH: process.env.PATH,
    CODEX_FIXTURE_FAIL_CLEANUP: process.env.CODEX_FIXTURE_FAIL_CLEANUP,
    CODEX_FIXTURE_HEAD: process.env.CODEX_FIXTURE_HEAD,
    CODEX_FIXTURE_BASE: process.env.CODEX_FIXTURE_BASE,
    CODEX_FIXTURE_SKIP_PATCH: process.env.CODEX_FIXTURE_SKIP_PATCH,
    CODEX_FIXTURE_WRONG_HEAD: process.env.CODEX_FIXTURE_WRONG_HEAD,
    CODEX_DECISION_JSON: process.env.CODEX_DECISION_JSON,
  };
  process.env.PATH = `${binDir}${delimiter}${process.env.PATH}`;
  process.env.CODEX_FIXTURE_HEAD = head;
  process.env.CODEX_FIXTURE_BASE = base;
  process.env.CODEX_DECISION_JSON = JSON.stringify(
    closeDecision({ decision: "keep_open", closeReason: "none" }),
  );
  const options = {
    item: item({ kind: "pull_request", number: 99 }),
    context: { issue: {}, comments: [], timeline: [], pullRequest: { head: { sha: head } } },
    git: { mainSha: base, latestRelease: null },
    model: "gpt-test",
    openclawDir: repoDir,
    reasoningEffort: "medium",
    sandboxMode: "read-only",
    serviceTier: "",
    timeoutMs: 10_000,
    workDir: join(root, "work"),
    prompt:
      "Historical context: tools unavailable; only return JSON.\n" +
      "historical data\n".repeat(6000),
  };
  try {
    process.env.CODEX_FIXTURE_WRONG_HEAD = base;
    assert.throws(() => runCodexForTest(options), /missing successful checkout/);
    const failureDiagnostic = JSON.parse(
      readFileSync(join(options.workDir, "99.execution-diagnostics.json"), "utf8"),
    );
    assert.equal(failureDiagnostic.verified, false);
    assert.equal(failureDiagnostic.headIdentity[0].matchesHead, false);
    assert.equal(failureDiagnostic.prHeadSummary[0].matchesHead, true);
    process.env.CODEX_FIXTURE_FAIL_CLEANUP = "1";
    assert.throws(
      () => runCodexForTest(options),
      (error: Error) => {
        assert.match(error.message, /review and checkout cleanup both failed/);
        assert.match(String(error.cause), /missing successful checkout/);
        return true;
      },
    );
    delete process.env.CODEX_FIXTURE_FAIL_CLEANUP;
    const leaked = git("worktree", "list", "--porcelain")
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice(9))
      .filter((path) => path.includes("99.checkout-"));
    for (const path of leaked) git("worktree", "remove", "--force", "--", path);
    delete process.env.CODEX_FIXTURE_WRONG_HEAD;
    process.env.CODEX_FIXTURE_SKIP_PATCH = "1";
    assert.throws(() => runCodexForTest(options), /missing successful checkout/);
    delete process.env.CODEX_FIXTURE_SKIP_PATCH;
    const inspected = runCodexForTest(options);
    const packet = readFileSync(join(options.workDir, "99.prompt.md"), "utf8");
    const lastContract = packet.lastIndexOf(
      "## Mandatory fresh checkout inspection before any verdict",
    );
    assert.ok(lastContract > packet.lastIndexOf("historical data"));
    assert.ok(
      packet
        .slice(lastContract)
        .includes(`git diff --no-ext-diff --no-textconv --unified=3 ${base} ${head} --`),
    );
    assert.match(packet.slice(lastContract), /Attempt the required calls/);
    assert.equal(inspected.executionEvidence.headSha, head);
    assert.equal(inspected.executionEvidence.version, 4);
    process.env.GIT_BIN = gitPath;
    process.env.CODEX_FIXTURE_STATUS_COUNTER = join(root, "status-counter");
    for (const phase of ["before", "after"]) {
      writeFileSync(process.env.CODEX_FIXTURE_STATUS_COUNTER, "0");
      process.env.CODEX_FIXTURE_STATUS_HANG = phase;
      const began = Date.now();
      assert.throws(() => runCodexForTest({ ...options, timeoutMs: 4000 }), /ETIMEDOUT|timed out/);
      assert.ok(Date.now() - began < 5500, `${phase} status exceeded the shared deadline`);
    }
    delete process.env.CODEX_FIXTURE_STATUS_HANG;
    assert.equal(git("rev-parse", "HEAD"), base);
    assert.equal(readFileSync(join(repoDir, "version.txt"), "utf8"), "base");
    assert.equal(git("worktree", "list", "--porcelain").match(/^worktree /gm).length, 1);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("fresh source-inspection markers reject metadata-only version 3 evidence", () => {
  const sha = "a".repeat(40);
  const report = `---\nnumber: 7\ntype: pull_request\npull_head_sha: ${sha}\nlocal_review_head_sha: ${sha}\nlocal_checkout_access: verified\nreview_execution_version: 4\ndecision: keep_open\n---\n`;
  assert.match(reviewAutomationMarkersFromReport(report), /evidence=verified-v4/);
  assert.doesNotMatch(
    reviewAutomationMarkersFromReport(
      report.replace("review_execution_version: 4", "review_execution_version: 3"),
    ),
    /evidence=verified/,
  );
  assert.doesNotMatch(
    reviewAutomationMarkersFromReport(
      report.replace(`local_review_head_sha: ${sha}`, `local_review_head_sha: ${"b".repeat(40)}`),
    ),
    /evidence=verified/,
  );
});

test("security clearance markers require verified checkout and a clean security assessment", () => {
  const sha = "a".repeat(40);
  const report = `---\nnumber: 7\ntype: pull_request\npull_head_sha: ${sha}\nlocal_review_head_sha: ${sha}\nlocal_checkout_access: verified\nreview_execution_version: 4\ndecision: keep_open\n---\n\n## Security Review\n\nStatus: cleared\n\nSummary: Inspected the complete workflow patch and found no privilege expansion.\n\nConcerns:\n\n- none\n`;
  assert.match(reviewAutomationMarkersFromReport(report), /security=cleared/);
  assert.doesNotMatch(
    reviewAutomationMarkersFromReport(report.replace("Status: cleared", "Status: needs_attention")),
    /security=cleared/,
  );
  assert.doesNotMatch(
    reviewAutomationMarkersFromReport(
      report.replace("review_execution_version: 4", "review_execution_version: 3"),
    ),
    /security=cleared/,
  );
  assert.doesNotMatch(
    reviewAutomationMarkersFromReport(
      report.replace(`local_review_head_sha: ${sha}`, "local_review_head_sha: stale"),
    ),
    /security=cleared/,
  );
});
