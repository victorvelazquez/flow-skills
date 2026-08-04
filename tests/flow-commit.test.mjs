import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contentFactsFingerprint, executeHandle, prepareRepository, repositoryLockPath, sealHandle, validateIntentHandle } from "../scripts/flow-commit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-commit.mjs");

function git(cwd, args, options = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}
function maybeGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return result.status === 0 ? result.stdout.trim() : "";
}

function repo(branch = "feat/current") {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-v2-test-"));
  git(cwd, ["init", "-q", "-b", branch]);
  git(cwd, ["config", "user.email", "flow@example.test"]);
  git(cwd, ["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git(cwd, ["add", "base.txt"]);
  git(cwd, ["commit", "-qm", "chore: initial"]);
  return cwd;
}

function run(cwd, args) {
  return spawnSync(process.execPath, [runtime, ...args], { cwd, encoding: "utf8", shell: false });
}

function output(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

function prepare(cwd) {
  const result = run(cwd, ["--prepare"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return output(result);
}

function intent(prepared, units, branch = { action: "keep" }, extra = {}) {
  const document = { schema: "flow-commit/intent-v2", branch, units, ...extra };
  fs.writeFileSync(prepared.intentPath, `${JSON.stringify(document)}\n`);
  return document;
}

function editTemplate(prepared, edit) {
  const document = JSON.parse(fs.readFileSync(prepared.intentPath, "utf8"));
  edit(document);
  fs.writeFileSync(prepared.intentPath, `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

function seal(cwd, prepared) {
  const result = run(cwd, ["--prepare", "--handle", prepared.handle]);
  return { result, output: output(result) };
}

function validate(cwd, prepared) {
  const result = run(cwd, ["--validate-intent", "--handle", prepared.handle]);
  return { result, output: output(result) };
}

function execute(cwd, prepared) {
  const result = run(cwd, ["--execute", "--handle", prepared.handle]);
  return { result, output: output(result) };
}

function ready(cwd, units, branch = { action: "keep" }) {
  const prepared = prepare(cwd);
  intent(prepared, units, branch);
  const sealed = seal(cwd, prepared);
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  return { prepared: { ...prepared, handle: sealed.output.executeHandle }, sealed: sealed.output };
}

function store(prepared) {
  return path.dirname(prepared.intentPath);
}

function changedPaths(cwd) {
  const raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd });
  const fields = raw.toString("utf8").split("\0");
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    paths.push(field.slice(3));
    if (field[0] === "R" || field[0] === "C" || field[1] === "R" || field[1] === "C") index += 1;
  }
  return paths.sort();
}

function hook(cwd, name, script) {
  const file = path.join(cwd, ".git", "hooks", name);
  fs.writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
}

function asyncRun(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [runtime, ...args], { cwd, encoding: "utf8", shell: false });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("prepare is compact, NUL-safe, and covers hostile, untracked, and deleted paths", () => {
  const cwd = repo();
  const clean = prepare(cwd);
  assert.deepEqual(clean, { schema: "flow-commit/prepare-v2", status: "noop", branch: "feat/current", head: clean.head, protected: false, changes: [] });
  const hostile = process.platform === "win32" ? " leading $(touch nope); `quoted` name.txt" : " leading $(touch nope); `quoted`\nname.txt";
  fs.writeFileSync(path.join(cwd, hostile), "literal\n");
  fs.unlinkSync(path.join(cwd, "base.txt"));
  const prepared = prepare(cwd);
  assert.equal(prepared.status, "ready");
  assert.deepEqual(prepared.changes.map((item) => item.path).sort(), changedPaths(cwd));
  assert.ok(prepared.changes.some((item) => item.path === hostile));
  assert.ok(prepared.changes.some((item) => item.path === "base.txt" && item.worktreeStatus === "D"));
  const template = JSON.parse(fs.readFileSync(prepared.intentPath, "utf8"));
  assert.deepEqual(template, {
    schema: "flow-commit/intent-v2",
    branch: { action: "keep" },
    units: [{ paths: prepared.changes.map((item) => item.path), title: "" }],
  });
  assert.match(prepared.handle, /^[a-f0-9]{64}\.[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(cwd, "nope")), false);
  for (const forbidden of ["repositoryRoot", "commonDir", "fingerprint", "snapshot", "request"]) assert.equal(Object.hasOwn(prepared, forbidden), false);
  assert.equal(JSON.stringify(prepared).includes("flow-commit/intent-v2"), false);
  assert.equal(Object.hasOwn(prepared, "units"), false);
});

test("prepare creates a pretty invalid-until-authored template with the fixed branch action", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const bytes = fs.readFileSync(prepared.intentPath);
  assert.deepEqual(JSON.parse(bytes.toString("utf8")), {
    schema: "flow-commit/intent-v2",
    branch: { action: "create", name: "" },
    units: [{ paths: ["change.txt"], title: "" }],
  });
  assert.match(bytes.toString("utf8"), /^\{\n  "schema": "flow-commit\/intent-v2",/);
  if (process.platform !== "win32") assert.equal(fs.statSync(prepared.intentPath).mode & 0o777, 0o600);
  fs.rmSync(store(prepared), { recursive: true, force: true });
});

test("validation rejects an untouched semantic template without consuming authority", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const response = validate(cwd, prepared);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "invalid-intent");
  assert.notEqual(response.output.error.code, "handle-file-size");
  assert.equal(fs.existsSync(store(prepared)), true);
});

test("targeted one-unit template edits validate, seal, and execute", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  editTemplate(prepared, (document) => {
    document.branch.name = "fix/runtime-template";
    document.units[0].title = "fix(commit): author runtime template";
  });
  assert.deepEqual(validate(cwd, prepared).output, { status: "intent-valid" });
  const sealed = seal(cwd, prepared);
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  const executed = execute(cwd, { ...prepared, handle: sealed.output.executeHandle });
  assert.equal(executed.result.status, 0, executed.result.stdout);
  assert.equal(git(cwd, ["branch", "--show-current"]), "fix/runtime-template");
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): author runtime template");
});

test("deliberate multi-unit template replacement preserves exact coverage", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const prepared = prepare(cwd);
  editTemplate(prepared, (document) => {
    document.units = [
      { paths: ["one.txt"], title: "feat(commit): author first unit" },
      { paths: ["two.txt"], title: "fix(commit): author second unit" },
    ];
  });
  assert.deepEqual(validate(cwd, prepared).output, { status: "intent-valid" });
  const sealed = seal(cwd, prepared);
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  assert.deepEqual(sealed.output.units.map((unit) => unit.paths), [["one.txt"], ["two.txt"]]);
});

test("valid intent validation is compact, repeatable, and non-consuming", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): validate without consuming" }]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = validate(cwd, prepared);
    assert.equal(response.result.status, 0, response.result.stdout);
    assert.deepEqual(response.output, { status: "intent-valid" });
    assert.equal(fs.existsSync(store(prepared)), true);
    assert.equal(fs.existsSync(path.join(store(prepared), "sealed.json")), false);
  }
});

test("invalid intent retains the same store and one correction can validate, seal, and execute", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const originalStore = store(prepared);
  intent(prepared, [{ paths: ["missing.txt"], title: "fix(commit): fail authoring validation" }]);

  const invalid = validate(cwd, prepared);
  assert.equal(invalid.result.status, 1);
  assert.equal(invalid.output.error.code, "coverage-mismatch");
  assert.equal(fs.existsSync(originalStore), true);

  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): correct same intent" }]);
  assert.deepEqual(validate(cwd, prepared).output, { status: "intent-valid" });
  assert.equal(store(prepared), originalStore);
  const sealed = seal(cwd, prepared);
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  const executed = execute(cwd, { ...prepared, handle: sealed.output.executeHandle });
  assert.equal(executed.result.status, 0, executed.result.stdout);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): correct same intent");
});

test("intent validation grants no execute authority", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): require sealed authority" }]);
  assert.deepEqual(validateIntentHandle(prepared.handle), { status: "intent-valid" });
  assert.equal(fs.existsSync(path.join(store(prepared), "sealed.json")), false);
  assert.throws(() => executeHandle(prepared.handle), (error) => error.code === "handle-not-sealed");
  assert.equal(git(cwd, ["rev-list", "--count", "HEAD"]), "1");
});

test("prepared intent validation tolerates content drift while seal remains authoritative", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "one\n");
  const prepared = prepare(cwd);
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): defer drift to seal" }]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "two\n");
  assert.deepEqual(validate(cwd, prepared).output, { status: "intent-valid" });
  const response = seal(cwd, prepared);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "content-drift");
});

test("validation fails closed for prepared tamper, expiry, and invalid handles", () => {
  const tamperRepo = repo();
  fs.writeFileSync(path.join(tamperRepo, "change.txt"), "change\n");
  let prepared = prepare(tamperRepo);
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): reject prepared tamper" }]);
  fs.appendFileSync(path.join(store(prepared), "prepared.json"), " ");
  assert.equal(validate(tamperRepo, prepared).output.error.code, "prepared-tamper");
  assert.equal(fs.existsSync(store(prepared)), false);

  const expiryRepo = repo();
  fs.writeFileSync(path.join(expiryRepo, "change.txt"), "change\n");
  prepared = prepareRepository({ cwd: expiryRepo, now: 1000, ttlMs: 10 });
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): reject expired validation" }]);
  assert.throws(() => validateIntentHandle(prepared.handle, { now: 1011 }), (error) => error.code === "handle-expired");
  assert.equal(fs.existsSync(store(prepared)), false);

  assert.equal(validate(expiryRepo, { handle: "not-a-handle" }).output.error.code, "invalid-handle");
});

test("validation rejects unsafe symbolic-link stores", { skip: process.platform === "win32" && "Windows symlink creation requires elevated fixture privileges." }, () => {
  const unsafeRepo = repo();
  fs.writeFileSync(path.join(unsafeRepo, "change.txt"), "change\n");
  const prepared = prepare(unsafeRepo);
  const unsafe = store(prepared); const moved = `${unsafe}-real`;
  fs.renameSync(unsafe, moved); fs.symlinkSync(moved, unsafe, "dir");
  assert.equal(validate(unsafeRepo, prepared).output.error.code, "unsafe-handle-store");
  fs.unlinkSync(unsafe); fs.rmSync(moved, { recursive: true, force: true });
});

test("prepared authority intent-like errors are not recoverable", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): reject overloaded error" }]);
  const preparedPath = path.join(store(prepared), "prepared.json");
  const envelope = JSON.parse(fs.readFileSync(preparedPath, "utf8"));
  envelope.changes[0].path = "../unsafe.txt";
  envelope.contentFacts[0].path = "../unsafe.txt";
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`);
  fs.writeFileSync(preparedPath, bytes);
  const forged = { ...prepared, handle: `${prepared.handle.split(".")[0]}.${crypto.createHash("sha256").update(bytes).digest("hex")}` };
  assert.equal(validate(cwd, forged).output.error.code, "invalid-intent");
  assert.equal(fs.existsSync(store(prepared)), false);
});

test("validation output does not expose intent or authority internals", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "private-name.txt"), "change\n");
  const prepared = prepare(cwd);
  const secretBody = "private body marker";
  intent(prepared, [{ paths: ["wrong-private-name.txt"], title: "fix(commit): redact validation output", body: secretBody }]);
  const response = validate(cwd, prepared);
  assert.equal(response.output.error.code, "coverage-mismatch");
  for (const forbidden of ["private-name.txt", "wrong-private-name.txt", secretBody, prepared.handle, prepared.intentPath, "prepared.json", "intent.json", "sha256", "digest"]) {
    assert.equal(response.result.stdout.includes(forbidden), false, forbidden);
  }
});

test("prepare rejects a preexisting index and repository operation without mutation", () => {
  const stagedRepo = repo();
  fs.writeFileSync(path.join(stagedRepo, "base.txt"), "staged\n");
  git(stagedRepo, ["add", "base.txt"]);
  const indexPath = git(stagedRepo, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  const before = fs.readFileSync(indexPath);
  let response = run(stagedRepo, ["--prepare"]); let document = output(response);
  assert.equal(response.status, 1);
  assert.equal(document.error.code, "index-not-empty");
  assert.deepEqual(fs.readFileSync(indexPath), before);

  const mergingRepo = repo();
  fs.writeFileSync(path.join(mergingRepo, "change.txt"), "change\n");
  fs.writeFileSync(path.join(mergingRepo, ".git", "MERGE_HEAD"), `${"0".repeat(40)}\n`);
  response = run(mergingRepo, ["--prepare"]); document = output(response);
  assert.equal(response.status, 1);
  assert.equal(document.error.code, "operation-in-progress");
  assert.deepEqual(changedPaths(mergingRepo), ["change.txt"]);
});

test("seal detects changed bytes under the same path", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "one\n");
  const prepared = prepare(cwd);
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): bind changed bytes" }]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "two\n");
  const response = seal(cwd, prepared);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "content-drift");
});

test("seal detects executable-mode and symlink-target drift", { skip: process.platform === "win32" && "Windows fixture cannot reliably create POSIX symlinks and executable modes." }, () => {
  const modeRepo = repo();
  fs.writeFileSync(path.join(modeRepo, "mode.sh"), "exit 0\n", { mode: 0o644 });
  let prepared = prepare(modeRepo);
  intent(prepared, [{ paths: ["mode.sh"], title: "fix(commit): bind executable mode" }]);
  fs.chmodSync(path.join(modeRepo, "mode.sh"), 0o755);
  assert.equal(seal(modeRepo, prepared).output.error.code, "content-drift");

  const linkRepo = repo();
  fs.writeFileSync(path.join(linkRepo, "one"), "one\n");
  fs.writeFileSync(path.join(linkRepo, "two"), "two\n");
  fs.symlinkSync("one", path.join(linkRepo, "link"));
  prepared = prepare(linkRepo);
  intent(prepared, [
    { paths: ["link", "one", "two"], title: "fix(commit): bind symlink target" },
  ]);
  fs.unlinkSync(path.join(linkRepo, "link"));
  fs.symlinkSync("two", path.join(linkRepo, "link"));
  assert.equal(seal(linkRepo, prepared).output.error.code, "content-drift");
});

test("content fingerprint binds executable mode and symlink target on every platform", () => {
  const file = { path: "tool.sh", indexStatus: " ", worktreeStatus: "M", kind: "file", bytes: 4, mode: "100644", content: "a".repeat(64) };
  const link = { path: "link", indexStatus: "?", worktreeStatus: "?", kind: "symlink", bytes: 3, mode: "120000", content: "b".repeat(64) };
  assert.notEqual(contentFactsFingerprint([file]), contentFactsFingerprint([{ ...file, mode: "100755" }]));
  assert.notEqual(contentFactsFingerprint([link]), contentFactsFingerprint([{ ...link, bytes: 4, content: "c".repeat(64) }]));
});

test("seal strictly validates intent, coverage, branch collision, and compact summary", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  for (const [document, expected] of [
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt"], title: "fix(commit): miss coverage" }] }, "coverage-mismatch"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "../two.txt"], title: "fix(commit): reject traversal" }] }, "invalid-intent"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "two.txt"], title: "not conventional" }] }, "invalid-intent"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "two.txt"], title: "feat!(commit): reject misplaced marker" }] }, "invalid-intent"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "two.txt"], title: "feat(commit)!!: reject doubled marker" }] }, "invalid-intent"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "two.txt"], title: "feat(commit)! : reject marker whitespace" }] }, "invalid-intent"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "two.txt"], title: "fix(commit): reject extras", extra: true }] }, "invalid-intent"],
    [{ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["one.txt", "two.txt"], title: "fix(commit): reject root extras" }], extra: true }, "invalid-intent"],
  ]) {
    const prepared = prepare(cwd);
    fs.writeFileSync(prepared.intentPath, JSON.stringify(document));
    assert.equal(seal(cwd, prepared).output.error.code, expected);
  }
  const body = "Useful context.";
  const prepared = prepare(cwd);
  intent(prepared, [
    { paths: ["one.txt"], title: "feat(commit)!: add first unit", body },
    { paths: ["two.txt"], title: "fix(commit): add second unit" },
  ]);
  const summary = seal(cwd, prepared);
  assert.equal(summary.result.status, 0);
  assert.deepEqual(summary.output.repository, { name: path.basename(cwd), branch: "feat/current", head: git(cwd, ["rev-parse", "--short=12", "HEAD"]) });
  assert.deepEqual(summary.output.counts, { commits: 2, files: 2 });
  assert.equal(summary.output.units[0].title, "feat(commit)!: add first unit");
  assert.deepEqual(summary.output.units[0].paths, ["one.txt"]);
  assert.deepEqual(summary.output.units[0].body, { present: true, bytes: Buffer.byteLength(body) });
  assert.doesNotMatch(summary.result.stdout, /Useful context|fingerprint|snapshot|request-v2/);

  const collisionRepo = repo("main");
  fs.writeFileSync(path.join(collisionRepo, "change.txt"), "change\n");
  git(collisionRepo, ["branch", "feat/collision"]);
  const collision = prepare(collisionRepo);
  intent(collision, [{ paths: ["change.txt"], title: "fix(commit): reject collision" }], { action: "create", name: "feat/collision" });
  assert.equal(seal(collisionRepo, collision).output.error.code, "branch-collision");
});

test("prepared authority digest and strict envelope block repository substitution", () => {
  const repoA = repo(); const repoB = repo();
  fs.writeFileSync(path.join(repoA, "a.txt"), "a\n");
  fs.writeFileSync(path.join(repoB, "b.txt"), "b\n");
  let preparedA = prepare(repoA); let preparedB = prepare(repoB);
  intent(preparedA, [{ paths: ["a.txt"], title: "fix(commit): keep repository a" }]);
  fs.copyFileSync(path.join(store(preparedB), "prepared.json"), path.join(store(preparedA), "prepared.json"));
  let response = seal(repoA, preparedA);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "prepared-tamper");
  assert.equal(git(repoA, ["rev-list", "--count", "HEAD"]), "1");
  assert.equal(git(repoB, ["rev-list", "--count", "HEAD"]), "1");

  preparedA = ready(repoA, [{ paths: ["a.txt"], title: "fix(commit): seal repository a" }]).prepared;
  preparedB = prepare(repoB);
  fs.copyFileSync(path.join(store(preparedB), "prepared.json"), path.join(store(preparedA), "prepared.json"));
  response = execute(repoA, preparedA);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "prepared-tamper");
  assert.equal(git(repoA, ["rev-list", "--count", "HEAD"]), "1");
  assert.equal(git(repoB, ["rev-list", "--count", "HEAD"]), "1");
  assert.deepEqual(changedPaths(repoA), ["a.txt"]);
  assert.deepEqual(changedPaths(repoB), ["b.txt"]);

  const strictRepo = repo();
  fs.writeFileSync(path.join(strictRepo, "change.txt"), "change\n");
  const strictPrepared = prepare(strictRepo);
  intent(strictPrepared, [{ paths: ["change.txt"], title: "fix(commit): reject prepared extras" }]);
  const preparedPath = path.join(store(strictPrepared), "prepared.json");
  const envelope = JSON.parse(fs.readFileSync(preparedPath, "utf8"));
  envelope.extra = true;
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`);
  fs.writeFileSync(preparedPath, bytes);
  const forgedHandle = `${strictPrepared.handle.split(".")[0]}.${crypto.createHash("sha256").update(bytes).digest("hex")}`;
  assert.throws(() => sealHandle(forgedHandle), (error) => error.code === "prepared-tamper");
  assert.equal(git(strictRepo, ["rev-list", "--count", "HEAD"]), "1");
});

test("sealed execute handle binds the exact approved request", () => {
  const repoA = repo(); const repoB = repo();
  fs.writeFileSync(path.join(repoA, "a.txt"), "a\n");
  fs.writeFileSync(path.join(repoB, "b.txt"), "b\n");
  const preparedA = ready(repoA, [{ paths: ["a.txt"], title: "fix(commit): approve repository a" }]).prepared;
  const preparedB = ready(repoB, [{ paths: ["b.txt"], title: "fix(commit): approve repository b" }]).prepared;
  fs.copyFileSync(path.join(store(preparedB), "intent.json"), path.join(store(preparedA), "intent.json"));
  fs.copyFileSync(path.join(store(preparedB), "sealed.json"), path.join(store(preparedA), "sealed.json"));
  const response = execute(repoA, preparedA);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "sealed-tamper");
  assert.equal(git(repoA, ["rev-list", "--count", "HEAD"]), "1");
  assert.equal(git(repoB, ["rev-list", "--count", "HEAD"]), "1");
});

test("intent tamper, expiry, consumed handle, and reuse fail closed", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  let prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): reject intent tamper" }]).prepared;
  fs.writeFileSync(prepared.intentPath, `${JSON.stringify({ schema: "flow-commit/intent-v2", branch: { action: "keep" }, units: [{ paths: ["change.txt"], title: "fix(commit): tampered title" }] })}\n`);
  assert.equal(execute(cwd, prepared).output.error.code, "intent-tamper");

  prepared = prepareRepository({ cwd, now: 1000, ttlMs: 10 });
  intent(prepared, [{ paths: ["change.txt"], title: "fix(commit): reject expiry" }]);
  assert.throws(() => sealHandle(prepared.handle, { now: 1011 }), (error) => error.code === "handle-expired");

  prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): consume once" }]).prepared;
  assert.equal(execute(cwd, prepared).result.status, 0);
  assert.equal(fs.existsSync(store(prepared)), false);
  assert.equal(execute(cwd, prepared).output.error.code, "handle-unavailable");
});

test("execute hashing is linear and rereads only the current future unit", () => {
  const cwd = repo();
  const units = [];
  for (let index = 1; index <= 4; index += 1) {
    const file = `unit-${index}.txt`;
    fs.writeFileSync(path.join(cwd, file), `${index}\n`);
    units.push({ paths: [file], title: `fix(commit): commit unit ${index}` });
  }
  const prepared = ready(cwd, units).prepared;
  const reads = [];
  const result = executeHandle(prepared.handle, { onContentRead: ({ path: file }) => reads.push(file) });
  assert.equal(result.status, "success");
  const counts = Object.fromEntries(units.map((unit) => [unit.paths[0], reads.filter((file) => file === unit.paths[0]).length]));
  assert.deepEqual(counts, { "unit-1.txt": 1, "unit-2.txt": 2, "unit-3.txt": 2, "unit-4.txt": 2 });
  assert.equal(reads.length, 7);
});

test("symbolic-link handle stores fail closed", { skip: process.platform === "win32" && "Windows symlink creation requires elevated fixture privileges." }, () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const unsafe = store(prepared); const moved = `${unsafe}-real`;
  fs.renameSync(unsafe, moved); fs.symlinkSync(moved, unsafe, "dir");
  assert.equal(seal(cwd, prepared).output.error.code, "unsafe-handle-store");
  fs.unlinkSync(unsafe); fs.rmSync(moved, { recursive: true, force: true });
});

test("same-handle concurrent claim allows exactly one mutation", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  hook(cwd, "pre-commit", "sleep 1\nexit 0");
  const prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): claim once" }]).prepared;
  const responses = await Promise.all([
    asyncRun(cwd, ["--execute", "--handle", prepared.handle]),
    asyncRun(cwd, ["--execute", "--handle", prepared.handle]),
  ]);
  const documents = responses.map(output);
  assert.equal(documents.filter((item) => item.status === "success").length, 1);
  assert.equal(documents.filter((item) => item.error?.code === "handle-claimed" || item.error?.code === "handle-unavailable").length, 1);
  assert.equal(git(cwd, ["rev-list", "--count", "HEAD"]), "2");
});

test("distinct handles for one common-dir allow exactly one execution to mutate", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  hook(cwd, "pre-commit", "sleep 1\nexit 0");
  const first = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): first authority" }]).prepared;
  const second = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): second authority" }]).prepared;
  const responses = await Promise.all([
    asyncRun(cwd, ["--execute", "--handle", first.handle]),
    asyncRun(cwd, ["--execute", "--handle", second.handle]),
  ]);
  const documents = responses.map(output);
  assert.equal(documents.filter((item) => item.status === "success").length, 1);
  assert.equal(documents.filter((item) => item.error?.code === "repository-locked").length, 1);
  assert.equal(git(cwd, ["rev-list", "--count", "HEAD"]), "2");
});

test("abandoned handle claim and repository lock fail closed", () => {
  const claimedRepo = repo();
  fs.writeFileSync(path.join(claimedRepo, "change.txt"), "change\n");
  let prepared = ready(claimedRepo, [{ paths: ["change.txt"], title: "fix(commit): reject abandoned claim" }]).prepared;
  fs.writeFileSync(path.join(store(prepared), "execute.claim"), "abandoned\n", { flag: "wx" });
  assert.equal(execute(claimedRepo, prepared).output.error.code, "handle-claimed");

  const lockedRepo = repo();
  fs.writeFileSync(path.join(lockedRepo, "change.txt"), "change\n");
  prepared = ready(lockedRepo, [{ paths: ["change.txt"], title: "fix(commit): reject abandoned lock" }]).prepared;
  const commonDir = fs.realpathSync.native(git(lockedRepo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const lock = repositoryLockPath(commonDir);
  fs.mkdirSync(lock);
  const response = execute(lockedRepo, prepared);
  assert.equal(response.output.error.code, "repository-locked");
  assert.match(response.output.error.message, /remove it manually/i);
  assert.equal(fs.existsSync(lock), true);
  assert.equal(fs.existsSync(store(prepared)), false);
  fs.rmSync(lock, { recursive: true, force: true });
});

test("index restoration refuses to overwrite hook-created foreign staging", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  fs.writeFileSync(path.join(cwd, "foreign.txt"), "foreign\n");
  fs.appendFileSync(path.join(cwd, ".git", "info", "exclude"), "foreign.txt\n");
  hook(cwd, "pre-commit", "git add -f -- foreign.txt\nexit 1");
  const prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): preserve foreign staging" }]).prepared;
  const response = execute(cwd, prepared);
  assert.equal(response.output.status, "drift");
  assert.equal(response.output.error.code, "foreign-index-change");
  assert.match(git(cwd, ["diff", "--cached", "--name-only"]), /foreign\.txt/);
  assert.deepEqual(response.output.stoppedAt.paths, ["change.txt"]);
  assert.deepEqual(response.output.outstandingPaths, ["change.txt"]);
  assert.ok(response.output.leftovers.includes("foreign.txt"));
  assert.equal(response.output.effects.worktree.state, "changed");
  assert.ok(response.output.effects.worktree.paths.includes("foreign.txt"));
});

test("first-unit failure after branch creation is partial with explicit branch effect", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  hook(cwd, "pre-commit", "exit 1");
  const prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): report created branch" }], { action: "create", name: "fix/created-effect" }).prepared;
  const response = execute(cwd, prepared);
  assert.equal(response.result.status, 2);
  assert.equal(response.output.status, "partial");
  assert.deepEqual(response.output.effects.branch, { state: "created" });
  assert.equal(response.output.branch, "fix/created-effect");
  assert.equal(git(cwd, ["config", "--local", "--get", "branch.fix/created-effect.gh-merge-base"]), "main");
  assert.deepEqual(response.output.stoppedAt.paths, ["change.txt"]);
  assert.deepEqual(response.output.notAttempted, []);
  assert.deepEqual(response.output.outstandingPaths, ["change.txt"]);
});

test("branch provenance failure rolls back the branch and stale config", () => {
  const cwd = repo("main"); fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const plan = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): rollback provenance" }], { action: "create", name: "fix/provenance-rollback" }).prepared;
  const result = executeHandle(plan.handle, { onProvenanceRecorded: () => { throw new Error("injected provenance failure"); } });
  assert.equal(result.status, "failure"); assert.equal(git(cwd, ["branch", "--show-current"]), "main");
  assert.equal(maybeGit(cwd, ["show-ref", "--verify", "refs/heads/fix/provenance-rollback"]), "");
  assert.equal(maybeGit(cwd, ["config", "--local", "--get", "branch.fix/provenance-rollback.gh-merge-base"]), "");
});

test("branch-create blocker leaves every unit not attempted", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const prepared = ready(cwd, [
    { paths: ["one.txt"], title: "feat(commit): create first unit" },
    { paths: ["two.txt"], title: "fix(commit): create second unit" },
  ], { action: "create", name: "feat/collided-after-seal" }).prepared;
  git(cwd, ["branch", "feat/collided-after-seal"]);
  const response = execute(cwd, prepared);
  assert.equal(response.output.status, "blocked");
  assert.equal(response.output.error.code, "branch-create-failed");
  assert.equal(response.output.stoppedAt, null);
  assert.deepEqual(response.output.notAttempted.map((unit) => unit.paths), [["one.txt"], ["two.txt"]]);
  assert.deepEqual(response.output.outstandingPaths, ["one.txt", "two.txt"]);
  assert.deepEqual(response.output.completed, []);
});

test("pre-unit content drift leaves every unit not attempted", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const prepared = ready(cwd, [
    { paths: ["one.txt"], title: "feat(commit): create first unit" },
    { paths: ["two.txt"], title: "fix(commit): create second unit" },
  ]).prepared;
  fs.writeFileSync(path.join(cwd, "one.txt"), "drifted\n");
  const response = execute(cwd, prepared);
  assert.equal(response.output.status, "drift");
  assert.equal(response.output.error.code, "content-drift");
  assert.equal(response.output.stoppedAt, null);
  assert.deepEqual(response.output.notAttempted.map((unit) => unit.paths), [["one.txt"], ["two.txt"]]);
  assert.deepEqual(response.output.outstandingPaths, ["one.txt", "two.txt"]);
  assert.deepEqual(response.output.completed, []);
});

test("subdirectory invocation normalizes all Git work to the canonical root", () => {
  const cwd = repo();
  const subdir = path.join(cwd, "nested"); fs.mkdirSync(subdir);
  fs.writeFileSync(path.join(subdir, "change.txt"), "change\n");
  const prepared = ready(subdir, [{ paths: ["nested/change.txt"], title: "fix(commit): normalize repository root" }]).prepared;
  const response = execute(subdir, prepared);
  assert.equal(response.result.status, 0, response.result.stdout);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): normalize repository root");
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(subdir, "case.txt"), "case\n");
    const alias = subdir.toUpperCase();
    const casePrepared = ready(alias, [{ paths: ["nested/case.txt"], title: "fix(commit): normalize root casing" }]).prepared;
    assert.equal(execute(alias, casePrepared).result.status, 0);
  }
});

test("CLI rejects unknown, duplicate, missing, and incompatible options", () => {
  const cwd = repo();
  for (const [args, pattern] of [
    [["--unknown"], /Unsupported option/],
    [["--prepare", "--prepare"], /Duplicate option/],
    [["--prepare", "--execute", "--handle", "a".repeat(64)], /exactly one operation/],
    [["--prepare", "--validate-intent", "--handle", "a".repeat(64)], /one operation/],
    [["--validate-intent", "--execute", "--handle", "a".repeat(64)], /one operation/],
    [["--validate-intent", "--validate-intent", "--handle", "a".repeat(64)], /duplicated/],
    [["--validate-intent"], /requires a handle/],
    [["--validate-intent", "--handle"], /missing its value/],
    [["--execute"], /requires --handle/],
    [["--prepare", "--handle"], /Missing value/],
    [["--execute", "--handle", "a".repeat(64), "--handle", "b".repeat(64)], /Duplicate option/],
  ]) {
    const response = run(cwd, args); const document = output(response);
    assert.equal(response.status, 1);
    assert.match(document.error.message, pattern);
  }
});

test("ordered units retain commit verification and compact success omits sensitive payloads", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const body = "Why this unit exists.\n\nBREAKING CHANGE: consumers must use the new contract.";
  const prepared = ready(cwd, [
    { paths: ["one.txt"], title: "feat(commit)!: create first unit", body },
    { paths: ["two.txt"], title: "fix(commit): create second unit" },
  ]).prepared;
  const response = execute(cwd, prepared);
  assert.equal(response.result.status, 0, response.result.stdout);
  assert.equal(response.output.schema, "flow-commit/result-v2");
  assert.equal(response.output.status, "success");
  assert.deepEqual(response.output.completed.map((unit) => unit.title), ["feat(commit)!: create first unit", "fix(commit): create second unit"]);
  assert.equal(response.output.stoppedAt, null);
  assert.deepEqual(response.output.notAttempted, []);
  assert.deepEqual(response.output.outstandingPaths, []);
  assert.deepEqual(response.output.counts, { completed: 2, notAttempted: 0, outstandingPaths: 0, leftovers: 0 });
  assert.deepEqual(response.output.leftovers, []);
  assert.deepEqual(response.output.effects.branch, { state: "kept" });
  assert.doesNotMatch(response.result.stdout, /Why this unit exists|request-v2|snapshot|fingerprint|"paths"/);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): create second unit");
  const firstCommit = git(cwd, ["rev-parse", "HEAD~1"]);
  const commitObject = execFileSync("git", ["cat-file", "commit", firstCommit], { cwd, encoding: "utf8" });
  assert.equal(commitObject.slice(commitObject.indexOf("\n\n") + 2), `feat(commit)!: create first unit\n\n${body}\n`);
});

test("later hook failure preserves completed units and actionable remaining paths", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  fs.writeFileSync(path.join(cwd, "three.txt"), "three\n");
  hook(cwd, "pre-commit", "[ \"$(git diff --cached --name-only)\" = \"two.txt\" ] && exit 1\nexit 0");
  const prepared = ready(cwd, [
    { paths: ["one.txt"], title: "feat(commit): retain first unit" },
    { paths: ["two.txt"], title: "fix(commit): fail second unit", body: "Not repeated in output." },
    { paths: ["three.txt"], title: "docs(commit): leave third unit unattempted" },
  ]).prepared;
  const response = execute(cwd, prepared);
  assert.equal(response.result.status, 2);
  assert.equal(response.output.status, "partial");
  assert.equal(response.output.completed.length, 1);
  assert.deepEqual(response.output.stoppedAt.paths, ["two.txt"]);
  assert.deepEqual(response.output.notAttempted.map((unit) => unit.paths), [["three.txt"]]);
  assert.deepEqual(response.output.outstandingPaths, ["three.txt", "two.txt"]);
  assert.equal(Object.hasOwn(response.output, "failed"), false);
  assert.equal(Object.hasOwn(response.output, "remaining"), false);
  assert.equal(Object.hasOwn(response.output, "stopped"), false);
  assert.deepEqual(response.output.leftovers, ["three.txt", "two.txt"]);
  assert.doesNotMatch(response.result.stdout, /Not repeated in output/);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "feat(commit): retain first unit");
});

test("hook path effects trigger CAS rollback and observable-effect reporting", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  fs.writeFileSync(path.join(cwd, "hook-extra.txt"), "extra\n");
  fs.appendFileSync(path.join(cwd, ".git", "info", "exclude"), "hook-extra.txt\n");
  hook(cwd, "pre-commit", "git add -f -- hook-extra.txt");
  const prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): reject hook path effect" }]).prepared;
  const response = execute(cwd, prepared);
  assert.notEqual(response.result.status, 0);
  assert.match(response.output.error.message, /postcondition|parent, tree, paths/i);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "chore: initial");
  assert.ok(response.output.leftovers.includes("change.txt"));
  assert.equal(response.output.effects.worktree.state, "unchanged");
  assert.match(response.output.recovery, /observed hook effects/i);
});

test("post-commit concurrent HEAD is preserved and never globally rolled back", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  hook(cwd, "post-commit", "next=$(git commit-tree HEAD^{tree} -p HEAD -m 'chore: concurrent head')\ngit update-ref HEAD $next HEAD");
  const prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): preserve concurrent head" }]).prepared;
  const response = execute(cwd, prepared);
  assert.equal(response.output.status, "drift");
  assert.equal(response.output.error.code, "concurrent-head");
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "chore: concurrent head");
});

test("handle stores are cleaned after ordinary failure", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  hook(cwd, "pre-commit", "exit 1");
  const prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): clean failed handle" }]).prepared;
  const response = execute(cwd, prepared);
  assert.equal(response.result.status, 1);
  assert.equal(fs.existsSync(store(prepared)), false);
});
