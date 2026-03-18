#!/usr/bin/env node
/**
 * flow-finish.mjs — PR Description + Jira Comment generator
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --pre-checks   Verify clean working dir, branch protection, current branch
 *   --context      Collect all git context needed to generate descriptions
 *   --push         Execute `git push origin <branch>` and return result
 */

import { run, runSafe, parseArgs, PROTECTED_BRANCHES } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import os from "os";
import fs from "fs";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_PATTERNS = [
  {
    pattern: /github\.com/,
    name: "GitHub",
    commitPath: "/commit/",
    normalize: (url) =>
      url
        .replace(/^git@github\.com:(.*)/, "https://github.com/$1")
        .replace(/\.git$/, ""),
  },
  {
    pattern: /gitlab\.com/,
    name: "GitLab",
    commitPath: "/-/commit/",
    normalize: (url) =>
      url
        .replace(/^git@gitlab\.com:(.*)/, "https://gitlab.com/$1")
        .replace(/\.git$/, ""),
  },
  {
    pattern: /bitbucket\.org/,
    name: "Bitbucket",
    commitPath: "/commits/",
    normalize: (url) =>
      url
        .replace(/^git@bitbucket\.org:(.*)/, "https://bitbucket.org/$1")
        .replace(/\.git$/, ""),
  },
  {
    pattern: /dev\.azure\.com/,
    name: "Azure DevOps",
    commitPath: "/commit/",
    normalize: (url) =>
      url
        .replace(
          /^git@ssh\.dev\.azure\.com:v3\/(.*)/,
          "https://dev.azure.com/$1",
        )
        .replace(/\.git$/, ""),
  },
  {
    pattern: /gitlab/,
    name: "GitLab (Self-Hosted)",
    commitPath: "/-/commit/",
    normalize: (url) =>
      url.replace(/^git@([^:]+):(.*)/, "https://$1/$2").replace(/\.git$/, ""),
  },
  {
    pattern: /github/,
    name: "GitHub Enterprise",
    commitPath: "/commit/",
    normalize: (url) =>
      url.replace(/^git@([^:]+):(.*)/, "https://$1/$2").replace(/\.git$/, ""),
  },
];

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(remoteUrl) {
  if (!remoteUrl) return { name: "Unknown", commitUrlPattern: "" };
  for (const p of PLATFORM_PATTERNS) {
    if (p.pattern.test(remoteUrl)) {
      const baseUrl = p.normalize(remoteUrl);
      return {
        name: p.name,
        commitUrlPattern: baseUrl + p.commitPath,
      };
    }
  }
  return { name: "Unknown", commitUrlPattern: "" };
}

// ─── File categorization ──────────────────────────────────────────────────────

function categorizeFile(filePath) {
  const f = filePath.replace(/\\/g, "/").toLowerCase();
  if (/\.(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs)$/.test(f))
    return "tests";
  if (/(\/tests?\/|\/specs?\/|__tests__)/.test(f)) return "tests";
  if (/migration|\.sql$/.test(f)) return "database";
  if (/(controller|service|repository|handler|route|api\/|endpoint)/.test(f))
    return "backend";
  if (/(component|view|page|screen|widget|\.tsx?$)/.test(f)) return "frontend";
  if (/\.md$/.test(f)) return "docs";
  return "config";
}

function detectFilePurpose(filePath) {
  const f = filePath.toLowerCase();
  if (/controller|route|handler/.test(f)) return "API endpoint";
  if (/service|repository/.test(f)) return "Business logic";
  if (/entity|model|schema/.test(f)) return "Data model";
  if (/test|spec/.test(f)) return "Tests";
  if (/migration/.test(f)) return "Database migration";
  if (/\.md$/.test(f)) return "Documentation";
  return "Source code";
}

// ─── Deployment detection ─────────────────────────────────────────────────────

function detectDeployment(changedFiles) {
  const files = changedFiles.map((f) => f.toLowerCase());

  const hasMigrations = files.some((f) =>
    /migration|migrate|schema.*\.sql$|\.sql$/.test(f),
  );

  // New env vars from .env.example diffs
  const newEnvVars = [];
  const envFiles = changedFiles.filter((f) =>
    /\.env\.example|\.env\.template|\.env\.sample|env\.example/.test(
      f.toLowerCase(),
    ),
  );
  for (const ef of envFiles) {
    const diff = runSafe(
      `git diff --diff-filter=A HEAD~1 HEAD -- "${ef}" 2>/dev/null || git diff HEAD~1 HEAD -- "${ef}"`,
    );
    if (diff.ok) {
      const matches = diff.output.match(/^\+([A-Z_][A-Z0-9_]*)=/gm) || [];
      newEnvVars.push(...matches.map((m) => m.slice(1).split("=")[0]));
    }
  }

  // Dependency manager detection
  const depManagers = [
    { pattern: /^package\.json$/, cmd: "npm install" },
    {
      pattern: /requirements\.txt|pyproject\.toml|Pipfile/,
      cmd: "pip install -r requirements.txt",
    },
    { pattern: /composer\.json/, cmd: "composer install" },
    { pattern: /Gemfile$/, cmd: "bundle install" },
    { pattern: /go\.(mod|sum)/, cmd: "go mod download" },
    { pattern: /Cargo\.(toml|lock)/, cmd: "cargo build" },
    { pattern: /\.csproj/, cmd: "dotnet restore" },
    { pattern: /pom\.xml/, cmd: "mvn install" },
    { pattern: /build\.gradle/, cmd: "gradle build" },
  ];

  let hasNewDeps = false;
  let installCmd = "";
  for (const dm of depManagers) {
    if (files.some((f) => dm.pattern.test(path.basename(f)))) {
      hasNewDeps = true;
      installCmd = dm.cmd;
      break;
    }
  }

  return {
    hasMigrations,
    newEnvVars: [...new Set(newEnvVars)],
    hasNewDeps,
    installCmd,
    showDeploymentNotes: hasMigrations || newEnvVars.length > 0 || hasNewDeps,
  };
}

// ─── Impact area detection ────────────────────────────────────────────────────

function detectImpactArea(changedFiles) {
  const files = changedFiles.join(" ").toLowerCase();

  if (
    /controller|service|repository|handler|route|api\/|endpoint/.test(files)
  ) {
    const module = /auth|login|jwt|session/.test(files)
      ? "Authentication"
      : /payment|billing|stripe|paypal/.test(files)
        ? "Payments"
        : /notification|email|sms|push/.test(files)
          ? "Notifications"
          : /report|analytics|dashboard/.test(files)
            ? "Analytics"
            : "";
    return module ? `Backend API - ${module}` : "Backend API";
  }

  if (/component|view|page|screen|widget|\.tsx/.test(files)) {
    const module = /auth|login/.test(files)
      ? "Authentication UI"
      : /dashboard|home/.test(files)
        ? "Dashboard"
        : /profile|account|settings/.test(files)
          ? "User Profile"
          : "";
    return module ? `Frontend - ${module}` : "Frontend";
  }

  if (/ios\/|android\/|mobile\/|\.swift|\.kt|\.dart/.test(files))
    return "Mobile";
  if (/migration|schema|seed|model|entity|\.sql/.test(files))
    return "Database - Schema";
  if (/docker|k8s|kubernetes|terraform|ansible|\.github|\.gitlab/.test(files))
    return "Infrastructure - DevOps";
  if (/test|spec|e2e|integration/.test(files)) return "Testing";
  if (/\.md$|docs?\/|readme/.test(files)) return "Documentation";

  return "General";
}

// ─── --pre-checks ─────────────────────────────────────────────────────────────

function preChecks() {
  const errors = [];
  const warnings = [];

  // Current branch
  const currentBranch = runSafe("git branch --show-current");
  const branch = currentBranch.ok ? currentBranch.output : "unknown";

  // Protected branch check
  const isProtectedBranch = PROTECTED_BRANCHES.includes(branch);
  if (isProtectedBranch) {
    errors.push(
      `Branch '${branch}' is protected. Create a feature branch first: git checkout -b feature/<name>`,
    );
  }

  // Working directory clean check
  const statusResult = runSafe("git status --porcelain");
  const statusLines = statusResult.ok
    ? statusResult.output
        .split("\n")
        .filter((l) => l && /^.{2} .+$/.test(l) && !l.trim().endsWith(" nul"))
    : [];
  const isClean = statusLines.length === 0;
  const uncommittedFiles = statusLines.map((l) => l.slice(3).trim());

  if (!isClean) {
    warnings.push(
      `There are ${uncommittedFiles.length} uncommitted file(s). Run /flow-commit first.`,
    );
  }

  const result = {
    isClean,
    uncommittedFiles,
    isProtectedBranch,
    currentBranch: branch,
    errors,
    warnings,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --context ────────────────────────────────────────────────────────────────

function context() {
  // Branch
  const branchResult = runSafe("git branch --show-current");
  const branch = branchResult.ok ? branchResult.output : "unknown";

  // Remote
  const remoteResult = runSafe("git config --get remote.origin.url");
  const remoteUrl = remoteResult.ok ? remoteResult.output : "";
  const { name: platform, commitUrlPattern } = detectPlatform(remoteUrl);

  // Base branch detection
  let baseBranch = "main";
  for (const b of ["main", "master", "develop", "development"]) {
    const r = runSafe(`git rev-parse --verify ${b} 2>/dev/null`);
    if (r.ok) {
      baseBranch = b;
      break;
    }
  }

  // Commits since base branch
  const logResult = runSafe(
    `git log ${baseBranch}..HEAD --format="%H|%h|%s" 2>/dev/null || git log --oneline -20 --format="%H|%h|%s"`,
  );
  const rawCommits = logResult.ok
    ? logResult.output.split("\n").filter(Boolean)
    : [];

  const commits = rawCommits.map((line) => {
    const [fullHash, hash, ...subjectParts] = line.split("|");
    const subject = subjectParts.join("|");
    const url = commitUrlPattern ? commitUrlPattern + (fullHash || hash) : "";
    return { hash: hash || fullHash, fullHash: fullHash || hash, subject, url };
  });

  const totalCommits = commits.length;

  // Commit hashes summary (first 5 with links)
  const displayCommits = commits.slice(0, 5);
  let commitHashesSummary = displayCommits
    .map((c) => (c.url ? `[${c.hash}](${c.url})` : `\`${c.hash}\``))
    .join(", ");
  if (totalCommits > 5) {
    commitHashesSummary += `, ... (${totalCommits} total)`;
  } else if (totalCommits > 0) {
    commitHashesSummary += ` (${totalCommits} total)`;
  }

  // File stats
  const statResult = runSafe(
    `git diff --stat ${baseBranch}..HEAD 2>/dev/null || git diff --stat HEAD~${Math.max(totalCommits, 1)} HEAD`,
  );
  let filesChanged = 0;
  let linesAdded = 0;
  let linesDeleted = 0;
  if (statResult.ok) {
    const lastLine = statResult.output.split("\n").filter(Boolean).pop() || "";
    const fc = lastLine.match(/(\d+)\s+file/);
    const la = lastLine.match(/(\d+)\s+insertion/);
    const ld = lastLine.match(/(\d+)\s+deletion/);
    if (fc) filesChanged = parseInt(fc[1], 10);
    if (la) linesAdded = parseInt(la[1], 10);
    if (ld) linesDeleted = parseInt(ld[1], 10);
  }

  // Changed files list
  const filesResult = runSafe(
    `git diff --name-only ${baseBranch}..HEAD 2>/dev/null || git diff --name-only HEAD~${Math.max(totalCommits, 1)} HEAD`,
  );
  const changedFiles = filesResult.ok
    ? filesResult.output.split("\n").filter(Boolean)
    : [];

  // Files by category
  const filesByCategory = {
    frontend: 0,
    backend: 0,
    tests: 0,
    docs: 0,
    config: 0,
    database: 0,
  };
  for (const f of changedFiles) {
    const cat = categorizeFile(f);
    if (cat in filesByCategory) filesByCategory[cat]++;
    else filesByCategory.config++;
  }

  // Top files by lines changed
  const topFilesResult = runSafe(
    `git diff --stat ${baseBranch}..HEAD 2>/dev/null | sort -t'|' -k3 -rn | head -5`,
  );
  // Simpler approach: just take the first 3-5 changed files with purpose
  const topFiles = changedFiles.slice(0, 5).map((file) => ({
    file,
    purpose: detectFilePurpose(file),
  }));

  // Breaking changes
  const breakingResult = runSafe(
    `git log ${baseBranch}..HEAD --grep="BREAKING CHANGE" --format="%h|%s" 2>/dev/null || git log --oneline -50 --grep="BREAKING CHANGE" --format="%h|%s"`,
  );
  const breakingCommits =
    breakingResult.ok && breakingResult.output
      ? breakingResult.output
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [hash, ...subj] = l.split("|");
            return { hash, subject: subj.join("|") };
          })
      : [];
  const hasBreakingChanges = breakingCommits.length > 0;

  // Deployment info
  const deployment = detectDeployment(changedFiles);

  // Impact area
  const impactArea = detectImpactArea(changedFiles);

  const result = {
    branch,
    remote: "origin",
    platform,
    commitUrlPattern,
    commits,
    totalCommits,
    commitHashesSummary,
    fileStats: { filesChanged, linesAdded, linesDeleted },
    filesByCategory,
    topFiles,
    hasBreakingChanges,
    breakingCommits,
    deployment,
    impactArea,
    baseBranch,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --push ───────────────────────────────────────────────────────────────────

function push() {
  const branchResult = runSafe("git branch --show-current");
  const branch = branchResult.ok ? branchResult.output : "unknown";

  const pushResult = runSafe(`git push origin "${branch}"`);

  const result = {
    success: pushResult.ok,
    branch,
    remote: "origin",
    output: pushResult.output,
    error: pushResult.ok ? null : pushResult.output,
  };

  if (!pushResult.ok) {
    process.stderr.write(`Push failed: ${pushResult.output}\n`);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["pre-checks"]) {
  preChecks();
} else if (flags["context"]) {
  context();
} else if (flags["push"]) {
  push();
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-finish.mjs --pre-checks\n" +
      "  node flow-finish.mjs --context\n" +
      "  node flow-finish.mjs --push\n",
  );
  process.exit(1);
}
