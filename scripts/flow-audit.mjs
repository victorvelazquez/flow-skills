#!/usr/bin/env node
/**
 * flow-audit.mjs — Stack-agnostic code quality audit script
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --detect                              Auto-detect project toolchain → JSON
 *   --scope [path]                        Determine audit scope from git → JSON
 *   --run lint|typecheck|test [--scope p] Run a specific tool → JSON
 *   --report                              Aggregate results from stdin → JSON
 */

import { execSync, spawnSync, spawn } from "child_process";
import { run, runSafe, parseArgs, exists, readJsonFile } from "./lib/helpers.mjs";
import { detectTooling } from "./lib/detect-tooling.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";

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

// ─── --detect ─────────────────────────────────────────────────────────────────

function detect() {
  const cwd = process.cwd();
  const pkg = readJsonFile("package.json");
  const scripts = (pkg && pkg.scripts) || {};
  const deps = {
    ...(pkg && pkg.dependencies),
    ...(pkg && pkg.devDependencies),
  };

  // Delegate name detection to shared module
  const tooling = detectTooling(cwd);

  // ── Derive commands from detected names ────────────────────────────────────
  // Test runner commands
  let testCommand = null;
  switch (tooling.testRunner) {
    case "vitest":   testCommand = scripts["test"] || "npx vitest run"; break;
    case "jest":     testCommand = scripts["test"] || "npx jest --passWithNoTests"; break;
    case "mocha":    testCommand = scripts["test"] || "npx mocha"; break;
    case "jasmine":  testCommand = scripts["test"] || "npx jasmine"; break;
    case "ava":      testCommand = scripts["test"] || "npx ava"; break;
    case "cargo-test": testCommand = "cargo test"; break;
    case "go-test":  testCommand = "go test ./..."; break;
    case "pytest":   testCommand = "pytest"; break;
    case "rspec":    testCommand = "bundle exec rspec"; break;
    case "npm-test": testCommand = "npm test"; break;
  }

  // Linter commands
  let lintCommand = null;
  switch (tooling.linter) {
    case "eslint":        lintCommand = scripts["lint"] || "npx eslint ."; break;
    case "biome":         lintCommand = scripts["lint"] || "npx biome lint ."; break;
    case "oxlint":        lintCommand = scripts["lint"] || "npx oxlint ."; break;
    case "rubocop":       lintCommand = "bundle exec rubocop"; break;
    case "golangci-lint": lintCommand = "golangci-lint run"; break;
    case "clippy":        lintCommand = "cargo clippy -- -D warnings"; break;
    case "ruff":          lintCommand = "ruff check ."; break;
    case "flake8":        lintCommand = "flake8 ."; break;
    case "npm-lint":      lintCommand = "npm run lint"; break;
  }

  // Type checker detection (not in detectTooling — kept inline as it's audit-specific)
  let typeChecker = null;
  let typeCommand = null;

  if (
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
  switch (tooling.formatter) {
    case "prettier":
      formatCommand =
        scripts["format:check"] ||
        scripts["lint:format"] ||
        scripts["check:format"] ||
        "npx prettier --check .";
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
  }

  // Coverage commands
  let coverageCommand = null;
  switch (tooling.coverage) {
    case "vitest-coverage":
      coverageCommand =
        scripts["test:coverage"] ||
        scripts["coverage"] ||
        scripts["test:cov"] ||
        "npx vitest run --coverage";
      break;
    case "jest-coverage":
      coverageCommand =
        scripts["test:coverage"] ||
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
      case "cargo-audit":   securityCommand = "cargo audit"; break;
      case "pip-audit":     securityCommand = "pip-audit"; break;
      case "govulncheck":   securityCommand = "govulncheck ./..."; break;
      case "bundler-audit": securityCommand = "bundle exec bundler-audit check"; break;
      default:
        if (tooling.security === "npm-audit") {
          securityCommand = scripts["audit"] || scripts["security"];
        }
    }
  }

  const result = {
    testRunner: tooling.testRunner ? { name: tooling.testRunner, command: testCommand } : null,
    linter: tooling.linter ? { name: tooling.linter, command: lintCommand } : null,
    typeChecker: typeChecker
      ? { name: typeChecker, command: typeCommand }
      : null,
    formatter: tooling.formatter ? { name: tooling.formatter, command: formatCommand } : null,
    coverage: tooling.coverage ? { name: tooling.coverage, command: coverageCommand } : null,
    security: tooling.security ? { name: tooling.security, command: securityCommand } : null,
    packageManager: tooling.packageManager,
    framework: tooling.framework,
    monorepo:
      exists("pnpm-workspace.yaml") ||
      exists("turbo.json") ||
      exists("nx.json") ||
      exists("lerna.json"),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --scope ──────────────────────────────────────────────────────────────────

function scope(flags) {
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

  // Detect toolchain first
  let toolchain = null;
  try {
    const detectOut = run(`node "${import.meta.filename}" --detect`);
    toolchain = JSON.parse(detectOut);
  } catch (err) {
    process.stderr.write(`detect failed: ${err.message}\n`);
    process.exit(1);
  }

  let command = null;
  let toolName = tool;

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
    stdout = run(command);
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
      status = "failed"; // tool ran and found issues
      // For lint/typecheck, output usually comes through stderr channel
      // Keep both streams intact so the LLM can read either
      const rawOutput = (err.stderr || err.message || "").trim();
      stdout = rawOutput.includes("\n") ? rawOutput : "";
      stderr = stdout ? "" : rawOutput;
    }
  }

  const duration = Date.now() - start;

  const result = {
    tool: toolName,
    command,
    exitCode,
    stdout,
    stderr,
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
  // ERROR = at least one tool could not execute (different from "found issues")
  const overallStatus =
    failed.length > 0 || errored.length > 0
      ? "FAIL"
      : skipped.length === results.length
        ? "SKIP"
        : "PASS";

  const result = {
    passed,
    failed,
    errored,
    skipped,
    overallStatus,
    summary: summaryParts.join(" | ") || "No results",
    details: results,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  // Auto-update .ai-flow/work/status.json if it exists in the project
  const statusJsonPath = path.join(
    process.cwd(),
    ".ai-flow",
    "work",
    "status.json",
  );
  if (fs.existsSync(statusJsonPath)) {
    try {
      const statusJson = JSON.parse(fs.readFileSync(statusJsonPath, "utf8"));
      if (!statusJson.validation) statusJson.validation = {};
      statusJson.validation.lastCheck = new Date().toISOString();
      statusJson.validation.overallStatus = result.overallStatus;
      if (!statusJson.finalChecklist) statusJson.finalChecklist = {};
      statusJson.finalChecklist.qualityCheckPassed =
        result.overallStatus === "PASS";
      fs.writeFileSync(
        statusJsonPath,
        JSON.stringify(statusJson, null, 2) + "\n",
        "utf8",
      );
      process.stderr.write(
        `status.json updated: validation.overallStatus=${result.overallStatus}\n`,
      );
    } catch (err) {
      process.stderr.write(
        `Warning: could not update status.json: ${err.message}\n`,
      );
    }
  }
}

// ─── --run-all ────────────────────────────────────────────────────────────────

/**
 * Runs lint, typecheck, test (+ format and coverage if detected) in true
 * parallel using child_process.spawn + Promise.all. This avoids the 3× detect
 * overhead of individual --run calls and removes the parallelism dependency on
 * the LLM agent issuing calls simultaneously.
 *
 * Returns the aggregated --report JSON directly.
 */
async function runAll(flags) {
  // Detect toolchain once
  let toolchain = null;
  try {
    const detectOut = run(`node "${import.meta.filename}" --detect`);
    toolchain = JSON.parse(detectOut);
  } catch (err) {
    process.stderr.write(`detect failed: ${err.message}\n`);
    process.exit(1);
  }

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
          duration: 0,
          status: "skipped",
        });
        return;
      }

      const start = Date.now();
      // Use shell: true for cross-platform command resolution (npx, etc.)
      const child = spawn(toolDef.command, [], {
        shell: true,
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      child.on("error", (err) => {
        const isExecutionFailure =
          err.code === "ENOENT" || err.code === "EACCES";
        resolve({
          tool: toolDef.name,
          command: toolDef.command,
          exitCode: 1,
          stdout: "",
          stderr: `Execution failed: ${err.message}`,
          duration: Date.now() - start,
          status: isExecutionFailure ? "error" : "failed",
        });
      });

      child.on("close", (code) => {
        const exitCode = code ?? 1;
        const rawOutput = (stderr || stdout).trim();
        const resolvedStdout = rawOutput.includes("\n")
          ? rawOutput
          : stdout.trim();
        const resolvedStderr = resolvedStdout ? "" : rawOutput;
        resolve({
          tool: toolDef.name,
          command: toolDef.command,
          exitCode,
          stdout: resolvedStdout,
          stderr: resolvedStderr,
          duration: Date.now() - start,
          status: exitCode === 0 ? "passed" : "failed",
        });
      });
    });

  // Run all in parallel
  const results = await Promise.all(tools.map(runToolAsync));

  // Aggregate (reuse report logic inline)
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

  const overallStatus =
    failed.length > 0 || errored.length > 0
      ? "FAIL"
      : skipped.length === results.length
        ? "SKIP"
        : "PASS";

  const report = {
    passed,
    failed,
    errored,
    skipped,
    overallStatus,
    summary: summaryParts.join(" | ") || "No results",
    details: results,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

// ─── --fix ────────────────────────────────────────────────────────────────────

/**
 * Runs auto-fixable repair commands (lint:fix, format), then re-verifies.
 * With --auto-only: only runs mechanical fixers (no LLM-required fixes).
 * Without --auto-only: also emits a structured repair plan for LLM-assisted fixes.
 *
 * Repair tiers:
 *   Tier 1 (auto): eslint --fix, prettier --write, cargo fmt, gofmt -w
 *   Tier 2 (LLM plan): emits fixable issues JSON for agent consumption
 */
async function fix(flags) {
  const autoOnly = flags["auto-only"] === true;

  // Detect toolchain
  let toolchain = null;
  try {
    const detectOut = run(`node "${import.meta.filename}" --detect`);
    toolchain = JSON.parse(detectOut);
  } catch (err) {
    process.stderr.write(`detect failed: ${err.message}\n`);
    process.exit(1);
  }

  const pkg = readJsonFile("package.json");
  const scripts = (pkg && pkg.scripts) || {};

  const fixResults = [];

  // ── Tier 1: Lint auto-fix ──────────────────────────────────────────────────
  const lintFixCommand =
    scripts["lint:fix"] ||
    scripts["fix:lint"] ||
    (toolchain.linter?.name === "eslint" ? "npx eslint . --fix" : null) ||
    (toolchain.linter?.name === "biome" ? "npx biome lint --apply ." : null) ||
    (toolchain.linter?.name === "clippy"
      ? "cargo clippy --fix --allow-dirty"
      : null) ||
    (toolchain.linter?.name === "ruff" ? "ruff check . --fix" : null);

  if (lintFixCommand) {
    process.stderr.write(`Running lint fix: ${lintFixCommand}\n`);
    const r = runSafe(lintFixCommand);
    fixResults.push({
      step: "lint:fix",
      command: lintFixCommand,
      ok: r.ok,
      output: r.output,
    });
    process.stderr.write(
      r.ok
        ? `  ✅ lint:fix passed\n`
        : `  ⚠️  lint:fix exited with issues (some may need manual fix)\n`,
    );
  }

  // ── Tier 1: Format auto-fix ────────────────────────────────────────────────
  const formatFixCommand =
    scripts["format"] ||
    scripts["fmt"] ||
    scripts["fix:format"] ||
    (toolchain.formatter?.name === "prettier"
      ? "npx prettier --write ."
      : null) ||
    (toolchain.formatter?.name === "biome-format"
      ? "npx biome format --write ."
      : null) ||
    (toolchain.formatter?.name === "rustfmt" ? "cargo fmt" : null) ||
    (toolchain.formatter?.name === "gofmt" ? "gofmt -w ." : null);

  if (formatFixCommand) {
    process.stderr.write(`Running format fix: ${formatFixCommand}\n`);
    const r = runSafe(formatFixCommand);
    fixResults.push({
      step: "format",
      command: formatFixCommand,
      ok: r.ok,
      output: r.output,
    });
    process.stderr.write(
      r.ok ? `  ✅ format passed\n` : `  ⚠️  format exited with issues\n`,
    );
  }

  // ── Verify: re-run lint and format check after fixes ──────────────────────
  const verifyResults = [];
  const verifyTools = [
    { key: "lint", command: toolchain.linter?.command },
    { key: "format", command: toolchain.formatter?.command },
  ].filter((t) => t.command);

  for (const t of verifyTools) {
    process.stderr.write(`Verifying ${t.key}: ${t.command}\n`);
    const r = runSafe(t.command);
    verifyResults.push({ tool: t.key, ok: r.ok, output: r.output });
    process.stderr.write(
      r.ok ? `  ✅ ${t.key} passed\n` : `  ❌ ${t.key} still failing\n`,
    );
  }

  const stillFailing = verifyResults.filter((r) => !r.ok).map((r) => r.tool);

  const summary = {
    fixed: fixResults.filter((r) => r.ok).map((r) => r.step),
    partiallyFixed: fixResults.filter((r) => !r.ok).map((r) => r.step),
    stillFailing,
    verifyResults,
    fixResults,
    autoOnly,
  };

  if (!autoOnly) {
    // Emit a repair plan stub for LLM-assisted fixes (human-readable guidance)
    summary.repairPlanNote =
      "For issues that cannot be auto-fixed (logic bugs, security, race conditions, missing tests), " +
      "review the [REVIEW] section of the audit report and apply fixes manually. " +
      "Re-run `node flow-audit.mjs --run-all` after each fix to verify.";
  }

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["detect"]) {
  detect();
} else if ("scope" in flags) {
  scope(flags);
} else if ("run-all" in flags) {
  await runAll(flags);
} else if ("run" in flags) {
  runTool(flags);
} else if (flags["report"]) {
  report();
} else if (flags["fix"]) {
  await fix(flags);
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-audit.mjs --detect\n" +
      "  node flow-audit.mjs --scope [path] [--since <ref>]\n" +
      "  node flow-audit.mjs --run lint|typecheck|test|format|coverage|security\n" +
      "  node flow-audit.mjs --run-all\n" +
      "  node flow-audit.mjs --report --file <results.json>\n" +
      "  node flow-audit.mjs --fix [--auto-only]\n",
  );
  process.exit(1);
}
