#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROTECTED_BRANCHES = new Set(["main", "master", "dev", "develop", "development"]);
const INSPECTION_SCHEMA = "flow-commit/inspection-v1";
const REQUEST_SCHEMA = "flow-commit/request-v1";
const RESULT_SCHEMA = "flow-commit/result-v1";
const TITLE = /^[a-z][a-z0-9-]*\([a-z0-9][a-z0-9._/-]*\): [^\r\n]+$/;

class FlowError extends Error {
  constructor(message, status = "blocked") {
    super(message);
    this.status = status;
  }
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
    shell: false,
  });
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function gitValue(args, label) {
  const result = git(args);
  if (!result.ok || !result.stdout.trim()) throw new FlowError(`Could not resolve ${label}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function gitCommitMessage(commit) {
  const result = git(["cat-file", "commit", commit]);
  if (!result.ok) throw new FlowError(`Could not resolve commit message: ${result.stderr || result.stdout}`);
  const separator = result.stdout.indexOf("\n\n");
  if (separator < 0) throw new FlowError("Committed object did not contain a message.");
  return result.stdout.slice(separator + 2);
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
    const X = field[0];
    const Y = field[1];
    const renamed = X === "R" || X === "C" || Y === "R" || Y === "C";
    records.push({ X, Y, path: field.slice(3), originalPath: renamed ? fields[++index] || "" : null });
  }
  return records;
}

function mergeState() {
  const gitDir = gitValue(["rev-parse", "--git-dir"], "Git directory");
  return ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]
    .some((entry) => fs.existsSync(path.join(gitDir, entry)));
}

function statusSnapshot() {
  const result = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!result.ok) throw new FlowError(`Could not inspect Git status: ${result.stderr}`);
  const changes = parsePorcelainStatus(result.stdout).map(({ X, Y, path: file }) => ({
    path: file,
    indexStatus: X,
    worktreeStatus: Y,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const stagedPaths = changes.filter((change) => change.indexStatus !== " " && change.indexStatus !== "?")
    .map((change) => change.path).sort();
  return { changes, stagedPaths };
}

function currentState() {
  const repositoryRoot = gitValue(["rev-parse", "--show-toplevel"], "repository root");
  const branch = gitValue(["symbolic-ref", "--quiet", "--short", "HEAD"], "current branch");
  const head = gitValue(["rev-parse", "HEAD^{commit}"], "HEAD");
  const snapshot = statusSnapshot();
  return {
    repositoryRoot: path.resolve(repositoryRoot),
    branch,
    head,
    protected: PROTECTED_BRANCHES.has(branch),
    mergeState: mergeState(),
    ...snapshot,
  };
}

export function inspectRepository() {
  try {
    const state = currentState();
    return { schema: INSPECTION_SCHEMA, status: state.changes.length === 0 ? "noop" : "ready", ...state };
  } catch (error) {
    return { schema: INSPECTION_SCHEMA, status: "blocked", error: error.message, changes: [], stagedPaths: [] };
  }
}

function sorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function validatePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || path.isAbsolute(value) || value.includes("\\")) {
    throw new FlowError("Unit paths must be non-empty repository-relative literal paths.");
  }
  const normalized = value.split("/");
  if (normalized.some((part) => !part || part === "." || part === "..")) {
    throw new FlowError(`Unit path is not a safe repository-relative path: ${value}`);
  }
  return value;
}

function validateBranch(branch) {
  if (!branch || typeof branch !== "object") throw new FlowError("Request must include a branch action.");
  if (branch.action === "keep" && Object.keys(branch).every((key) => key === "action")) return branch;
  if (branch.action !== "create" || typeof branch.name !== "string" || !branch.name.trim()) {
    throw new FlowError("Branch must be { action: 'keep' } or { action: 'create', name }.");
  }
  const checked = git(["check-ref-format", "--branch", branch.name]);
  if (!checked.ok || checked.stdout.trim() !== branch.name) throw new FlowError(`Invalid branch name: ${branch.name}`);
  return { action: "create", name: branch.name };
}

function validateRequest(document, state) {
  if (!document || document.schema !== REQUEST_SCHEMA) throw new FlowError(`Request schema must be ${REQUEST_SCHEMA}.`);
  const expected = document.expected;
  if (!expected || typeof expected !== "object" || !path.isAbsolute(expected.repositoryRoot)) {
    throw new FlowError("Request expected.repositoryRoot must be an absolute repository path.");
  }
  if (path.resolve(expected.repositoryRoot) !== state.repositoryRoot) throw new FlowError("Repository root drifted since inspection.", "drift");
  if (expected.branch !== state.branch) throw new FlowError("Branch drifted since inspection.", "drift");
  if (expected.head !== state.head) throw new FlowError("HEAD drifted since inspection.", "drift");
  if (state.mergeState) throw new FlowError("Merge, rebase, cherry-pick, or revert state blocks execution.");
  if (state.stagedPaths.length > 0) throw new FlowError(`Index already contains staged paths: ${state.stagedPaths.join(", ")}. Unstage intentionally, inspect again, then retry.`);
  if (!Array.isArray(document.units) || document.units.length === 0) throw new FlowError("Request must contain one or more ordered units.");
  const units = document.units.map((unit, index) => {
    if (!unit || !Array.isArray(unit.paths) || unit.paths.length === 0) throw new FlowError(`Unit ${index + 1} must include paths.`);
    if (typeof unit.title !== "string" || !TITLE.test(unit.title)) throw new FlowError(`Unit ${index + 1} title must use type(scope): outcome.`);
    if (unit.body !== undefined && (typeof unit.body !== "string" || !unit.body || unit.body.includes("\0"))) {
      throw new FlowError(`Unit ${index + 1} body must be a non-empty text value when supplied.`);
    }
    const paths = unit.paths.map(validatePath);
    if (new Set(paths).size !== paths.length) throw new FlowError(`Unit ${index + 1} repeats a path.`);
    return { paths: sorted(paths), title: unit.title, ...(unit.body === undefined ? {} : { body: unit.body }) };
  });
  const supplied = units.flatMap((unit) => unit.paths);
  if (new Set(supplied).size !== supplied.length) throw new FlowError("Unit paths must be disjoint.");
  const actual = state.changes.map((change) => change.path);
  const missing = actual.filter((file) => !supplied.includes(file));
  const extra = supplied.filter((file) => !actual.includes(file));
  if (missing.length || extra.length) throw new FlowError(`Unit coverage must exactly match inspection changes (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`);
  const branch = validateBranch(document.branch);
  if (state.protected && branch.action !== "create") throw new FlowError(`Protected branch '${state.branch}' requires an explicit create branch action.`);
  return { units, branch, expected };
}

function indexSnapshot() {
  const indexPath = gitValue(["rev-parse", "--path-format=absolute", "--git-path", "index"], "Git index");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-index-"));
  const backupPath = path.join(tempDir, "index");
  const existed = fs.existsSync(indexPath);
  if (existed) fs.copyFileSync(indexPath, backupPath);
  return { indexPath, backupPath, tempDir, existed };
}

function restoreIndex(snapshot) {
  if (snapshot.existed) fs.copyFileSync(snapshot.backupPath, snapshot.indexPath);
  else fs.rmSync(snapshot.indexPath, { force: true });
}

function disposeIndex(snapshot) {
  fs.rmSync(snapshot.tempDir, { recursive: true, force: true });
}

function stagedPaths() {
  const result = git(["diff", "--cached", "--name-only", "-z", "HEAD", "--"]);
  if (!result.ok) throw new FlowError(`Could not inspect staged paths: ${result.stderr}`);
  return sorted(parseNullDelimitedPaths(result.stdout));
}

function assertEqualPaths(actual, expected, description) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new FlowError(`${description} (expected: ${expected.join(", ") || "none"}; actual: ${actual.join(", ") || "none"}).`, "drift");
}

function rollbackHead(oldHead, createdHead) {
  if (gitValue(["rev-parse", "HEAD^{commit}"], "current HEAD") !== createdHead) {
    throw new FlowError("Post-commit verification found a concurrent HEAD change; runtime-created commit was not rolled back.", "drift");
  }
  const result = git(["update-ref", "HEAD", oldHead, createdHead]);
  if (!result.ok) throw new FlowError(`Post-commit verification failed and HEAD CAS rollback was not applied: ${result.stderr}`, "drift");
}

function verifyCommit(oldHead, createdHead, stagedTree, unit) {
  const parent = gitValue(["rev-parse", `${createdHead}^`], "commit parent");
  const tree = gitValue(["rev-parse", `${createdHead}^{tree}`], "commit tree");
  const result = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", oldHead, createdHead]);
  if (!result.ok) throw new FlowError(`Could not inspect committed paths: ${result.stderr}`);
  const message = gitCommitMessage(createdHead);
  const requestedMessage = unit.body === undefined ? unit.title : `${unit.title}\n\n${unit.body}`;
  const expectedMessage = requestedMessage.endsWith("\n") ? requestedMessage : `${requestedMessage}\n`;
  if (parent !== oldHead || tree !== stagedTree || JSON.stringify(sorted(parseNullDelimitedPaths(result.stdout))) !== JSON.stringify(unit.paths) || message !== expectedMessage) {
    throw new FlowError("Post-commit verification found unexpected parent, tree, paths, or message.", "drift");
  }
}

function resultDocument({
  success,
  status,
  state = {},
  completedUnits = [],
  failedUnit = null,
  remainingUnits = [],
  leftovers = [],
  recovery = null,
  nextAction,
  error,
}) {
  return {
    schema: RESULT_SCHEMA,
    success,
    status,
    repository: state.repositoryRoot ?? null,
    branch: state.branch ?? null,
    completedUnits,
    failedUnit,
    remainingUnits,
    leftovers,
    recovery,
    nextAction,
    ...(error === undefined ? {} : { error }),
  };
}

function safeCurrentState() {
  try { return currentState(); } catch { return {}; }
}

export function executeRequest(document) {
  let state;
  const completedUnits = [];
  let units = [];
  try {
    state = currentState();
    const request = validateRequest(document, state);
    units = request.units;
    if (request.branch.action === "create") {
      const created = git(["switch", "-c", request.branch.name]);
      if (!created.ok) throw new FlowError(`Requested branch '${request.branch.name}' already exists or could not be created: ${created.stderr}`);
      state = currentState();
      if (state.head !== request.expected.head) throw new FlowError("HEAD drifted while creating the requested branch.", "drift");
      if (state.branch !== request.branch.name) throw new FlowError("Requested branch was not active after creation.", "drift");
    }
    let activeHead = state.head;
    const activeBranch = state.branch;
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      state = currentState();
      const remaining = sorted(units.slice(index).flatMap((candidate) => candidate.paths));
      if (state.branch !== activeBranch || state.head !== activeHead || state.mergeState || state.stagedPaths.length > 0) throw new FlowError("Repository state drifted before the next unit.", "drift");
      assertEqualPaths(state.changes.map((change) => change.path), remaining, "Worktree paths drifted before the next unit");
      const snapshot = indexSnapshot();
      let createdHead = null;
      let runtimeCreatedHead = false;
      let retainedCompletedUnit = false;
      try {
        const added = git(["add", "--all", "--", ...unit.paths]);
        if (!added.ok) throw new FlowError(`Could not stage unit paths: ${added.stderr}`);
        assertEqualPaths(stagedPaths(), unit.paths, "Staged paths differ from the requested unit");
        const stagedState = currentState();
        if (stagedState.branch !== activeBranch || stagedState.head !== activeHead || stagedState.mergeState) throw new FlowError("Repository state drifted before commit hooks.", "drift");
        const stagedTree = gitValue(["write-tree"], "staged tree");
        const committed = git(["commit", "--cleanup=verbatim", "-m", unit.title, ...(unit.body === undefined ? [] : ["-m", unit.body])]);
        createdHead = gitValue(["rev-parse", `refs/heads/${activeBranch}`], "created commit");
        if (!committed.ok) throw new FlowError(`Git commit failed: ${committed.stderr}`);
        runtimeCreatedHead = gitValue(["rev-parse", `${createdHead}^`], "created commit parent") === activeHead;
        if (!runtimeCreatedHead) throw new FlowError("Post-commit hook or external process moved HEAD; concurrent HEAD was preserved.", "drift");
        try {
          verifyCommit(activeHead, createdHead, stagedTree, unit);
          const after = currentState();
          if (after.branch !== activeBranch) {
            completedUnits.push({ oid: createdHead, paths: unit.paths, title: unit.title, ...(unit.body === undefined ? {} : { body: unit.body }) });
            retainedCompletedUnit = true;
            throw new FlowError("Active symbolic branch drifted after commit hooks; completed work was preserved.", "drift");
          }
          if (after.head !== createdHead) throw new FlowError("HEAD drifted after commit hooks.", "drift");
          assertEqualPaths(stagedPaths(), [], "Index was not empty after commit");
          assertEqualPaths(after.changes.map((change) => change.path), remaining.filter((file) => !unit.paths.includes(file)), "Worktree paths drifted after commit");
        } catch (error) {
          if (!retainedCompletedUnit) rollbackHead(activeHead, createdHead);
          throw error;
        }
        completedUnits.push({ oid: createdHead, paths: unit.paths, title: unit.title, ...(unit.body === undefined ? {} : { body: unit.body }) });
        retainedCompletedUnit = true;
        activeHead = createdHead;
      } catch (error) {
        if (!retainedCompletedUnit && runtimeCreatedHead && createdHead && gitValue(["rev-parse", "HEAD^{commit}"], "current HEAD") === createdHead) rollbackHead(activeHead, createdHead);
        restoreIndex(snapshot);
        throw error;
      } finally {
        disposeIndex(snapshot);
      }
    }
    return resultDocument({ success: true, status: "success", state: currentState(), completedUnits, nextAction: "run /flow-pr when ready" });
  } catch (error) {
    const current = safeCurrentState().repositoryRoot ? safeCurrentState() : state || {};
    const failedIndex = completedUnits.length;
    const remainingUnits = units.slice(failedIndex);
    const leftovers = current.changes ? current.changes.map((change) => change.path) : [];
    const status = completedUnits.length > 0 ? "partial" : error.status || "failure";
    const nextAction = status === "partial" ? "preserve completed commits; inspect remaining changes and submit a new request" : "inspect and submit a corrected request";
    return resultDocument({ success: false, status, state: current, completedUnits, failedUnit: remainingUnits[0] || null, remainingUnits, leftovers, recovery: nextAction, nextAction, error: error.message });
  }
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new FlowError(`Unsupported argument: ${value}`);
    const key = value.slice(2);
    if (["inspect", "execute"].includes(key)) flags[key] = true;
    else flags[key] = argv[++index];
  }
  return flags;
}

function readRequest(value) {
  if (!value) throw new FlowError("--execute requires --request <file|->.");
  const content = value === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(value, "utf8");
  try { return JSON.parse(content); } catch (error) { throw new FlowError(`Request JSON is invalid: ${error.message}`); }
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.inspect && !flags.execute) return { document: inspectRepository(), exitCode: 0 };
  if (flags.execute && !flags.inspect) {
    const document = executeRequest(readRequest(flags.request));
    return { document, exitCode: document.status === "success" ? 0 : document.status === "partial" ? 2 : 1 };
  }
  throw new FlowError("Usage: node flow-commit.mjs --inspect | --execute --request <file|->.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const { document, exitCode } = main();
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    const nextAction = "inspect repository state and submit a corrected request";
    process.stdout.write(`${JSON.stringify(resultDocument({ success: false, status: error.status || "failure", state: safeCurrentState(), recovery: nextAction, nextAction, error: error.message }), null, 2)}\n`);
    process.exitCode = 1;
  }
}
