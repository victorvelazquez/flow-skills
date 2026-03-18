#!/usr/bin/env node
/**
 * flow-commit.mjs — Universal git workflow automation
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --analyze                                  Detect changes → output JSON
 *   --commit --files "f1,f2" --message "msg"   Stage + commit files
 *   --summary [--count N]                      Show last N git log entries (default 5)
 *   --create-branch --name "type/slug"         Create and checkout new branch
 */

import { execSync } from "child_process";
import process from "process";
import path from "path";
import fs from "fs";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTECTED_BRANCHES = [
  "main",
  "master",
  "develop",
  "development",
  "staging",
  "production",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
      ...opts,
    }).trim();
  } catch (err) {
    const msg = (err.stderr || err.message || String(err)).trim();
    throw new Error(msg);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
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

/**
 * Determines the "feature/module" of a file path.
 * Rules (in order):
 * 1. Segment under src/, app/, or lib/ first level → that segment
 * 2. No src/app/lib → first-level directory of the repo
 * 3. File in root → "root"
 */
function classifyFeature(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 0) return "root";

  // Rule 1: look for src/, app/, lib/ as first segment
  const rootDirs = ["src", "app", "lib"];
  for (let i = 0; i < parts.length - 1; i++) {
    if (rootDirs.includes(parts[i]) && parts[i + 1]) {
      return parts[i + 1];
    }
  }

  // Rule 2: file is in a subdirectory (not root level)
  if (parts.length > 1) {
    return parts[0];
  }

  // Rule 3: file is at root
  return "root";
}

// ─── File type detection (agnóstic by extension/pattern) ─────────────────────

function classifyType(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Tests
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

  // Docs
  if (
    (ext === ".md" || ext === ".rst" || ext === ".txt") &&
    (normalized.split("/").filter(Boolean).length === 1 ||
      normalized.includes("/docs/") ||
      normalized.includes("/doc/"))
  ) {
    return "doc";
  }

  // Config: known config file names
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

  // Config by extension
  if (ext === ".toml" || ext === ".cfg" || ext === ".ini") {
    // Only if in root or known config dirs
    const depth = normalized.split("/").length;
    if (depth <= 2) return "config";
  }

  // Config: Dockerfiles, shell scripts, CI config dirs
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

  // .github files that are docs/instructions (prompts, skills, copilot)
  if (normalized.startsWith(".github/")) {
    return "doc";
  }

  // YAML/JSON in root = config (CI configs, etc.)
  if (
    (ext === ".yml" || ext === ".yaml" || ext === ".json") &&
    !normalized.includes("/")
  ) {
    return "config";
  }

  return "source";
}

function enrichFile(filePath, status) {
  return {
    path: filePath,
    feature: classifyFeature(filePath),
    type: classifyType(filePath),
    status,
  };
}

// ─── --analyze ────────────────────────────────────────────────────────────────

function analyze() {
  const stack = detectStack();

  // Current branch
  const currentBranch = run("git branch --show-current");
  const isProtected = PROTECTED_BRANCHES.includes(currentBranch);

  // git status --porcelain — use explicit encoding and filter Windows artifacts
  const statusOutput = run("git status --porcelain");
  const lines = statusOutput
    ? statusOutput.split("\n").filter((l) => {
        if (!l || l.length < 4) return false;
        const trimmed = l.trim();
        // Skip Windows null device artifact — appears as "?? nul"
        if (
          trimmed === "nul" ||
          trimmed === "?? nul" ||
          trimmed.endsWith(" nul")
        )
          return false;
        // Must match porcelain format: 2 status chars + space + non-empty path
        return /^.{2} .+$/.test(l);
      })
    : [];

  const staged = [];
  const unstaged = [];
  const untracked = [];
  const deleted = [];

  for (const line of lines) {
    // git status --porcelain format: exactly 2 status chars + 1 space + path
    // X = index/staged status, Y = working-tree/unstaged status
    const X = line[0]; // staged column
    const Y = line[1]; // unstaged column

    // Extract path — always starts at index 3
    let filePath = line.slice(3).trim();

    // Handle renamed files: "R  old-name -> new-name" → take new-name
    if (filePath.includes(" -> ")) {
      filePath = filePath.split(" -> ")[1].trim();
    }

    // Normalize separators (Windows backslash → forward slash)
    filePath = filePath.replace(/\\/g, "/");

    // Skip Windows null device, empty paths, and quoted paths with issues
    if (!filePath || filePath === "nul" || filePath === "/dev/null") continue;

    // Untracked files
    if (X === "?" && Y === "?") {
      untracked.push(enrichFile(filePath, "?"));
      continue;
    }

    // Staged changes (index column X is not space or ?)
    if (X !== " " && X !== "?") {
      if (X === "D") {
        deleted.push(enrichFile(filePath, "D"));
      } else {
        staged.push(enrichFile(filePath, X));
      }
    }

    // Unstaged changes (working tree column Y is not space or ?)
    if (Y !== " " && Y !== "?") {
      if (Y === "D") {
        deleted.push(enrichFile(filePath, "D"));
      } else {
        unstaged.push(enrichFile(filePath, Y));
      }
    }
  }

  const allFiles = [...staged, ...unstaged, ...untracked, ...deleted];

  // Deduplicate features — normalize leading dot so ".github" and "github" are the same
  const features = [
    ...new Set(
      allFiles
        .map((f) => f.feature.replace(/^\./, "")) // strip leading dot for dedup
        .filter((f) => f !== "root" && f !== "config" && f !== "github"),
    ),
  ];

  // Re-add "github" once if any .github files are present
  const hasGithubFiles = allFiles.some(
    (f) => f.feature === ".github" || f.feature === "github",
  );
  if (hasGithubFiles) features.push(".github");

  const hasTests = allFiles.some((f) => f.type === "test");
  const hasConfig = allFiles.some((f) => f.type === "config");
  const total = allFiles.length;

  const result = {
    stack,
    branch: { current: currentBranch, isProtected },
    changes: { staged, unstaged, untracked, deleted },
    summary: { total, features, hasTests, hasConfig },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --commit ─────────────────────────────────────────────────────────────────

function commit(flags) {
  const files = flags["files"];
  const message = flags["message"];

  if (!files || !message) {
    process.stderr.write(
      'Error: --commit requires --files "file1,file2" and --message "msg"\n',
    );
    process.exit(1);
  }

  const fileList = files
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (fileList.length === 0) {
    process.stderr.write("Error: --files is empty\n");
    process.exit(1);
  }

  // git add — quote each path to handle spaces
  const quotedFiles = fileList.map((f) => `"${f}"`).join(" ");
  try {
    const addOut = run(`git add ${quotedFiles}`);
    if (addOut) process.stdout.write(addOut + "\n");
  } catch (err) {
    process.stderr.write(`git add failed: ${err.message}\n`);
    process.exit(1);
  }

  // git commit
  try {
    // Escape double quotes in message for cross-platform safety
    const escapedMsg = message.replace(/"/g, '\\"');
    const commitOut = run(`git commit -m "${escapedMsg}"`);
    process.stdout.write(commitOut + "\n");
  } catch (err) {
    process.stderr.write(`git commit failed: ${err.message}\n`);
    process.exit(1);
  }
}

// ─── --summary ────────────────────────────────────────────────────────────────

function summary(flags) {
  const count = parseInt(flags["count"] || "5", 10);
  try {
    const log = run(`git log --oneline -${count}`);
    process.stdout.write(log + "\n");
  } catch (err) {
    process.stderr.write(`git log failed: ${err.message}\n`);
    process.exit(1);
  }
}

// ─── --create-branch ──────────────────────────────────────────────────────────

function createBranch(flags) {
  const name = flags["name"];
  if (!name) {
    process.stderr.write(
      'Error: --create-branch requires --name "type/slug"\n',
    );
    process.exit(1);
  }
  try {
    const out = run(`git checkout -b "${name}"`);
    process.stdout.write((out || `Switched to a new branch '${name}'`) + "\n");
  } catch (err) {
    process.stderr.write(`git checkout -b failed: ${err.message}\n`);
    process.exit(1);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["analyze"]) {
  analyze();
} else if (flags["commit"]) {
  commit(flags);
} else if (flags["summary"]) {
  summary(flags);
} else if (flags["create-branch"]) {
  createBranch(flags);
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-commit.mjs --analyze\n" +
      '  node flow-commit.mjs --commit --files "f1.ts,f2.tsx" --message "feat(scope): desc"\n' +
      "  node flow-commit.mjs --summary [--count 5]\n" +
      '  node flow-commit.mjs --create-branch --name "feature/slug"\n',
  );
  process.exit(1);
}
