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
 * @returns {string} trimmed stdout
 */
export function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
      ...opts,
    }).trim();
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
 * Canonical list of protected branch names.
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
