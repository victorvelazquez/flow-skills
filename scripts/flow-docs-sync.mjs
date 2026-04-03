#!/usr/bin/env node
/**
 * flow-docs-sync.mjs — Codebase snapshot & docs-cache diff script
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto [--dry-run]  Resolve docs sync context in one entrypoint → JSON
 *   --snapshot       Scan codebase and emit state snapshot → JSON
 *   --diff           Compare snapshot to .flow-skills/cache/docs-analysis.json → JSON
 *   --update-cache   Write current snapshot to .flow-skills/cache/docs-analysis.json
 */

import { runSafe, parseArgs, exists, readJsonFile } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";

/**
 * Walk a directory recursively, returning relative POSIX paths.
 * Skips common non-source dirs.
 */
function walkDir(absDir, base, maxFiles = 2000) {
  const SKIP = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".turbo",
    "__pycache__",
    "target",
    "vendor",
    ".flow-skills",
  ]);
  const results = [];
  function recurse(dir) {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else {
        results.push(path.relative(base, full).replace(/\\/g, "/"));
      }
    }
  }
  recurse(absDir);
  return results;
}

// ─── Snapshot logic ───────────────────────────────────────────────────────────

/**
 * Detect components: .tsx/.jsx files in src/ with a default or named export.
 */
function detectComponents(allFiles) {
  const candidates = allFiles.filter(
    (f) => (f.endsWith(".tsx") || f.endsWith(".jsx")) && f.startsWith("src/"),
  );
  const components = [];
  for (const rel of candidates) {
    try {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      const hasExport =
        /export\s+default\s+(function|class|\w)/.test(src) ||
        /export\s+(function|const|class)\s+[A-Z]/.test(src);
      if (hasExport) {
        const name = path.basename(rel, path.extname(rel));
        components.push({ name, path: rel });
      }
    } catch {
      /* skip unreadable */
    }
  }
  return components;
}

/**
 * Detect Zustand stores and custom hooks in src/.
 */
function detectStores(allFiles) {
  const stores = [];
  const storeFiles = allFiles.filter(
    (f) =>
      f.startsWith("src/") &&
      (f.endsWith(".store.ts") ||
        f.endsWith(".store.tsx") ||
        (/use[A-Z]/.test(path.basename(f)) &&
          (f.endsWith(".ts") || f.endsWith(".tsx")))),
  );
  for (const rel of storeFiles) {
    try {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      const isZustand = src.includes("create(") || src.includes("create<");
      const isHook =
        /export\s+(function|const)\s+use[A-Z]/.test(src) ||
        /export\s+default\s+function\s+use[A-Z]/.test(src);
      if (isZustand || isHook || rel.includes(".store.")) {
        const name = path.basename(rel, path.extname(rel));
        stores.push({
          name,
          path: rel,
          type: isZustand
            ? "zustand"
            : rel.includes(".store.")
              ? "store"
              : "hook",
        });
      }
    } catch {
      /* skip */
    }
  }
  return stores;
}

/**
 * Detect routes from common router patterns.
 */
function detectRoutes(allFiles) {
  const routes = [];
  const routerFiles = allFiles.filter(
    (f) =>
      f.startsWith("src/") &&
      (f.includes("router/") ||
        f.includes("routes/") ||
        f.endsWith("router.tsx") ||
        f.endsWith("router.ts") ||
        f.endsWith("routes.tsx") ||
        f.endsWith("routes.ts")),
  );
  for (const rel of routerFiles) {
    try {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      const hasRouter =
        src.includes("createBrowserRouter") ||
        src.includes("createHashRouter") ||
        src.includes("<Route") ||
        src.includes("useRoutes(");
      if (hasRouter) {
        // Extract path strings like path: "/foo" or path="/foo"
        const pathMatches = [
          ...src.matchAll(/path[:\s="']+["']([^"']+)["']/g),
        ].map((m) => m[1]);
        routes.push({ file: rel, paths: [...new Set(pathMatches)] });
      }
    } catch {
      /* skip */
    }
  }
  return routes;
}

/**
 * Detect stylesheet and theme/token files in src/.
 */
function detectStyles(allFiles) {
  const STYLE_EXTS = new Set([".css", ".scss", ".sass", ".less"]);
  const THEME_NAMES = new Set([
    "theme.ts",
    "theme.tsx",
    "tokens.ts",
    "tokens.tsx",
    "palette.ts",
  ]);
  const styles = [];
  for (const rel of allFiles) {
    if (!rel.startsWith("src/")) continue;
    const base = path.basename(rel);
    const ext = path.extname(rel);
    if (STYLE_EXTS.has(ext)) {
      styles.push({ name: base, path: rel, type: "stylesheet" });
    } else if (THEME_NAMES.has(base)) {
      const type =
        base.startsWith("token") || base.startsWith("palette")
          ? "tokens"
          : "theme";
      styles.push({ name: base, path: rel, type });
    }
  }
  return styles;
}

/**
 * Read package.json deps.
 */
function detectDeps() {
  const pkg = readJsonFile("package.json");
  if (!pkg) return {};
  return {
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
  };
}

/**
 * Scan src/ for env var references.
 */
function detectEnvVars(allFiles) {
  const vars = new Set();
  const srcFiles = allFiles.filter(
    (f) =>
      f.startsWith("src/") &&
      (f.endsWith(".ts") ||
        f.endsWith(".tsx") ||
        f.endsWith(".js") ||
        f.endsWith(".jsx")),
  );
  for (const rel of srcFiles) {
    try {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      // process.env.VAR_NAME and import.meta.env.VAR_NAME
      const matches = [
        ...src.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z0-9_]+)/g),
      ].map((m) => m[1]);
      for (const v of matches) vars.add(v);
    } catch {
      /* skip */
    }
  }
  return [...vars].sort();
}

// ─── buildSnapshot (shared) ───────────────────────────────────────────────────

/**
 * Build a full snapshot of the current codebase state.
 * Used by --snapshot, --diff, and --update-cache.
 */
function buildSnapshot() {
  const cwd = process.cwd();
  const srcDir = path.join(cwd, "src");
  const allFiles = fs.existsSync(srcDir)
    ? walkDir(srcDir, cwd)
    : walkDir(cwd, cwd);
  return {
    components: detectComponents(allFiles),
    stores: detectStores(allFiles),
    routes: detectRoutes(allFiles),
    styles: detectStyles(allFiles),
    deps: detectDeps(),
    envVars: detectEnvVars(allFiles),
    fileCount: allFiles.length,
    timestamp: new Date().toISOString(),
    _testFiles: allFiles.filter(
      (f) =>
        f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__"),
    ),
  };
}

function auto(flags) {
  const dryRun = flags["dry-run"] === true;
  const cwd = process.cwd();
  const cachePath = path.join(
    cwd,
    ".flow-skills",
    "cache",
    "docs-analysis.json",
  );
  const cacheExists = fs.existsSync(cachePath);

  let diffResult;

  if (!cacheExists) {
    const current = buildSnapshot();
    diffResult = {
      cacheExists: false,
      changed: [
        {
          file: "docs/components.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/state-management.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/architecture.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/styling.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/testing.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "ai-instructions.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
      ],
      unchanged: [],
      current,
    };
  } else {
    const oldStdoutWrite = process.stdout.write;
    let captured = "";
    process.stdout.write = (chunk) => {
      captured += chunk;
      return true;
    };
    try {
      diff();
    } finally {
      process.stdout.write = oldStdoutWrite;
    }
    diffResult = JSON.parse(captured);
  }

  const result = {
    success: true,
    mode: "auto",
    dryRun,
    cacheExists: diffResult.cacheExists,
    changed: diffResult.changed,
    unchanged: diffResult.unchanged,
    current: diffResult.current,
    nextAction: diffResult.changed.length === 0 ? "noop" : "llm-update-docs",
    cacheUpdateRequired: diffResult.changed.length > 0,
  };

  if (dryRun) {
    result.preview = {
      filesToUpdate: diffResult.changed.map((entry) => entry.file),
      unchanged: diffResult.unchanged,
    };
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --snapshot ───────────────────────────────────────────────────────────────

function snapshot() {
  const result = buildSnapshot();
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --diff ───────────────────────────────────────────────────────────────────

function diff() {
  const cachePath = path.join(
    process.cwd(),
    ".flow-skills",
    "cache",
    "docs-analysis.json",
  );
  const cacheExists = fs.existsSync(cachePath);
  let cache = null;

  if (cacheExists) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } catch {
      cache = null;
    }
  }

  const current = buildSnapshot();

  if (!cacheExists || !cache) {
    const result = {
      cacheExists: false,
      changed: [
        {
          file: "docs/components.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/state-management.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/architecture.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/styling.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "docs/testing.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
        {
          file: "ai-instructions.md",
          reason: "No cache found — full documentation sync required",
          changes: ["Initial snapshot"],
        },
      ],
      unchanged: [],
      current,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  // Compare components
  const prevComponents = new Set((cache.components || []).map((c) => c.path));
  const currComponents = new Set(current.components.map((c) => c.path));
  const addedComponents = current.components.filter(
    (c) => !prevComponents.has(c.path),
  );
  const removedComponents = (cache.components || []).filter(
    (c) => !currComponents.has(c.path),
  );

  // Compare stores
  const prevStores = new Set((cache.stores || []).map((s) => s.path));
  const currStores = new Set(current.stores.map((s) => s.path));
  const addedStores = current.stores.filter((s) => !prevStores.has(s.path));
  const removedStores = (cache.stores || []).filter(
    (s) => !currStores.has(s.path),
  );

  // Compare routes (files + paths)
  const prevRouteFiles = new Set((cache.routes || []).map((r) => r.file));
  const currRouteFiles = new Set(current.routes.map((r) => r.file));
  const prevPaths = new Set((cache.routes || []).flatMap((r) => r.paths));
  const currPaths = new Set(current.routes.flatMap((r) => r.paths));
  const addedPaths = [...currPaths].filter((p) => !prevPaths.has(p));
  const removedPaths = [...prevPaths].filter((p) => !currPaths.has(p));
  const routesChanged =
    addedPaths.length > 0 ||
    removedPaths.length > 0 ||
    prevRouteFiles.size !== currRouteFiles.size;

  // Compare deps
  const prevDeps = {
    ...(cache.deps?.dependencies || {}),
    ...(cache.deps?.devDependencies || {}),
  };
  const currDeps = {
    ...(current.deps?.dependencies || {}),
    ...(current.deps?.devDependencies || {}),
  };
  const addedDeps = Object.keys(currDeps).filter((k) => !prevDeps[k]);
  const updatedDeps = Object.keys(currDeps).filter(
    (k) => prevDeps[k] && prevDeps[k] !== currDeps[k],
  );

  // Compare env vars
  const prevEnv = new Set(cache.envVars || []);
  const addedEnvVars = (current.envVars || []).filter((v) => !prevEnv.has(v));

  // Compare styles
  const prevStyles = new Set((cache.styles || []).map((s) => s.path));
  const currStyles = new Set(current.styles.map((s) => s.path));
  const addedStyles = current.styles.filter((s) => !prevStyles.has(s.path));
  const removedStyles = (cache.styles || []).filter(
    (s) => !currStyles.has(s.path),
  );

  // Compare test files
  const prevTests = cache._testFiles || [];
  const currTests = current._testFiles || [];
  const prevTestSet = new Set(prevTests);
  const currTestSet = new Set(currTests);
  const addedTests = currTests.filter((f) => !prevTestSet.has(f));
  const removedTests = prevTests.filter((f) => !currTestSet.has(f));

  // Build changed list
  const changed = [];
  const unchanged = [];

  // docs/components.md
  if (addedComponents.length > 0 || removedComponents.length > 0) {
    const changes = [];
    if (addedComponents.length)
      changes.push(
        `+${addedComponents.length} components: ${addedComponents.map((c) => c.name).join(", ")}`,
      );
    if (removedComponents.length)
      changes.push(
        `-${removedComponents.length} components: ${removedComponents.map((c) => c.name).join(", ")}`,
      );
    changed.push({
      file: "docs/components.md",
      reason: "Component changes detected",
      changes,
    });
  } else {
    unchanged.push("docs/components.md");
  }

  // docs/state-management.md
  if (addedStores.length > 0 || removedStores.length > 0) {
    const changes = [];
    if (addedStores.length)
      changes.push(
        `+${addedStores.length} stores/hooks: ${addedStores.map((s) => s.name).join(", ")}`,
      );
    if (removedStores.length)
      changes.push(
        `-${removedStores.length} stores/hooks: ${removedStores.map((s) => s.name).join(", ")}`,
      );
    changed.push({
      file: "docs/state-management.md",
      reason: "State management changes detected",
      changes,
    });
  } else {
    unchanged.push("docs/state-management.md");
  }

  // docs/architecture.md
  if (routesChanged) {
    const changes = [];
    if (addedPaths.length)
      changes.push(`+${addedPaths.length} routes: ${addedPaths.join(", ")}`);
    if (removedPaths.length)
      changes.push(
        `-${removedPaths.length} routes: ${removedPaths.join(", ")}`,
      );
    if (prevRouteFiles.size !== currRouteFiles.size)
      changes.push("Router file count changed");
    changed.push({
      file: "docs/architecture.md",
      reason: "Route structure changes detected",
      changes,
    });
  } else {
    unchanged.push("docs/architecture.md");
  }

  // docs/styling.md
  if (addedStyles.length > 0 || removedStyles.length > 0) {
    const changes = [];
    if (addedStyles.length)
      changes.push(
        `+${addedStyles.length} style files: ${addedStyles.map((s) => s.name).join(", ")}`,
      );
    if (removedStyles.length)
      changes.push(
        `-${removedStyles.length} style files: ${removedStyles.map((s) => s.name).join(", ")}`,
      );
    changed.push({
      file: "docs/styling.md",
      reason: "Style/theme changes detected",
      changes,
    });
  } else {
    unchanged.push("docs/styling.md");
  }

  // docs/testing.md
  if (addedTests.length > 0 || removedTests.length > 0) {
    const changes = [];
    if (addedTests.length)
      changes.push(
        `+${addedTests.length} test files: ${addedTests.slice(0, 5).join(", ")}${addedTests.length > 5 ? "…" : ""}`,
      );
    if (removedTests.length)
      changes.push(
        `-${removedTests.length} test files: ${removedTests.slice(0, 5).join(", ")}${removedTests.length > 5 ? "…" : ""}`,
      );
    changed.push({
      file: "docs/testing.md",
      reason: "Test file changes detected",
      changes,
    });
  } else {
    unchanged.push("docs/testing.md");
  }

  // ai-instructions.md
  if (addedDeps.length > 0 || updatedDeps.length > 0) {
    const changes = [];
    if (addedDeps.length)
      changes.push(
        `+${addedDeps.length} new deps: ${addedDeps.slice(0, 5).join(", ")}${addedDeps.length > 5 ? "…" : ""}`,
      );
    if (updatedDeps.length)
      changes.push(
        `${updatedDeps.length} version bumps: ${updatedDeps.slice(0, 3).join(", ")}${updatedDeps.length > 3 ? "…" : ""}`,
      );
    changed.push({
      file: "ai-instructions.md",
      reason: "Dependency changes detected",
      changes,
    });
  } else {
    unchanged.push("ai-instructions.md");
  }

  // specs/configuration.md
  if (addedEnvVars.length > 0) {
    changed.push({
      file: "specs/configuration.md",
      reason: "New environment variables detected",
      changes: [`+${addedEnvVars.length} env vars: ${addedEnvVars.join(", ")}`],
    });
  } else {
    unchanged.push("specs/configuration.md");
  }

  const result = {
    cacheExists: true,
    changed,
    unchanged,
    current,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --update-cache ───────────────────────────────────────────────────────────

function updateCache() {
  const cwd = process.cwd();
  const snap = buildSnapshot();

  const cacheDir = path.join(cwd, ".flow-skills", "cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  const cachePath = path.join(cacheDir, "docs-analysis.json");
  fs.writeFileSync(cachePath, JSON.stringify(snap, null, 2) + "\n", "utf8");

  const result = {
    ok: true,
    written: ".flow-skills/cache/docs-analysis.json",
    components: snap.components.length,
    stores: snap.stores.length,
    routes: snap.routes.length,
    styles: snap.styles.length,
    envVars: snap.envVars.length,
    testFiles: snap._testFiles.length,
    timestamp: snap.timestamp,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["snapshot"]) {
  snapshot();
} else if (flags["auto"]) {
  auto(flags);
} else if (flags["diff"]) {
  diff();
} else if (flags["update-cache"]) {
  updateCache();
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-docs-sync.mjs --auto [--dry-run]\n" +
      "  node flow-docs-sync.mjs --snapshot\n" +
      "  node flow-docs-sync.mjs --diff\n" +
      "  node flow-docs-sync.mjs --update-cache\n",
  );
  process.exit(1);
}
