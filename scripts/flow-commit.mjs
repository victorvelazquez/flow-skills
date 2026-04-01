#!/usr/bin/env node
/**
 * flow-commit.mjs — Universal git workflow automation
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto                                           Run the full automatic happy-path flow
 *   --analyze                                        Detect changes → output JSON
 *   --analyze --known-files "f1,f2"                  Same but filter to known files only (safe re-scan)
 *   --commit --files "f1,f2" --message "msg"         Stage + commit files
 *   --summary [--count N] [--known-files "f1,f2"]    Show last N commits + post-commit safety check
 *   --create-branch --name "type/slug"               Create and checkout new branch (auto-retry suffixes)
 */

import { run, runSafe, parseArgs, PROTECTED_BRANCHES } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";

const DEFAULT_MAX_AUTO_ROUNDS = 3;
const DEFAULT_BRANCH_ATTEMPTS = 5;

function hasTruthyFlag(value) {
  if (value === true) return true;
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

// ─── Stack detection ──────────────────────────────────────────────────────────

function detectStack() {
  const cwd = process.cwd();

  const exists = (file) => fs.existsSync(path.join(cwd, file));
  const glob = (pattern) => {
    try {
      const files = fs.readdirSync(cwd);
      return files.some((f) => {
        if (pattern.startsWith("*.")) return f.endsWith(pattern.slice(1));
        return f === pattern || f.startsWith(pattern.replace("*", ""));
      });
    } catch {
      return false;
    }
  };

  if (exists("package.json")) return "node";
  if (
    exists("requirements.txt") ||
    exists("pyproject.toml") ||
    exists("setup.py")
  )
    return "python";
  if (exists("pom.xml") || exists("build.gradle") || exists("build.gradle.kts"))
    return "java";
  if (exists("go.mod")) return "go";
  if (exists("Cargo.toml")) return "rust";
  if (glob("*.csproj") || glob("*.sln")) return "dotnet";
  return "generic";
}

// ─── Feature detection (stack-agnostic) ──────────────────────────────────────

function classifyFeature(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 0) return "root";

  const rootDirs = ["src", "app", "lib"];
  for (let i = 0; i < parts.length - 1; i++) {
    if (rootDirs.includes(parts[i]) && parts[i + 1]) {
      return parts[i + 1];
    }
  }

  if (parts.length > 1) {
    return parts[0];
  }

  return "root";
}

// ─── File type detection (agnostic by extension/pattern) ─────────────────────

function classifyType(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (
    /\.(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs|rb)$/.test(basename) ||
    /_(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs|rb)$/.test(basename) ||
    basename === "test.go" ||
    normalized.includes("/__tests__/") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/spec/") ||
    normalized.includes("/specs/")
  ) {
    return "test";
  }

  if (
    (ext === ".md" || ext === ".rst" || ext === ".txt") &&
    (normalized.split("/").filter(Boolean).length === 1 ||
      normalized.includes("/docs/") ||
      normalized.includes("/doc/"))
  ) {
    return "doc";
  }

  const configNames = new Set([
    "package.json",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "tsconfig.base.json",
    "eslint.config.js",
    "eslint.config.ts",
    "eslint.config.mjs",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.ts",
    ".eslintrc.json",
    ".eslintrc.cjs",
    ".prettierrc",
    ".prettierrc.js",
    ".prettierrc.json",
    ".prettierignore",
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".env",
    ".env.example",
    ".env.local",
    ".env.test",
    ".env.production",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Makefile",
    "makefile",
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "go.mod",
    "go.sum",
    "Cargo.toml",
    "Cargo.lock",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "jest.config.js",
    "jest.config.ts",
    "jest.config.mjs",
    "vitest.config.ts",
    "vitest.config.js",
    "playwright.config.ts",
    "playwright.config.js",
    "tailwind.config.js",
    "tailwind.config.ts",
    "postcss.config.js",
    "postcss.config.ts",
    "babel.config.js",
    "babel.config.json",
    "lint-staged.config.js",
    "commitlint.config.js",
    ".husky/pre-commit",
    ".husky/commit-msg",
  ]);

  if (configNames.has(basename)) return "config";

  if (ext === ".toml" || ext === ".cfg" || ext === ".ini") {
    const depth = normalized.split("/").length;
    if (depth <= 2) return "config";
  }

  if (
    basename.startsWith("Dockerfile") ||
    basename.startsWith("docker-compose") ||
    basename.endsWith(".sh") ||
    normalized.startsWith(".husky/") ||
    normalized.startsWith(".circleci/") ||
    normalized.startsWith(".gitlab/") ||
    normalized.startsWith(".github/workflows/") ||
    normalized.startsWith(".github/actions/")
  ) {
    return "config";
  }

  if (normalized.startsWith(".github/")) {
    return "doc";
  }

  if (
    (ext === ".yml" || ext === ".yaml" || ext === ".json") &&
    !normalized.includes("/")
  ) {
    return "config";
  }

  return "source";
}

function normalizeFilePath(filePath) {
  return filePath.replace(/\\/g, "/").trim();
}

function enrichFile(filePath, status) {
  const normalized = normalizeFilePath(filePath);
  return {
    path: normalized,
    feature: classifyFeature(normalized),
    type: classifyType(normalized),
    status,
  };
}

function parseKnownFilesArg(value) {
  if (!value) return null;
  const files = value
    .split(",")
    .map((file) => normalizeFilePath(file))
    .filter(Boolean);
  return files.length > 0 ? new Set(files) : null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pickPrimaryStatus(statuses) {
  const priority = ["D", "?", "A", "R", "C", "M"];
  for (const candidate of priority) {
    if (statuses.includes(candidate)) return candidate;
  }
  return statuses[0] || "M";
}

function dedupeFiles(files) {
  const byPath = new Map();

  for (const file of files) {
    const normalized = normalizeFilePath(file.path);
    const existing = byPath.get(normalized);
    const statuses = file.statuses ? [...file.statuses] : [file.status];

    if (!existing) {
      byPath.set(normalized, {
        path: normalized,
        feature: file.feature,
        type: file.type,
        statuses: [...new Set(statuses.filter(Boolean))],
      });
      continue;
    }

    existing.feature = existing.feature || file.feature;
    existing.type = existing.type || file.type;
    existing.statuses = [
      ...new Set([...existing.statuses, ...statuses.filter(Boolean)]),
    ];
  }

  return [...byPath.values()]
    .map((file) => ({
      ...file,
      status: pickPrimaryStatus(file.statuses),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function collectAllFiles(changes) {
  return dedupeFiles([
    ...changes.staged,
    ...changes.unstaged,
    ...changes.untracked,
    ...changes.deleted,
  ]);
}

function collectKnownPathsFromAnalysis(analysis) {
  return collectAllFiles(analysis.changes).map((file) => file.path);
}

function getFeaturesFromFiles(files) {
  const features = [
    ...new Set(
      files
        .map((file) => file.feature.replace(/^\./, ""))
        .filter(
          (feature) =>
            feature !== "root" && feature !== "config" && feature !== "github",
        ),
    ),
  ];

  const hasGithubFiles = files.some(
    (file) => file.feature === ".github" || file.feature === "github",
  );

  if (hasGithubFiles) features.push(".github");
  return features;
}

function getAnalysisData(flags = {}) {
  const stack = detectStack();
  const currentBranch = run("git branch --show-current");
  const isProtected = PROTECTED_BRANCHES.includes(currentBranch);
  const knownFiles =
    flags["known-files"] instanceof Set
      ? flags["known-files"]
      : parseKnownFilesArg(flags["known-files"]);

  const { staged, unstaged, untracked, deleted, skipped } =
    parseGitStatus(knownFiles);
  const allFiles = collectAllFiles({ staged, unstaged, untracked, deleted });
  const features = getFeaturesFromFiles(allFiles);

  return {
    stack,
    branch: { current: currentBranch, isProtected },
    changes: { staged, unstaged, untracked, deleted },
    summary: {
      total: allFiles.length,
      features,
      hasTests: allFiles.some((file) => file.type === "test"),
      hasConfig: allFiles.some((file) => file.type === "config"),
    },
    scope: {
      knownFilesActive: knownFiles !== null,
      knownCount: knownFiles ? knownFiles.size : null,
      skippedArtifacts: [...new Set(skipped)].sort(),
    },
  };
}

// ─── git status parser (shared) ───────────────────────────────────────────────

function parseGitStatus(knownFiles = null) {
  const statusOutput = run("git status --porcelain");
  const lines = statusOutput
    ? statusOutput.split("\n").filter((line) => {
        if (!line || line.length < 4) return false;
        const trimmed = line.trim();
        if (
          trimmed === "nul" ||
          trimmed === "?? nul" ||
          trimmed.endsWith(" nul")
        ) {
          return false;
        }
        return /^.{2} .+$/.test(line);
      })
    : [];

  const staged = [];
  const unstaged = [];
  const untracked = [];
  const deleted = [];
  const skipped = [];

  for (const line of lines) {
    const X = line[0];
    const Y = line[1];

    let filePath = line.slice(3).trim();
    if (filePath.includes(" -> ")) {
      filePath = filePath.split(" -> ")[1].trim();
    }

    filePath = normalizeFilePath(filePath);
    if (!filePath || filePath === "nul" || filePath === "/dev/null") continue;

    if (knownFiles !== null && !knownFiles.has(filePath)) {
      skipped.push(filePath);
      continue;
    }

    if (X === "?" && Y === "?") {
      untracked.push(enrichFile(filePath, "?"));
      continue;
    }

    if (X !== " " && X !== "?") {
      if (X === "D") deleted.push(enrichFile(filePath, "D"));
      else staged.push(enrichFile(filePath, X));
    }

    if (Y !== " " && Y !== "?") {
      if (Y === "D") deleted.push(enrichFile(filePath, "D"));
      else unstaged.push(enrichFile(filePath, Y));
    }
  }

  return { staged, unstaged, untracked, deleted, skipped };
}

// ─── Commit planning helpers ──────────────────────────────────────────────────

function sanitizeScope(value) {
  const normalized = value.replace(/^\./, "").toLowerCase();
  const cleaned = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "root";
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "auto-commit"
  );
}

function getGroupScope(files) {
  if (files.every((file) => file.type === "config")) return "config";

  const features = [
    ...new Set(files.map((file) => sanitizeScope(file.feature))),
  ];
  return features[0] || "root";
}

function inferSourceCommitType(files) {
  const statuses = new Set(
    files.flatMap((file) => file.statuses || [file.status]),
  );
  const names = files
    .map((file) => path.basename(file.path).toLowerCase())
    .join(" ");

  if (/(^|[^a-z])(fix|bug|hotfix|regression|patch)([^a-z]|$)/.test(names)) {
    return "fix";
  }

  if (statuses.has("D")) return "refactor";
  if (statuses.has("?") || statuses.has("A")) return "feat";
  if (statuses.size === 1 && statuses.has("M")) return "fix";
  return "refactor";
}

function pickVerb(type, files) {
  const statuses = new Set(
    files.flatMap((file) => file.statuses || [file.status]),
  );
  if (type === "feat")
    return statuses.has("?") || statuses.has("A") ? "add" : "update";
  if (type === "test" || type === "docs") {
    return statuses.has("?") || statuses.has("A") ? "add" : "update";
  }
  if (type === "fix") return "fix";
  if (type === "refactor") return "refactor";
  return "update";
}

function buildDescription(type, scope, files) {
  const verb = pickVerb(type, files);

  if (type === "chore") {
    return scope === "config" ? "update configuration" : `update ${scope}`;
  }
  if (type === "docs") {
    return scope === "root" ? `${verb} root docs` : `${verb} ${scope} docs`;
  }
  if (type === "test") {
    return scope === "root" ? `${verb} root tests` : `${verb} ${scope} tests`;
  }
  if (type === "feat") {
    return scope === "root"
      ? `${verb} root changes`
      : `${verb} ${scope} module`;
  }
  if (type === "fix") {
    return scope === "root" ? "fix root issues" : `fix ${scope} issues`;
  }
  return scope === "root" ? "refactor root files" : `refactor ${scope} module`;
}

function buildCommitGroups(files) {
  const grouped = new Map();

  for (const file of dedupeFiles(files)) {
    const scope =
      file.type === "config" ? "config" : sanitizeScope(file.feature);
    const bucket = file.type === "source" ? "source" : file.type;
    const key = `${bucket}:${scope}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(file);
  }

  const typeOrder = { config: 0, source: 1, test: 2, doc: 3 };

  return [...grouped.entries()]
    .sort(([leftKey], [rightKey]) => {
      const [leftType, leftScope] = leftKey.split(":");
      const [rightType, rightScope] = rightKey.split(":");
      const leftWeight = typeOrder[leftType] ?? 99;
      const rightWeight = typeOrder[rightType] ?? 99;
      if (leftWeight !== rightWeight) return leftWeight - rightWeight;
      return leftScope.localeCompare(rightScope);
    })
    .map(([key, groupFiles]) => {
      const [bucket] = key.split(":");
      const scope = getGroupScope(groupFiles);
      const type =
        bucket === "config"
          ? "chore"
          : bucket === "doc"
            ? "docs"
            : bucket === "test"
              ? "test"
              : inferSourceCommitType(groupFiles);

      const message = `${type}(${scope}): ${buildDescription(type, scope, groupFiles)}`;

      return {
        key,
        type,
        scope,
        files: groupFiles,
        message,
      };
    });
}

function inferBranchPrefix(files) {
  const sourceGroups = buildCommitGroups(files).filter((group) =>
    ["feat", "fix", "refactor"].includes(group.type),
  );

  if (sourceGroups.some((group) => group.type === "feat")) return "feat";
  if (sourceGroups.some((group) => group.type === "fix")) return "fix";
  if (sourceGroups.some((group) => group.type === "refactor"))
    return "refactor";
  return "chore";
}

function inferBranchSlug(files) {
  const features = getFeaturesFromFiles(files).map((feature) =>
    sanitizeScope(feature),
  );
  if (features.length > 0) {
    return slugify(features.join("-"));
  }

  const basenames = [
    ...new Set(
      files
        .map((file) => path.basename(file.path, path.extname(file.path)))
        .filter(Boolean),
    ),
  ].slice(0, 3);

  return slugify(basenames.join("-") || "auto-commit");
}

function buildBranchName(files) {
  return `${inferBranchPrefix(files)}/${inferBranchSlug(files)}`;
}

function quoteFilePath(file) {
  return `"${file.replace(/"/g, '\\"')}"`;
}

function escapeCommitMessage(message) {
  return message.replace(/"/g, '\\"');
}

// ─── Core actions ──────────────────────────────────────────────────────────────

function analyze(flags = {}) {
  process.stdout.write(JSON.stringify(getAnalysisData(flags), null, 2) + "\n");
}

function executeCommit(fileList, message) {
  const uniqueFiles = [
    ...new Set(fileList.map((file) => normalizeFilePath(file)).filter(Boolean)),
  ];

  if (uniqueFiles.length === 0) {
    throw new Error("--files is empty");
  }

  const quotedFiles = uniqueFiles.map((file) => quoteFilePath(file)).join(" ");
  const addResult = runSafe(`git add ${quotedFiles}`);
  if (!addResult.ok) {
    throw new Error(`git add failed: ${addResult.output}`);
  }

  const commitResult = runSafe(
    `git commit -m "${escapeCommitMessage(message)}"`,
  );
  if (!commitResult.ok) {
    throw new Error(`git commit failed: ${commitResult.output}`);
  }

  return {
    addOutput: addResult.output,
    commitOutput: commitResult.output,
  };
}

function commit(flags) {
  const files = flags["files"];
  const message = flags["message"];

  if (!files || !message) {
    process.stderr.write(
      'Error: --commit requires --files "file1,file2" and --message "msg"\n',
    );
    process.exit(1);
  }

  try {
    const result = executeCommit(files.split(","), message);
    if (result.addOutput) process.stdout.write(result.addOutput + "\n");
    if (result.commitOutput) process.stdout.write(result.commitOutput + "\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

function getLeftoverData(knownFiles) {
  const { staged, unstaged, untracked, deleted, skipped } =
    parseGitStatus(knownFiles);
  return {
    known: collectAllFiles({ staged, unstaged, untracked, deleted }).map(
      (file) => file.path,
    ),
    artifacts: [...new Set(skipped)].sort(),
  };
}

function getRecentCommitLines(count) {
  const safeCount = Math.max(count, 1);
  try {
    const log = run(`git log --oneline -${safeCount}`);
    return log.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function printSummary(count, knownFiles) {
  const safeCount = Math.max(count, 1);
  try {
    const log = run(`git log --oneline -${safeCount}`);
    process.stdout.write(log + "\n");
  } catch (error) {
    throw new Error(`git log failed: ${error.message}`);
  }

  const leftover = getLeftoverData(knownFiles);

  if (leftover.known.length === 0 && leftover.artifacts.length === 0) {
    process.stdout.write("\nWorking tree is clean - all changes committed.\n");
    process.stdout.write(
      "\n__LEFTOVER__:" + JSON.stringify({ known: [], artifacts: [] }) + "\n",
    );
    return leftover;
  }

  if (leftover.known.length > 0) {
    process.stdout.write(
      "\nWARNING: " +
        leftover.known.length +
        " known file(s) still uncommitted — next automatic round would include:\n",
    );
    leftover.known.forEach((file) =>
      process.stdout.write("   - " + file + "\n"),
    );
  }

  if (leftover.artifacts.length > 0) {
    process.stdout.write(
      "\nSKIPPED: " +
        leftover.artifacts.length +
        " file(s) detected but NOT in original scope (artifact guard — skipped):\n",
    );
    leftover.artifacts.forEach((file) =>
      process.stdout.write("   - " + file + "\n"),
    );
  }

  process.stdout.write("\n__LEFTOVER__:" + JSON.stringify(leftover) + "\n");
  return leftover;
}

function summary(flags) {
  const count = parsePositiveInt(flags["count"], 5);
  const knownFiles = parseKnownFilesArg(flags["known-files"]);

  try {
    printSummary(count, knownFiles);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

function createUniqueBranch(name, maxAttempts = DEFAULT_BRANCH_ATTEMPTS) {
  const baseName = name.trim();
  const errors = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = attempt === 1 ? baseName : `${baseName}-${attempt}`;
    const result = runSafe(
      `git checkout -b "${escapeCommitMessage(candidate)}"`,
    );

    if (result.ok) {
      return {
        name: candidate,
        output: result.output || `Switched to a new branch '${candidate}'`,
      };
    }

    errors.push(`${candidate}: ${result.output}`);
  }

  throw new Error(
    `git checkout -b failed after ${maxAttempts} attempt(s): ${errors.join(" | ")}`,
  );
}

function createBranch(flags) {
  const name = flags["name"];
  if (!name) {
    process.stderr.write(
      'Error: --create-branch requires --name "type/slug"\n',
    );
    process.exit(1);
  }

  try {
    const result = createUniqueBranch(
      name,
      parsePositiveInt(flags["max-attempts"], DEFAULT_BRANCH_ATTEMPTS),
    );
    process.stdout.write(result.output + "\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

function autoCommitWorkflow(flags) {
  const maxRounds = parsePositiveInt(
    flags["max-rounds"],
    DEFAULT_MAX_AUTO_ROUNDS,
  );
  const branchAttempts = parsePositiveInt(
    flags["branch-attempts"],
    DEFAULT_BRANCH_ATTEMPTS,
  );
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  const log = (message) => process.stderr.write(message);

  let analysis = getAnalysisData();
  let inScopeFiles = collectKnownPathsFromAnalysis(analysis);

  if (inScopeFiles.length === 0) {
    process.stdout.write(
      JSON.stringify(
        {
          success: true,
          mode: "auto",
          dryRun,
          currentBranch: analysis.branch.current,
          protectedBranchDetected: analysis.branch.isProtected,
          plannedBranch: null,
          commitCount: 0,
          plannedCommitGroups: [],
          leftovers: { known: [], artifacts: [] },
          nextAction: "noop",
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  let plannedBranch = null;
  if (analysis.branch.isProtected) {
    const initialFiles = collectAllFiles(analysis.changes);
    const branchName = buildBranchName(initialFiles);
    plannedBranch = branchName;

    log(
      `Protected branch detected (${analysis.branch.current}). ${dryRun ? "Planning" : "Creating"} a working branch automatically...\n`,
    );

    if (dryRun) {
      log(`DRY RUN: branch creation skipped (planned branch: ${branchName})\n`);
    } else {
      const branchResult = createUniqueBranch(branchName, branchAttempts);
      plannedBranch = branchResult.name;
      log(branchResult.output + "\n");

      analysis = getAnalysisData();
      inScopeFiles = collectKnownPathsFromAnalysis(analysis);

      if (inScopeFiles.length === 0) {
        process.stdout.write(
          JSON.stringify(
            {
              success: true,
              mode: "auto",
              dryRun,
              currentBranch: plannedBranch,
              protectedBranchDetected: true,
              plannedBranch,
              commitCount: 0,
              plannedCommitGroups: [],
              leftovers: { known: [], artifacts: [] },
              nextAction: "noop",
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }
    }
  }

  const originalKnownFiles = new Set(inScopeFiles);
  let pendingKnownFiles = [...originalKnownFiles];
  let previousSignature = "";
  let commitCount = 0;
  const plannedCommitGroups = [];

  for (let round = 1; round <= maxRounds; round++) {
    const roundKnownSet = new Set(pendingKnownFiles);
    const roundAnalysis = getAnalysisData({ "known-files": roundKnownSet });
    const roundFiles = collectAllFiles(roundAnalysis.changes);

    if (roundFiles.length === 0) {
      break;
    }

    const groups = buildCommitGroups(roundFiles);
    if (groups.length === 0) {
      throw new Error(
        "Automatic commit flow could not determine commit groups.",
      );
    }

    log(`\nAuto commit round ${round}/${maxRounds}\n`);

    for (const group of groups) {
      plannedCommitGroups.push({
        round,
        message: group.message,
        files: group.files.map((file) => file.path),
      });
      log(`\n- ${group.message}\n`);
      group.files.forEach((file) => log(`   - ${file.path}\n`));

      if (dryRun) {
        log("DRY RUN: git add/git commit skipped\n");
        continue;
      }

      const result = executeCommit(
        group.files.map((file) => file.path),
        group.message,
      );

      if (result.addOutput) log(result.addOutput + "\n");
      if (result.commitOutput) log(result.commitOutput + "\n");
      commitCount += 1;
    }

    if (dryRun) {
      const dryRunResult = {
        success: true,
        mode: "auto",
        dryRun: true,
        protectedBranchDetected: analysis.branch.isProtected,
        currentBranch: analysis.branch.current,
        plannedBranch,
        commitCount: 0,
        knownFiles: [...originalKnownFiles],
        plannedCommitGroups,
        leftovers: { known: [...originalKnownFiles], artifacts: [] },
        nextAction: "review-plan",
      };
      process.stdout.write(JSON.stringify(dryRunResult, null, 2) + "\n");
      return;
    }

    const leftover = getLeftoverData(originalKnownFiles);

    if (leftover.artifacts.length > 0) {
      log(
        `\nArtifact guard skipped ${leftover.artifacts.length} file(s) outside the original scope.\n`,
      );
      leftover.artifacts.forEach((file) => log(`   - ${file}\n`));
    }

    if (leftover.known.length === 0) {
      process.stdout.write(
        JSON.stringify(
          {
            success: true,
            mode: "auto",
            dryRun: false,
            currentBranch: getAnalysisData().branch.current,
            protectedBranchDetected: analysis.branch.isProtected,
            plannedBranch,
            commitCount,
            plannedCommitGroups,
            recentCommits: getRecentCommitLines(commitCount),
            leftovers: leftover,
            nextAction: "done",
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    const signature = leftover.known.join("|");
    if (signature === previousSignature) {
      throw new Error(
        `Automatic leftover resolution stalled after round ${round}. Remaining files: ${leftover.known.join(", ")}`,
      );
    }

    previousSignature = signature;
    pendingKnownFiles = leftover.known;

    log(
      `\nWARNING: ${leftover.known.length} known file(s) still pending. Continuing automatically...\n`,
    );
  }

  const finalLeftover = getLeftoverData(originalKnownFiles);
  log("\nWARNING: Automatic commit flow reached the round limit.\n\n");

  if (finalLeftover.known.length > 0) {
    throw new Error(
      `Automatic commit flow stopped with uncommitted known files: ${finalLeftover.known.join(", ")}`,
    );
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

try {
  if (flags["auto"]) {
    autoCommitWorkflow(flags);
  } else if (flags["analyze"]) {
    analyze(flags);
  } else if (flags["commit"]) {
    commit(flags);
  } else if (flags["summary"]) {
    summary(flags);
  } else if (flags["create-branch"]) {
    createBranch(flags);
  } else {
    process.stderr.write(
      "Usage:\n" +
        "  node flow-commit.mjs --auto [--dry-run] [--max-rounds 3] [--branch-attempts 5]\n" +
        "  node flow-commit.mjs --analyze\n" +
        '  node flow-commit.mjs --analyze --known-files "f1,f2"\n' +
        '  node flow-commit.mjs --commit --files "f1.ts,f2.tsx" --message "feat(scope): desc"\n' +
        '  node flow-commit.mjs --summary [--count 5] [--known-files "f1,f2"]\n' +
        '  node flow-commit.mjs --create-branch --name "feature/slug" [--max-attempts 5]\n',
    );
    process.exit(1);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
