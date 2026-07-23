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

import { runSafe, runFileSafe, parseArgs, exists, readJsonFile } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import {
  deliveryAuthorityId,
  deliveryPlanId,
  resolvePublicationDeliveryPolicy,
} from "./lib/review-delivery-policy.mjs";
import { classifyBranch } from "./lib/flow-branch-policy.mjs";
import { loadDeliveryConfig } from "./lib/flow-delivery-config.mjs";
import { digestChangedPaths, readAndValidateCheckEvidence } from "./lib/flow-check-evidence.mjs";
import {
  MANAGED_END,
  MANAGED_START,
  buildManagedPrBody,
  mergePrBody,
  validatePrBodyMarkers,
} from "./lib/flow-pr-body.mjs";
import { assertManagedLabelCardinality, buildLabelPlan, labelsForDelivery, normalizeLabelNames } from "./lib/flow-pr-labels.mjs";
import { assertRequiredPrResultsSucceeded } from "./lib/flow-pr-prs.mjs";
import {
  assertChainPlanVersion,
  buildChainForecast,
  getChainPlanIdentity,
  normalizeChainPlanRefs,
  parseNumstat,
  summarizeLineAccounting,
  validateChainPlan,
} from "./lib/flow-chain-plan.mjs";
import {
  coordinatePromotionReview,
  PROMOTION_REVIEW_COORDINATOR_SCHEMA,
  validNativeLensSelection,
} from "./lib/promotion-review-coordinator.mjs";
import { admitReviewFindings } from "./lib/review-causal-admission.mjs";

// ─── Branch type constants ────────────────────────────────────────────────────

const PROD_BRANCHES = ["main", "master"];
const DEV_BRANCHES = ["development", "develop", "dev"];
const PROMOTION_STATE_SCHEMA = "flow-pr-promotion/v2";
const CHAIN_STATE_SCHEMA = "flow-pr-chain-state/v1";
let DELIVERY_CONFIG = loadDeliveryConfig();

function quoteShellArg(value) {
  return `"${String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;
}

function runSelfMode(args) {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = runFileSafe(process.execPath, [scriptPath, ...args]);

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitSafe(args) {
  return runFileSafe("git", args);
}

function gitValue(args, label) {
  const result = gitSafe(args);
  if (!result.ok || !result.stdout.trim()) {
    throw new Error(`Could not resolve ${label}: ${result.output}`);
  }
  return result.stdout.trim();
}

function configuredBranch(key) {
  const result = gitSafe(["config", "--get", key]);
  const branch = result.ok ? result.stdout.trim() : "";
  if (!branch) return null;
  const valid = gitSafe(["check-ref-format", "--branch", branch]);
  if (!valid.ok) throw new Error(`Invalid Git branch configured in ${key}: ${branch}`);
  return branch;
}

function branchAliases() {
  return {
    integration: [...new Set([configuredBranch("flow.integrationBranch"), ...DEV_BRANCHES].filter(Boolean))],
    production: [...new Set([configuredBranch("flow.productionBranch"), ...PROD_BRANCHES].filter(Boolean))],
  };
}

function isIntegrationBranch(branch) {
  return branchAliases().integration.includes(branch);
}

function isProductionBranch(branch) {
  return branchAliases().production.includes(branch);
}

function changedPathsBetween(base, candidate) {
  const result = gitSafe(["diff", "--name-only", "--no-renames", base, candidate, "--"]);
  if (!result.ok) throw new Error(`Could not derive changed paths: ${result.output}`);
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).sort();
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
    return `chore(release): bump version to ${version}`;
  }

  if (
    scanResult.branchType === "hotfix" &&
    isProductionBranch(targetBranch)
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
    const result = gitSafe(["rev-parse", "--verify", candidate]);
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
  const forkPoint = gitSafe(["merge-base", "--fork-point", baseRef, "HEAD"]);
  const mergeBaseResult = forkPoint.ok
    ? forkPoint
    : gitSafe(["merge-base", baseRef, "HEAD"]);
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
  if (isProductionBranch(branch)) return "protected-prod";
  if (isIntegrationBranch(branch)) return "integration";
  const classified = classifyBranch(branch, DELIVERY_CONFIG);
  if (classified.kind === "integration") return "integration";
  if (classified.kind === "protected") return "protected-prod";
  if (classified.kind === "hotfix") return "hotfix";
  if (classified.kind === "task") return classified.prefix === "feat" ? "feature" : classified.prefix;
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
    const local = gitSafe(["rev-parse", "--verify", name]);
    if (local.ok) return name;
    const remote = gitSafe(["rev-parse", "--verify", `origin/${name}`]);
    if (remote.ok) return name;
    return null;
  }

  let devBase = null;
  for (const b of branchAliases().integration) {
    const found = branchExists(b);
    if (found) {
      devBase = found;
      break;
    }
  }

  let prodBase = null;
  for (const b of branchAliases().production) {
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
  const taskPrefix = branchType === "feature" ? "feat" : branchType;
  if (DELIVERY_CONFIG.branchPolicy.taskPrefixes.includes(taskPrefix)) {
    return devBase ? [devBase] : [];
  }
  switch (branchType) {
    case "hotfix":
      // dos PRs: primero prod, luego dev
      return [prodBase, devBase].filter(Boolean);
    case "integration":
      return prodBase ? [prodBase] : [];
    default:
      return [];
  }
}

function parseGitStatusLines(raw) {
  return (raw || "")
    .split("\n")
    .filter((line) => line && line.length >= 4 && /^.{2} .+$/.test(line))
    .map((line) => line.slice(3).trim().replace(/\\/g, "/"))
    .filter((file) => file && file !== "nul");
}

function createReleaseBranch(version) {
  const branch = `release/${version}`;
  const result = gitSafe(["checkout", "-b", branch]);
  return { success: result.ok, branch, error: result.ok ? null : result.output };
}

function checkoutBranch(branch) {
  const result = gitSafe(["checkout", branch]);
  return { success: result.ok, error: result.ok ? null : result.output };
}

function canonicalPath(value) {
  const resolved = fs.realpathSync.native(value).replace(/\\/g, "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function parseGitHubRemote(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  let host;
  let pathname;
  const scp = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scp && !value.includes("://")) {
    host = scp[1];
    pathname = scp[2];
  } else {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error(`Origin is not a canonical GitHub URL: ${value}`); }
    host = parsed.hostname;
    pathname = parsed.pathname.replace(/^\//, "");
  }
  const parts = pathname.replace(/\.git$/i, "").replace(/\/$/, "").split("/").filter(Boolean);
  if (!host || parts.length !== 2) throw new Error(`Origin must identify one GitHub host/owner/repo: ${value}`);
  const [owner, repo] = parts;
  const normalizedHost = host.toLowerCase();
  const ownerRepo = `${owner}/${repo}`;
  return {
    host: normalizedHost,
    owner,
    repo,
    ownerRepo,
    identity: `${normalizedHost}/${ownerRepo}`.toLowerCase(),
    ghRepo: normalizedHost === "github.com" ? ownerRepo : `${normalizedHost}/${ownerRepo}`,
  };
}

function freezeRepositoryIdentity() {
  const root = canonicalPath(gitValue(["rev-parse", "--show-toplevel"], "repository root"));
  const commonDir = canonicalPath(gitValue(["rev-parse", "--path-format=absolute", "--git-common-dir"], "Git common directory"));
  const originUrl = gitValue(["config", "--get", "remote.origin.url"], "origin URL");
  const pushUrlResult = gitSafe(["config", "--get", "remote.origin.pushurl"]);
  const pushUrl = pushUrlResult.ok && pushUrlResult.stdout.trim() ? pushUrlResult.stdout.trim() : originUrl;
  const origin = parseGitHubRemote(originUrl);
  const pushOrigin = parseGitHubRemote(pushUrl);
  if (origin.identity !== pushOrigin.identity) {
    throw new Error(`Origin fetch/push destinations differ (${origin.identity} vs ${pushOrigin.identity}).`);
  }
  const frozen = {
    root,
    commonDir,
    originUrl,
    pushUrl,
    originIdentity: origin.identity,
    ownerRepo: origin.ownerRepo,
    ghRepo: origin.ghRepo,
  };
  return {
    ...frozen,
    auditIdentity: sha256(JSON.stringify({ remote: originUrl, root })),
    fingerprint: sha256(JSON.stringify(frozen)),
  };
}

function assertRepositoryIdentity(expected) {
  const current = freezeRepositoryIdentity();
  if (current.fingerprint !== expected?.fingerprint || current.auditIdentity !== expected?.auditIdentity) {
    throw new Error("Canonical repository or origin identity changed after promotion review.");
  }
  return current;
}

function buildPromotionContext({ refresh = false } = {}) {
  const repository = freezeRepositoryIdentity();
  const branch = gitValue(["branch", "--show-current"], "current branch");
  if (!isIntegrationBranch(branch)) {
    throw new Error(`Promotion requires a configured integration branch; current branch is '${branch}'.`);
  }
  const status = gitSafe(["status", "--porcelain"]);
  if (!status.ok || parseGitStatusLines(status.stdout).length > 0) {
    throw new Error("Promotion requires a clean working tree.");
  }
  const { prodBase } = detectBaseBranches();
  if (!prodBase) throw new Error("No configured production branch is available.");
  const productionBranch = prodBase;
  const baseRef = `origin/${productionBranch}`;
  const integrationRef = `origin/${branch}`;
  if (refresh) {
    const fetched = gitSafe(["fetch", "--prune", "origin", productionBranch, branch]);
    if (!fetched.ok) throw new Error(`Could not refresh promotion refs: ${fetched.output}`);
  }
  const publicationBaseCommit = gitValue(["rev-parse", "--verify", `${baseRef}^{commit}`], baseRef);
  const remoteIntegrationCommit = gitValue(["rev-parse", "--verify", `${integrationRef}^{commit}`], integrationRef);
  const candidateCommit = gitValue(["rev-parse", "--verify", "HEAD^{commit}"], "candidate commit");
  if (candidateCommit !== remoteIntegrationCommit) {
    throw new Error(`${branch} must exactly match ${integrationRef} before promotion.`);
  }
  const mergeBase = gitValue(["merge-base", publicationBaseCommit, candidateCommit], "promotion merge base");
  const publicationBaseTree = gitValue(["rev-parse", `${publicationBaseCommit}^{tree}`], "publication base tree");
  const mergeBaseTree = gitValue(["rev-parse", `${mergeBase}^{tree}`], "merge-base tree");
  const candidateTree = gitValue(["rev-parse", `${candidateCommit}^{tree}`], "candidate tree");
  const changedPaths = changedPathsBetween(publicationBaseCommit, candidateCommit);
  const pathsDigest = sha256(changedPaths.join("\0"));
  const frozen = {
    repository,
    branch,
    productionBranch,
    baseRef,
    integrationRef,
    publicationBaseCommit,
    publicationBaseTree,
    mergeBase,
    mergeBaseTree,
    remoteIntegrationCommit,
    candidateCommit,
    candidateTree,
    changedPaths,
    pathsDigest,
  };
  const fingerprint = sha256(JSON.stringify(frozen));
  return {
    schema: PROMOTION_STATE_SCHEMA,
    ...frozen,
    candidateRef: branch,
    fingerprint,
    lineage: `promotion-${fingerprint.slice(0, 16)}`,
    noOp: publicationBaseTree === candidateTree || changedPaths.length === 0,
  };
}

function candidateContext(baseRef, candidateRef, lineagePrefix) {
  const baseCommit = gitValue(["rev-parse", "--verify", `${baseRef}^{commit}`], baseRef);
  const candidateCommit = gitValue(["rev-parse", "--verify", `${candidateRef}^{commit}`], candidateRef);
  const mergeBase = gitValue(["merge-base", baseCommit, candidateCommit], "candidate merge base");
  const baseTree = gitValue(["rev-parse", `${baseCommit}^{tree}`], "candidate base tree");
  const candidateTree = gitValue(["rev-parse", `${candidateCommit}^{tree}`], "candidate tree");
  const changedPaths = changedPathsBetween(baseCommit, candidateCommit);
  const pathsDigest = sha256(changedPaths.join("\0"));
  const frozen = { baseRef, baseCommit, baseTree, mergeBase, candidateRef, candidateCommit, candidateTree, changedPaths, pathsDigest };
  const fingerprint = sha256(JSON.stringify(frozen));
  return { ...frozen, fingerprint, lineage: `${lineagePrefix}-${fingerprint.slice(0, 16)}` };
}

function assertPromotionStatePath(stateFile) {
  if (!stateFile) throw new Error("Promotion requires --state-file outside the repository.");
  const root = path.resolve(gitValue(["rev-parse", "--show-toplevel"], "repository root"));
  const resolved = path.resolve(stateFile);
  const relative = path.relative(root, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("Promotion state must be stored outside the repository.");
  }
  return resolved;
}

function writePromotionState(stateFile, state) {
  const resolved = assertPromotionStatePath(stateFile);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}

function readPromotionState(stateFile) {
  const state = JSON.parse(fs.readFileSync(assertPromotionStatePath(stateFile), "utf8"));
  if (state?.schema !== PROMOTION_STATE_SCHEMA || !state?.promotion?.fingerprint || !state?.publication?.fingerprint) {
    throw new Error("Promotion state is malformed or uses an unsupported schema.");
  }
  return state;
}

const REVIEW_INTEGRATION_CONTRACT = "gentle-ai.review-integration/v1";
const coordinatorDigest = (value) => `sha256:${sha256(JSON.stringify(value))}`;

function parseNativeJson(result, label) {
  if (!result.ok) throw new Error(`${label} failed: ${result.output}`);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`${label} returned malformed JSON.`); }
}

function sanitizeNativeStatus(status) {
  const pick = (source, keys) => Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));
  return {
    ...pick(status, ["schema", "contract", "operation", "applicability", "action", "replayability", "target_identity", "selected_lenses"]),
    ...(status.authority ? { authority: pick(status.authority, ["version", "lineage_id", "state", "generation", "revision"]) } : {}),
    receipt: pick(status.receipt, ["status", "identity"]),
    ...(status.frozen ? { frozen: pick(status.frozen, ["tier", "original_changed_lines", "correction_budget"]) } : {}),
    projection: pick(status.projection, ["schema", "kind", "projection", "base_tree", "initial_review_tree", "current_candidate_tree", "paths_digest", "initial_snapshot_identity", "current_snapshot_identity"]),
    candidates: Array.isArray(status.candidates) ? status.candidates.filter((value) => typeof value === "string") : [],
  };
}

function validateNativeActionResult(type, execution, state, promotion, status) {
  if (!execution.ok) return { valid: false, reasonCode: "native-action-failed" };
  let value;
  try { value = JSON.parse(execution.stdout); } catch { return { valid: false, reasonCode: "native-action-output-malformed" }; }
  if (type === "start_review") {
    const valid = value.schema === "gentle-ai.review-integration.start/v1"
    && value.contract === REVIEW_INTEGRATION_CONTRACT && value.operation === "review.start"
    && ["created", "resumed", "reuse-receipt"].includes(value.action)
    && value.lineage_id === state.intendedLineage && typeof value.lenses_required === "boolean"
    && Array.isArray(value.selected_lenses) && ["workspace", "staged"].includes(value.projection)
    && ["low", "medium", "high"].includes(value.risk_level) && typeof value.state === "string"
    && Number.isInteger(value.changed_files) && Number.isInteger(value.changed_lines)
      && Number.isInteger(value.correction_budget) && Array.isArray(value.risk_reasons)
      && validNativeLensSelection(value.risk_level, value.selected_lenses)
      && value.lenses_required === (value.risk_level !== "low");
    return { valid, reasonCode: "native-start-result-invalid",
      ...(valid ? { riskTier: value.risk_level, selectedLenses: value.selected_lenses } : {}) };
  }
  const result = value?.result;
  const common = value?.schema === "gentle-ai.review-integration.operation/v1"
    && value?.contract === REVIEW_INTEGRATION_CONTRACT && value?.operation === (type === "finalize_review" ? "review.finalize" : "review.validate");
  const context = result?.context;
  const gateAllow = common && result?.schema === "gentle-ai.review-gate-result/v1"
    && result?.allowed === true && result?.result === "allow"
    && typeof result?.action === "string" && typeof result?.reason === "string";
  const contextComplete = ["lineage_id", "store_revision", "base_tree", "candidate_tree", "paths_digest"]
    .every((key) => typeof context?.[key] === "string" && context[key].length > 0);
  const transitionAllowed = type === "finalize_review"
    && ["reviewing", "validating"].includes(status.authority?.state)
    && ["validating", "approved"].includes(result?.state)
    && (result?.state !== "approved" || result?.action === "validate")
    && ["finalize", "validate"].includes(result?.action);
  const valid = type === "finalize_review"
    ? common && result?.operation === "review/finalize" && result?.lineage_id === state.authority?.lineage
      && /^sha256:[0-9a-f]{64}$/.test(String(result?.store_revision || ""))
      && result.store_revision !== state.authority?.revision && transitionAllowed
    : gateAllow && contextComplete
      && context?.lineage_id === state.authority?.lineage && context?.store_revision === state.authority?.revision
      && context?.base_tree === promotion.publicationBaseTree && context?.candidate_tree === promotion.candidateTree
      && context?.paths_digest === `sha256:${promotion.pathsDigest}`
      && (context.target_identity == null || context.target_identity === status.target_identity);
  const reasonCode = type === "validate_receipt" && gateAllow && !contextComplete
    ? "native-validate-context-incompatible"
    : type === "validate_receipt" && gateAllow ? "native-validate-context-mismatch" : `native-${type.replace("_review", "")}-result-invalid`;
  return { valid, reasonCode,
    ...(valid && type === "finalize_review" ? { transition: {
      revision: result.store_revision, state: result.state, action: result.action,
    } } : {}),
    ...(valid && type === "validate_receipt" ? { validationIdentity: coordinatorDigest(value.result), context } : {}) };
}

function writeCoordinatorState(stateFile, state) {
  const resolved = assertPromotionStatePath(stateFile);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, resolved);
}

function loadCoordinatorState(stateFile, promotion) {
  const resolved = assertPromotionStatePath(stateFile);
  if (!fs.existsSync(resolved)) return { schema: PROMOTION_REVIEW_COORDINATOR_SCHEMA, promotion,
    intendedLineage: promotion.lineage, riskTier: null, lenses: null, authority: null,
    actionLedger: { inFlight: [], completed: [] }, lensResults: [] };
  const state = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (state?.schema !== PROMOTION_REVIEW_COORDINATOR_SCHEMA) {
    throw new Error("Promotion coordinator state schema is unsupported; rerun /flow-pr promotion review to create fresh external state.");
  }
  if (state?.schema !== PROMOTION_REVIEW_COORDINATOR_SCHEMA
    || state?.promotion?.fingerprint !== promotion.fingerprint) {
    throw new Error("Promotion coordinator state does not match the exact frozen promotion context.");
  }
  return state;
}

function derivePromotionPlan(coordinator, state, promotion, status, nativeCapabilityIdentity) {
  if (coordinator.state !== "approved" || coordinator.nextAction?.type !== "receipt_validated"
    || status.receipt?.status !== "present" || !/^sha256:[0-9a-f]{64}$/.test(String(status.receipt.identity || ""))) return null;
  const validation = state.validation;
  const payload = validation && { coordinatorFingerprint: validation.coordinatorFingerprint,
    promotionFingerprint: validation.promotionFingerprint, targetIdentity: validation.targetIdentity,
    lineage: validation.lineage, authorityRevision: validation.authorityRevision,
    baseTree: validation.baseTree, candidateTree: validation.candidateTree, pathsDigest: validation.pathsDigest,
    receiptIdentity: validation.receiptIdentity, validationIdentity: validation.validationIdentity };
  if (!payload || validation.integrity !== coordinatorDigest(payload)
    || payload.coordinatorFingerprint !== coordinator.coordinatorFingerprint
    || payload.promotionFingerprint !== `sha256:${promotion.fingerprint}` || payload.targetIdentity !== status.target_identity
    || payload.lineage !== state.authority?.lineage || payload.authorityRevision !== state.authority?.revision
    || payload.baseTree !== promotion.publicationBaseTree || payload.candidateTree !== promotion.candidateTree
    || payload.pathsDigest !== `sha256:${promotion.pathsDigest}`
    || payload.receiptIdentity !== status.receipt.identity) return null;
  const binding = {
    schema: "flow-pr-promotion-plan/v1",
    repositoryFingerprint: `sha256:${promotion.repository.fingerprint}`,
    promotionFingerprint: `sha256:${promotion.fingerprint}`,
    coordinatorFingerprint: coordinator.coordinatorFingerprint,
    lineage: payload.lineage,
    authorityRevision: payload.authorityRevision,
    publicationBaseCommit: promotion.publicationBaseCommit,
    publicationBaseTree: promotion.publicationBaseTree,
    candidateCommit: promotion.candidateCommit,
    candidateTree: promotion.candidateTree,
    changedPaths: promotion.changedPaths,
    pathsDigest: promotion.pathsDigest,
    nativeCapabilityIdentity,
    receiptIdentity: payload.receiptIdentity,
    validationIdentity: payload.validationIdentity,
  };
  return { ...binding, promotionPlanId: coordinatorDigest(binding) };
}

function readLensResults(file, lenses) {
  if (!file) return { records: null, findings: [], results: [] };
  const values = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if (!Array.isArray(values) || values.length > lenses.length) {
    throw new Error("--lens-results-file must contain a valid ordered prefix of selected lenses.");
  }
  const records = values.map((entry, index) => {
    if (entry?.lens !== lenses[index] || typeof entry?.executionKey !== "string" || !entry?.result) {
      throw new Error("Lens results must preserve the selected-lens ordered prefix, executionKey, and result JSON.");
    }
    return { lens: entry.lens, executionKey: entry.executionKey, digest: coordinatorDigest(entry.result) };
  });
  return { records, results: values.map((entry) => entry.result),
    findings: values.flatMap((entry) => Array.isArray(entry.result.findings) ? entry.result.findings : []) };
}

function decorateCoordinatorAction(coordinator, state, admissionReady) {
  const action = coordinator.nextAction;
  if (!["start_review", "finalize_review", "validate_receipt"].includes(action.type)) return coordinator;
  if (action.type === "finalize_review" && !admissionReady) {
    return { ...coordinator, nextAction: { type: "stop", reasonCode: "causal-admission-state-invalid" } };
  }
  const executionKey = action.executionKey || coordinatorDigest([
    PROMOTION_REVIEW_COORDINATOR_SCHEMA, coordinator.coordinatorFingerprint, action.type,
  ]);
  if (state.actionLedger.completed.includes(executionKey)) return { ...coordinator,
    nextAction: { type: action.type === "validate_receipt" ? "receipt_validated" : "await_status", executionKey } };
  if (state.actionLedger.inFlight.includes(executionKey)) {
    return { ...coordinator, nextAction: { type: "await_status", executionKey } };
  }
  return { ...coordinator, nextAction: { ...action, executionKey } };
}

function executePromotionReviewAction(type, promotion, state, lensInput) {
  const common = ["--contract", REVIEW_INTEGRATION_CONTRACT, "--cwd", promotion.repository.root];
  if (type === "start_review") return runToolScript("FLOW_GENTLE_AI_SCRIPT", "gentle-ai", [
    "review", "start", ...common, "--base-ref", promotion.baseRef, "--committed-only", "true", "--lineage", state.intendedLineage,
  ]);
  if (type === "validate_receipt") return runToolScript("FLOW_GENTLE_AI_SCRIPT", "gentle-ai", [
    "review", "validate", ...common, "--gate", "pre-pr", "--base-ref", promotion.baseRef, "--lineage", state.authority.lineage,
  ]);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-review-"));
  try {
    const args = ["review", "finalize", ...common, "--lineage", state.authority.lineage];
    lensInput.results.forEach((result, index) => {
      const file = path.join(temporary, `${index}.json`);
      fs.writeFileSync(file, JSON.stringify(result), "utf8");
      args.push("--result", file);
    });
    return runToolScript("FLOW_GENTLE_AI_SCRIPT", "gentle-ai", args);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function promotionReview(flags) {
  const stateFile = flags["state-file"] !== true ? flags["state-file"] : null;
  const lensAssertion = flags.lenses == null || flags.lenses === true ? null
    : String(flags.lenses).split(",").map((value) => value.trim()).filter(Boolean);
  const promotion = buildPromotionContext({ refresh: hasTruthyFlag(flags.refresh) });
  if (promotion.noOp) throw new Error("Promotion review is not applicable to a no-op promotion.");
  const state = loadCoordinatorState(stateFile, promotion);
  const capabilities = parseNativeJson(runToolScript("FLOW_GENTLE_AI_SCRIPT", "gentle-ai", [
    "review", "capabilities", "--contract", REVIEW_INTEGRATION_CONTRACT,
  ]), "Native review capabilities");
  if (capabilities.schema !== "gentle-ai.review-integration.capabilities/v1"
    || capabilities.contract !== REVIEW_INTEGRATION_CONTRACT
    || !["review.status", "review.start", "review.finalize", "review.validate"]
      .every((operation) => capabilities.operations?.includes(operation))) {
    throw new Error("Native review capabilities do not satisfy the negotiated coordinator contract.");
  }
  const statusArgs = ["review", "status", "--contract", REVIEW_INTEGRATION_CONTRACT,
    "--cwd", promotion.repository.root, "--base-ref", promotion.baseRef, "--projection", "workspace"];
  if (state.authority?.lineage) statusArgs.push("--lineage", state.authority.lineage);
  const status = sanitizeNativeStatus(parseNativeJson(runToolScript("FLOW_GENTLE_AI_SCRIPT", "gentle-ai", statusArgs), "Native review status"));
  if (state.authority?.expectedTransition) {
    const expected = state.authority.expectedTransition;
    if (status.authority?.lineage_id !== state.authority.lineage || status.authority?.revision !== expected.revision
      || status.authority?.state !== expected.state || status.action !== expected.action) {
      throw new Error("Native authority drifted outside the exact returned finalize transition.");
    }
    state.authority.revision = expected.revision;
    delete state.authority.expectedTransition;
  }
  if (!state.authority && status.applicability === "current_target" && status.authority) {
    state.authority = { lineage: status.authority.lineage_id, revision: status.authority.revision };
  }
  if (status.applicability === "current_target") {
    if (!Object.hasOwn(status, "selected_lenses")) {
      throw new Error("Native review status did not provide negotiated selected_lenses.");
    }
    if (!validNativeLensSelection(status.frozen?.tier, status.selected_lenses)) {
      throw new Error("Native review status risk tier and selected_lenses violate the negotiated contract.");
    }
    if (state.riskTier == null) state.riskTier = status.frozen.tier;
    if (state.lenses == null) state.lenses = status.selected_lenses;
    if (state.riskTier !== status.frozen.tier) {
      throw new Error("Native risk tier drifted from persisted coordinator authority.");
    }
    if (JSON.stringify(state.lenses) !== JSON.stringify(status.selected_lenses)) {
      throw new Error("Native selected_lenses drifted from persisted coordinator authority.");
    }
  }
  if (lensAssertion && state.lenses != null && JSON.stringify(lensAssertion) !== JSON.stringify(state.lenses)) {
    throw new Error("--lenses must exactly assert negotiated native selected_lenses in order.");
  }
  const lenses = state.lenses || [];
  const lensInput = readLensResults(flags["lens-results-file"] === true ? null : flags["lens-results-file"], lenses);
  if (lensInput.records) {
    const persisted = state.lensResults || [];
    if (lensInput.records.length < persisted.length
      || persisted.some((record, index) => JSON.stringify(record) !== JSON.stringify(lensInput.records[index]))) {
      throw new Error("Lens result prefix cannot remove or replace persisted results.");
    }
    state.lensResults = lensInput.records;
  }
  const baseInput = {
    repositoryFingerprint: `sha256:${promotion.repository.fingerprint}`,
    promotionFingerprint: `sha256:${promotion.fingerprint}`,
    targetIdentity: status.target_identity, nativeCapabilityIdentity: coordinatorDigest(capabilities), status,
    intendedLineage: state.intendedLineage, lineage: state.authority?.lineage,
    authorityRevision: state.authority?.revision, riskTier: state.riskTier, lenses, lensResults: state.lensResults,
    actionLedger: state.actionLedger,
  };
  const probe = coordinatePromotionReview(baseInput);
  let admissionResult = null;
  if (status.action === "finalize") {
    const binding = { coordinatorFingerprint: probe.coordinatorFingerprint,
      authorityRevision: state.authority?.revision, lensResultSetDigest: coordinatorDigest(state.lensResults) };
    if (lensInput.records?.length === lenses.length) {
      const decision = admitReviewFindings({ cwd: promotion.repository.root,
        baseRef: promotion.publicationBaseCommit, candidateRef: promotion.candidateCommit,
        baseTree: promotion.publicationBaseTree, candidateTree: promotion.candidateTree,
        genesisPaths: promotion.changedPaths, findings: lensInput.findings });
      const payload = { ...binding, decision };
      state.admission = { ...payload, integrity: coordinatorDigest(payload) };
    }
    const { integrity, ...persisted } = state.admission || {};
    const valid = integrity === coordinatorDigest(persisted)
      && Object.entries(binding).every(([key, value]) => persisted[key] === value)
      && typeof persisted.decision?.allowed === "boolean";
    admissionResult = valid ? persisted.decision : { allowed: false,
      diagnostics: [{ reasonCode: "causal-admission-state-invalid", diagnostic: "Persisted causal admission is missing, tampered, or mismatched." }] };
  }
  const input = { ...baseInput, admissionResult };
  const coordinator = decorateCoordinatorAction(coordinatePromotionReview(input), state, admissionResult?.allowed === true);
  const promotionPlan = derivePromotionPlan(coordinator, state, promotion, status, input.nativeCapabilityIdentity);
  writeCoordinatorState(stateFile, state);
  if (!hasTruthyFlag(flags["execute-action"])) {
    const output = { ...coordinator, nativeStatus: status, nativeCapabilityIdentity: input.nativeCapabilityIdentity,
      ...(promotionPlan ? { promotionPlanId: promotionPlan.promotionPlanId, promotionPlan } : {}),
      ...(flags._executionDiagnostic ? { executionDiagnostic: flags._executionDiagnostic } : {}) };
    if (!flags._silent) process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    return output;
  }
  const action = coordinator.nextAction;
  if (!["start_review", "finalize_review", "validate_receipt"].includes(action.type)) {
    process.stdout.write(JSON.stringify({ ...coordinator,
      instruction: "This action requires explicit external orchestration and was not executed." }, null, 2) + "\n");
    return coordinator;
  }
  if (flags["expected-coordinator-fingerprint"] !== coordinator.coordinatorFingerprint
    || flags["execution-key"] !== action.executionKey) {
    throw new Error("Coordinator fingerprint or executionKey does not match the current exact action.");
  }
  if (action.type === "finalize_review" && lensInput.records?.length !== lenses.length) {
    throw new Error("Native finalize execution requires the exact --lens-results-file used by persisted causal admission.");
  }
  state.actionLedger.inFlight.push(action.executionKey);
  writeCoordinatorState(stateFile, state);
  const execution = executePromotionReviewAction(action.type, promotion, state, lensInput);
  const validation = validateNativeActionResult(action.type, execution, state, promotion, status);
  if (validation.valid) {
    state.actionLedger.inFlight = state.actionLedger.inFlight.filter((key) => key !== action.executionKey);
    state.actionLedger.completed.push(action.executionKey);
    if (action.type === "start_review") {
      if (lensAssertion && JSON.stringify(lensAssertion) !== JSON.stringify(validation.selectedLenses)) {
        throw new Error("--lenses must exactly assert negotiated native selected_lenses in order.");
      }
      state.riskTier = validation.riskTier;
      state.lenses = validation.selectedLenses;
    } else if (action.type === "finalize_review") {
      state.authority.revision = validation.transition.revision;
      state.authority.expectedTransition = validation.transition;
    } else if (action.type === "validate_receipt") {
      const payload = { coordinatorFingerprint: coordinator.coordinatorFingerprint,
        promotionFingerprint: `sha256:${promotion.fingerprint}`, targetIdentity: status.target_identity,
        lineage: state.authority?.lineage, authorityRevision: state.authority?.revision,
        baseTree: validation.context.base_tree, candidateTree: validation.context.candidate_tree,
        pathsDigest: validation.context.paths_digest,
        receiptIdentity: status.receipt.identity, validationIdentity: validation.validationIdentity };
      state.validation = { ...payload, integrity: coordinatorDigest(payload) };
    }
    writeCoordinatorState(stateFile, state);
  }
  const resumed = promotionReview({ ...flags, "execute-action": false,
    _executionDiagnostic: validation.valid ? null : { code: validation.reasonCode,
      action: action.type, disposition: "status-re-read-no-retry" } });
  if (!validation.valid) process.exitCode = 1;
  return resumed;
}

function remoteHead(branch) {
  const result = gitSafe(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  if (!result.ok || !result.stdout.trim()) throw new Error(`Remote branch origin/${branch} is unavailable.`);
  return result.stdout.trim().split(/\s+/)[0];
}

function assertRemoteBranch(branch, expectedCommit, label = `origin/${branch}`) {
  const actual = remoteHead(branch);
  if (actual !== expectedCommit) {
    throw new Error(`${label} advanced after review (expected ${expectedCommit}, got ${actual}).`);
  }
}

function assertRemotePromotionHeads(promotion) {
  assertRemoteBranch(promotion.productionBranch, promotion.publicationBaseCommit);
  assertRemoteBranch(promotion.branch, promotion.remoteIntegrationCommit);
}

let publicationDependencies = { runner: runFileSafe, tooling: null };
let activePublicationTooling = null;
let reviewDeliveryRunner = runFileSafe;

function toolIdentity(file) {
  const canonical = canonicalPath(file);
  if (!fs.statSync(canonical).isFile()) throw new Error(`Trusted publication tool is not a file: ${canonical}`);
  return { path: canonical, digest: sha256(fs.readFileSync(canonical)) };
}

function assertToolIdentity(expected) {
  const current = toolIdentity(expected.path);
  if (current.path !== expected.path || current.digest !== expected.digest) {
    throw new Error(`Trusted publication tool changed after authority freeze: ${expected.path}`);
  }
}

function freezePublicationTooling() {
  const gentlePath = process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Local", "gentle-ai", "bin", "gentle-ai.exe")
    : path.join(os.homedir(), ".local", "bin", "gentle-ai");
  return {
    gentle: toolIdentity(gentlePath),
    audit: toolIdentity(fileURLToPath(new URL("./flow-audit.mjs", import.meta.url))),
  };
}

function runToolScript(_envKey, command, args, options = {}) {
  return publicationDependencies.runner(command, args, options);
}

export function configurePublicationTestDependencies(dependencies) {
  publicationDependencies = dependencies;
  reviewDeliveryRunner = dependencies.runner || runFileSafe;
}

export function assertReviewedDeliveryTopology(policy, totalCommits) {
  if (policy?.topology === "single" && totalCommits !== 1) {
    throw new Error(`Reviewed delivery requires exactly one commit from the reviewed base; found ${totalCommits}. Existing commits will not be rewritten automatically.`);
  }
}

function readChainPlan(filePath) {
  if (!filePath || typeof filePath !== "string") throw new Error("--chain-plan requires a JSON file path.");
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Chain plan file not found: ${filePath}`);
  try { return JSON.parse(fs.readFileSync(resolved, "utf8")); }
  catch (error) { throw new Error(`Invalid chain plan '${filePath}': ${error.message}`); }
}

export function resolveChainRef(refName) {
  if (typeof refName !== "string" || !refName.trim() || /[\0\r\n]/.test(refName)) {
    throw new Error("Chain ref must be a valid non-empty Git ref or branch name.");
  }
  if (refName.startsWith("refs/")) {
    if (!gitSafe(["check-ref-format", refName]).ok) throw new Error(`Chain ref '${refName}' is invalid.`);
    const exact = gitSafe(["rev-parse", "--verify", refName]);
    if (!exact.ok) throw new Error(`Could not resolve explicit chain ref '${refName}'.`);
    return {
      ref: refName,
      sha: exact.stdout.trim(),
      tree: gitValue(["rev-parse", "--verify", `${refName}^{tree}`], `chain tree ${refName}`),
    };
  }
  if (!gitSafe(["check-ref-format", "--branch", refName]).ok) {
    throw new Error(`Chain ref '${refName}' is not a valid branch name.`);
  }
  const localRef = `refs/heads/${refName}`;
  const remoteRef = `refs/remotes/origin/${refName}`;
  const resolvedRef = gitSafe(["rev-parse", "--verify", localRef]).ok
    ? localRef
    : refName.startsWith("origin/")
      ? null
      : gitSafe(["rev-parse", "--verify", remoteRef]).ok
        ? remoteRef
        : null;
  if (!resolvedRef) {
    const detail = refName.startsWith("origin/")
      ? " Legacy origin/<branch> spelling is accepted only in declared chain plan context refs."
      : "";
    throw new Error(`Could not resolve chain branch '${refName}'.${detail}`);
  }
  return {
    ref: resolvedRef,
    sha: gitValue(["rev-parse", "--verify", resolvedRef], `chain ref ${refName}`),
    tree: gitValue(["rev-parse", "--verify", `${resolvedRef}^{tree}`], `chain tree ${refName}`),
  };
}

function collectChainDiff(base, head) {
  const range = `${base}..${head}`;
  const pathsResult = gitSafe(["diff", "--name-only", range, "--"]);
  const numstatResult = gitSafe(["diff", "--numstat", range, "--"]);
  if (!pathsResult.ok || !numstatResult.ok) throw new Error(`Could not collect chain diff '${range}': ${pathsResult.output || numstatResult.output}`);
  const changedPaths = pathsResult.stdout.split("\n").map((file) => file.trim().replace(/\\/g, "/")).filter(Boolean);
  const accounting = summarizeLineAccounting(parseNumstat(numstatResult.stdout, DELIVERY_CONFIG.chain.generatedPathPatterns));
  return { changedPaths, changedPathsDigest: digestChangedPaths(changedPaths), authoredLines: accounting.authoredLines, generatedLines: accounting.generatedLines };
}

function collectChainValidationContext(plan, scanResult) {
  const publications = [...(plan.tracker ? [plan.tracker] : []), ...(plan.prs || [])];
  const names = new Set([plan.integrationRef?.name, plan.productionRef?.name, ...publications.flatMap((entry) => [entry?.head, entry?.base])]);
  const refs = {};
  for (const name of names) if (name) refs[name] = resolveChainRef(name);
  const diffs = {};
  for (const entry of publications) {
    diffs[`${entry.base}..${entry.head}`] = collectChainDiff(refs[entry.base].ref, refs[entry.head].ref);
  }
  return {
    repositoryIdentity: parseGitHubRemote(scanResult.remoteUrl || gitValue(["config", "--get", "remote.origin.url"], "origin URL")).ownerRepo.toLowerCase(),
    integrationRef: scanResult.devBase,
    productionRef: scanResult.prodBase,
    protectedBranches: DELIVERY_CONFIG.branches.protected,
    reviewBudget: DELIVERY_CONFIG.chain.reviewBudget,
    requireEvidence: DELIVERY_CONFIG.checkEvidence.required,
    refs,
    diffs,
    classifyBranch: (branch) => classifyBranch(branch, DELIVERY_CONFIG),
    isAncestor: (baseSha, headSha) => gitSafe(["merge-base", "--is-ancestor", baseSha, headSha]).ok,
    validateEvidence: (evidenceRef, entry, baseSha) => readAndValidateCheckEvidence({
      cwd: process.cwd(),
      path: evidenceRef,
      identity: { repository: plan.repository.identity.toLowerCase(), base: baseSha, head: entry.expectedHeadSha, tree: entry.expectedTree, mergeBase: baseSha, changedPathsDigest: entry.changedPathsDigest },
    }),
  };
}

function collectChainFinalizationContext(plan, scanResult) {
  const publications = [...(plan.tracker ? [plan.tracker] : []), ...(plan.prs || [])];
  const refs = {
    [plan.integrationRef.name]: { sha: plan.integrationRef.expectedSha, tree: plan.integrationRef.expectedTree },
    [plan.productionRef.name]: { sha: plan.productionRef.expectedSha, tree: plan.productionRef.expectedTree },
  };
  for (const entry of publications) refs[entry.head] = { sha: entry.expectedHeadSha, tree: entry.expectedTree };
  return {
    repositoryIdentity: parseGitHubRemote(scanResult.remoteUrl).ownerRepo.toLowerCase(),
    integrationRef: scanResult.devBase, productionRef: scanResult.prodBase,
    protectedBranches: DELIVERY_CONFIG.branches.protected, reviewBudget: DELIVERY_CONFIG.chain.reviewBudget,
    refs, diffs: {}, classifyBranch: (branch) => classifyBranch(branch, DELIVERY_CONFIG),
    isAncestor: (baseSha, headSha) => gitSafe(["merge-base", "--is-ancestor", baseSha, headSha]).ok,
    validateEvidence: (evidenceRef, entry, baseSha) => readAndValidateCheckEvidence({ cwd: process.cwd(), path: evidenceRef,
      identity: { repository: plan.repository.identity.toLowerCase(), base: baseSha, head: entry.expectedHeadSha,
        tree: entry.expectedTree, mergeBase: baseSha, changedPathsDigest: entry.changedPathsDigest } }),
  };
}

function chainTitle(entry) {
  const branch = classifyBranch(entry.head, DELIVERY_CONFIG);
  return `${branch.prefix}: ${normalizeSingleLineText(entry.title || entry.summary)}`;
}

function chainBody(plan, validation, entry, index) {
  const evidence = validation.evidence[entry.id] || [];
  const context = validation.chainContexts[entry.id];
  const chainContext = context ? [
    `- Work unit: \`${entry.workUnitId}\``,
    `- Current marker: \`${context.currentMarker}\``,
    `- Dependency diagram:\n\n\`\`\`text\n${context.dependencyDiagram}\n\`\`\``,
    `- Start state: ${context.start}`,
    `- End state: ${context.end}`,
    `- Prior: ${context.prior}`,
    `- Follow-up: ${context.followUp}`,
    `- Out of scope: ${context.outOfScope}`,
    `- Focused test: \`${context.verification.focusedTest.command}\` -> ${context.verification.focusedTest.result}`,
    `- Runtime: ${context.verification.runtime.naReason ? `N/A - ${context.verification.runtime.naReason}` : `${context.verification.runtime.scenario} -> ${context.verification.runtime.result}`}`,
    `- Rollback boundary: ${context.rollback}`,
    `- Authored budget: ${context.budget.authoredLines}/${context.budget.limit}${context.budget.exception ? ` (size:exception by ${context.budget.exception.maintainer}: ${context.budget.exception.rationale})` : ""}`,
    "- Immutable delivery: Flow never creates chain branches, rebases, merges, force-pushes, or retargets.",
  ] : null;
  const controlPlane = entry.tracker ? [
    `- Strategy: \`${plan.strategy}\``,
    `- Immutable plan identity: \`${validation.planIdentity}\``,
    `- Aggregate tree: \`${entry.expectedTree}\``,
    `- Expected final aggregate tree: \`${plan.expectedFinalTree}\``,
    `- Aggregate paths digest: \`${entry.changedPathsDigest}\``,
    "- Child order/status:",
    ...plan.prs.map((child, childIndex) => `  - [ ] ${childIndex + 1}. \`${child.id}\` / \`${child.workUnitId}\`: planned`),
    "- Flow-managed no-merge-until-finalized: `FLOW_TRACKER_NO_MERGE`; GitHub draft state is the initial platform merge block.",
    "- Final aggregate review required after every child merges, with fresh review and receipt validation.",
  ] : null;
  return buildManagedPrBody({
    summary: entry.title || entry.summary,
    reviewPath: context ? `Review work unit '${entry.workUnitId}' against immediate base '${entry.base}'.` : `Review tracker metadata against '${entry.base}'.`,
    outOfScope: entry.outOfScope,
    controlPlane,
    chainContext: context ? [`- Strategy: \`${plan.strategy}\``, `- Immutable plan identity: \`${validation.planIdentity}\``, `- Head/base: \`${entry.head}\` -> \`${entry.base}\``, ...chainContext] : null,
    changes: entry.changedPaths.map((file) => `- \`${file}\``),
    validationEvidence: evidence.length ? { status: "Passed", details: evidence.flatMap((item) => item.details || []) } : { status: "Not recorded", details: [] },
    deliveryNotes: ["- Reuse the unchanged immutable plan for recovery."],
  });
}

function runGhJson(args, label) {
  const result = runToolScript("FLOW_GH_SCRIPT", "gh", args);
  if (!result.ok) throw new Error(`${label} failed: ${result.output}`);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`${label} returned malformed JSON.`); }
}

function availableManagedLabels(repository) {
  const labels = runGhJson(["label", "list", "--repo", repository.ghRepo, "--limit", "1000", "--json", "name"], "Managed label inventory");
  if (!Array.isArray(labels)) throw new Error("Managed label inventory returned an invalid result.");
  return labels;
}

function managedPrPlan(existing, title, body, labels, availableLabels) {
  const labelPlan = buildLabelPlan(existing?.labels || [], labels, availableLabels);
  const action = !existing ? "create" : existing.title !== title || existing.body !== body || labelPlan.add.length || labelPlan.remove.length ? "update" : "noop";
  return { title, body, labels, labelPlan, action };
}

function editManagedPr(repository, pr, plan) {
  const args = ["pr", "edit", String(pr.number), "--repo", repository.ghRepo];
  if (pr.title !== plan.title) args.push("--title", plan.title);
  if (pr.body !== plan.body) args.push("--body-file", "-");
  for (const label of plan.labelPlan.remove) args.push("--remove-label", label);
  for (const label of plan.labelPlan.add) args.push("--add-label", label);
  if (args.length === 5) return;
  const result = runToolScript("FLOW_GH_SCRIPT", "gh", args, { input: args.includes("--body-file") ? plan.body : undefined });
  if (!result.ok) throw new Error(`Could not reconcile existing PR ${pr.url}: ${result.output}`);
}

function assertManagedPrMetadata(pr, plan) {
  if (pr.title !== plan.title || pr.body !== plan.body) throw new Error(`Managed PR metadata verification failed for ${pr.url}.`);
  assertManagedLabelCardinality(pr.labels, plan.labels);
}

function managedBodyDigest(body) {
  const markers = validatePrBodyMarkers(body);
  if (!markers.hasManaged) throw new Error("Bound chain PR is missing its managed body block.");
  return sha256(String(body).slice(markers.managedStart, markers.managedEnd + MANAGED_END.length));
}

function canonicalPrUrl(repository, number) {
  const remote = parseGitHubRemote(repository.originUrl);
  return `https://${remote.host}/${repository.ownerRepo}/pull/${number}`;
}

function buildChainPublicationRecord(repository, chainPlanId, entry, pr, managedBody, labels) {
  if (!Number.isInteger(pr?.number) || pr.number <= 0) throw new Error(`Verified chain PR '${entry.id}' has no canonical PR number.`);
  const verifiedManagedDigest = managedBodyDigest(pr.body);
  if (verifiedManagedDigest !== managedBodyDigest(managedBody)) throw new Error(`Verified chain PR '${entry.id}' managed body differs from its immutable publication plan.`);
  const record = {
    schema: "flow-pr-chain-publication/v1", chainPlanId, role: entry.tracker ? "tracker" : "child",
    entryId: entry.id, workUnitId: entry.tracker ? null : entry.workUnitId,
    repository: repository.originIdentity, prNumber: pr.number, prUrl: canonicalPrUrl(repository, pr.number),
    expectedHead: entry.head, expectedBase: entry.base, expectedHeadOid: entry.expectedHeadSha,
    title: chainTitle(entry), managedLabels: [...labels], managedBodyDigest: verifiedManagedDigest,
  };
  if (pr.url !== record.prUrl) throw new Error(`Verified chain PR '${entry.id}' URL is not canonical for its frozen repository and number.`);
  return { ...record, publicationIdentity: sha256(JSON.stringify(record)) };
}

function assertBoundPublicationRecord(repository, chainPlanId, entry, record, managedBody, labels) {
  if (!record || record.schema !== "flow-pr-chain-publication/v1") throw new Error(`External chain state lacks a bound publication record for '${entry.id}'.`);
  const payload = { schema: "flow-pr-chain-publication/v1", chainPlanId, role: entry.tracker ? "tracker" : "child",
    entryId: entry.id, workUnitId: entry.tracker ? null : entry.workUnitId, repository: repository.originIdentity,
    prNumber: record.prNumber, prUrl: canonicalPrUrl(repository, record.prNumber), expectedHead: entry.head,
    expectedBase: entry.base, expectedHeadOid: entry.expectedHeadSha, title: chainTitle(entry),
    managedLabels: [...labels], managedBodyDigest: managedBodyDigest(managedBody) };
  const expected = { ...payload, publicationIdentity: sha256(JSON.stringify(payload)) };
  if (!Number.isInteger(record.prNumber) || record.prNumber <= 0 || record.prUrl !== expected.prUrl
    || JSON.stringify(record) !== JSON.stringify(expected)) {
    throw new Error(`External chain state publication record for '${entry.id}' does not match its immutable plan/repository/PR binding.`);
  }
  return record;
}

function labelsForScan(scanResult) {
  const commit = parseConventionalSubject(pickSemanticCommitTitle(scanResult));
  const prefix = classifyBranch(scanResult.currentBranch, DELIVERY_CONFIG).prefix;
  return labelsForDelivery({ breaking: scanResult.hasBreakingChanges, commitType: prefix === "hotfix" ? null : commit?.type, prefix });
}

function findChainPr(repository, entry, options = {}) {
  const result = runGhJson([
    "pr", "list", "--repo", repository.ghRepo, "--state", "open", "--head", entry.head,
    "--json", "number,url,title,state,headRefName,baseRefName,headRefOid,headRepository,headRepositoryOwner,body,labels,isDraft",
  ], `Chain PR lookup for ${entry.head}`);
  if (!Array.isArray(result) || result.length > 1) throw new Error(`Chain PR lookup for '${entry.head}' is ambiguous.`);
  const pr = result[0] || null;
  const expectedHeadSha = options.expectedHeadSha || entry.expectedHeadSha;
  if (pr && (pr.state !== "OPEN" || pr.headRefName !== entry.head || pr.baseRefName !== entry.base || pr.headRefOid !== expectedHeadSha || prHeadOwnerRepo(pr) !== repository.ownerRepo.toLowerCase())) {
    throw new Error(`Existing chain PR for '${entry.head}' does not match frozen repository/head/base/OID authority.`);
  }
  if (pr && entry.tracker && pr.isDraft !== true) throw new Error(`Existing feature-chain tracker ${pr.url} is open non-draft; Flow will not convert a tracker that may already be under review.`);
  return pr;
}

function chainLaterAction(plan, validation) {
  if (plan.strategy !== "feature-branch-chain") return null;
  return {
    type: "finalize_tracker_after_children",
    operation: "finalize_chain_tracker",
    automatic: false,
    planIdentity: validation.planIdentity,
    requires: ["all children merged", "fresh aggregate review", "fresh aggregate receipt validation"],
    requiredArguments: ["--chain-plan", "--chain-state-file", "--expected-chain-plan-id"],
  };
}

function readBoundChainPlan(flags, requireExpected = false) {
  const plan = normalizeChainPlanRefs(readChainPlan(flags["chain-plan"]), {
    isLiteralBranch: (name) => gitSafe(["rev-parse", "--verify", `refs/heads/${name}`]).ok,
  });
  assertChainPlanVersion(plan);
  const chainPlanId = getChainPlanIdentity(plan);
  if (requireExpected && flags["expected-chain-plan-id"] !== chainPlanId) {
    throw new Error("Live chain operation requires --expected-chain-plan-id exactly matching the deterministic dry-run chainPlanId.");
  }
  return { plan, chainPlanId };
}

function buildChainState(plan, validation) {
  return {
    schema: CHAIN_STATE_SCHEMA,
    chainPlanId: validation.planIdentity,
    planIdentity: validation.planIdentity,
    lineage: `chain-${validation.planIdentity.slice(0, 16)}`,
    revision: `sha256:${validation.planIdentity}`,
    strategy: plan.strategy,
    tracker: plan.tracker ? { id: plan.tracker.id, status: "planned" } : null,
    children: plan.prs.map((entry) => ({ id: entry.id, status: "planned" })),
  };
}

function readExternalChainState(file) {
  if (!file || file === true) throw new Error("finalize_chain_tracker requires --chain-state-file outside the repository.");
  const root = path.resolve(gitValue(["rev-parse", "--show-toplevel"], "repository root"));
  const resolved = path.resolve(file);
  const relative = path.relative(root, resolved);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error("Chain state must be stored outside the repository.");
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(resolved, "utf8")); }
  catch (error) { throw new Error(`Invalid external chain state: ${error.message}`); }
  const state = parsed.chainState || parsed;
  if (state?.schema !== CHAIN_STATE_SCHEMA) throw new Error("External chain state schema is unsupported.");
  return { state, path: resolved, envelope: parsed.chainState ? parsed : null };
}

function persistExternalChainState(boundState) {
  const output = boundState.envelope ? { ...boundState.envelope, chainState: boundState.state } : boundState.state;
  const temporary = `${boundState.path}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(output, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, boundState.path);
  boundState.envelope = boundState.envelope ? output : null;
}

function chainRemoteRelation(entry) {
  const remote = gitSafe(["rev-parse", "--verify", `origin/${entry.head}`]);
  if (!remote.ok) return "missing";
  const sha = remote.stdout.trim();
  if (sha === entry.expectedHeadSha) return "exact";
  if (gitSafe(["merge-base", "--is-ancestor", sha, entry.expectedHeadSha]).ok) return "fast-forward";
  return "diverged";
}

function chainJiraComment(plan, publications) {
  return [
    `### Delivery: ${plan.strategy}`,
    "",
    "### Pull requests",
    ...publications.map((item) => `- ${item.entry.title || item.entry.summary}: ${item.prUrl || "(pending - dry-run)"}`),
    "",
    "### Subtasks / work units",
    ...publications.filter((item) => !item.entry.tracker).map((item) => `- ${item.entry.workUnitId}: ${item.entry.changedPaths.join(", ")}`),
  ].join("\n");
}

function chainAuto(flags, scanResult, fetchResult) {
  if (flags["pr-body-file"]) throw new Error("--pr-body-file is not supported with --chain-plan.");
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  const { plan, chainPlanId } = flags._boundChain || readBoundChainPlan(flags, !dryRun);
  const context = collectChainValidationContext(plan, scanResult);
  if (context.requireEvidence) {
    for (const entry of [...(plan.tracker ? [plan.tracker] : []), ...(plan.prs || [])]) if (!entry.validationEvidenceRefs?.length) throw new Error(`Chain work unit '${entry.id}' requires validation evidence.`);
  }
  const validation = validateChainPlan(plan, context);
  if (validation.planIdentity !== chainPlanId) throw new Error("Validated chain plan identity changed after binding.");
  const featureChain = plan.strategy === "feature-branch-chain";
  const repository = freezeRepositoryIdentity();
  const availableLabels = availableManagedLabels(repository);
  const preflight = validation.publications.map((entry, index) => {
    const remoteRelation = chainRemoteRelation(entry);
    if (remoteRelation === "diverged") throw new Error(`Remote chain branch 'origin/${entry.head}' diverged from immutable plan ${validation.planIdentity}.`);
    const existingPr = findChainPr(repository, entry);
    const managedBody = chainBody(plan, validation, entry, index);
    const body = existingPr ? mergePrBody(existingPr.body, managedBody) : managedBody;
    const labels = labelsForDelivery({ prefix: classifyBranch(entry.head, DELIVERY_CONFIG).prefix });
    const prPlan = managedPrPlan(existingPr, chainTitle(entry), body, labels, availableLabels);
    return { entry, chainContext: validation.chainContexts[entry.id] || null, remoteRelation, existingPr, body, labels, prPlan, actions: [
      { action: remoteRelation === "exact" ? "skip-push" : "push", ref: `${entry.head}:${entry.head}` },
      { action: `${prPlan.action}-pr`, head: entry.head, base: entry.base, draft: featureChain, labels },
    ] };
  });
  if (dryRun) {
    process.stdout.write(JSON.stringify({ success: true, mode: "chain", dryRun: true, strategy: plan.strategy, chainPlanId, planIdentity: validation.planIdentity, fetch: fetchResult, actions: preflight.flatMap((item) => item.actions), publications: preflight.map((item) => ({ ...item, existingPr: item.existingPr?.url || null })), jiraComment: chainJiraComment(plan, preflight.map((item) => ({ ...item, prUrl: item.existingPr?.url || null }))) }, null, 2) + "\n");
    return;
  }
  const nextAction = chainLaterAction(plan, validation);
  const recovery = { ...buildChainState(plan, validation), expectedChainPlanId: flags["expected-chain-plan-id"], completedSteps: ["fetch-origin", "validate-chain-plan", "preflight-chain"], remoteEffects: [], nextSafeAction: "Rerun the unchanged plan with the same expected chain plan ID; do not rebase, force-push, merge, or retarget automatically.", ...(featureChain ? { nextAction } : {}) };
  const results = [];
  try {
    for (const item of preflight) {
      const commitCount = Number.parseInt(gitValue(["rev-list", "--count", `${item.entry.base}..${item.entry.head}`], "chain commit count"), 10);
      const prePush = resolvePublicationDeliveryPolicy({ baseRef: item.entry.base, candidateRef: item.entry.head, gate: "pre-push", runner: reviewDeliveryRunner });
      assertReviewedDeliveryTopology(prePush, commitCount);
      if (item.remoteRelation !== "exact") {
        const pushed = gitSafe(["push", "-u", "origin", `${item.entry.head}:${item.entry.head}`]);
        if (!pushed.ok) throw new Error(`Chain branch push '${item.entry.head}' failed: ${pushed.output}`);
        recovery.completedSteps.push(`push:${item.entry.id}`); recovery.remoteEffects.push(`pushed ${item.entry.head} at ${item.entry.expectedHeadSha}`);
      } else recovery.completedSteps.push(`skip-push:${item.entry.id}`);
      resolvePublicationDeliveryPolicy({ baseRef: item.entry.base, candidateRef: item.entry.head, gate: "pre-pr", lineage: prePush.authority?.lineage, runner: reviewDeliveryRunner });
      let pr = item.existingPr;
      if (!pr) {
        const created = createPrViaGh(item.entry.base, item.prPlan.title, item.body, item.entry.head, { draft: featureChain, repository, labels: item.labels });
        if (!created.success || !created.prUrl) throw new Error(`Chain PR '${item.entry.id}' failed: ${created.error || created.output}`);
      } else if (item.prPlan.action === "update") {
        editManagedPr(repository, pr, item.prPlan);
      }
      pr = findChainPr(repository, item.entry);
      assertManagedPrMetadata(pr, item.prPlan);
      if (item.entry.tracker && (!pr.body.includes("FLOW_TRACKER_NO_MERGE") || pr.isDraft !== true)) throw new Error(`Feature-chain tracker ${pr.url} failed draft/no-merge verification.`);
      recovery.completedSteps.push(`pr:${item.entry.id}`, `labels:${item.entry.id}`);
      const state = item.entry.tracker ? recovery.tracker : recovery.children.find((child) => child.id === item.entry.id);
      state.status = featureChain ? "verified-draft" : "verified";
      state.publication = buildChainPublicationRecord(repository, chainPlanId, item.entry, pr,
        chainBody(plan, validation, item.entry, validation.publications.indexOf(item.entry)), item.labels);
      results.push({ entry: item.entry, chainContext: item.chainContext, prUrl: pr.url, action: item.prPlan.action, labels: item.labels, tracker: Boolean(item.entry.tracker) });
    }
    for (const item of featureChain ? results.filter((result) => !result.tracker) : []) {
      const authority = { candidateCommit: item.entry.expectedHeadSha, candidateRef: item.entry.head };
      const observed = findChainPr(repository, item.entry);
      if (observed.isDraft) markPrReady(item, authority, item.entry.base, repository, () => assertRemoteBranch(item.entry.head, item.entry.expectedHeadSha));
      else assertPrAuthority(item.prUrl, authority, item.entry.base, repository, { requireDraft: false, requireReady: true });
      const verified = findChainPr(repository, item.entry);
      assertManagedPrMetadata(verified, preflight.find((planned) => planned.entry.id === item.entry.id).prPlan);
      recovery.children.find((child) => child.id === item.entry.id).status = "ready";
      recovery.completedSteps.push(`ready:${item.entry.id}`);
    }
    if (featureChain) recovery.tracker.status = "verified-draft-no-merge";
  } catch (error) {
    throw new Error(`${error.message} FLOW_RECOVERY_STATE=${JSON.stringify(recovery)}`);
  }
  process.stdout.write(JSON.stringify({ success: true, mode: "chain", dryRun: false, strategy: plan.strategy, chainPlanId, planIdentity: validation.planIdentity, chainState: { ...recovery, completedSteps: undefined, remoteEffects: undefined, nextSafeAction: undefined, nextAction: undefined, expectedChainPlanId: undefined }, ...(featureChain ? { lineage: recovery.lineage, revision: recovery.revision, tracker: recovery.tracker, children: recovery.children, nextAction } : {}), completedSteps: recovery.completedSteps, remoteEffects: recovery.remoteEffects, nextSafeAction: recovery.nextSafeAction, prs: results.map((item) => ({ id: item.entry.id, head: item.entry.head, base: item.entry.base, prUrl: item.prUrl, action: item.action, labels: item.labels, tracker: item.tracker, chainContext: item.chainContext })), jiraComment: chainJiraComment(plan, results) }, null, 2) + "\n");
}

function readBoundChainPr(repository, record, fields, label) {
  const pr = runGhJson(["pr", "view", String(record.prNumber), "--repo", repository.ghRepo, "--json", fields], label);
  if (pr.number !== record.prNumber || pr.url !== record.prUrl) throw new Error(`${label} returned a substituted PR number or canonical URL.`);
  return pr;
}

function findMergedChainChild(repository, chainPlanId, plan, validation, entry, stateEntry) {
  const labels = labelsForDelivery({ prefix: classifyBranch(entry.head, DELIVERY_CONFIG).prefix });
  const managedBody = chainBody(plan, validation, entry, validation.publications.indexOf(entry));
  const record = assertBoundPublicationRecord(repository, chainPlanId, entry, stateEntry?.publication, managedBody, labels);
  const pr = readBoundChainPr(repository, record,
    "number,url,title,body,labels,state,headRefName,baseRefName,headRefOid,headRepository,headRepositoryOwner,mergedAt,mergeCommit",
    `Merged child lookup for ${entry.head}`);
  if (pr.baseRefName !== entry.base) {
    throw new Error(`Planned child '${entry.id}' was retargeted from immutable parent '${entry.base}' to '${pr.baseRefName || "unknown"}'. Keep every parent branch until all descendants are merged; delete branches only afterward, when retained PR metadata still reports the exact frozen base.`);
  }
  if (pr.state !== "MERGED" || pr.headRefName !== entry.head || pr.baseRefName !== entry.base
    || pr.headRefOid !== entry.expectedHeadSha || prHeadOwnerRepo(pr) !== repository.ownerRepo.toLowerCase()) {
    throw new Error(`Planned child '${entry.id}' is not MERGED at the exact frozen repository/head/base/OID.`);
  }
  if (pr.title !== record.title || managedBodyDigest(pr.body) !== record.managedBodyDigest) throw new Error(`Merged child '${entry.id}' managed plan/work-unit metadata was substituted.`);
  assertManagedLabelCardinality(pr.labels, record.managedLabels);
  if ((pr.mergedAt != null && (typeof pr.mergedAt !== "string" || !pr.mergedAt))
    || (pr.mergeCommit != null && !/^[0-9a-f]{40}$/i.test(String(pr.mergeCommit.oid || "")))) {
    throw new Error(`Planned child '${entry.id}' returned malformed retained merge metadata.`);
  }
  return pr;
}

function fetchCurrentTrackerSnapshot(branch) {
  const sha = remoteHead(branch);
  const fetched = gitSafe(["fetch", "--no-tags", "--no-write-fetch-head", "origin", `refs/heads/${branch}`]);
  if (!fetched.ok) throw new Error(`Could not fetch current tracker branch '${branch}': ${fetched.output}`);
  return { sha, tree: gitValue(["rev-parse", `${sha}^{tree}`], "current tracker tree") };
}

function withDetachedCandidate(sha, callback) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-tracker-"));
  const cwd = path.join(parent, "candidate");
  const added = gitSafe(["worktree", "add", "--detach", cwd, sha]);
  if (!added.ok) { fs.rmSync(parent, { recursive: true, force: true }); throw new Error(`Could not materialize current tracker candidate: ${added.output}`); }
  try { return callback(cwd); }
  finally {
    gitSafe(["worktree", "remove", "--force", cwd]);
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

function aggregateAuthorityBinding(policy, currentTracker, baseRef) {
  return {
    lineage: policy.authority.lineage, revision: policy.authority.revision,
    receiptIdentity: sha256(JSON.stringify({ schema: "flow-pr-aggregate-receipt/v1", authority: policy.authority })),
    gateIdentity: deliveryPlanId(policy, { gate: "pre-pr", candidateCommit: currentTracker.sha, candidateTree: currentTracker.tree }),
    targetIdentity: deliveryPlanId(policy, { target: { baseRef, candidateCommit: currentTracker.sha, candidateTree: currentTracker.tree } }),
  };
}

function buildTrackerFinalization(state, trackerPublication, currentTracker, aggregateAuthority, status) {
  const payload = { schema: "flow-pr-chain-finalization/v1", planIdentity: state.planIdentity,
    trackerPublication, currentTracker, aggregateAuthority };
  return { ...payload, actionKey: sha256(JSON.stringify(payload)), status };
}

function assertTrackerFinalization(state, trackerPublication, currentTracker) {
  const record = state.finalization;
  if (!record) return null;
  const authority = record.aggregateAuthority;
  if (!authority || ![authority.lineage, authority.revision, authority.receiptIdentity, authority.gateIdentity, authority.targetIdentity]
    .every((value) => typeof value === "string" && value.trim())) throw new Error("Tracker finalization journal has malformed aggregate authority identity.");
  const expected = buildTrackerFinalization(state, trackerPublication, currentTracker, authority, record.status);
  if (!["inFlight", "completed"].includes(record.status) || JSON.stringify(record) !== JSON.stringify(expected)) {
    throw new Error("Tracker finalization journal does not match the exact plan/publication/current-candidate authority.");
  }
  return record;
}

function writeFinalizationResult(output) {
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

function finalizeChainTracker(flags) {
  const expected = flags["expected-chain-plan-id"];
  if (!expected || expected === true) throw new Error("finalize_chain_tracker requires --expected-chain-plan-id.");
  const boundState = readExternalChainState(flags["chain-state-file"]), state = boundState.state;
  const { plan, chainPlanId } = readBoundChainPlan(flags, true);
  const frozenState = buildChainState(plan, { planIdentity: chainPlanId });
  if (state.chainPlanId !== expected || state.planIdentity !== expected || chainPlanId !== expected
    || state.strategy !== "feature-branch-chain" || plan.strategy !== "feature-branch-chain"
    || state.lineage !== frozenState.lineage || state.revision !== frozenState.revision
    || state.tracker?.id !== frozenState.tracker?.id
    || JSON.stringify(state.children?.map((entry) => entry.id)) !== JSON.stringify(frozenState.children.map((entry) => entry.id))) {
    throw new Error("External chain state, plan identity, strategy, and expected chain plan ID do not match.");
  }
  const bases = detectBaseBranches();
  const scanResult = { remoteUrl: gitValue(["config", "--get", "remote.origin.url"], "origin URL"), devBase: bases.devBase, prodBase: bases.prodBase };
  const validation = validateChainPlan(plan, collectChainFinalizationContext(plan, scanResult), { mode: "finalization" });
  if (validation.planIdentity !== expected) throw new Error("Chain plan or refs changed after initial publication.");
  const repository = freezeRepositoryIdentity();
  const trackerEntry = validation.publications.find((entry) => entry.tracker);
  const currentTracker = fetchCurrentTrackerSnapshot(trackerEntry.head);
  const originalTree = gitValue(["rev-parse", `${trackerEntry.expectedHeadSha}^{tree}`], "original tracker tree");
  if (originalTree !== trackerEntry.expectedTree || !gitSafe(["merge-base", "--is-ancestor", trackerEntry.expectedHeadSha, currentTracker.sha]).ok) {
    throw new Error("Current tracker does not descend from the immutable original tracker authority; finalization is blocked.");
  }
  if (currentTracker.tree !== plan.expectedFinalTree) {
    throw new Error(`Current tracker aggregate tree ${currentTracker.tree} does not equal expectedFinalTree ${plan.expectedFinalTree}; child merge order left missing or extra content.`);
  }
  const labels = labelsForDelivery({ prefix: classifyBranch(trackerEntry.head, DELIVERY_CONFIG).prefix });
  const managedBody = chainBody(plan, validation, trackerEntry, 0);
  const trackerRecord = assertBoundPublicationRecord(repository, chainPlanId, trackerEntry, state.tracker?.publication, managedBody, labels);
  const tracker = readBoundChainPr(repository, trackerRecord,
    "number,url,title,body,labels,state,isDraft,headRefOid,headRefName,headRepository,headRepositoryOwner,baseRefName",
    "Bound feature-chain tracker lookup");
  if (tracker.state !== "OPEN" || typeof tracker.isDraft !== "boolean" || tracker.headRefOid !== currentTracker.sha
    || tracker.headRefName !== trackerEntry.head || tracker.baseRefName !== trackerEntry.base
    || prHeadOwnerRepo(tracker) !== repository.ownerRepo.toLowerCase()) throw new Error("Bound feature-chain tracker no longer matches current repository/head/base/OID authority.");
  const metadata = managedPrPlan(tracker, chainTitle(trackerEntry), mergePrBody(tracker.body, managedBody), labels, availableManagedLabels(repository));
  if (metadata.action !== "noop" || !tracker.body.includes("FLOW_TRACKER_NO_MERGE")) throw new Error("Feature-chain tracker managed metadata or no-merge state changed after publication.");
  assertManagedPrMetadata(tracker, metadata);
  plan.prs.forEach((entry, index) => findMergedChainChild(repository, chainPlanId, plan, validation, entry, state.children[index]));
  const policy = withDetachedCandidate(currentTracker.sha, (cwd) => resolvePublicationDeliveryPolicy({ cwd,
    baseRef: plan.integrationRef.expectedSha, candidateRef: currentTracker.sha, gate: "pre-pr", runner: reviewDeliveryRunner }));
  if (!policy.authority || policy.lifecycle === "disabled") throw new Error("A fresh approved aggregate review receipt is required before tracker finalization or replay.");
  const freshAggregateAuthority = aggregateAuthorityBinding(policy, currentTracker, plan.integrationRef.expectedSha);
  let finalization = assertTrackerFinalization(state, trackerRecord, currentTracker);
  if (finalization && JSON.stringify(finalization.aggregateAuthority) !== JSON.stringify(freshAggregateAuthority)) {
    throw new Error("Persisted aggregate authority evidence does not match the freshly validated current tracker receipt and target binding; readiness is blocked.");
  }
  if (!tracker.isDraft) {
    if (!finalization) throw new Error("Tracker is ready without a matching in-flight/completed finalization record; external readiness is unauthorized.");
    if (finalization.status === "inFlight") {
      finalization = { ...finalization, status: "completed" }; state.finalization = finalization; persistExternalChainState(boundState);
    }
    writeFinalizationResult({ success: true, operation: "finalize_chain_tracker", chainPlanId,
      actionKey: finalization.actionKey, idempotent: true,
      tracker: { prUrl: tracker.url, sha: currentTracker.sha, tree: currentTracker.tree, ready: true }, merged: false });
    return;
  }
  if (finalization?.status === "completed") throw new Error("Completed tracker finalization journal conflicts with a draft tracker; manual state changed outside Flow.");
  if (!finalization) {
    finalization = buildTrackerFinalization(state, trackerRecord, currentTracker, freshAggregateAuthority, "inFlight");
    state.finalization = finalization;
    persistExternalChainState(boundState);
  }
  assertRemoteBranch(trackerEntry.head, currentTracker.sha);
  const readyResult = runToolScript("FLOW_GH_SCRIPT", "gh", ["pr", "ready", tracker.url, "--repo", repository.ghRepo]);
  const observed = readBoundChainPr(repository, trackerRecord,
    "number,url,title,body,labels,state,isDraft,headRefOid,headRefName,headRepository,headRepositoryOwner,baseRefName",
    "Post-ready tracker reconciliation");
  if (observed.state !== "OPEN" || typeof observed.isDraft !== "boolean" || observed.headRefOid !== currentTracker.sha
    || observed.headRefName !== trackerEntry.head || observed.baseRefName !== trackerEntry.base
    || prHeadOwnerRepo(observed) !== repository.ownerRepo.toLowerCase()) throw new Error("Post-ready tracker authority is malformed or changed.");
  assertManagedPrMetadata(observed, metadata);
  if (observed.isDraft) {
    writeFinalizationResult({ success: false, operation: "finalize_chain_tracker", chainPlanId,
      actionKey: finalization.actionKey, retryable: true, recovery: { status: "inFlight",
        nextAction: "retry_finalize_chain_tracker", readyDiagnostic: readyResult.output || "tracker remained draft" },
      tracker: { prUrl: tracker.url, sha: currentTracker.sha, tree: currentTracker.tree, ready: false }, merged: false });
    process.exitCode = 1;
    return;
  }
  assertRemoteBranch(trackerEntry.head, currentTracker.sha);
  finalization = { ...finalization, status: "completed" }; state.finalization = finalization; persistExternalChainState(boundState);
  writeFinalizationResult({ success: true, operation: "finalize_chain_tracker", chainPlanId,
    actionKey: finalization.actionKey, idempotent: false, reconciledAmbiguousReady: !readyResult.ok,
    tracker: { prUrl: tracker.url, sha: currentTracker.sha, tree: currentTracker.tree, ready: true }, merged: false });
}

function validateCandidate(authority, gate = "pre-pr", repository = null) {
  const { lineage, baseRef, candidateRef } = authority;
  const boundRepository = assertRepositoryIdentity(repository);
  const root = gitValue(["rev-parse", "--show-toplevel"], "repository root");
  assertToolIdentity(activePublicationTooling.gentle);
  const native = publicationDependencies.runner(activePublicationTooling.gentle.path, [
    "review", "validate", "--gate", gate, "--cwd", root,
    "--lineage", lineage, "--base-ref", baseRef,
  ]);
  if (!native.ok) throw new Error(`Native ${gate} receipt rejected for ${candidateRef}: ${native.output}`);
  if (gate !== "pre-pr") return;
  assertToolIdentity(activePublicationTooling.audit);
  const audit = publicationDependencies.runner(process.execPath, [
    activePublicationTooling.audit.path,
    "--checks-only",
    "--no-pass-cache",
    "--base-ref", baseRef,
    "--candidate-ref", candidateRef,
  ]);
  if (!audit.ok) throw new Error(`Deterministic evidence rejected for ${candidateRef}: ${audit.output}`);
  let result;
  try { result = JSON.parse(audit.stdout); }
  catch { throw new Error(`Deterministic evidence for ${candidateRef} was not valid JSON.`); }
  const publication = result?.candidate?.publication;
  const expectedBaseCommit = authority.baseCommit || authority.publicationBaseCommit;
  if (
    result?.success !== true ||
    result?.evidence?.source !== "fresh" ||
    result?.evidence?.authoritative !== true ||
    !result?.candidate?.toolConfigDigest ||
    result.candidate.root !== boundRepository.root ||
    result.candidate.remote !== boundRepository.originUrl ||
    result.candidate.repoIdentity !== boundRepository.auditIdentity ||
    publication?.baseRef !== baseRef ||
    publication?.candidateRef !== candidateRef ||
    publication?.publicationBaseCommit !== expectedBaseCommit ||
    publication?.candidateCommit !== authority.candidateCommit ||
    publication?.candidateTree !== authority.candidateTree ||
    publication?.pathsDigest !== authority.pathsDigest
  ) {
    throw new Error(`Deterministic evidence for ${candidateRef} did not match fresh frozen publication authority.`);
  }
}

function preparePromotion(flags) {
  const stateFile = flags["state-file"] !== true ? flags["state-file"] : null;
  const coordinatorStateFile = flags["coordinator-state-file"] !== true ? flags["coordinator-state-file"] : null;
  const expectedPlanId = flags["expected-promotion-plan-id"] !== true ? flags["expected-promotion-plan-id"] : null;
  if (!coordinatorStateFile || !expectedPlanId) {
    throw new Error("--prepare-promotion requires --coordinator-state-file and --expected-promotion-plan-id from the approved dry-run.");
  }
  const externalState = JSON.parse(fs.readFileSync(assertPromotionStatePath(coordinatorStateFile), "utf8"));
  if (externalState?.schema !== PROMOTION_REVIEW_COORDINATOR_SCHEMA) {
    throw new Error("Promotion coordinator state schema is unsupported; rerun /flow-pr promotion review before preparation.");
  }
  const reviewed = promotionReview({ "state-file": coordinatorStateFile,
    lenses: externalState.lenses.join(","), _silent: true, refresh: true });
  if (!reviewed.promotionPlanId || reviewed.promotionPlanId !== expectedPlanId) {
    throw new Error("Expected promotion plan ID does not match current approved coordinator, receipt validation, Git, or native authority; rerun /flow-pr promotion review.");
  }
  const promotion = buildPromotionContext();
  if (promotion.noOp) throw new Error("Promotion is a no-op: integration and production have identical trees.");
  const scanResult = runSelfMode(["--scan"]);
  const cicdObservations = runSelfMode(["--check-cicd"]);
  const versionContextResult = runSelfMode(["--version-context"]);
  const semanticRelease = cicdObservations.cicd.some((item) => item.patterns?.hasSemanticRelease);
  const versionAfter = semanticRelease ? versionContextResult.version.current : versionContextResult.version.suggestedVersion;
  runSelfMode(["--release-guard", "--source", promotion.branch, "--target", promotion.productionBranch,
    "--is-clean", "true", "--version", versionAfter]);

  let release = null;
  if (!semanticRelease) {
    const created = createReleaseBranch(versionAfter);
    if (!created.success) throw new Error(`Failed to create release branch: ${created.error}`);
    try {
      const updated = runSelfMode(["--update-version", "--version", versionAfter]);
      if (versionContextResult.version.shouldUpdateChangelog) {
        updateChangelog(versionAfter, versionContextResult.commits.log);
      }
      const files = [...new Set([
        ...(updated.updatedFiles || updated.updatedByNpm || []),
        ...(updated.updatedEnvFiles || []),
        versionContextResult.version.shouldUpdateChangelog ? "CHANGELOG.md" : null,
      ].filter(Boolean))];
      runSelfMode(["--commit-version", "--version", versionAfter, "--files", files.join(",")]);
      release = {
        ...candidateContext(promotion.integrationRef, created.branch, "release"),
        branch: created.branch,
        versionFiles: files,
        shouldCreateAnnotatedTag: Boolean(versionContextResult.version.shouldCreateAnnotatedTag),
      };
    } finally {
      const restored = checkoutBranch(promotion.branch);
      if (!restored.success) throw new Error(`Failed to restore ${promotion.branch}: ${restored.error}`);
    }
  }
  const state = {
    schema: PROMOTION_STATE_SCHEMA,
    preparedAt: new Date().toISOString(),
    promotion,
    release,
    publication: release ? candidateContext(promotion.baseRef, release.branch, "promotion") : promotion,
    releaseFlow: semanticRelease ? "semantic-release" : "protected-dev",
    version: { before: versionContextResult.version.current, after: versionAfter, system: versionContextResult.version.system },
    cicdObservations,
    prDescription: buildPrDescription(scanResult, { version: versionAfter,
      title: buildPrTitle(scanResult, promotion.productionBranch, versionAfter, { cicdUsesSemanticRelease: semanticRelease }) }),
    review: { coordinatorStateFile: path.resolve(coordinatorStateFile), promotionPlanId: expectedPlanId },
  };
  writePromotionState(stateFile, state);
  process.stdout.write(JSON.stringify({ success: true, mode: "prepare-promotion", stateFile: path.resolve(stateFile), ...state }, null, 2) + "\n");
}

function publishPromotion(flags) {
  activePublicationTooling = publicationDependencies.tooling || freezePublicationTooling();
  const state = readPromotionState(flags["state-file"] !== true ? flags["state-file"] : null);
  const coordinatorStateFile = flags["coordinator-state-file"] !== true ? flags["coordinator-state-file"] : null;
  const expectedPlanId = flags["expected-promotion-plan-id"] !== true ? flags["expected-promotion-plan-id"] : null;
  if (!coordinatorStateFile || !expectedPlanId || state.review?.coordinatorStateFile !== path.resolve(coordinatorStateFile)
    || state.review?.promotionPlanId !== expectedPlanId) {
    throw new Error("--publish-promotion requires the exact Phase-2 coordinator state and expected promotionPlanId used for preparation.");
  }
  const externalState = JSON.parse(fs.readFileSync(assertPromotionStatePath(coordinatorStateFile), "utf8"));
  if (externalState?.schema !== PROMOTION_REVIEW_COORDINATOR_SCHEMA) {
    throw new Error("Promotion coordinator state is old or unsupported; rerun /flow-pr promotion review.");
  }
  const reviewed = promotionReview({ "state-file": coordinatorStateFile, _silent: true, refresh: true });
  if (reviewed.promotionPlanId !== expectedPlanId) {
    throw new Error("Expected promotionPlanId no longer matches refreshed Git and native authority.");
  }
  const repository = assertRepositoryIdentity(state.promotion.repository);
  if (gitValue(["branch", "--show-current"], "current branch") !== state.promotion.branch) {
    const restored = checkoutBranch(state.promotion.branch);
    if (!restored.success) throw new Error(`Failed to restore ${state.promotion.branch}: ${restored.error}`);
  }
  const livePromotion = buildPromotionContext({ refresh: true });
  if (livePromotion.noOp || livePromotion.fingerprint !== state.promotion.fingerprint) {
    throw new Error("Promotion scope changed after review.");
  }

  if (state.release) {
    const liveRelease = candidateContext(state.release.baseRef, state.release.branch, "release");
    const livePublication = candidateContext(state.publication.baseRef, state.publication.candidateRef, "promotion");
    if (liveRelease.fingerprint !== state.release.fingerprint || livePublication.fingerprint !== state.publication.fingerprint) {
      throw new Error("Prepared release or aggregate publication candidate changed after review.");
    }
    const checkedOut = checkoutBranch(state.release.branch);
    if (!checkedOut.success) throw new Error(`Failed to checkout ${state.release.branch}: ${checkedOut.error}`);
    const createdPrs = [];
    try {
      // Every validation completes before the first PR can be created.
      validateCandidate(state.release, "pre-pr", repository);
      validateCandidate(state.release, "pre-push", repository);
      validateCandidate(state.publication, "pre-pr", repository);
      assertRemotePromotionHeads(state.promotion);
      const availableLabels = availableManagedLabels(repository);
      if (state.release.shouldCreateAnnotatedTag) {
        assertRepositoryIdentity(repository);
        runSelfMode(["--create-tag", "--version", state.version.after,
          "--expected-commit", state.release.candidateCommit]);
      }
      assertRepositoryIdentity(repository);
      assertRemotePromotionHeads(state.promotion);
      const pushed = gitSafe(["push", "-u", "origin", state.release.branch]);
      if (!pushed.ok) throw new Error(`Failed to push release branch: ${pushed.output}`);
      if (state.release.shouldCreateAnnotatedTag) {
        assertRepositoryIdentity(repository);
        assertRemotePromotionHeads(state.promotion);
        assertRemoteBranch(state.release.branch, state.release.candidateCommit, `reviewed release ${state.release.branch}`);
        const tagPush = gitSafe(["push", "origin", `refs/tags/v${state.version.after}`]);
        if (!tagPush.ok) throw new Error(`Failed to push release tag: ${tagPush.output}`);
      }

      const verifyRemote = () => {
        assertRepositoryIdentity(repository);
        assertRemotePromotionHeads(state.promotion);
        assertRemoteBranch(state.release.branch, state.release.candidateCommit, `reviewed release ${state.release.branch}`);
      };
      const bumpTitle = `chore(release): bump version to ${state.version.after}`;
      const bumpBody = [
        `## Version bump ${state.version.before} → ${state.version.after}`,
        "",
        `Merge this reviewed candidate into \`${state.promotion.branch}\` before merging the production PR.`,
        "",
        "### Files changed",
        ...state.release.versionFiles.map((file) => `- ${file}`),
      ].join("\n");
      const bumpPr = createVerifiedDraftPr(
        state.promotion.branch,
        bumpTitle,
        bumpBody,
        state.release,
        repository,
        verifyRemote,
        labelsForDelivery({ changeType: "chore" }),
        availableLabels,
      );
      createdPrs.push(bumpPr);
      const productionTitle = `chore(release): promote ${state.release.branch} to ${state.promotion.productionBranch}`;
      const productionPr = createVerifiedDraftPr(
        state.promotion.productionBranch,
        productionTitle,
        state.prDescription,
        state.publication,
        repository,
        verifyRemote,
        labelsForDelivery({ changeType: "chore" }),
        availableLabels,
      );
      createdPrs.push(productionPr);

      // Nothing becomes mergeable until every draft and remote authority is valid.
      markPrReady(bumpPr, state.release, state.promotion.branch, repository, verifyRemote);
      markPrReady(productionPr, state.publication, state.promotion.productionBranch, repository, verifyRemote);
      process.stdout.write(JSON.stringify({ success: true, mode: "publish-promotion", branch: state.promotion.branch,
        baseBranch: state.promotion.productionBranch, promotion: state.publication, releaseBranch: state.release.branch,
        bumpPr, prs: [{ target: state.promotion.productionBranch, title: productionTitle, ...productionPr }] }, null, 2) + "\n");
    } catch (error) {
      if (createdPrs.length > 0) {
        closePrs(createdPrs, repository, "Closed automatically: promotion publication did not complete atomically.");
      }
      throw error;
    } finally {
      const restored = checkoutBranch(state.promotion.branch);
      if (!restored.success) throw new Error(`Failed to restore ${state.promotion.branch}: ${restored.error}`);
    }
    return;
  }

  const createdPrs = [];
  try {
    validateCandidate(state.publication, "pre-pr", repository);
    const availableLabels = availableManagedLabels(repository);
    const verifyRemote = () => {
      assertRepositoryIdentity(repository);
      assertRemotePromotionHeads(state.promotion);
    };
    const title = `chore(release): merge ${state.promotion.branch} into ${state.promotion.productionBranch}`;
    const productionPr = createVerifiedDraftPr(
      state.promotion.productionBranch,
      title,
      state.prDescription,
      state.publication,
      repository,
      verifyRemote,
      labelsForDelivery({ changeType: "chore" }),
      availableLabels,
    );
    createdPrs.push(productionPr);
    markPrReady(productionPr, state.publication, state.promotion.productionBranch, repository, verifyRemote);
    process.stdout.write(JSON.stringify({ success: true, mode: "publish-promotion", branch: state.promotion.branch,
      baseBranch: state.promotion.productionBranch, promotion: state.publication, releaseBranch: null, bumpPr: null,
      prs: [{ target: state.promotion.productionBranch, title, ...productionPr }] }, null, 2) + "\n");
  } catch (error) {
    if (createdPrs.length > 0) closePrs(createdPrs, repository, "Closed automatically: promotion publication did not complete atomically.");
    throw error;
  }
}

// ─── --push ───────────────────────────────────────────────────────────────────

function push(flags = {}) {
  const includeTags = hasTruthyFlag(flags["tags"]);
  const branchResult = gitSafe(["branch", "--show-current"]);
  const branch = branchResult.ok ? branchResult.stdout : "unknown";

  // Usar -u para setear upstream tracking (primera vez)
  const pushResult = gitSafe(["push", "-u", "origin", branch]);

  let tagPushResult = null;
  if (pushResult.ok && includeTags) {
    tagPushResult = gitSafe(["push", "origin", "--tags"]);
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

function createPrViaGh(target, title, body, head = null, options = {}) {
  const repository = options.repository || freezeRepositoryIdentity();
  const args = ["pr", "create", "--base", target];
  if (head) args.push("--head", head);
  if (options.draft) args.push("--draft");
  args.push("--repo", repository.ghRepo);
  for (const label of options.labels || []) args.push("--label", label);
  args.push("--title", title, "--body-file", "-");
  const result = runToolScript("FLOW_GH_SCRIPT", "gh", args, { input: body });

  const urlMatch = result.output.match(/https:\/\/[^\s]+/);
  return {
    success: result.ok,
    prUrl: urlMatch ? urlMatch[0] : null,
    target,
    alreadyExists: false,
    output: result.output,
    error: result.ok ? null : result.output,
  };
}

const ORDINARY_FLOW_SECTIONS = new Set([
  "Summary",
  "Changes",
  "Testing",
  "Deployment Notes",
  "Breaking Changes",
  "Checklist",
]);

function markdownSections(body) {
  const text = String(body || "");
  const matches = [...text.matchAll(/^## ([^\r\n]+)\r?$/gm)];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    start: match.index,
    end: matches[index + 1]?.index ?? text.length,
    text: text.slice(match.index, matches[index + 1]?.index ?? text.length),
  }));
}

function mergeOrdinaryPrBody(existingBody, desiredBody) {
  const existing = String(existingBody || "");
  const desired = String(desiredBody || "");
  if (!existing || existing === desired) return desired;

  const typoOnly = existing.replaceAll("/healtz", "/healthz");
  if (typoOnly.replace(/\s+$/, "") === desired.replace(/\s+$/, "")) return typoOnly;

  const markerState = validatePrBodyMarkers(existing);
  if (markerState.hasManaged) {
    return mergePrBody(existing, `${MANAGED_START}\n${desired}\n${MANAGED_END}`);
  }

  const desiredByTitle = new Map(
    markdownSections(desired)
      .filter((section) => ORDINARY_FLOW_SECTIONS.has(section.title))
      .map((section) => [section.title, section.text]),
  );
  const replacements = markdownSections(existing)
    .filter((section) => desiredByTitle.has(section.title))
    .map((section) => {
      const trailingWhitespace = section.text.match(/\s*$/)?.[0] || "";
      return {
        ...section,
        text: desiredByTitle.get(section.title).replace(/\s*$/, "") + trailingWhitespace,
      };
    });

  if (replacements.length === 0) {
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    return `${existing}${separator}${MANAGED_START}\n${desired}\n${MANAGED_END}`;
  }

  let merged = existing;
  for (const replacement of replacements.reverse()) {
    merged = merged.slice(0, replacement.start) + replacement.text + merged.slice(replacement.end);
  }
  return merged;
}

function prHeadOwnerRepo(pr) {
  const nameWithOwner = String(pr?.headRepository?.nameWithOwner || "").trim();
  if (nameWithOwner) return nameWithOwner.toLowerCase();
  const owner = String(pr?.headRepositoryOwner?.login || "").trim();
  const name = String(pr?.headRepository?.name || "").trim();
  if (!owner || !name) {
    throw new Error("PR head repository authority is incomplete.");
  }
  return `${owner}/${name}`.toLowerCase();
}

function findOrdinaryPr(repository, head, base, candidateCommit) {
  const prs = runGhJson([
    "pr", "list", "--repo", repository.ghRepo, "--state", "open",
    "--head", head, "--base", base,
    "--json", "number,url,title,body,state,headRefOid,headRefName,headRepository,headRepositoryOwner,baseRefName,labels,isDraft",
  ], `PR lookup for ${head} -> ${base}`);
  if (!Array.isArray(prs) || prs.length > 1) {
    throw new Error(`PR lookup for '${head}' -> '${base}' is ambiguous (${prs?.length || 0} candidates).`);
  }
  const pr = prs[0] || null;
  if (!pr) return null;
  const owner = prHeadOwnerRepo(pr);
  if (
    pr.state !== "OPEN" ||
    pr.headRefName !== head ||
    pr.baseRefName !== base ||
    pr.headRefOid !== candidateCommit ||
    owner !== repository.ownerRepo.toLowerCase()
  ) {
    throw new Error(`Existing PR for '${head}' -> '${base}' does not match local head OID and repository authority.`);
  }
  return pr;
}

function ordinaryPrIdentity(plan) {
  return {
    target: plan.target,
    action: plan.action,
    desiredTitleDigest: sha256(plan.title),
    desiredBodyDigest: sha256(plan.body),
    labels: plan.labels,
    remote: plan.remote,
  };
}

function buildOrdinaryPrPlans(repository, scanResult, candidateCommit, titleForTarget, generatedBody, availableLabels) {
  const labels = labelsForScan(scanResult);
  return scanResult.targetBranches.map((target) => {
    const title = titleForTarget(target);
    const existing = findOrdinaryPr(repository, scanResult.currentBranch, target, candidateCommit);
    const body = existing ? mergeOrdinaryPrBody(existing.body, generatedBody) : generatedBody;
    const metadata = managedPrPlan(existing, title, body, labels, availableLabels);
    return {
      target,
      title,
      body,
      action: metadata.action,
      labels,
      labelPlan: metadata.labelPlan,
      prUrl: existing?.url || null,
      number: existing?.number || null,
      remote: existing ? {
        number: existing.number,
        url: existing.url,
        state: existing.state,
        head: existing.headRefName,
        base: existing.baseRefName,
        headOid: existing.headRefOid,
        titleDigest: sha256(existing.title),
        bodyDigest: sha256(existing.body),
        labels: (existing.labels || []).map((label) => label.name || label).sort(),
      } : null,
    };
  });
}

function assertOrdinaryPrPlansCurrent(repository, expectedPlans, scanResult, candidateCommit, titleForTarget, generatedBody, availableLabels) {
  const current = buildOrdinaryPrPlans(repository, scanResult, candidateCommit, titleForTarget, generatedBody, availableLabels);
  if (JSON.stringify(current.map(ordinaryPrIdentity)) !== JSON.stringify(expectedPlans.map(ordinaryPrIdentity))) {
    throw new Error("Remote PR state drifted after the dry-run plan; publication is blocked.");
  }
  return current;
}

function updateOrdinaryPr(repository, plan) {
  editManagedPr(repository, { number: plan.number, url: plan.prUrl, title: plan.remote.titleDigest === sha256(plan.title) ? plan.title : "", body: plan.remote.bodyDigest === sha256(plan.body) ? plan.body : "", labels: plan.remote.labels }, plan);
  return { success: true, prUrl: plan.prUrl, target: plan.target, alreadyExists: true, action: "update", output: "Updated managed PR state", error: null };
}

function verifyOrdinaryPr(repository, plan, scanResult, candidateCommit) {
  const observed = findOrdinaryPr(repository, scanResult.currentBranch, plan.target, candidateCommit);
  if (!observed) throw new Error(`PR verification failed for '${scanResult.currentBranch}' -> '${plan.target}'.`);
  assertManagedPrMetadata(observed, plan);
  return observed;
}

function recoverExistingDraftPr(authority, target, repository) {
  const result = runToolScript("FLOW_GH_SCRIPT", "gh", [
    "pr", "list", "--repo", repository.ghRepo, "--state", "open",
    "--head", authority.candidateRef, "--base", target,
    "--json", "number,url,title,body,labels,state,isDraft,headRefOid,headRefName,headRepository,headRepositoryOwner,baseRefName",
  ]);
  if (!result.ok) throw new Error(`Could not reconcile an existing draft PR: ${result.output}`);
  let candidates;
  try { candidates = JSON.parse(result.stdout); }
  catch { throw new Error("Existing draft PR reconciliation returned malformed JSON."); }
  if (!Array.isArray(candidates) || candidates.length !== 1) {
    throw new Error(`Existing draft PR reconciliation is ambiguous (${candidates?.length || 0} candidates).`);
  }
  const candidate = candidates[0];
  const owner = prHeadOwnerRepo(candidate);
  if (candidate.state !== "OPEN" || candidate.isDraft !== true ||
      candidate.headRefOid !== authority.candidateCommit ||
      candidate.headRefName !== authority.candidateRef || candidate.baseRefName !== target ||
      owner !== repository.ownerRepo.toLowerCase()) {
    throw new Error("Existing draft PR does not match frozen head repository/ref/OID/base authority.");
  }
  return { success: true, prUrl: candidate.url, target, alreadyExists: true,
    output: "Recovered exact existing draft PR", error: null };
}

function readPrAuthority(prUrl, repository) {
  assertRepositoryIdentity(repository);
  const result = runToolScript("FLOW_GH_SCRIPT", "gh", [
    "pr", "view", prUrl,
    "--repo", repository.ghRepo,
    "--json", "number,url,title,body,labels,state,isDraft,headRefOid,headRefName,headRepository,headRepositoryOwner,baseRefName",
  ]);
  if (!result.ok) throw new Error(`Could not verify draft PR ${prUrl}: ${result.output}`);
  try {
    const observed = JSON.parse(result.stdout);
    return { ...observed, labels: normalizeLabelNames(observed.labels) };
  }
  catch { throw new Error(`Draft PR verification returned malformed JSON for ${prUrl}.`); }
}

function closePr(prUrl, repository, reason) {
  return runToolScript("FLOW_GH_SCRIPT", "gh", [
    "pr", "close", prUrl,
    "--repo", repository.ghRepo,
    "--comment", reason,
  ]);
}

function closePrs(prs, repository, reason) {
  for (const pr of [...prs].reverse()) closePr(pr.prUrl, repository, reason);
}

function assertPrAuthority(prUrl, authority, target, repository, { requireDraft = true, requireReady = false } = {}) {
  const observed = readPrAuthority(prUrl, repository);
  const observedOwnerRepo = prHeadOwnerRepo(observed);
  if (
    observed?.state !== "OPEN" ||
    (requireDraft && observed?.isDraft !== true) ||
    (requireReady && observed?.isDraft !== false) ||
    observed?.headRefOid !== authority.candidateCommit ||
    observed?.headRefName !== authority.candidateRef ||
    observed?.baseRefName !== target ||
    observedOwnerRepo !== repository.ownerRepo.toLowerCase()
  ) {
    throw new Error(`Draft PR ${prUrl} does not match frozen head repository/ref/OID/base authority.`);
  }
  return observed;
}

function createVerifiedDraftPr(target, title, body, authority, repository, verifyRemote, labels, availableLabels) {
  assertRepositoryIdentity(repository);
  verifyRemote();
  let existing = findOrdinaryPr(repository, authority.candidateRef, target, authority.candidateCommit);
  if (existing && existing.isDraft !== true) throw new Error(`Existing promotion PR ${existing.url} is not a draft.`);
  let created = existing ? { success: true, prUrl: existing.url, target, alreadyExists: true } : createPrViaGh(target, title, body, authority.candidateRef, { draft: true, repository, labels });
  if (!created.success || !created.prUrl) {
    try {
      created = recoverExistingDraftPr(authority, target, repository);
      existing = findOrdinaryPr(repository, authority.candidateRef, target, authority.candidateCommit);
    }
    catch (error) { throw new Error(`Failed to create draft PR: ${created.error || "missing PR URL"}; ${error.message}`); }
  }
  try {
    const desiredBody = existing ? mergeOrdinaryPrBody(existing.body, body) : body;
    const plan = managedPrPlan(existing, title, desiredBody, labels, availableLabels);
    if (plan.action === "update") editManagedPr(repository, existing, plan);
    const observed = assertPrAuthority(created.prUrl, authority, target, repository);
    assertManagedPrMetadata(observed, plan);
    return { ...created, action: existing ? plan.action : "create", labels };
  } catch (error) {
    closePr(created.prUrl, repository, "Closed automatically: created PR did not match frozen reviewed authority.");
    throw error;
  }
}

function markPrReady(pr, authority, target, repository, verifyRemote) {
  assertPrAuthority(pr.prUrl, authority, target, repository);
  assertRepositoryIdentity(repository);
  verifyRemote();
  const ready = runToolScript("FLOW_GH_SCRIPT", "gh", [
    "pr", "ready", pr.prUrl, "--repo", repository.ghRepo,
  ]);
  if (!ready.ok) throw new Error(`Could not mark PR ready: ${ready.output}`);
  verifyRemote();
  assertPrAuthority(pr.prUrl, authority, target, repository, { requireDraft: false, requireReady: true });
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
  if (!isIntegrationBranch(source)) {
    reasons.push(`source branch '${source}' is not an integration branch`);
  }
  if (!isProductionBranch(target)) {
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
    const tagExists = runSafe(`git rev-parse --verify refs/tags/v${newVersion}`);
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

export function auto(flags = {}) {
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  if (flags["chain-plan"] && !dryRun) flags._boundChain = readBoundChainPlan(flags, true);
  const titleOverride = normalizeSingleLineText(flags["title-override"] || "");
  const prBodyOverride = readOptionalTextFile(
    flags["pr-body-file"],
    "PR body override",
  );
  const localStatus = gitSafe(["status", "--porcelain"]);
  if (!localStatus.ok || parseGitStatusLines(localStatus.stdout).length > 0) {
    throw new Error("Uncommitted files detected. Run /flow-commit first; remote fetch was not attempted.");
  }
  const fetchResult = gitSafe(["fetch", "--prune", "origin"]);
  if (!fetchResult.ok) {
    throw new Error(`Remote preflight failed before publication planning: ${fetchResult.output}`);
  }
  const scanResult = runSelfMode(["--scan"]);

  if (scanResult.isAbort && !flags["chain-plan"]) {
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

  const fetch = { success: true, remote: "origin", pruned: true, output: fetchResult.output };
  if (flags["chain-plan"]) return chainAuto(flags, scanResult, fetch);

  if (scanResult.isIntegrationPR && !dryRun) {
    throw new Error(
      "Integration promotion is internally orchestrated through prepare/review/publish phases; run /flow-pr rather than invoking --auto directly.",
    );
  }

  if (!scanResult.isIntegrationPR && scanResult.chainForecast?.oversized) {
    process.stdout.write(JSON.stringify({ success: true, mode: "auto", dryRun, decisionRequired: true, branch: scanResult.currentBranch, baseBranch: scanResult.baseBranch, chainForecast: scanResult.chainForecast, nextAction: "Provide an explicit validated --chain-plan. Flow-pr will not publish one oversized PR.", fetch, prs: [] }, null, 2) + "\n");
    return;
  }

  const deliveryPolicy = resolvePublicationDeliveryPolicy({
    baseRef: scanResult.baseRef,
    candidateRef: "HEAD",
    gate: "pre-push",
    runner: reviewDeliveryRunner,
  });
  const reviewedBaseRef = scanResult.mergeBase || scanResult.baseRef;
  const deliveryCommitCount = Number.parseInt(
    gitValue(["rev-list", "--count", `${reviewedBaseRef}..HEAD`], "reviewed delivery commit count"),
    10,
  );
  assertReviewedDeliveryTopology(deliveryPolicy, deliveryCommitCount);
  const candidateCommit = gitValue(["rev-parse", "HEAD^{commit}"], "candidate commit");
  const candidateTree = gitValue(["rev-parse", "HEAD^{tree}"], "candidate tree");
  const repository = scanResult.isIntegrationPR ? null : freezeRepositoryIdentity();
  const availableLabels = repository ? availableManagedLabels(repository) : [];
  const titleForTarget = (target) => buildPrTitle(scanResult, target, null, { titleOverride });
  const plannedTitle = titleForTarget(scanResult.targetBranches[0]);
  const plannedDescription = prBodyOverride || buildPrDescription(scanResult, { title: plannedTitle });
  const ordinaryPlans = scanResult.isIntegrationPR
    ? []
    : buildOrdinaryPrPlans(repository, scanResult, candidateCommit, titleForTarget, plannedDescription, availableLabels);
  const planId = deliveryPlanId(deliveryPolicy, {
    branch: scanResult.currentBranch,
    baseRef: scanResult.mergeBase || scanResult.baseRef,
    candidateCommit,
    candidateTree,
    paths: [...scanResult.changedFiles].sort(),
    pullRequests: ordinaryPlans.map(ordinaryPrIdentity),
  });
  if (!dryRun && flags["expected-plan-id"] !== planId) {
    throw new Error("Publication plan identity is missing or drifted; rerun --auto --dry-run and pass its planId with --expected-plan-id.");
  }

  let versionBefore = null;
  let versionAfter = null;
  let changelogEntry = null;
  let cicdObservations = null;
  let versionSystem = null;
  let tagCreated = false;
  let tagName = null;
  let shouldPushTags = false;

  if (scanResult.isIntegrationPR) {
    cicdObservations = runSelfMode(["--check-cicd"]);
    const versionContextResult = runSelfMode(["--version-context"]);

    versionSystem = versionContextResult.version.system;
    versionBefore = versionContextResult.version.current;
    versionAfter = versionContextResult.version.suggestedVersion;
    shouldPushTags = Boolean(versionContextResult.version.shouldCreateAnnotatedTag);

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
        ...(versionUpdateResult.updatedFiles || versionUpdateResult.updatedByNpm || []),
        ...versionUpdateResult.updatedEnvFiles,
        versionContextResult.version.shouldUpdateChangelog ? "CHANGELOG.md" : null,
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

  if (!dryRun && ordinaryPlans.length > 0) {
    assertOrdinaryPrPlansCurrent(repository, ordinaryPlans, scanResult, candidateCommit, titleForTarget, plannedDescription, availableLabels);
  }

  const allPrsAlreadyExist = ordinaryPlans.length > 0 && ordinaryPlans.every((plan) => plan.remote);
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
    : allPrsAlreadyExist
      ? {
          success: true,
          branch: scanResult.currentBranch,
          remote: "origin",
          output: "Push skipped: every planned PR already points to the exact local head OID",
          error: null,
          includeTags: false,
          tagPush: null,
        }
      : (() => {
        const currentPolicy = resolvePublicationDeliveryPolicy({
          baseRef: scanResult.baseRef,
          candidateRef: "HEAD",
          gate: "pre-push",
          lineage: deliveryPolicy.authority?.lineage,
          runner: reviewDeliveryRunner,
        });
        assertReviewedDeliveryTopology(currentPolicy, deliveryCommitCount);
        if (deliveryAuthorityId(currentPolicy) !== deliveryAuthorityId(deliveryPolicy)) {
          throw new Error("Reviewed delivery authority drifted before push.");
        }
        return runSelfMode(["--push", ...(shouldPushTags ? ["--tags", "true"] : [])]);
      })();

  if (!dryRun && !pushResult.success) {
    throw new Error(`Push failed before PR creation: ${pushResult.error || pushResult.output}`);
  }

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
  const prDescription = finalScan.isIntegrationPR
    ? prBodyOverride || buildPrDescription(finalScan, { version: versionAfter, title: defaultTitle })
    : plannedDescription;

  const prResults = [];
  if (!dryRun) {
    try {
      const prePrPolicy = resolvePublicationDeliveryPolicy({
        baseRef: scanResult.baseRef,
        candidateRef: "HEAD",
        gate: "pre-pr",
        lineage: deliveryPolicy.authority?.lineage,
        runner: reviewDeliveryRunner,
      });
      assertReviewedDeliveryTopology(prePrPolicy, deliveryCommitCount);
      if (deliveryAuthorityId(prePrPolicy) !== deliveryAuthorityId(deliveryPolicy)) {
        throw new Error("Reviewed delivery authority drifted before PR creation.");
      }
    } catch (error) {
      const recovery = {
        schema: "flow-recovery-state/v1",
        phase: "pre-pr",
        branch: scanResult.currentBranch,
        pushed: true,
        prCreated: false,
        planId,
      };
      throw new Error(`${error.message} Branch was pushed, but no PR was created. FLOW_RECOVERY_STATE=${JSON.stringify(recovery)}`);
    }
    if (ordinaryPlans.length > 0) {
      assertOrdinaryPrPlansCurrent(repository, ordinaryPlans, finalScan, candidateCommit, titleForTarget, plannedDescription, availableLabels);
    }
  }
  for (const targetBranch of finalScan.targetBranches) {
    if (
      isProductionBranch(targetBranch) &&
      !(
        isIntegrationBranch(finalScan.currentBranch) ||
        finalScan.branchType === "hotfix"
      )
    ) {
      throw new Error(
        `Automatic production PR creation is not allowed from '${finalScan.currentBranch}' to '${targetBranch}'.`,
      );
    }

    const title = buildPrTitle(finalScan, targetBranch, versionAfter, {
      titleOverride,
    });
    const plannedPr = ordinaryPlans.find((plan) => plan.target === targetBranch);
    let prResult;
    if (dryRun) {
      prResult = {
        success: true,
        prUrl: plannedPr?.prUrl || null,
        target: targetBranch,
        alreadyExists: Boolean(plannedPr?.remote),
        action: plannedPr?.action || "create",
        remote: plannedPr?.remote || null,
        output: `DRY RUN: PR ${plannedPr?.action || "create"} skipped`,
        error: null,
      };
    } else {
      try {
        assertOrdinaryPrPlansCurrent(repository, ordinaryPlans, finalScan, candidateCommit, titleForTarget, plannedDescription, availableLabels);
        if (plannedPr.action === "noop") {
          prResult = { success: true, prUrl: plannedPr.prUrl, target: targetBranch, alreadyExists: true, action: "noop", output: "Existing PR already matches", error: null };
        } else if (plannedPr.action === "update") {
          prResult = updateOrdinaryPr(repository, plannedPr);
        } else {
          prResult = { ...createPrViaGh(targetBranch, title, prDescription, finalScan.currentBranch, { repository, labels: plannedPr.labels }), action: "create" };
        }
        if (prResult.success) {
          const observed = verifyOrdinaryPr(repository, plannedPr, finalScan, candidateCommit);
          prResult.prUrl = observed.url;
        }
      } catch (error) {
        const recovery = { schema: "flow-recovery-state/v1", phase: "pr-publication", branch: finalScan.currentBranch, pushed: pushResult.success, completedTargets: prResults.map((pr) => pr.target), failedTarget: targetBranch, planId, nextSafeAction: "Inspect the failed PR operation, then rerun an unchanged fresh plan." };
        throw new Error(`${error.message} FLOW_RECOVERY_STATE=${JSON.stringify(recovery)}`);
      }
    }

    prResults.push({
      target: targetBranch,
      title,
      ...prResult,
      labels: plannedPr?.labels || [],
    });
    if (!dryRun) {
      try {
        assertRequiredPrResultsSucceeded([prResults.at(-1)]);
      } catch (error) {
        const recovery = {
          schema: "flow-recovery-state/v1",
          phase: "pr-publication",
          branch: finalScan.currentBranch,
          pushed: pushResult.success,
          completedTargets: prResults.slice(0, -1).map((pr) => pr.target),
          failedTarget: targetBranch,
          planId,
          nextSafeAction: "Inspect the failed PR operation, then rerun an unchanged fresh plan.",
        };
        throw new Error(`${error.message} FLOW_RECOVERY_STATE=${JSON.stringify(recovery)}`);
      }
    }
  }

  const result = {
    success: true,
    mode: "auto",
    dryRun,
    planId,
    deliveryPolicy,
    fetch,
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
    changeSummary: {
      commitCount: finalScan.totalCommits,
      changedFiles: finalScan.changedFiles,
      changedFileCount: finalScan.changedFiles.length,
      fileStats: finalScan.fileStats,
      breakingChanges: {
        present: finalScan.hasBreakingChanges,
        commits: finalScan.breakingCommits,
      },
      deployment: finalScan.deployment,
      impactArea: finalScan.impactArea,
      comparison: {
        range: finalScan.comparisonRange,
        baseBranch: finalScan.baseBranch,
        baseRef: finalScan.baseRef,
        mergeBase: finalScan.mergeBase,
        strategy: finalScan.mergeBaseStrategy,
      },
    },
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
      changelog: Array.isArray(versionFile.changelog) ? versionFile.changelog : [],
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
  const expectedCommit = flags["expected-commit"] || gitValue(["rev-parse", "HEAD^{commit}"], "tag target commit");
  const existingTag = gitSafe(["rev-parse", "--verify", `refs/tags/${tagName}^{commit}`]);
  if (existingTag.ok) {
    if (existingTag.stdout.trim() !== expectedCommit) {
      throw new Error(`Tag '${tagName}' already exists at a different commit.`);
    }
    process.stdout.write(JSON.stringify({ success: true, version, tag: tagName,
      existing: true, expectedCommit }, null, 2) + "\n");
    return;
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
  const addResult = gitSafe(["add", "--", ...fileList]);
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
  const commitResult = gitSafe(["commit", "-m", commitMsg]);
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
    abortReason = `Branch '${currentBranch}' has no recognized prefix. Configured task prefixes: ${DELIVERY_CONFIG.branchPolicy.taskPrefixes.join(", ")}`;
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

  const logResult = gitSafe(["log", comparisonRange, "--format=%H|%h|%s"]);
  if (!logResult.ok) throw new Error(`Could not analyze commits for '${comparisonRange}': ${logResult.output}`);
  const rawCommits = logResult.stdout.split("\n").filter(Boolean);

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

  const statResult = gitSafe(["diff", "--stat", comparisonRange, "--"]);
  if (!statResult.ok) throw new Error(`Could not analyze diff stats for '${comparisonRange}': ${statResult.output}`);
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

  const filesResult = gitSafe(["diff", "--name-only", comparisonRange, "--"]);
  if (!filesResult.ok) throw new Error(`Could not analyze changed files for '${comparisonRange}': ${filesResult.output}`);
  const changedFiles = filesResult.stdout.split("\n").filter(Boolean);
  const numstatResult = gitSafe(["diff", "--numstat", comparisonRange, "--"]);
  if (!numstatResult.ok) throw new Error(`Could not analyze line accounting for '${comparisonRange}': ${numstatResult.output}`);
  const lineAccounting = summarizeLineAccounting(
    parseNumstat(numstatResult.stdout, DELIVERY_CONFIG.chain.generatedPathPatterns),
  );
  const chainForecast = buildChainForecast(lineAccounting, DELIVERY_CONFIG);

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

  const breakingResult = gitSafe(["log", comparisonRange, "--grep=BREAKING CHANGE", "--format=%h|%s"]);
  if (!breakingResult.ok) throw new Error(`Could not analyze breaking changes for '${comparisonRange}': ${breakingResult.output}`);
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
    remoteUrl,
    platform,
    commitUrlPattern,
    commits,
    totalCommits,
    commitHashesSummary,
    changedFiles,
    lineAccounting,
    chainForecast,
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
        /package\.json.*version|src\/version\.json|version\.json|node -p.*version|jq.*version/i.test(content);
      const hasTagJob =
        /\btag\b/i.test(content) && jobs.some((j) => /tag/i.test(j));
      result.cicd.push({
        file: fullPath,
        platform: "GitHub Actions",
        jobs,
        patterns: { hasBuildArgs, hasVersionCalc, hasTagJob },
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

export { finalizeChainTracker, preparePromotion, publishPromotion };

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
const flags = parseArgs();
try {
  if (flags["delivery-config-json"]) {
    let explicit;
    try { explicit = JSON.parse(flags["delivery-config-json"]); }
    catch (error) { throw new Error(`Invalid --delivery-config-json: ${error.message}`); }
    DELIVERY_CONFIG = loadDeliveryConfig({ explicit });
  }
  if (flags["promotion-review"]) {
    promotionReview(flags);
  } else if (flags["promotion-context"]) {
    const context = buildPromotionContext({ refresh: hasTruthyFlag(flags.refresh) });
    process.stdout.write(JSON.stringify({ success: !context.noOp, ...context }, null, 2) + "\n");
    if (context.noOp) process.exitCode = 1;
  } else if (flags["prepare-promotion"]) {
    preparePromotion(flags);
  } else if (flags["publish-promotion"]) {
    publishPromotion(flags);
  } else if (flags["finalize-chain-tracker"]) {
    finalizeChainTracker(flags);
  } else if (flags["auto"]) {
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
        "  node flow-pr.mjs --promotion-context [--refresh]\n" +
        "  node flow-pr.mjs --promotion-review --state-file <external-path> [--lenses <csv>] [--lens-results-file <json>] [--execute-action --expected-coordinator-fingerprint <sha256> --execution-key <sha256>]\n" +
        "  node flow-pr.mjs --prepare-promotion --state-file <external-path> --coordinator-state-file <external-path> --expected-promotion-plan-id <sha256> [--refresh]\n" +
        "  node flow-pr.mjs --publish-promotion --state-file <external-path> --coordinator-state-file <external-path> --expected-promotion-plan-id <sha256>\n" +
        "  node flow-pr.mjs --finalize-chain-tracker --chain-plan <path> --chain-state-file <external-path> --expected-chain-plan-id <sha256>\n" +
        "  node flow-pr.mjs --auto [--dry-run] [--expected-plan-id <id>] [--chain-plan <path> --expected-chain-plan-id <sha256>] [--delivery-config-json <json>]\n" +
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
}
