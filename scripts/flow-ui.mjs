#!/usr/bin/env node
/**
 * flow-ui.mjs — UI validation gate script
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   project  — docs/ui-guide.md exists, compare against it
 *   baseline — docs/ui-guide.md absent, but frontend files in scope
 *   bootstrap — no guide, no significant frontend files
 *
 * Usage:
 *   node flow-ui.mjs --auto [--scope <path>] [--since <ref>] [--staged] [--working-tree] [--dry-run]
 *   node flow-ui.mjs --detect
 *   node flow-ui.mjs --scope [--since <ref>] [--staged] [--working-tree]
 */

import { execSync } from "child_process";
import { runSafe, parseArgs, exists, WALK_SKIP_DIRS, walkDir } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";

// ─── Frontend file signals ──────────────────────────────────────────────────

const FRONTEND_EXTS = new Set([
  ".tsx", ".jsx", ".vue", ".svelte", ".astro",
  ".css", ".scss", ".less",
  ".html", ".htm",
]);

const FRONTEND_DIRS = new Set([
  "src", "app", "pages", "components", "features",
  "layouts", "views", "screens", "routes",
]);

const FRONTEND_FRAMEWORKS = [
  "react", "vue", "svelte", "angular", "solid-js", "qwik", "preact",
  "next", "nuxt", "@remix-run/react", "astro", "ember-source", "lit",
  "@stencil/core",
];

const FRONTEND_DEPS = [
  "react", "react-dom", "@angular/core", "vue", "svelte",
  "solid-js", "@builder.io/qwik", "preact", "@astrojs",
  "tailwindcss", "@mui/material", "@mantine/core", "@chakra-ui/react",
  "antd", "shadcn-ui", "next", "nuxt", "@remix-run/react",
  "react-router-dom", "@tanstack/react-router", "ember-source", "lit",
  "@stencil/core", "@ionic/react",
];

// ─── Component filename patterns ────────────────────────────────────────────

const COMPONENT_PATTERNS = [
  /\/components?\//i,
  /\/features\/[^/]+\/components\//,
  /\/ui\//,
  /\/widgets\//,
  /\/layouts\//,
];

const SCREEN_PATTERNS = [
  /\/pages?\//i,
  /\/screens?\//i,
  /\/views?\//i,
  /\/routes?\//i,
  /\/app\//,
];

const HOOK_PATTERN = /^use[A-Z]/;
const COMPONENT_FILE_PATTERN = /\.(tsx|jsx|vue|svelte)$/i;
const STYLE_FILE_PATTERN = /\.(css|scss|less|module\.css)$/i;
const MODULE_STOPWORDS = new Set([
  "app", "application", "component", "components", "componente", "componentes",
  "de", "del", "el", "elements", "elemento", "elementos", "feature", "features",
  "form", "formulario", "formularios", "interface", "interfaz", "la", "las",
  "los", "module", "modules", "modulo", "modulos", "page", "pages", "pantalla",
  "pantallas", "route", "routes", "screen", "screens", "section", "sections",
  "seccion", "secciones", "ui", "view", "views", "vista", "vistas", "widget",
  "widgets", "window", "windows", "y",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function output(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function readJsonFile(cwd, file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, file), "utf8"));
  } catch {
    return null;
  }
}

function isFrontendFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return FRONTEND_EXTS.has(ext);
}

function classifyFile(filePath) {
  // Skip test files — they're not UI to review
  if (isTestFile(filePath)) return "test";

  const basename = path.basename(filePath, path.extname(filePath));

  if (STYLE_FILE_PATTERN.test(filePath)) return "style";

  if (COMPONENT_FILE_PATTERN.test(filePath)) {
    if (SCREEN_PATTERNS.some((p) => p.test(filePath))) return "screen";
    if (COMPONENT_PATTERNS.some((p) => p.test(filePath))) {
      if (HOOK_PATTERN.test(basename)) return "hook";
      return "component";
    }
    // Check if filename looks like a component (PascalCase)
    if (/^[A-Z]/.test(basename)) return "component";
    return "screen"; // fallback: page-like files
  }

  if (filePath.endsWith(".html") || filePath.endsWith(".htm")) return "screen";
  if (filePath.endsWith(".css") || filePath.endsWith(".scss") || filePath.endsWith(".less")) return "style";

  return "other";
}

function isTestFile(filePath) {
  const basename = path.basename(filePath);
  return (
    /\.(test|spec)\.(tsx?|jsx?|mjs)$/.test(basename) ||
    /_(test|spec)\.(tsx?|jsx?|mjs)$/.test(basename) ||
    filePath.includes("/__tests__/") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/") ||
    filePath.includes("/spec/")
  );
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeModuleQuery(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !MODULE_STOPWORDS.has(token));
}

function scoreCandidatePath(candidatePath, tokens) {
  const normalizedPath = normalizeText(candidatePath.replace(/\.[^.]+$/, ""));
  const segments = normalizedPath.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const token of tokens) {
    if (segments.includes(token)) {
      score += 5;
      continue;
    }

    if (normalizedPath.includes(token)) {
      score += 2;
    }
  }

  if (tokens.length > 0 && normalizedPath.includes(tokens.join(" "))) {
    score += 4;
  }

  return score;
}

function resolveModuleScope(cwd, query) {
  const tokens = tokenizeModuleQuery(query);
  const searchRoots = [
    "apps/frontend/src",
    "apps/frontend",
    "src",
    "app",
    "pages",
    "components",
    "features",
  ].filter((root) => exists(root));

  const directoryScores = new Map();
  const fileScores = new Map();

  for (const root of searchRoots) {
    const absoluteRoot = path.join(cwd, root);
    const files = walkDir(absoluteRoot, WALK_SKIP_DIRS)
      .map((file) => path.relative(cwd, file).replace(/\\/g, "/"))
      .filter((file) => isFrontendFile(file) && !isTestFile(file));

    for (const file of files) {
      const fileScore = scoreCandidatePath(file, tokens);
      if (fileScore > 0) {
        fileScores.set(file, Math.max(fileScores.get(file) || 0, fileScore));
      }

      const parentDir = path.dirname(file).replace(/\\/g, "/");
      const featureMatch = file.match(/^(.*?\/features\/[^/]+)/);
      const pageMatch = file.match(/^(.*?\/(pages|routes|views|screens)\/[^/]+)/);
      const candidateDirs = [parentDir];

      if (featureMatch) candidateDirs.push(featureMatch[1]);
      if (pageMatch) candidateDirs.push(pageMatch[1]);

      for (const candidateDir of candidateDirs) {
        const dirScore = scoreCandidatePath(candidateDir, tokens);
        if (dirScore > 0) {
          directoryScores.set(candidateDir, Math.max(directoryScores.get(candidateDir) || 0, dirScore));
        }
      }
    }
  }

  const rankedDirectories = [...directoryScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([candidatePath, score]) => ({ candidatePath, score }));

  const rankedFiles = [...fileScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([candidatePath, score]) => ({ candidatePath, score }));

  const bestDirectoryScore = rankedDirectories[0]?.score || 0;
  const bestFileScore = rankedFiles[0]?.score || 0;
  const useDirectories = bestDirectoryScore >= bestFileScore;
  const ranked = useDirectories ? rankedDirectories : rankedFiles;
  const threshold = ranked[0]?.score ? Math.max(ranked[0].score - 2, 1) : 0;
  const selected = ranked.filter((entry) => entry.score >= threshold).slice(0, 3);

  return {
    query,
    tokens,
    selectedPaths: selected.map((entry) => entry.candidatePath),
    candidates: ranked.slice(0, 5),
    ambiguous: selected.length > 1,
    resolutionType: useDirectories ? "directory" : "file",
  };
}

// ─── Frontend detection ─────────────────────────────────────────────────────

function detectFrontend(cwd) {
  const pkg = readJsonFile(cwd, "package.json");
  const deps = pkg
    ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    : {};

  // Check for known frontend framework dependencies
  let framework = null;
  for (const fw of FRONTEND_FRAMEWORKS) {
    if (deps[fw] || deps[`${fw}-dom`]) {
      framework = fw;
      break;
    }
  }

  // Check for UI libraries
  const uiLibs = [];
  for (const dep of FRONTEND_DEPS) {
    if (deps[dep]) uiLibs.push(dep);
  }

  // Check for frontend config files
  const configSignals = [];
  const configChecks = [
    "tailwind.config.js", "tailwind.config.ts", "tailwind.config.mjs",
    "postcss.config.js", "postcss.config.mjs",
    "vite.config.ts", "vite.config.js", "vite.config.mjs",
    "next.config.js", "next.config.ts", "next.config.mjs",
    "nuxt.config.ts", "nuxt.config.js",
    "svelte.config.js",
    "astro.config.mjs",
    "remix.config.js",
    "angular.json",
  ];
  for (const cfg of configChecks) {
    if (exists(cfg)) configSignals.push(cfg);
  }

  // Quick scan for frontend source directories
  let hasFrontendDir = false;
  const dirChecks = ["src", "app", "pages", "components"];
  for (const dir of dirChecks) {
    if (exists(dir)) {
      try {
        const entries = fs.readdirSync(path.join(cwd, dir));
        if (entries.some((e) => FRONTEND_EXTS.has(path.extname(e).toLowerCase()))) {
          hasFrontendDir = true;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  const detected = !!(framework || uiLibs.length > 0 || configSignals.length > 0 || hasFrontendDir);

  return {
    detected,
    framework: framework || "unknown",
    uiLibs,
    configFiles: configSignals,
  };
}

// ─── Mode resolution ────────────────────────────────────────────────────────

function resolveMode(cwd, frontendDetected, frontendFilesInScope = 0) {
  const uiGuidePath = "docs/ui-guide.md";
  const uiChecklistPath = "docs/ui-review-checklist.md";
  const guideExists = exists(uiGuidePath);

  if (guideExists) {
    return {
      mode: "project",
      uiGuidePath,
      uiChecklistPath: exists(uiChecklistPath) ? uiChecklistPath : null,
      reason: "ui-guide.md found — comparing components against guide",
    };
  }

  if (frontendFilesInScope > 0) {
    return {
      mode: "baseline",
      uiGuidePath: null,
      uiChecklistPath: exists(uiChecklistPath) ? uiChecklistPath : null,
      reason: "No ui-guide.md, but frontend files are in scope — run baseline UI review and consider creating a project guide",
    };
  }

  if (frontendDetected) {
    return {
      mode: "baseline",
      uiGuidePath: null,
      uiChecklistPath: exists(uiChecklistPath) ? uiChecklistPath : null,
      reason: "Frontend stack detected, but no UI files are currently in scope — baseline mode only",
    };
  }

  return {
    mode: "bootstrap",
    uiGuidePath: null,
    uiChecklistPath: null,
    reason: "No ui-guide.md and no frontend stack or UI files were detected — bootstrap the UI workflow first",
  };
}

// ─── Scope detection ────────────────────────────────────────────────────────

function getScopeInfo(cwd, flags) {
  const scopePath = flags["scope"] !== true && flags["scope"] !== undefined
    ? flags["scope"]
    : null;
  const moduleQuery = flags["module"] !== true && flags["module"] !== undefined
    ? flags["module"]
    : null;
  const sinceRef = flags["since"] !== true && flags["since"] !== undefined
    ? flags["since"]
    : null;
  const stagedOnly = flags["staged"] === true;
  const workingTreeOnly = flags["working-tree"] === true;

  let files = [];
  let detectionMethod = "unknown";
  let scopeTruncated = false;
  let moduleResolution = null;

  if (moduleQuery) {
    detectionMethod = "semantic-module";
    moduleResolution = resolveModuleScope(cwd, moduleQuery);

    for (const selectedPath of moduleResolution.selectedPaths) {
      try {
        const fullPath = path.resolve(cwd, selectedPath);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const r = listFiles(fullPath, cwd);
            files = [...files, ...r.files];
            scopeTruncated = scopeTruncated || r.truncated;
          } else {
            files.push(path.relative(cwd, fullPath).replace(/\\/g, "/"));
          }
        }
      } catch (err) {
        process.stderr.write(`module resolution error: ${err.message}\n`);
      }
    }

    files = [...new Set(files)];
  } else if (scopePath) {
    detectionMethod = "explicit-path";
    const scopePaths = String(scopePath)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const singleScopePath of scopePaths) {
      try {
        const fullPath = path.resolve(cwd, singleScopePath);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const r = listFiles(fullPath, cwd);
            files = [...files, ...r.files];
            scopeTruncated = scopeTruncated || r.truncated;
          } else {
            files.push(path.relative(cwd, fullPath).replace(/\\/g, "/"));
          }
        }
      } catch (err) {
        process.stderr.write(`scope path error: ${err.message}\n`);
      }
    }

    files = [...new Set(files)];
  } else {
    const isGit = fs.existsSync(path.join(cwd, ".git"));

    if (isGit) {
      const diffFilter = "--diff-filter=ACMRT";

      if (stagedOnly) {
        // Only staged changes
        const staged = runSafe(`git diff --name-only ${diffFilter} --cached`);
        if (staged.ok && staged.output) {
          files = staged.output.split("\n").filter(Boolean);
          detectionMethod = "git-staged";
        }
      } else if (workingTreeOnly) {
        // All working-tree changes: staged + unstaged + untracked
        const staged = runSafe(`git diff --name-only ${diffFilter} --cached`);
        const unstaged = runSafe(`git diff --name-only ${diffFilter}`);
        const untracked = runSafe(`git ls-files --others --exclude-standard`);
        const all = [
          ...(staged.ok && staged.output ? staged.output.split("\n") : []),
          ...(unstaged.ok && unstaged.output ? unstaged.output.split("\n") : []),
          ...(untracked.ok && untracked.output ? untracked.output.split("\n") : []),
        ].filter(Boolean);
        files = [...new Set(all)];
        detectionMethod = "git-working-tree";
      } else {
        // Default flow: --since takes priority, then working-tree, then HEAD~1
        if (sinceRef) {
          const sinceDiff = runSafe(
            `git diff --name-only ${diffFilter} ${sinceRef}...HEAD`,
          );
          if (sinceDiff.ok && sinceDiff.output) {
            files = sinceDiff.output.split("\n").filter(Boolean);
            detectionMethod = `git-since-${sinceRef}`;
          }
        }

        // Fallback to working tree changes
        if (files.length === 0) {
          const staged = runSafe(`git diff --name-only ${diffFilter} --cached`);
          const unstaged = runSafe(`git diff --name-only ${diffFilter}`);
          const untracked = runSafe(`git ls-files --others --exclude-standard`);

          const workingTreeFiles = [
            ...(staged.ok && staged.output ? staged.output.split("\n") : []),
            ...(unstaged.ok && unstaged.output ? unstaged.output.split("\n") : []),
            ...(untracked.ok && untracked.output ? untracked.output.split("\n") : []),
          ].filter(Boolean);

          if (workingTreeFiles.length > 0) {
            files = [...new Set(workingTreeFiles)];
            detectionMethod = "git-working-tree";
          }
        }

        // Fallback to last commit diff
        if (files.length === 0) {
          const lastDiff = runSafe(`git diff --name-only ${diffFilter} HEAD~1 HEAD`);
          if (lastDiff.ok && lastDiff.output) {
            files = lastDiff.output.split("\n").filter(Boolean);
            detectionMethod = "git-diff-head";
          }
        }
      }

      // Last resort: scan frontend directories (only in default mode, not staged/since/working-tree)
      if (files.length === 0 && !stagedOnly && !workingTreeOnly && !sinceRef) {
        detectionMethod = "directory-scan";
        const scanDirs = ["src", "app", "pages", "components", "features", "layouts"];
        for (const dir of scanDirs) {
          if (exists(dir)) {
            const r = listFiles(path.join(cwd, dir), cwd);
            files = [...files, ...r.files];
            if (r.truncated) scopeTruncated = true;
            if (files.length > 0) break;
          }
        }
      }
    }
  }

  // Normalize and filter
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
        !f.includes("target/") &&
        !f.includes(".next/") &&
        !f.includes(".nuxt/") &&
        !f.includes("coverage/"),
    );

  return {
    files,
    detectionMethod,
    truncated: scopeTruncated,
    moduleResolution,
  };
}

function listFiles(dir, base, maxFiles = 500) {
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
            "node_modules", ".git", "dist", "build", "__pycache__",
            "target", "vendor", ".next", ".nuxt", "coverage", ".turbo",
          ].includes(entry.name)
        )
          continue;
        const sub = listFiles(full, base, maxFiles - results.length);
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

// ─── Component/Screen inventory ─────────────────────────────────────────────

function buildInventory(cwd, files) {
  const components = [];
  const screens = [];
  const hooks = [];
  const styles = [];
  const other = [];

  for (const file of files) {
    if (!isFrontendFile(file)) continue;

    const classification = classifyFile(file);
    switch (classification) {
      case "component":
        components.push(file);
        break;
      case "screen":
        screens.push(file);
        break;
      case "hook":
        hooks.push(file);
        break;
      case "style":
        styles.push(file);
        break;
      case "test":
        // test files excluded from UI inventory
        break;
      default:
        other.push(file);
    }
  }

  // Identify feature modules
  const featureModules = new Set();
  for (const file of files) {
    const match = file.match(/features\/([^/]+)/);
    if (match) featureModules.add(match[1]);
  }

  return {
    components,
    screens,
    hooks,
    styles,
    featureModules: [...featureModules],
    frontendFileCount: components.length + screens.length + hooks.length + styles.length,
    totalFrontendFilesInScope: files.filter(isFrontendFile).length,
  };
}

// ─── Summary generation ─────────────────────────────────────────────────────

function buildSummary(mode, inventory, scopeInfo) {
  const parts = [];
  const warnings = [];
  const docsOnly =
    inventory.frontendFileCount === 0 &&
    scopeInfo.files.some(
      (file) => file === "docs/ui-guide.md" || file === "docs/ui-review-checklist.md",
    );

  if (mode.mode === "project") {
    if (docsOnly) {
      parts.push("Project mode: docs-only validation, no UI implementation files in scope");
    } else {
      parts.push(`Project mode: comparing ${inventory.frontendFileCount} UI files against ${mode.uiGuidePath}`);
    }
  } else if (mode.mode === "baseline") {
    parts.push(`Baseline mode: ${inventory.frontendFileCount} UI files in scope, no ui-guide.md found`);
  } else {
    parts.push("Bootstrap mode: no UI files to validate");
  }

  if (docsOnly) {
    warnings.push("Only UI documentation files are in scope; no screen/component implementation files were reviewed.");
  }

  if (scopeInfo.truncated) {
    warnings.push("File list truncated at 500 files. Use --scope to narrow.");
  }

  if (scopeInfo.moduleResolution?.ambiguous) {
    warnings.push(`Module query \"${scopeInfo.moduleResolution.query}\" matched multiple candidates; reviewing the strongest matches.`);
  }

  if (scopeInfo.moduleResolution && scopeInfo.files.length === 0) {
    warnings.push(`Module query \"${scopeInfo.moduleResolution.query}\" could not be resolved to UI files in scope.`);
  }

  if (inventory.components.length > 0) {
    parts.push(`${inventory.components.length} components`);
  }
  if (inventory.screens.length > 0) {
    parts.push(`${inventory.screens.length} screens`);
  }
  if (inventory.hooks.length > 0) {
    parts.push(`${inventory.hooks.length} hooks`);
  }
  if (inventory.styles.length > 0) {
    parts.push(`${inventory.styles.length} style files`);
  }

  return {
    summary: parts.join(", "),
    warnings,
    docsOnly,
  };
}

// ─── --detect ───────────────────────────────────────────────────────────────

function detect(cwd) {
  const frontend = detectFrontend(cwd);
  const mode = resolveMode(cwd, frontend.detected, 0);
  output({
    success: true,
    mode: mode.mode,
    frontendDetected: frontend.detected,
    framework: frontend.framework,
    uiLibs: frontend.uiLibs,
    configFiles: frontend.configFiles,
    uiGuidePath: mode.uiGuidePath,
    uiChecklistPath: mode.uiChecklistPath,
    reason: mode.reason,
  });
}

// ─── --scope ────────────────────────────────────────────────────────────────

function scopeCmd(cwd, flags) {
  const scopeInfo = getScopeInfo(cwd, flags);
  const frontendFiles = scopeInfo.files.filter((file) => isFrontendFile(file) && !isTestFile(file));
  const inventory = buildInventory(cwd, scopeInfo.files);

  output({
    success: true,
    mode: "scope",
    files: scopeInfo.files,
    frontendFiles,
    detectionMethod: scopeInfo.detectionMethod,
    truncated: scopeInfo.truncated,
    moduleResolution: scopeInfo.moduleResolution,
    components: inventory.components,
    screens: inventory.screens,
    hooks: inventory.hooks,
    styles: inventory.styles,
    featureModules: inventory.featureModules,
    frontendFileCount: inventory.frontendFileCount,
  });
}

// ─── --auto ─────────────────────────────────────────────────────────────────

function auto(cwd, flags) {
  const dryRun = hasTruthyFlag(flags["dry-run"]);
  const frontend = detectFrontend(cwd);
  const scopeInfo = getScopeInfo(cwd, flags);
  const inventory = buildInventory(cwd, scopeInfo.files);
  const mode = resolveMode(cwd, frontend.detected, inventory.frontendFileCount);
  const summary = buildSummary(mode, inventory, scopeInfo);

  const result = {
    success: true,
    mode: mode.mode,
    dryRun,
    frontendDetected: frontend.detected,
    framework: frontend.framework,
    uiLibs: frontend.uiLibs,
    uiGuidePath: mode.uiGuidePath,
    uiChecklistPath: mode.uiChecklistPath,
    files: dryRun ? [] : scopeInfo.files,
    frontendFiles: dryRun ? [] : scopeInfo.files.filter((file) => isFrontendFile(file) && !isTestFile(file)),
    screens: inventory.screens,
    components: inventory.components,
    hooks: inventory.hooks,
    styles: inventory.styles,
    featureModules: inventory.featureModules,
    frontendFileCount: inventory.frontendFileCount,
    detectionMethod: scopeInfo.detectionMethod,
    truncated: scopeInfo.truncated,
    moduleResolution: scopeInfo.moduleResolution,
    docsOnly: summary.docsOnly,
    warnings: summary.warnings,
    summary: summary.summary,
    reason: mode.reason,
    nextAction: dryRun
      ? "dry-run-complete"
      : summary.docsOnly
        ? "docs-only-validation"
      : mode.mode === "bootstrap"
        ? "nothing-to-validate"
        : "llm-review",
  };

  output(result);
}

function hasTruthyFlag(value) {
  if (value === true) return true;
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function printHelp() {
  process.stderr.write(
    [
      "flow-ui.mjs — UI validation gate script",
      "",
      "Usage:",
      "  node flow-ui.mjs --auto [--scope <path>] [--since <ref>] [--staged] [--working-tree] [--dry-run]",
      "  node flow-ui.mjs --auto --module \"clients form\"",
      "  node flow-ui.mjs --detect",
      "  node flow-ui.mjs --scope [--since <ref>] [--staged] [--working-tree]",
      "",
      "Modes (auto-detected):",
      "  project   — docs/ui-guide.md exists, compare against it",
      "  baseline  — no guide, but frontend files in scope",
      "  bootstrap — no guide, no frontend files",
      "",
      "Flags:",
      "  --auto            Full automated context + file inventory",
      "  --dry-run         Preview without full file list",
      "  --scope <path>    Limit to specific directory or file",
      "  --module <text>   Resolve a module/screen/component by description",
      "  --since <ref>     Compare against a git ref (branch/tag/commit)",
      "  --staged          Only staged changes",
      "  --working-tree    Staged + unstaged + untracked (default)",
    ].join("\n") + "\n",
  );
}

// ─── Entry point ────────────────────────────────────────────────────────────

const cwd = process.cwd();
const flags = parseArgs();

if (flags["auto"]) {
  auto(cwd, flags);
} else if (flags["detect"]) {
  detect(cwd);
} else if ("scope" in flags) {
  scopeCmd(cwd, flags);
} else {
  printHelp();
  process.exit(1);
}
