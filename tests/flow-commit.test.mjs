import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authorIntent, contentFactsFingerprint, executeHandle, prepareRepository, repositoryLockPath, sealHandle } from "../scripts/flow-commit.mjs";

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

function canonical(value) {
  return JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : item);
}

function payload(prepared, units, branch = { action: "keep" }, extra = {}) {
  const ordinals = new Map(prepared.changes.map((change, index) => [change.path, index]));
  const document = {
    schema: "flow-commit/author-intent-v1",
    ...(branch.action === "create" ? { branchName: branch.name } : {}),
    units: units.map(({ paths, ...unit }) => ({ ordinals: paths.map((file) => ordinals.get(file)), ...unit })),
    ...extra,
  };
  return Buffer.from(canonical(document), "utf8").toString("base64url");
}

function author(cwd, prepared, units, branch = { action: "keep" }, token = payload(prepared, units, branch)) {
  const result = run(cwd, ["--author-intent", "--handle", prepared.handle, "--payload-b64url", token]);
  return { result, output: output(result) };
}

function seal(cwd, prepared) {
  const result = run(cwd, ["--seal", "--handle", prepared.handle]);
  return { result, output: output(result) };
}

function execute(cwd, prepared) {
  const result = run(cwd, ["--execute", "--handle", prepared.handle]);
  return { result, output: output(result) };
}

function ready(cwd, units, branch = { action: "keep" }) {
  const prepared = prepare(cwd);
  const authored = author(cwd, prepared, units, branch);
  assert.equal(authored.result.status, 0, authored.result.stdout);
  const sealed = seal(cwd, { ...prepared, handle: authored.output.authoredHandle });
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  return { prepared: { ...prepared, handle: sealed.output.executeHandle }, sealed: sealed.output };
}

function store(prepared) {
  const handleId = prepared.handle.split(".")[1];
  return path.join(fs.realpathSync.native(os.tmpdir()), `flow-commit-${handleId}`);
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
  assert.deepEqual(clean, { schema: "flow-commit/prepare-v3", status: "noop", branch: "feat/current", head: clean.head, protected: false, changes: [] });
  const hostile = process.platform === "win32" ? " leading $(touch nope); `quoted` name.txt" : " leading $(touch nope); `quoted`\nname.txt";
  fs.writeFileSync(path.join(cwd, hostile), "literal\n");
  fs.unlinkSync(path.join(cwd, "base.txt"));
  const prepared = prepare(cwd);
  assert.equal(prepared.status, "ready");
  assert.deepEqual(prepared.changes.map((item) => item.path).sort(), changedPaths(cwd));
  assert.ok(prepared.changes.some((item) => item.path === hostile));
  assert.ok(prepared.changes.some((item) => item.path === "base.txt" && item.worktreeStatus === "D"));
  assert.match(prepared.handle, /^p3\.[a-f0-9]{64}\.[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(cwd, "nope")), false);
  for (const forbidden of ["repositoryRoot", "commonDir", "fingerprint", "snapshot", "request"]) assert.equal(Object.hasOwn(prepared, forbidden), false);
  assert.equal(Object.hasOwn(prepared, "intentPath"), false);
  assert.equal(Object.hasOwn(prepared, "units"), false);
});

test("prepare creates only immutable runtime-owned authority", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  assert.deepEqual(fs.readdirSync(store(prepared)), ["prepared.json"]);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(store(prepared), "prepared.json")).mode & 0o777, 0o600);
  fs.rmSync(store(prepared), { recursive: true, force: true });
});

test("runtime encoder constructs canonical payload and author, seal, execute complete the lifecycle", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const encoded = run(cwd, ["--encode-author-intent", "--handle", prepared.handle, "--branch-name", "fix/runtime-payload", "--unit", "0", "--title", "fix(commit): author runtime payload"]);
  const encodedOutput = output(encoded);
  assert.equal(encoded.status, 0, encoded.stdout);
  assert.match(encodedOutput.payloadB64url, /^[A-Za-z0-9_-]+$/);
  assert.ok(encodedOutput.payloadB64url.length <= 6000);
  const authored = run(cwd, ["--author-intent", "--handle", prepared.handle, "--payload-b64url", encodedOutput.payloadB64url]);
  const authoredOutput = output(authored);
  assert.equal(authored.status, 0, authored.stdout);
  assert.doesNotMatch(authored.stdout, /runtime payload|branchName|ordinals/);
  const sealed = seal(cwd, { ...prepared, handle: authoredOutput.authoredHandle });
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  const executed = execute(cwd, { ...prepared, handle: sealed.output.executeHandle });
  assert.equal(executed.result.status, 0, executed.result.stdout);
  assert.equal(git(cwd, ["branch", "--show-current"]), "fix/runtime-payload");
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): author runtime payload");
});

test("rename-like archive moves preserve literal delete and add path authority", () => {
  const cwd = repo();
  const source = "changes/request/spec.md";
  const archived = "changes/archive/request/spec.md";
  fs.mkdirSync(path.join(cwd, path.dirname(source)), { recursive: true });
  fs.writeFileSync(path.join(cwd, source), "archive me\n");
  git(cwd, ["add", source]);
  git(cwd, ["commit", "-qm", "docs: add active request"]);
  fs.mkdirSync(path.join(cwd, path.dirname(archived)), { recursive: true });
  fs.renameSync(path.join(cwd, source), path.join(cwd, archived));

  const prepared = ready(cwd, [{
    paths: [source, archived],
    title: "docs(commit): archive completed request",
  }]).prepared;
  const response = execute(cwd, prepared);

  assert.equal(response.result.status, 0, response.result.stdout);
  assert.equal(response.output.status, "success");
  assert.deepEqual(git(cwd, ["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD^", "HEAD"]).split("\n").sort(), [source, archived].sort());
  assert.deepEqual(changedPaths(cwd), []);
});

test("ordered ordinal units resolve to exact prepared paths", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const prepared = prepare(cwd);
  const authored = author(cwd, prepared, [
    { paths: ["one.txt"], title: "feat(commit): author first unit" },
    { paths: ["two.txt"], title: "fix(commit): author second unit" },
  ]);
  const sealed = seal(cwd, { ...prepared, handle: authored.output.authoredHandle });
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  assert.deepEqual(sealed.output.units.map((unit) => unit.paths), [["one.txt"], ["two.txt"]]);
});

test("successful authoring is exclusive and exact replay is idempotent", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const token = payload(prepared, [{ paths: ["change.txt"], title: "fix(commit): author once" }]);
  const first = author(cwd, prepared, [], undefined, token);
  const replay = author(cwd, prepared, [], undefined, token);
  assert.equal(first.output.replayed, false);
  assert.equal(replay.output.replayed, true);
  assert.equal(replay.output.authoredHandle, first.output.authoredHandle);
});

test("one invalid semantic payload is non-consuming and one correction can author", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const originalStore = store(prepared);
  const invalidToken = Buffer.from(canonical({ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [1], title: "fix(commit): fail authoring validation" }] })).toString("base64url");
  const invalid = author(cwd, prepared, [], undefined, invalidToken);
  assert.equal(invalid.result.status, 1);
  assert.equal(invalid.output.error.code, "coverage-mismatch");
  assert.equal(fs.existsSync(originalStore), true);
  const corrected = author(cwd, prepared, [{ paths: ["change.txt"], title: "fix(commit): correct structured intent" }]);
  assert.equal(corrected.result.status, 0, corrected.result.stdout);
  assert.equal(store(prepared), originalStore);
  const sealed = seal(cwd, { ...prepared, handle: corrected.output.authoredHandle });
  assert.equal(sealed.result.status, 0, sealed.result.stdout);
  const executed = execute(cwd, { ...prepared, handle: sealed.output.executeHandle });
  assert.equal(executed.result.status, 0, executed.result.stdout);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): correct structured intent");
});

test("authored handle grants no execute authority", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const prepared = prepare(cwd);
  const authored = authorIntent(prepared.handle, payload(prepared, [{ paths: ["change.txt"], title: "fix(commit): require sealed authority" }]));
  assert.equal(fs.existsSync(path.join(store(prepared), "sealed.json")), false);
  assert.throws(() => executeHandle(authored.authoredHandle), (error) => error.code === "handle-not-sealed");
  assert.equal(git(cwd, ["rev-list", "--count", "HEAD"]), "1");
});

test("authoring rejects malformed transport variants and bounds one correction", () => {
  const variants = ["abcd=", "abc+", "A", Buffer.from("{bad").toString("base64url"), Buffer.from("{\"units\":[],\"schema\":\"flow-commit/author-intent-v1\"}").toString("base64url")];
  for (const token of variants) {
    const cwd = repo(); fs.writeFileSync(path.join(cwd, "change.txt"), "change\n"); const prepared = prepare(cwd);
    const response = author(cwd, prepared, [], undefined, token);
    assert.equal(response.result.status, 1);
    assert.ok(["invalid-payload", "invalid-intent"].includes(response.output.error.code));
  }
  const cwd = repo(); fs.writeFileSync(path.join(cwd, "change.txt"), "change\n"); const prepared = prepare(cwd);
  assert.equal(author(cwd, prepared, [], undefined, "bad=").result.status, 1);
  assert.equal(author(cwd, prepared, [], undefined, "bad=").result.status, 1);
  assert.equal(fs.existsSync(store(prepared)), false);
});

test("authoring fails closed for prepared tamper, expiry, legacy handles, and invalid handles", () => {
  const tamperRepo = repo();
  fs.writeFileSync(path.join(tamperRepo, "change.txt"), "change\n");
  let prepared = prepare(tamperRepo);
  fs.appendFileSync(path.join(store(prepared), "prepared.json"), " ");
  assert.equal(author(tamperRepo, prepared, [{ paths: ["change.txt"], title: "fix(commit): reject prepared tamper" }]).output.error.code, "prepared-tamper");
  assert.equal(fs.existsSync(store(prepared)), false);

  const expiryRepo = repo();
  fs.writeFileSync(path.join(expiryRepo, "change.txt"), "change\n");
  prepared = prepareRepository({ cwd: expiryRepo, now: 1000, ttlMs: 10 });
  assert.throws(() => authorIntent(prepared.handle, payload(prepared, [{ paths: ["change.txt"], title: "fix(commit): reject expired author" }]), { now: 1011 }), (error) => error.code === "handle-expired");
  assert.equal(fs.existsSync(store(prepared)), false);
  assert.equal(output(run(expiryRepo, ["--seal", "--handle", `${"a".repeat(64)}.${"b".repeat(64)}`])).error.code, "legacy-handle");
  assert.equal(output(run(expiryRepo, ["--seal", "--handle", "not-a-handle"])).error.code, "invalid-handle");
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
  const authored = author(cwd, prepared, [{ paths: ["change.txt"], title: "fix(commit): bind changed bytes" }]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "two\n");
  const response = seal(cwd, { ...prepared, handle: authored.output.authoredHandle });
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "content-drift");
});

test("seal detects executable-mode and symlink-target drift", { skip: process.platform === "win32" && "Windows fixture cannot reliably create POSIX symlinks and executable modes." }, () => {
  const modeRepo = repo();
  fs.writeFileSync(path.join(modeRepo, "mode.sh"), "exit 0\n", { mode: 0o644 });
  let prepared = prepare(modeRepo);
  let authored = author(modeRepo, prepared, [{ paths: ["mode.sh"], title: "fix(commit): bind executable mode" }]);
  fs.chmodSync(path.join(modeRepo, "mode.sh"), 0o755);
  assert.equal(seal(modeRepo, { ...prepared, handle: authored.output.authoredHandle }).output.error.code, "content-drift");

  const linkRepo = repo();
  fs.writeFileSync(path.join(linkRepo, "one"), "one\n");
  fs.writeFileSync(path.join(linkRepo, "two"), "two\n");
  fs.symlinkSync("one", path.join(linkRepo, "link"));
  prepared = prepare(linkRepo);
  authored = author(linkRepo, prepared, [
    { paths: ["link", "one", "two"], title: "fix(commit): bind symlink target" },
  ]);
  fs.unlinkSync(path.join(linkRepo, "link"));
  fs.symlinkSync("two", path.join(linkRepo, "link"));
  assert.equal(seal(linkRepo, { ...prepared, handle: authored.output.authoredHandle }).output.error.code, "content-drift");
});

test("content fingerprint binds executable mode and symlink target on every platform", () => {
  const file = { path: "tool.sh", indexStatus: " ", worktreeStatus: "M", kind: "file", bytes: 4, mode: "100644", content: "a".repeat(64) };
  const link = { path: "link", indexStatus: "?", worktreeStatus: "?", kind: "symlink", bytes: 3, mode: "120000", content: "b".repeat(64) };
  assert.notEqual(contentFactsFingerprint([file]), contentFactsFingerprint([{ ...file, mode: "100755" }]));
  assert.notEqual(contentFactsFingerprint([link]), contentFactsFingerprint([{ ...link, bytes: 4, content: "c".repeat(64) }]));
});

test("author strictly validates schema, coverage, and titles while seal returns a compact summary", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  for (const [document, expected] of [
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0], title: "fix(commit): miss coverage" }] }, "coverage-mismatch"],
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0, 0], title: "fix(commit): repeat ordinal" }] }, "coverage-mismatch"],
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0, 2], title: "fix(commit): reject range" }] }, "coverage-mismatch"],
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0, 1], title: "not conventional" }] }, "invalid-intent"],
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0, 1], title: "feat!(commit): reject misplaced marker" }] }, "invalid-intent"],
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0, 1], title: "fix(commit): reject extras", extra: true }] }, "invalid-intent"],
    [{ schema: "flow-commit/author-intent-v1", units: [{ ordinals: [0, 1], title: "fix(commit): reject root extras" }], extra: true }, "invalid-intent"],
  ]) {
    const prepared = prepare(cwd);
    const token = Buffer.from(canonical(document)).toString("base64url");
    assert.equal(author(cwd, prepared, [], undefined, token).output.error.code, expected);
  }
  const body = "Useful context.";
  const prepared = prepare(cwd);
  const authored = author(cwd, prepared, [
    { paths: ["one.txt"], title: "feat(commit)!: add first unit", body },
    { paths: ["two.txt"], title: "fix(commit): add second unit" },
  ]);
  const summary = seal(cwd, { ...prepared, handle: authored.output.authoredHandle });
  assert.equal(summary.result.status, 0);
  assert.deepEqual(summary.output.repository, { name: path.basename(cwd), branch: "feat/current", head: git(cwd, ["rev-parse", "--short=12", "HEAD"]) });
  assert.deepEqual(summary.output.counts, { commits: 2, files: 2 });
  assert.equal(summary.output.units[0].title, "feat(commit)!: add first unit");
  assert.deepEqual(summary.output.units[0].paths, ["one.txt"]);
  assert.deepEqual(summary.output.units[0].body, { present: true, bytes: Buffer.byteLength(body) });
  assert.doesNotMatch(summary.result.stdout, /Useful context|fingerprint|snapshot|request-v3/);

  const collisionRepo = repo("main");
  fs.writeFileSync(path.join(collisionRepo, "change.txt"), "change\n");
  git(collisionRepo, ["branch", "feat/collision"]);
  const collision = prepare(collisionRepo);
  assert.equal(author(collisionRepo, collision, [{ paths: ["change.txt"], title: "fix(commit): reject collision" }], { action: "create", name: "feat/collision" }).output.error.code, "branch-collision");
});

test("prepared authority digest and strict envelope block repository substitution", () => {
  const repoA = repo(); const repoB = repo();
  fs.writeFileSync(path.join(repoA, "a.txt"), "a\n");
  fs.writeFileSync(path.join(repoB, "b.txt"), "b\n");
  let preparedA = prepare(repoA); let preparedB = prepare(repoB);
  const authoredA = author(repoA, preparedA, [{ paths: ["a.txt"], title: "fix(commit): keep repository a" }]);
  fs.copyFileSync(path.join(store(preparedB), "prepared.json"), path.join(store(preparedA), "prepared.json"));
  let response = seal(repoA, { ...preparedA, handle: authoredA.output.authoredHandle });
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
  const strictAuthored = author(strictRepo, strictPrepared, [{ paths: ["change.txt"], title: "fix(commit): reject prepared extras" }]);
  const preparedPath = path.join(store(strictPrepared), "prepared.json");
  const envelope = JSON.parse(fs.readFileSync(preparedPath, "utf8"));
  envelope.extra = true;
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`);
  fs.writeFileSync(preparedPath, bytes);
  const forgedHandle = `a3.${strictPrepared.handle.split(".")[1]}.${crypto.createHash("sha256").update(bytes).digest("hex")}.${strictAuthored.output.authoredHandle.split(".")[3]}`;
  assert.throws(() => sealHandle(forgedHandle), (error) => error.code === "prepared-tamper");
  assert.equal(git(strictRepo, ["rev-list", "--count", "HEAD"]), "1");
});

test("sealed execute handle binds the exact approved request", () => {
  const repoA = repo(); const repoB = repo();
  fs.writeFileSync(path.join(repoA, "a.txt"), "a\n");
  fs.writeFileSync(path.join(repoB, "b.txt"), "b\n");
  const preparedA = ready(repoA, [{ paths: ["a.txt"], title: "fix(commit): approve repository a" }]).prepared;
  const preparedB = ready(repoB, [{ paths: ["b.txt"], title: "fix(commit): approve repository b" }]).prepared;
  fs.copyFileSync(path.join(store(preparedB), "authored.json"), path.join(store(preparedA), "authored.json"));
  fs.copyFileSync(path.join(store(preparedB), "sealed.json"), path.join(store(preparedA), "sealed.json"));
  const response = execute(repoA, preparedA);
  assert.equal(response.result.status, 1);
  assert.equal(response.output.error.code, "authored-tamper");
  assert.equal(git(repoA, ["rev-list", "--count", "HEAD"]), "1");
  assert.equal(git(repoB, ["rev-list", "--count", "HEAD"]), "1");
});

test("authored tamper, expiry, consumed handle, and reuse fail closed", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  let prepared = ready(cwd, [{ paths: ["change.txt"], title: "fix(commit): reject authored tamper" }]).prepared;
  fs.appendFileSync(path.join(store(prepared), "authored.json"), " ");
  assert.equal(execute(cwd, prepared).output.error.code, "authored-tamper");

  prepared = prepareRepository({ cwd, now: 1000, ttlMs: 10 });
  const expiring = authorIntent(prepared.handle, payload(prepared, [{ paths: ["change.txt"], title: "fix(commit): reject expiry" }]), { now: 1001 });
  assert.throws(() => sealHandle(expiring.authoredHandle, { now: 1011 }), (error) => error.code === "handle-expired");

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
    [["--prepare", "--seal", "--handle", "a".repeat(64)], /one operation/],
    [["--author-intent", "--execute", "--handle", "a".repeat(64), "--payload-b64url", "abc"], /one operation/],
    [["--seal", "--seal", "--handle", "a".repeat(64)], /duplicate/i],
    [["--seal"], /requires --handle/],
    [["--author-intent", "--handle", "a".repeat(64)], /CLI options are invalid/i],
    [["--execute"], /requires --handle/],
    [["--prepare", "--handle", "x"], /accepts no handle/i],
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
  assert.equal(response.output.schema, "flow-commit/result-v3");
  assert.equal(response.output.status, "success");
  assert.deepEqual(response.output.completed.map((unit) => unit.title), ["feat(commit)!: create first unit", "fix(commit): create second unit"]);
  assert.equal(response.output.stoppedAt, null);
  assert.deepEqual(response.output.notAttempted, []);
  assert.deepEqual(response.output.outstandingPaths, []);
  assert.deepEqual(response.output.counts, { completed: 2, notAttempted: 0, outstandingPaths: 0, leftovers: 0 });
  assert.deepEqual(response.output.leftovers, []);
  assert.deepEqual(response.output.effects.branch, { state: "kept" });
  assert.doesNotMatch(response.result.stdout, /Why this unit exists|request-v3|snapshot|fingerprint|"paths"/);
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
