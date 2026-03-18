#!/usr/bin/env node
/**
 * flow-build.mjs — Project type detector for flow-build skill
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --detect        Probe filesystem → JSON with projectType, framework, etc.
 *   --phase-files   Return absolute paths to all 11 phase files → JSON
 */

import { parseArgs, exists, readJsonFile } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFile(rel) {
  try {
    return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  } catch {
    return null;
  }
}

// ─── Stack detection ──────────────────────────────────────────────────────────

function detectProjectType() {
  const pkg = readJsonFile("package.json");
  const deps = Object.assign(
    {},
    pkg?.dependencies || {},
    pkg?.devDependencies || {},
  );

  // Mobile indicators
  const isMobile =
    "react-native" in deps ||
    exists("pubspec.yaml") || // Flutter
    exists("ios/Podfile") ||
    exists("android/app/build.gradle") ||
    (exists("app.json") && "react-native" in deps);

  // Frontend indicators
  const isFrontend =
    !isMobile &&
    (exists("index.html") ||
      "vite" in deps ||
      "next" in deps ||
      "nuxt" in deps ||
      "react" in deps ||
      "vue" in deps ||
      "@angular/core" in deps ||
      "svelte" in deps ||
      "react-dom" in deps);

  // Backend indicators
  const isBackend =
    exists("requirements.txt") ||
    exists("pyproject.toml") ||
    exists("go.mod") ||
    exists("pom.xml") ||
    exists("build.gradle") ||
    exists("Gemfile") ||
    exists("composer.json") ||
    (pkg &&
      ("@nestjs/core" in deps ||
        "express" in deps ||
        "fastify" in deps ||
        "hapi" in deps ||
        "koa" in deps));

  // Fullstack: has both frontend + backend signals
  const isFullstack = isBackend && isFrontend && !isMobile;

  if (isFullstack) return "fullstack";
  if (isMobile) return "mobile";
  if (isFrontend) return "frontend";
  if (isBackend) return "backend";
  return "unknown";
}

function detectFramework() {
  const pkg = readJsonFile("package.json");
  const deps = Object.assign(
    {},
    pkg?.dependencies || {},
    pkg?.devDependencies || {},
  );

  // Mobile
  if ("react-native" in deps) return "React Native";
  if (exists("pubspec.yaml")) return "Flutter";

  // Frontend
  if ("next" in deps) return "Next.js";
  if ("nuxt" in deps) return "Nuxt.js";
  if ("@angular/core" in deps) return "Angular";
  if ("svelte" in deps || "@sveltejs/kit" in deps) return "SvelteKit";
  if ("vue" in deps) return "Vue.js";
  if ("react" in deps) return "React";

  // Backend Node
  if ("@nestjs/core" in deps) return "NestJS";
  if ("fastify" in deps) return "Fastify";
  if ("express" in deps) return "Express";
  if ("koa" in deps) return "Koa";

  // Backend other
  if (exists("requirements.txt") || exists("pyproject.toml")) {
    const req =
      readFile("requirements.txt") || readFile("pyproject.toml") || "";
    if (req.includes("fastapi")) return "FastAPI";
    if (req.includes("django")) return "Django";
    if (req.includes("flask")) return "Flask";
    return "Python";
  }
  if (exists("go.mod")) return "Go";
  if (exists("pom.xml")) return "Spring Boot / Maven";
  if (exists("build.gradle")) return "Spring Boot / Gradle";
  if (exists("Gemfile")) return "Ruby on Rails";
  if (exists("composer.json")) return "Laravel / PHP";

  return "unknown";
}

function detectLanguage() {
  if (exists("tsconfig.json")) return "TypeScript";
  const pkg = readJsonFile("package.json");
  const deps = Object.assign(
    {},
    pkg?.dependencies || {},
    pkg?.devDependencies || {},
  );
  if ("typescript" in deps) return "TypeScript";
  if (pkg) return "JavaScript";
  if (exists("requirements.txt") || exists("pyproject.toml")) return "Python";
  if (exists("go.mod")) return "Go";
  if (exists("pom.xml") || exists("build.gradle")) return "Java";
  if (exists("pubspec.yaml")) return "Dart";
  if (exists("Gemfile")) return "Ruby";
  if (exists("composer.json")) return "PHP";
  return "unknown";
}

function detectExistingDocs() {
  const docFiles = [
    "project-brief.md",
    "docs/data-model.md",
    "docs/architecture.md",
    "specs/security.md",
    "docs/code-standards.md",
    "docs/testing.md",
    "docs/deployment.md",
    "AGENT.md",
    "ai-instructions.md",
    "planning/roadmap.md",
  ];
  const found = docFiles.filter((f) => exists(f));
  return { total: docFiles.length, found: found.length, files: found };
}

// ─── Modes ────────────────────────────────────────────────────────────────────

function modeDetect() {
  const projectType = detectProjectType();
  const framework = detectFramework();
  const language = detectLanguage();
  const cacheExists = exists(".ai-flow/cache/docs-analysis.json");
  const aiFlowExists = exists(".ai-flow");
  const existingDocs = detectExistingDocs();
  const isExistingProject =
    existingDocs.found >= 2 || exists("src") || exists("app") || exists("lib");

  const result = {
    projectType,
    framework,
    language,
    cacheExists,
    aiFlowExists,
    isExistingProject,
    existingDocs,
    suggestedScope:
      existingDocs.found >= 6
        ? "production"
        : existingDocs.found >= 3
          ? "mvp"
          : "new",
    cwd: process.cwd(),
  };

  process.stdout.write(JSON.stringify(result, null, 2));
}

function modePhaseFiles() {
  const skillDir = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "skills",
    "flow-build",
    "phases",
  );
  const phases = {};
  for (let i = 0; i <= 10; i++) {
    const file = path.join(skillDir, `phase-${i}.md`);
    phases[`phase${i}`] = {
      path: file,
      exists: fs.existsSync(file),
    };
  }
  process.stdout.write(JSON.stringify({ skillDir, phases }, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags.detect) {
  modeDetect();
} else if (flags["phase-files"]) {
  modePhaseFiles();
} else {
  process.stderr.write("Usage: node flow-build.mjs --detect | --phase-files\n");
  process.exit(1);
}
