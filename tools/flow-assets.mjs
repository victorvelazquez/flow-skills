#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  const executable = Boolean(fs.statSync(safeAbsolute(root, relative)).mode & 0o111);
  return {
    path: relative,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mode: executable ? "100755" : "100644",
    executable,
  };
}

export function buildPlan(sourceRoot, repoRoot = REPO_ROOT, manifest = readManifest(repoRoot)) {
  assertDirectory(sourceRoot, "OpenCode source directory");
  assertDirectory(repoRoot, "Flow skills repository");
  const sourceFiles = collectManagedFiles(sourceRoot, manifest);
  const repoFiles = collectManagedFiles(repoRoot, manifest);
  const sourceSet = new Set(sourceFiles);
  const repoSet = new Set(repoFiles);
  const add = [];
  const change = [];
  const remove = repoFiles.filter((relative) => !sourceSet.has(relative));

  for (const relative of sourceFiles) {
    if (!repoSet.has(relative)) add.push(relative);
    else if (JSON.stringify(fileRecord(sourceRoot, relative)) !== JSON.stringify(fileRecord(repoRoot, relative))) change.push(relative);
  }
  const operations = [
    ...add.map((relative) => ({ action: "add", path: relative })),
    ...change.map((relative) => ({ action: "change", path: relative })),
    ...remove.map((relative) => ({ action: "delete", path: relative })),
  ];
  const sourceState = sourceFiles.map((relative) => fileRecord(sourceRoot, relative));
  const destinationState = repoFiles.map((relative) => fileRecord(repoRoot, relative));
  const manifestBytes = fs.readFileSync(path.join(repoRoot, "flow-assets.json"));
  const lockPath = path.join(repoRoot, "flow-assets.lock.json");
  const identity = {
    schema: "flow-assets-plan/v1",
    manifestSha256: sha256(manifestBytes),
    source: sourceState,
    destination: destinationState,
    destinationLock: fs.existsSync(lockPath) ? sha256(fs.readFileSync(lockPath)) : null,
    operations,
  };
  return {
    status: operations.length === 0 ? "synchronized" : "changed",
    planId: sha256(JSON.stringify(identity)),
    counts: { add: add.length, change: change.length, delete: remove.length },
    add,
    change,
    delete: remove,
    operations,
    files: sourceFiles,
    sourceState,
    destinationState,
  };
}

function assertDirectory(root, label) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`${label} not found: ${root}`);
  }
}

export function statusSnapshot(sourceRoot, repoRoot = REPO_ROOT, manifest = readManifest(repoRoot)) {
  const plan = buildPlan(sourceRoot, repoRoot, manifest);
  return {
    status: plan.status,
    synchronized: plan.operations.length === 0,
    counts: plan.counts,
  };
}

export function buildLock(sourceRoot, manifestBytes, plan, metadata) {
  const files = plan.sourceState || plan.files.map((relative) => fileRecord(sourceRoot, relative));
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

const RESTORE_PLAN_SCHEMA = "flow-assets-restore-plan/v1";
const RESTORE_BACKUP_SCHEMA = "flow-assets-restore-backup/v1";

function gitObject(repoRoot, args, options = {}) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: options.encoding, maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`${options.label || "Git object read failed"}: ${String(error.stderr || error.message).trim()}`);
  }
}

function parseTree(bytes) {
  const entries = new Map();
  const raw = bytes.subarray(0, bytes.length - (bytes.at(-1) === 0 ? 1 : 0));
  const body = raw.toString("utf8");
  if (!Buffer.from(body).equals(raw)) throw new Error("Historical tree contains a non-UTF-8 path.");
  for (const token of body.split("\0")) {
    if (!token) continue;
    const tab = token.indexOf("\t");
    const match = token.slice(0, tab).match(/^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40,64})$/);
    const relative = token.slice(tab + 1);
    if (tab < 0 || !match || !relative || entries.has(relative)) throw new Error("Historical tree contains a malformed or duplicate entry.");
    entries.set(relative, { path: relative, mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function historicalBlob(repoRoot, entry, label) {
  if (!entry) throw new Error(`Historical ${label} is missing; legacy generations cannot be restored.`);
  if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) throw new Error(`Historical ${label} has unsupported type or mode.`);
  return gitObject(repoRoot, ["cat-file", "blob", entry.oid], { label: `Cannot read historical ${label}` });
}

function isManagedPath(relative, manifest) {
  return manifest.liveMirrored.libraries.includes(relative)
    || /^agents\/flow-.*\.md$/.test(relative)
    || /^commands\/flow-.*\.md$/.test(relative)
    || /^scripts\/flow-.*\.mjs$/.test(relative)
    || /^skills\/(?:flow-[^/]+|ui-design-system)\/.+/.test(relative);
}

function collectRestoreManagedFiles(root, manifest) {
  const output = [];
  const accepted = (relative) => { try { validateRelativePath(relative); return true; } catch { return false; } };
  const collectNamed = (directory, matcher) => {
    const absolute = path.join(root, directory);
    if (!validateManagedDirectory(root, directory)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (!matcher(entry.name)) continue;
      validateFileKind(relative, entry);
      if (!entry.isFile()) throw new Error(`Managed restore asset is not a file: ${relative}`);
      output.push(relative);
    }
  };
  collectNamed("agents", (name) => /^flow-.*\.md$/.test(name));
  collectNamed("commands", (name) => /^flow-.*\.md$/.test(name));
  collectNamed("scripts", (name) => /^flow-.*\.mjs$/.test(name));
  const walkOwned = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name), relative = path.relative(root, absolute).split(path.sep).join("/");
    if (!accepted(relative)) continue;
    validateFileKind(relative, entry);
    if (entry.isDirectory()) walkOwned(absolute); else output.push(relative);
  } };
  const skills = path.join(root, "skills");
  if (validateManagedDirectory(root, "skills")) for (const entry of fs.readdirSync(skills, { withFileTypes: true })) {
    if (!entry.isDirectory() || (!entry.name.startsWith("flow-") && entry.name !== "ui-design-system")) continue;
    validateFileKind(`skills/${entry.name}`, entry); walkOwned(path.join(skills, entry.name));
  }
  for (const library of manifest.liveMirrored.libraries) {
    const absolute = safeAbsolute(root, library);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.lstatSync(absolute);
    validateFileKind(library, { isSymbolicLink: () => stat.isSymbolicLink(), isFile: () => stat.isFile(), isDirectory: () => stat.isDirectory() });
    if (!stat.isFile()) throw new Error(`Explicit restore library is not a file: ${library}`);
    output.push(library);
  }
  return [...new Set(output)].sort();
}

function parseHistoricalJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`Historical ${label} is malformed JSON.`); }
}

function validateHistoricalLock(lock, manifestBytes, manifest, tree, repoRoot) {
  if (lock?.$schema !== "flow-assets-lock/v1" || !Array.isArray(lock.files) || !lock.manifest || !lock.totals) {
    throw new Error("Historical lock is malformed or has an invalid schema.");
  }
  if (lock.manifest.sha256 !== sha256(manifestBytes)) throw new Error("Historical manifest digest does not match lock.");
  const paths = lock.files.map((entry) => entry?.path);
  if (!isSortedUnique(paths)) throw new Error("Historical lock paths must be sorted and unique.");
  const owned = [...tree.values()].filter((entry) => isManagedPath(entry.path, manifest)).map((entry) => entry.path).sort();
  if (JSON.stringify(paths) !== JSON.stringify(owned)) throw new Error("Historical managed ownership does not exactly match lock paths.");
  for (const expected of lock.files) {
    validateRelativePath(expected.path);
    if (JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(["bytes", "executable", "mode", "path", "sha256"])) {
      throw new Error(`Historical lock blob record is malformed: ${expected.path}`);
    }
    if (!/^[0-9a-f]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.bytes) || expected.bytes < 0
      || !["100644", "100755"].includes(expected.mode) || expected.executable !== (expected.mode === "100755")) {
      throw new Error(`Historical lock blob record is malformed: ${expected.path}`);
    }
    const treeEntry = tree.get(expected.path);
    if (treeEntry?.type !== "blob" || treeEntry.mode !== expected.mode) throw new Error(`Historical blob record type or mode mismatch: ${expected.path}`);
    const bytes = historicalBlob(repoRoot, treeEntry, `asset ${expected.path}`);
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new Error(`Historical blob record mismatch: ${expected.path}`);
  }
  const totalBytes = lock.files.reduce((sum, entry) => sum + entry.bytes, 0);
  if (lock.totals.count !== lock.files.length || lock.totals.bytes !== totalBytes) throw new Error("Historical lock totals are invalid.");
  return lock;
}

export function readHistoricalGeneration(requestedRef, repoRoot = REPO_ROOT) {
  if (typeof requestedRef !== "string" || !requestedRef) throw new Error("Restore requires a non-empty ref.");
  const targetCommit = gitObject(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${requestedRef}^{commit}`],
    { encoding: "utf8", label: `Cannot resolve restore ref '${requestedRef}'` }).trim();
  const targetTree = gitObject(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${targetCommit}^{tree}`],
    { encoding: "utf8", label: "Cannot freeze restore target tree" }).trim();
  const tree = parseTree(gitObject(repoRoot, ["ls-tree", "-r", "-z", "--full-tree", targetTree], { label: "Cannot read historical tree" }));
  const manifestBytes = historicalBlob(repoRoot, tree.get("flow-assets.json"), "manifest");
  const lockBytes = historicalBlob(repoRoot, tree.get("flow-assets.lock.json"), "lock");
  let manifest;
  try { manifest = validateManifest(parseHistoricalJson(manifestBytes, "manifest")); }
  catch (error) { if (/JSON/.test(error.message)) throw error; throw new Error(`Historical manifest is invalid: ${error.message}`); }
  const lock = validateHistoricalLock(parseHistoricalJson(lockBytes, "lock"), manifestBytes, manifest, tree, repoRoot);
  return { requestedRef, targetCommit, targetTree, manifest, lock, tree, manifestSha256: sha256(manifestBytes), lockSha256: sha256(lockBytes) };
}

function unionManifest(current, target) {
  return { ...current, liveMirrored: { ...current.liveMirrored,
    libraries: [...new Set([...current.liveMirrored.libraries, ...target.liveMirrored.libraries])].sort() } };
}

export function buildRestorePlan({ requestedRef, destinationRoot, repoRoot = REPO_ROOT, recover = true }) {
  assertDirectory(destinationRoot, "OpenCode destination directory");
  assertDirectory(repoRoot, "Flow skills repository");
  if (recover) recoverRestoreDestination(destinationRoot);
  const target = readHistoricalGeneration(requestedRef, repoRoot);
  const currentManifestBytes = fs.readFileSync(path.join(repoRoot, "flow-assets.json"));
  const currentManifest = validateManifest(JSON.parse(currentManifestBytes));
  const ownership = unionManifest(currentManifest, target.manifest);
  const currentFiles = collectRestoreManagedFiles(destinationRoot, ownership);
  const currentState = currentFiles.map((relative) => fileRecord(destinationRoot, relative));
  const currentByPath = new Map(currentState.map((entry) => [entry.path, entry]));
  const targetByPath = new Map(target.lock.files.map((entry) => [entry.path, entry]));
  const add = target.lock.files.filter((entry) => !currentByPath.has(entry.path)).map((entry) => entry.path);
  const change = target.lock.files.filter((entry) => currentByPath.has(entry.path)
    && JSON.stringify(currentByPath.get(entry.path)) !== JSON.stringify(entry)).map((entry) => entry.path);
  const remove = currentFiles.filter((relative) => !targetByPath.has(relative));
  const operations = [...add.map((relative) => ({ action: "add", path: relative })),
    ...change.map((relative) => ({ action: "change", path: relative })),
    ...remove.map((relative) => ({ action: "delete", path: relative }))];
  const identity = { schema: RESTORE_PLAN_SCHEMA, requestedRef, targetCommit: target.targetCommit, targetTree: target.targetTree,
    targetManifestSha256: target.manifestSha256, targetLockSha256: target.lockSha256, targetFiles: target.lock.files,
    currentManifestSha256: sha256(currentManifestBytes), currentLiveState: currentState, operations, backupSchema: RESTORE_BACKUP_SCHEMA };
  const planId = sha256(JSON.stringify(identity));
  return { schema: RESTORE_PLAN_SCHEMA, planId, requestedRef, applySupported: true, backupSchema: RESTORE_BACKUP_SCHEMA,
    requiredApplyIds: { restorePlanId: planId, targetCommit: target.targetCommit, targetTree: target.targetTree },
    target: { commit: target.targetCommit, tree: target.targetTree, manifestSha256: target.manifestSha256,
      lockSha256: target.lockSha256, totals: target.lock.totals, files: target.lock.files },
    current: { manifestSha256: sha256(currentManifestBytes), files: currentState }, counts: { add: add.length, change: change.length, delete: remove.length },
    add, change, delete: remove, operations };
}

export function restoreTransactionRoot(destinationRoot) {
  return path.join(path.resolve(destinationRoot), ".flow-skills", "transactions");
}

export function inspectRestoreTransaction(destinationRoot) {
  const root = restoreTransactionRoot(destinationRoot);
  return { incomplete: fs.existsSync(path.join(root, "transaction")) || fs.existsSync(path.join(root, "apply.lock")) };
}

function assertNoSymlinkPath(absolute, label) {
  const resolved = path.resolve(absolute), root = path.parse(resolved).root; let current = root;
  for (const segment of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} contains a symlink or reparse point: ${current}`);
  }
}

function controlRoot(destinationRoot, requested, manifests, label) {
  const root = path.resolve(requested); assertNoSymlinkPath(root, label);
  const relative = path.relative(path.resolve(destinationRoot), root).split(path.sep).join("/");
  if (relative && relative !== ".." && !relative.startsWith("../")
    && manifests.some((manifest) => isManagedPath(relative, manifest) || isManagedPath(`${relative}/probe`, manifest))) {
    throw new Error(`${label} cannot be inside a manifest-managed path.`);
  }
  fs.mkdirSync(root, { recursive: true }); checkedDirectory(root); return root;
}

function acquireRestoreTransaction(destinationRoot) {
  const root = controlRoot(destinationRoot, restoreTransactionRoot(destinationRoot), [], "Restore transaction root"), lock = path.join(root, "apply.lock");
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code !== "EEXIST") throw error; checkedDirectory(lock);
    let owner; try { owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")); } catch { throw new Error("Restore apply already in progress; lock owner is unreadable."); }
    if (!Number.isInteger(owner.pid)) throw new Error("Restore apply already in progress; lock owner is invalid.");
    try { process.kill(owner.pid, 0); throw new Error("Restore apply already in progress."); }
    catch (signalError) { if (signalError.code !== "ESRCH") throw signalError; }
    fs.rmSync(lock, { recursive: true }); fs.mkdirSync(lock);
  }
  atomicWrite(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, operation: "restore" })); return { root, lock };
}

function releaseRestoreTransaction(transaction) {
  fs.rmSync(transaction.lock, { recursive: true, force: true });
  if (fs.existsSync(transaction.root) && fs.readdirSync(transaction.root).length === 0) fs.rmdirSync(transaction.root);
  const parent = path.dirname(transaction.root); if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
}

function recordMatches(actual, expected) {
  return actual.path === expected.path && actual.sha256 === expected.sha256 && actual.bytes === expected.bytes
    && (process.platform === "win32" || (actual.mode === expected.mode && actual.executable === expected.executable));
}

function verifyRecordedState(root, scopePaths, records) {
  const expected = new Map(records.map((entry) => [entry.path, entry]));
  for (const relative of scopePaths) {
    const absolute = safeAbsolute(root, relative);
    if (!expected.has(relative)) { if (fs.existsSync(absolute)) throw new Error(`Unexpected managed restore asset: ${relative}`); continue; }
    if (!fs.existsSync(absolute) || !recordMatches(fileRecord(root, relative), expected.get(relative))) throw new Error(`Restore state mismatch: ${relative}`);
  }
}

function missingRestoreParents(root, paths) {
  const missing = new Set();
  for (const relative of paths) for (let current = path.dirname(safeAbsolute(root, relative)); current !== root && current.startsWith(`${root}${path.sep}`); current = path.dirname(current)) {
    if (fs.existsSync(current)) break; missing.add(path.relative(root, current).split(path.sep).join("/"));
  }
  return [...missing].sort((a, b) => b.split("/").length - a.split("/").length);
}

function writeRestoreJournal(transaction, journal, phase, onPhase) {
  journal.phase = phase; atomicWrite(path.join(transaction, "journal.json"), JSON.stringify(journal)); onPhase?.(phase);
}

function recoverRestoreTransaction(destinationRoot, root) {
  const transaction = path.join(root, "transaction"); if (!fs.existsSync(transaction)) return false;
  checkedDirectory(transaction); const journal = JSON.parse(fs.readFileSync(path.join(transaction, "journal.json"), "utf8"));
  const phases = ["prepared", "staged", "mutating", "originals-moved", "targets-installed", "verifying", "committed"];
  if (journal.schema !== "flow-assets-restore-transaction/v1" || journal.version !== 1 || journal.operation !== "restore" || !phases.includes(journal.phase) || !Array.isArray(journal.entries)
    || !Array.isArray(journal.preState) || !Array.isArray(journal.targetState) || !Array.isArray(journal.scopePaths) || !Array.isArray(journal.createdParents)) {
    throw new Error("Invalid restore transaction journal; evidence preserved.");
  }
  if (journal.phase === "committed") verifyRecordedState(destinationRoot, journal.scopePaths, journal.targetState);
  else if (["mutating", "originals-moved", "targets-installed", "verifying"].includes(journal.phase)) {
    const pre = new Map(journal.preState.map((entry) => [entry.path, entry]));
    for (const entry of [...journal.entries].reverse()) {
      const target = checkedPath(destinationRoot, entry.path), original = checkedPath(transaction, `originals/${entry.path}`);
      if (entry.hadOriginal && fs.existsSync(original)) {
        if (fs.existsSync(target)) { const discard = checkedPath(transaction, `discard/${entry.path}`); fs.mkdirSync(path.dirname(discard), { recursive: true }); fs.renameSync(target, discard); }
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(original, target);
      } else if (entry.hadOriginal) {
        if (!fs.existsSync(target) || !recordMatches(fileRecord(destinationRoot, entry.path), pre.get(entry.path))) throw new Error(`Incomplete restore recovery; evidence preserved: ${entry.path}`);
      } else if (fs.existsSync(target)) fs.rmSync(target);
    }
    verifyRecordedState(destinationRoot, journal.scopePaths, journal.preState);
  } else verifyRecordedState(destinationRoot, journal.scopePaths, journal.preState);
  if (journal.phase !== "committed") for (const relative of journal.createdParents) {
    const directory = safeAbsolute(destinationRoot, relative); if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
  fs.rmSync(transaction, { recursive: true }); return true;
}

function recoverRestoreDestination(destinationRoot) {
  const root = restoreTransactionRoot(destinationRoot);
  if (!fs.existsSync(root) || (!fs.existsSync(path.join(root, "transaction")) && !fs.existsSync(path.join(root, "apply.lock")))) return false;
  const lock = acquireRestoreTransaction(destinationRoot);
  try { return recoverRestoreTransaction(destinationRoot, lock.root); } finally { releaseRestoreTransaction(lock); }
}

function createRestoreBackup(destinationRoot, backupRoot, manifests, plan) {
  const root = controlRoot(destinationRoot, backupRoot, manifests, "Restore backup root");
  const backupId = `restore-${new Date().toISOString().replace(/[:.]/g, "-")}-${plan.planId.slice(0, 12)}`;
  const partial = path.join(root, `.${backupId}.partial-${process.pid}`), final = path.join(root, backupId); fs.mkdirSync(partial);
  try {
    for (const entry of plan.current.files) {
      const target = checkedPath(partial, `files/${entry.path}`); fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(safeAbsolute(destinationRoot, entry.path), target); fs.chmodSync(target, entry.executable ? 0o755 : 0o644);
    }
    const backup = { $schema: "flow-assets-backup/v1", backupId, planId: plan.planId, targetCommit: plan.target.commit,
      currentManifestSha256: plan.current.manifestSha256, scopePaths: plan.current.files.map((entry) => entry.path), files: plan.current.files,
      totals: { count: plan.current.files.length, bytes: plan.current.files.reduce((sum, entry) => sum + entry.bytes, 0) } };
    atomicWrite(path.join(partial, "backup.json"), `${JSON.stringify(backup, null, 2)}\n`);
    verifyRecordedState(path.join(partial, "files"), backup.scopePaths, backup.files);
    fs.renameSync(partial, final); verifyRecordedState(path.join(final, "files"), backup.scopePaths, backup.files);
    if (JSON.stringify(JSON.parse(fs.readFileSync(path.join(final, "backup.json")))) !== JSON.stringify(backup)) throw new Error("Published restore backup metadata failed verification.");
    return { backupId, backupPath: final, backup };
  } catch (error) { fs.rmSync(partial, { recursive: true, force: true }); throw error; }
}

function assertRestoreExpected(options) {
  const plan = buildRestorePlan({ requestedRef: options.requestedRef, destinationRoot: options.destinationRoot, repoRoot: options.repoRoot, recover: false });
  if (plan.target.commit !== options.expectedTargetCommit) throw new Error(`Restore target commit changed: expected ${options.expectedTargetCommit}, current ${plan.target.commit}.`);
  if (plan.planId !== options.expectedPlanId) throw new Error(`Stale restore plan ID: expected ${options.expectedPlanId}, current ${plan.planId}.`);
  return plan;
}

function freezeRestoreTarget(generation, repoRoot) {
  return new Map(generation.lock.files.map((entry) => {
    const bytes = historicalBlob(repoRoot, generation.tree.get(entry.path), `asset ${entry.path}`);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Historical blob drifted after lock: ${entry.path}`);
    return [entry.path, bytes];
  }));
}

function verifyRestoreTarget(destinationRoot, ownership, target) {
  const paths = collectRestoreManagedFiles(destinationRoot, ownership), expected = target.lock.files.map((entry) => entry.path);
  if (JSON.stringify(paths) !== JSON.stringify(expected)) throw new Error("Final restore ownership does not exactly match target lock.");
  verifyRecordedState(destinationRoot, expected, target.lock.files); return target.lock;
}

export function applyRestore(input, extraHooks = {}) {
  const options = { repoRoot: REPO_ROOT, ...input, ...extraHooks };
  if (!options.expectedTargetCommit || !options.expectedPlanId) throw new Error("Restore apply requires --expected-target-commit and an expected plan ID.");
  let plan = assertRestoreExpected(options);
  options.validateReady?.();
  const transaction = acquireRestoreTransaction(options.destinationRoot);
  let backup, recovered = false;
  try {
    recovered = recoverRestoreTransaction(options.destinationRoot, transaction.root); options.afterRecovery?.();
    plan = assertRestoreExpected(options); options.afterLock?.(); plan = assertRestoreExpected(options);
    const generation = readHistoricalGeneration(options.requestedRef, options.repoRoot);
    if (generation.targetCommit !== plan.target.commit || generation.targetTree !== plan.target.tree) throw new Error("Restore target changed after lock.");
    const frozen = freezeRestoreTarget(generation, options.repoRoot); plan = assertRestoreExpected(options);
    const currentManifest = validateManifest(JSON.parse(fs.readFileSync(path.join(options.repoRoot, "flow-assets.json"))));
    const ownership = unionManifest(currentManifest, generation.manifest);
    plan = assertRestoreExpected(options); options.validateReady?.(); plan = assertRestoreExpected(options);
    const backupRoot = options.backupRoot ? path.resolve(options.backupRoot) : path.join(path.resolve(options.destinationRoot), ".flow-skills", "backups");
    backup = createRestoreBackup(options.destinationRoot, backupRoot, [currentManifest, generation.manifest], plan); options.afterBackup?.();
    plan = assertRestoreExpected(options);
    const directory = path.join(transaction.root, "transaction"), entries = plan.operations.map((entry) => ({ ...entry,
      hadOriginal: fs.existsSync(safeAbsolute(options.destinationRoot, entry.path)) })); fs.mkdirSync(directory);
    const journal = { schema: "flow-assets-restore-transaction/v1", version: 1, operation: "restore", planId: plan.planId,
      targetCommit: plan.target.commit, targetTree: plan.target.tree, entries, preState: plan.current.files, targetState: generation.lock.files,
      scopePaths: [...new Set([...plan.current.files.map((entry) => entry.path), ...generation.lock.files.map((entry) => entry.path)])].sort(),
      createdParents: missingRestoreParents(path.resolve(options.destinationRoot), [...plan.add, ...plan.change]) };
    writeRestoreJournal(directory, journal, "prepared", options.onPhase);
    for (const relative of [...plan.add, ...plan.change]) {
      const target = checkedPath(directory, `staged/${relative}`), expected = generation.lock.files.find((entry) => entry.path === relative);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, frozen.get(relative)); fs.chmodSync(target, expected.executable ? 0o755 : 0o644);
      if (!recordMatches({ ...fileRecord(directory, `staged/${relative}`), path: relative }, expected)) throw new Error(`Staged restore asset failed verification: ${relative}`);
    }
    writeRestoreJournal(directory, journal, "staged", options.onPhase); options.afterStaging?.(); plan = assertRestoreExpected(options);
    writeRestoreJournal(directory, journal, "mutating", options.onPhase);
    for (const entry of entries.filter((item) => item.hadOriginal)) {
      const target = checkedPath(options.destinationRoot, entry.path), original = checkedPath(directory, `originals/${entry.path}`);
      fs.mkdirSync(path.dirname(original), { recursive: true }); fs.renameSync(target, original);
    }
    writeRestoreJournal(directory, journal, "originals-moved", options.onPhase); options.afterOriginals?.();
    for (const relative of [...plan.add, ...plan.change]) {
      const target = checkedPath(options.destinationRoot, relative), staged = checkedPath(directory, `staged/${relative}`);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.renameSync(staged, target);
    }
    writeRestoreJournal(directory, journal, "targets-installed", options.onPhase); options.afterWrites?.(); options.afterDeletes?.();
    writeRestoreJournal(directory, journal, "verifying", options.onPhase);
    const verified = (options.verifyFinal || verifyRestoreTarget)(options.destinationRoot, ownership, generation);
    writeRestoreJournal(directory, journal, "committed", options.onPhase); fs.rmSync(directory, { recursive: true });
    return { ok: true, verified: true, recovered, backupId: backup.backupId, backupPath: backup.backupPath, planId: plan.planId,
      targetCommit: plan.target.commit, targetTree: plan.target.tree, counts: plan.counts, totals: verified.totals };
  } catch (error) {
    try { recoverRestoreTransaction(options.destinationRoot, transaction.root); } catch (recoveryError) { throw new AggregateError([error, recoveryError], "Restore failed and recovery evidence was preserved."); }
    throw error;
  } finally { releaseRestoreTransaction(transaction); }
}

function atomicWrite(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, target);
}

const TRANSACTION_BASE = path.join(os.tmpdir(), "flow-assets-transactions");

export function transactionRoot(repoRoot) { return path.join(TRANSACTION_BASE, sha256(fs.realpathSync(repoRoot))); }

function checkedDirectory(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true }); const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe transaction path: ${directory}`);
}

function checkedPath(root, relative) {
  const target = safeAbsolute(root, relative); let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Unsafe transaction target: ${relative}`);
  }
  return target;
}

function acquireTransaction(repoRoot) {
  checkedDirectory(TRANSACTION_BASE); const root = transactionRoot(repoRoot); checkedDirectory(root);
  const lock = path.join(root, "apply.lock");
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    checkedDirectory(lock);
    let owner; try { owner = JSON.parse(fs.readFileSync(checkedPath(lock, "owner.json"), "utf8")); } catch { throw new Error("Snapshot apply already in progress; lock owner is unreadable."); }
    if (!Number.isInteger(owner.pid)) throw new Error("Snapshot apply already in progress; lock owner is invalid.");
    let stale = false;
    try { process.kill(owner.pid, 0); } catch (signalError) { if (signalError.code === "ESRCH") stale = true; else throw new Error("Snapshot apply already in progress; lock owner cannot be checked."); }
    if (!stale) throw new Error("Snapshot apply already in progress.");
    fs.rmSync(lock, { recursive: true });
    try { fs.mkdirSync(lock); } catch { throw new Error("Snapshot apply already in progress."); }
  }
  atomicWrite(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid }));
  return { root, lock };
}

function recoverTransaction(repoRoot, root) {
  const transaction = path.join(root, "transaction"); if (!fs.existsSync(transaction)) return;
  checkedDirectory(transaction);
  const journalPath = checkedPath(transaction, "journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (journal.schema !== "flow-assets-transaction/v1" || !Array.isArray(journal.entries)) throw new Error("Invalid snapshot transaction journal; backups preserved.");
  for (const entry of journal.entries) {
    if (entry.path !== "flow-assets.lock.json") validateRelativePath(entry.path);
    const target = checkedPath(repoRoot, entry.path);
    const backup = checkedPath(transaction, `backups/${entry.path}`);
    const discard = checkedPath(transaction, `discard/${entry.path}`);
    if (fs.existsSync(backup)) {
      if (fs.existsSync(target)) { fs.mkdirSync(path.dirname(discard), { recursive: true }); fs.renameSync(target, discard); }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(backup, target);
    } else if (entry.hadOriginal && !fs.existsSync(target)) throw new Error(`Incomplete recovery backup; transaction preserved: ${entry.path}`);
    else if (!entry.hadOriginal && fs.existsSync(target)) { fs.mkdirSync(path.dirname(discard), { recursive: true }); fs.renameSync(target, discard); }
  }
  fs.rmSync(transaction, { recursive: true });
}

function releaseTransaction({ root, lock }) { fs.rmSync(lock, { recursive: true, force: true }); if (fs.existsSync(root) && fs.readdirSync(root).length === 0) fs.rmdirSync(root); }

export function applyPlan(sourceRoot, repoRoot, plan, lock, options = {}) {
  const transaction = path.join(options.transactionRoot, "transaction");
  const entries = [...plan.operations.map(({ path: assetPath }) => ({ path: assetPath, hadOriginal: fs.existsSync(safeAbsolute(repoRoot, assetPath)) })),
    { path: "flow-assets.lock.json", hadOriginal: fs.existsSync(path.join(repoRoot, "flow-assets.lock.json")) }];
  fs.mkdirSync(transaction);
  atomicWrite(path.join(transaction, "journal.json"), JSON.stringify({ schema: "flow-assets-transaction/v1", entries }));
  try {
    for (const entry of entries) {
      const target = checkedPath(repoRoot, entry.path);
      if (!entry.hadOriginal) continue;
      const backup = safeAbsolute(transaction, `backups/${entry.path}`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(target, backup);
    }
    options.afterBackup?.();
    for (const relative of [...plan.add, ...plan.change]) {
      const target = checkedPath(repoRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, options.frozen.get(relative));
      fs.chmodSync(target, plan.sourceState.find((entry) => entry.path === relative).executable ? 0o755 : 0o644);
      if (options.injectFailureAfterWrites === 1) throw new Error("Injected snapshot failure.");
    }
    fs.writeFileSync(path.join(repoRoot, "flow-assets.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
    return (options.verify || verifyLock)(repoRoot);
  } catch (error) {
    recoverTransaction(repoRoot, options.transactionRoot);
    throw error;
  }
}

export function applySnapshot({
  sourceRoot,
  repoRoot = REPO_ROOT,
  expectedPlanId,
  metadata,
  verify,
  injectFailureAfterWrites,
  ...hooks
}) {
  if (!expectedPlanId) throw new Error("Snapshot apply requires an expected plan ID.");
  const transaction = acquireTransaction(repoRoot);
  try {
    recoverTransaction(repoRoot, transaction.root);
    hooks.afterRecovery?.(); hooks.afterLock?.();
    const manifestBytes = fs.readFileSync(path.join(repoRoot, "flow-assets.json"));
    const manifest = validateManifest(JSON.parse(manifestBytes));
    let plan = buildPlan(sourceRoot, repoRoot, manifest);
    if (plan.planId !== expectedPlanId) throw new Error(`Stale plan ID: expected ${expectedPlanId}, current ${plan.planId}.`);
    hooks.afterPlan?.();
    plan = buildPlan(sourceRoot, repoRoot, manifest);
    if (plan.planId !== expectedPlanId) throw new Error("Source or destination drifted after plan acceptance.");
    const frozen = new Map(plan.files.map((relative) => [relative, fs.readFileSync(safeAbsolute(sourceRoot, relative))]));
    if (plan.sourceState.some((entry) => sha256(frozen.get(entry.path)) !== entry.sha256)) throw new Error("Source drifted while freezing the plan.");
    if (buildPlan(sourceRoot, repoRoot, manifest).planId !== expectedPlanId) throw new Error("Source or destination drifted while freezing the plan.");
    const lock = buildLock(sourceRoot, manifestBytes, plan, metadata || {});
    if (!lock.capturedAt || !lock.source.opencodeVersion || !lock.source.gentleAiVersion) throw new Error("Apply requires --captured-at, --opencode-version, and --gentle-ai-version.");
    const verifiedLock = applyPlan(sourceRoot, repoRoot, plan, lock, { verify, injectFailureAfterWrites, afterBackup: hooks.afterBackup, frozen, transactionRoot: transaction.root });
    fs.rmSync(path.join(transaction.root, "transaction"), { recursive: true });
    return { ok: true, verified: true, planId: plan.planId, plan, totals: verifiedLock.totals,
      lockSha256: sha256(fs.readFileSync(path.join(repoRoot, "flow-assets.lock.json"))) };
  } finally { releaseTransaction(transaction); }
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

function validateOptions(args, flags, values) {
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    seen.add(argument);
    if (flags.has(argument)) continue;
    if (!values.has(argument)) throw new Error(`Unsupported argument: ${argument}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${argument}.`);
    index += 1;
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  if (args.includes("--restore")) {
    validateOptions(args, new Set(["--restore", "--dry-run", "--apply"]), new Set([
      "--ref", "--destination", "--expected-target-commit", "--expected-plan-id", "--backup-root",
    ]));
    const requestedRef = option(args, "--ref");
    const destination = option(args, "--destination");
    if (!requestedRef || !destination || (args.includes("--dry-run") === args.includes("--apply"))) throw new Error("Restore requires exactly one of --dry-run or --apply.");
    const destinationRoot = path.resolve(destination);
    const result = args.includes("--apply") ? applyRestore({ requestedRef, destinationRoot,
      expectedTargetCommit: option(args, "--expected-target-commit"), expectedPlanId: option(args, "--expected-plan-id"),
      backupRoot: option(args, "--backup-root") }) : buildRestorePlan({ requestedRef, destinationRoot });
    console.log(JSON.stringify(result, null, 2));
  } else if (args.includes("--verify")) {
    if (args.length !== 1) throw new Error("--verify does not accept other arguments.");
    const lock = verifyLock();
    console.log(JSON.stringify({ ok: true, totals: lock.totals, lockSha256: sha256(fs.readFileSync(LOCK_PATH)) }, null, 2));
  } else {
    const source = option(args, "--source");
    if (!source) throw new Error("Usage: node tools/flow-assets.mjs --status --source <dir> | --snapshot --source <dir> --dry-run | --snapshot --source <dir> --apply --expected-plan-id <id> ...metadata | --restore --ref <ref> --destination <dir> --dry-run | --verify");
    const sourceRoot = path.resolve(source);
    if (args.includes("--status")) {
      validateOptions(args, new Set(["--status"]), new Set(["--source"]));
      recoverRestoreDestination(sourceRoot);
      console.log(JSON.stringify(statusSnapshot(sourceRoot), null, 2));
    } else if (args.includes("--snapshot") && args.includes("--dry-run")) {
      if (args.includes("--apply")) throw new Error("Snapshot preview cannot also apply.");
      validateOptions(args, new Set(["--snapshot", "--dry-run"]), new Set(["--source"]));
      console.log(JSON.stringify(buildPlan(sourceRoot), null, 2));
    } else if (args.includes("--snapshot") && args.includes("--apply")) {
      validateOptions(args, new Set(["--snapshot", "--apply"]), new Set([
        "--source",
        "--expected-plan-id",
        "--captured-at",
        "--opencode-version",
        "--gentle-ai-version",
      ]));
      const result = applySnapshot({
        sourceRoot,
        expectedPlanId: option(args, "--expected-plan-id"),
        metadata: {
          capturedAt: option(args, "--captured-at"),
          opencodeVersion: option(args, "--opencode-version"),
          gentleAiVersion: option(args, "--gentle-ai-version"),
        },
      });
      console.log(JSON.stringify(result, null, 2));
    } else throw new Error("Snapshot requires exactly one of --dry-run or --apply.");
  }
}
