#!/usr/bin/env node
/**
 * flow-build.mjs — Project type detector for flow-build skill
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --detect        Probe filesystem → JSON with projectType, framework, etc.
 *   --phase-files   Return absolute paths to all 11 phase files → JSON
 *   --context       Superset of --detect + toolchain + docker/CI/AI config detection → JSON
 *   --entity-scan   Scan for ORM entities and architecture patterns → JSON
 *   --smart-skip    Read audit-data.json and compute per-phase SKIP/HYBRID/FULL → JSON
 *   --write-cache   Run context detection and write to .ai-flow/cache/docs-analysis.json → JSON
 */

import { parseArgs, exists, readJsonFile, walkDir, WALK_SKIP_DIRS } from "./lib/helpers.mjs";
import { detectTooling } from "./lib/detect-tooling.mjs";
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

// ─── --context ────────────────────────────────────────────────────────────────

function buildContextResult(cwd) {
  const norm = (p) => p.replace(/\\/g, "/");

  // Base --detect fields
  const projectType = detectProjectType();
  const framework = detectFramework();
  const language = detectLanguage();
  const cacheExists = exists(".ai-flow/cache/docs-analysis.json");
  const aiFlowExists = exists(".ai-flow");
  const existingDocs = detectExistingDocs();
  const isExistingProject =
    existingDocs.found >= 2 || exists("src") || exists("app") || exists("lib");
  const suggestedScope =
    existingDocs.found >= 6 ? "production" : existingDocs.found >= 3 ? "mvp" : "new";

  // Toolchain (from shared module)
  const tooling = detectTooling(cwd);

  // ORM detection
  const ormCandidates = [
    { name: "prisma", file: "prisma/schema.prisma" },
    { name: "prisma", file: "schema.prisma" },
  ];
  let orm = null;
  let ormSchemaFile = null;

  const pkg = readJsonFile("package.json");
  const deps = Object.assign(
    {},
    pkg?.dependencies || {},
    pkg?.devDependencies || {},
  );

  if (exists("prisma/schema.prisma") || exists("schema.prisma")) {
    orm = "prisma";
    ormSchemaFile = exists("prisma/schema.prisma") ? "prisma/schema.prisma" : "schema.prisma";
  } else if ("typeorm" in deps || "@typeorm/core" in deps) {
    orm = "typeorm";
  } else if ("sequelize" in deps) {
    orm = "sequelize";
  } else if ("@prisma/client" in deps) {
    orm = "prisma";
  } else {
    // Python ORMs
    const pyFiles = ["requirements.txt", "pyproject.toml"];
    for (const f of pyFiles) {
      const content = readFile(f);
      if (!content) continue;
      if (content.includes("django") || content.includes("Django")) {
        orm = "django-orm";
        break;
      }
      if (content.includes("sqlalchemy") || content.includes("SQLAlchemy")) {
        orm = "sqlalchemy";
        break;
      }
    }
  }

  // Docker
  const dockerCandidates = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"];
  const dockerFiles = dockerCandidates.filter((f) => exists(f));
  const hasDocker = dockerFiles.length > 0;

  // CI config
  const ciCandidates = [
    { file: ".github/workflows", isDir: true },
    { file: ".gitlab-ci.yml", isDir: false },
    { file: "Jenkinsfile", isDir: false },
    { file: ".circleci", isDir: true },
    { file: "azure-pipelines.yml", isDir: false },
    { file: ".travis.yml", isDir: false },
  ];
  let hasCIConfig = false;
  let ciConfigFile = null;
  for (const candidate of ciCandidates) {
    const fullPath = path.join(cwd, candidate.file);
    if (fs.existsSync(fullPath)) {
      hasCIConfig = true;
      if (candidate.isDir) {
        // Return the directory path (normalized)
        ciConfigFile = norm(candidate.file);
      } else {
        ciConfigFile = norm(candidate.file);
      }
      break;
    }
  }

  // AI config files
  const aiConfigCandidates = ["AGENT.md", ".cursorrules", ".clauderules", ".geminirules", "GEMINI.md", "CLAUDE.md", "opencode.json"];
  const aiConfigFiles = aiConfigCandidates.filter((f) => exists(f));

  // Directory structure
  let topLevelDirs = [];
  try {
    topLevelDirs = fs
      .readdirSync(cwd)
      .filter((entry) => {
        try {
          const stat = fs.lstatSync(path.join(cwd, entry));
          return stat.isDirectory() && !entry.startsWith(".");
        } catch {
          return false;
        }
      })
      .map(norm);
  } catch {
    topLevelDirs = [];
  }

  let srcDirs = [];
  for (const srcBase of ["src", "app"]) {
    if (exists(srcBase)) {
      try {
        const sub = fs
          .readdirSync(path.join(cwd, srcBase))
          .filter((entry) => {
            try {
              return fs.lstatSync(path.join(cwd, srcBase, entry)).isDirectory();
            } catch {
              return false;
            }
          })
          .map((entry) => norm(`${srcBase}/${entry}`));
        srcDirs = [...srcDirs, ...sub];
      } catch {
        /* ignore */
      }
      break;
    }
  }

  // Audit data
  const auditDataPath = ".ai-flow/cache/audit-data.json";
  const auditDataExists = exists(auditDataPath);
  const auditData = {
    exists: auditDataExists,
    path: auditDataExists ? auditDataPath : null,
  };

  const cacheFile = cacheExists ? ".ai-flow/cache/docs-analysis.json" : null;

  return {
    // Original --detect fields (frozen shape)
    projectType,
    framework,
    language,
    cacheExists,
    aiFlowExists,
    isExistingProject,
    existingDocs,
    suggestedScope,
    cwd: norm(cwd),
    // New context fields
    orm,
    ormSchemaFile,
    testRunner: tooling.testRunner,
    linter: tooling.linter,
    formatter: tooling.formatter,
    packageManager: tooling.packageManager,
    hasDocker,
    dockerFiles,
    hasCIConfig,
    ciConfigFile,
    aiConfigFiles,
    directoryStructure: { topLevelDirs, srcDirs },
    auditData,
    cacheFile,
  };
}

function modeContext() {
  const cwd = process.cwd();
  const result = buildContextResult(cwd);
  process.stdout.write(JSON.stringify(result, null, 2));
}

// ─── --entity-scan ────────────────────────────────────────────────────────────

function modeEntityScan(flags) {
  const cwd = process.cwd();
  const norm = (p) => p.replace(/\\/g, "/");

  // Optional --src-dir restriction
  const srcDir = flags["src-dir"] !== true ? flags["src-dir"] : null;
  const scanRoot = srcDir ? path.resolve(cwd, srcDir) : cwd;

  const entities = [];

  // 1. Prisma schema: ^model\s+(\w+)
  const prismaSchema = path.join(cwd, "prisma", "schema.prisma");
  if (fs.existsSync(prismaSchema)) {
    try {
      const content = fs.readFileSync(prismaSchema, "utf8");
      const lines = content.split("\n");
      for (const line of lines) {
        const m = line.match(/^model\s+(\w+)/);
        if (m) {
          entities.push({
            name: m[1],
            type: "model",
            file: "prisma/schema.prisma",
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Scan for TypeORM entity files and Django models via walkDir
  let allFiles;
  try {
    allFiles = walkDir(scanRoot, WALK_SKIP_DIRS);
  } catch {
    allFiles = [];
  }

  // TypeORM: *.entity.ts files with @Entity( ... class ClassName
  const entityTsFiles = allFiles.filter((f) => f.endsWith(".entity.ts"));
  for (const file of entityTsFiles) {
    try {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("@Entity(") || content.includes("@Entity()")) {
        // Find class name after @Entity decorator
        const classMatch = content.match(/@Entity[^]*?class\s+(\w+)/s);
        if (classMatch) {
          entities.push({
            name: classMatch[1],
            type: "entity",
            file: norm(path.relative(cwd, file)),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Django: **/models.py with class X(models.Model):
  const modelsPyFiles = allFiles.filter((f) => f.endsWith("models.py"));
  for (const file of modelsPyFiles) {
    try {
      const content = fs.readFileSync(file, "utf8");
      const re = /class\s+(\w+)\s*\(models\.Model\)/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        entities.push({
          name: m[1],
          type: "model",
          file: norm(path.relative(cwd, file)),
        });
      }
    } catch {
      /* ignore */
    }
  }

  // Controllers, services, modules
  const controllerFiles = allFiles.filter((f) =>
    f.endsWith(".controller.ts") || f.endsWith("_controller.py") || f.endsWith("controller.go"),
  );
  const serviceFiles = allFiles.filter((f) =>
    f.endsWith(".service.ts") || f.endsWith("_service.py") || f.endsWith("service.go"),
  );
  const moduleFiles = allFiles.filter((f) => f.endsWith(".module.ts"));

  const controllers = {
    count: controllerFiles.length,
    files: controllerFiles.map((f) => norm(path.relative(cwd, f))),
  };
  const services = {
    count: serviceFiles.length,
    files: serviceFiles.map((f) => norm(path.relative(cwd, f))),
  };
  const modules = {
    count: moduleFiles.length,
    files: moduleFiles.map((f) => norm(path.relative(cwd, f))),
  };

  // Architecture pattern detection
  let architecturePattern = "unknown";
  for (const srcBase of ["src", "app"]) {
    const srcPath = path.join(cwd, srcBase);
    if (!fs.existsSync(srcPath)) continue;
    try {
      const subdirs = fs
        .readdirSync(srcPath)
        .filter((e) => fs.lstatSync(path.join(srcPath, e)).isDirectory());

      // Feature-based: each subdir has controller/service/module
      const featureSignals = subdirs.filter((sub) => {
        const subPath = path.join(srcPath, sub);
        try {
          const files = fs.readdirSync(subPath);
          return files.some(
            (f) =>
              f.endsWith(".controller.ts") ||
              f.endsWith(".service.ts") ||
              f.endsWith(".module.ts"),
          );
        } catch {
          return false;
        }
      });
      if (featureSignals.length > 0) {
        architecturePattern = "feature-based";
        break;
      }

      // Layer-based: src/controllers/, src/services/, src/modules/ at top level
      const layerDirs = ["controllers", "services", "modules"];
      const hasLayers = layerDirs.some((d) =>
        fs.existsSync(path.join(srcPath, d)),
      );
      if (hasLayers) {
        architecturePattern = "layer-based";
        break;
      }
    } catch {
      /* ignore */
    }
  }

  // Test-to-source ratio
  const sourceFiles = allFiles.filter((f) => {
    const ext = path.extname(f);
    return [".ts", ".js", ".mjs", ".py", ".go", ".rb", ".java", ".cs"].includes(ext);
  });
  const testFiles = sourceFiles.filter(
    (f) =>
      f.includes(".test.") ||
      f.includes(".spec.") ||
      f.includes("_test.") ||
      f.includes("_spec.") ||
      f.includes("/__tests__/") ||
      f.includes("/tests/") ||
      f.includes("/test/") ||
      f.includes("/spec/"),
  );
  const nonTestSourceFiles = sourceFiles.filter(
    (f) =>
      !f.includes(".test.") &&
      !f.includes(".spec.") &&
      !f.includes("_test.") &&
      !f.includes("_spec.") &&
      !f.includes("/__tests__/") &&
      !f.includes("/tests/") &&
      !f.includes("/test/") &&
      !f.includes("/spec/"),
  );
  const testToSourceRatio =
    nonTestSourceFiles.length === 0
      ? 0
      : Math.round((testFiles.length / nonTestSourceFiles.length) * 100) / 100;

  const result = {
    entities,
    entityCount: entities.length,
    controllers,
    services,
    modules,
    architecturePattern,
    testToSourceRatio,
  };

  process.stdout.write(JSON.stringify(result, null, 2));
}

// ─── --smart-skip ─────────────────────────────────────────────────────────────

// Map of phase number → output doc file path
const PHASE_DOC_FILES = {
  1: "project-brief.md",
  2: "docs/data-model.md",
  3: "docs/architecture.md",
  4: "specs/security.md",
  5: "docs/code-standards.md",
  6: "docs/testing.md",
  7: "docs/deployment.md",
};

function modeSmartSkip(flags) {
  const cwd = process.cwd();
  const phaseFilter = flags["phase"] !== true && flags["phase"] ? parseInt(flags["phase"], 10) : null;

  // Attempt to read audit-data.json
  let cacheData = null;
  let cacheExists = false;

  const cachePath = path.join(cwd, ".ai-flow", "cache", "audit-data.json");
  let rawCache = null;
  try {
    rawCache = fs.readFileSync(cachePath, "utf8");
    cacheExists = true; // file exists and is readable
  } catch {
    cacheExists = false; // file not found or unreadable
  }
  if (rawCache !== null) {
    try {
      cacheData = JSON.parse(rawCache);
    } catch {
      cacheData = null; // file exists but JSON is malformed
    }
  }

  const phaseNums = phaseFilter ? [phaseFilter] : [1, 2, 3, 4, 5, 6, 7];
  const phases = {};

  for (const n of phaseNums) {
    const docFile = PHASE_DOC_FILES[n];
    const fileExists = docFile ? fs.existsSync(path.join(cwd, docFile)) : false;

    if (!cacheExists || !cacheData) {
      phases[`phase${n}`] = {
        recommendation: "FULL",
        reason: cacheExists ? "Malformed cache" : "No cache",
        fileExists,
        gaps: [],
      };
      continue;
    }

    if (!fileExists) {
      phases[`phase${n}`] = {
        recommendation: "FULL",
        reason: "Doc file not found",
        fileExists: false,
        gaps: [],
      };
      continue;
    }

    // Read phase data from cache
    const phaseKey = `phase${n}`;
    const phaseCache = cacheData.phases && cacheData.phases[phaseKey];

    if (!phaseCache) {
      phases[phaseKey] = {
        recommendation: "FULL",
        reason: "Phase not found in cache",
        fileExists,
        gaps: [],
      };
      continue;
    }

    const rec = phaseCache.recommendation;
    if (rec === "SKIP") {
      phases[phaseKey] = {
        recommendation: "SKIP",
        reason: phaseCache.reason || "Up to date",
        fileExists,
        gaps: [],
      };
    } else if (rec === "HYBRID") {
      phases[phaseKey] = {
        recommendation: "HYBRID",
        reason: phaseCache.reason || "Has gaps",
        fileExists,
        gaps: Array.isArray(phaseCache.gaps) ? phaseCache.gaps : [],
      };
    } else {
      phases[phaseKey] = {
        recommendation: "FULL",
        reason: phaseCache.reason || "Full regeneration needed",
        fileExists,
        gaps: [],
      };
    }
  }

  const result = { cacheExists, phases };
  process.stdout.write(JSON.stringify(result, null, 2));
}

// ─── --write-cache ────────────────────────────────────────────────────────────

function modeWriteCache(flags) {
  const cwd = process.cwd();
  const norm = (p) => p.replace(/\\/g, "/");
  const outPath = path.join(cwd, ".ai-flow", "cache", "docs-analysis.json");
  const relOut = ".ai-flow/cache/docs-analysis.json";

  try {
    // Determine content to write
    let data;
    if (flags["data"] && flags["data"] !== true) {
      // Parse and use provided JSON
      data = JSON.parse(flags["data"]);
    } else {
      // Run context detection
      data = buildContextResult(cwd);
    }

    // Create directory recursively if needed
    fs.mkdirSync(path.join(cwd, ".ai-flow", "cache"), { recursive: true });

    // Atomic write: write to temp, then rename
    const tmpPath = outPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, outPath);

    process.stdout.write(JSON.stringify({ ok: true, path: relOut }, null, 2));
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags.detect) {
  modeDetect();
} else if (flags["phase-files"]) {
  modePhaseFiles();
} else if (flags["context"]) {
  modeContext();
} else if (flags["entity-scan"]) {
  modeEntityScan(flags);
} else if (flags["smart-skip"]) {
  modeSmartSkip(flags);
} else if (flags["write-cache"]) {
  modeWriteCache(flags);
} else {
  process.stderr.write("Usage: node flow-build.mjs --detect | --phase-files | --context | --entity-scan | --smart-skip [--phase N] | --write-cache [--data '<json>']\n");
  process.exit(1);
}
