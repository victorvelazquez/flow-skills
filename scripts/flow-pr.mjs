#!/usr/bin/env node
/**
 * flow-pr.mjs — Push branch + create GitHub PR with AI-generated descriptions
 *               + version bump for integration PRs (absorbed from flow-release.mjs)
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --scan                                            Pre-checks + git context in one call
 *   --check-cicd                                      Describe CI/CD, Dockerfile, version files, env templates, app code
 *   --push                                            Execute `git push -u origin <branch>` and return result
 *   --create-pr --target <branch> --title <title> --body-file <path>
 *                                                     Create a GitHub PR via `gh pr create`
 *   --auto --title-override "feat(scope): semantic title"
 *          --pr-body-file <path>                       Optional safe content overrides for the auto flow
 *   --version-context                                 Gather semver + git context for integration PR version bump
 *   --update-version --version X.Y.Z                 Update the project's configured version source + releaseDate/env templates
 *   --commit-version --version X.Y.Z --files "f1,f2" git add + commit version files
 *   --create-tag --version X.Y.Z                     Create annotated git tag when the project release flow requires it
 */

import {
  runSafe,
  runWithStdin,
  parseArgs,
  exists,
  readJsonFile,
} from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";

// ─── Branch type constants ────────────────────────────────────────────────────

const PROD_BRANCHES = ["main", "master"];
const DEV_BRANCHES = ["development", "develop"];

function quoteShellArg(value) {
  return `"${String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;
}

function runSelfMode(args) {
  const scriptPath = path.resolve(process.argv[1]);
  const quotedArgs = args.map((arg) => quoteShellArg(arg)).join(" ");
  const command = `node ${quoteShellArg(scriptPath)} ${quotedArgs}`;
  const result = runSafe(command);

  if (!result.ok) {
    throw new Error(result.output);
  }

  try {
    return JSON.parse(result.output);
  } catch {
    throw new Error(
      `Could not parse flow-pr output for command: ${args.join(" ")}`,
    );
  }
}

function normalizeSingleLineText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function readOptionalTextFile(filePath, label) {
  if (!filePath) return null;

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }

  return fs.readFileSync(resolvedPath, "utf8").replace(/\s+$/, "");
}

function hasTruthyFlag(value) {
  if (value === true) return true;
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function humanizeBranchName(branch) {
  return branch
    .replace(/^[^/]+\//, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function normalizeBranchTypeToCommitType(branchType) {
  switch (branchType) {
    case "feature":
      return "feat";
    case "hotfix":
      return "fix";
    case "ci":
      return "chore";
    case "integration":
      return "chore";
    case "spike":
      return "chore";
    default:
      return branchType || "chore";
  }
}

function normalizeCommitSubject(subject) {
  return normalizeSingleLineText(
    String(subject || "").replace(/^[a-f0-9]+\s+/, ""),
  );
}

function parseConventionalSubject(subject) {
  const normalized = normalizeCommitSubject(subject);
  const match = normalized.match(/^([a-z]+)(\(([^)]+)\))?(!)?:\s+(.+)$/i);

  if (!match) return null;

  return {
    type: match[1].toLowerCase(),
    scope: match[3] ? normalizeSingleLineText(match[3]) : null,
    breaking: Boolean(match[4]),
    description: normalizeSingleLineText(match[5]),
    subject: normalized,
  };
}

function inferScopeFromFiles(scanResult) {
  const ignoredSegments = new Set([
    "src",
    "app",
    "apps",
    "lib",
    "libs",
    "packages",
    "package",
    "modules",
    "module",
    "features",
    "feature",
    "common",
    "shared",
    "internal",
    "server",
    "client",
    "api",
    "dto",
    "dtos",
    "components",
    "controllers",
    "controller",
    "services",
    "service",
    "entities",
    "entity",
    "models",
    "model",
    "tests",
    "test",
    "specs",
    "spec",
  ]);

  const files = [
    ...(scanResult.topFiles || []).map((entry) => entry.file),
    ...((scanResult.changedFiles || []).slice(0, 10) || []),
  ].filter(Boolean);

  for (const file of files) {
    const segments = file
      .replace(/\\/g, "/")
      .split("/")
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);

    for (const segment of segments) {
      if (
        ignoredSegments.has(segment) ||
        segment.startsWith("__") ||
        segment.includes(".") ||
        /^v?\d+$/.test(segment)
      ) {
        continue;
      }

      return segment;
    }
  }

  return null;
}

function buildTitleFallbackSubject(scanResult) {
  const branchSubject = humanizeBranchName(scanResult.currentBranch);
  if (branchSubject) return branchSubject;

  const firstCommit = normalizeCommitSubject(
    scanResult.commits?.[0]?.subject || "",
  );
  if (firstCommit) {
    const parsed = parseConventionalSubject(firstCommit);
    if (parsed?.description) return parsed.description;
    return firstCommit;
  }

  return "update changes";
}

function pickSemanticCommitTitle(scanResult) {
  const normalizedBranchType = normalizeBranchTypeToCommitType(
    scanResult.branchType,
  );
  const parsedCommits = (scanResult.commits || [])
    .map((commit) => parseConventionalSubject(commit.subject))
    .filter(Boolean);

  if (parsedCommits.length === 0) return null;

  const preferred =
    parsedCommits.find((commit) => commit.type === normalizedBranchType) ||
    parsedCommits[0];

  if (!preferred?.description) return null;

  if (
    scanResult.totalCommits <= 3 ||
    preferred.type === normalizedBranchType ||
    scanResult.branchType === "hotfix"
  ) {
    return preferred.subject;
  }

  return null;
}

function buildPrTitle(scanResult, targetBranch, version = null, options = {}) {
  const overrideTitle = normalizeSingleLineText(options.titleOverride || "");
  if (overrideTitle) {
    return overrideTitle;
  }

  if (scanResult.isIntegrationPR && version) {
    if (options.cicdUsesSemanticRelease) {
      return `chore(release): merge development into main`;
    }
    return `chore(release): bump version to ${version}`;
  }

  if (
    scanResult.branchType === "hotfix" &&
    PROD_BRANCHES.includes(targetBranch)
  ) {
    return `hotfix: ${humanizeBranchName(scanResult.currentBranch)}`;
  }

  const semanticCommitTitle = pickSemanticCommitTitle(scanResult);
  if (semanticCommitTitle) {
    return semanticCommitTitle;
  }

  const type = scanResult.currentBranch.includes("/")
    ? normalizeBranchTypeToCommitType(scanResult.currentBranch.split("/")[0])
    : normalizeBranchTypeToCommitType(scanResult.branchType);
  const scope = inferScopeFromFiles(scanResult);
  const subject = buildTitleFallbackSubject(scanResult);

  if (scope) {
    return `${type}(${scope}): ${subject}`;
  }

  return `${type}: ${subject}`;
}

function groupCommitSubjects(commitSubjects) {
  const grouped = { added: [], changed: [], fixed: [] };

  for (const line of commitSubjects) {
    const subject = line.replace(/^[a-f0-9]+\s+/, "").trim();
    if (!subject) continue;

    if (/^feat[(:]/i.test(subject)) grouped.added.push(subject);
    else if (/^fix[(:]/i.test(subject)) grouped.fixed.push(subject);
    else grouped.changed.push(subject);
  }

  return grouped;
}

function buildCommitHighlights(scanResult, limit = 5) {
  const seen = new Set();
  const highlights = [];
  const fallbackHighlights = [];

  for (const commit of scanResult.commits || []) {
    const normalizedSubject = normalizeCommitSubject(commit.subject);
    if (!normalizedSubject) continue;

    if (/^merge pull request\b/i.test(normalizedSubject)) {
      continue;
    }

    const parsed = parseConventionalSubject(commit.subject);
    const highlight = parsed?.description || normalizedSubject;

    const key = highlight.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const bullet = `- ${highlight}`;

    if (parsed?.description) {
      highlights.push(bullet);
    } else {
      fallbackHighlights.push(bullet);
    }

    if (highlights.length >= limit) break;
  }

  return [...highlights, ...fallbackHighlights].slice(0, limit);
}

function generateChangelogEntry(version, commitSubjects) {
  const today = new Date().toISOString().split("T")[0];
  const groups = groupCommitSubjects(commitSubjects);
  const lines = [`## [${version}] - ${today}`, ""];

  if (groups.added.length > 0) {
    lines.push("### Added");
    groups.added.slice(0, 8).forEach((subject) => lines.push(`- ${subject}`));
    lines.push("");
  }

  if (groups.changed.length > 0) {
    lines.push("### Changed");
    groups.changed.slice(0, 8).forEach((subject) => lines.push(`- ${subject}`));
    lines.push("");
  }

  if (groups.fixed.length > 0) {
    lines.push("### Fixed");
    groups.fixed.slice(0, 8).forEach((subject) => lines.push(`- ${subject}`));
    lines.push("");
  }

  if (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function updateChangelog(version, commitSubjects) {
  const entry = generateChangelogEntry(version, commitSubjects);
  const changelogPath = "CHANGELOG.md";
  let created = false;

  if (!exists(changelogPath)) {
    const initial = `# Changelog\n\n## [Unreleased]\n\n${entry}`;
    fs.writeFileSync(changelogPath, initial, "utf8");
    created = true;
    return { file: changelogPath, created, entry };
  }

  const content = fs.readFileSync(changelogPath, "utf8");
  if (/## \[Unreleased\]/i.test(content)) {
    const updated = content.replace(
      /(## \[Unreleased\]\s*\n)/i,
      `$1\n${entry}\n`,
    );
    fs.writeFileSync(changelogPath, updated, "utf8");
  } else {
    fs.writeFileSync(changelogPath, `${entry}\n${content}`, "utf8");
  }

  return { file: changelogPath, created, entry };
}

function buildPrDescription(scanResult, options = {}) {
  const version = options.version;
  const title = normalizeSingleLineText(options.title || "");
  const highlightLines = buildCommitHighlights(scanResult, 5);
  const summaryLine = scanResult.isIntegrationPR
    ? `This release batch is ready for production, covers ${scanResult.totalCommits} commit(s) since ${scanResult.lastProductionTag || scanResult.baseBranch}, and bumps version ${scanResult.versionBefore || "current"} → ${version}.`
    : `This PR proposes ${title || buildTitleFallbackSubject(scanResult)} with ${scanResult.totalCommits} commit(s) across ${scanResult.fileStats.filesChanged} changed file(s) since the branch diverged from ${scanResult.baseBranch}.`;

  const changes = highlightLines.join("\n") || "- No commit summary available";

  const testing = "- Not run by /flow-pr (use /flow-audit when needed)";
  const checklist = [
    "- [x] Branch scanned before push",
    "- [x] PR target resolved automatically",
    scanResult.isIntegrationPR
      ? "- [x] Release guardrails passed before production PR creation"
      : "- [x] Branch pushed before PR creation",
  ].join("\n");

  const deploymentNotes = scanResult.deployment.showDeploymentNotes
    ? `\n## Deployment Notes\n- Impact area: ${scanResult.impactArea}\n- New dependencies: ${scanResult.deployment.hasNewDeps ? "yes" : "no"}\n- Migrations: ${scanResult.deployment.hasMigrations ? "yes" : "no"}\n- Comparison base: ${scanResult.baseBranch}${scanResult.mergeBase ? ` (merge-base ${scanResult.mergeBase.slice(0, 7)})` : ""}`
    : "";

  const breakingChanges = scanResult.hasBreakingChanges
    ? `\n## Breaking Changes\n${scanResult.breakingCommits
        .slice(0, 5)
        .map((commit) => `- ${commit.subject}`)
        .join("\n")}`
    : "";

  return [
    "## Summary",
    summaryLine,
    "",
    "## Changes",
    changes,
    "",
    "## Testing",
    testing,
    "",
    "## Checklist",
    checklist,
    breakingChanges,
    deploymentNotes,
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveGitRef(branchName, preferRemote = true) {
  if (!branchName) return null;

  const candidates = preferRemote
    ? [`origin/${branchName}`, branchName]
    : [branchName, `origin/${branchName}`];

  for (const candidate of candidates) {
    const result = runSafe(`git rev-parse --verify ${candidate}`);
    if (result.ok) return candidate;
  }

  return null;
}

function resolveComparisonContext(branchType, devBase, prodBase) {
  let baseBranch = prodBase || "main";
  if (branchType !== "integration") {
    baseBranch = devBase || prodBase || "main";
  }

  if (!resolveGitRef(baseBranch, true)) {
    for (const candidate of ["main", "master", "develop", "development"]) {
      if (resolveGitRef(candidate, true)) {
        baseBranch = candidate;
        break;
      }
    }
  }

  const baseRef = resolveGitRef(baseBranch, true) || baseBranch;
  const forkPoint = runSafe(`git merge-base --fork-point ${baseRef} HEAD`);
  const mergeBaseResult = forkPoint.ok
    ? forkPoint
    : runSafe(`git merge-base ${baseRef} HEAD`);
  const mergeBase = mergeBaseResult.ok ? mergeBaseResult.output.trim() : null;
  const comparisonRange = mergeBase ? `${mergeBase}..HEAD` : `${baseRef}..HEAD`;

  return {
    baseBranch,
    baseRef,
    mergeBase,
    comparisonRange,
    mergeBaseStrategy: forkPoint.ok
      ? "fork-point"
      : mergeBase
        ? "merge-base"
        : "base-ref",
  };
}

function isValidSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(String(value || "").trim());
}

function toIsoUtcSeconds(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function detectVersionStrategy() {
  const srcVersion = readJsonFile("src/version.json");
  if (srcVersion && isValidSemver(srcVersion.version)) {
    return {
      system: "version-json",
      currentVersion: String(srcVersion.version).trim(),
      files: [
        {
          file: "src/version.json",
          version: String(srcVersion.version).trim(),
          releaseDate: srcVersion.releaseDate || null,
        },
      ],
      sourceFile: "src/version.json",
      shouldUpdateChangelog: false,
      shouldCreateAnnotatedTag: true,
    };
  }

  const pkg = readJsonFile("package.json");
  if (pkg && isValidSemver(pkg.version)) {
    return {
      system: "npm",
      currentVersion: String(pkg.version).trim(),
      files: [
        {
          file: "package.json",
          version: String(pkg.version).trim(),
          releaseDate: pkg.releaseDate || null,
        },
      ],
      sourceFile: "package.json",
      shouldUpdateChangelog: true,
      shouldCreateAnnotatedTag: false,
    };
  }

  const bower = readJsonFile("bower.json");
  if (bower && isValidSemver(bower.version)) {
    return {
      system: "bower",
      currentVersion: String(bower.version).trim(),
      files: [
        {
          file: "bower.json",
          version: String(bower.version).trim(),
          releaseDate: bower.releaseDate || null,
        },
      ],
      sourceFile: "bower.json",
      shouldUpdateChangelog: true,
      shouldCreateAnnotatedTag: false,
    };
  }

  return {
    system: null,
    currentVersion: "0.0.0",
    files: [],
    sourceFile: null,
    shouldUpdateChangelog: exists("CHANGELOG.md"),
    shouldCreateAnnotatedTag: false,
  };
}

// ─── Platform patterns ────────────────────────────────────────────────────────

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

  // Nuevas env vars desde diffs de .env.example
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

  // Detección de dependency manager
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

// ─── Branch type detection ────────────────────────────────────────────────────

/**
 * Detecta el tipo de la rama actual.
 * @param {string} branch
 * @returns {"protected-prod"|"integration"|"hotfix"|"feature"|"fix"|"chore"|"docs"|"refactor"|"test"|"ci"|"spike"|"unknown"}
 */
function detectBranchType(branch) {
  if (PROD_BRANCHES.includes(branch)) return "protected-prod";
  if (DEV_BRANCHES.includes(branch)) return "integration";
  if (branch.startsWith("hotfix/")) return "hotfix";
  if (branch.startsWith("feature/") || branch.startsWith("feat/"))
    return "feature";
  if (branch.startsWith("fix/")) return "fix";
  if (branch.startsWith("chore/")) return "chore";
  if (branch.startsWith("docs/")) return "docs";
  if (branch.startsWith("refactor/")) return "refactor";
  if (branch.startsWith("test/")) return "test";
  if (branch.startsWith("ci/")) return "ci";
  if (branch.startsWith("spike/")) return "spike";
  return "unknown";
}

/**
 * Detecta qué rama de dev/prod existe en el repo.
 * Busca primero local, luego en origin/<branch> si no existe local.
 * @returns {{ devBase: string|null, prodBase: string|null }}
 */
function detectBaseBranches() {
  /**
   * Verifica si una rama existe localmente o como remota en origin.
   * Retorna el nombre canónico de la rama (sin prefijo origin/) si existe.
   */
  function branchExists(name) {
    const local = runSafe(`git rev-parse --verify ${name}`);
    if (local.ok) return name;
    const remote = runSafe(`git rev-parse --verify origin/${name}`);
    if (remote.ok) return name;
    return null;
  }

  let devBase = null;
  for (const b of DEV_BRANCHES) {
    const found = branchExists(b);
    if (found) {
      devBase = found;
      break;
    }
  }

  let prodBase = null;
  for (const b of PROD_BRANCHES) {
    const found = branchExists(b);
    if (found) {
      prodBase = found;
      break;
    }
  }

  return { devBase, prodBase };
}

/**
 * Resuelve las ramas destino según el tipo de rama.
 * @param {"protected-prod"|"integration"|"hotfix"|"feature"|"fix"|"chore"|"docs"|"refactor"|"test"|"ci"|"spike"|"unknown"} branchType
 * @param {string|null} devBase
 * @param {string|null} prodBase
 * @returns {string[]}
 */
function resolveTargets(branchType, devBase, prodBase) {
  switch (branchType) {
    case "feature":
    case "fix":
    case "chore":
    case "docs":
    case "refactor":
    case "test":
    case "ci":
    case "spike":
      return devBase ? [devBase] : [];
    case "hotfix":
      // dos PRs: primero prod, luego dev
      return [prodBase, devBase].filter(Boolean);
    case "integration":
      return prodBase ? [prodBase] : [];
    default:
      return [];
  }
}

// ─── --push ───────────────────────────────────────────────────────────────────

function push(flags = {}) {
  const includeTags = hasTruthyFlag(flags["tags"]);
  const branchResult = runSafe("git branch --show-current");
  const branch = branchResult.ok ? branchResult.output : "unknown";

  // Usar -u para setear upstream tracking (primera vez)
  const pushResult = runSafe(`git push -u origin "${branch}"`);

  let tagPushResult = null;
  if (pushResult.ok && includeTags) {
    tagPushResult = runSafe("git push origin --tags");
  }

  const result = {
    success: pushResult.ok && (!includeTags || tagPushResult?.ok),
    branch,
    remote: "origin",
    includeTags,
    output: pushResult.output,
    tagPush: tagPushResult,
    error: !pushResult.ok
      ? pushResult.output
      : includeTags && !tagPushResult?.ok
        ? tagPushResult.output
        : null,
  };

  if (!result.success) {
    process.stderr.write(`Push failed: ${result.error}\n`);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --create-pr ──────────────────────────────────────────────────────────────

function createPrViaGh(target, title, body) {
  const escapedTitle = title.replace(/"/g, '\\"');
  const cmd = `gh pr create --base "${target}" --title "${escapedTitle}" --body-file -`;
  const result = runWithStdin(cmd, body);

  // gh retorna error con URL si el PR ya existe
  if (!result.ok && result.output.includes("already exists")) {
    const urlMatch = result.output.match(/https:\/\/github\.com\/[^\s]+/);
    if (urlMatch) {
      return {
        success: true,
        prUrl: urlMatch[0],
        target,
        alreadyExists: true,
        output: result.output,
        error: null,
      };
    }
  }

  const urlMatch = result.output.match(/https:\/\/github\.com\/[^\s]+/);
  return {
    success: result.ok,
    prUrl: urlMatch ? urlMatch[0] : null,
    target,
    alreadyExists: false,
    output: result.output,
    error: result.ok ? null : result.output,
  };
}

function createPr(flags) {
  const target = flags["target"];
  const title = flags["title"];
  const bodyFile = flags["body-file"];

  if (!target || !title || !bodyFile) {
    process.stderr.write(
      "Usage: --create-pr --target <branch> --title <title> --body-file <path>\n",
    );
    process.exit(1);
  }

  const body = fs.readFileSync(path.resolve(bodyFile), "utf8");
  const result = createPrViaGh(target, title, body);

  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.success && !result.alreadyExists) process.exit(1);
}

// ─── --release-guard ─────────────────────────────────────────────────────────

function releaseGuard(flags) {
  const source = flags["source"];
  const target = flags["target"];
  const isClean = String(flags["is-clean"] || "").toLowerCase() === "true";
  const newVersion = flags["version"];
  const branchType = detectBranchType(source || "");

  const reasons = [];

  if (!source) reasons.push("missing source branch");
  if (!target) reasons.push("missing target branch");
  if (!DEV_BRANCHES.includes(source)) {
    reasons.push(`source branch '${source}' is not an integration branch`);
  }
  if (!PROD_BRANCHES.includes(target)) {
    reasons.push(`target branch '${target}' is not a production branch`);
  }
  if (branchType !== "integration") {
    reasons.push(
      `branch type '${branchType}' is not allowed for production PR automation`,
    );
  }
  if (!isClean) {
    reasons.push("working tree must be clean before release automation");
  }
  if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
    reasons.push("resolved version is missing or invalid");
  }

  if (newVersion) {
    const tagExists = runSafe(
      `git rev-parse --verify refs/tags/v${newVersion}`,
    );
    if (tagExists.ok) {
      reasons.push(`tag 'v${newVersion}' already exists`);
    }
  }

  const result = {
    success: reasons.length === 0,
    source,
    target,
    version: newVersion || null,
    reasons,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  if (!result.success) {
    process.exit(1);
  }
}

function auto(flags = {}) {
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  const titleOverride = normalizeSingleLineText(flags["title-override"] || "");
  const prBodyOverride = readOptionalTextFile(
    flags["pr-body-file"],
    "PR body override",
  );
  const scanResult = runSelfMode(["--scan"]);

  if (scanResult.isAbort) {
    throw new Error(scanResult.abortReason || "flow-pr scan aborted");
  }

  if (!scanResult.isClean) {
    throw new Error(
      `Uncommitted files detected (${scanResult.uncommittedFiles.join(", ")}). Run /flow-commit first.`,
    );
  }

  if (
    !Array.isArray(scanResult.targetBranches) ||
    scanResult.targetBranches.length === 0
  ) {
    throw new Error("No target branches resolved for /flow-pr automation.");
  }

  let versionBefore = null;
  let versionAfter = null;
  let changelogEntry = null;
  let cicdObservations = null;
  let versionSystem = null;
  let tagCreated = false;
  let tagName = null;
  let shouldPushTags = false;
  let cicdUsesSemanticRelease = false;

  if (scanResult.isIntegrationPR) {
    cicdObservations = runSelfMode(["--check-cicd"]);

    // Si el CI/CD usa semantic-release, el versioning lo maneja la pipeline —
    // el script NO debe tocar package.json, CHANGELOG ni crear tags.
    cicdUsesSemanticRelease = cicdObservations.cicd.some(
      (c) => c.patterns && c.patterns.hasSemanticRelease,
    );

    const versionContextResult = runSelfMode(["--version-context"]);
    versionSystem = versionContextResult.version.system;
    versionBefore = versionContextResult.version.current;

    if (cicdUsesSemanticRelease) {
      // Versión sin cambio — la pipeline se encarga del bump real.
      versionAfter = versionContextResult.version.current;
      shouldPushTags = false;

      runSelfMode([
        "--release-guard",
        "--source",
        scanResult.currentBranch,
        "--target",
        scanResult.targetBranches[0],
        "--is-clean",
        String(versionContextResult.git.isClean),
        "--version",
        versionAfter,
      ]);
    } else {
      versionAfter = versionContextResult.version.suggestedVersion;
      shouldPushTags = Boolean(
        versionContextResult.version.shouldCreateAnnotatedTag,
      );

      runSelfMode([
        "--release-guard",
        "--source",
        scanResult.currentBranch,
        "--target",
        scanResult.targetBranches[0],
        "--is-clean",
        String(versionContextResult.git.isClean),
        "--version",
        versionAfter,
      ]);

      if (!dryRun) {
        const versionUpdateResult = runSelfMode([
          "--update-version",
          "--version",
          versionAfter,
        ]);

        if (versionContextResult.version.shouldUpdateChangelog) {
          const changelog = updateChangelog(
            versionAfter,
            versionContextResult.commits.log,
          );
          changelogEntry = changelog.entry;
        }

        const filesToCommit = [
          ...(versionUpdateResult.updatedFiles ||
            versionUpdateResult.updatedByNpm ||
            []),
          ...versionUpdateResult.updatedEnvFiles,
          versionContextResult.version.shouldUpdateChangelog
            ? "CHANGELOG.md"
            : null,
        ];

        const uniqueFiles = [...new Set(filesToCommit.filter(Boolean))];

        runSelfMode([
          "--commit-version",
          "--version",
          versionAfter,
          "--files",
          uniqueFiles.join(","),
        ]);

        if (shouldPushTags) {
          const tagResult = runSelfMode([
            "--create-tag",
            "--version",
            versionAfter,
          ]);
          tagCreated = tagResult.success;
          tagName = tagResult.tag;
        }
      }
    }
  }

  const pushResult = dryRun
    ? {
        success: true,
        branch: scanResult.currentBranch,
        remote: "origin",
        output: "DRY RUN: push skipped",
        error: null,
        includeTags: shouldPushTags,
        tagPush: null,
      }
    : runSelfMode(["--push", ...(shouldPushTags ? ["--tags", "true"] : [])]);

  const finalScan = dryRun ? scanResult : runSelfMode(["--scan"]);
  finalScan.versionBefore = versionBefore;

  const defaultTitle = buildPrTitle(
    finalScan,
    finalScan.targetBranches[0],
    versionAfter,
    {
      titleOverride,
    },
  );
  const prDescription =
    prBodyOverride ||
    buildPrDescription(finalScan, {
      version: versionAfter,
      title: defaultTitle,
    });

  const prResults = [];
  for (const targetBranch of finalScan.targetBranches) {
    if (
      PROD_BRANCHES.includes(targetBranch) &&
      !(
        DEV_BRANCHES.includes(finalScan.currentBranch) ||
        finalScan.branchType === "hotfix"
      )
    ) {
      throw new Error(
        `Automatic production PR creation is not allowed from '${finalScan.currentBranch}' to '${targetBranch}'.`,
      );
    }

    const title = buildPrTitle(finalScan, targetBranch, versionAfter, {
      titleOverride,
      cicdUsesSemanticRelease,
    });
    const prResult = dryRun
      ? {
          success: true,
          prUrl: null,
          target: targetBranch,
          alreadyExists: false,
          output: "DRY RUN: PR creation skipped",
          error: null,
        }
      : createPrViaGh(targetBranch, title, prDescription);

    prResults.push({
      target: targetBranch,
      title,
      ...prResult,
    });
  }

  const result = {
    success: true,
    mode: "auto",
    dryRun,
    branch: finalScan.currentBranch,
    branchType: finalScan.branchType,
    integration: finalScan.isIntegrationPR,
    baseBranch: finalScan.baseBranch,
    baseRef: finalScan.baseRef,
    mergeBase: finalScan.mergeBase,
    mergeBaseStrategy: finalScan.mergeBaseStrategy,
    pushed: pushResult.success,
    push: pushResult,
    version: finalScan.isIntegrationPR
      ? {
          before: versionBefore,
          after: versionAfter,
          system: versionSystem,
          changelogUpdated: dryRun ? false : Boolean(changelogEntry),
          tagCreated: dryRun ? false : tagCreated,
          tagName: dryRun ? null : tagName,
        }
      : null,
    cicdObservations,
    prDescription,
    prs: prResults,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --version-context ───────────────────────────────────────────────────────
//
// Recopila contexto de semver para integration PRs.
// Determina: versión actual, último tag, commits desde el tag, bump sugerido,
// nueva versión calculada, archivos adicionales que necesitan actualización.

function versionContext() {
  // ── Git status ────────────────────────────────────────────────────────────
  const statusOut = runSafe("git status --porcelain");
  const statusLines = statusOut.ok
    ? statusOut.output.split("\n").filter((l) => {
        if (!l || l.length < 4) return false;
        const trimmed = l.trim();
        if (
          trimmed === "nul" ||
          trimmed === "?? nul" ||
          trimmed.endsWith(" nul")
        )
          return false;
        return /^.{2} .+$/.test(l);
      })
    : [];

  const isClean = statusLines.length === 0;
  const dirtyFiles = statusLines
    .map((l) => l.slice(3).trim().replace(/\\/g, "/"))
    .filter((f) => f && f !== "nul");

  // ── Branch ────────────────────────────────────────────────────────────────
  const branch = runSafe("git branch --show-current");
  const currentBranch = branch.ok ? branch.output : "unknown";
  const branchType = detectBranchType(currentBranch);
  const { devBase, prodBase } = detectBaseBranches();
  const comparison = resolveComparisonContext(branchType, devBase, prodBase);

  // ── Remote ────────────────────────────────────────────────────────────────
  const remote = runSafe("git remote -v");
  const remoteLines = remote.ok
    ? remote.output.split("\n").filter(Boolean)
    : [];
  const hasOrigin = remoteLines.some((l) => l.startsWith("origin"));

  // ── Last tag ──────────────────────────────────────────────────────────────
  let lastTag = "v0.0.0";
  const lastTagResult = runSafe(
    comparison.mergeBase
      ? `git describe --tags --abbrev=0 ${comparison.mergeBase} 2>/dev/null || git describe --tags --abbrev=0`
      : "git describe --tags --abbrev=0",
  );
  if (lastTagResult.ok && lastTagResult.output) {
    lastTag = lastTagResult.output.trim() || "v0.0.0";
  }

  // ── Commits since last tag ────────────────────────────────────────────────
  let commitCount = 0;
  let commitLog = [];

  const commitRange =
    comparison.mergeBase || lastTag === "v0.0.0"
      ? comparison.comparisonRange
      : `${lastTag}..HEAD`;

  if (lastTag !== "v0.0.0" && !comparison.mergeBase) {
    const countResult = runSafe(`git rev-list ${lastTag}..HEAD --count`);
    if (countResult.ok) {
      commitCount = parseInt(countResult.output, 10) || 0;
    }
    const logResult = runSafe(`git log ${lastTag}..HEAD --oneline --no-merges`);
    if (logResult.ok && logResult.output) {
      commitLog = logResult.output.split("\n").filter(Boolean);
    }
  } else {
    const logResult = runSafe(`git log ${commitRange} --oneline --no-merges`);
    if (logResult.ok && logResult.output) {
      commitLog = logResult.output.split("\n").filter(Boolean);
      commitCount = commitLog.length;
    }
  }

  // ── Semver bump detection ─────────────────────────────────────────────────
  const allMessages = commitLog.join("\n");
  let suggestedBump = "patch";
  if (/breaking change|!:/i.test(allMessages)) {
    suggestedBump = "major";
  } else if (/^[a-f0-9]+ feat[\(:]/.test(allMessages)) {
    suggestedBump = "minor";
  }

  // ── Version file detection ────────────────────────────────────────────────
  const versionStrategy = detectVersionStrategy();
  const currentVersion = versionStrategy.currentVersion;
  const versionSystem = versionStrategy.system;
  const versionFiles = versionStrategy.files;

  // ── Calcular versión sugerida ─────────────────────────────────────────────
  const [maj, min, pat] = currentVersion.split(".").map(Number);
  let suggestedVersion = currentVersion;
  if (suggestedBump === "major") suggestedVersion = `${maj + 1}.0.0`;
  else if (suggestedBump === "minor") suggestedVersion = `${maj}.${min + 1}.0`;
  else suggestedVersion = `${maj}.${min}.${pat + 1}`;

  // ── Archivos adicionales existentes ──────────────────────────────────────
  const additionalFiles = {
    "public/manifest.json": exists("public/manifest.json"),
    "manifest.json": exists("manifest.json"),
    "src/version.ts": exists("src/version.ts"),
    "src/version.js": exists("src/version.js"),
    "src/config.ts": exists("src/config.ts"),
    "src/config.js": exists("src/config.js"),
    "public/index.html": exists("public/index.html"),
    ".env.production": exists(".env.production"),
    "CHANGELOG.md": exists("CHANGELOG.md"),
  };

  const result = {
    git: {
      branch: currentBranch,
      branchType,
      isClean,
      dirtyFiles,
      hasOrigin,
      baseBranch: comparison.baseBranch,
      baseRef: comparison.baseRef,
      mergeBase: comparison.mergeBase,
      comparisonRange: comparison.comparisonRange,
      mergeBaseStrategy: comparison.mergeBaseStrategy,
    },
    version: {
      system: versionSystem,
      current: currentVersion,
      lastTag,
      files: versionFiles,
      sourceFile: versionStrategy.sourceFile,
      additionalFiles,
      shouldUpdateChangelog: versionStrategy.shouldUpdateChangelog,
      shouldCreateAnnotatedTag: versionStrategy.shouldCreateAnnotatedTag,
      suggestedBump,
      suggestedVersion,
    },
    commits: {
      count: commitCount,
      since: lastTag,
      log: commitLog,
    },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --update-version ────────────────────────────────────────────────────────
//
// Side Effects:
//   - Updates the detected version source (e.g. src/version.json or package.json)
//   - NO hace commit, tag, ni push

function updateVersion(flags) {
  const newVersion = flags["version"];
  if (!newVersion) {
    process.stderr.write("Error: --update-version requires --version X.Y.Z\n");
    process.exit(1);
  }

  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    process.stderr.write(
      `Error: version "${newVersion}" is not a valid semver (expected X.Y.Z)\n`,
    );
    process.exit(1);
  }

  const versionStrategy = detectVersionStrategy();

  if (versionStrategy.system === "version-json") {
    const versionFilePath = versionStrategy.sourceFile || "src/version.json";
    const versionFile = readJsonFile(versionFilePath) || {};
    const updatedVersionFile = {
      ...versionFile,
      version: newVersion,
      releaseDate: toIsoUtcSeconds(),
      changelog: Array.isArray(versionFile.changelog)
        ? versionFile.changelog
        : [],
    };

    fs.writeFileSync(
      versionFilePath,
      JSON.stringify(updatedVersionFile, null, 2) + "\n",
      "utf8",
    );

    const result = {
      success: true,
      system: "version-json",
      version: newVersion,
      releaseDateUpdated: true,
      updatedFiles: [versionFilePath],
      updatedByNpm: [],
      updatedEnvFiles: [],
      additionalUpdates: [],
    };

    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (!exists("package.json")) {
    process.stderr.write(
      "Error: no supported version source found in working directory\n",
    );
    process.exit(1);
  }

  const npmResult = runSafe(`npm version ${newVersion} --no-git-tag-version`);

  if (!npmResult.ok) {
    process.stderr.write(`npm version failed: ${npmResult.output}\n`);
    process.exit(1);
  }

  // Actualizar releaseDate en package.json
  let releaseDateUpdated = false;
  const today = new Date().toISOString().split("T")[0];
  const pkgRaw = fs.readFileSync("package.json", "utf8");
  const pkgObj = JSON.parse(pkgRaw);
  if ("releaseDate" in pkgObj) {
    pkgObj.releaseDate = today;
    fs.writeFileSync("package.json", JSON.stringify(pkgObj, null, 2) + "\n");
    releaseDateUpdated = true;
  }

  // Actualizar versiones en env templates
  const envTemplatesToUpdate = [
    ".env.template",
    ".env.example",
    ".env.sample",
    ".env.prod.template",
    ".env.production.template",
    ".env.staging.template",
  ];
  const updatedEnvFiles = [];
  for (const ef of envTemplatesToUpdate) {
    if (exists(ef)) {
      let content = fs.readFileSync(ef, "utf8");
      let changed = false;
      content = content.replace(/^(OTEL_SERVICE_VERSION)=(.*)$/gm, (_, key) => {
        changed = true;
        return `${key}=${newVersion}`;
      });
      content = content.replace(/^(SWAGGER_VERSION)=(.*)$/gm, (_, key) => {
        changed = true;
        return `${key}=${newVersion}`;
      });
      if (changed) {
        fs.writeFileSync(ef, content, "utf8");
        updatedEnvFiles.push(ef);
      }
    }
  }

  // Reportar archivos adicionales que requieren actualización manual
  const additionalUpdates = [];

  if (exists("public/manifest.json")) {
    additionalUpdates.push({
      file: "public/manifest.json",
      fields: ["version", "version_name"],
      action: "update-json-fields",
    });
  } else if (exists("manifest.json")) {
    additionalUpdates.push({
      file: "manifest.json",
      fields: ["version", "version_name"],
      action: "update-json-fields",
    });
  }

  if (exists("src/version.ts")) {
    additionalUpdates.push({
      file: "src/version.ts",
      fields: ["APP_VERSION", "BUILD_DATE"],
      action: "update-constants",
    });
  } else if (exists("src/version.js")) {
    additionalUpdates.push({
      file: "src/version.js",
      fields: ["APP_VERSION", "BUILD_DATE"],
      action: "update-constants",
    });
  }

  if (exists("src/config.ts")) {
    additionalUpdates.push({
      file: "src/config.ts",
      fields: ["version", "APP_VERSION"],
      action: "update-constants",
    });
  } else if (exists("src/config.js")) {
    additionalUpdates.push({
      file: "src/config.js",
      fields: ["version", "APP_VERSION"],
      action: "update-constants",
    });
  }

  if (exists("public/index.html")) {
    additionalUpdates.push({
      file: "public/index.html",
      fields: ['meta[name="version"]', 'meta[name="build-date"]'],
      action: "update-meta-tags",
    });
  }

  if (exists(".env.production")) {
    additionalUpdates.push({
      file: ".env.production",
      fields: ["VITE_APP_VERSION", "REACT_APP_VERSION"],
      action: "update-env-vars",
    });
  }

  const result = {
    success: true,
    system: "npm",
    npmOutput: npmResult.output,
    version: newVersion,
    releaseDateUpdated,
    updatedFiles: [
      "package.json",
      exists("package-lock.json") ? "package-lock.json" : null,
    ].filter(Boolean),
    updatedByNpm: [
      "package.json",
      exists("package-lock.json") ? "package-lock.json" : null,
    ].filter(Boolean),
    updatedEnvFiles,
    additionalUpdates,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --create-tag ─────────────────────────────────────────────────────────────

function createTag(flags) {
  const version = flags["version"];
  if (!version) {
    process.stderr.write("Error: --create-tag requires --version X.Y.Z\n");
    process.exit(1);
  }

  const tagName = `v${version}`;
  const existingTag = runSafe(`git rev-parse --verify refs/tags/${tagName}`);
  if (existingTag.ok) {
    process.stderr.write(`Error: tag '${tagName}' already exists\n`);
    process.exit(1);
  }

  const tagMessage = `Release ${tagName} - ${new Date().toISOString().split("T")[0]}`;
  const tagResult = runSafe(
    `git tag -a ${quoteShellArg(tagName)} -m ${quoteShellArg(tagMessage)}`,
  );

  if (!tagResult.ok) {
    process.stderr.write(`git tag failed: ${tagResult.output}\n`);
    process.exit(1);
  }

  const result = {
    success: true,
    version,
    tag: tagName,
    message: tagMessage,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --commit-version ────────────────────────────────────────────────────────
//
// Side Effects:
//   - git add <files>
//   - git commit -m "chore(release): bump version to X.Y.Z"
//   NO crea tag ni hace push

function commitVersion(flags) {
  const version = flags["version"];
  const filesArg = flags["files"];

  if (!version) {
    process.stderr.write("Error: --commit-version requires --version X.Y.Z\n");
    process.exit(1);
  }
  if (!filesArg) {
    process.stderr.write(
      'Error: --commit-version requires --files "f1,f2,f3"\n',
    );
    process.exit(1);
  }

  const fileList = filesArg
    .split(",")
    .map((f) => f.trim().replace(/\\/g, "/"))
    .filter(Boolean);

  if (fileList.length === 0) {
    process.stderr.write("Error: --files is empty\n");
    process.exit(1);
  }

  const steps = [];

  // 1. git add
  const quotedFiles = fileList.map((f) => `"${f}"`).join(" ");
  const addResult = runSafe(`git add ${quotedFiles}`);
  steps.push({
    step: "git-add",
    ok: addResult.ok,
    output: addResult.output,
    files: fileList,
  });

  if (!addResult.ok) {
    process.stderr.write(`git add failed: ${addResult.output}\n`);
    process.exit(1);
  }

  // 2. git commit
  const commitMsg = `chore(release): bump version to ${version}`;
  const escapedMsg = commitMsg.replace(/"/g, '\\"');
  const commitResult = runSafe(`git commit -m "${escapedMsg}"`);
  steps.push({
    step: "git-commit",
    ok: commitResult.ok,
    output: commitResult.output,
    message: commitMsg,
  });

  if (!commitResult.ok) {
    process.stderr.write(`git commit failed: ${commitResult.output}\n`);
    process.exit(1);
  }

  const result = {
    success: true,
    version,
    steps,
    note: "Commit created. Tagging/push are handled by the caller flow.",
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --scan ───────────────────────────────────────────────────────────────────
//
// Pre-checks + git context in a single call.
// Devuelve todos los campos necesarios para la descripción del PR en un único JSON.

function scan() {
  const warnings = [];

  // ── Branch + abort logic ──────────────────────────────────────────────────
  const currentBranchResult = runSafe("git branch --show-current");
  const currentBranch = currentBranchResult.ok
    ? currentBranchResult.output
    : "unknown";

  const branchType = detectBranchType(currentBranch);
  const { devBase, prodBase } = detectBaseBranches();

  let isAbort = false;
  let abortReason = null;

  if (branchType === "protected-prod") {
    isAbort = true;
    abortReason = `You are on '${currentBranch}' (production branch). Cannot open a PR from a production branch.`;
  } else if (branchType === "spike") {
    // spike/ branches are for research/PoC — warn but allow PR if user insists
    warnings.push(
      `WARNING: '${currentBranch}' is a spike branch (research/PoC). Spike branches are not usually merged. Are you sure you want to create a PR?`,
    );
  } else if (branchType === "unknown") {
    isAbort = true;
    abortReason = `Branch '${currentBranch}' has no recognized prefix. Use one of: feat/, feature/, fix/, chore/, hotfix/, docs/, refactor/, test/, ci/, spike/`;
  }

  const isIntegrationPR = branchType === "integration";
  const targetBranches = resolveTargets(branchType, devBase, prodBase);

  if (isIntegrationPR && !prodBase && !isAbort) {
    isAbort = true;
    abortReason = `No production branch found (main/master). Cannot create integration PR.`;
  }

  // Working directory
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

  // ── Context ───────────────────────────────────────────────────────────────
  const remoteResult = runSafe("git config --get remote.origin.url");
  const remoteUrl = remoteResult.ok ? remoteResult.output : "";
  const { name: platform, commitUrlPattern } = detectPlatform(remoteUrl);

  const comparison = resolveComparisonContext(branchType, devBase, prodBase);
  const { baseBranch, baseRef, mergeBase, comparisonRange, mergeBaseStrategy } =
    comparison;

  const logResult = runSafe(
    `git log ${comparisonRange} --format="%H|%h|%s" 2>/dev/null || git log --oneline -20 --format="%H|%h|%s"`,
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

  const displayCommits = commits.slice(0, 5);
  let commitHashesSummary = displayCommits
    .map((c) => (c.url ? `[${c.hash}](${c.url})` : `\`${c.hash}\``))
    .join(", ");
  if (totalCommits > 5) {
    commitHashesSummary += `, ... (${totalCommits} total)`;
  } else if (totalCommits > 0) {
    commitHashesSummary += ` (${totalCommits} total)`;
  }

  const statResult = runSafe(
    `git diff --stat ${comparisonRange} 2>/dev/null || git diff --stat HEAD~${Math.max(totalCommits, 1)} HEAD`,
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

  const filesResult = runSafe(
    `git diff --name-only ${comparisonRange} 2>/dev/null || git diff --name-only HEAD~${Math.max(totalCommits, 1)} HEAD`,
  );
  const changedFiles = filesResult.ok
    ? filesResult.output.split("\n").filter(Boolean)
    : [];

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

  const topFiles = changedFiles.slice(0, 5).map((file) => ({
    file,
    purpose: detectFilePurpose(file),
  }));

  const breakingResult = runSafe(
    `git log ${comparisonRange} --grep="BREAKING CHANGE" --format="%h|%s" 2>/dev/null || git log --oneline -50 --grep="BREAKING CHANGE" --format="%h|%s"`,
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

  const deployment = detectDeployment(changedFiles);
  const impactArea = detectImpactArea(changedFiles);

  let lastProductionTag = null;
  if (isIntegrationPR) {
    const prodRef = (() => {
      const pb = prodBase || "main";
      const local = runSafe(`git rev-parse --verify ${pb}`);
      return local.ok ? pb : `origin/${pb}`;
    })();
    const tagResult = runSafe(
      `git describe --tags --abbrev=0 ${prodRef} 2>/dev/null`,
    );
    if (tagResult.ok) lastProductionTag = tagResult.output;
  }

  const result = {
    currentBranch,
    branchType,
    targetBranches,
    isIntegrationPR,
    isAbort,
    abortReason,
    isClean,
    uncommittedFiles,
    warnings,
    devBase,
    prodBase,
    remote: "origin",
    platform,
    commitUrlPattern,
    commits,
    totalCommits,
    commitHashesSummary,
    changedFiles,
    fileStats: { filesChanged, linesAdded, linesDeleted },
    filesByCategory,
    topFiles,
    hasBreakingChanges,
    breakingCommits,
    deployment,
    impactArea,
    baseBranch,
    baseRef,
    mergeBase,
    mergeBaseStrategy,
    comparisonRange,
    lastProductionTag,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --check-cicd ─────────────────────────────────────────────────────────────
//
// Modo declarativo: describe lo que encuentra sin juzgar si es "correcto".
// El LLM interpreta el reporte contra el contexto del proyecto (AGENTS.md, etc).

function checkCicd() {
  const result = {
    cicd: [],
    dockerfile: null,
    versionFiles: [],
    envFiles: [],
    appCode: [],
  };

  // Scan .github/workflows
  const workflowsDir = ".github/workflows";
  if (exists(workflowsDir)) {
    const files = fs
      .readdirSync(workflowsDir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    for (const file of files) {
      const fullPath = `${workflowsDir}/${file}`;
      const content = fs.readFileSync(fullPath, "utf8");
      const jobs = [];
      const jobMatches = content.matchAll(/^  (\w[\w-]*)\s*:/gm);
      for (const m of jobMatches) jobs.push(m[1]);
      const hasBuildArgs = /BUILD_ARGS/i.test(content);
      const hasVersionCalc =
        /package\.json.*version|src\/version\.json|version\.json|node -p.*version|jq.*version/i.test(
          content,
        );
      const hasTagJob =
        /\btag\b/i.test(content) && jobs.some((j) => /tag/i.test(j));
      const hasSemanticRelease = /semantic-release/i.test(content);
      result.cicd.push({
        file: fullPath,
        platform: "GitHub Actions",
        jobs,
        patterns: {
          hasBuildArgs,
          hasVersionCalc,
          hasTagJob,
          hasSemanticRelease,
        },
      });
    }
  }

  // Otros plataformas CI
  const otherCiFiles = [
    { path: ".gitlab-ci.yml", platform: "GitLab CI" },
    { path: ".circleci/config.yml", platform: "CircleCI" },
    { path: "Jenkinsfile", platform: "Jenkins" },
    { path: "azure-pipelines.yml", platform: "Azure Pipelines" },
    { path: "bitbucket-pipelines.yml", platform: "Bitbucket Pipelines" },
  ];
  for (const ci of otherCiFiles) {
    if (exists(ci.path)) {
      const content = fs.readFileSync(ci.path, "utf8");
      const hasBuildArgs = /BUILD_ARGS|APP_VERSION/i.test(content);
      const hasVersionCalc =
        /package\.json.*version|version.*package\.json/i.test(content);
      result.cicd.push({
        file: ci.path,
        platform: ci.platform,
        jobs: [],
        patterns: { hasBuildArgs, hasVersionCalc, hasTagJob: false },
      });
    }
  }

  // Dockerfile
  const dockerfiles = ["Dockerfile", "docker/Dockerfile", "build/Dockerfile"];
  for (const df of dockerfiles) {
    if (exists(df)) {
      const content = fs.readFileSync(df, "utf8");
      const stages = [];
      const stageMatches = content.matchAll(/^FROM .+ AS (\w+)/gim);
      for (const m of stageMatches) stages.push(m[1]);
      const hasArgAppVersion = /ARG APP_VERSION/i.test(content);
      result.dockerfile = { file: df, stages, patterns: { hasArgAppVersion } };
      break;
    }
  }

  // Version files
  const pkg = readJsonFile("package.json");
  if (pkg) {
    result.versionFiles.push({
      file: "package.json",
      fields: {
        version: pkg.version || null,
        releaseDate: pkg.releaseDate || null,
      },
    });
  }
  const srcVersion = readJsonFile("src/version.json");
  if (srcVersion) {
    result.versionFiles.push({
      file: "src/version.json",
      fields: {
        version: srcVersion.version || null,
        releaseDate: srcVersion.releaseDate || null,
      },
    });
  }
  if (exists("CHANGELOG.md")) {
    const content = fs.readFileSync("CHANGELOG.md", "utf8");
    const hasUnreleased = /## \[Unreleased\]/i.test(content);
    result.versionFiles.push({
      file: "CHANGELOG.md",
      fields: { hasUnreleased },
    });
  }

  // Env templates — solo keys relacionadas con versión
  const envTemplates = [
    ".env.template",
    ".env.example",
    ".env.sample",
    ".env.prod.template",
    ".env.production.template",
    ".env.staging.template",
  ];
  for (const ef of envTemplates) {
    if (exists(ef)) {
      const content = fs.readFileSync(ef, "utf8");
      const versionKeys = [];
      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && /version|release/i.test(match[1])) {
          versionKeys.push({ key: match[1], value: match[2].trim() });
        }
      }
      if (versionKeys.length > 0) {
        result.envFiles.push({ file: ef, keys: versionKeys });
      }
    }
  }

  // App source — archivos que referencian vars de versión
  const sourcePatterns = [
    { file: "src/main.ts", pattern: /APP_VERSION|SWAGGER_VERSION|releaseDate/ },
    { file: "src/main.js", pattern: /APP_VERSION|SWAGGER_VERSION|releaseDate/ },
    {
      file: "src/instrumentation.ts",
      pattern: /OTEL_SERVICE_VERSION|serviceVersion/,
    },
    {
      file: "src/instrumentation.js",
      pattern: /OTEL_SERVICE_VERSION|serviceVersion/,
    },
    { file: "src/app.ts", pattern: /APP_VERSION|version/ },
    { file: "src/index.ts", pattern: /APP_VERSION|version/ },
  ];
  for (const sp of sourcePatterns) {
    if (exists(sp.file)) {
      const content = fs.readFileSync(sp.file, "utf8");
      const foundPatterns = [];
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (sp.pattern.test(line)) {
          foundPatterns.push({ line: i + 1, content: line.trim() });
        }
      });
      if (foundPatterns.length > 0) {
        result.appCode.push({ file: sp.file, patterns: foundPatterns });
      }
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

try {
  if (flags["auto"]) {
    auto(flags);
  } else if (flags["scan"]) {
    scan();
  } else if (flags["check-cicd"]) {
    checkCicd();
  } else if (flags["push"]) {
    push(flags);
  } else if (flags["create-pr"]) {
    createPr(flags);
  } else if (flags["version-context"]) {
    versionContext();
  } else if (flags["update-version"]) {
    updateVersion(flags);
  } else if (flags["commit-version"]) {
    commitVersion(flags);
  } else if (flags["create-tag"]) {
    createTag(flags);
  } else if (flags["release-guard"]) {
    releaseGuard(flags);
  } else {
    process.stderr.write(
      "Usage:\n" +
        "  node flow-pr.mjs --auto [--dry-run]\n" +
        "  node flow-pr.mjs --scan\n" +
        "  node flow-pr.mjs --check-cicd\n" +
        "  node flow-pr.mjs --push\n" +
        "  node flow-pr.mjs --create-pr --target <branch> --title <title> --body-file <path>\n" +
        "  node flow-pr.mjs --version-context\n" +
        "  node flow-pr.mjs --update-version --version X.Y.Z\n" +
        '  node flow-pr.mjs --commit-version --version X.Y.Z --files "f1,f2,f3"\n' +
        "  node flow-pr.mjs --create-tag --version X.Y.Z\n" +
        "  node flow-pr.mjs --release-guard --source <branch> --target <branch> --is-clean true --version X.Y.Z\n",
    );
    process.exit(1);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
