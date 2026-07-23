#!/usr/bin/env node

import crypto from "node:crypto";
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
    else if (!fs.readFileSync(safeAbsolute(sourceRoot, relative)).equals(fs.readFileSync(safeAbsolute(repoRoot, relative)))) change.push(relative);
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
      fs.chmodSync(target, 0o644);
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
  if (args.includes("--verify")) {
    if (args.length !== 1) throw new Error("--verify does not accept other arguments.");
    const lock = verifyLock();
    console.log(JSON.stringify({ ok: true, totals: lock.totals, lockSha256: sha256(fs.readFileSync(LOCK_PATH)) }, null, 2));
  } else {
    const source = option(args, "--source");
    if (!source) throw new Error("Usage: node tools/flow-assets.mjs --status --source <dir> | --snapshot --source <dir> --dry-run | --snapshot --source <dir> --apply --expected-plan-id <id> ...metadata | --verify");
    const sourceRoot = path.resolve(source);
    if (args.includes("--status")) {
      validateOptions(args, new Set(["--status"]), new Set(["--source"]));
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
