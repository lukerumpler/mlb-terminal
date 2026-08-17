import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, "release", "release-gate-baseline.json");

function shortSha(value) {
  return String(value || "").slice(0, 7);
}

export function assessReleaseComparison({
  sharedCommit,
  githubCommit,
  baseline,
}) {
  const acceptedGithubMain = String(baseline?.acceptedGithubMain || "");
  const githubRepository = String(baseline?.githubRepository || "");

  if (
    !sharedCommit ||
    !githubCommit ||
    !acceptedGithubMain ||
    !githubRepository
  ) {
    return {
      status: "error",
      exitCode: 1,
      summary:
        "Release comparison is missing a required commit or baseline setting.",
    };
  }

  if (githubCommit === acceptedGithubMain) {
    return {
      status: "pass",
      exitCode: 0,
      summary: `GitHub main (${shortSha(githubCommit)}) matches the reviewed baseline; shared commit is ${shortSha(sharedCommit)}.`,
      sharedCommit,
      githubCommit,
      githubRepository,
    };
  }

  return {
    status: "review-required",
    exitCode: 2,
    summary: `GitHub main advanced from reviewed ${shortSha(acceptedGithubMain)} to ${shortSha(githubCommit)}. Review compatibility before publishing.`,
    sharedCommit,
    githubCommit,
    githubRepository,
    acceptedGithubMain,
    audit: baseline.audit || "GITHUB_SYNC_AUDIT.md",
  };
}

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function readBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function readGithubMain(repository) {
  return run("gh", ["api", `repos/${repository}/commits/main`, "--jq", ".sha"]);
}

export function main({ runCommand = run, baseline = readBaseline() } = {}) {
  try {
    const sharedCommit = runCommand("git", ["rev-parse", "HEAD"]);
    const githubCommit = readGithubMain(baseline.githubRepository);
    const report = assessReleaseComparison({
      sharedCommit,
      githubCommit,
      baseline,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
    return report;
  } catch (error) {
    const report = {
      status: "error",
      exitCode: 1,
      summary: error instanceof Error ? error.message : String(error),
    };
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
    return report;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
