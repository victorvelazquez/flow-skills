#!/usr/bin/env node
/**
 * flow-skills.mjs — flow-skills-sync-specific context and automation
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --context      Detect mode + gather git/version context → JSON
 *   --run-export   Run install.mjs --export, return exported file list → JSON
 *   --update       Run git pull + node install.mjs → JSON result
 */

import { run, runSafe, parseArgs, readJsonFile } from "./lib/helpers.mjs";
import path from "path";
import os from "os";
import process from "process";

// ─── Remote URL parsing ───────────────────────────────────────────────────────
// Handles:
//   SSH:   git@github.com:owner/repo.git
//   HTTPS: https://github.com/owner/repo.git  (or no .git suffix)

function parseRemoteUrl(remoteUrl) {
  if (!remoteUrl) return { owner: null, repo: null };
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/git@[^:]+:([^/]+)\/([^.]+)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(
    /https?:\/\/[^/]+\/([^/]+)\/([^.]+)(?:\.git)?$/,
  );
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  return { owner: null, repo: null };
}

// ─── Suggested bump computation ───────────────────────────────────────────────
// HINT ONLY — LLM must validate against commit semantics before accepting.
// A commit like "chore: add new skill" may warrant MINOR even without feat: prefix.

function computeSuggestedBump(commitLog) {
  for (const line of commitLog) {
    // MAJOR: BREAKING CHANGE in body, or ! after type (e.g. feat!:)
    if (/BREAKING[\s-]CHANGE/i.test(line) || /^\w+[^:]*!:/.test(line))
      return "MAJOR";
  }
  for (const line of commitLog) {
    // MINOR: feat(...) or feat:
    if (/feat[\(:]/i.test(line)) return "MINOR";
  }
  return "PATCH";
}

function computeSuggestedVersion(current, bump) {
  const parts = current.split(".").map(Number);
  const [major, minor, patch] = parts;
  if (bump === "MAJOR") return `${major + 1}.0.0`;
  if (bump === "MINOR") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ─── --context ────────────────────────────────────────────────────────────────

function getContext() {
  // Is this a git repo?
  const revParse = runSafe("git rev-parse --show-toplevel");
  if (!revParse.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          mode: "install",
          modeReason: "Not in a git repository",
          git: {
            branch: null,
            isOnMain: false,
            hasOrigin: false,
            remoteUrl: null,
            owner: null,
            repo: null,
            upstreamCommits: 0,
            aheadCommits: 0,
          },
          version: null,
          prUrl: null,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // Fetch to check upstream (network call — ignore failure)
  runSafe("git fetch origin");

  // Branch — handle detached HEAD (empty output)
  const branchResult = runSafe("git branch --show-current");
  const branch =
    branchResult.ok && branchResult.output ? branchResult.output : "detached";
  const isOnMain = branch === "main" || branch === "master";

  // Remote URL
  const remoteResult = runSafe("git remote get-url origin");
  const remoteUrl = remoteResult.ok ? remoteResult.output : null;
  const hasOrigin = remoteResult.ok && !!remoteResult.output;
  const { owner, repo } = parseRemoteUrl(remoteUrl);

  // Upstream vs local divergence
  const upstreamResult = runSafe("git log HEAD..origin/main --oneline");
  const upstreamLines =
    upstreamResult.ok && upstreamResult.output
      ? upstreamResult.output.split("\n").filter(Boolean)
      : [];
  const upstreamCommits = upstreamLines.length;

  const aheadResult = runSafe("git log origin/main..HEAD --oneline");
  const aheadCommits =
    aheadResult.ok && aheadResult.output
      ? aheadResult.output.split("\n").filter(Boolean).length
      : 0;

  // Last tag + commits since tag
  let lastTag = "v0.0.0";
  const describeResult = runSafe("git describe --tags --abbrev=0");
  if (describeResult.ok && describeResult.output) {
    lastTag = describeResult.output.trim() || "v0.0.0";
  } else {
    // Fallback: try listing tags sorted by version
    const tagFallback = runSafe("git tag --sort=-version:refname");
    if (tagFallback.ok && tagFallback.output) {
      const firstTag = tagFallback.output.split("\n").filter(Boolean)[0];
      if (firstTag) lastTag = firstTag;
    }
  }

  let commitsSinceTag = [];
  const logResult = runSafe(`git log ${lastTag}..HEAD --oneline --no-merges`);
  if (logResult.ok && logResult.output) {
    commitsSinceTag = logResult.output.split("\n").filter(Boolean);
  }

  // Version from package.json
  const pkg = readJsonFile("package.json");
  const currentVersion = pkg && pkg.version ? pkg.version : "0.0.0";

  // Suggested bump and version (HINT ONLY)
  const suggestedBump = computeSuggestedBump(commitsSinceTag);
  const suggestedVersion = computeSuggestedVersion(currentVersion, suggestedBump);

  // Mode detection — check for pending export changes via dry-run
  const installPath = path.join(process.cwd(), "install.mjs");
  const dryRunResult = runSafe(`node "${installPath}" --export --dry-run`);
  let hasPendingExport = false;
  if (dryRunResult.ok && dryRunResult.output) {
    // install.mjs dry-run summary: "  Dry-run complete — X of Y files would be exported."
    // Also check skill-level status lines like "skillname — N files would update"
    const dryOut = dryRunResult.output;
    const summaryMatch = dryOut.match(/(\d+) of \d+ files would be exported/i);
    if (summaryMatch) {
      hasPendingExport = parseInt(summaryMatch[1], 10) > 0;
    } else {
      // Fallback: check for "would update" lines (individual skill status)
      hasPendingExport =
        /would (update|export)/i.test(dryOut) &&
        !/0 of \d+ files/i.test(dryOut);
    }
  }

  // Mode priority: install < synced < update < publish
  let mode = "synced";
  let modeReason = "Local and remote are in sync";

  if (hasPendingExport) {
    mode = "publish";
    modeReason = "Local opencode files have changes not yet exported to repo";
  } else if (upstreamCommits > 0 && aheadCommits === 0) {
    mode = "update";
    modeReason = `Remote has ${upstreamCommits} new commit(s) not yet pulled`;
  } else if (aheadCommits > 0) {
    mode = "publish";
    modeReason = `Local has ${aheadCommits} commit(s) not yet pushed to remote`;
  }

  // PR URL (pre-built for suggestedVersion; recalculate if version overridden)
  const isGitHub = remoteUrl && remoteUrl.includes("github.com");
  const prUrl =
    owner && repo && isGitHub
      ? `https://github.com/${owner}/${repo}/compare/release/v${suggestedVersion}?expand=1`
      : null;

  const result = {
    mode,
    modeReason,
    git: {
      branch,
      isOnMain,
      hasOrigin,
      remoteUrl,
      owner,
      repo,
      upstreamCommits,
      aheadCommits,
    },
    version: {
      current: currentVersion,
      lastTag,
      commitsSinceTag,
      // HINT ONLY: suggestedBump is computed from commit prefix patterns only.
      // The LLM MUST validate this against commit semantics before accepting.
      // A commit like "chore: add new skill" may warrant MINOR even without feat: prefix.
      suggestedBump,
      suggestedVersion,
    },
    prUrl,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --run-export ─────────────────────────────────────────────────────────────
// WRITE OPERATION — has side effects (copies files from opencode → repo)
// Call EXACTLY ONCE per publish cycle. Use git diff --name-only for subsequent file list queries.

function runExport() {
  const installPath = path.join(process.cwd(), "install.mjs");
  const result = runSafe(`node "${installPath}" --export`);

  // install.mjs outputs "  exported: {relPath}" lines via plain console.log (no ANSI on the path)
  const exportedFiles = [];
  if (result.ok && result.output) {
    const lines = result.output.split("\n");
    for (const line of lines) {
      const match = line.match(/^  exported: (.+)$/);
      if (match) exportedFiles.push(match[1].trim());
    }
  }

  const output = {
    exported: exportedFiles.length > 0,
    files: exportedFiles,
    count: exportedFiles.length,
    nothing: exportedFiles.length === 0,
  };

  if (!result.ok) {
    output.exported = false;
    output.files = [];
    output.count = 0;
    output.nothing = true;
    output.error = result.output;
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

// ─── --update ─────────────────────────────────────────────────────────────────

function runUpdate() {
  // Verify git repo
  const revParse = runSafe("git rev-parse --show-toplevel");
  if (!revParse.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          pull: { ok: false, output: "Not in a git repository" },
          install: null,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // git pull
  const pullResult = runSafe("git pull");
  if (!pullResult.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          pull: { ok: false, output: pullResult.output },
          install: null,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // node install.mjs
  const installPath = path.join(process.cwd(), "install.mjs");
  const installResult = runSafe(`node "${installPath}"`);
  if (!installResult.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          pull: { ok: true, output: pullResult.output },
          install: { ok: false, output: installResult.output },
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        pull: { ok: true, output: pullResult.output },
        install: { ok: true, output: installResult.output },
      },
      null,
      2,
    ) + "\n",
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["context"]) {
  getContext();
} else if (flags["run-export"]) {
  runExport();
} else if (flags["update"]) {
  runUpdate();
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-skills.mjs --context\n" +
      "  node flow-skills.mjs --run-export\n" +
      "  node flow-skills.mjs --update\n",
  );
  process.exit(1);
}
