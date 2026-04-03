#!/usr/bin/env node
/**
 * flow-commit.mjs — Universal git workflow automation
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto                                           Run the full automatic happy-path flow
 *     optional: --branch-name "type/slug"
 *     optional: --message-overrides '{"source:auth":"fix(auth): tighten token validation"}'
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
const BRANCH_PREFIX_ALIASES = new Map([
  ["feature", "feat"],
  ["feat", "feat"],
  ["bugfix", "fix"],
  ["bug", "fix"],
  ["fix", "fix"],
  ["hotfix", "fix"],
  ["refactor", "refactor"],
  ["chore", "chore"],
  ["docs", "docs"],
  ["doc", "docs"],
  ["test", "test"],
  ["tests", "test"],
  ["ci", "chore"],
  ["build", "chore"],
]);
const THEME_STOP_WORDS = new Set([
  "src",
  "app",
  "lib",
  "apps",
  "packages",
  "modules",
  "module",
  "common",
  "index",
  "main",
  "service",
  "services",
  "controller",
  "controllers",
  "dto",
  "dtos",
  "entity",
  "entities",
  "model",
  "models",
  "type",
  "types",
  "util",
  "utils",
  "helper",
  "helpers",
  "test",
  "tests",
  "spec",
  "specs",
  "e2e",
  "unit",
  "integration",
  "internal",
  "feature",
  "features",
  "root",
  "readme",
  "create",
  "update",
  "delete",
  "remove",
  "add",
  "new",
  "old",
  "file",
  "files",
]);

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
  const genericContainers = new Set([
    "modules",
    "module",
    "features",
    "feature",
    "packages",
    "package",
  ]);

  if (parts.length === 0) return "root";

  const rootDirs = ["src", "app", "lib"];
  for (let i = 0; i < parts.length - 1; i++) {
    if (rootDirs.includes(parts[i]) && parts[i + 1]) {
      if (genericContainers.has(parts[i + 1]) && parts[i + 2]) {
        return parts[i + 2];
      }
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
  const statusOutput = run("git status --porcelain --untracked-files=all");
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

function splitIntoTokens(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function collectScopeScores(files) {
  const scores = new Map();

  for (const file of files) {
    const scope =
      file.type === "config" ? "config" : sanitizeScope(file.feature || "root");
    const baseWeight =
      file.type === "source" ? 4 : file.type === "test" ? 2 : 1;
    const statusWeight = ["?", "A"].includes(file.status) ? 1 : 0;
    scores.set(scope, (scores.get(scope) || 0) + baseWeight + statusWeight);
  }

  return scores;
}

function getPrimaryScope(files) {
  const scores = collectScopeScores(files);
  const orderedScopes = [...scores.entries()].sort(
    ([leftScope, leftScore], [rightScope, rightScore]) => {
      if (leftScore !== rightScore) return rightScore - leftScore;
      if (leftScope === "config") return 1;
      if (rightScope === "config") return -1;
      return leftScope.localeCompare(rightScope);
    },
  );

  return orderedScopes[0]?.[0] || "root";
}

function collectThemeTokens(files, preferredScope = null) {
  const weightedTokens = new Map();

  for (const file of files) {
    const scope =
      file.type === "config" ? "config" : sanitizeScope(file.feature);
    if (
      preferredScope &&
      preferredScope !== "root" &&
      scope !== preferredScope &&
      file.type !== "config"
    ) {
      continue;
    }

    const normalizedPath = normalizeFilePath(file.path);
    const pathParts = normalizedPath.split("/").filter(Boolean).slice(-3);
    const basename = path.basename(file.path, path.extname(file.path));
    const rawTokens = [...pathParts, basename]
      .flatMap((part) => splitIntoTokens(part))
      .filter(
        (token) =>
          token.length >= 3 &&
          !THEME_STOP_WORDS.has(token) &&
          token !== scope &&
          token !== preferredScope,
      );

    const tokenWeight =
      file.type === "source" ? 3 : file.type === "test" ? 2 : 1;

    for (const token of rawTokens) {
      weightedTokens.set(token, (weightedTokens.get(token) || 0) + tokenWeight);
    }
  }

  return [...weightedTokens.entries()]
    .sort(([leftToken, leftScore], [rightToken, rightScore]) => {
      if (leftScore !== rightScore) return rightScore - leftScore;
      return leftToken.localeCompare(rightToken);
    })
    .map(([token]) => token);
}

function buildSubjectContext(files, scope) {
  const base =
    scope === "config" ? "tooling" : scope === "root" ? "repository" : scope;
  const qualifiers = collectThemeTokens(files, scope).slice(0, 2);

  return {
    base,
    qualifiers,
    tokenSet: new Set(qualifiers),
  };
}

function composeSubject(base, qualifiers = [], qualifierLimit = 1) {
  const parts = [base];

  for (const qualifier of qualifiers) {
    if (!qualifier || qualifier === base || parts.includes(qualifier)) continue;
    parts.push(qualifier);
    if (parts.length - 1 >= qualifierLimit) break;
  }

  return parts.join(" ");
}

function sanitizeCommitMessage(
  value,
  fallback = "chore(root): update repository workflow",
) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function sanitizeBranchName(value, files = []) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return buildBranchName(files);

  const segments = raw
    .split("/")
    .map((segment) => slugify(segment))
    .filter(Boolean);

  if (segments.length === 0) return buildBranchName(files);

  const [prefixCandidate, ...rest] = segments;
  const normalizedPrefix =
    BRANCH_PREFIX_ALIASES.get(prefixCandidate) || inferBranchPrefix(files);

  const slugSource =
    BRANCH_PREFIX_ALIASES.has(prefixCandidate) && rest.length > 0
      ? rest.join("-")
      : segments.join("-");
  const slug = slugify(slugSource);

  return `${normalizedPrefix}/${slug}`;
}

function parseMessageOverridesArg(value) {
  if (!value) return new Map();

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid --message-overrides JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid --message-overrides JSON: expected an object map");
  }

  return new Map(
    Object.entries(parsed)
      .filter(
        ([key, message]) =>
          typeof key === "string" &&
          key.trim() &&
          typeof message === "string" &&
          message.trim(),
      )
      .map(([key, message]) => [key.trim(), sanitizeCommitMessage(message)]),
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
  const { base, qualifiers, tokenSet } = buildSubjectContext(files, scope);
  const subject = composeSubject(base, qualifiers, type === "docs" ? 2 : 1);

  if (type === "chore") {
    if (tokenSet.has("env")) return "align env configuration";
    if (
      tokenSet.has("eslint") ||
      tokenSet.has("prettier") ||
      tokenSet.has("jest")
    ) {
      return `align ${subject} tooling`;
    }
    return subject === "tooling"
      ? "align repository tooling"
      : `align ${subject} configuration`;
  }
  if (type === "docs") {
    return `document ${subject}`;
  }
  if (type === "test") {
    return `cover ${subject} scenarios`;
  }
  if (type === "feat") {
    if (tokenSet.has("validation")) return `add ${subject} validation`;
    return `${verb} ${subject} support`;
  }
  if (type === "fix") {
    if (tokenSet.has("validation")) return `tighten ${subject} validation`;
    if (tokenSet.has("health")) return `stabilize ${subject} health checks`;
    if (tokenSet.has("auth") || tokenSet.has("jwt") || tokenSet.has("token")) {
      return `stabilize ${subject} authentication`;
    }
    return `align ${subject} behavior`;
  }
  if (tokenSet.has("validation")) return `simplify ${subject} validation flow`;
  return `refine ${subject} internals`;
}

function buildCommitGroups(files, options = {}) {
  const messageOverrides = options.messageOverrides || new Map();
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

      const defaultMessage = `${type}(${scope}): ${buildDescription(type, scope, groupFiles)}`;
      const message = sanitizeCommitMessage(
        messageOverrides.get(key),
        defaultMessage,
      );

      return {
        key,
        type,
        scope,
        files: groupFiles,
        defaultMessage,
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
  const primaryScope = getPrimaryScope(files);
  const themeTokens = collectThemeTokens(files, primaryScope).slice(0, 2);
  const scopedParts =
    primaryScope === "root"
      ? themeTokens
      : [
          primaryScope,
          ...themeTokens.filter((token) => token !== primaryScope),
        ];

  if (scopedParts.length > 0) {
    return slugify(scopedParts.join("-"));
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

function getStagedFilesForPaths(fileList) {
  const uniqueFiles = [
    ...new Set(fileList.map((file) => normalizeFilePath(file)).filter(Boolean)),
  ];

  if (uniqueFiles.length === 0) return [];

  const quotedFiles = uniqueFiles.map((file) => quoteFilePath(file)).join(" ");
  const stagedResult = runSafe(
    `git diff --cached --name-only -- ${quotedFiles}`,
  );
  if (!stagedResult.ok) {
    throw new Error(`git diff --cached failed: ${stagedResult.output}`);
  }

  return stagedResult.output
    .split("\n")
    .map((file) => normalizeFilePath(file))
    .filter(Boolean);
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

  const stagedFiles = getStagedFilesForPaths(uniqueFiles);
  if (stagedFiles.length === 0) {
    return {
      addOutput: addResult.output,
      commitOutput: "",
      stagedFiles,
      skipped: true,
      reason:
        "No effective staged changes remained for this group after git add.",
    };
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
    stagedFiles,
    skipped: false,
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
    if (result.skipped) {
      process.stdout.write(`SKIPPED: ${result.reason}\n`);
      return;
    }
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
  const branchNameOverride = flags["branch-name"];
  const messageOverrides = parseMessageOverridesArg(flags["message-overrides"]);
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
    const branchName = sanitizeBranchName(branchNameOverride, initialFiles);
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
  const skippedCommitGroups = [];

  for (let round = 1; round <= maxRounds; round++) {
    const roundKnownSet = new Set(pendingKnownFiles);
    const roundAnalysis = getAnalysisData({ "known-files": roundKnownSet });
    const roundFiles = collectAllFiles(roundAnalysis.changes);

    if (roundFiles.length === 0) {
      break;
    }

    const groups = buildCommitGroups(roundFiles, { messageOverrides });
    if (groups.length === 0) {
      throw new Error(
        "Automatic commit flow could not determine commit groups.",
      );
    }

    log(`\nAuto commit round ${round}/${maxRounds}\n`);

    for (const group of groups) {
      plannedCommitGroups.push({
        round,
        key: group.key,
        type: group.type,
        scope: group.scope,
        defaultMessage: group.defaultMessage,
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
      if (result.skipped) {
        const skippedMessage = `SKIPPED: ${group.message} — ${result.reason}`;
        log(skippedMessage + "\n");
        skippedCommitGroups.push({
          round,
          key: group.key,
          message: group.message,
          reason: result.reason,
          files: group.files.map((file) => file.path),
        });
        continue;
      }
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
        skippedCommitGroups: [],
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
            skippedCommitGroups,
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
        '  node flow-commit.mjs --auto [--dry-run] [--branch-name "type/slug"] [--message-overrides "{...}"] [--max-rounds 3] [--branch-attempts 5]\n' +
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
