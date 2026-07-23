#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "flow-assets.json");
const LOCK_PATH = path.join(REPO_ROOT, "flow-assets.lock.json");
const REQUIRED_PATTERNS = [
  "agents/flow-*.md",
  "commands/flow-*.md",
  "scripts/flow-*.mjs",
  "skills/flow-*/**",
  "skills/ui-design-system/**",
];
const FORBIDDEN_SEGMENTS = new Set([
  ".atl",
  ".codegraph",
  "auth",
  "cache",
  "credentials",
  "node_modules",
  "provider",
  "receipts",
  "review-state",
  "sessions",
  "tests",
]);

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isSortedUnique(values) {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

export function validateRelativePath(relative) {
  if (typeof relative !== "string" || relative.length === 0) {
    throw new Error("Asset path must be a non-empty string.");
  }
  if (relative.includes("\\") || path.posix.isAbsolute(relative)) {
    throw new Error(`Asset path must be portable and relative: ${relative}`);
  }
  const segments = relative.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Asset path contains traversal or empty segments: ${relative}`);
  }
  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower.includes("opencode.json") || lower.some((segment) =>
    segment === ".env" || segment.startsWith(".env.") || /^(auth|credentials|provider)\./.test(segment))) {
    throw new Error(`Asset path is secret-like or configuration-owned: ${relative}`);
  }
  if (lower.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    throw new Error(`Asset path uses an excluded content root: ${relative}`);
  }
  return relative;
}

export function validateFileKind(relative, entry) {
  if (entry.isSymbolicLink()) throw new Error(`Symbolic links and reparse points are forbidden: ${relative}`);
  if (!entry.isFile() && !entry.isDirectory()) throw new Error(`Unsupported filesystem entry: ${relative}`);
}

export function validateManifest(manifest) {
  if (manifest?.$schema !== "flow-assets/v1") throw new Error("Invalid flow asset manifest schema.");
  const patterns = manifest.liveMirrored?.patterns?.map((entry) => entry.path);
  const libraries = manifest.liveMirrored?.libraries;
  if (!Array.isArray(patterns) || !Array.isArray(libraries)) throw new Error("Manifest liveMirrored ownership is incomplete.");
  if (!isSortedUnique(patterns) || JSON.stringify(patterns) !== JSON.stringify(REQUIRED_PATTERNS)) {
    throw new Error("Live mirror patterns must be the sorted approved managed domains.");
  }
  if (!isSortedUnique(libraries) || libraries.some((entry) => !entry.startsWith("scripts/lib/") || entry.includes("*"))) {
    throw new Error("Libraries must be explicit, sorted, and unique scripts/lib entries.");
  }
  if (!isSortedUnique(manifest.repoOwned) || !isSortedUnique(manifest.excluded)) {
    throw new Error("repoOwned and excluded entries must be sorted and unique.");
  }
  for (const library of libraries) validateRelativePath(library);
  const shared = manifest.liveMirrored.patterns.find((entry) => entry.path === "skills/ui-design-system/**");
  if (!shared?.reason) throw new Error("ui-design-system ownership requires a reason.");
  return manifest;
}

export function readManifest(repoRoot = REPO_ROOT) {
  return validateManifest(JSON.parse(fs.readFileSync(path.join(repoRoot, "flow-assets.json"), "utf8")));
}

function safeAbsolute(root, relative) {
  validateRelativePath(relative);
  const absolute = path.resolve(root, ...relative.split("/"));
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error(`Asset escaped its root: ${relative}`);
  return absolute;
}

function walkFiles(root, directory, output) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    validateFileKind(relative, entry);
    if (entry.isDirectory()) walkFiles(root, absolute, output);
    else output.push(relative);
  }
}

function validateManagedDirectory(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return false;
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Symbolic links and reparse points are forbidden: ${relative}`);
  if (!stat.isDirectory()) throw new Error(`Managed root is not a directory: ${relative}`);
  const real = fs.realpathSync(absolute);
  const realRoot = fs.realpathSync(root);
  if (!real.startsWith(`${realRoot}${path.sep}`)) throw new Error(`Managed root resolves outside its root: ${relative}`);
  return true;
}

export function collectManagedFiles(root, manifest) {
  const output = [];
  const collectNamed = (directory, matcher) => {
    const absolute = path.join(root, directory);
    if (!validateManagedDirectory(root, directory)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      validateFileKind(relative, entry);
      if (entry.isFile() && matcher(entry.name)) output.push(relative);
    }
  };

  collectNamed("agents", (name) => /^flow-.*\.md$/.test(name));
  collectNamed("commands", (name) => /^flow-.*\.md$/.test(name));
  collectNamed("scripts", (name) => /^flow-.*\.mjs$/.test(name));

  const skills = path.join(root, "skills");
  if (validateManagedDirectory(root, "skills")) {
    for (const entry of fs.readdirSync(skills, { withFileTypes: true })) {
      const relative = `skills/${entry.name}`;
      validateFileKind(relative, entry);
      if (entry.isDirectory() && (entry.name.startsWith("flow-") || entry.name === "ui-design-system")) {
        walkFiles(root, path.join(skills, entry.name), output);
      }
    }
  }

  for (const library of manifest.liveMirrored.libraries) {
    const absolute = safeAbsolute(root, library);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.lstatSync(absolute);
    validateFileKind(library, {
      isSymbolicLink: () => stat.isSymbolicLink(),
      isFile: () => stat.isFile(),
      isDirectory: () => stat.isDirectory(),
    });
    if (!stat.isFile()) throw new Error(`Explicit library is not a file: ${library}`);
    output.push(library);
  }

  const unique = [...new Set(output)].sort();
  for (const relative of unique) {
    validateRelativePath(relative);
    const absolute = safeAbsolute(root, relative);
    const real = fs.realpathSync(absolute);
    const realRoot = fs.realpathSync(root);
    if (!real.startsWith(`${realRoot}${path.sep}`)) throw new Error(`Asset resolves outside its root: ${relative}`);
  }
  return unique;
}

function fileRecord(root, relative) {
  const bytes = fs.readFileSync(safeAbsolute(root, relative));
  return {
    path: relative,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mode: "100644",
    executable: false,
  };
}

export function buildPlan(sourceRoot, repoRoot = REPO_ROOT, manifest = readManifest(repoRoot)) {
  const sourceFiles = collectManagedFiles(sourceRoot, manifest);
  const repoFiles = collectManagedFiles(repoRoot, manifest);
  const sourceSet = new Set(sourceFiles);
  const repoSet = new Set(repoFiles);
  const add = [];
  const change = [];
  const remove = repoFiles.filter((relative) => !sourceSet.has(relative));

  for (const relative of sourceFiles) {
    if (!repoSet.has(relative)) add.push(relative);
    else if (!fs.readFileSync(safeAbsolute(sourceRoot, relative)).equals(fs.readFileSync(safeAbsolute(repoRoot, relative)))) change.push(relative);
  }
  return { add, change, delete: remove, files: sourceFiles };
}

export function buildLock(sourceRoot, manifestBytes, plan, metadata) {
  const files = plan.files.map((relative) => fileRecord(sourceRoot, relative));
  return {
    $schema: "flow-assets-lock/v1",
    capturedAt: metadata.capturedAt,
    source: {
      kind: "opencode-user-config",
      opencodeVersion: metadata.opencodeVersion,
      gentleAiVersion: metadata.gentleAiVersion,
    },
    manifest: { sha256: sha256(manifestBytes) },
    totals: {
      bytes: files.reduce((total, entry) => total + entry.bytes, 0),
      count: files.length,
    },
    files,
  };
}

function atomicWrite(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.renameSync(temporary, target);
}

export function applyPlan(sourceRoot, repoRoot, plan, lock) {
  const transaction = path.join(repoRoot, `.flow-assets-txn-${process.pid}`);
  fs.mkdirSync(transaction);
  const touched = [...plan.change, ...plan.delete, ...(fs.existsSync(path.join(repoRoot, "flow-assets.lock.json")) ? ["flow-assets.lock.json"] : [])];
  try {
    for (const relative of touched) {
      const source = safeAbsolute(repoRoot, relative);
      if (!fs.existsSync(source)) continue;
      const backup = safeAbsolute(transaction, relative);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(source, backup);
    }
    for (const relative of [...plan.add, ...plan.change]) {
      atomicWrite(safeAbsolute(repoRoot, relative), fs.readFileSync(safeAbsolute(sourceRoot, relative)));
      fs.chmodSync(safeAbsolute(repoRoot, relative), 0o644);
    }
    for (const relative of plan.delete) fs.unlinkSync(safeAbsolute(repoRoot, relative));
    atomicWrite(path.join(repoRoot, "flow-assets.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  } catch (error) {
    for (const relative of [...plan.add, ...plan.change, ...plan.delete, "flow-assets.lock.json"]) {
      const target = safeAbsolute(repoRoot, relative);
      const backup = safeAbsolute(transaction, relative);
      if (fs.existsSync(backup)) atomicWrite(target, fs.readFileSync(backup));
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    throw error;
  } finally {
    fs.rmSync(transaction, { recursive: true, force: true });
  }
}

export function verifyLock(repoRoot = REPO_ROOT) {
  const manifestBytes = fs.readFileSync(path.join(repoRoot, "flow-assets.json"));
  const manifest = validateManifest(JSON.parse(manifestBytes));
  const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "flow-assets.lock.json"), "utf8"));
  if (lock.$schema !== "flow-assets-lock/v1") throw new Error("Invalid Flow asset lock schema.");
  if (lock.manifest.sha256 !== sha256(manifestBytes)) throw new Error("Manifest digest does not match lock.");
  if (!isSortedUnique(lock.files.map((entry) => entry.path))) throw new Error("Lock paths must be sorted and unique.");
  const managed = collectManagedFiles(repoRoot, manifest);
  if (JSON.stringify(managed) !== JSON.stringify(lock.files.map((entry) => entry.path))) throw new Error("Repository managed files do not match lock ownership.");
  for (const expected of lock.files) {
    const actual = fileRecord(repoRoot, expected.path);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Lock mismatch: ${expected.path}`);
  }
  const bytes = lock.files.reduce((total, entry) => total + entry.bytes, 0);
  if (lock.totals.count !== lock.files.length || lock.totals.bytes !== bytes) throw new Error("Lock totals are invalid.");
  return lock;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  if (args.includes("--verify")) {
    const lock = verifyLock();
    console.log(JSON.stringify({ ok: true, totals: lock.totals, lockSha256: sha256(fs.readFileSync(LOCK_PATH)) }, null, 2));
  } else {
    const source = option(args, "--source");
    if (!source) throw new Error("Usage: node tools/flow-assets.mjs --source <opencode-dir> [--apply ...] or --verify");
    const sourceRoot = path.resolve(source);
    const manifestBytes = fs.readFileSync(MANIFEST_PATH);
    const manifest = validateManifest(JSON.parse(manifestBytes));
    const plan = buildPlan(sourceRoot, REPO_ROOT, manifest);
    if (!args.includes("--apply")) console.log(JSON.stringify(plan, null, 2));
    else {
      const lock = buildLock(sourceRoot, manifestBytes, plan, {
        capturedAt: option(args, "--captured-at"),
        opencodeVersion: option(args, "--opencode-version"),
        gentleAiVersion: option(args, "--gentle-ai-version"),
      });
      if (!lock.capturedAt || !lock.source.opencodeVersion || !lock.source.gentleAiVersion) {
        throw new Error("Apply requires --captured-at, --opencode-version, and --gentle-ai-version.");
      }
      applyPlan(sourceRoot, REPO_ROOT, plan, lock);
      console.log(JSON.stringify({ plan, totals: lock.totals }, null, 2));
    }
  }
}
