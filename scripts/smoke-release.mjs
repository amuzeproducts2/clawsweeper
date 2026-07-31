#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const releaseRoot = resolve(process.argv[2] || new URL("..", import.meta.url).pathname);
const requiredFiles = [
  "config/automation-limits.json",
  "config/target-repositories.json",
  "prompts/review-item.md",
  "prompts/pr-close-coverage-proof.md",
  "schema/clawsweeper-decision.schema.json",
  "schema/clawsweeper-pr-close-coverage-proof.schema.json",
  "dist/clawsweeper.js",
  "dist/limits.js",
  "dist/repository-profiles.js",
];

for (const relativePath of requiredFiles) {
  const path = join(releaseRoot, relativePath);
  if (!existsSync(path)) throw new Error(`release smoke missing ${relativePath}`);
}

for (const relativePath of requiredFiles.filter((path) => path.endsWith(".json"))) {
  JSON.parse(readFileSync(join(releaseRoot, relativePath), "utf8"));
}

const importReleaseModule = async (relativePath) =>
  import(`${pathToFileURL(join(releaseRoot, relativePath)).href}?release-smoke=${Date.now()}`);

const limits = await importReleaseModule("dist/limits.js");
const workerConfig = limits.readWorkerConfig(join(releaseRoot, "config/automation-limits.json"));
if (!workerConfig?.workers?.max) throw new Error("plan smoke could not load worker limits");

const profiles = await importReleaseModule("dist/repository-profiles.js");
const profile = profiles.repositoryProfileFor("amuzeproducts2/clawsweeper");
if (!profile?.targetRepo) throw new Error("plan smoke could not resolve a repository profile");

const clawsweeper = await importReleaseModule("dist/clawsweeper.js");
const reviewPrompt = clawsweeper.reviewPromptTemplate();
const reviewSchema = JSON.parse(clawsweeper.reviewDecisionSchemaText());
if (!reviewPrompt.trim() || !reviewSchema?.type) {
  throw new Error("review smoke could not load its prompt and decision schema");
}

console.log(
  JSON.stringify({
    ok: true,
    plan: { workerMax: workerConfig.workers.max, targetRepo: profile.targetRepo },
    review: { promptBytes: Buffer.byteLength(reviewPrompt), schemaType: reviewSchema.type },
  }),
);
