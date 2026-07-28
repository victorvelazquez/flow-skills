import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-commit.mjs");

function git(cwd, args, options = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function gitRaw(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function repo(branch = "feat/current") {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-contract-"));
  git(cwd, ["init", "-q", "-b", branch]);
  git(cwd, ["config", "user.email", "flow@example.test"]);
  git(cwd, ["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git(cwd, ["add", "base.txt"]);
  git(cwd, ["commit", "-qm", "chore: initial"]);
  return cwd;
}

function run(cwd, args, input) {
  return spawnSync(process.execPath, [runtime, ...args], {
    cwd,
    input,
    encoding: "utf8",
    shell: false,
  });
}

function inspect(cwd) {
  const result = run(cwd, ["--inspect"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function request(inspection, units, branch = { action: "keep" }) {
  return {
    schema: "flow-commit/request-v1",
    expected: {
      repositoryRoot: inspection.repositoryRoot,
      branch: inspection.branch,
      head: inspection.head,
    },
    branch,
    units,
  };
}

function execute(cwd, document) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-request-"));
  const file = path.join(directory, "request.json");
  fs.writeFileSync(file, `${JSON.stringify(document)}\n`);
  const result = run(cwd, ["--execute", "--request", file]);
  return { result, output: JSON.parse(result.stdout) };
}

function changedPaths(cwd) {
  return execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd })
    .toString("utf8").split("\0").filter(Boolean).map((item) => item.slice(3)).sort();
}

function indexBytes(cwd) {
  return fs.readFileSync(git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"]));
}

function assertCompleteResult(output) {
  for (const field of ["schema", "success", "status", "repository", "branch", "completedUnits", "failedUnit", "remainingUnits", "leftovers", "recovery", "nextAction"]) {
    assert.ok(Object.hasOwn(output, field), `missing result field: ${field}`);
  }
  assert.equal(output.schema, "flow-commit/result-v1");
}

test("inspection is ephemeral, NUL-safe, and reports noop", () => {
  const cwd = repo();
  const clean = inspect(cwd);
  assert.equal(clean.schema, "flow-commit/inspection-v1");
  assert.equal(clean.status, "noop");
  assert.deepEqual(clean.changes, []);
  assert.deepEqual(clean.stagedPaths, []);

  const hostile = " leading $(touch should-not-run); `quoted` ";
  fs.writeFileSync(path.join(cwd, hostile), "literal\n");
  for (const name of ["requirements.txt", "CMakeLists.txt", "README.sh", "guide.mdx"]) fs.writeFileSync(path.join(cwd, name), "literal\n");
  fs.chmodSync(path.join(cwd, "guide.mdx"), 0o755);
  const document = inspect(cwd);
  assert.equal(document.status, "ready");
  assert.ok(document.changes.some((change) => change.path === hostile));
  assert.deepEqual(document.changes.map((change) => change.path).sort(), changedPaths(cwd));
  assert.equal(fs.existsSync(path.join(cwd, "should-not-run")), false);
});

test("request validation blocks gaps, overlaps, unsafe paths, invalid messages, and drift", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const state = inspect(cwd);
  const cases = [
    [request(state, [{ paths: ["one.txt"], title: "fix(commit): keep coverage" }]), /coverage/i],
    [request(state, [{ paths: ["one.txt", "two.txt"], title: "not conventional" }]), /title/i],
    [request(state, [{ paths: ["one.txt", "../two.txt"], title: "fix(commit): reject traversal" }]), /relative/i],
    [request(state, [{ paths: ["one.txt", "two.txt"], title: "fix(commit): reject absolute" }], { action: "create", name: "bad ref.." }), /branch/i],
  ];
  for (const [document, expected] of cases) {
    const { result, output } = execute(cwd, document);
    assert.equal(result.status, 1);
    assert.equal(output.status, "blocked");
    assert.match(output.error, expected);
  }
  const drift = request(state, [{ paths: ["one.txt", "two.txt"], title: "fix(commit): detect drift" }]);
  fs.writeFileSync(path.join(cwd, "third.txt"), "third\n");
  const response = execute(cwd, drift);
  assert.equal(response.output.status, "blocked");
  assert.equal(response.result.status, 1);
});

test("root, branch, HEAD, and detached-state drift block before staging", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const state = inspect(cwd);
  const unit = [{ paths: ["change.txt"], title: "fix(commit): detect identity drift" }];
  const rootMismatch = request(state, unit);
  rootMismatch.expected.repositoryRoot = path.join(state.repositoryRoot, "other");
  assert.equal(execute(cwd, rootMismatch).output.status, "drift");
  const branchMismatch = request(state, unit);
  git(cwd, ["branch", "-M", "feat/renamed"]);
  assert.equal(execute(cwd, branchMismatch).output.status, "drift");
  const renamed = inspect(cwd);
  const headMismatch = request(renamed, unit);
  fs.writeFileSync(path.join(cwd, "other.txt"), "other\n");
  git(cwd, ["add", "other.txt"]); git(cwd, ["commit", "-qm", "chore: drift"]);
  assert.equal(execute(cwd, headMismatch).output.status, "drift");
  git(cwd, ["checkout", "--detach", "-q"]);
  assert.equal(inspect(cwd).status, "blocked");
});

test("rejects any staged or partially staged index without mutation", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "base.txt"), "staged\n");
  git(cwd, ["add", "base.txt"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "staged\nworktree\n");
  const before = indexBytes(cwd);
  const state = inspect(cwd);
  assert.deepEqual(state.stagedPaths, ["base.txt"]);
  const { result, output } = execute(cwd, request(state, [{ paths: ["base.txt"], title: "fix(commit): reject staging" }]));
  assert.equal(result.status, 1);
  assert.equal(output.status, "blocked");
  assert.match(output.error, /staged/i);
  assert.deepEqual(indexBytes(cwd), before);
});

test("protected branches require the exact requested branch and collisions never retry", () => {
  const cwd = repo("main");
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const state = inspect(cwd);
  const unit = { paths: ["change.txt"], title: "fix(commit): create task branch" };
  const missing = execute(cwd, request(state, [unit]));
  assert.equal(missing.output.status, "blocked");
  assert.match(missing.output.error, /protected/i);
  git(cwd, ["branch", "feat/exact-name"]);
  const collision = execute(cwd, request(state, [unit], { action: "create", name: "feat/exact-name" }));
  assert.equal(collision.result.status, 1);
  assert.match(collision.output.error, /already exists|collision/i);
  assert.equal(git(cwd, ["branch", "--show-current"]), "main");
  const success = execute(cwd, request(state, [unit], { action: "create", name: "feat/no-retry" }));
  assert.equal(success.result.status, 0, success.result.stderr);
  assert.equal(success.output.status, "success");
  assert.equal(success.output.branch, "feat/no-retry");
});

test("executes explicit ordered units and preserves titles and bodies", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const state = inspect(cwd);
  const body = "Why this is needed.\n\nIt remains byte-for-byte supplied.";
  const { result, output } = execute(cwd, request(state, [
    { paths: ["one.txt"], title: "feat(commit): add first unit", body },
    { paths: ["two.txt"], title: "fix(commit): add second unit" },
  ]));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(output.completedUnits.length, 2);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "fix(commit): add second unit");
  assert.equal(git(cwd, ["log", "-2", "--format=%B"]).includes(body), true);
  assert.deepEqual(changedPaths(cwd), []);
});

test("preserves leading and trailing body whitespace through the commit message", () => {
  for (const body of [" leading body", "trailing space ", "body ending in newline\n", "\nleading and trailing\n"]) {
    const cwd = repo();
    fs.writeFileSync(path.join(cwd, "body.txt"), "body\n");
    const response = execute(cwd, request(inspect(cwd), [{ paths: ["body.txt"], title: "fix(commit): preserve body boundaries", body }]));
    assert.equal(response.result.status, 0, response.result.stderr);
    assert.equal(response.output.status, "success");
    assert.equal(gitRaw(cwd, ["log", "-1", "--format=%B"]).includes(body), true, JSON.stringify({ body, message: gitRaw(cwd, ["log", "-1", "--format=%B"]) }));
  }
});

test("later hook failure retains completed units and restores only the failing index", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  const state = inspect(cwd);
  const hook = path.join(cwd, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\n[ \"$(git diff --cached --name-only)\" = \"two.txt\" ] && exit 1\nexit 0\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  const { result, output } = execute(cwd, request(state, [
    { paths: ["one.txt"], title: "feat(commit): retain first" },
    { paths: ["two.txt"], title: "fix(commit): fail second" },
  ]));
  assert.equal(result.status, 2);
  assert.equal(output.status, "partial");
  assert.equal(output.completedUnits.length, 1);
  assert.equal(output.failedUnit.title, "fix(commit): fail second");
  assert.deepEqual(output.leftovers, ["two.txt"]);
  assert.deepEqual(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd, encoding: "utf8" }).trim(), "");
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "feat(commit): retain first");
});

test("hook-added paths cause post-commit rollback and concurrent CAS is preserved", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  fs.writeFileSync(path.join(cwd, ".git", "info", "exclude"), "hook-extra.txt\n");
  fs.writeFileSync(path.join(cwd, "hook-extra.txt"), "extra\n");
  const hook = path.join(cwd, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\ngit add -f -- hook-extra.txt\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  const state = inspect(cwd);
  const response = execute(cwd, request(state, [{ paths: ["change.txt"], title: "fix(commit): reject hook drift" }]));
  assert.equal(response.result.status, 1);
  assert.match(response.output.error, /verification|unexpected/i);
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "chore: initial");
  assert.deepEqual(changedPaths(cwd), ["change.txt"]);
  assert.equal(fs.readFileSync(path.join(cwd, "hook-extra.txt"), "utf8"), "extra\n");
});

test("a post-commit concurrent HEAD is never rolled back", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  const hook = path.join(cwd, ".git", "hooks", "post-commit");
  fs.writeFileSync(hook, "#!/bin/sh\nnext=$(git commit-tree HEAD^{tree} -p HEAD -m 'chore: concurrent head')\ngit update-ref HEAD $next HEAD\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  const { result, output } = execute(cwd, request(inspect(cwd), [{ paths: ["change.txt"], title: "fix(commit): preserve concurrent head" }]));
  assert.equal(result.status, 1);
  assert.equal(output.status, "drift");
  assert.equal(git(cwd, ["log", "-1", "--format=%s"]), "chore: concurrent head");
  assert.match(output.error, /concurrent HEAD/i);
});

test("post-commit branch drift at the same HEAD preserves completed work and stops later units", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "one.txt"), "one\n");
  fs.writeFileSync(path.join(cwd, "two.txt"), "two\n");
  git(cwd, ["branch", "hijacked"]);
  const hook = path.join(cwd, ".git", "hooks", "post-commit");
  fs.writeFileSync(hook, "#!/bin/sh\n[ \"$(git log -1 --format=%s)\" = \"feat(commit): complete first\" ] && git switch -q hijacked\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  const response = execute(cwd, request(inspect(cwd), [
    { paths: ["one.txt"], title: "feat(commit): complete first" },
    { paths: ["two.txt"], title: "fix(commit): must not run" },
  ]));
  assert.equal(response.result.status, 2, JSON.stringify(response.output));
  assert.equal(response.output.status, "partial");
  assert.equal(response.output.branch, "hijacked");
  assert.equal(response.output.completedUnits.length, 1);
  assert.equal(response.output.failedUnit.title, "fix(commit): must not run");
  assert.deepEqual(response.output.leftovers, ["two.txt"]);
  assert.equal(git(cwd, ["branch", "--show-current"]), "hijacked");
  assert.equal(git(cwd, ["log", "-1", "--format=%s", "feat/current"]), "feat(commit): complete first");
  assert.equal(git(cwd, ["log", "-1", "--format=%s", "hijacked"]), "chore: initial");
});

test("merge state, detached HEAD, and request stdin are handled explicitly", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "change.txt"), "change\n");
  fs.writeFileSync(path.join(cwd, ".git", "MERGE_HEAD"), "0".repeat(40));
  const blocked = inspect(cwd);
  assert.equal(blocked.mergeState, true);
  const response = execute(cwd, request(blocked, [{ paths: ["change.txt"], title: "fix(commit): reject merge state" }]));
  assert.equal(response.output.status, "blocked");
  fs.rmSync(path.join(cwd, ".git", "MERGE_HEAD"));
  const state = inspect(cwd);
  const stdin = run(cwd, ["--execute", "--request", "-"], JSON.stringify(request(state, [{ paths: ["change.txt"], title: "fix(commit): accept stdin" }])));
  assert.equal(stdin.status, 0, stdin.stderr);
});

test("all CLI failures use a complete result-v1 document", () => {
  const cwd = repo();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-invalid-"));
  const malformed = path.join(directory, "request.json");
  fs.writeFileSync(malformed, "{not json");
  for (const args of [["--execute", "--request", malformed], ["--unknown"], ["--execute"]]) {
    const result = run(cwd, args);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assertCompleteResult(output);
    assert.equal(output.success, false);
    assert.equal(output.completedUnits.length, 0);
    assert.equal(output.failedUnit, null);
    assert.deepEqual(output.remainingUnits, []);
    assert.deepEqual(output.leftovers, []);
  }
});

test("runtime has no legacy planner, review authority, or commit -a invocation", () => {
  const source = fs.readFileSync(runtime, "utf8");
  assert.doesNotMatch(source, /gentle-ai|planId|lineage|lifecycle|topology|max-rounds|flow-work-units/i);
  assert.doesNotMatch(source, /\["commit", "-a"\]/);
  assert.match(source, /\["add", "--all", "--"/);
});
