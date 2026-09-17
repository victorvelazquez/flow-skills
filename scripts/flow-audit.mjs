#!/usr/bin/env node
/**
 * flow-audit.mjs — Stack-agnostic code quality audit script
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto [--scope p] [--since ref] [--dry-run]
 *                                           Gather audit context in one entrypoint → JSON
 *   --detect                              Auto-detect project toolchain → JSON
 *   --scope [path]                        Determine audit scope from git → JSON
 *   --run lint|typecheck|test [--scope p] Run a specific tool → JSON
 *   --run-all                             Run all tools in parallel → aggregated JSON
 *   --report                              Aggregate supplied audit evidence → JSON
 */

import { spawnSync, spawn } from "child_process";
import {
  run,
  runSafe,
  parseArgs,
  exists,
  readJsonFile,
} from "./lib/helpers.mjs";
import { detectTooling } from "./lib/detect-tooling.mjs";
import {
  candidateChanged,
  getCandidateFingerprint,
  readPassCache,
  writePassCache,
} from "./lib/flow-audit-cache.mjs";
import { compactAutomatedResults } from "./lib/flow-audit-output.mjs";
import { terminateProcessTree } from "./lib/process-control.mjs";
import { buildDotnetFormatExecution } from "./lib/dotnet-format.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";
import { createHash } from "node:crypto";

const CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const SUPPORTED_RUN_CHECKS = new Set([
  "lint",
  "typecheck",
  "type-check",
  "test",
  "format",
  "fmt",
  "coverage",
  "cov",
  "security",
  "audit",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function existsGlob(pattern) {
  try {
    const files = fs.readdirSync(process.cwd());
    return files.some((f) => {
      if (pattern.startsWith("*.")) return f.endsWith(pattern.slice(1));
      return f === pattern || f.startsWith(pattern.replace("*", ""));
    });
  } catch {
    return false;
  }
}

function hasTruthyFlag(value) {
  if (value === true) return true;
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

/**
 * Extract the first N meaningful lines from a raw tool output string.
 * Strips empty lines and ANSI escape codes. Used to populate `keyLines`
 * in the result JSON so the LLM doesn't need to parse thousands of raw lines.
 *
 * @param {string} output — raw stdout or stderr
 * @param {number} [max=20] — max lines to return
 * @returns {string[]}
 */
function extractKeyLines(output, max = 20) {
  if (!output) return [];
  // Strip ANSI escape codes
  const clean = output.replace(/\x1B\[[0-9;]*[mGKHF]/g, "");
  return clean
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Aggregate an array of tool result objects into the standard report shape.
 * Shared by runAll() and report() — single source of truth.
 *
 * @param {Array<{tool: string, status: string, duration?: number, stdout?: string, stderr?: string}>} results
 * @param {number} [startTime] — epoch ms when the run started (for totalDuration)
 * @returns {{ passed, failed, errored, skipped, overallStatus, summary, totalDuration, ranAt, details }}
 */
function aggregateResults(results, startTime) {
  const passed = results
    .filter((r) => r.status === "passed")
    .map((r) => r.tool);
  const failed = results
    .filter((r) => r.status === "failed")
    .map((r) => r.tool);
  const errored = results
    .filter((r) => r.status === "error")
    .map((r) => r.tool);
  const skipped = results
    .filter((r) => r.status === "skipped")
    .map((r) => r.tool);

  const summaryParts = [];
  if (passed.length) summaryParts.push(`passed: ${passed.join(", ")}`);
  if (failed.length) summaryParts.push(`FAILED: ${failed.join(", ")}`);
  if (errored.length)
    summaryParts.push(`ERROR (could not run): ${errored.join(", ")}`);
  if (skipped.length) summaryParts.push(`skipped: ${skipped.join(", ")}`);

  // SKIP only when ALL tools were skipped (none configured at all)
  const overallStatus =
    failed.length > 0 || errored.length > 0
      ? "FAIL"
      : skipped.length === results.length
        ? "SKIP"
        : "PASS";

  const totalDuration = startTime != null ? Date.now() - startTime : null;

  // Enrich each detail entry with keyLines (first 20 meaningful lines)
  const details = results.map((r) => ({
    ...r,
    keyLines: extractKeyLines(
      (r.stdout || "") + (r.stderr ? "\n" + r.stderr : ""),
    ),
  }));

  return {
    passed,
    failed,
    errored,
    skipped,
    overallStatus,
    summary: summaryParts.join(" | ") || "No results",
    totalDuration,
    ranAt: new Date().toISOString(),
    details,
  };
}

// ─── buildToolchain ───────────────────────────────────────────────────────────

/**
 * Build the toolchain config object directly (no subprocess).
 * Previously each of runTool(), runAll(), fix() would spawn a child process
 * to call --detect, adding ~100-300ms overhead per call.
 *
 * This function is the single source of truth for command resolution.
 * detect() now calls this and emits the result to stdout.
 */
function buildToolchain(candidate = null) {
  const cwd = process.cwd();
  const pkg = readJsonFile("package.json");
  const scripts = (pkg && pkg.scripts) || {};
  const deps = {
    ...(pkg && pkg.dependencies),
    ...(pkg && pkg.devDependencies),
  };

  const tooling = detectTooling(cwd);
  const dotnetTarget = tooling.dotnet?.target || null;

  const isMonorepoRoot =
    exists("pnpm-workspace.yaml") ||
    exists("turbo.json") ||
    exists("nx.json") ||
    exists("lerna.json");

  const pm = tooling.packageManager;
  const monoRun = (scriptName) => {
    if (pm === "pnpm") return `pnpm -r --if-present ${scriptName}`;
    if (pm === "yarn") return `yarn workspaces run ${scriptName}`;
    if (pm === "bun") return `bun run --filter '*' ${scriptName}`;
    return `npm run ${scriptName} --workspaces --if-present`;
  };

  const pmExec = (cmd) => {
    if (pm === "pnpm") return `pnpm exec ${cmd}`;
    if (pm === "yarn") return `yarn exec ${cmd}`;
    if (pm === "bun") return `bun x ${cmd}`;
    return `npx ${cmd}`;
  };

  // Test runner commands
  let testCommand = null;
  switch (tooling.testRunner) {
    case "vitest":
      testCommand = isMonorepoRoot
        ? monoRun("test")
        : scripts["test"] || "npx vitest run";
      break;
    case "jest":
      testCommand = isMonorepoRoot
        ? monoRun("test")
        : scripts["test"] || "npx jest --passWithNoTests";
      break;
    case "mocha":
      testCommand = isMonorepoRoot
        ? monoRun("test")
        : scripts["test"] || "npx mocha";
      break;
    case "jasmine":
      testCommand = isMonorepoRoot
        ? monoRun("test")
        : scripts["test"] || "npx jasmine";
      break;
    case "ava":
      testCommand = isMonorepoRoot
        ? monoRun("test")
        : scripts["test"] || "npx ava";
      break;
    case "cargo-test":
      testCommand = "cargo test";
      break;
    case "go-test":
      testCommand = "go test ./...";
      break;
    case "pytest":
      testCommand = "pytest";
      break;
    case "rspec":
      testCommand = "bundle exec rspec";
      break;
    case "npm-test":
      testCommand = isMonorepoRoot
        ? monoRun("test")
        : scripts["test"] || "npm test";
      break;
    case "dotnet-test":
      testCommand = dotnetTarget ? `dotnet test ${dotnetTarget}` : null;
      break;
  }

  // Linter commands
  let lintCommand = null;
  switch (tooling.linter) {
    case "eslint":
      lintCommand = isMonorepoRoot
        ? monoRun("lint")
        : scripts["lint"] || "npx eslint .";
      break;
    case "biome":
      lintCommand = isMonorepoRoot
        ? monoRun("lint")
        : scripts["lint"] || "npx biome lint .";
      break;
    case "oxlint":
      lintCommand = isMonorepoRoot
        ? monoRun("lint")
        : scripts["lint"] || "npx oxlint .";
      break;
    case "rubocop":
      lintCommand = "bundle exec rubocop";
      break;
    case "golangci-lint":
      lintCommand = "golangci-lint run";
      break;
    case "clippy":
      lintCommand = "cargo clippy -- -D warnings";
      break;
    case "ruff":
      lintCommand = "ruff check .";
      break;
    case "flake8":
      lintCommand = "flake8 .";
      break;
    case "npm-lint":
      lintCommand = isMonorepoRoot ? monoRun("lint") : "npm run lint";
      break;
  }

  // Type checker commands
  let typeChecker = null;
  let typeCommand = null;

  if (dotnetTarget) {
    typeChecker = "dotnet-build";
    typeCommand = `dotnet build ${dotnetTarget}`;
  } else if (isMonorepoRoot) {
    typeChecker = "tsc";
    typeCommand =
      scripts["typecheck"] || scripts["type-check"] || monoRun("typecheck");
  } else if (
    exists("tsconfig.json") &&
    (deps["typescript"] || existsGlob("*.ts") || existsGlob("*.tsx"))
  ) {
    typeChecker = "tsc";
    typeCommand =
      scripts["type-check"] || scripts["typecheck"] || "npx tsc --noEmit";
  } else if (deps["flow-bin"]) {
    typeChecker = "flow";
    typeCommand = "npx flow check";
  } else if (exists("mypy.ini") || exists(".mypy.ini")) {
    typeChecker = "mypy";
    typeCommand = "mypy .";
  } else if (exists("pyrightconfig.json") || deps["pyright"]) {
    typeChecker = "pyright";
    typeCommand = "pyright";
  } else if (exists("Cargo.toml")) {
    typeChecker = "cargo-check";
    typeCommand = "cargo check";
  } else if (exists("go.mod")) {
    typeChecker = "go-build";
    typeCommand = "go build ./...";
  }

  // Formatter commands
  let formatCommand = null;
  let formatFile = null;
  let formatArgs = null;
  switch (tooling.formatter) {
    case "prettier":
      formatCommand =
        scripts["format:check"] ||
        scripts["lint:format"] ||
        scripts["check:format"] ||
        (isMonorepoRoot
          ? `${pmExec('prettier --check "**/*.{ts,tsx,js,json,md}" --ignore-path .gitignore')}`
          : `${pmExec("prettier --check .")}`);
      break;
    case "biome-format":
      formatCommand = scripts["format:check"] || "npx biome format .";
      break;
    case "rustfmt":
      formatCommand = "cargo fmt -- --check";
      break;
    case "gofmt":
      formatCommand = "gofmt -l .";
      break;
    case "npm-format":
      formatCommand = scripts["format:check"] || scripts["check:format"];
      break;
    case "dotnet-format": {
      const execution = buildDotnetFormatExecution(
        dotnetTarget,
        candidate?.publication ? candidate.publication.changedPaths : null,
      );
      formatFile = execution?.file || null;
      formatArgs = execution?.args || null;
      formatCommand = execution?.command || null;
      break;
    }
  }

  // Coverage commands
  let coverageCommand = null;
  switch (tooling.coverage) {
    case "vitest-coverage":
      coverageCommand = isMonorepoRoot
        ? monoRun("test:cov")
        : scripts["test:coverage"] ||
          scripts["coverage"] ||
          scripts["test:cov"] ||
          "npx vitest run --coverage";
      break;
    case "jest-coverage":
      coverageCommand = isMonorepoRoot
        ? monoRun("test:cov")
        : scripts["test:coverage"] ||
          scripts["coverage"] ||
          "npx jest --coverage --passWithNoTests";
      break;
    case "go-coverage":
      coverageCommand = "go test -cover ./...";
      break;
    case "pytest-coverage":
      coverageCommand = "pytest --cov";
      break;
    case "npm-coverage":
      coverageCommand = scripts["test:coverage"] || scripts["coverage"];
      break;
  }

  // Security commands
  let securityCommand = null;
  if (tooling.security === "npm-audit") {
    if (tooling.packageManager === "yarn") {
      securityCommand = scripts["audit"] || "yarn audit --level moderate";
    } else if (tooling.packageManager === "pnpm") {
      securityCommand = scripts["audit"] || "pnpm audit --audit-level moderate";
    } else {
      securityCommand = scripts["audit"] || "npm audit --audit-level=moderate";
    }
  } else {
    switch (tooling.security) {
      case "cargo-audit":
        securityCommand = "cargo audit";
        break;
      case "pip-audit":
        securityCommand = "pip-audit";
        break;
      case "govulncheck":
        securityCommand = "govulncheck ./...";
        break;
      case "bundler-audit":
        securityCommand = "bundle exec bundler-audit check";
        break;
      case "dotnet-vulnerable":
        securityCommand = dotnetTarget
          ? `dotnet list ${dotnetTarget} package --vulnerable --include-transitive`
          : null;
        break;
      default:
        if (tooling.security === "npm-audit") {
          securityCommand = scripts["audit"] || scripts["security"];
        }
    }
  }

  return {
    testRunner: tooling.testRunner
      ? { name: tooling.testRunner, command: testCommand }
      : null,
    linter: tooling.linter
      ? { name: tooling.linter, command: lintCommand }
      : null,
    typeChecker: typeChecker
      ? { name: typeChecker, command: typeCommand }
      : null,
    formatter: tooling.formatter
      ? {
          name: tooling.formatter,
          command: formatCommand,
          file: formatFile,
          args: formatArgs,
        }
      : null,
    coverage: tooling.coverage
      ? { name: tooling.coverage, command: coverageCommand }
      : null,
    security: tooling.security
      ? { name: tooling.security, command: securityCommand }
      : null,
    packageManager: tooling.packageManager,
    framework: tooling.framework,
    dotnet: tooling.dotnet || null,
    monorepo:
      exists("pnpm-workspace.yaml") ||
      exists("turbo.json") ||
      exists("nx.json") ||
      exists("lerna.json"),
  };
}

// ─── --detect ─────────────────────────────────────────────────────────────────

function detect() {
  const result = buildToolchain();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --scope ──────────────────────────────────────────────────────────────────

function getScopeInfo(flags) {
  const scopePath = flags["scope"] !== true ? flags["scope"] : null;
  const sinceRef = flags["since"] !== true ? flags["since"] : null;

  let files = [];
  let detectionMethod = "unknown";
  let scopeTruncated = false;

  if (scopePath) {
    // Use provided path — list files recursively
    detectionMethod = "explicit-path";
    try {
      const fullPath = path.resolve(process.cwd(), scopePath);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const r = listFilesRecursive(fullPath, process.cwd());
          files = r.files;
          scopeTruncated = r.truncated;
        } else {
          files = [path.relative(process.cwd(), fullPath).replace(/\\/g, "/")];
        }
      }
    } catch (err) {
      process.stderr.write(`scope path error: ${err.message}\n`);
    }
  } else {
    // Detect from git
    const isGit = fs.existsSync(path.join(process.cwd(), ".git"));
    if (isGit) {
      // --diff-filter=ACMRT: Added, Copied, Modified, Renamed, Type-changed
      // Excludes Deleted (D) files so the LLM doesn't try to read removed files
      const diffFilter = "--diff-filter=ACMRT";

      // If --since <ref> was provided, compare against that ref directly
      if (sinceRef) {
        const sinceDiff = runSafe(
          `git diff --name-only ${diffFilter} ${sinceRef}...HEAD`,
        );
        if (sinceDiff.ok && sinceDiff.output) {
          files = sinceDiff.output.split("\n").filter(Boolean);
          detectionMethod = `git-since-${sinceRef}`;
        }
      }

      // Try staged files first
      if (files.length === 0) {
        const staged = runSafe(`git diff --name-only ${diffFilter} --cached`);
        if (staged.ok && staged.output) {
          files = staged.output.split("\n").filter(Boolean);
          detectionMethod = "git-staged";
        }
      }

      // If nothing staged, try last commit diff
      if (files.length === 0) {
        const lastDiff = runSafe(
          `git diff --name-only ${diffFilter} HEAD~1 HEAD`,
        );
        if (lastDiff.ok && lastDiff.output) {
          files = lastDiff.output.split("\n").filter(Boolean);
          detectionMethod = "git-diff-head";
        }
      }

      // If still nothing (first commit or other), use unstaged working-tree changes
      if (files.length === 0) {
        const unstaged = runSafe(`git diff --name-only ${diffFilter}`);
        if (unstaged.ok && unstaged.output) {
          files = unstaged.output.split("\n").filter(Boolean);
          detectionMethod = "git-unstaged";
        }
      }
    }

    // Fallback: scan src/ or common dirs
    if (files.length === 0) {
      detectionMethod = "directory-scan";
      const scanDirs = [
        "src",
        "lib",
        "app",
        "pages",
        "routes",
        "cmd",
        "pkg",
        "internal",
      ];
      for (const dir of scanDirs) {
        if (exists(dir)) {
          const r = listFilesRecursive(
            path.join(process.cwd(), dir),
            process.cwd(),
          );
          files = [...files, ...r.files];
          if (r.truncated) scopeTruncated = true;
          if (files.length > 0) break;
        }
      }
    }
  }

  // Normalize paths
  files = files
    .map((f) => f.replace(/\\/g, "/"))
    .filter(
      (f) =>
        f &&
        !f.includes("node_modules") &&
        !f.includes("dist/") &&
        !f.includes("build/") &&
        !f.includes(".git/") &&
        !f.includes("__pycache__") &&
        !f.includes("vendor/") &&
        !f.includes("target/"),
    );

  // Detect test files in scope
  const hasTests = files.some(
    (f) =>
      /\.(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs|rb)$/.test(f) ||
      /_(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs|rb)$/.test(f) ||
      f.includes("/__tests__/") ||
      f.includes("/test/") ||
      f.includes("/tests/") ||
      f.includes("/spec/"),
  );

  // Extract modules (first meaningful path segment)
  const modules = [
    ...new Set(
      files
        .map((f) => {
          const parts = f.split("/").filter(Boolean);
          const rootDirs = ["src", "app", "lib", "cmd", "pkg", "internal"];
          for (let i = 0; i < parts.length - 1; i++) {
            if (rootDirs.includes(parts[i]) && parts[i + 1])
              return parts[i + 1];
          }
          return parts[0] || "root";
        })
        .filter((m) => m && m !== "root" && !m.startsWith(".")),
    ),
  ];

  const result = {
    files,
    modules,
    hasTests,
    detectionMethod,
    truncated: scopeTruncated,
  };
  if (scopeTruncated) {
    process.stderr.write(
      `WARNING: scope truncated at 500 files. Use --scope <path> to narrow the review, or --since <ref> to compare against a specific branch.\n`,
    );
  }
  // Monorepo warning: if running from root of a monorepo, recommend scoping to a package
  const isMonorepo =
    fs.existsSync(path.join(process.cwd(), "pnpm-workspace.yaml")) ||
    fs.existsSync(path.join(process.cwd(), "turbo.json")) ||
    fs.existsSync(path.join(process.cwd(), "nx.json")) ||
    fs.existsSync(path.join(process.cwd(), "lerna.json"));
  if (isMonorepo && detectionMethod === "directory-scan") {
    process.stderr.write(
      `WARNING: monorepo detected. Running scope from root will include all packages. ` +
        `Consider using --scope packages/<app-name> or --since <base-branch> to limit the review.\n`,
    );
    result.monorepoWarning = true;
  }
  return result;
}

function scope(flags) {
  const result = getScopeInfo(flags);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

function listFilesRecursive(dir, base, maxFiles = 500) {
  const results = [];
  let truncated = false;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        truncated = true;
        break;
      }
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (
          [
            "node_modules",
            ".git",
            "dist",
            "build",
            "__pycache__",
            "target",
            "vendor",
            ".next",
            ".nuxt",
          ].includes(entry.name)
        )
          continue;
        const sub = listFilesRecursive(full, base, maxFiles - results.length);
        results.push(...sub.files);
        if (sub.truncated) {
          truncated = true;
          break;
        }
      } else {
        results.push(rel);
      }
    }
  } catch {
    /* ignore permission errors */
  }
  return { files: results, truncated };
}

// ─── --run ────────────────────────────────────────────────────────────────────

function runTool(flags) {
  const tool = flags["run"] !== true ? flags["run"] : null;
  if (!tool) {
    process.stderr.write(
      "Error: --run requires a tool name: lint | typecheck | test\n",
    );
    process.exit(1);
  }

  if (!SUPPORTED_RUN_CHECKS.has(tool)) {
    process.stderr.write(
      `Error: unsupported read-only audit check '${tool}'.\n`,
    );
    process.exitCode = 1;
    return;
  }

  // Build toolchain directly — no subprocess overhead
  const toolchain = buildToolchain();

  let command = null;
  let toolName = tool;
  let execution = null;

  if (tool === "lint") {
    command = toolchain.linter?.command || null;
    toolName = toolchain.linter?.name || "lint";
  } else if (tool === "typecheck" || tool === "type-check") {
    command = toolchain.typeChecker?.command || null;
    toolName = toolchain.typeChecker?.name || "typecheck";
  } else if (tool === "test") {
    command = toolchain.testRunner?.command || null;
    toolName = toolchain.testRunner?.name || "test";
  } else if (tool === "format" || tool === "fmt") {
    command = toolchain.formatter?.command || null;
    toolName = toolchain.formatter?.name || "format";
    execution = toolchain.formatter?.file
      ? { file: toolchain.formatter.file, args: toolchain.formatter.args || [] }
      : null;
  } else if (tool === "coverage" || tool === "cov") {
    command = toolchain.coverage?.command || null;
    toolName = toolchain.coverage?.name || "coverage";
  } else if (tool === "security" || tool === "audit") {
    command = toolchain.security?.command || null;
    toolName = toolchain.security?.name || "security";
  } else {
    // Allow arbitrary command passthrough
    command = tool;
    toolName = tool;
  }

  if (!command) {
    const result = {
      tool: toolName,
      command: null,
      exitCode: null,
      stdout: "",
      stderr: `Tool '${tool}' not detected or not configured in this project.`,
      keyLines: [],
      duration: 0,
      status: "skipped",
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const start = Date.now();
  let exitCode = 0;
  let stdout = "";
  let stderr = "";
  let status = "passed";

  try {
    if (execution) {
      const result = spawnSync(execution.file, execution.args, {
        cwd: process.cwd(),
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.error) throw result.error;
      stdout = String(result.stdout || "").trim();
      stderr = String(result.stderr || "").trim();
      exitCode = result.status ?? 1;
      if (exitCode !== 0) {
        const error = new Error(
          stderr || stdout || `${execution.file} exited ${exitCode}`,
        );
        error.status = exitCode;
        error.stdout = stdout;
        error.stderr = stderr;
        throw error;
      }
    } else {
      stdout = run(command);
    }
  } catch (err) {
    // Use actual exit code from execSync error (err.status), fallback to 1
    exitCode = typeof err.status === "number" ? err.status : 1;

    // Distinguish execution failure (tool not found / permission error)
    // from tool ran and found issues (exit code > 0 with output)
    const isExecutionFailure =
      err.code === "ENOENT" ||
      err.code === "EACCES" ||
      (err.message || "").toLowerCase().includes("command not found") ||
      (err.message || "").toLowerCase().includes("is not recognized");

    if (isExecutionFailure) {
      status = "error"; // tool could not be executed at all
      stderr = `Execution failed: ${err.message}`;
      stdout = "";
    } else {
      // Also check stderr/message for "binary not found" patterns that execSync
      // surfaces as a non-zero exit WITHOUT setting err.code = ENOENT on Windows.
      // Covers: CMD English ("is not recognized"), CMD Spanish ("no se reconoce"),
      // sh/bash ("command not found"), PowerShell ("is not recognized as the name").
      const rawStderr = (err.stderr || "").trim();
      const rawMessage = (err.message || "").trim();
      const combinedRaw = (rawStderr + " " + rawMessage).toLowerCase();
      const isWindowsNotFound =
        combinedRaw.includes("is not recognized") ||
        combinedRaw.includes("no se reconoce") ||
        combinedRaw.includes("command not found") ||
        combinedRaw.includes("no such file");
      if (isWindowsNotFound) {
        status = "error";
        stderr = `Execution failed: ${rawStderr || rawMessage}`;
        stdout = "";
      } else {
        status = "failed"; // tool ran and found issues
        // Preserve stdout and stderr independently — no swapping heuristics
        stdout = (err.stdout || "").trim();
        stderr = rawStderr || rawMessage;
      }
    }
  }

  const duration = Date.now() - start;
  const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");

  const result = {
    tool: toolName,
    command,
    exitCode,
    stdout,
    stderr,
    keyLines: extractKeyLines(combinedOutput),
    duration,
    status,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --report ─────────────────────────────────────────────────────────────────

function report() {
  // Read results from stdin or a temp file passed as --file
  let raw = "";
  try {
    // Check for --file flag
    const flags = parseArgs();
    const file = flags["file"] !== true ? flags["file"] : null;
    if (file) {
      raw = fs.readFileSync(file, "utf8");
    } else {
      // Try reading a temp results file from default location
      const tmpFile = path.join(os.tmpdir(), "flow-audit-results.json");
      if (fs.existsSync(tmpFile)) {
        raw = fs.readFileSync(tmpFile, "utf8");
      }
    }
  } catch (err) {
    process.stderr.write(`report read error: ${err.message}\n`);
  }

  if (!raw.trim()) {
    process.stderr.write(
      "Error: no results to aggregate. Pass --file <path> or ensure stdin has data.\n",
    );
    process.exit(1);
  }

  // Results can be an array or newline-delimited JSON objects
  let results = [];
  try {
    const parsed = JSON.parse(raw);
    results = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Try newline-delimited JSON
    const lines = raw.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        results.push(JSON.parse(line));
      } catch {
        /* skip bad lines */
      }
    }
  }

  const aggregated = aggregateResults(results);

  process.stdout.write(
    JSON.stringify(
      {
        schema: "flow-audit-advisory-evidence/v1",
        mode: "report",
        evidence: aggregated,
        recommendations: [
          "Review the aggregated evidence before choosing any separate workflow.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}

// ─── --run-all ────────────────────────────────────────────────────────────────

/**
 * Runs lint, typecheck, test (+ format, coverage, security if detected) in true
 * parallel using child_process.spawn + Promise.all.
 *
 * Previously called `--detect` via subprocess three times (once per caller).
 * Now uses buildToolchain() directly — no subprocess overhead.
 *
 * Returns the aggregated report JSON including totalDuration, ranAt, and
 * keyLines per tool result.
 */
async function executeRunAll(_flags, candidate = null) {
  const startTime = Date.now();

  // Build toolchain directly — no subprocess overhead
  const toolchain = buildToolchain(candidate);

  // Build list of tools to run
  const tools = [
    {
      key: "lint",
      command: toolchain.linter?.command || null,
      name: toolchain.linter?.name || "lint",
    },
    {
      key: "typecheck",
      command: toolchain.typeChecker?.command || null,
      name: toolchain.typeChecker?.name || "typecheck",
    },
    {
      key: "test",
      command: toolchain.testRunner?.command || null,
      name: toolchain.testRunner?.name || "test",
    },
    {
      key: "format",
      command: toolchain.formatter?.command || null,
      name: toolchain.formatter?.name || "format",
      file: toolchain.formatter?.file || null,
      args: toolchain.formatter?.args || [],
    },
    {
      key: "coverage",
      command: toolchain.coverage?.command || null,
      name: toolchain.coverage?.name || "coverage",
    },
    {
      key: "security",
      command: toolchain.security?.command || null,
      name: toolchain.security?.name || "security",
    },
  ];

  // Spawn a child process for each tool and collect results in parallel
  const runToolAsync = (toolDef) =>
    new Promise((resolve) => {
      if (!toolDef.command) {
        resolve({
          tool: toolDef.name,
          command: null,
          exitCode: null,
          stdout: "",
          stderr: `Tool '${toolDef.key}' not detected or not configured in this project.`,
          keyLines: [],
          duration: 0,
          status: "skipped",
        });
        return;
      }

      const start = Date.now();
      // Use shell: true for cross-platform command resolution (npx, etc.)
      const child = spawn(
        toolDef.file || toolDef.command,
        toolDef.file ? toolDef.args : [],
        {
          shell: !toolDef.file,
          detached: process.platform !== "win32",
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const timeout = setTimeout(() => {
        timedOut = true;
        void terminateProcessTree(child);
      }, CHECK_TIMEOUT_MS);
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      child.on("error", (err) => {
        const isExecutionFailure =
          err.code === "ENOENT" || err.code === "EACCES";
        const errMsg = `Execution failed: ${err.message}`;
        settle({
          tool: toolDef.name,
          command: toolDef.command,
          exitCode: 1,
          stdout: "",
          stderr: errMsg,
          keyLines: extractKeyLines(errMsg),
          duration: Date.now() - start,
          status: isExecutionFailure ? "error" : "failed",
        });
      });

      child.on("close", (code) => {
        const exitCode = code ?? 1;
        if (timedOut) {
          settle({
            tool: toolDef.name,
            command: toolDef.command,
            exitCode: 1,
            stdout,
            stderr: [
              stderr,
              `Execution timed out after ${CHECK_TIMEOUT_MS / 1000} seconds.`,
            ]
              .filter(Boolean)
              .join("\n"),
            keyLines: extractKeyLines(
              [stdout, stderr].filter(Boolean).join("\n"),
            ),
            duration: Date.now() - start,
            status: "error",
          });
          return;
        }
        const combinedOutput = [stdout.trim(), stderr.trim()]
          .filter(Boolean)
          .join("\n");

        // Detect execution failure: binary not found / not in PATH
        const isExecutionFailure =
          exitCode !== 0 &&
          (combinedOutput.toLowerCase().includes("command not found") ||
            combinedOutput.toLowerCase().includes("is not recognized") ||
            combinedOutput.toLowerCase().includes("no such file") ||
            combinedOutput.toLowerCase().includes("enoent"));

        settle({
          tool: toolDef.name,
          command: toolDef.command,
          exitCode,
          // Keep stdout and stderr as independent fields — no swapping heuristics
          stdout: isExecutionFailure ? "" : stdout.trim(),
          stderr: isExecutionFailure
            ? `Execution failed: binary not found — ${combinedOutput}`
            : stderr.trim(),
          keyLines: isExecutionFailure
            ? extractKeyLines(
                `Execution failed: binary not found — ${combinedOutput}`,
              )
            : extractKeyLines(combinedOutput),
          duration: Date.now() - start,
          status:
            exitCode === 0 ? "passed" : isExecutionFailure ? "error" : "failed",
        });
      });
    });

  const results = [];
  if (toolchain.dotnet?.hasProject) {
    for (const tool of tools) results.push(await runToolAsync(tool));
  } else {
    results.push(...(await Promise.all(tools.map(runToolAsync))));
  }

  // Aggregate using shared function
  const aggregated = aggregateResults(results, startTime);

  return aggregated;
}

async function runAll(flags) {
  const aggregated = await executeRunAll(flags);
  process.stdout.write(JSON.stringify(aggregated, null, 2) + "\n");
}

async function auto(flags) {
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  const evidence = {
    detection: buildToolchain(),
    scope: getScopeInfo(flags),
    automated: dryRun ? null : await executeRunAll(flags),
  };

  process.stdout.write(
    JSON.stringify(
      {
        schema: "flow-audit-advisory-evidence/v1",
        mode: "auto",
        evidence,
        recommendations: dryRun
          ? ["Run the audit without --dry-run to collect automated evidence."]
          : [
              "Review the collected evidence before choosing any separate workflow.",
            ],
      },
      null,
      2,
    ) + "\n",
  );
}

function fingerprintChecksCandidate(baseRef, candidateRef) {
  const provisional = getCandidateFingerprint(process.cwd(), {
    baseRef,
    candidateRef,
  });
  const toolchain = buildToolchain(provisional);
  const checks = [
    "linter",
    "typeChecker",
    "testRunner",
    "formatter",
    "coverage",
    "security",
  ].map((key) => {
    const tool = toolchain[key];
    return [
      key,
      tool
        ? {
            name: tool.name || null,
            command: tool.command || null,
            file: tool.file || null,
            args: tool.args || null,
          }
        : null,
    ];
  });
  const toolConfigDigest = createHash("sha256")
    .update(JSON.stringify(checks))
    .digest("hex");
  return getCandidateFingerprint(process.cwd(), {
    baseRef,
    candidateRef,
    toolConfigDigest,
  });
}

async function checksOnly(flags) {
  const baseRef = flags["base-ref"] !== true ? flags["base-ref"] : null;
  const candidateRef =
    flags["candidate-ref"] !== true ? flags["candidate-ref"] : null;
  let candidate;
  try {
    candidate = fingerprintChecksCandidate(baseRef, candidateRef);
  } catch (err) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: "flow-audit-advisory-evidence/v1",
          mode: "checks-only",
          evidence: {
            source: "unavailable",
            error: `Could not fingerprint the audit scope: ${err.message}`,
          },
          recommendations: ["Resolve the scope error and rerun the audit."],
        },
        null,
        2,
      ) + "\n",
    );
    process.exitCode = 1;
    return;
  }

  const cacheEnabled = !hasTruthyFlag(flags["no-pass-cache"]);
  const cached = cacheEnabled ? readPassCache(candidate) : null;
  if (cached) {
    process.stdout.write(
      JSON.stringify(
        {
          schema: "flow-audit-advisory-evidence/v1",
          mode: "checks-only",
          evidence: {
            source: "local-cache",
            candidate,
            cache: {
              enabled: true,
              used: true,
              authoritative: false,
              written: false,
              timestamp: cached.timestamp,
            },
            automated: {
              overallStatus: "PASS",
              summary: "local advisory evidence cache hit",
              details: cached.checks.map((check) => ({
                tool: check.tool,
                command: check.command,
                status: check.status,
                exitCode: check.exitCode,
                stdoutHash: check.stdoutHash,
                stderrHash: check.stderrHash,
                keyLines: [],
              })),
            },
          },
          recommendations: [
            "Rerun checks when current evidence is needed; the cache is advisory only.",
          ],
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const automated = await executeRunAll(flags, candidate);
  let finalCandidate = null;
  try {
    finalCandidate = fingerprintChecksCandidate(baseRef, candidateRef);
  } catch {
    finalCandidate = null;
  }
  const changedDuringChecks = candidateChanged(candidate, finalCandidate);
  const passed = automated.overallStatus === "PASS" && !changedDuringChecks;
  const writtenCache =
    passed && cacheEnabled ? writePassCache(finalCandidate, automated) : null;
  const recommendations = changedDuringChecks
    ? [
        "The audit scope changed while checks ran; rerun the audit for current evidence.",
      ]
    : automated.overallStatus === "SKIP"
      ? [
          "Configure a supported check before relying on this advisory evidence.",
        ]
      : passed
        ? [
            "Review the collected evidence before choosing any separate workflow.",
          ]
        : ["Resolve reported check failures and rerun the audit."];
  process.stdout.write(
    JSON.stringify(
      {
        schema: "flow-audit-advisory-evidence/v1",
        mode: "checks-only",
        evidence: {
          source: "fresh",
          candidate: finalCandidate || candidate,
          cache: {
            enabled: cacheEnabled,
            used: false,
            authoritative: false,
            written: Boolean(writtenCache),
          },
          automated: compactAutomatedResults(automated),
        },
        recommendations,
      },
      null,
      2,
    ) + "\n",
  );
  if (!passed) process.exitCode = 1;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["fix"]) {
  process.stderr.write(
    "Error: --fix is not supported by flow-audit. Use flow-audit-fix as a separately approved workflow.\n",
  );
  process.exitCode = 1;
} else if (flags["checks-only"]) {
  await checksOnly(flags);
} else if (flags["detect"]) {
  detect();
} else if (flags["auto"]) {
  await auto(flags);
} else if ("scope" in flags) {
  scope(flags);
} else if ("run-all" in flags) {
  await runAll(flags);
} else if ("run" in flags) {
  runTool(flags);
} else if (flags["report"]) {
  report();
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-audit.mjs --auto [--scope <path>] [--since <ref>] [--dry-run]\n" +
      "  node flow-audit.mjs --checks-only [--base-ref <ref> --candidate-ref <ref>]\n" +
      "  node flow-audit.mjs --detect\n" +
      "  node flow-audit.mjs --scope [path] [--since <ref>]\n" +
      "  node flow-audit.mjs --run lint|typecheck|test|format|coverage|security\n" +
      "  node flow-audit.mjs --run-all\n" +
      "  node flow-audit.mjs --report --file <results.json>\n",
  );
  process.exit(1);
}
