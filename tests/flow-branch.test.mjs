import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-branch.mjs");

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
  }).trim();
}

function commit(cwd, message, file = "file.txt") {
  fs.appendFileSync(path.join(cwd, file), `${message}\n`);
  git(cwd, ["add", file]);
  git(cwd, ["commit", "-m", message]);
}

function fixture(branches = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-branch-"));
  const remote = path.join(directory, "origin.git");
  const seed = path.join(directory, "seed");
  const work = path.join(directory, "work");
  fs.mkdirSync(seed);
  git(directory, ["init", "--bare", remote]);
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.email", "test@example.test"]);
  git(seed, ["config", "user.name", "Flow Branch Test"]);
  commit(seed, "initial");
  git(seed, ["remote", "add", "origin", remote]);
  for (const branch of branches) git(seed, ["branch", branch]);
  git(seed, ["push", "--all", "origin"]);
  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(directory, ["clone", remote, work]);
  git(work, ["config", "user.email", "test@example.test"]);
  git(work, ["config", "user.name", "Flow Branch Test"]);
  return { directory, remote, seed, work };
}

function run(cwd, args, env = {}) {
  return spawnSync(process.execPath, [runtime, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LANG: "C", LC_ALL: "C", ...env },
  });
}

function result(cwd, args, env) {
  const execution = run(cwd, args, env);
  assert.ok(execution.stdout, execution.stderr);
  return { execution, json: JSON.parse(execution.stdout) };
}

test("bare invocation remains an interactive inventory", () => {
  const { work } = fixture(["development", "feature/one"]);
  const { execution, json } = result(work, ["--auto-list"]);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(json.mode, "auto-list");
  assert.equal(json.nextAction, "select-branch");
  assert.match(json.display, /development/);
  assert.match(json.instructions, /eliminar/);
  assert.ok(json.allBranches.length >= json.branches.length);
});

test("development aliases follow deterministic fallback while exact protected names never cross-fallback", () => {
  const alias = fixture(["development", "develop", "dev"]);
  for (const requested of ["dev", "develop", "development"]) {
    const { execution, json } = result(alias.work, [requested]);
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(json.branch, "development");
  }

  for (const [available, expected] of [["develop", "develop"], ["dev", "dev"]]) {
    const fallback = fixture([available]);
    const { execution, json } = result(fallback.work, ["dev"]);
    assert.equal(execution.status, 0, execution.stderr);
    assert.equal(json.branch, expected);
  }

  const exactDevelopment = fixture(["develop"]);
  let missingExact = result(exactDevelopment.work, ["development"]);
  assert.notEqual(missingExact.execution.status, 0);
  assert.match(missingExact.json.error, /not found/i);

  const protectedNames = fixture(["master"]);
  let direct = result(protectedNames.work, ["master"]);
  assert.equal(direct.execution.status, 0, direct.execution.stderr);
  assert.equal(direct.json.branch, "master");
  direct = result(protectedNames.work, ["main"]);
  assert.equal(direct.execution.status, 0, direct.execution.stderr);
  assert.equal(direct.json.branch, "main");

  const noMain = fixture(["master"]);
  git(noMain.work, ["checkout", "--track", "origin/master"]);
  git(noMain.remote, ["symbolic-ref", "HEAD", "refs/heads/master"]);
  git(noMain.remote, ["update-ref", "-d", "refs/heads/main"]);
  git(noMain.work, ["update-ref", "-d", "refs/remotes/origin/main"]);
  git(noMain.work, ["branch", "-D", "main"]);
  const missing = result(noMain.work, ["main"]);
  assert.notEqual(missing.execution.status, 0);
  assert.match(missing.json.error, /not found/i);
  assert.equal(git(noMain.work, ["branch", "--show-current"]), "master");

  const noMaster = fixture();
  missingExact = result(noMaster.work, ["master"]);
  assert.notEqual(missingExact.execution.status, 0);
  assert.match(missingExact.json.error, /not found/i);
  assert.equal(git(noMaster.work, ["branch", "--show-current"]), "main");
});

test("direct resolution prefers exact names, accepts unique prefixes, and blocks ambiguity", () => {
  const { work } = fixture(["feature/alpha", "feature/beta", "feature/beta-extra"]);
  let direct = result(work, ["feature/alph"]);
  assert.equal(direct.execution.status, 0, direct.execution.stderr);
  assert.equal(direct.json.branch, "feature/alpha");
  direct = result(work, ["feature/beta"]);
  assert.equal(direct.execution.status, 0, direct.execution.stderr);
  assert.equal(direct.json.branch, "feature/beta");
  const before = git(work, ["branch", "--show-current"]);
  direct = result(work, ["feature/b"]);
  assert.notEqual(direct.execution.status, 0);
  assert.match(direct.json.error, /ambiguous/i);
  assert.equal(git(work, ["branch", "--show-current"]), before);
});

test("direct mode fetches once and fast-forwards exactly from origin", () => {
  const { directory, seed, work } = fixture(["feature/update"]);
  git(work, ["checkout", "--track", "origin/feature/update"]);
  git(work, ["checkout", "main"]);
  git(seed, ["checkout", "feature/update"]);
  commit(seed, "remote update", "remote.txt");
  git(seed, ["push", "origin", "feature/update"]);
  const expected = git(seed, ["rev-parse", "feature/update"]);
  const trace = path.join(directory, "git-trace.log");
  const { execution, json } = result(work, ["feature/update"], { GIT_TRACE: trace });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(json.updateStrategy, "ff-only");
  assert.equal(json.updated, true);
  assert.equal(git(work, ["rev-parse", "HEAD"]), expected);
  const fetches = fs.readFileSync(trace, "utf8").split(/\r?\n/).filter((line) => /built-in: git fetch origin$/.test(line));
  assert.equal(fetches.length, 1, fs.readFileSync(trace, "utf8"));
});

test("direct mode blocks divergence before checkout", () => {
  const { seed, work } = fixture(["feature/diverged"]);
  git(work, ["checkout", "--track", "origin/feature/diverged"]);
  commit(work, "local update", "local.txt");
  git(work, ["checkout", "main"]);
  git(seed, ["checkout", "feature/diverged"]);
  commit(seed, "remote update", "remote.txt");
  git(seed, ["push", "origin", "feature/diverged"]);
  const { execution, json } = result(work, ["feature/diverged"]);
  assert.notEqual(execution.status, 0);
  assert.match(json.error, /diverged/i);
  assert.equal(git(work, ["branch", "--show-current"]), "main");
});

test("fetch failure is explicit and does not use stale refs", () => {
  const { work } = fixture(["development"]);
  git(work, ["remote", "set-url", "origin", path.join(work, "missing-origin.git")]);
  const { execution, json } = result(work, ["development"]);
  assert.notEqual(execution.status, 0);
  assert.match(json.error, /fetch from origin failed/i);
  assert.equal(git(work, ["branch", "--show-current"]), "main");
});

test("remote-only direct checkout creates the correct tracking branch", () => {
  const { work } = fixture(["feature/remote-only"]);
  const { execution, json } = result(work, ["feature/remote-only"]);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(json.updateStrategy, "tracking-checkout");
  assert.equal(git(work, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]), "origin/feature/remote-only");
});

test("dirty worktrees and branches owned by another worktree fail non-destructively", () => {
  const dirty = fixture(["feature/target"]);
  fs.writeFileSync(path.join(dirty.work, "untracked.txt"), "preserve me\n");
  let direct = result(dirty.work, ["feature/target"]);
  assert.notEqual(direct.execution.status, 0);
  assert.equal(direct.json.dirty, true);
  assert.equal(fs.readFileSync(path.join(dirty.work, "untracked.txt"), "utf8"), "preserve me\n");
  assert.equal(git(dirty.work, ["branch", "--show-current"]), "main");

  const occupied = fixture(["feature/occupied"]);
  git(occupied.work, ["branch", "feature/occupied", "origin/feature/occupied"]);
  const other = path.join(occupied.directory, "other-worktree");
  git(occupied.work, ["worktree", "add", other, "feature/occupied"]);
  direct = result(occupied.work, ["feature/occupied"]);
  assert.notEqual(direct.execution.status, 0);
  assert.match(direct.json.error, /another worktree/i);
  assert.equal(git(occupied.work, ["branch", "--show-current"]), "main");
});

test("deletion uses the full inventory and only unmerged failures request force", () => {
  const item = fixture();
  for (let index = 0; index < 12; index += 1) git(item.work, ["branch", `old/${String(index).padStart(2, "0")}`]);
  const listed = result(item.work, ["--auto-list"]).json;
  const hidden = listed.allBranches.find((entry) => entry.type === "local only" && !listed.branches.some((shown) => shown.name === entry.name));
  assert.ok(hidden, "expected a local branch outside the displayed top ten");
  let deletion = result(item.work, ["--delete", "--branch", hidden.name]);
  assert.equal(deletion.execution.status, 0, deletion.execution.stderr);
  assert.equal(deletion.json.nextAction, "done");

  commit(item.work, "main advance", "main.txt");
  git(item.work, ["checkout", "-b", "feature/unmerged", "HEAD~1"]);
  commit(item.work, "unmerged work", "unmerged.txt");
  git(item.work, ["checkout", "main"]);
  deletion = result(item.work, ["--delete", "--branch", "feature/unmerged"]);
  assert.notEqual(deletion.execution.status, 0);
  assert.equal(deletion.json.nextAction, "ask-force-delete");

  git(item.work, ["branch", "feature/occupied"]);
  const other = path.join(item.directory, "delete-worktree");
  git(item.work, ["worktree", "add", other, "feature/occupied"]);
  deletion = result(item.work, ["--delete", "--branch", "feature/occupied"]);
  assert.notEqual(deletion.execution.status, 0);
  assert.equal(deletion.json.nextAction, "error");
  assert.match(deletion.json.error, /checked out|worktree/i);
});

test("protected branches cannot be deleted", () => {
  const { work } = fixture(["development"]);
  const { execution, json } = result(work, ["--delete", "--branch", "development"]);
  assert.notEqual(execution.status, 0);
  assert.match(json.error, /protected/i);
  assert.equal(json.nextAction, "error");
});
