#!/usr/bin/env node
/**
 * scripts/lib/helpers.mjs — Shared utility functions for flow-* scripts
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 */

import { execSync } from "child_process";
import process from "process";
import path from "path";
import fs from "fs";

// ─── Shell execution ──────────────────────────────────────────────────────────

/**
 * Run a shell command synchronously; throw on non-zero exit.
 * @param {string} cmd
 * @param {object} [opts] — passed to execSync (e.g. { cwd })
 * @returns {string} stdout with trailing whitespace removed (leading whitespace preserved)
 */
export function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
      ...opts,
    }).trimEnd();
  } catch (err) {
    const msg = (err.stderr || err.message || String(err)).trim();
    throw new Error(msg);
  }
}

/**
 * run() but never throws — returns { ok: boolean, output: string }.
 * @param {string} cmd
 * @param {object} [opts]
 * @returns {{ ok: boolean, output: string }}
 */
export function runSafe(cmd, opts = {}) {
  try {
    return { ok: true, output: run(cmd, opts) };
  } catch (err) {
    return { ok: false, output: err.message };
  }
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

/**
 * Parse process.argv --flag [value] pairs.
 * Boolean flag if next arg starts with "--" or is absent.
 * @returns {Record<string, string|true>}
 */
export function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

// ─── Filesystem helpers ───────────────────────────────────────────────────────

/**
 * Check whether a file/directory exists relative to process.cwd().
 * @param {string} file — relative path
 * @returns {boolean}
 */
export function exists(file) {
  return fs.existsSync(path.join(process.cwd(), file));
}

/**
 * Unified set of directory names to skip during recursive file traversal.
 * @type {Set<string>}
 */
export const WALK_SKIP_DIRS = new Set([
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
  "docs",
  "specs",
  "planning",
]);

/**
 * Recursively walk `dir`, returning absolute paths of all files (not directories).
 * Skips any directory whose basename is in `skipDirs`.
 * Does NOT follow symlinks to directories (uses lstatSync).
 * All returned paths use forward slashes (cross-platform safe).
 *
 * @param {string} dir — absolute path to start from
 * @param {Set<string>} skipDirs — set of directory basenames to skip
 * @returns {string[]} absolute file paths, forward-slash normalized
 */
export function walkDir(dir, skipDirs) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue; // skip entries we can't stat
      }
      if (stat.isSymbolicLink()) {
        continue; // never follow symlinks
      }
      if (stat.isDirectory()) {
        if (skipDirs && skipDirs.has(entry)) {
          continue; // skip excluded dirs
        }
        const sub = walkDir(full, skipDirs);
        for (const f of sub) results.push(f);
      } else if (stat.isFile()) {
        results.push(full.replace(/\\/g, "/"));
      }
    }
  } catch {
    /* ignore permission errors */
  }
  return results;
}

/**
 * Read + JSON.parse a file relative to process.cwd().
 * Returns null on any error.
 * @param {string} file — relative path
 * @returns {object|null}
 */
export function readJsonFile(file) {
  try {
    const full = path.join(process.cwd(), file);
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

// ─── Branch protection ────────────────────────────────────────────────────────

/**
 * Canonical list of protected branch names used at SCRIPT RUNTIME.
 *
 * Intentional divergence from SKILL.md:
 *   - This list is the strict runtime guard enforced by all flow-* scripts.
 *     It covers the 6 branches that realistically exist in production workflows.
 *   - SKILL.md (LLM instructions) may list additional entries such as "dev" and
 *     "release" as LLM-only guardrails for AI-assisted workflows. Those extra
 *     entries are intentional and correct — they are NOT required to be present
 *     here because they are advisory guidance, not hard script enforcement.
 *
 * All flow-* scripts that enforce branch protection MUST import this constant.
 */
export const PROTECTED_BRANCHES = [
  "main",
  "master",
  "develop",
  "development",
  "staging",
  "production",
];
