import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { repositoryLockPath } from "../scripts/flow-commit.mjs";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "flow-commit.mjs",
);

function git(cwd, ...args) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

function repo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "fc-unstage-")));
  git(root, "init", "-q", "-b", "work");
  fs.writeFileSync(path.join(root, "a.txt"), "one\n");
  fs.writeFileSync(path.join(root, "b.txt"), "two\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { ...result, json: JSON.parse(result.stdout) };
}

const cached = (root) => git(root, "diff", "--cached", "--name-only").trim();

test("without --unstage a staged index is still refused, now with a hint", () => {
  const root = repo();
  git(root, "mv", "a.txt", "c.txt");
  const { json } = run(root, "--prepare");
  assert.equal(json.error.code, "index-not-empty");
  assert.equal(json.error.hint, "/flow-commit --unstage");
  assert.match(cached(root), /c\.txt/);
});

test("--unstage unstages a staged rename and reports both paths", () => {
  const root = repo();
  git(root, "mv", "a.txt", "c.txt");
  const { json, status } = run(root, "--prepare", "--unstage");
  assert.equal(status, 0);
  assert.equal(json.status, "ready");
  assert.deepEqual(json.unstaged, ["a.txt", "c.txt"]);
  assert.equal(cached(root), "");
  assert.equal(fs.existsSync(path.join(root, "a.txt")), false);
  assert.equal(fs.readFileSync(path.join(root, "c.txt"), "utf8"), "one\n");
  assert.deepEqual(json.changes.map((c) => c.path).sort(), ["a.txt", "c.txt"]);
});

test("--unstage keeps partially staged content in the working tree", () => {
  const root = repo();
  fs.writeFileSync(path.join(root, "a.txt"), "one\nstaged\n");
  git(root, "add", "a.txt");
  fs.writeFileSync(path.join(root, "a.txt"), "one\nstaged\nunstaged\n");
  const { json } = run(root, "--prepare", "--unstage");
  assert.deepEqual(json.unstaged, ["a.txt"]);
  assert.equal(cached(root), "");
  assert.equal(
    fs.readFileSync(path.join(root, "a.txt"), "utf8"),
    "one\nstaged\nunstaged\n",
  );
});

test("--unstage is refused during a repository operation and leaves the index alone", () => {
  const root = repo();
  git(root, "mv", "a.txt", "c.txt");
  fs.writeFileSync(path.join(root, ".git", "MERGE_HEAD"), git(root, "rev-parse", "HEAD"));
  const { json } = run(root, "--prepare", "--unstage");
  assert.equal(json.error.code, "operation-in-progress");
  assert.match(cached(root), /c\.txt/);
});

test("--unstage is refused with unresolved conflicts and leaves the index alone", () => {
  const root = repo();
  git(root, "checkout", "-q", "-b", "other");
  fs.writeFileSync(path.join(root, "a.txt"), "other\n");
  git(root, "commit", "-q", "-am", "other");
  git(root, "checkout", "-q", "work");
  fs.writeFileSync(path.join(root, "a.txt"), "work\n");
  git(root, "commit", "-q", "-am", "work");
  spawnSync("git", ["merge", "other"], { cwd: root });
  fs.rmSync(path.join(root, ".git", "MERGE_HEAD"));
  const before = git(root, "ls-files", "-u");
  assert.notEqual(before, "");
  const { json } = run(root, "--prepare", "--unstage");
  assert.equal(json.error.code, "unmerged-paths");
  assert.equal(git(root, "ls-files", "-u"), before);
});

test("--unstage is refused while another execution holds the repository lock", () => {
  const root = repo();
  git(root, "mv", "a.txt", "c.txt");
  const commonDir = fs.realpathSync(path.join(root, ".git"));
  const lock = repositoryLockPath(commonDir);
  fs.mkdirSync(lock);
  try {
    const { json } = run(root, "--prepare", "--unstage");
    assert.equal(json.error.code, "repository-locked");
    assert.match(cached(root), /c\.txt/);
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
});

test("--unstage with an empty index reports an empty list and changes nothing else", () => {
  const root = repo();
  fs.writeFileSync(path.join(root, "a.txt"), "changed\n");
  const withFlag = run(root, "--prepare", "--unstage").json;
  const without = run(root, "--prepare").json;
  assert.deepEqual(withFlag.unstaged, []);
  assert.equal(Object.hasOwn(without, "unstaged"), false);
  assert.deepEqual(withFlag.changes, without.changes);
});

test("--unstage only combines with --prepare", () => {
  const root = repo();
  const { json } = run(root, "--seal", "--handle", "x", "--unstage");
  assert.equal(json.error.code, "invalid-cli");
});
