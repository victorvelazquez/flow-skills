#!/usr/bin/env node
/**
 * flow-skills install.mjs — Cross-platform skill manager for OpenCode
 * Node.js ESM, zero external dependencies (Windows, macOS, Linux)
 *
 * Modes:
 *   node install.mjs              Install repo → ~/.config/opencode/
 *   node install.mjs --export     Export ~/.config/opencode/ → repo
 *   node install.mjs --dry-run    Preview what would happen (no changes)
 *   node install.mjs --uninstall  Remove all flow-* files from opencode
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPENCODE_DIR = path.join(os.homedir(), ".config", "opencode");

const REPO = {
  skills: path.join(REPO_DIR, "skills"),
  commands: path.join(REPO_DIR, "commands"),
  scripts: path.join(REPO_DIR, "scripts"),
};

const OPENCODE = {
  skills: path.join(OPENCODE_DIR, "skills"),
  commands: path.join(OPENCODE_DIR, "commands"),
  scripts: path.join(OPENCODE_DIR, "scripts"),
};

// ─── Colors ───────────────────────────────────────────────────────────────────

const isWindows = process.platform === "win32";
const hasColor =
  !isWindows || process.env.WT_SESSION || process.env.TERM_PROGRAM;

const c = {
  green: (s) => (hasColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (hasColor ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (hasColor ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s) => (hasColor ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s) => (hasColor ? `\x1b[1m${s}\x1b[0m` : s),
};

const ok = (msg) => console.log(`  ${c.green("✓")} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow("!")} ${msg}`);
const info = (msg) => console.log(`  ${c.cyan("→")} ${msg}`);
const fail = (msg) => console.log(`  ${c.red("✗")} ${msg}`);
const head = (msg) => console.log(`\n${c.bold(c.cyan(msg))}`);

// ─── File Helpers ─────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest, dryRun = false) {
  ensureDir(path.dirname(dest));
  if (!dryRun) fs.copyFileSync(src, dest);
}

function removeFile(filepath, dryRun = false) {
  if (fs.existsSync(filepath)) {
    if (!dryRun) fs.unlinkSync(filepath);
    return true;
  }
  return false;
}

function removeDir(dirpath, dryRun = false) {
  if (fs.existsSync(dirpath)) {
    if (!dryRun) fs.rmSync(dirpath, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Collect all files recursively under a directory.
 * Returns array of absolute paths.
 */
function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full));
    else results.push(full);
  }
  return results;
}

/**
 * Collect flow-* skill dirs from a base skills directory.
 */
function collectFlowSkillDirs(skillsBase) {
  if (!fs.existsSync(skillsBase)) return [];
  return fs
    .readdirSync(skillsBase, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("flow-"))
    .map((e) => e.name);
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function banner(mode) {
  console.log("");
  console.log(c.cyan(c.bold("╔══════════════════════════════════════════╗")));
  console.log(c.cyan(c.bold("║          flow-skills installer           ║")));
  console.log(c.cyan(c.bold(`║  Mode: ${mode.padEnd(34)}║`)));
  console.log(c.cyan(c.bold("╚══════════════════════════════════════════╝")));
}

// ─── INSTALL: repo → opencode ─────────────────────────────────────────────────

function install(dryRun = false) {
  banner(dryRun ? "dry-run (install)" : "install");

  // Verify opencode dir exists
  if (!fs.existsSync(OPENCODE_DIR)) {
    fail(`OpenCode config not found at: ${OPENCODE_DIR}`);
    fail("Is OpenCode installed?");
    process.exit(1);
  }

  let totalFiles = 0;

  // ── Skills ──────────────────────────────────────────────────────────────────
  head("Skills");
  const skillDirs = collectFlowSkillDirs(REPO.skills);
  for (const skillName of skillDirs) {
    const srcDir = path.join(REPO.skills, skillName);
    const destDir = path.join(OPENCODE.skills, skillName);
    const files = collectFiles(srcDir);
    for (const srcFile of files) {
      const rel = path.relative(srcDir, srcFile);
      const destFile = path.join(destDir, rel);
      copyFile(srcFile, destFile, dryRun);
      totalFiles++;
    }
    ok(`${skillName} (${files.length} file${files.length > 1 ? "s" : ""})`);
  }

  // ── Commands ─────────────────────────────────────────────────────────────────
  head("Commands");
  if (fs.existsSync(REPO.commands)) {
    const cmdFiles = fs
      .readdirSync(REPO.commands)
      .filter((f) => f.startsWith("flow-") && f.endsWith(".md"));
    for (const cmdFile of cmdFiles) {
      const src = path.join(REPO.commands, cmdFile);
      const dest = path.join(OPENCODE.commands, cmdFile);
      copyFile(src, dest, dryRun);
      ok(cmdFile);
      totalFiles++;
    }
  }

  // ── Scripts ──────────────────────────────────────────────────────────────────
  head("Scripts");
  if (fs.existsSync(REPO.scripts)) {
    const scriptFiles = collectFiles(REPO.scripts);
    for (const srcFile of scriptFiles) {
      const rel = path.relative(REPO.scripts, srcFile);
      const dest = path.join(OPENCODE.scripts, rel);
      copyFile(srcFile, dest, dryRun);
      ok(rel);
      totalFiles++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("");
  if (dryRun) {
    console.log(
      c.yellow(
        c.bold(
          `  Dry-run complete — ${totalFiles} files would be installed. No changes made.`,
        ),
      ),
    );
  } else {
    console.log(
      c.green(
        c.bold(`  ✓ Done! ${totalFiles} files installed to ${OPENCODE_DIR}`),
      ),
    );
    console.log(
      `  ${c.cyan("→")} Restart OpenCode to load the updated skills.`,
    );
    console.log(`  ${c.cyan("→")} Use /flow-skills to manage updates anytime.`);
  }
  console.log("");
}

// ─── EXPORT: opencode → repo ──────────────────────────────────────────────────

function exportToRepo(dryRun = false) {
  banner(dryRun ? "dry-run (export)" : "export");

  if (!fs.existsSync(OPENCODE_DIR)) {
    fail(`OpenCode config not found at: ${OPENCODE_DIR}`);
    process.exit(1);
  }

  let totalFiles = 0;
  let changedFiles = 0;

  // ── Skills ──────────────────────────────────────────────────────────────────
  head("Skills");
  const skillDirs = collectFlowSkillDirs(OPENCODE.skills);
  for (const skillName of skillDirs) {
    const srcDir = path.join(OPENCODE.skills, skillName);
    const destDir = path.join(REPO.skills, skillName);
    const files = collectFiles(srcDir);
    let changed = 0;
    for (const srcFile of files) {
      const rel = path.relative(srcDir, srcFile);
      const destFile = path.join(destDir, rel);
      const isNew = !fs.existsSync(destFile);
      const isDiff =
        !isNew &&
        fs.readFileSync(srcFile).toString() !==
          fs.readFileSync(destFile).toString();
      if (isNew || isDiff) {
        copyFile(srcFile, destFile, dryRun);
        const relPath = path.relative(REPO_DIR, destFile).replace(/\\/g, '/');
        if (!dryRun) console.log(`  exported: ${relPath}`);
        changed++;
        changedFiles++;
      }
      totalFiles++;
    }
    if (changed > 0) {
      ok(
        `${skillName} — ${changed} file${changed > 1 ? "s" : ""} ${dryRun ? "would update" : "updated"}`,
      );
    } else {
      info(`${skillName} — no changes`);
    }
  }

  // ── Commands ─────────────────────────────────────────────────────────────────
  head("Commands");
  if (fs.existsSync(OPENCODE.commands)) {
    const cmdFiles = fs
      .readdirSync(OPENCODE.commands)
      .filter((f) => f.startsWith("flow-") && f.endsWith(".md"));
    for (const cmdFile of cmdFiles) {
      const src = path.join(OPENCODE.commands, cmdFile);
      const dest = path.join(REPO.commands, cmdFile);
      const isNew = !fs.existsSync(dest);
      const isDiff =
        !isNew &&
        fs.readFileSync(src).toString() !== fs.readFileSync(dest).toString();
      if (isNew || isDiff) {
        copyFile(src, dest, dryRun);
        ok(`${cmdFile} — ${dryRun ? "would update" : "updated"}`);
        const relPath = path.relative(REPO_DIR, dest).replace(/\\/g, '/');
        if (!dryRun) console.log(`  exported: ${relPath}`);
        changedFiles++;
      } else {
        info(`${cmdFile} — no changes`);
      }
      totalFiles++;
    }
  }

  // ── Scripts ──────────────────────────────────────────────────────────────────
  head("Scripts");
  if (fs.existsSync(OPENCODE.scripts)) {
    const scriptFiles = collectFiles(OPENCODE.scripts);
    for (const srcFile of scriptFiles) {
      const rel = path.relative(OPENCODE.scripts, srcFile);
      const dest = path.join(REPO.scripts, rel);
      const isNew = !fs.existsSync(dest);
      const isDiff =
        !isNew &&
        fs.readFileSync(srcFile).toString() !==
          fs.readFileSync(dest).toString();
      if (isNew || isDiff) {
        copyFile(srcFile, dest, dryRun);
        ok(`${rel} — ${dryRun ? "would update" : "updated"}`);
        const relPath = path.relative(REPO_DIR, dest).replace(/\\/g, '/');
        if (!dryRun) console.log(`  exported: ${relPath}`);
        changedFiles++;
      } else {
        info(`${rel} — no changes`);
      }
      totalFiles++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("");
  if (dryRun) {
    console.log(
      c.yellow(
        c.bold(
          `  Dry-run complete — ${changedFiles} of ${totalFiles} files would be exported. No changes made.`,
        ),
      ),
    );
  } else if (changedFiles === 0) {
    console.log(
      c.green(
        c.bold(`  ✓ Everything is already up to date. No files changed.`),
      ),
    );
  } else {
    console.log(
      c.green(
        c.bold(
          `  ✓ Export complete — ${changedFiles} file${changedFiles > 1 ? "s" : ""} updated in repo.`,
        ),
      ),
    );
    console.log(`  ${c.cyan("→")} Review changes with: git diff`);
    console.log(`  ${c.cyan("→")} Stage what you want: git add <file>`);
    console.log(`  ${c.cyan("→")} Discard unwanted:    git checkout -- <file>`);
    console.log(
      `  ${c.cyan("→")} Commit and push:     git commit -m "..." && git push`,
    );
  }
  console.log("");
}

// ─── UNINSTALL: remove all flow-* from opencode ───────────────────────────────

function uninstall(dryRun = false) {
  banner(dryRun ? "dry-run (uninstall)" : "uninstall");

  let removed = 0;

  // ── Skills ──────────────────────────────────────────────────────────────────
  head("Skills");
  const skillDirs = collectFlowSkillDirs(OPENCODE.skills);
  for (const skillName of skillDirs) {
    const skillDir = path.join(OPENCODE.skills, skillName);
    if (removeDir(skillDir, dryRun)) {
      ok(`${skillName} — ${dryRun ? "would remove" : "removed"}`);
      removed++;
    }
  }
  if (skillDirs.length === 0) info("No flow-* skills found");

  // ── Commands ─────────────────────────────────────────────────────────────────
  head("Commands");
  if (fs.existsSync(OPENCODE.commands)) {
    const cmdFiles = fs
      .readdirSync(OPENCODE.commands)
      .filter((f) => f.startsWith("flow-") && f.endsWith(".md"));
    for (const cmdFile of cmdFiles) {
      const dest = path.join(OPENCODE.commands, cmdFile);
      if (removeFile(dest, dryRun)) {
        ok(`${cmdFile} — ${dryRun ? "would remove" : "removed"}`);
        removed++;
      }
    }
    if (cmdFiles.length === 0) info("No flow-* commands found");
  }

  // ── Scripts ──────────────────────────────────────────────────────────────────
  head("Scripts");
  if (fs.existsSync(OPENCODE.scripts)) {
    const scriptFiles = collectFiles(OPENCODE.scripts);
    for (const srcFile of scriptFiles) {
      if (removeFile(srcFile, dryRun)) {
        const rel = path.relative(OPENCODE.scripts, srcFile);
        ok(`${rel} — ${dryRun ? "would remove" : "removed"}`);
        removed++;
      }
    }
    // Remove lib/ subdirectory if empty after removing files
    const libDir = path.join(OPENCODE.scripts, "lib");
    if (!dryRun && fs.existsSync(libDir)) {
      try {
        const remaining = fs.readdirSync(libDir);
        if (remaining.length === 0) {
          fs.rmdirSync(libDir);
        }
      } catch {
        // ignore
      }
    }
    if (scriptFiles.length === 0) info("No scripts found");
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("");
  if (dryRun) {
    console.log(
      c.yellow(
        c.bold(
          `  Dry-run complete — ${removed} items would be removed. No changes made.`,
        ),
      ),
    );
  } else {
    console.log(
      c.green(c.bold(`  ✓ Uninstall complete — ${removed} items removed.`)),
    );
  }
  console.log("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const doExport = args.includes("--export");
const doUninstall = args.includes("--uninstall");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
  ${c.bold("flow-skills installer")}

  ${c.cyan("Usage:")}
    node install.mjs              Install repo → ~/.config/opencode/
    node install.mjs --export     Export ~/.config/opencode/ → repo
    node install.mjs --dry-run    Preview changes without executing
    node install.mjs --uninstall  Remove all flow-* from opencode

  ${c.cyan("Examples:")}
    # First install on a new machine:
    git clone https://github.com/victorvelazquez/flow-skills.git
    node flow-skills/install.mjs

    # Update after git pull:
    node install.mjs

    # Publish local changes to repo:
    node install.mjs --export
    git diff
    git add <files>
    git commit -m "feat(flow-X): ..."
    git push
`);
  process.exit(0);
}

if (doUninstall) {
  uninstall(dryRun);
} else if (doExport) {
  exportToRepo(dryRun);
} else {
  install(dryRun);
}
