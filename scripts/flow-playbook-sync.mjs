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

// ─── --find-playbook ──────────────────────────────────────────────────────────

/**
 * Locate the playbook directory using multiple strategies:
 * 1. FLOW_PLAYBOOK_PATH env variable
 * 2. --playbook-path flag
 * 3. Walk upward from cwd looking for Tools/flow-skills/playbook/
 * 4. Hardcoded relative fallback ../../Tools/flow-skills/playbook/
 */
function findPlaybook(flags) {
  // Strategy 1 — env variable
  if (process.env.FLOW_PLAYBOOK_PATH) {
    const resolved = path.resolve(process.env.FLOW_PLAYBOOK_PATH);
    if (fs.existsSync(resolved)) {
      output({ found: true, path: resolved, method: "env-FLOW_PLAYBOOK_PATH" });
      return;
    }
  }

  // Strategy 2 — explicit flag
  const flagPath = flags["playbook-path"] !== true ? flags["playbook-path"] : null;
  if (flagPath) {
    const resolved = path.resolve(process.cwd(), flagPath);
    if (fs.existsSync(resolved)) {
      output({ found: true, path: resolved, method: "flag-playbook-path" });
      return;
    }
    output({ found: false, path: null, method: "flag-playbook-path-not-found" });
    return;
  }

  // Strategy 3 — walk upward looking for Tools/flow-skills/playbook/
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, "Tools", "flow-skills", "playbook");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      output({ found: true, path: candidate, method: "walk-upward" });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Strategy 4 — hardcoded relative fallback
  const fallback = path.resolve(process.cwd(), "..", "..", "Tools", "flow-skills", "playbook");
  if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
    output({ found: true, path: fallback, method: "hardcoded-relative" });
    return;
  }

  output({ found: false, path: null, method: "not-found" });
}

// ─── --check-status ───────────────────────────────────────────────────────────

/**
 * Check whether .flow-skills/playbook-status.md exists in the project.
 */
function checkStatus() {
  const full = path.join(process.cwd(), STATUS_FILE);
  const exists = fs.existsSync(full);
  output({
    exists,
    path: exists ? full : null,
    relativePath: STATUS_FILE,
  });
}

// ─── --diff ───────────────────────────────────────────────────────────────────

/**
 * Get recent changes from git for sync analysis.
 * Returns the diff method, a summary, and affected files.
 */
function diff() {
  const isGit = fs.existsSync(path.join(process.cwd(), ".git"));

  if (!isGit) {
    output({
      method: "no-git",
      summary: "",
      files: [],
      hasDiff: false,
    });
    return;
  }

  // Try staged files first
  const staged = runSafe("git diff --name-only --cached");
  if (staged.ok && staged.output.trim()) {
    const files = staged.output.trim().split("\n").filter(Boolean);
    const diffOut = runSafe("git diff --cached --stat");
    output({
      method: "git-staged",
      summary: diffOut.ok ? diffOut.output : "",
      files,
      hasDiff: true,
    });
    return;
  }

  // Try last commit
  const lastLog = runSafe("git log -1 --oneline");
  const lastFiles = runSafe("git diff --name-only HEAD~1..HEAD");
  if (lastFiles.ok && lastFiles.output.trim()) {
    const files = lastFiles.output.trim().split("\n").filter(Boolean);
    const diffStat = runSafe("git diff --stat HEAD~1..HEAD");
    output({
      method: "git-last-commit",
      summary: (lastLog.ok ? lastLog.output + "\n" : "") + (diffStat.ok ? diffStat.output : ""),
      files,
      hasDiff: true,
    });
    return;
  }

  // Fallback: unstaged working tree changes
  const unstaged = runSafe("git diff --name-only");
  if (unstaged.ok && unstaged.output.trim()) {
    const files = unstaged.output.trim().split("\n").filter(Boolean);
    output({
      method: "git-unstaged",
      summary: "",
      files,
      hasDiff: true,
    });
    return;
  }

  output({
    method: "git-no-changes",
    summary: "",
    files: [],
    hasDiff: false,
  });
}

// ─── --analyze ────────────────────────────────────────────────────────────────

/**
 * Analyze the project structure and dependencies for init-mode inference.
 */
function analyze() {
  const cwd = process.cwd();

  // package.json
  const pkg = readJsonFile("package.json");
  const hasPkg = pkg !== null;
  const allDeps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };
  const deps = Object.keys(allDeps);

  // Key files
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

  // Top-level structure
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
          !["node_modules", ".git", "dist", "build", ".next", ".turbo", "coverage"].includes(d),
      );
  } catch {
    /* ignore */
  }

  // Key dep groups (for inference)
  const depGroups = {
    nestjs: deps.some((d) => d.startsWith("@nestjs/")),
    prisma: deps.includes("prisma") || deps.includes("@prisma/client"),
    bullmq: deps.includes("bullmq"),
    nestjsThrottler: deps.includes("@nestjs/throttler"),
    nestjsSwagger: deps.includes("@nestjs/swagger"),
    opentelemetry: deps.some((d) => d.startsWith("@opentelemetry/")),
    tanstackQuery:
      deps.includes("@tanstack/react-query") ||
      deps.includes("react-query"),
    zustand: deps.includes("zustand"),
    reactHookForm:
      deps.includes("react-hook-form") || deps.includes("@hookform/resolvers"),
    zod: deps.includes("zod"),
    react: deps.includes("react"),
    nextjs: deps.includes("next"),
    playwright: deps.includes("@playwright/test") || deps.includes("playwright"),
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

  output({
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
  });
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
      "The bulk of the sync logic is executed by the AI agent following SKILL.md.",
      "This script provides the data-gathering primitives the agent needs.",
    ].join("\n") + "\n",
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["help"] || flags["h"]) {
  printHelp();
  process.exit(0);
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
