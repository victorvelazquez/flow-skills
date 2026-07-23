#!/usr/bin/env node
/**
 * scripts/lib/scope.mjs — Shared scope resolution helpers for flow-* scripts.
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 */

import process from "process";
import path from "path";
import fs from "fs";
import { exists, runSafe } from "./helpers.mjs";

export function resolveSinceRef(flags) {
  if (!("since" in flags)) return null;
  if (flags["since"] !== true) {
    const ref = String(flags["since"] || "");
    if (!isSafeGitRef(ref)) {
      process.stderr.write(
        `WARNING: ignoring unsafe --since ref '${ref}'. Use only letters, numbers, '/', '.', '_' and '-'.\n`,
      );
      return null;
    }
    return ref;
  }

  const candidates = [
    "origin/development",
    "origin/develop",
    "origin/main",
    "origin/master",
    "development",
    "develop",
    "main",
    "master",
  ];

  for (const candidate of candidates) {
    const existsRef = runSafe(`git rev-parse --verify --quiet ${candidate}`);
    if (existsRef.ok) return candidate;
  }

  return null;
}

export function isSafeGitRef(ref) {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref) &&
    !ref.startsWith("-") &&
    !ref.includes("..") &&
    !ref.includes("//") &&
    !ref.includes("@{") &&
    !ref.endsWith("/") &&
    !ref.endsWith(".") &&
    !ref.endsWith(".lock")
  );
}

export function gitPathsToCwdRelative(files, gitRoot) {
  return files.map((file) =>
    path
      .relative(process.cwd(), path.join(gitRoot, file))
      .replace(/\\/g, "/"),
  );
}

export function getScopeInfo(flags) {
  const explicitScope = flags["scope"] !== true ? flags["scope"] : null;
  const moduleScope = flags["module"] !== true ? flags["module"] : null;
  const scopePath = explicitScope || moduleScope;
  const sinceRef = resolveSinceRef(flags);

  let files = [];
  let detectionMethod = "unknown";
  let scopeTruncated = false;

  if (scopePath) {
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
    const isGit = runSafe("git rev-parse --is-inside-work-tree");
    if (isGit.ok && isGit.output.trim() === "true") {
      const gitRootResult = runSafe("git rev-parse --show-toplevel");
      const gitRoot = gitRootResult.ok
        ? gitRootResult.output.trim()
        : process.cwd();
      const diffFilter = "--diff-filter=ACMRT";

      if (sinceRef) {
        const sinceDiff = runSafe(
          `git diff --name-only ${diffFilter} ${sinceRef}...HEAD`,
        );
        if (sinceDiff.ok && sinceDiff.output) {
          files = gitPathsToCwdRelative(
            sinceDiff.output.split("\n").filter(Boolean),
            gitRoot,
          );
          detectionMethod = `git-since-${sinceRef}`;
        }
      }

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
          files = gitPathsToCwdRelative(
            Array.from(new Set(workingTreeFiles)),
            gitRoot,
          );
          detectionMethod = "git-working-tree";
        }
      }

      if (files.length === 0) {
        const lastDiff = runSafe(
          `git diff --name-only ${diffFilter} HEAD~1 HEAD`,
        );
        if (lastDiff.ok && lastDiff.output) {
          files = gitPathsToCwdRelative(
            lastDiff.output.split("\n").filter(Boolean),
            gitRoot,
          );
          detectionMethod = "git-diff-head";
        }
      }
    }

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

  const hasTests = files.some(
    (f) =>
      /\.(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs|rb)$/.test(f) ||
      /_(test|spec)\.(tsx?|jsx?|mjs|py|go|rs|java|kt|cs|rb)$/.test(f) ||
      f.includes("/__tests__/") ||
      f.includes("/test/") ||
      f.includes("/tests/") ||
      f.includes("/spec/"),
  );

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

export function listFilesRecursive(dir, base, maxFiles = 500) {
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
