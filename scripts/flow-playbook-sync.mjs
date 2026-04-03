#!/usr/bin/env node
/**
 * flow-playbook-sync.mjs — Playbook status sync script
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --find-playbook      Locate the playbook directory → JSON
 *   --check-status       Check if .flow-skills/playbook-status.md exists → JSON
 *   --diff               Get recent git changes for sync analysis → JSON
 *   --analyze            Analyze project structure and deps → JSON
 *
 * Flags (for agent use):
 *   --init               Initialize playbook-status.md (fails if already exists)
 *   --reset              Regenerate playbook-status.md from scratch
 *   --dry-run            Print what would change without writing anything
 *   --playbook-path <p>  Override playbook directory path
 */

import { runSafe, parseArgs, exists, readJsonFile } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILE = path.join(".flow-skills", "playbook-status.md");

const PLAYBOOK_FILES = [
  "api-contract.md",
  "backend-stack.md",
  "backend-patterns.md",
  "error-catalog.md",
  "frontend-stack.md",
  "frontend-patterns.md",
  "infra-stack.md",
  "testing-strategy.md",
];

function hasTruthyFlag(value) {
  if (value === true) return true;
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseStatusFile(content) {
  const lines = content.split("\n");
  const sections = {
    implemented: [],
    pending: [],
    excluded: [],
  };

  let currentSection = null;
  let playbookPath = null;
  let generatedAt = null;
  let lastSync = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("> Playbook:")) {
      playbookPath = line.replace(/^> Playbook:\s*/, "").trim();
      continue;
    }

    if (line.startsWith("> Generado:")) {
      generatedAt = line.replace(/^> Generado:\s*/, "").trim();
      continue;
    }

    if (line.startsWith("> Última sync:")) {
      lastSync = line.replace(/^> Última sync:\s*/, "").trim();
      continue;
    }

    if (/^##\s+Implemented/i.test(line)) {
      currentSection = "implemented";
      continue;
    }

    if (/^##\s+Pending/i.test(line)) {
      currentSection = "pending";
      continue;
    }

    if (/^##\s+Excluded/i.test(line)) {
      currentSection = "excluded";
      continue;
    }

    if (line.startsWith("-") && currentSection) {
      sections[currentSection].push(line.replace(/^-\s*/, ""));
    }
  }

  return {
    playbookPath,
    generatedAt,
    lastSync,
    ...sections,
  };
}

function resolvePlaybook(flags) {
  if (process.env.FLOW_PLAYBOOK_PATH) {
    const resolved = path.resolve(process.env.FLOW_PLAYBOOK_PATH);
    if (fs.existsSync(resolved)) {
      return { found: true, path: resolved, method: "env-FLOW_PLAYBOOK_PATH" };
    }
  }

  const flagPath =
    flags["playbook-path"] !== true ? flags["playbook-path"] : null;
  if (flagPath) {
    const resolved = path.resolve(process.cwd(), flagPath);
    if (fs.existsSync(resolved)) {
      return { found: true, path: resolved, method: "flag-playbook-path" };
    }
    return { found: false, path: null, method: "flag-playbook-path-not-found" };
  }

  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, "Tools", "flow-skills", "playbook");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return { found: true, path: candidate, method: "walk-upward" };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const fallback = path.resolve(
    process.cwd(),
    "..",
    "..",
    "Tools",
    "flow-skills",
    "playbook",
  );
  if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
    return { found: true, path: fallback, method: "hardcoded-relative" };
  }

  return { found: false, path: null, method: "not-found" };
}

function getStatusInfo() {
  const full = path.join(process.cwd(), STATUS_FILE);
  const fileExists = fs.existsSync(full);

  return {
    exists: fileExists,
    path: fileExists ? full : null,
    relativePath: STATUS_FILE,
    parsed: fileExists ? parseStatusFile(fs.readFileSync(full, "utf8")) : null,
  };
}

function getDiffInfo() {
  const isGit = fs.existsSync(path.join(process.cwd(), ".git"));

  if (!isGit) {
    return {
      method: "no-git",
      summary: "",
      files: [],
      hasDiff: false,
    };
  }

  const staged = runSafe("git diff --name-only --cached");
  if (staged.ok && staged.output.trim()) {
    const files = staged.output.trim().split("\n").filter(Boolean);
    const diffOut = runSafe("git diff --cached --stat");
    return {
      method: "git-staged",
      summary: diffOut.ok ? diffOut.output : "",
      files,
      hasDiff: true,
    };
  }

  const lastLog = runSafe("git log -1 --oneline");
  const lastFiles = runSafe("git diff --name-only HEAD~1..HEAD");
  if (lastFiles.ok && lastFiles.output.trim()) {
    const files = lastFiles.output.trim().split("\n").filter(Boolean);
    const diffStat = runSafe("git diff --stat HEAD~1..HEAD");
    return {
      method: "git-last-commit",
      summary:
        (lastLog.ok ? lastLog.output + "\n" : "") +
        (diffStat.ok ? diffStat.output : ""),
      files,
      hasDiff: true,
    };
  }

  const unstaged = runSafe("git diff --name-only");
  if (unstaged.ok && unstaged.output.trim()) {
    const files = unstaged.output.trim().split("\n").filter(Boolean);
    return {
      method: "git-unstaged",
      summary: "",
      files,
      hasDiff: true,
    };
  }

  return {
    method: "git-no-changes",
    summary: "",
    files: [],
    hasDiff: false,
  };
}

function getAnalysisInfo() {
  const cwd = process.cwd();
  const pkg = readJsonFile("package.json");
  const hasPkg = pkg !== null;
  const allDeps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };
  const deps = Object.keys(allDeps);

  const hasSchema = fs.existsSync(path.join(cwd, "prisma", "schema.prisma"));
  const hasMigrations = fs.existsSync(path.join(cwd, "prisma", "migrations"));
  const hasDockerCompose =
    fs.existsSync(path.join(cwd, "docker-compose.yml")) ||
    fs.existsSync(path.join(cwd, "docker-compose.yaml")) ||
    fs.existsSync(path.join(cwd, "compose.yml"));
  const hasCI =
    fs.existsSync(path.join(cwd, ".github", "workflows")) ||
    fs.existsSync(path.join(cwd, ".gitlab-ci.yml")) ||
    fs.existsSync(path.join(cwd, ".circleci"));
  const hasTurbo = fs.existsSync(path.join(cwd, "turbo.json"));
  const hasNxConfig = fs.existsSync(path.join(cwd, "nx.json"));
  const hasPnpmWorkspace = fs.existsSync(path.join(cwd, "pnpm-workspace.yaml"));

  let structure = [];
  try {
    structure = fs
      .readdirSync(cwd)
      .filter((entry) => {
        try {
          return fs.statSync(path.join(cwd, entry)).isDirectory();
        } catch {
          return false;
        }
      })
      .filter(
        (d) =>
          ![
            "node_modules",
            ".git",
            "dist",
            "build",
            ".next",
            ".turbo",
            "coverage",
          ].includes(d),
      );
  } catch {
    /* ignore */
  }

  const depGroups = {
    nestjs: deps.some((d) => d.startsWith("@nestjs/")),
    prisma: deps.includes("prisma") || deps.includes("@prisma/client"),
    bullmq: deps.includes("bullmq"),
    nestjsThrottler: deps.includes("@nestjs/throttler"),
    nestjsSwagger: deps.includes("@nestjs/swagger"),
    opentelemetry: deps.some((d) => d.startsWith("@opentelemetry/")),
    tanstackQuery:
      deps.includes("@tanstack/react-query") || deps.includes("react-query"),
    zustand: deps.includes("zustand"),
    reactHookForm:
      deps.includes("react-hook-form") || deps.includes("@hookform/resolvers"),
    zod: deps.includes("zod"),
    react: deps.includes("react"),
    nextjs: deps.includes("next"),
    playwright:
      deps.includes("@playwright/test") || deps.includes("playwright"),
    vitest: deps.includes("vitest"),
    jest: deps.includes("jest"),
    keycloak:
      deps.includes("keycloak-connect") ||
      deps.includes("@keycloak/keycloak-admin-client"),
    ioredis: deps.includes("ioredis") || deps.includes("redis"),
    jwt:
      deps.includes("jsonwebtoken") ||
      deps.includes("@nestjs/jwt") ||
      deps.includes("passport-jwt"),
  };

  return {
    hasPkg,
    deps,
    depGroups,
    hasSchema,
    hasMigrations,
    hasDockerCompose,
    hasCI,
    hasTurbo,
    hasNxConfig,
    hasPnpmWorkspace,
    structure,
    projectName: path.basename(cwd),
  };
}

function auto(flags) {
  const requestedMode = flags["reset"]
    ? "reset"
    : flags["init"]
      ? "init"
      : "sync";
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  const status = getStatusInfo();

  if (requestedMode === "sync" && !status.exists) {
    output({
      success: true,
      mode: "auto",
      requestedMode,
      dryRun,
      noop: true,
      silent: true,
      reason: "status-file-missing",
      status,
    });
    return;
  }

  const playbook = resolvePlaybook(flags);
  if (!playbook.found) {
    output({
      success: false,
      mode: "auto",
      requestedMode,
      dryRun,
      noop: false,
      reason: "playbook-not-found",
      playbook,
      status,
    });
    process.exit(1);
  }

  if (requestedMode === "init" && status.exists) {
    output({
      success: false,
      mode: "auto",
      requestedMode,
      dryRun,
      noop: false,
      reason: "status-file-already-exists",
      message:
        "playbook-status.md already exists. Use --reset to regenerate it.",
      playbook,
      status,
    });
    process.exit(1);
  }

  const result = {
    success: true,
    mode: "auto",
    requestedMode,
    dryRun,
    playbook,
    status,
    nextAction: null,
  };

  if (requestedMode === "sync") {
    result.diff = getDiffInfo();
    result.playbookFiles = PLAYBOOK_FILES.map((file) =>
      path.join(playbook.path, file),
    );
    result.nextAction = result.diff.hasDiff
      ? "llm-analyze-diff"
      : "user-describe-or-noop";
  } else {
    result.analysis = getAnalysisInfo();
    result.playbookFiles = PLAYBOOK_FILES.map((file) =>
      path.join(playbook.path, file),
    );
    result.nextAction = dryRun
      ? "preview-init-draft"
      : "llm-generate-status-draft";
  }

  output(result);
}

// ─── --find-playbook ──────────────────────────────────────────────────────────

/**
 * Locate the playbook directory using multiple strategies:
 * 1. FLOW_PLAYBOOK_PATH env variable
 * 2. --playbook-path flag
 * 3. Walk upward from cwd looking for Tools/flow-skills/playbook/
 * 4. Hardcoded relative fallback ../../Tools/flow-skills/playbook/
 */
function findPlaybook(flags) {
  output(resolvePlaybook(flags));
}

// ─── --check-status ───────────────────────────────────────────────────────────

/**
 * Check whether .flow-skills/playbook-status.md exists in the project.
 */
function checkStatus() {
  output(getStatusInfo());
}

// ─── --diff ───────────────────────────────────────────────────────────────────

/**
 * Get recent changes from git for sync analysis.
 * Returns the diff method, a summary, and affected files.
 */
function diff() {
  output(getDiffInfo());
}

// ─── --analyze ────────────────────────────────────────────────────────────────

/**
 * Analyze the project structure and dependencies for init-mode inference.
 */
function analyze() {
  output(getAnalysisInfo());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function output(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function printHelp() {
  process.stderr.write(
    [
      "flow-playbook-sync.mjs — Playbook status sync script",
      "",
      "Usage:",
      "  node flow-playbook-sync.mjs --auto [--init|--reset] [--dry-run] [--playbook-path <path>]",
      "  node flow-playbook-sync.mjs --find-playbook [--playbook-path <path>]",
      "  node flow-playbook-sync.mjs --check-status",
      "  node flow-playbook-sync.mjs --diff",
      "  node flow-playbook-sync.mjs --analyze",
      "",
      "Flags (for agent invocation):",
      "  --init             Initialize playbook-status.md (fails if already exists)",
      "  --reset            Regenerate playbook-status.md from scratch",
      "  --dry-run          Show what would change without writing anything",
      "  --playbook-path    Override playbook directory path",
      "",
      "Environment:",
      "  FLOW_PLAYBOOK_PATH  Override playbook directory (takes precedence over all)",
      "",
      "Use --auto as the primary entrypoint.",
      "Lower-level commands are for fallback/debug only.",
    ].join("\n") + "\n",
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["help"] || flags["h"]) {
  printHelp();
  process.exit(0);
} else if (flags["auto"]) {
  auto(flags);
} else if (flags["find-playbook"]) {
  findPlaybook(flags);
} else if (flags["check-status"]) {
  checkStatus();
} else if (flags["diff"]) {
  diff();
} else if (flags["analyze"]) {
  analyze();
} else {
  printHelp();
  process.exit(1);
}
