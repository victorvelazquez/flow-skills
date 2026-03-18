#!/usr/bin/env node
/**
 * scripts/lib/detect-tooling.mjs — Shared toolchain detection module
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Extracted from flow-audit.mjs detect() function.
 * Importable by both flow-build.mjs and flow-audit.mjs.
 */

import { execSync } from "child_process";
import process from "process";
import path from "path";
import fs from "fs";

// ─── Internal helpers ────────────────────────────────────────────────────────

function _exists(cwd, file) {
  return fs.existsSync(path.join(cwd, file));
}

function _readJsonFile(cwd, file) {
  try {
    const full = path.join(cwd, file);
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

function _runSafe(cmd) {
  try {
    return {
      ok: true,
      output: execSync(cmd, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim(),
    };
  } catch {
    return { ok: false, output: "" };
  }
}

// ─── detectTooling ────────────────────────────────────────────────────────────

/**
 * Detect the project's toolchain from config files and package.json.
 *
 * @param {string} [cwd] — directory to scan (defaults to process.cwd())
 * @returns {{
 *   testRunner: string|null,
 *   linter: string|null,
 *   formatter: string|null,
 *   packageManager: string|null,
 *   coverage: string|null,
 *   security: string|null,
 *   framework: string|null,
 * }}
 */
export function detectTooling(cwd) {
  if (!cwd) cwd = process.cwd();

  const ex = (file) => _exists(cwd, file);
  const pkg = _readJsonFile(cwd, "package.json");
  const scripts = (pkg && pkg.scripts) || {};
  const deps = {
    ...(pkg && pkg.dependencies),
    ...(pkg && pkg.devDependencies),
  };

  // ── Test runner ────────────────────────────────────────────────────────────
  let testRunner = null;

  if (
    deps["vitest"] ||
    ex("vitest.config.ts") ||
    ex("vitest.config.js") ||
    ex("vitest.config.mjs")
  ) {
    testRunner = "vitest";
  } else if (
    deps["jest"] ||
    ex("jest.config.js") ||
    ex("jest.config.ts") ||
    ex("jest.config.mjs")
  ) {
    testRunner = "jest";
  } else if (deps["mocha"]) {
    testRunner = "mocha";
  } else if (deps["jasmine"]) {
    testRunner = "jasmine";
  } else if (deps["ava"]) {
    testRunner = "ava";
  } else if (ex("Cargo.toml")) {
    testRunner = "cargo-test";
  } else if (ex("go.mod")) {
    testRunner = "go-test";
  } else if (ex("requirements.txt") || ex("pyproject.toml") || ex("setup.py")) {
    testRunner = "pytest";
  } else if (ex("Gemfile") || ex(".rspec")) {
    testRunner = "rspec";
  } else if (scripts["test"]) {
    testRunner = "npm-test";
  }

  // ── Linter ─────────────────────────────────────────────────────────────────
  let linter = null;

  if (
    ex("eslint.config.js") ||
    ex("eslint.config.ts") ||
    ex("eslint.config.mjs") ||
    ex(".eslintrc") ||
    ex(".eslintrc.js") ||
    ex(".eslintrc.ts") ||
    ex(".eslintrc.json") ||
    ex(".eslintrc.cjs") ||
    deps["eslint"]
  ) {
    linter = "eslint";
  } else if (ex("biome.json") || deps["@biomejs/biome"]) {
    linter = "biome";
  } else if (deps["oxlint"]) {
    linter = "oxlint";
  } else if (ex(".rubocop.yml")) {
    linter = "rubocop";
  } else if (ex(".golangci.yml") || ex(".golangci.yaml")) {
    linter = "golangci-lint";
  } else if (ex("Cargo.toml")) {
    linter = "clippy";
  } else if (ex("requirements.txt") || ex("pyproject.toml")) {
    // Prefer ruff over flake8
    const hasRuff = _runSafe("ruff --version").ok;
    linter = hasRuff ? "ruff" : "flake8";
  } else if (scripts["lint"]) {
    linter = "npm-lint";
  }

  // ── Package manager ────────────────────────────────────────────────────────
  let packageManager = null;

  if (ex("bun.lockb") || ex("bun.lock")) {
    packageManager = "bun";
  } else if (ex("pnpm-lock.yaml")) {
    packageManager = "pnpm";
  } else if (ex("yarn.lock")) {
    packageManager = "yarn";
  } else if (ex("package-lock.json") || ex("package.json")) {
    packageManager = "npm";
  } else if (ex("Cargo.toml")) {
    packageManager = "cargo";
  } else if (ex("go.mod")) {
    packageManager = "go-mod";
  } else if (ex("Gemfile.lock") || ex("Gemfile")) {
    packageManager = "bundler";
  } else if (ex("requirements.txt") || ex("pyproject.toml")) {
    packageManager = "pip";
  } else if (ex("composer.json")) {
    packageManager = "composer";
  }

  // ── Formatter ──────────────────────────────────────────────────────────────
  let formatter = null;

  if (
    deps["prettier"] ||
    ex(".prettierrc") ||
    ex(".prettierrc.js") ||
    ex(".prettierrc.json") ||
    ex(".prettierrc.yaml") ||
    ex(".prettierrc.yml") ||
    ex("prettier.config.js") ||
    ex("prettier.config.ts")
  ) {
    formatter = "prettier";
  } else if (deps["@biomejs/biome"] || ex("biome.json")) {
    formatter = "biome-format";
  } else if (ex("rustfmt.toml") || ex(".rustfmt.toml") || ex("Cargo.toml")) {
    formatter = "rustfmt";
  } else if (ex("go.mod")) {
    formatter = "gofmt";
  } else if (scripts["format:check"] || scripts["check:format"]) {
    formatter = "npm-format";
  }

  // ── Coverage ───────────────────────────────────────────────────────────────
  let coverage = null;

  if (deps["vitest"] || ex("vitest.config.ts") || ex("vitest.config.js")) {
    coverage = "vitest-coverage";
  } else if (deps["jest"] || ex("jest.config.js") || ex("jest.config.ts")) {
    coverage = "jest-coverage";
  } else if (ex("go.mod")) {
    coverage = "go-coverage";
  } else if (ex("requirements.txt") || ex("pyproject.toml")) {
    coverage = "pytest-coverage";
  } else if (scripts["test:coverage"] || scripts["coverage"]) {
    coverage = "npm-coverage";
  }

  // ── Security ───────────────────────────────────────────────────────────────
  let security = null;

  if (
    ex("package.json") &&
    (packageManager === "npm" ||
      packageManager === "yarn" ||
      packageManager === "pnpm" ||
      packageManager === "bun")
  ) {
    security = "npm-audit";
  } else if (ex("Cargo.toml")) {
    security = "cargo-audit";
  } else if (ex("requirements.txt") || ex("pyproject.toml")) {
    security = "pip-audit";
  } else if (ex("go.mod")) {
    security = "govulncheck";
  } else if (ex("Gemfile")) {
    security = "bundler-audit";
  } else if (scripts["audit"] || scripts["security"]) {
    security = "npm-audit";
  }

  // ── Framework ──────────────────────────────────────────────────────────────
  let framework = null;

  if (deps) {
    if (deps["next"]) framework = "next";
    else if (deps["nuxt"] || deps["nuxt3"]) framework = "nuxt";
    else if (deps["@remix-run/react"]) framework = "remix";
    else if (deps["@sveltejs/kit"]) framework = "sveltekit";
    else if (deps["svelte"]) framework = "svelte";
    else if (deps["@angular/core"]) framework = "angular";
    else if (deps["qwik"] || deps["@builder.io/qwik"]) framework = "qwik";
    else if (deps["solid-js"]) framework = "solid";
    else if (deps["react"]) framework = "react";
    else if (deps["vue"]) framework = "vue";
    else if (deps["express"]) framework = "express";
    else if (deps["fastify"]) framework = "fastify";
    else if (deps["hono"]) framework = "hono";
  }

  if (!framework) {
    if (ex("go.mod")) {
      try {
        const goMod = fs.readFileSync(path.join(cwd, "go.mod"), "utf8");
        framework = goMod.includes("gin-gonic/gin") ? "gin" : "go";
      } catch {
        framework = "go";
      }
    } else if (ex("Cargo.toml")) {
      try {
        const cargo = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
        if (cargo.includes("axum")) framework = "axum";
        else if (cargo.includes("actix-web")) framework = "actix";
        else framework = "rust";
      } catch {
        framework = "rust";
      }
    } else if (ex("requirements.txt") || ex("pyproject.toml")) {
      try {
        const reqs = ex("requirements.txt")
          ? fs.readFileSync(path.join(cwd, "requirements.txt"), "utf8")
          : fs.readFileSync(path.join(cwd, "pyproject.toml"), "utf8");
        if (reqs.includes("fastapi")) framework = "fastapi";
        else if (reqs.includes("django")) framework = "django";
        else if (reqs.includes("flask")) framework = "flask";
        else framework = "python";
      } catch {
        framework = "python";
      }
    } else if (ex("Gemfile")) {
      try {
        const gemfile = fs.readFileSync(path.join(cwd, "Gemfile"), "utf8");
        framework = gemfile.includes("rails") ? "rails" : "ruby";
      } catch {
        framework = "ruby";
      }
    }
  }

  return {
    testRunner,
    linter,
    formatter,
    packageManager,
    coverage,
    security,
    framework,
  };
}
