#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOrg = "amuzeproducts2";
const artifactRoot = join(root, "artifacts", "amuze-fallback");
const targetRoot = join(root, "tmp", "amuze-targets");
const statePath = join(artifactRoot, "run-history.jsonl");
const fallbackMode = "autonomous-smart-v1";

function parseArgs(argv) {
  const args = { repos: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") args.repos.push(argv[++i]);
    else if (arg.startsWith("--repo=")) args.repos.push(arg.slice("--repo=".length));
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replaceAll("-", "_");
      const next = argv[i + 1];
      args[key] = next && !next.startsWith("--") ? argv[++i] : true;
    }
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
      CLAWSWEEPER_COMMENT_AUTHOR_LOGIN:
        options.env?.CLAWSWEEPER_COMMENT_AUTHOR_LOGIN ||
        process.env.CLAWSWEEPER_COMMENT_AUTHOR_LOGIN ||
        "jaywillingham",
    },
    maxBuffer: 128 * 1024 * 1024,
    timeout: options.timeoutMs,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function runJson(command, args, options) {
  const stdout = run(command, args, options);
  return JSON.parse(stdout || "null");
}

function runJsonBestEffort(command, args, fallback, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    maxBuffer: 128 * 1024 * 1024,
    timeout: options.timeoutMs,
  });
  if (!result.stdout) return fallback;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return fallback;
  }
}

function runBestEffort(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env ? { ...options.env } : { ...process.env },
    input: options.input,
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    timeout: options.timeoutMs,
  });
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function autoRepairEnabled(args) {
  if (args.no_autorepair) return false;
  if (args.autorepair) return true;
  return truthy(process.env.CLAWSWEEPER_AUTOREPAIR);
}

function autoMergeDependabotEnabled(args) {
  if (args.no_automerge_dependabot) return false;
  if (args.automerge_dependabot) return true;
  return truthy(process.env.CLAWSWEEPER_AUTOMERGE_DEPENDABOT);
}

function autoMergeMacroscopeLowRiskEnabled(args) {
  if (args.no_automerge_macroscope_low_risk) return false;
  if (args.automerge_macroscope_low_risk) return true;
  return truthy(process.env.CLAWSWEEPER_AUTOMERGE_MACROSCOPE_LOW_RISK);
}

function autoMergeAdminEnabled(args) {
  if (args.no_admin_merge) return false;
  if (args.admin_merge) return true;
  return truthy(process.env.CLAWSWEEPER_AUTOMERGE_ADMIN);
}

function requireMacroscopeApprovalEnabled(args) {
  if (args.no_macroscope_approval) return false;
  if (args.require_macroscope_approval) return true;
  return truthy(process.env.CLAWSWEEPER_REQUIRE_MACROSCOPE_APPROVAL);
}

function codexRepairEnv() {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: process.env.CLAWSWEEPER_GIT_USER_NAME || "clawsweeper",
    GIT_AUTHOR_EMAIL:
      process.env.CLAWSWEEPER_GIT_USER_EMAIL ||
      "274271284+clawsweeper[bot]@users.noreply.github.com",
    GIT_COMMITTER_NAME: process.env.CLAWSWEEPER_GIT_USER_NAME || "clawsweeper",
    GIT_COMMITTER_EMAIL:
      process.env.CLAWSWEEPER_GIT_USER_EMAIL ||
      "274271284+clawsweeper[bot]@users.noreply.github.com",
    NO_COLOR: "1",
    CLICOLOR: "0",
  };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.FORCE_COLOR;
  for (const key of Object.keys(env)) {
    if (/^CLAWSWEEPER_.*GH_TOKEN$/.test(key)) delete env[key];
  }
  return env;
}

function readJsonFile(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function repoSlug(repo) {
  return repo.toLowerCase().replaceAll("/", "-");
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function appendHistory(entry) {
  ensureDir(dirname(statePath));
  writeFileSync(statePath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, {
    flag: "a",
  });
}

function listRepos(org, explicitRepos) {
  if (explicitRepos.length) {
    return explicitRepos.map((repo) => (repo.includes("/") ? repo : `${org}/${repo}`));
  }
  const repos = runJson("gh", [
    "repo",
    "list",
    org,
    "--limit",
    "100",
    "--json",
    "name,isArchived,isEmpty",
    "--jq",
    "[.[] | select(.isArchived == false and .isEmpty == false) | .name] | sort",
  ]);
  return repos.map((name) => `${org}/${name}`);
}

function planDueItems(repo, itemsDir, maxPages, capacity) {
  const plan = runJson("node", [
    "dist/clawsweeper.js",
    "plan",
    "--target-repo",
    repo,
    "--items-dir",
    itemsDir,
    "--batch-size",
    String(Math.max(1, capacity)),
    "--shard-count",
    "1",
    "--max-pages",
    String(maxPages),
    "--hot-intake",
  ]);
  return plan.shards?.flatMap((shard) => shard.itemNumbers ?? []) ?? [];
}

function listOpenPullRequestNumbers(repo, maxPages) {
  const limit = Math.max(1, Math.min(100, maxPages * 100));
  const prs = runJson("gh", [
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,updatedAt",
    "--jq",
    "sort_by(.updatedAt) | reverse | map(.number)",
  ]);
  return prs;
}

function repoDefaultBranch(repo) {
  return run("gh", [
    "repo",
    "view",
    repo,
    "--json",
    "defaultBranchRef",
    "--jq",
    ".defaultBranchRef.name",
  ]).trim();
}

function ensureTargetCheckout(repo) {
  ensureDir(targetRoot);
  const slug = repoSlug(repo);
  const targetDir = join(targetRoot, slug);
  const branch = repoDefaultBranch(repo);
  if (!existsSync(join(targetDir, ".git"))) {
    run("gh", ["repo", "clone", repo, targetDir, "--", "--depth", "1"]);
  }
  run("git", ["fetch", "origin", branch, "--depth", "1"], { cwd: targetDir });
  run("git", ["checkout", "-B", branch, `origin/${branch}`], { cwd: targetDir });
  run("git", ["clean", "-ffd"], { cwd: targetDir });
  return { targetDir, branch };
}

function copyReviewArtifacts(reviewDir, itemsDir, repo) {
  ensureDir(itemsDir);
  const prefix = `${repoSlug(repo)}-`;
  const copied = [];
  for (const file of readdirSync(reviewDir)) {
    if ((file.startsWith(prefix) || /^\d+\.md$/.test(file)) && file.endsWith(".md")) {
      copyFileSync(join(reviewDir, file), join(itemsDir, file));
      copied.push(file);
    }
  }
  return copied;
}

function issueComments(repo, number) {
  return runJson("gh", ["api", `repos/${repo}/issues/${number}/comments?per_page=100`]);
}

function commentPayloadPath(repo, number, body) {
  const path = join(artifactRoot, "comments", `${repoSlug(repo)}-${number}.json`);
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify({ body }), "utf8");
  return path;
}

function patchableComment(comments, number) {
  const marker = `<!-- clawsweeper-review item=${number} -->`;
  return comments.find((comment) => {
    const login = comment?.user?.login;
    return (
      typeof comment?.body === "string" &&
      comment.body.includes(marker) &&
      (login === "jaywillingham" ||
        login === process.env.CLAWSWEEPER_COMMENT_AUTHOR_LOGIN ||
        login === "github-actions[bot]")
    );
  });
}

function currentFallbackComment(repo, number) {
  const pr = runJson("gh", ["pr", "view", String(number), "--repo", repo, "--json", "headRefOid"]);
  const marker = `<!-- clawsweeper-fallback-runner repo=${repo} item=${number} sha=${pr.headRefOid ?? "unknown"} mode=${fallbackMode} -->`;
  return issueComments(repo, number).find(
    (comment) => typeof comment?.body === "string" && comment.body.includes(marker),
  );
}

function repairStatePath(repo, number) {
  return join(artifactRoot, "repairs", `${repoSlug(repo)}-${number}.json`);
}

function readRepairState(repo, number) {
  return readJsonFile(repairStatePath(repo, number), {});
}

function writeRepairState(repo, number, patch) {
  const path = repairStatePath(repo, number);
  ensureDir(dirname(path));
  const previous = readRepairState(repo, number);
  writeFileSync(
    path,
    JSON.stringify({ ...previous, ...patch, at: new Date().toISOString() }, null, 2),
  );
}

function mergeStatePath(repo, number) {
  return join(artifactRoot, "merges", `${repoSlug(repo)}-${number}.json`);
}

function readMergeState(repo, number) {
  return readJsonFile(mergeStatePath(repo, number), {});
}

function writeMergeState(repo, number, patch) {
  const path = mergeStatePath(repo, number);
  ensureDir(dirname(path));
  const previous = readMergeState(repo, number);
  writeFileSync(
    path,
    JSON.stringify({ ...previous, ...patch, at: new Date().toISOString() }, null, 2),
  );
}

function formatCheckSummary(checks) {
  if (!checks.length) return "No check runs are visible yet.";
  const counts = checks.reduce((acc, check) => {
    acc[check.bucket || check.state || "unknown"] =
      (acc[check.bucket || check.state || "unknown"] ?? 0) + 1;
    return acc;
  }, {});
  const headline = Object.entries(counts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  const failures = checks
    .filter((check) => check.bucket === "fail" || check.bucket === "cancel")
    .slice(0, 5)
    .map((check) => `- ${check.name}: ${check.state}${check.link ? ` (${check.link})` : ""}`);
  return [headline, failures.length ? "\nFailing/cancelled checks:\n" + failures.join("\n") : ""]
    .filter(Boolean)
    .join("\n");
}

function isTestPath(path) {
  return /(^|\/)(__tests__|tests?|spec|e2e)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(path);
}

function isDocsOnlyPath(path) {
  return /\.(md|mdx|txt|png|jpe?g|gif|svg|webp)$/i.test(path) || /^docs?\//i.test(path);
}

function isCodePath(path) {
  return /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|php|cs|swift|sql|sh|yml|yaml|json)$/i.test(
    path,
  );
}

function sensitivePathReason(path) {
  if (/^\.github\/workflows\//i.test(path)) return "GitHub Actions workflow changed";
  if (/(^|\/)(Dockerfile|docker-compose\.ya?ml)$/i.test(path))
    return "runtime/container config changed";
  if (/(^|\/)(package-lock|pnpm-lock|yarn\.lock|poetry\.lock|Gemfile\.lock)$/i.test(path)) {
    return "dependency lockfile changed";
  }
  if (
    /(^|\/)(package\.json|pyproject\.toml|requirements.*\.txt|Gemfile|go\.mod|Cargo\.toml)$/i.test(
      path,
    )
  ) {
    return "dependency manifest changed";
  }
  if (/(^|\/)(\.env|secrets?|credentials?|auth|oauth|token|key|session)/i.test(path)) {
    return "auth/secret-adjacent path changed";
  }
  if (/(^|\/)(migrations?|schema|sql)\//i.test(path) || /\.sql$/i.test(path)) {
    return "database/schema path changed";
  }
  if (/(^|\/)(config|deploy|infra|terraform|k8s|helm)\//i.test(path)) {
    return "configuration/deployment path changed";
  }
  return null;
}

function prChangeStats(files) {
  return files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      additions: acc.additions + Number(file.additions ?? 0),
      deletions: acc.deletions + Number(file.deletions ?? 0),
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

function finding(severity, title, body, evidence = []) {
  return { severity, title, body, evidence };
}

function deterministicFindings(pr, checks) {
  const files = pr.files ?? [];
  const stats = prChangeStats(files);
  const labels = (pr.labels ?? []).map((label) => label.name).filter(Boolean);
  const findings = [];
  const failedChecks = checks.filter(
    (check) => check.bucket === "fail" || check.bucket === "cancel",
  );
  const codeFiles = files.filter((file) => isCodePath(file.path) && !isDocsOnlyPath(file.path));
  const testFiles = files.filter((file) => isTestPath(file.path));
  const nonDocsFiles = files.filter((file) => !isDocsOnlyPath(file.path));
  const sensitiveFiles = files
    .map((file) => ({ path: file.path, reason: sensitivePathReason(file.path) }))
    .filter((file) => file.reason);

  if (failedChecks.length) {
    findings.push(
      finding(
        "blocker",
        "Failing or cancelled checks",
        "Do not merge until the failing/cancelled GitHub checks are explained or green.",
        failedChecks
          .slice(0, 5)
          .map((check) => `${check.name}: ${check.state}${check.link ? ` (${check.link})` : ""}`),
      ),
    );
  }

  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    findings.push(
      finding(
        "blocker",
        "Requested changes are still open",
        "GitHub reports CHANGES_REQUESTED, so this PR should stay out of merge flow until that review is resolved.",
      ),
    );
  }

  if (labels.some((label) => /security|major|breaking|migration|schema/i.test(label))) {
    findings.push(
      finding(
        "high",
        "High-risk label present",
        "A risk-bearing label is present; require human review and explicit merge confidence.",
        labels.filter((label) => /security|major|breaking|migration|schema/i.test(label)),
      ),
    );
  }

  if (sensitiveFiles.length) {
    findings.push(
      finding(
        "high",
        "Sensitive paths changed",
        "This PR touches files where small mistakes can break deploys, auth, data, or CI. Review these paths directly.",
        sensitiveFiles.slice(0, 8).map((file) => `${file.path} - ${file.reason}`),
      ),
    );
  }

  if (codeFiles.length && !testFiles.length && stats.additions + stats.deletions >= 25) {
    findings.push(
      finding(
        "medium",
        "Code changed without test changes",
        "This is not automatically wrong, but the PR changes executable code with no visible test/spec updates. Verify existing tests cover the behavior or add coverage.",
        codeFiles.slice(0, 8).map((file) => file.path),
      ),
    );
  }

  if (nonDocsFiles.length && !checks.length) {
    findings.push(
      finding(
        "medium",
        "No GitHub checks visible",
        "No check runs were visible for a non-docs PR. Confirm CI is configured or run validation manually before merge.",
      ),
    );
  }

  if (stats.files >= 12 || stats.additions + stats.deletions >= 500) {
    findings.push(
      finding(
        "medium",
        "Large review surface",
        `This PR changes ${stats.files} files with +${stats.additions}/-${stats.deletions}. Split or assign a focused human reviewer if this is not mechanical.`,
      ),
    );
  }

  return { findings, stats, labels };
}

function inspectPr(repo, number) {
  const pr = runJson("gh", [
    "pr",
    "view",
    String(number),
    "--repo",
    repo,
    "--json",
    "title,url,author,headRefOid,baseRefName,headRefName,headRepository,headRepositoryOwner,isCrossRepository,maintainerCanModify,files,commits,labels,isDraft,mergeable,reviewDecision,latestReviews",
  ]);
  const checks = runJsonBestEffort(
    "gh",
    ["pr", "checks", String(number), "--repo", repo, "--json", "name,state,bucket,link,workflow"],
    [],
  );
  const reviewComments = runJsonBestEffort(
    "gh",
    ["api", `repos/${repo}/pulls/${number}/comments?per_page=100`],
    [],
  );
  const reviews = runJsonBestEffort(
    "gh",
    ["api", `repos/${repo}/pulls/${number}/reviews?per_page=100`],
    [],
  );
  return { pr, checks, reviewComments, reviews, ...deterministicFindings(pr, checks) };
}

function dependencyBumpPath(path) {
  return (
    /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path) ||
    /(^|\/)(package-lock|pnpm-lock|yarn\.lock|poetry\.lock|Gemfile\.lock)$/i.test(path) ||
    /(^|\/)(package\.json|pyproject\.toml|requirements.*\.txt|Gemfile|go\.mod|Cargo\.toml)$/i.test(
      path,
    )
  );
}

function allRequiredSignalsGreen(checks) {
  const relevant = checks.filter((check) => check.bucket !== "skipping");
  return relevant.length > 0 && relevant.every((check) => check.bucket === "pass");
}

function isMacroscopeBotLogin(login) {
  const pattern = process.env.CLAWSWEEPER_MACROSCOPE_BOT_LOGIN_RE ?? "^macroscope(app)?\\[bot\\]$";
  return new RegExp(pattern, "i").test(String(login ?? ""));
}

function macroscopeApprovabilityChecks(checks) {
  return checks.filter(
    (check) => /macroscope/i.test(check.name ?? "") && /approv/i.test(check.name ?? ""),
  );
}

function latestExactHeadMacroscopeReview(pr, reviews) {
  return [...(reviews ?? [])]
    .reverse()
    .find(
      (review) =>
        isMacroscopeBotLogin(review.user?.login) &&
        review.state &&
        (!review.commit_id || review.commit_id === pr.headRefOid),
    );
}

function macroscopeApprovalBlocker(pr, checks, reviews) {
  const approvabilityChecks = macroscopeApprovabilityChecks(checks);
  const failedCheck = approvabilityChecks.find(
    (check) => check.bucket === "fail" || check.bucket === "cancel",
  );
  if (failedCheck)
    return `Macroscope approvability check is not green (${failedCheck.name}: ${failedCheck.state})`;

  const pendingCheck = approvabilityChecks.find(
    (check) => check.bucket !== "pass" && check.bucket !== "skipping",
  );
  if (pendingCheck)
    return `Macroscope approvability check is still pending (${pendingCheck.name}: ${pendingCheck.state})`;

  const latestReview = latestExactHeadMacroscopeReview(pr, reviews);
  if (!latestReview) return "missing exact-head Macroscope approval";
  if (latestReview.state !== "APPROVED")
    return `latest exact-head Macroscope review is ${latestReview.state}`;
  if (pr.reviewDecision !== "APPROVED") {
    return `GitHub review decision is ${pr.reviewDecision ?? "unset"}, not APPROVED after Macroscope review`;
  }
  return null;
}

function autoMergeDependabotBlocker(pr, checks, stats, reviews, requireMacroscopeApproval) {
  const labels = (pr.labels ?? []).map((label) => label.name).filter(Boolean);
  const files = pr.files ?? [];
  const author = pr.author?.login ?? "";
  if (author !== "dependabot[bot]" && !String(pr.headRefName ?? "").startsWith("dependabot/")) {
    return "not a Dependabot PR";
  }
  if (pr.isDraft) return "draft PR";
  if (!pr.headRefOid) return "missing head SHA";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "requested changes are open";
  if (
    labels.some((label) =>
      /security|secret|major|breaking|migration|schema|human-review|do.not.merge|blocked/i.test(
        label,
      ),
    )
  ) {
    return "risk/pause label present";
  }
  if (!allRequiredSignalsGreen(checks)) return "checks are not all green";
  if (requireMacroscopeApproval) {
    const macroscopeBlocker = macroscopeApprovalBlocker(pr, checks, reviews);
    if (macroscopeBlocker) return macroscopeBlocker;
  }
  if (!files.length || files.some((file) => !dependencyBumpPath(file.path))) {
    return "changed files are not dependency-only";
  }
  if (stats.files > Number(process.env.CLAWSWEEPER_AUTOMERGE_MAX_FILES ?? 6)) {
    return `too many changed files (${stats.files})`;
  }
  if (
    stats.additions + stats.deletions >
    Number(process.env.CLAWSWEEPER_AUTOMERGE_MAX_LINES ?? 500)
  ) {
    return `too large (+${stats.additions}/-${stats.deletions})`;
  }
  return null;
}

function lowRiskMacroscopePath(path) {
  return isDocsOnlyPath(path) || isTestPath(path);
}

function autoMergeMacroscopeLowRiskBlocker(pr, checks, stats, reviews) {
  const labels = (pr.labels ?? []).map((label) => label.name).filter(Boolean);
  const files = pr.files ?? [];
  if (pr.isDraft) return "draft PR";
  if (!pr.headRefOid) return "missing head SHA";
  if (pr.mergeable && pr.mergeable !== "MERGEABLE") return `PR is not mergeable (${pr.mergeable})`;
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "requested changes are open";
  if (pr.isCrossRepository) return "cross-repository PR";
  if (
    labels.some((label) =>
      /security|secret|major|breaking|migration|schema|human-review|do.not.merge|blocked/i.test(
        label,
      ),
    )
  ) {
    return "risk/pause label present";
  }
  if (!allRequiredSignalsGreen(checks)) return "checks are not all green";

  const macroscopeBlocker = macroscopeApprovalBlocker(pr, checks, reviews);
  if (macroscopeBlocker) return macroscopeBlocker;

  if (!files.length || files.some((file) => !lowRiskMacroscopePath(file.path))) {
    return "changed files are not docs/test-only";
  }
  if (files.some((file) => sensitivePathReason(file.path))) {
    return "sensitive path changed";
  }
  if (stats.files > Number(process.env.CLAWSWEEPER_AUTOMERGE_MACROSCOPE_MAX_FILES ?? 8)) {
    return `too many changed files (${stats.files})`;
  }
  if (
    stats.additions + stats.deletions >
    Number(process.env.CLAWSWEEPER_AUTOMERGE_MACROSCOPE_MAX_LINES ?? 400)
  ) {
    return `too large (+${stats.additions}/-${stats.deletions})`;
  }
  return null;
}

function autoMergeDependabotPr({
  repo,
  number,
  inspection,
  adminMerge,
  requireMacroscopeApproval,
}) {
  const { pr, checks, stats, reviews } = inspection;
  const state = readMergeState(repo, number);
  const strategy = adminMerge ? "admin-squash-v1" : "direct-squash-v1";
  if (state.headSha === pr.headRefOid && state.strategy === strategy && state.status) {
    return {
      action: "skipped",
      reason: `merge already ${state.status} for this head`,
      continueToComment: false,
    };
  }
  const blocker = autoMergeDependabotBlocker(pr, checks, stats, reviews, requireMacroscopeApproval);
  if (blocker) return { action: "blocked", reason: blocker, continueToComment: true };

  writeMergeState(repo, number, { headSha: pr.headRefOid, status: "started", strategy });
  const mergeArgs = [
    "pr",
    "merge",
    String(number),
    "--repo",
    repo,
    "--squash",
    "--delete-branch",
    "--match-head-commit",
    pr.headRefOid,
    "--subject",
    pr.title ?? `Merge ${repo}#${number}`,
    "--body",
    `Merged by ClawSweeper autonomous Dependabot gate after green checks and Macroscope approval for exact head ${pr.headRefOid}.`,
  ];
  if (adminMerge) mergeArgs.push("--admin");
  const result = runBestEffort("gh", mergeArgs);
  if (result.error || result.status !== 0) {
    const reason =
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      `gh pr merge exited ${result.status}`;
    writeMergeState(repo, number, {
      headSha: pr.headRefOid,
      status: "failed",
      strategy,
      reason: String(reason).slice(0, 1000),
    });
    return {
      action: "blocked",
      reason: `merge failed: ${String(reason).slice(0, 300)}`,
      continueToComment: false,
    };
  }
  writeMergeState(repo, number, {
    headSha: pr.headRefOid,
    status: "merged",
    strategy,
    output: String(result.stdout || result.stderr || "").slice(0, 1000),
  });
  return {
    action: "merged",
    output: result.stdout || result.stderr || "",
    continueToComment: false,
  };
}

function autoMergeMacroscopeLowRiskPr({ repo, number, inspection }) {
  const { pr, checks, stats, reviews } = inspection;
  const state = readMergeState(repo, number);
  const strategy = "macroscope-low-risk-squash-v1";
  if (state.headSha === pr.headRefOid && state.strategy === strategy && state.status) {
    return {
      action: "skipped",
      reason: `merge already ${state.status} for this head`,
      continueToComment: false,
    };
  }
  const blocker = autoMergeMacroscopeLowRiskBlocker(pr, checks, stats, reviews);
  if (blocker) return { action: "blocked", reason: blocker, continueToComment: true };

  writeMergeState(repo, number, { headSha: pr.headRefOid, status: "started", strategy });
  const result = runBestEffort("gh", [
    "pr",
    "merge",
    String(number),
    "--repo",
    repo,
    "--squash",
    "--delete-branch",
    "--match-head-commit",
    pr.headRefOid,
    "--subject",
    pr.title ?? `Merge ${repo}#${number}`,
    "--body",
    `Merged by ClawSweeper autonomous Macroscope low-risk gate after green checks and exact-head Macroscope approval for ${pr.headRefOid}.`,
  ]);
  if (result.error || result.status !== 0) {
    const reason =
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      `gh pr merge exited ${result.status}`;
    writeMergeState(repo, number, {
      headSha: pr.headRefOid,
      status: "failed",
      strategy,
      reason: String(reason).slice(0, 1000),
    });
    return {
      action: "blocked",
      reason: `low-risk merge failed: ${String(reason).slice(0, 300)}`,
      continueToComment: false,
    };
  }
  writeMergeState(repo, number, {
    headSha: pr.headRefOid,
    status: "merged",
    strategy,
    output: String(result.stdout || result.stderr || "").slice(0, 1000),
  });
  return {
    action: "merged",
    output: result.stdout || result.stderr || "",
    continueToComment: false,
  };
}

function formatFindings(findings) {
  return findings
    .map((item, index) => {
      const evidence = item.evidence?.length
        ? "\n" + item.evidence.map((line) => `  - ${line}`).join("\n")
        : "";
      return `${index + 1}. **${item.severity.toUpperCase()}: ${item.title}** - ${item.body}${evidence}`;
    })
    .join("\n");
}

function deterministicFallbackComment(repo, number, errorMessage = "", inspection = null) {
  const { pr, checks, findings, stats, labels } = inspection ?? inspectPr(repo, number);
  if (findings.length === 0) {
    return {
      action: "quiet",
      reason: errorMessage
        ? "model_review_failed_no_deterministic_findings"
        : "no_deterministic_findings",
      stats,
    };
  }
  const files = (pr.files ?? []).slice(0, 12).map((file) => {
    const changes = [
      file.additions ? `+${file.additions}` : "",
      file.deletions ? `-${file.deletions}` : "",
    ]
      .filter(Boolean)
      .join(" / ");
    return `- \`${file.path}\`${changes ? ` (${changes})` : ""}`;
  });
  const needsHuman =
    findings.length > 0 ||
    pr.isDraft ||
    (pr.reviewDecision && pr.reviewDecision !== "APPROVED") ||
    checks.some((check) => check.bucket === "fail" || check.bucket === "cancel") ||
    labels.some((label) => /security|major|breaking/i.test(label));
  const nextStep = needsHuman
    ? "Human review is still required before merge."
    : "No deterministic blocker was found; normal repository review and required checks still apply.";
  const body = [
    "ClawSweeper fallback review: deterministic signals found.",
    "",
    "**Summary**",
    `This fallback runner inspected \`${repo}#${number}\` and found ${findings.length} review signal${findings.length === 1 ? "" : "s"}. It does not merge, close, approve, or push branches.`,
    "",
    "**Required before merge**",
    nextStep,
    "",
    "**Findings**",
    findings.length
      ? formatFindings(findings)
      : "No deterministic findings; this comment exists only because model review failed.",
    "",
    "**PR state**",
    `- Author: ${pr.author?.login ?? "unknown"}`,
    `- Base/head: \`${pr.baseRefName}\` <- \`${pr.headRefName}\``,
    `- Head SHA: \`${pr.headRefOid}\``,
    `- Size: ${stats.files} files, +${stats.additions}/-${stats.deletions}`,
    `- Draft: ${pr.isDraft ? "yes" : "no"}`,
    `- Mergeability: ${pr.mergeable ?? "unknown"}`,
    `- Review decision: ${pr.reviewDecision ?? "none"}`,
    "",
    "**Checks**",
    formatCheckSummary(checks),
    "",
    "**Files changed**",
    files.length ? files.join("\n") : "- No changed files were returned by GitHub.",
    "",
    errorMessage
      ? "<details>\n<summary>Why this is fallback triage</summary>\n\nThe model review lane is not active in this runner, so this comment is deterministic PR triage only.\n</details>"
      : "",
    "",
    `<!-- clawsweeper-review item=${number} -->`,
    `<!-- clawsweeper-fallback-runner repo=${repo} item=${number} sha=${pr.headRefOid ?? "unknown"} mode=${fallbackMode} -->`,
    `<!-- clawsweeper-verdict:needs-human item=${number} sha=${pr.headRefOid ?? "unknown"} confidence=medium -->`,
  ]
    .filter((part) => part !== "")
    .join("\n");
  const comments = issueComments(repo, number);
  const existing = patchableComment(comments, number);
  const payload = commentPayloadPath(repo, number, body);
  if (existing?.id) {
    run("gh", [
      "api",
      `repos/${repo}/issues/comments/${existing.id}`,
      "--method",
      "PATCH",
      "--input",
      payload,
    ]);
    return { action: "patched", commentId: existing.id, url: existing.html_url };
  }
  const created = runJson("gh", [
    "api",
    `repos/${repo}/issues/${number}/comments`,
    "--method",
    "POST",
    "--input",
    payload,
  ]);
  return { action: "posted", commentId: created.id, url: created.html_url };
}

function autoRepairBlocker(repo, pr, checks, findings, stats) {
  const [owner] = repo.split("/");
  const headOwner =
    pr.headRepositoryOwner?.login ??
    pr.headRepository?.owner?.login ??
    pr.headRepository?.owner ??
    owner;
  const labels = (pr.labels ?? []).map((label) => label.name).filter(Boolean);
  const files = pr.files ?? [];
  const sensitiveFiles = files
    .map((file) => ({ path: file.path, reason: sensitivePathReason(file.path) }))
    .filter((file) => file.reason);
  const failedChecks = checks.filter(
    (check) => check.bucket === "fail" || check.bucket === "cancel",
  );
  const actionable =
    failedChecks.length > 0 ||
    pr.reviewDecision === "CHANGES_REQUESTED" ||
    findings.some((finding) => /test changes/i.test(finding.title));

  if (!actionable) return "no actionable repair signal";
  if (pr.isDraft) return "draft PR";
  if (!pr.headRefOid) return "missing head SHA";
  if (headOwner !== owner) return `head branch owner is ${headOwner}, not ${owner}`;
  if (pr.isCrossRepository) return "cross-repository PR";
  if (
    labels.some((label) =>
      /security|secret|major|breaking|migration|schema|human-review|do.not.merge|blocked/i.test(
        label,
      ),
    )
  ) {
    return "risk/pause label present";
  }
  if (sensitiveFiles.length) {
    return `sensitive paths changed: ${sensitiveFiles
      .slice(0, 3)
      .map((file) => file.path)
      .join(", ")}`;
  }
  if (stats.files > Number(process.env.CLAWSWEEPER_AUTOREPAIR_MAX_FILES ?? 20)) {
    return `too many changed files (${stats.files})`;
  }
  if (
    stats.additions + stats.deletions >
    Number(process.env.CLAWSWEEPER_AUTOREPAIR_MAX_LINES ?? 800)
  ) {
    return `too large (+${stats.additions}/-${stats.deletions})`;
  }
  return null;
}

function latestReviewNotes(pr, reviewComments) {
  const reviews = (pr.latestReviews ?? [])
    .filter((review) => review?.state && review.state !== "APPROVED")
    .slice(0, 5)
    .map((review) =>
      `- ${review.author?.login ?? "unknown"} ${review.state}: ${review.body ?? ""}`.trim(),
    );
  const comments = (reviewComments ?? []).slice(-20).map((comment) => {
    const path = comment.path
      ? `${comment.path}${comment.line ? `:${comment.line}` : ""}`
      : "review";
    return `- ${path} by ${comment.user?.login ?? "unknown"}: ${String(comment.body ?? "").slice(0, 600)}`;
  });
  return [...reviews, ...comments].join("\n");
}

function buildAutoRepairPrompt({ repo, number, pr, checks, findings, stats, reviewComments }) {
  const files = (pr.files ?? [])
    .slice(0, 50)
    .map((file) => `- ${file.path} (+${file.additions ?? 0}/-${file.deletions ?? 0})`)
    .join("\n");
  const notes = latestReviewNotes(pr, reviewComments);
  return [
    "You are ClawSweeper's autonomous PR repair worker for Amuze.",
    "",
    "Goal: make the current PR branch healthier without waiting for a human to read comments.",
    "",
    "Hard constraints:",
    "- Work only in this checkout.",
    "- Make the narrowest code/test/docs changes needed to address failing checks, requested review changes, or missing test coverage signals.",
    "- Do not merge, close, approve, push, create PRs, change remotes, edit GitHub settings, or use gh.",
    "- Do not touch secrets, credentials, auth config, deployment config, workflows, migrations, or broad dependency surfaces.",
    "- Do not rewrite unrelated code. If the repair is unsafe or unclear, leave the tree unchanged and explain why in the final response.",
    "- Run focused validation for the touched surface when dependencies/tools are available. Always leave a concise final summary with commands run.",
    "",
    `Repository: ${repo}`,
    `PR: #${number} - ${pr.title ?? ""}`,
    `Base/head: ${pr.baseRefName} <- ${pr.headRefName}`,
    `Head SHA: ${pr.headRefOid}`,
    `Size: ${stats.files} files, +${stats.additions}/-${stats.deletions}`,
    "",
    "Deterministic findings:",
    findings.length ? formatFindings(findings) : "- none",
    "",
    "Checks:",
    formatCheckSummary(checks),
    "",
    "Changed files:",
    files || "- none returned",
    "",
    "Review notes:",
    notes || "- none returned",
  ].join("\n");
}

function checkoutPullRequest(repo, number) {
  const { targetDir } = ensureTargetCheckout(repo);
  run("gh", ["pr", "checkout", String(number), "--repo", repo], { cwd: targetDir });
  run("git", ["reset", "--hard"], { cwd: targetDir });
  run("git", ["clean", "-ffd"], { cwd: targetDir });
  run("gh", ["pr", "checkout", String(number), "--repo", repo], { cwd: targetDir });
  return targetDir;
}

function diffNameOnly(targetDir) {
  return run("git", ["diff", "--name-only"], { cwd: targetDir })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function postAutoRepairComment(repo, number, pr, pushedSha, summary) {
  const body = [
    `ClawSweeper autorepair pushed a narrow fix to this PR branch.`,
    "",
    `- Previous head: \`${pr.headRefOid}\``,
    `- Repair commit: \`${pushedSha}\``,
    summary ? `- Worker summary: ${summary.slice(0, 500)}` : "",
    "",
    `<!-- clawsweeper-autorepair repo=${repo} item=${number} old_sha=${pr.headRefOid} repair_sha=${pushedSha} -->`,
  ]
    .filter(Boolean)
    .join("\n");
  const payload = commentPayloadPath(repo, `${number}-autorepair`, body);
  return runJsonBestEffort(
    "gh",
    ["api", `repos/${repo}/issues/${number}/comments`, "--method", "POST", "--input", payload],
    null,
  );
}

function autoRepairPr({ repo, number, model, inspection, codexTimeoutMs }) {
  const { pr, checks, findings, stats, reviewComments } = inspection;
  const state = readRepairState(repo, number);
  const maxAttempts = Number(process.env.CLAWSWEEPER_AUTOREPAIR_MAX_ATTEMPTS_PER_HEAD ?? 1);
  if (state.headSha === pr.headRefOid && Number(state.attempts ?? 0) >= maxAttempts) {
    return {
      action: "skipped",
      reason: "repair already attempted for this head",
      continueToComment: false,
    };
  }

  const blocker = autoRepairBlocker(repo, pr, checks, findings, stats);
  if (blocker) return { action: "blocked", reason: blocker, continueToComment: true };

  writeRepairState(repo, number, {
    headSha: pr.headRefOid,
    attempts: state.headSha === pr.headRefOid ? Number(state.attempts ?? 0) + 1 : 1,
    status: "started",
  });

  const targetDir = checkoutPullRequest(repo, number);
  const prompt = buildAutoRepairPrompt({
    repo,
    number,
    pr,
    checks,
    findings,
    stats,
    reviewComments,
  });
  const repairDir = join(artifactRoot, "repairs", repoSlug(repo), String(number), pr.headRefOid);
  ensureDir(repairDir);
  const promptPath = join(repairDir, "prompt.md");
  const outputPath = join(repairDir, "codex-summary.md");
  writeFileSync(promptPath, prompt);
  const result = runBestEffort(
    "codex",
    [
      "exec",
      "--cd",
      targetDir,
      "--model",
      model,
      "--sandbox",
      "workspace-write",
      "-c",
      'approval_policy="never"',
      "-c",
      'model_reasoning_effort="high"',
      "--output-last-message",
      outputPath,
      "--ephemeral",
      "-",
    ],
    {
      cwd: targetDir,
      env: codexRepairEnv(),
      input: prompt,
      timeoutMs: codexTimeoutMs,
      maxBuffer: 128 * 1024 * 1024,
    },
  );
  writeFileSync(join(repairDir, "codex.stdout.log"), result.stdout ?? "");
  writeFileSync(join(repairDir, "codex.stderr.log"), result.stderr ?? "");
  if (result.error || result.status !== 0) {
    const reason =
      result.error?.message || result.stderr || result.stdout || `codex exited ${result.status}`;
    writeRepairState(repo, number, {
      headSha: pr.headRefOid,
      status: "codex_failed",
      reason: String(reason).slice(0, 1000),
    });
    return {
      action: "blocked",
      reason: `codex repair failed: ${String(reason).slice(0, 300)}`,
      continueToComment: true,
    };
  }

  const changed = diffNameOnly(targetDir);
  if (!changed.length) {
    const summary = existsSync(outputPath) ? readFileSync(outputPath, "utf8").trim() : "";
    writeRepairState(repo, number, {
      headSha: pr.headRefOid,
      status: "no_changes",
      summary: summary.slice(0, 1000),
    });
    return { action: "no_changes", summary, continueToComment: false };
  }

  const unsafeGeneratedChange = changed.find((path) => sensitivePathReason(path));
  if (unsafeGeneratedChange) {
    run("git", ["reset", "--hard"], { cwd: targetDir });
    run("git", ["clean", "-ffd"], { cwd: targetDir });
    writeRepairState(repo, number, {
      headSha: pr.headRefOid,
      status: "unsafe_generated_change",
      changed,
      reason: unsafeGeneratedChange,
    });
    return {
      action: "blocked",
      reason: `repair tried to touch sensitive path ${unsafeGeneratedChange}`,
      continueToComment: true,
    };
  }

  run("git", ["diff", "--check"], { cwd: targetDir });
  run("git", ["config", "user.name", process.env.CLAWSWEEPER_GIT_USER_NAME || "clawsweeper"], {
    cwd: targetDir,
  });
  run(
    "git",
    [
      "config",
      "user.email",
      process.env.CLAWSWEEPER_GIT_USER_EMAIL ||
        "274271284+clawsweeper[bot]@users.noreply.github.com",
    ],
    { cwd: targetDir },
  );
  run("git", ["add", "-A"], { cwd: targetDir });
  run(
    "git",
    [
      "commit",
      "-m",
      `ClawSweeper autorepair ${repo}#${number}`,
      "-m",
      `Autonomous repair for ${pr.url ?? `${repo}#${number}`}.`,
    ],
    { cwd: targetDir },
  );
  const pushedSha = run("git", ["rev-parse", "HEAD"], { cwd: targetDir }).trim();
  run("git", ["push", "origin", `HEAD:${pr.headRefName}`], { cwd: targetDir });
  const summary = existsSync(outputPath) ? readFileSync(outputPath, "utf8").trim() : "";
  const comment = postAutoRepairComment(repo, number, pr, pushedSha, summary);
  writeRepairState(repo, number, {
    headSha: pr.headRefOid,
    status: "pushed",
    pushedSha,
    changed,
    summary: summary.slice(0, 1000),
    commentUrl: comment?.html_url,
  });
  return {
    action: "pushed",
    pushedSha,
    changed,
    commentUrl: comment?.html_url,
    continueToComment: false,
  };
}

function reviewItem({
  repo,
  number,
  model,
  maxPages,
  codexTimeoutMs,
  autorepair,
  automergeDependabot,
  automergeMacroscopeLowRisk,
  adminMerge,
  requireMacroscopeApproval,
}) {
  const slug = repoSlug(repo);
  const itemsDir = join(artifactRoot, "records", slug, "items");
  const closedDir = join(artifactRoot, "records", slug, "closed");
  const reviewDir = join(artifactRoot, "reviews", slug);
  ensureDir(reviewDir);
  ensureDir(itemsDir);
  const common = ["--target-repo", repo, "--items-dir", itemsDir, "--item-number", String(number)];
  const codexEnabled =
    process.env.CLAWSWEEPER_ENABLE_CODEX_REVIEW === "1" ||
    process.env.CLAWSWEEPER_ENABLE_CODEX_REVIEW === "true";
  const inspection = inspectPr(repo, number);
  if (automergeDependabot) {
    const merge = autoMergeDependabotPr({
      repo,
      number,
      inspection,
      adminMerge,
      requireMacroscopeApproval,
    });
    if (merge.action === "merged") {
      return {
        mode: "autonomous-dependabot-merge",
        merge,
        status: "dependabot_merged",
      };
    }
    if (!merge.continueToComment) {
      return {
        mode: "autonomous-dependabot-merge",
        merge,
        status: `dependabot_merge_${merge.action}`,
      };
    }
  }
  if (automergeMacroscopeLowRisk) {
    const merge = autoMergeMacroscopeLowRiskPr({ repo, number, inspection });
    if (merge.action === "merged") {
      return {
        mode: "autonomous-macroscope-low-risk-merge",
        merge,
        status: "macroscope_low_risk_merged",
      };
    }
    if (!merge.continueToComment) {
      return {
        mode: "autonomous-macroscope-low-risk-merge",
        merge,
        status: `macroscope_low_risk_merge_${merge.action}`,
      };
    }
  }
  if (autorepair) {
    const repair = autoRepairPr({ repo, number, model, inspection, codexTimeoutMs });
    if (repair.action === "pushed") {
      return {
        mode: "autonomous-repair",
        repair,
        status: "repair_pushed",
      };
    }
    if (!repair.continueToComment) {
      return {
        mode: "autonomous-repair",
        repair,
        status: `autorepair_${repair.action}`,
      };
    }
  }
  if (!codexEnabled) {
    const comment = deterministicFallbackComment(repo, number, "", inspection);
    return {
      mode: comment.action === "quiet" ? "deterministic-quiet" : "deterministic-smart-fallback",
      copied: [],
      comment,
      status: comment.action === "quiet" ? "quiet_no_findings" : "comment_synced",
    };
  }
  const { targetDir, branch } = ensureTargetCheckout(repo);
  const targetEnv = { CLAWSWEEPER_TARGET_DEFAULT_BRANCH: branch };
  try {
    run(
      "node",
      [
        "dist/clawsweeper.js",
        "review",
        ...common,
        "--target-dir",
        targetDir,
        "--artifact-dir",
        reviewDir,
        "--batch-size",
        "1",
        "--max-pages",
        String(maxPages),
        "--skip-start-comment",
        "--codex-model",
        model,
        "--codex-timeout-ms",
        String(codexTimeoutMs),
        "--additional-prompt",
        "This is the Amuze fallback runner using Jay's GitHub auth because the upstream ClawSweeper GitHub App private key is unavailable. Stay read-only. Do not propose auto-close or branch mutations.",
      ],
      { timeoutMs: codexTimeoutMs + 120_000, env: targetEnv },
    );
    const copied = copyReviewArtifacts(reviewDir, itemsDir, repo);
    run(
      "node",
      [
        "dist/clawsweeper.js",
        "apply-decisions",
        ...common,
        "--closed-dir",
        closedDir,
        "--sync-comments-only",
        "--comment-sync-min-age-days",
        "0",
        "--processed-limit",
        "1",
        "--limit",
        "0",
      ],
      { env: targetEnv },
    );
    return { mode: "codex", copied };
  } catch (error) {
    const copied = existsSync(reviewDir) ? copyReviewArtifacts(reviewDir, itemsDir, repo) : [];
    const comment = deterministicFallbackComment(repo, number, error.message, inspection);
    return { mode: "deterministic-fallback", copied, comment };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const org = args.org || defaultOrg;
  const maxItems = Number(args.max_items ?? 2);
  const maxPages = Number(args.max_pages ?? 2);
  const model = args.codex_model || "gpt-5.5";
  const codexTimeoutMs = Number(args.codex_timeout_ms ?? 600_000);
  const autorepair = autoRepairEnabled(args);
  const automergeDependabot = autoMergeDependabotEnabled(args);
  const automergeMacroscopeLowRisk = autoMergeMacroscopeLowRiskEnabled(args);
  const adminMerge = autoMergeAdminEnabled(args);
  const requireMacroscopeApproval = requireMacroscopeApprovalEnabled(args);
  const repos = listRepos(org, args.repos);
  const codexEnabled =
    process.env.CLAWSWEEPER_ENABLE_CODEX_REVIEW === "1" ||
    process.env.CLAWSWEEPER_ENABLE_CODEX_REVIEW === "true";
  let processed = 0;
  const summary = [];
  for (const repo of repos) {
    if (processed >= maxItems) break;
    const slug = repoSlug(repo);
    const itemsDir = join(artifactRoot, "records", slug, "items");
    ensureDir(itemsDir);
    let due = [];
    try {
      const capacity = Math.max(1, maxItems - processed);
      due = codexEnabled
        ? planDueItems(repo, itemsDir, maxPages, capacity)
        : listOpenPullRequestNumbers(repo, maxPages);
    } catch (error) {
      summary.push({ repo, status: "plan_failed", error: error.message });
      appendHistory({ repo, status: "plan_failed", error: error.message });
      continue;
    }
    for (const number of due) {
      if (processed >= maxItems) break;
      try {
        if (!autorepair && !args.refresh && currentFallbackComment(repo, number)) {
          processed += 1;
          summary.push({ repo, number, status: "skipped_current_fallback_comment" });
          appendHistory({ repo, number, status: "skipped_current_fallback_comment" });
          continue;
        }
        const result = reviewItem({
          repo,
          number,
          model,
          maxPages,
          codexTimeoutMs,
          autorepair,
          automergeDependabot,
          automergeMacroscopeLowRisk,
          adminMerge,
          requireMacroscopeApproval,
        });
        const status = result.status ?? "comment_synced";
        const consumedBudget = !["autorepair_skipped", "dependabot_merge_skipped"].includes(status);
        if (consumedBudget) processed += 1;
        summary.push({ repo, number, status, ...result });
        appendHistory({ repo, number, status, ...result });
      } catch (error) {
        processed += 1;
        summary.push({ repo, number, status: "review_failed", error: error.message });
        appendHistory({ repo, number, status: "review_failed", error: error.message });
      }
    }
  }
  console.log(JSON.stringify({ processed, summary }, null, 2));
  if (processed === 0) process.exitCode = 0;
}

main();
