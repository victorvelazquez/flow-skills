#!/usr/bin/env node
/**
 * flow-release.mjs — Semantic versioning and release context gatherer
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --context                              Gather git + version context → JSON
 *   --dry-run                              Alias for --context (read-only preview)
 *   --update-version --version X.Y.Z       Run npm version + report additional files
 *   --execute --version X.Y.Z --files "f1,f2,f3"  Stage + commit + tag + push
 */

import { run, runSafe, parseArgs, exists, readJsonFile } from "./lib/helpers.mjs";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";

// ─── --context / --dry-run ────────────────────────────────────────────────────

function context() {
  const cwd = process.cwd();

  // ── Git status (must be clean for release) ───────────────────────────────
  const statusOut = runSafe("git status --porcelain");
  const statusLines = statusOut.ok
    ? statusOut.output.split("\n").filter((l) => {
        if (!l || l.length < 4) return false;
        const trimmed = l.trim();
        if (
          trimmed === "nul" ||
          trimmed === "?? nul" ||
          trimmed.endsWith(" nul")
        )
          return false;
        return /^.{2} .+$/.test(l);
      })
    : [];

  const isClean = statusLines.length === 0;
  const dirtyFiles = statusLines
    .map((l) => l.slice(3).trim().replace(/\\/g, "/"))
    .filter((f) => f && f !== "nul");

  // ── Branch ────────────────────────────────────────────────────────────────
  const branch = runSafe("git branch --show-current");
  const currentBranch = branch.ok ? branch.output : "unknown";
  const RELEASE_BRANCHES = ["main", "master", "development"];
  const isReleaseBranch = RELEASE_BRANCHES.includes(currentBranch);

  // ── Remote ────────────────────────────────────────────────────────────────
  const remote = runSafe("git remote -v");
  const remoteLines = remote.ok
    ? remote.output.split("\n").filter(Boolean)
    : [];
  const hasOrigin = remoteLines.some((l) => l.startsWith("origin"));

  // ── Last tag ──────────────────────────────────────────────────────────────
  const lastTagResult = runSafe(
    "git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0",
  );
  // On Windows, 2>/dev/null may not work — fallback gracefully
  let lastTag = "v0.0.0";
  if (lastTagResult.ok && lastTagResult.output) {
    const candidate = lastTagResult.output.trim();
    lastTag = candidate || "v0.0.0";
  } else {
    // Try without the shell redirect
    const tagFallback = runSafe("git describe --tags --abbrev=0");
    lastTag =
      tagFallback.ok && tagFallback.output
        ? tagFallback.output.trim()
        : "v0.0.0";
  }

  // ── Commits since last tag ────────────────────────────────────────────────
  let commitCount = 0;
  let commitLog = [];

  if (lastTag !== "v0.0.0") {
    const countResult = runSafe(`git rev-list ${lastTag}..HEAD --count`);
    if (countResult.ok) {
      commitCount = parseInt(countResult.output, 10) || 0;
    }
    const logResult = runSafe(`git log ${lastTag}..HEAD --oneline --no-merges`);
    if (logResult.ok && logResult.output) {
      commitLog = logResult.output.split("\n").filter(Boolean);
    }
  } else {
    // No previous tag — get all commits
    const logResult = runSafe("git log --oneline --no-merges");
    if (logResult.ok && logResult.output) {
      commitLog = logResult.output.split("\n").filter(Boolean);
      commitCount = commitLog.length;
    }
  }

  // ── Version file detection ─────────────────────────────────────────────────
  const versionFiles = [];
  let currentVersion = "0.0.0";
  let versionSystem = null;

  // Priority 1: package.json
  const pkg = readJsonFile("package.json");
  if (pkg && pkg.version) {
    currentVersion = pkg.version;
    versionSystem = "npm";
    versionFiles.push({ file: "package.json", version: pkg.version });
  }

  // Priority 2: bower.json
  const bower = readJsonFile("bower.json");
  if (bower && bower.version) {
    if (!versionSystem) {
      currentVersion = bower.version;
      versionSystem = "bower";
    }
    versionFiles.push({ file: "bower.json", version: bower.version });
  }

  // Additional frontend version files (existence only — content read by LLM)
  const additionalFiles = {
    "public/manifest.json": exists("public/manifest.json"),
    "manifest.json": exists("manifest.json"),
    "src/version.ts": exists("src/version.ts"),
    "src/version.js": exists("src/version.js"),
    "src/config.ts": exists("src/config.ts"),
    "src/config.js": exists("src/config.js"),
    "public/index.html": exists("public/index.html"),
    ".env.production": exists(".env.production"),
    "CHANGELOG.md": exists("CHANGELOG.md"),
  };

  // Check for version mismatches
  const detectedVersions = {};
  if (pkg && pkg.version) detectedVersions["package.json"] = pkg.version;
  if (bower && bower.version) detectedVersions["bower.json"] = bower.version;

  const manifest =
    readJsonFile("public/manifest.json") || readJsonFile("manifest.json");
  if (manifest && manifest.version) {
    const manifestPath = exists("public/manifest.json")
      ? "public/manifest.json"
      : "manifest.json";
    detectedVersions[manifestPath] = manifest.version;
  }

  const uniqueVersions = [...new Set(Object.values(detectedVersions))];
  const hasMismatch = uniqueVersions.length > 1;

  const result = {
    git: {
      branch: currentBranch,
      isReleaseBranch,
      isClean,
      dirtyFiles,
      hasOrigin,
      remote: remoteLines[0] || null,
    },
    version: {
      system: versionSystem,
      current: currentVersion,
      lastTag,
      files: versionFiles,
      additionalFiles,
      hasMismatch,
      allDetected: detectedVersions,
    },
    commits: {
      count: commitCount,
      since: lastTag,
      log: commitLog,
    },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --update-version ────────────────────────────────────────────────────────
//
// Side Effects:
//   - Runs `npm version X --no-git-tag-version` → modifies package.json + package-lock.json
//   - Does NOT commit, tag, or push

function updateVersion(flags) {
  const newVersion = flags["version"];
  if (!newVersion) {
    process.stderr.write("Error: --update-version requires --version X.Y.Z\n");
    process.exit(1);
  }

  // Validate semver format
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    process.stderr.write(
      `Error: version "${newVersion}" is not a valid semver (expected X.Y.Z)\n`,
    );
    process.exit(1);
  }

  // Check package.json exists
  if (!exists("package.json")) {
    process.stderr.write(
      "Error: package.json not found in working directory\n",
    );
    process.exit(1);
  }

  // Run npm version
  const npmResult = runSafe(`npm version ${newVersion} --no-git-tag-version`);

  if (!npmResult.ok) {
    process.stderr.write(`npm version failed: ${npmResult.output}\n`);
    process.exit(1);
  }

  // Report which additional files exist and need manual updates
  const additionalUpdates = [];

  if (exists("public/manifest.json")) {
    additionalUpdates.push({
      file: "public/manifest.json",
      fields: ["version", "version_name"],
      action: "update-json-fields",
    });
  } else if (exists("manifest.json")) {
    additionalUpdates.push({
      file: "manifest.json",
      fields: ["version", "version_name"],
      action: "update-json-fields",
    });
  }

  if (exists("src/version.ts")) {
    additionalUpdates.push({
      file: "src/version.ts",
      fields: ["APP_VERSION", "BUILD_DATE"],
      action: "update-constants",
    });
  } else if (exists("src/version.js")) {
    additionalUpdates.push({
      file: "src/version.js",
      fields: ["APP_VERSION", "BUILD_DATE"],
      action: "update-constants",
    });
  }

  if (exists("src/config.ts")) {
    additionalUpdates.push({
      file: "src/config.ts",
      fields: ["version", "APP_VERSION"],
      action: "update-constants",
    });
  } else if (exists("src/config.js")) {
    additionalUpdates.push({
      file: "src/config.js",
      fields: ["version", "APP_VERSION"],
      action: "update-constants",
    });
  }

  if (exists("public/index.html")) {
    additionalUpdates.push({
      file: "public/index.html",
      fields: ['meta[name="version"]', 'meta[name="build-date"]'],
      action: "update-meta-tags",
    });
  }

  if (exists(".env.production")) {
    additionalUpdates.push({
      file: ".env.production",
      fields: ["VITE_APP_VERSION", "REACT_APP_VERSION"],
      action: "update-env-vars",
    });
  }

  const result = {
    success: true,
    npmOutput: npmResult.output,
    version: newVersion,
    updatedByNpm: [
      "package.json",
      exists("package-lock.json") ? "package-lock.json" : null,
    ].filter(Boolean),
    additionalUpdates,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --execute ────────────────────────────────────────────────────────────────
//
// Side Effects:
//   - git add <files>
//   - git commit -m "chore(release): bump version to X.Y.Z"
//   - git tag -a vX.Y.Z -m "Release vX.Y.Z"
//   - git push origin <branch>
//   - git push origin vX.Y.Z

function execute(flags) {
  const version = flags["version"];
  const filesArg = flags["files"];

  if (!version) {
    process.stderr.write("Error: --execute requires --version X.Y.Z\n");
    process.exit(1);
  }
  if (!filesArg) {
    process.stderr.write('Error: --execute requires --files "f1,f2,f3"\n');
    process.exit(1);
  }

  const fileList = filesArg
    .split(",")
    .map((f) => f.trim().replace(/\\/g, "/"))
    .filter(Boolean);

  if (fileList.length === 0) {
    process.stderr.write("Error: --files is empty\n");
    process.exit(1);
  }

  const tag = `v${version}`;
  const steps = [];

  // Get current branch
  const branchResult = runSafe("git branch --show-current");
  const branch = branchResult.ok ? branchResult.output : "main";

  // 1. git add
  const quotedFiles = fileList.map((f) => `"${f}"`).join(" ");
  const addResult = runSafe(`git add ${quotedFiles}`);
  steps.push({
    step: "git-add",
    ok: addResult.ok,
    output: addResult.output,
    files: fileList,
  });

  if (!addResult.ok) {
    process.stderr.write(`git add failed: ${addResult.output}\n`);
    process.exit(1);
  }

  // 2. git commit
  const commitMsg = `chore(release): bump version to ${version}`;
  const escapedMsg = commitMsg.replace(/"/g, '\\"');
  const commitResult = runSafe(`git commit -m "${escapedMsg}"`);
  steps.push({
    step: "git-commit",
    ok: commitResult.ok,
    output: commitResult.output,
    message: commitMsg,
  });

  if (!commitResult.ok) {
    process.stderr.write(`git commit failed: ${commitResult.output}\n`);
    process.exit(1);
  }

  // 3. git tag
  const tagMsg = `Release ${tag}`;
  const escapedTagMsg = tagMsg.replace(/"/g, '\\"');
  const tagResult = runSafe(`git tag -a ${tag} -m "${escapedTagMsg}"`);
  steps.push({
    step: "git-tag",
    ok: tagResult.ok,
    output: tagResult.output,
    tag,
  });

  if (!tagResult.ok) {
    process.stderr.write(`git tag failed: ${tagResult.output}\n`);
    process.exit(1);
  }

  // 4. git push branch
  const pushBranchResult = runSafe(`git push origin ${branch}`);
  steps.push({
    step: "git-push-branch",
    ok: pushBranchResult.ok,
    output: pushBranchResult.output,
    branch,
  });

  // 5. git push tag
  const pushTagResult = runSafe(`git push origin ${tag}`);
  steps.push({
    step: "git-push-tag",
    ok: pushTagResult.ok,
    output: pushTagResult.output,
    tag,
  });

  const allOk = steps.every((s) => s.ok);

  const result = {
    success: allOk,
    version,
    tag,
    branch,
    steps,
  };

  if (!allOk) {
    process.stderr.write(
      `Release partially failed. Check 'steps' in output for details.\n`,
    );
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  if (!allOk) process.exit(1);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["context"] || flags["dry-run"]) {
  context();
} else if (flags["update-version"]) {
  updateVersion(flags);
} else if (flags["execute"]) {
  execute(flags);
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-release.mjs --context\n" +
      "  node flow-release.mjs --dry-run\n" +
      "  node flow-release.mjs --update-version --version X.Y.Z\n" +
      '  node flow-release.mjs --execute --version X.Y.Z --files "f1,f2,f3"\n',
  );
  process.exit(1);
}
