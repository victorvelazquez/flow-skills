#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROTECTED_BRANCHES = new Set(["main", "master", "dev", "develop", "development"]);
const PREPARE_SCHEMA = "flow-commit/prepare-v2";
const INTENT_SCHEMA = "flow-commit/intent-v2";
const RESULT_SCHEMA = "flow-commit/result-v2";
const TITLE = /^[a-z][a-z0-9-]*\([a-z0-9][a-z0-9._/-]*\)!?: [^\r\n]+$/;
const HANDLE = /^([a-f0-9]{64})\.([a-f0-9]{64})(?:\.([a-f0-9]{64}))?$/;
const STORE_PREFIX = "flow-commit-";
const LOCK_PREFIX = "flow-commit-lock-";
const TTL_MS = 30 * 60 * 1000;
const MAX_INTENT_BYTES = 128 * 1024;
const MAX_STORE_BYTES = 16 * 1024 * 1024;
const MAX_UNITS = 100;
const MAX_PATHS = 10_000;
const MAX_TITLE_BYTES = 256;
const MAX_BODY_BYTES = 16 * 1024;
const RECOVERABLE_INTENT_ERRORS = new Set(["invalid-json", "invalid-intent", "coverage-mismatch", "invalid-branch", "protected-branch"]);

class FlowError extends Error {
  constructor(message, status = "blocked", code = "blocked") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const byteLength = (value) => Buffer.byteLength(value, "utf8");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (values) => [...new Set(values)].sort(compareText);
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => compareText(left, right)))
  : item);
const samePath = (left, right) => process.platform === "win32"
  ? path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase()
  : path.normalize(left) === path.normalize(right);

export function contentFactsFingerprint(facts) {
  return digest(canonical(facts));
}

function git(args, { cwd, env = process.env } = {}) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8", shell: false });
  return { ok: result.status === 0 && !result.error, stdout: result.stdout || "", stderr: result.stderr || result.error?.message || "" };
}

function gitValue(args, label, root) {
  const result = git(args, { cwd: root });
  if (!result.ok || !result.stdout.trim()) throw new FlowError(`Could not resolve ${label}: ${result.stderr || result.stdout}`, "blocked", "git-inspection-failed");
  return result.stdout.trim();
}

function realExisting(value, label) {
  try { return fs.realpathSync.native(path.resolve(value)); }
  catch (error) { throw new FlowError(`Could not canonicalize ${label}: ${error.message}`, "blocked", "canonical-path-failed"); }
}

function repositoryContext(cwd = process.cwd()) {
  const found = git(["rev-parse", "--show-toplevel"], { cwd });
  if (!found.ok || !found.stdout.trim()) throw new FlowError(`Could not resolve repository root: ${found.stderr || found.stdout}`, "blocked", "not-a-repository");
  const root = realExisting(found.stdout.trim(), "repository root");
  const commonValue = gitValue(["rev-parse", "--path-format=absolute", "--git-common-dir"], "Git common directory", root);
  const commonDir = realExisting(path.isAbsolute(commonValue) ? commonValue : path.join(root, commonValue), "Git common directory");
  return { root, commonDir };
}

export function parseNullDelimitedPaths(value) {
  return String(value || "").split("\0").filter(Boolean);
}

export function parsePorcelainStatus(value) {
  const fields = String(value || "").split("\0");
  const records = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field || field.length < 3 || field[2] !== " ") continue;
    const indexStatus = field[0];
    const worktreeStatus = field[1];
    const renamed = indexStatus === "R" || indexStatus === "C" || worktreeStatus === "R" || worktreeStatus === "C";
    records.push({ indexStatus, worktreeStatus, path: field.slice(3), ...(renamed ? { originalPath: fields[++index] || "" } : {}) });
  }
  return records;
}

function statusSnapshot(root) {
  const result = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root });
  if (!result.ok) throw new FlowError(`Could not inspect Git status: ${result.stderr}`, "blocked", "status-failed");
  const changes = parsePorcelainStatus(result.stdout).sort((left, right) => compareText(left.path, right.path));
  const stagedPaths = sorted(changes.filter((change) => change.indexStatus !== " " && change.indexStatus !== "?").map((change) => change.path));
  return { changes, stagedPaths };
}

function operationState(commonDir) {
  const names = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "BISECT_LOG", "BISECT_START"];
  return names.filter((name) => fs.existsSync(path.join(commonDir, name)));
}

function pathFact(root, change, onContentRead) {
  const absolute = path.resolve(root, ...change.path.split("/"));
  if (!samePath(path.dirname(absolute), root) && !absolute.startsWith(`${root}${path.sep}`)) throw new FlowError(`Git returned an unsafe repository path: ${change.path}`, "blocked", "unsafe-git-path");
  let stat;
  try { stat = fs.lstatSync(absolute); }
  catch (error) {
    if (error.code === "ENOENT") return { ...change, kind: "deleted", bytes: 0, mode: null, content: null };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    onContentRead?.({ path: change.path, kind: "symlink" });
    const target = fs.readlinkSync(absolute, { encoding: "buffer" });
    return { ...change, kind: "symlink", bytes: target.length, mode: "120000", content: digest(target) };
  }
  if (!stat.isFile()) throw new FlowError(`Changed path is not a regular file or symbolic link: ${change.path}`, "blocked", "unsupported-path-kind");
  onContentRead?.({ path: change.path, kind: "file" });
  const bytes = fs.readFileSync(absolute);
  return { ...change, kind: "file", bytes: bytes.length, mode: stat.mode & 0o111 ? "100755" : "100644", content: digest(bytes) };
}

function currentState(context = repositoryContext(), { factPaths = null, onContentRead } = {}) {
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: context.root });
  if (!branchResult.ok || !branchResult.stdout.trim()) throw new FlowError("Detached HEAD blocks Flow Commit.", "blocked", "detached-head");
  const branch = branchResult.stdout.trim();
  const head = gitValue(["rev-parse", "HEAD^{commit}"], "HEAD", context.root);
  const status = statusSnapshot(context.root);
  const operations = operationState(context.commonDir);
  const selected = factPaths === null ? status.changes : status.changes.filter((change) => factPaths.has(change.path));
  const facts = selected.map((change) => pathFact(context.root, change, onContentRead));
  const authority = factPaths === null ? {
    repositoryRoot: context.root,
    commonDir: context.commonDir,
    branch,
    head,
    indexEmpty: status.stagedPaths.length === 0,
    operations,
    changes: facts,
  } : null;
  return {
    ...context,
    branch,
    head,
    protected: PROTECTED_BRANCHES.has(branch),
    operations,
    changes: status.changes,
    stagedPaths: status.stagedPaths,
    contentFacts: facts,
    contentFingerprint: contentFactsFingerprint(facts),
    fingerprint: authority ? digest(canonical(authority)) : null,
  };
}

function ensureReady(state) {
  if (state.operations.length) throw new FlowError(`Repository operation in progress: ${state.operations.join(", ")}.`, "blocked", "operation-in-progress");
  if (state.stagedPaths.length) throw new FlowError(`The index must be empty before prepare: ${state.stagedPaths.join(", ")}.`, "blocked", "index-not-empty");
}

function tempRoot() {
  return realExisting(os.tmpdir(), "OS temporary root");
}

function exclusiveJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
}

function exclusiveBytes(file, bytes) {
  fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
}

function assertOwned(stat, label) {
  if (typeof process.getuid === "function" && typeof stat.uid === "number" && stat.uid !== process.getuid()) {
    throw new FlowError(`${label} is not owned by the current user.`, "blocked", "unsafe-temp-owner");
  }
}

function storePaths(handle, mustExist = true) {
  const match = typeof handle === "string" ? handle.match(HANDLE) : null;
  if (!match) throw new FlowError("Handle is not a valid opaque Flow Commit handle.", "blocked", "invalid-handle");
  const [, handleId, preparedDigest, sealedDigest = null] = match;
  const root = tempRoot();
  const store = path.join(root, `${STORE_PREFIX}${handleId}`);
  if (!mustExist) return { root, store, handleId, preparedDigest, sealedDigest, prepared: path.join(store, "prepared.json"), intent: path.join(store, "intent.json"), sealed: path.join(store, "sealed.json"), claim: path.join(store, "execute.claim") };
  let stat;
  try { stat = fs.lstatSync(store); }
  catch (error) {
    if (error.code === "ENOENT") throw new FlowError("Handle is missing, consumed, or expired; prepare again.", "blocked", "handle-unavailable");
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new FlowError("Handle store is not a safe directory.", "blocked", "unsafe-handle-store");
  assertOwned(stat, "Handle store");
  const canonicalStore = fs.realpathSync.native(store);
  if (!samePath(path.dirname(canonicalStore), root) || !samePath(canonicalStore, store)) throw new FlowError("Handle store escaped the OS temporary root.", "blocked", "unsafe-handle-store");
  return { root, store, handleId, preparedDigest, sealedDigest, prepared: path.join(store, "prepared.json"), intent: path.join(store, "intent.json"), sealed: path.join(store, "sealed.json"), claim: path.join(store, "execute.claim") };
}

function safeFile(file, maxBytes, allowEmpty = false) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { throw new FlowError(`Required handle file is unavailable: ${path.basename(file)}.`, "blocked", "handle-file-unavailable"); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new FlowError(`Handle file is not a regular file: ${path.basename(file)}.`, "blocked", "unsafe-handle-file");
  assertOwned(stat, "Handle file");
  if ((!allowEmpty && stat.size === 0) || stat.size > maxBytes) throw new FlowError(`Handle file has an invalid size: ${path.basename(file)}.`, "blocked", "handle-file-size");
  return fs.readFileSync(file);
}

function readJson(file, maxBytes) {
  const bytes = safeFile(file, maxBytes);
  try { return { value: JSON.parse(bytes.toString("utf8")), bytes }; }
  catch (error) { throw new FlowError(`${path.basename(file)} is invalid JSON: ${error.message}`, "blocked", "invalid-json"); }
}

function exactObject(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FlowError(`${label} must be an object.`, "blocked", "invalid-intent");
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (extras.length || missing.length) throw new FlowError(`${label} has invalid properties (missing: ${missing.join(", ") || "none"}; extra: ${extras.join(", ") || "none"}).`, "blocked", "invalid-intent");
}

function preparedError(message, code = "prepared-tamper") {
  throw new FlowError(message, "blocked", code);
}

function exactPreparedObject(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) preparedError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareText);
  const expected = [...allowed].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) preparedError(`${label} has unsupported or missing properties.`);
}

function changeFromFact(fact) {
  const { kind, bytes, mode, content, ...change } = fact;
  return change;
}

function validatePreparedChange(change, label) {
  const keys = Object.hasOwn(change || {}, "originalPath") ? ["indexStatus", "worktreeStatus", "path", "originalPath"] : ["indexStatus", "worktreeStatus", "path"];
  exactPreparedObject(change, keys, label);
  if (typeof change.indexStatus !== "string" || change.indexStatus.length !== 1 || typeof change.worktreeStatus !== "string" || change.worktreeStatus.length !== 1) preparedError(`${label} has invalid status fields.`);
  validatePath(change.path);
  if (change.originalPath !== undefined) validatePath(change.originalPath);
  return change;
}

function validatePreparedFact(fact, label) {
  const keys = Object.hasOwn(fact || {}, "originalPath")
    ? ["indexStatus", "worktreeStatus", "path", "originalPath", "kind", "bytes", "mode", "content"]
    : ["indexStatus", "worktreeStatus", "path", "kind", "bytes", "mode", "content"];
  exactPreparedObject(fact, keys, label);
  validatePreparedChange(changeFromFact(fact), label);
  if (!Number.isSafeInteger(fact.bytes) || fact.bytes < 0 || !["file", "symlink", "deleted"].includes(fact.kind)) preparedError(`${label} has invalid content metadata.`);
  if (fact.kind === "deleted") {
    if (fact.bytes !== 0 || fact.mode !== null || fact.content !== null) preparedError(`${label} has inconsistent deletion metadata.`);
  } else if (!/^[a-f0-9]{64}$/.test(fact.content) || (fact.kind === "file" ? !["100644", "100755"].includes(fact.mode) : fact.mode !== "120000")) preparedError(`${label} has inconsistent file metadata.`);
  return fact;
}

function loadPrepared(paths, now = Date.now()) {
  const bytes = safeFile(paths.prepared, MAX_STORE_BYTES);
  if (digest(bytes) !== paths.preparedDigest) preparedError("Prepared authority bytes do not match the immutable handle digest.");
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); }
  catch (error) { preparedError(`prepared.json is invalid JSON: ${error.message}`); }
  exactPreparedObject(document, ["schema", "handleId", "createdAt", "expiresAt", "root", "commonDir", "branch", "head", "protected", "fingerprint", "changes", "contentFacts"], "prepared authority");
  if (document.schema !== PREPARE_SCHEMA || document.handleId !== paths.handleId) preparedError("Prepared authority schema or handle identity is invalid.");
  if (!Number.isFinite(document.createdAt) || !Number.isFinite(document.expiresAt) || document.expiresAt <= document.createdAt || document.expiresAt - document.createdAt > TTL_MS) preparedError("Prepared authority timestamps are invalid.");
  if (document.expiresAt <= now) preparedError("Handle expired; prepare again.", "handle-expired");
  if (typeof document.root !== "string" || typeof document.commonDir !== "string" || !path.isAbsolute(document.root) || !path.isAbsolute(document.commonDir)) preparedError("Prepared repository paths are invalid.");
  const canonicalRoot = realExisting(document.root, "prepared repository root");
  const canonicalCommonDir = realExisting(document.commonDir, "prepared Git common directory");
  if (document.root !== canonicalRoot || document.commonDir !== canonicalCommonDir) preparedError("Prepared repository paths are not canonical.");
  if (typeof document.branch !== "string" || !document.branch || !/^[a-f0-9]{40,64}$/.test(document.head) || document.protected !== PROTECTED_BRANCHES.has(document.branch) || !/^[a-f0-9]{64}$/.test(document.fingerprint)) preparedError("Prepared repository identity is inconsistent.");
  if (!Array.isArray(document.changes) || !Array.isArray(document.contentFacts) || document.changes.length !== document.contentFacts.length) preparedError("Prepared change facts are invalid.");
  document.changes.forEach((change, index) => validatePreparedChange(change, `prepared change ${index + 1}`));
  document.contentFacts.forEach((fact, index) => validatePreparedFact(fact, `prepared content fact ${index + 1}`));
  if (new Set(document.changes.map((change) => change.path)).size !== document.changes.length || canonical(document.contentFacts.map(changeFromFact)) !== canonical(document.changes)) preparedError("Prepared change and content facts are inconsistent.");
  const authority = { repositoryRoot: document.root, commonDir: document.commonDir, branch: document.branch, head: document.head, indexEmpty: true, operations: [], changes: document.contentFacts };
  if (digest(canonical(authority)) !== document.fingerprint) preparedError("Prepared fingerprint is internally inconsistent.");
  return document;
}

function validatePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || path.posix.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new FlowError("Unit paths must be non-empty repository-relative literal paths.", "blocked", "invalid-intent");
  }
  if (value.split("/").some((part) => !part || part === "." || part === "..")) throw new FlowError(`Unsafe unit path: ${value}.`, "blocked", "invalid-intent");
  return value;
}

function validateBranch(branch, state) {
  if (!branch || typeof branch !== "object" || Array.isArray(branch)) throw new FlowError("Intent must include a branch action.", "blocked", "invalid-intent");
  if (branch.action === "keep") {
    exactObject(branch, ["action"], "branch");
    if (state.protected) throw new FlowError(`Protected branch '${state.branch}' requires branch creation.`, "blocked", "protected-branch");
    return { action: "keep" };
  }
  exactObject(branch, ["action", "name"], "branch");
  if (branch.action !== "create" || typeof branch.name !== "string" || !branch.name) throw new FlowError("Branch action must be keep or create with a name.", "blocked", "invalid-intent");
  const checked = git(["check-ref-format", "--branch", branch.name], { cwd: state.root });
  if (!checked.ok || checked.stdout.trim() !== branch.name) throw new FlowError(`Invalid branch name: ${branch.name}.`, "blocked", "invalid-branch");
  if (git(["show-ref", "--verify", "--quiet", `refs/heads/${branch.name}`], { cwd: state.root }).ok) throw new FlowError(`Branch '${branch.name}' already exists; choose deliberately and prepare again.`, "blocked", "branch-collision");
  return { action: "create", name: branch.name };
}

function validateIntent(document, state) {
  exactObject(document, ["schema", "branch", "units"], "intent");
  if (document.schema !== INTENT_SCHEMA) throw new FlowError(`Intent schema must be ${INTENT_SCHEMA}.`, "blocked", "invalid-intent");
  if (!Array.isArray(document.units) || document.units.length === 0 || document.units.length > MAX_UNITS) throw new FlowError(`Intent must contain 1-${MAX_UNITS} ordered units.`, "blocked", "invalid-intent");
  let pathCount = 0;
  const units = document.units.map((unit, index) => {
    const allowed = Object.hasOwn(unit || {}, "body") ? ["paths", "title", "body"] : ["paths", "title"];
    exactObject(unit, allowed, `unit ${index + 1}`);
    if (!Array.isArray(unit.paths) || unit.paths.length === 0) throw new FlowError(`Unit ${index + 1} must include paths.`, "blocked", "invalid-intent");
    const paths = unit.paths.map(validatePath);
    pathCount += paths.length;
    if (pathCount > MAX_PATHS || new Set(paths).size !== paths.length) throw new FlowError(`Unit ${index + 1} has too many or repeated paths.`, "blocked", "invalid-intent");
    if (typeof unit.title !== "string" || byteLength(unit.title) > MAX_TITLE_BYTES || !TITLE.test(unit.title)) throw new FlowError(`Unit ${index + 1} title must use type(scope): outcome or type(scope)!: outcome.`, "blocked", "invalid-intent");
    if (unit.body !== undefined && (typeof unit.body !== "string" || !unit.body || unit.body.includes("\0") || byteLength(unit.body) > MAX_BODY_BYTES)) throw new FlowError(`Unit ${index + 1} body is invalid or exceeds ${MAX_BODY_BYTES} bytes.`, "blocked", "invalid-intent");
    return { paths: sorted(paths), title: unit.title, ...(unit.body === undefined ? {} : { body: unit.body }) };
  });
  const supplied = units.flatMap((unit) => unit.paths);
  if (new Set(supplied).size !== supplied.length) throw new FlowError("Unit paths must be disjoint.", "blocked", "invalid-intent");
  const actual = state.changes.map((change) => change.path);
  const missing = actual.filter((file) => !supplied.includes(file));
  const extra = supplied.filter((file) => !actual.includes(file));
  if (missing.length || extra.length) throw new FlowError(`Unit coverage must exactly match prepared changes (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`, "blocked", "coverage-mismatch");
  return { schema: INTENT_SCHEMA, branch: validateBranch(document.branch, state), units };
}

function intentTemplate(state) {
  return {
    schema: INTENT_SCHEMA,
    branch: state.protected ? { action: "create", name: "" } : { action: "keep" },
    units: [{ paths: state.changes.map((change) => change.path), title: "" }],
  };
}

export function prepareRepository({ cwd = process.cwd(), now = Date.now(), ttlMs = TTL_MS } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > TTL_MS) throw new FlowError(`Preparation TTL must be between 1 and ${TTL_MS} milliseconds.`, "blocked", "invalid-ttl");
  const state = currentState(repositoryContext(cwd));
  ensureReady(state);
  if (state.changes.length === 0) return { schema: PREPARE_SCHEMA, status: "noop", branch: state.branch, head: state.head.slice(0, 12), protected: state.protected, changes: [] };
  const handleId = crypto.randomBytes(32).toString("hex");
  const prepared = {
    schema: PREPARE_SCHEMA,
    handleId,
    createdAt: now,
    expiresAt: now + ttlMs,
    root: state.root,
    commonDir: state.commonDir,
    branch: state.branch,
    head: state.head,
    protected: state.protected,
    fingerprint: state.fingerprint,
    changes: state.changes,
    contentFacts: state.contentFacts,
  };
  const preparedBytes = Buffer.from(`${JSON.stringify(prepared)}\n`);
  const handle = `${handleId}.${digest(preparedBytes)}`;
  const paths = storePaths(handle, false);
  fs.mkdirSync(paths.store, { mode: 0o700 });
  try {
    exclusiveBytes(paths.prepared, preparedBytes);
    exclusiveBytes(paths.intent, Buffer.from(`${JSON.stringify(intentTemplate(state), null, 2)}\n`));
  } catch (error) {
    fs.rmSync(paths.store, { recursive: true, force: true });
    throw error;
  }
  return {
    schema: PREPARE_SCHEMA,
    status: "ready",
    branch: state.branch,
    head: state.head.slice(0, 12),
    protected: state.protected,
    changes: state.changes,
    handle,
    intentPath: paths.intent,
  };
}

export function validateIntentHandle(handle, { now = Date.now() } = {}) {
  const paths = storePaths(handle);
  let preparedAccepted = false;
  try {
    if (paths.sealedDigest) throw new FlowError("A sealed execute handle cannot validate prepared intent.", "blocked", "invalid-handle");
    const prepared = loadPrepared(paths, now);
    preparedAccepted = true;
    if (fs.existsSync(paths.sealed)) throw new FlowError("Handle is already sealed; prepare again.", "blocked", "handle-sealed");
    const intentDocument = readJson(paths.intent, MAX_INTENT_BYTES);
    validateIntent(intentDocument.value, {
      root: prepared.root,
      branch: prepared.branch,
      protected: prepared.protected,
      changes: prepared.changes,
    });
    return { status: "intent-valid" };
  } catch (error) {
    if (!preparedAccepted || !RECOVERABLE_INTENT_ERRORS.has(error.code)) fs.rmSync(paths.store, { recursive: true, force: true });
    throw error;
  }
}

export function sealHandle(handle, { now = Date.now() } = {}) {
  const paths = storePaths(handle);
  try {
    if (paths.sealedDigest) throw new FlowError("A sealed execute handle cannot be sealed again.", "blocked", "invalid-handle");
    const prepared = loadPrepared(paths, now);
    if (fs.existsSync(paths.sealed)) throw new FlowError("Handle is already sealed; use its existing approval summary or prepare again.", "blocked", "handle-sealed");
    const context = repositoryContext(prepared.root);
    if (!samePath(context.root, prepared.root) || !samePath(context.commonDir, prepared.commonDir)) throw new FlowError("Repository identity drifted; prepare again.", "drift", "repository-drift");
    const state = currentState(context);
    ensureReady(state);
    if (state.fingerprint !== prepared.fingerprint) throw new FlowError("Prepared content drifted; prepare and draft again.", "drift", "content-drift");
    const intentDocument = readJson(paths.intent, MAX_INTENT_BYTES);
    const intent = validateIntent(intentDocument.value, state);
    const request = { schema: "flow-commit/request-v2", handle, preparedFingerprint: prepared.fingerprint, preparedContentFacts: prepared.contentFacts, root: prepared.root, commonDir: prepared.commonDir, branch: prepared.branch, head: prepared.head, intent };
    const requestDigest = digest(canonical(request));
    exclusiveJson(paths.sealed, { schema: "flow-commit/sealed-v2", request, requestDigest, intentDigest: digest(intentDocument.bytes) });
    return {
      schema: PREPARE_SCHEMA,
      status: "sealed",
      repository: { name: path.basename(state.root), branch: state.branch, head: state.head.slice(0, 12) },
      branch: intent.branch,
      units: intent.units.map((unit) => ({ title: unit.title, paths: unit.paths, body: unit.body === undefined ? { present: false, bytes: 0 } : { present: true, bytes: byteLength(unit.body) } })),
      counts: { commits: intent.units.length, files: state.changes.length },
      digest: requestDigest.slice(0, 12),
      executeHandle: `${handle}.${requestDigest}`,
    };
  } catch (error) {
    fs.rmSync(paths.store, { recursive: true, force: true });
    throw error;
  }
}

export function repositoryLockPath(commonDir) {
  return path.join(tempRoot(), `${LOCK_PREFIX}${digest(process.platform === "win32" ? commonDir.toLowerCase() : commonDir)}`);
}

function acquireRepositoryLock(commonDir, handle) {
  const lock = repositoryLockPath(commonDir);
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code === "EEXIST") throw new FlowError(`Repository execution lock already exists at ${lock}. If no execution is live, inspect it and remove it manually, then prepare again.`, "blocked", "repository-locked");
    throw error;
  }
  try { exclusiveJson(path.join(lock, "owner.json"), { handle, pid: process.pid, createdAt: Date.now(), commonDir }); }
  catch (error) { fs.rmSync(lock, { recursive: true, force: true }); throw error; }
  return lock;
}

function releaseRepositoryLock(lock, handle) {
  if (!lock) return;
  try {
    const owner = readJson(path.join(lock, "owner.json"), 4096).value;
    if (owner.handle !== handle) throw new FlowError("Repository lock ownership changed; lock was retained for manual recovery.", "drift", "lock-owner-drift");
    fs.rmSync(lock, { recursive: true, force: false });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function indexBytes(root) {
  const indexPath = gitValue(["rev-parse", "--path-format=absolute", "--git-path", "index"], "Git index", root);
  return { indexPath, existed: fs.existsSync(indexPath), bytes: fs.existsSync(indexPath) ? fs.readFileSync(indexPath) : Buffer.alloc(0) };
}

function indexDigest(root) {
  const snapshot = indexBytes(root);
  return `${snapshot.existed ? "1" : "0"}:${digest(snapshot.bytes)}`;
}

function restoreIndex(root, before, ownedDigests) {
  const observed = indexDigest(root);
  if (!ownedDigests.has(observed)) throw new FlowError("Index changed outside the runtime; foreign staging was preserved and automatic restoration was refused.", "drift", "foreign-index-change");
  if (before.existed) fs.writeFileSync(before.indexPath, before.bytes);
  else fs.rmSync(before.indexPath, { force: true });
}

function stagedPaths(root) {
  const result = git(["diff", "--cached", "--name-only", "-z", "HEAD", "--"], { cwd: root });
  if (!result.ok) throw new FlowError(`Could not inspect staged paths: ${result.stderr}`, "drift", "staged-paths-failed");
  return sorted(parseNullDelimitedPaths(result.stdout));
}

function assertEqualPaths(actual, expected, description) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new FlowError(`${description} (expected: ${expected.join(", ") || "none"}; actual: ${actual.join(", ") || "none"}).`, "drift", "path-drift");
}

function assertEqualChanges(actual, expected, description) {
  if (canonical(actual) !== canonical(expected)) throw new FlowError(description, "drift", "status-drift");
}

function gitCommitMessage(root, commit) {
  const result = git(["cat-file", "commit", commit], { cwd: root });
  if (!result.ok) throw new FlowError(`Could not resolve commit message: ${result.stderr || result.stdout}`, "drift", "commit-read-failed");
  const separator = result.stdout.indexOf("\n\n");
  if (separator < 0) throw new FlowError("Committed object did not contain a message.", "drift", "commit-message-invalid");
  return result.stdout.slice(separator + 2);
}

function rollbackHead(root, oldHead, createdHead) {
  if (gitValue(["rev-parse", "HEAD^{commit}"], "current HEAD", root) !== createdHead) throw new FlowError("Concurrent HEAD change was preserved; runtime commit was not rolled back.", "drift", "head-cas-rejected");
  const result = git(["update-ref", "HEAD", oldHead, createdHead], { cwd: root });
  if (!result.ok) throw new FlowError(`HEAD CAS rollback was rejected: ${result.stderr}`, "drift", "head-cas-rejected");
}

function removeBranchProvenance(root, branch) {
  git(["config", "--local", "--unset-all", `branch.${branch}.gh-merge-base`], { cwd: root });
}

function rollbackCreatedBranch(root, sourceBranch, createdBranch) {
  removeBranchProvenance(root, createdBranch);
  const switched = git(["switch", sourceBranch], { cwd: root });
  if (!switched.ok) throw new FlowError(`Created branch rollback could not restore '${sourceBranch}': ${switched.stderr}`, "drift", "branch-rollback-failed");
  const removed = git(["branch", "-D", createdBranch], { cwd: root });
  if (!removed.ok) throw new FlowError(`Created branch rollback could not remove '${createdBranch}': ${removed.stderr}`, "drift", "branch-rollback-failed");
  const stale = git(["config", "--local", "--get-all", `branch.${createdBranch}.gh-merge-base`], { cwd: root });
  if (stale.ok && stale.stdout.trim()) throw new FlowError("Created branch rollback left stale base provenance.", "drift", "branch-rollback-failed");
}

function recordBranchProvenance(root, branch, sourceBranch) {
  const key = `branch.${branch}.gh-merge-base`;
  const recorded = git(["config", "--local", "--replace-all", key, sourceBranch], { cwd: root });
  if (!recorded.ok) throw new FlowError(`Could not record branch base provenance: ${recorded.stderr}`, "blocked", "branch-provenance-failed");
  const observed = git(["config", "--local", "--get-all", key], { cwd: root });
  if (!observed.ok || observed.stdout.trim() !== sourceBranch) throw new FlowError("Branch base provenance postcondition failed.", "drift", "branch-provenance-postcondition-failed");
}

function verifyCommit(root, oldHead, createdHead, stagedTree, unit) {
  const parent = gitValue(["rev-parse", `${createdHead}^`], "commit parent", root);
  const tree = gitValue(["rev-parse", `${createdHead}^{tree}`], "commit tree", root);
  const paths = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", oldHead, createdHead], { cwd: root });
  if (!paths.ok) throw new FlowError(`Could not inspect committed paths: ${paths.stderr}`, "drift", "commit-paths-failed");
  const requested = unit.body === undefined ? unit.title : `${unit.title}\n\n${unit.body}`;
  const expectedMessage = requested.endsWith("\n") ? requested : `${requested}\n`;
  if (parent !== oldHead || tree !== stagedTree || JSON.stringify(sorted(parseNullDelimitedPaths(paths.stdout))) !== JSON.stringify(unit.paths) || gitCommitMessage(root, createdHead) !== expectedMessage) {
    throw new FlowError("Commit parent, tree, paths, or message failed observable postcondition validation.", "drift", "commit-postcondition-failed");
  }
}

function compactUnit(unit) {
  return { title: unit.title, paths: unit.paths };
}

function effects(branch = "not-attempted", worktree = { state: "unknown" }) {
  return { branch: { state: branch }, worktree };
}

function resultDocument({ status, branch = null, branchEffect = "not-attempted", completed = [], stoppedAt = null, notAttempted = [], outstandingPaths = [], leftovers = [], worktree = { state: "unknown" }, error = null, recovery = null }) {
  return {
    schema: RESULT_SCHEMA,
    status,
    branch,
    completed,
    stoppedAt,
    notAttempted,
    outstandingPaths,
    counts: { completed: completed.length, notAttempted: notAttempted.length, outstandingPaths: outstandingPaths.length, leftovers: leftovers.length },
    leftovers,
    effects: effects(branchEffect, worktree),
    ...(error ? { error } : {}),
    ...(recovery ? { recovery } : {}),
  };
}

function safeObserved(root, factPaths) {
  try {
    const state = currentState(repositoryContext(root), { factPaths });
    return { state, leftovers: state.changes.map((change) => change.path) };
  } catch { return { state: null, leftovers: [] }; }
}

function preUnitResult(request, error) {
  const notAttempted = request.intent.units.map(compactUnit);
  const outstandingPaths = sorted(request.intent.units.flatMap((unit) => unit.paths));
  const outstandingPathSet = new Set(outstandingPaths);
  const expectedFacts = request.preparedContentFacts.filter((fact) => outstandingPathSet.has(fact.path));
  const observed = safeObserved(request.root, outstandingPathSet);
  const expectedChanges = expectedFacts.map(changeFromFact);
  const worktreeChanged = observed.state && canonical(observed.state.changes) === canonical(expectedChanges) && canonical(observed.state.contentFacts) === canonical(expectedFacts) ? "unchanged" : "changed";
  return resultDocument({
    status: error.status || "failure",
    branch: observed.state?.branch || request.branch,
    notAttempted,
    outstandingPaths,
    leftovers: observed.leftovers,
    worktree: { state: worktreeChanged, ...(worktreeChanged === "changed" ? { paths: observed.leftovers } : {}) },
    error: { code: error.code || "execution-failed", message: error.message },
    recovery: "Prepare and approve a fresh handle for all outstanding paths.",
  });
}

function executeUnits(request, initialState, { onContentRead, onProvenanceRecorded } = {}) {
  const units = request.intent.units;
  const completed = [];
  let branchEffect = request.intent.branch.action === "keep" ? "kept" : "not-attempted";
  let activeIndex = null;
  let state;
  try {
    state = initialState || currentState(repositoryContext(request.root));
    if (request.intent.branch.action === "create") {
      const created = git(["switch", "-c", request.intent.branch.name], { cwd: request.root });
      if (!created.ok) throw new FlowError(`Requested branch '${request.intent.branch.name}' could not be created: ${created.stderr}`, "blocked", "branch-create-failed");
      try {
        recordBranchProvenance(request.root, request.intent.branch.name, request.branch);
        onProvenanceRecorded?.();
        state = currentState({ root: request.root, commonDir: request.commonDir }, { factPaths: new Set(), onContentRead });
        if (state.head !== request.head || state.branch !== request.intent.branch.name) throw new FlowError("Branch creation postconditions failed.", "drift", "branch-postcondition-failed");
      } catch (error) {
        rollbackCreatedBranch(request.root, request.branch, request.intent.branch.name);
        throw error;
      }
      branchEffect = "created";
    }
    let activeHead = state.head;
    const activeBranch = state.branch;
    for (let index = 0; index < units.length; index += 1) {
      activeIndex = index;
      const unit = units[index];
      const remainingPaths = sorted(units.slice(index).flatMap((candidate) => candidate.paths));
      if (index > 0 || state.contentFacts.length === 0) state = currentState({ root: request.root, commonDir: request.commonDir }, { factPaths: new Set(unit.paths), onContentRead });
      if (state.branch !== activeBranch || state.head !== activeHead || state.operations.length || state.stagedPaths.length) throw new FlowError("Repository identity or index drifted before the next unit.", "drift", "unit-precondition-drift");
      const expectedRemainingFacts = request.preparedContentFacts.filter((fact) => remainingPaths.includes(fact.path));
      assertEqualChanges(state.changes, expectedRemainingFacts.map(changeFromFact), "Worktree path/status set drifted before the next unit.");
      const expectedUnitFacts = expectedRemainingFacts.filter((fact) => unit.paths.includes(fact.path));
      const observedUnitFacts = state.contentFacts.filter((fact) => unit.paths.includes(fact.path));
      if (canonical(observedUnitFacts) !== canonical(expectedUnitFacts)) throw new FlowError("Current unit content drifted before staging.", "drift", "content-drift");
      const beforeIndex = indexBytes(request.root);
      const ownedIndexDigests = new Set([`${beforeIndex.existed ? "1" : "0"}:${digest(beforeIndex.bytes)}`]);
      let createdHead = null;
      let runtimeCreatedHead = false;
      let retained = false;
      try {
        const added = git(["add", "--all", "--", ...unit.paths], { cwd: request.root });
        if (!added.ok) throw new FlowError(`Could not stage unit paths: ${added.stderr}`, "failure", "stage-failed");
        ownedIndexDigests.add(indexDigest(request.root));
        assertEqualPaths(stagedPaths(request.root), unit.paths, "Staged paths differ from the sealed unit");
        const stagedState = currentState({ root: request.root, commonDir: request.commonDir }, { factPaths: new Set(), onContentRead });
        if (stagedState.branch !== activeBranch || stagedState.head !== activeHead || stagedState.operations.length) throw new FlowError("Repository drifted before commit hooks.", "drift", "pre-hook-drift");
        const stagedTree = gitValue(["write-tree"], "staged tree", request.root);
        const committed = git(["commit", "--cleanup=verbatim", "-m", unit.title, ...(unit.body === undefined ? [] : ["-m", unit.body])], { cwd: request.root });
        createdHead = gitValue(["rev-parse", `refs/heads/${activeBranch}`], "created commit", request.root);
        if (!committed.ok) throw new FlowError(`Git commit failed: ${committed.stderr}`, "failure", "commit-failed");
        if (stagedPaths(request.root).length === 0) ownedIndexDigests.add(indexDigest(request.root));
        runtimeCreatedHead = gitValue(["rev-parse", `${createdHead}^`], "created commit parent", request.root) === activeHead;
        if (!runtimeCreatedHead) throw new FlowError("Hook or external process moved HEAD; concurrent HEAD was preserved.", "drift", "concurrent-head");
        try {
          verifyCommit(request.root, activeHead, createdHead, stagedTree, unit);
          const after = currentState({ root: request.root, commonDir: request.commonDir }, { factPaths: new Set(), onContentRead });
          if (after.branch !== activeBranch) {
            completed.push({ oid: createdHead, title: unit.title });
            retained = true;
            activeIndex = null;
            throw new FlowError("Symbolic branch changed after hooks; completed commit was preserved.", "drift", "branch-drift");
          }
          if (after.head !== createdHead) throw new FlowError("HEAD changed after hooks.", "drift", "head-drift");
          assertEqualPaths(stagedPaths(request.root), [], "Index was not empty after commit");
          const expectedAfter = expectedRemainingFacts.filter((fact) => !unit.paths.includes(fact.path)).map(changeFromFact);
          assertEqualChanges(after.changes, expectedAfter, "Observable worktree path/status postconditions changed after hooks.");
          state = after;
        } catch (error) {
          if (!retained) rollbackHead(request.root, activeHead, createdHead);
          throw error;
        }
        completed.push({ oid: createdHead, title: unit.title });
        retained = true;
        activeHead = createdHead;
        activeIndex = null;
      } catch (error) {
        if (!retained && runtimeCreatedHead && createdHead && gitValue(["rev-parse", "HEAD^{commit}"], "current HEAD", request.root) === createdHead) rollbackHead(request.root, activeHead, createdHead);
        restoreIndex(request.root, beforeIndex, ownedIndexDigests);
        throw error;
      }
    }
    return resultDocument({ status: "success", branch: state.branch, branchEffect, completed, leftovers: [], worktree: { state: "unchanged" } });
  } catch (error) {
    const stoppedAt = activeIndex === null ? null : compactUnit(units[activeIndex]);
    const notAttempted = units.slice(activeIndex === null ? completed.length : activeIndex + 1).map(compactUnit);
    const partial = completed.length > 0 || branchEffect === "created";
    const outstandingPaths = sorted(units.slice(completed.length).flatMap((unit) => unit.paths));
    const outstandingPathSet = new Set(outstandingPaths);
    const expectedFacts = request.preparedContentFacts.filter((fact) => outstandingPathSet.has(fact.path));
    const observed = safeObserved(request.root, outstandingPathSet);
    const expectedChanges = expectedFacts.map(changeFromFact);
    const worktreeChanged = observed.state && canonical(observed.state.changes) === canonical(expectedChanges) && canonical(observed.state.contentFacts) === canonical(expectedFacts) ? "unchanged" : "changed";
    return resultDocument({
      status: partial ? "partial" : error.status || "failure",
      branch: observed.state?.branch || state?.branch || null,
      branchEffect,
      completed,
      stoppedAt,
      notAttempted,
      outstandingPaths,
      leftovers: observed.leftovers,
      worktree: { state: worktreeChanged, ...(worktreeChanged === "changed" ? { paths: observed.leftovers } : {}) },
      error: { code: error.code || "execution-failed", message: error.message },
      recovery: "Preserve completed commits and observed hook effects. Prepare and approve a fresh handle for outstanding paths.",
    });
  }
}

export function executeHandle(handle, { now = Date.now(), onContentRead, onProvenanceRecorded } = {}) {
  const paths = storePaths(handle);
  let prepared; let sealedDocument;
  try {
    prepared = loadPrepared(paths, now);
    if (!paths.sealedDigest) throw new FlowError("Execute requires the sealed approval handle.", "blocked", "handle-not-sealed");
    sealedDocument = readJson(paths.sealed, MAX_STORE_BYTES).value;
    const preparedHandle = `${paths.handleId}.${paths.preparedDigest}`;
    const request = sealedDocument.request;
    if (sealedDocument.schema !== "flow-commit/sealed-v2" || sealedDocument.requestDigest !== paths.sealedDigest || digest(canonical(request)) !== paths.sealedDigest) throw new FlowError("Sealed request integrity failed; prepare again.", "blocked", "sealed-tamper");
    if (request?.schema !== "flow-commit/request-v2" || request.handle !== preparedHandle || request.preparedFingerprint !== prepared.fingerprint || request.root !== prepared.root || request.commonDir !== prepared.commonDir || request.branch !== prepared.branch || request.head !== prepared.head || canonical(request.preparedContentFacts) !== canonical(prepared.contentFacts)) throw new FlowError("Sealed request is inconsistent with prepared authority.", "blocked", "sealed-tamper");
    if (digest(safeFile(paths.intent, MAX_INTENT_BYTES)) !== sealedDocument.intentDigest) throw new FlowError("Intent changed after sealing; prepare again.", "drift", "intent-tamper");
  } catch (error) {
    fs.rmSync(paths.store, { recursive: true, force: true });
    throw error;
  }
  let claimed = false;
  let lock = null;
  try {
    fs.writeFileSync(paths.claim, `${JSON.stringify({ handle, pid: process.pid, claimedAt: now })}\n`, { flag: "wx", mode: 0o600 });
    claimed = true;
  } catch (error) {
    return preUnitResult(sealedDocument.request, error.code === "EEXIST"
      ? new FlowError("Handle is already claimed or abandoned; prepare again.", "blocked", "handle-claimed")
      : error);
  }
  try {
    lock = acquireRepositoryLock(prepared.commonDir, handle);
    const state = currentState(repositoryContext(prepared.root), { onContentRead });
    ensureReady(state);
    if (!samePath(state.root, prepared.root) || !samePath(state.commonDir, prepared.commonDir) || state.fingerprint !== prepared.fingerprint) {
      throw new FlowError("Repository content drifted immediately before mutation; prepare again.", "drift", "content-drift");
    }
    return executeUnits(sealedDocument.request, state, { onContentRead, onProvenanceRecorded });
  } catch (error) {
    return preUnitResult(sealedDocument.request, error);
  } finally {
    let releaseError = null;
    try { releaseRepositoryLock(lock, handle); } catch (error) { releaseError = error; }
    if (claimed) fs.rmSync(paths.store, { recursive: true, force: true });
    if (releaseError) throw releaseError;
  }
}

function parseArgs(argv) {
  const flags = {};
  const valued = new Set(["handle"]);
  const boolean = new Set(["prepare", "validate-intent", "execute"]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new FlowError(`Unsupported argument: ${value}.`, "blocked", "invalid-cli");
    const key = value.slice(2);
    if (!valued.has(key) && !boolean.has(key)) throw new FlowError(`Unsupported option: --${key}.`, "blocked", "invalid-cli");
    if (Object.hasOwn(flags, key)) throw new FlowError(`Duplicate option: --${key}.`, "blocked", "invalid-cli");
    if (boolean.has(key)) flags[key] = true;
    else {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new FlowError(`Missing value for --${key}.`, "blocked", "invalid-cli");
      flags[key] = next;
    }
  }
  const operations = [flags.prepare, flags["validate-intent"], flags.execute].filter(Boolean).length;
  if (operations > 1) throw new FlowError("Choose exactly one operation: --prepare, --validate-intent, or --execute.", "blocked", "invalid-cli");
  if (flags["validate-intent"] && !flags.handle) throw new FlowError("--validate-intent requires --handle.", "blocked", "invalid-cli");
  if (flags.execute && !flags.handle) throw new FlowError("--execute requires --handle.", "blocked", "invalid-cli");
  if (operations === 0) throw new FlowError("Usage: node flow-commit.mjs --prepare [--handle <handle>] | --validate-intent --handle <handle> | --execute --handle <handle>.", "blocked", "invalid-cli");
  return flags;
}

function safeValidationMessage(error) {
  if (error.code === "invalid-cli") {
    if (/exactly one operation/i.test(error.message)) return "CLI must choose exactly one operation.";
    if (/duplicate/i.test(error.message)) return "CLI option is duplicated.";
    if (/missing value/i.test(error.message)) return "CLI option is missing its value.";
    if (/requires --handle/i.test(error.message)) return "CLI operation requires a handle value.";
    return "CLI options are invalid.";
  }
  if (error.code === "invalid-json") return "Intent document is invalid JSON.";
  if (error.code === "coverage-mismatch") return "Intent path coverage does not match the prepared changes.";
  if (error.code === "invalid-branch") return "Intent branch name violates Git branch naming rules.";
  if (error.code === "protected-branch") return "Prepared protected branch requires a create branch action.";
  if (error.code === "invalid-intent") {
    const unit = /unit (\d+)/i.exec(error.message)?.[1];
    return unit ? `Intent unit ${unit} violates strict authoring rules.` : "Intent document violates strict authoring rules.";
  }
  const rules = {
    "prepared-tamper": "Prepared authority failed integrity validation.",
    "handle-expired": "Prepared authority expired.",
    "invalid-handle": "Prepared authority handle is invalid.",
    "handle-unavailable": "Prepared authority is unavailable.",
    "unsafe-handle-store": "Prepared authority store is unsafe.",
    "unsafe-handle-file": "Prepared authority file is unsafe.",
    "unsafe-temp-owner": "Prepared authority ownership is unsafe.",
    "handle-file-unavailable": "Prepared authority file is unavailable.",
    "handle-file-size": "Prepared authority file size is invalid.",
    "handle-sealed": "Prepared authority is already sealed.",
    "branch-collision": "Intent branch is unavailable.",
  };
  return rules[error.code] || "Intent validation stopped on an unknown safety failure.";
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.prepare) return { document: flags.handle ? sealHandle(flags.handle) : prepareRepository(), exitCode: 0 };
  if (flags["validate-intent"]) return { document: validateIntentHandle(flags.handle), exitCode: 0 };
  const document = executeHandle(flags.handle);
  return { document, exitCode: document.status === "success" ? 0 : document.status === "partial" ? 2 : 1 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const { document, exitCode } = main();
    process.stdout.write(`${JSON.stringify(document)}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    const validatingIntent = process.argv.slice(2).includes("--validate-intent");
    const document = validatingIntent
      ? { status: "intent-invalid", error: { code: error.code || "runtime-failure", message: safeValidationMessage(error) }, recovery: RECOVERABLE_INTENT_ERRORS.has(error.code) ? "Correct the same intent document once and validate again." : "Start a fresh Flow Commit action." }
      : resultDocument({ status: error.status || "failure", error: { code: error.code || "runtime-failure", message: error.message }, recovery: "Prepare a fresh handle after resolving the blocker." });
    process.stdout.write(`${JSON.stringify(document)}\n`);
    process.exitCode = 1;
  }
}
