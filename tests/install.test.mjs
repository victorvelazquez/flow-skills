import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "install.mjs");

function git(args, label) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, [
    `Failed to read ${label} from Git.`,
    result.error?.message,
    result.stderr,
  ].filter(Boolean).join("\n"));
  return result.stdout;
}

const committedHead = git(["rev-parse", "HEAD"], "committed HEAD").trim();
const committedLock = (() => {
  const bytes = git(["show", "HEAD:flow-assets.lock.json"], "flow-assets.lock.json at committed HEAD");
  try { return JSON.parse(bytes); }
  catch (error) { assert.fail(`Committed HEAD flow-assets.lock.json is invalid JSON: ${error.message}`); }
})();
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function destination() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-bootstrap-"));
}

function seedConfig(target, overrides = {}) {
  const config = {
    $schema: "https://opencode.ai/config.json",
    agent: { "gentle-orchestrator": {
      model: "openai/test-model",
      tools: { task: true, read: true },
      permission: { question: "allow", task: { "*": "deny", explore: "allow", "flow-pr-agent": "allow" } },
    } },
    permission: { bash: "ask" },
    provider: { custom: { token: "must-not-leak" } },
    ...overrides,
  };
  const bytes = ` ${JSON.stringify(config)}\r\n`;
  fs.writeFileSync(path.join(target, "opencode.json"), bytes);
  return bytes;
}

function run(args, target, options = {}) {
  return spawnSync(process.execPath, [installer, ...args], {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target, ...options.env },
  });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function preview(target, args = []) {
  return json(run(args, target));
}

function apply(target, plan, args = []) {
  return run(["--apply", "--expected-target-commit", plan.target.commit, "--expected-plan-id", plan.planId, ...args], target);
}

function snapshot(target) {
  const files = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(target, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else files[relative] = digest(fs.readFileSync(absolute));
    }
  };
  visit(target);
  return files;
}

test("no-argument preview and --dry-run are read-only and do not recover transactions", () => {
  const target = destination(); seedConfig(target);
  const before = snapshot(target);
  const first = preview(target), alias = preview(target, ["--dry-run"]);
  assert.equal(first.mode, "preview");
  assert.equal(first.stateChanged, false);
  assert.equal(first.planId, alias.planId);
  assert.deepEqual(snapshot(target), before);

  const transaction = path.join(target, ".flow-skills", "transactions", "transaction");
  fs.mkdirSync(transaction, { recursive: true });
  fs.writeFileSync(path.join(transaction, "journal.json"), "evidence");
  const blockedBefore = snapshot(target), blocked = run([], target);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /incomplete.*\/flow-skills-sync restore/i);
  assert.deepEqual(snapshot(target), blockedBefore);
});

test("ready empty destination previews and installs every committed HEAD asset", () => {
  const target = destination(), configBytes = seedConfig(target);
  const plan = preview(target);
  assert.equal(plan.target.commit, committedHead);
  assert.deepEqual(plan.counts, { add: committedLock.totals.count, change: 0, delete: 0 });
  assert.deepEqual(plan.totals, committedLock.totals);
  assert.equal(plan.configuration.ready, true);
  assert.match(plan.applyCommand, new RegExp(plan.planId));
  assert.match(plan.applyCommand, new RegExp(plan.target.commit));

  const result = json(apply(target, plan));
  assert.equal(result.verified, true);
  assert.deepEqual(result.counts, plan.counts);
  assert.deepEqual(result.totals, committedLock.totals);
  assert.equal(result.configChanged, false);
  assert.equal(result.gitChanged, false);
  assert.equal(result.restartRequired, true);
  assert.deepEqual(fs.readFileSync(path.join(target, "opencode.json"), "utf8"), configBytes);
  for (const entry of committedLock.files) {
    const installed = path.join(target, ...entry.path.split("/"));
    assert.equal(fs.existsSync(installed), true, entry.path);
    assert.equal(digest(fs.readFileSync(installed)), entry.sha256, entry.path);
  }
});

test("apply requires both accepted IDs and rejects target or destination drift before backup", () => {
  const target = destination(); seedConfig(target);
  for (const args of [
    ["--apply"],
    ["--apply", "--expected-target-commit", "a".repeat(40)],
    ["--apply", "--expected-plan-id", "b".repeat(64)],
  ]) {
    const result = run(args, target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires both/i);
  }

  const plan = preview(target), before = snapshot(target);
  const moved = run(["--apply", "--expected-target-commit", "0".repeat(40), "--expected-plan-id", plan.planId], target);
  assert.equal(moved.status, 1); assert.match(moved.stderr, /target commit changed/i);
  assert.deepEqual(snapshot(target), before);

  fs.mkdirSync(path.join(target, "scripts"));
  fs.writeFileSync(path.join(target, "scripts", "flow-drift.mjs"), "drift\n");
  const drifted = snapshot(target), stale = apply(target, plan);
  assert.equal(stale.status, 1); assert.match(stale.stderr, /stale restore plan ID/i);
  assert.deepEqual(snapshot(target), drifted);
  assert.equal(fs.existsSync(path.join(target, ".flow-skills", "backups")), false);
});

test("existing managed assets receive a persistent verified backup and unrelated files survive", () => {
  const target = destination(); seedConfig(target);
  const managed = committedLock.files[0].path, managedPath = path.join(target, ...managed.split("/"));
  fs.mkdirSync(path.dirname(managedPath), { recursive: true }); fs.writeFileSync(managedPath, "previous bytes\n");
  const unrelated = path.join(target, "scripts", "personal-tool.mjs");
  fs.mkdirSync(path.dirname(unrelated), { recursive: true }); fs.writeFileSync(unrelated, "personal\n");
  const plan = preview(target), result = json(apply(target, plan));
  assert.equal(result.counts.change, 1);
  assert.equal(fs.readFileSync(path.join(result.backup.path, "files", ...managed.split("/")), "utf8"), "previous bytes\n");
  const metadata = JSON.parse(fs.readFileSync(path.join(result.backup.path, "backup.json"), "utf8"));
  assert.equal(metadata.planId, plan.planId);
  assert.equal(metadata.targetCommit, plan.target.commit);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "personal\n");
});

test("configuration blockers are minimal, secret-free, and fail apply before mutation", async (t) => {
  const required = { agent: { "gentle-orchestrator": {
    tools: { task: true }, permission: { task: { "*": "deny", "flow-pr-agent": "allow" } },
  } } };
  const cases = [
    ["missing", null, /missing/i],
    ["malformed", "{bad", /malformed/i],
    ["null", "null", /must contain a JSON object/i],
    ["false", "false", /must contain a JSON object/i],
    ["zero", "0", /must contain a JSON object/i],
    ["string", JSON.stringify("not an object"), /must contain a JSON object/i],
    ["array", "[]", /must contain a JSON object/i],
    ["task tool disabled", JSON.stringify({ agent: { "gentle-orchestrator": { tools: { task: false }, permission: { task: { "*": "deny", "flow-pr-agent": "allow" } } } } }), /tools\.task/i],
    ["unsafe task default", JSON.stringify({ agent: { "gentle-orchestrator": { tools: { task: true }, permission: { task: { "*": "allow", "flow-pr-agent": "allow" } } } } }), /must be 'deny'/i],
    ["missing executor", JSON.stringify({ agent: { "gentle-orchestrator": { tools: { task: true }, permission: { task: { "*": "deny" } } } } }), /flow-pr-agent/i],
  ];
  for (const [name, bytes, blocker] of cases) await t.test(name, () => {
    const target = destination(); if (bytes != null) fs.writeFileSync(path.join(target, "opencode.json"), bytes);
    const plan = preview(target);
    assert.equal(plan.configuration.ready, false);
    assert.equal(plan.applySupported, false);
    assert.deepEqual(plan.configuration.required, required);
    assert.match(plan.configuration.blockers.join(" "), blocker);
    assert.doesNotMatch(JSON.stringify(plan), /must-not-leak|provider|test-model/);
    const before = snapshot(target), result = apply(target, plan);
    assert.equal(result.status, 1); assert.match(result.stderr, /configuration is not ready/i);
    assert.deepEqual(snapshot(target), before);
  });
});

test("configuration readiness is revalidated after preview and opencode.json remains byte-identical", () => {
  const target = destination(), bytes = seedConfig(target), plan = preview(target);
  fs.writeFileSync(path.join(target, "opencode.json"), bytes.replace('"task":true', '"task":false'));
  const before = snapshot(target), result = apply(target, plan);
  assert.equal(result.status, 1); assert.match(result.stderr, /configuration is not ready/i);
  assert.deepEqual(snapshot(target), before);
  assert.equal(fs.existsSync(path.join(target, ".flow-skills", "backups")), false);
});

test("legacy, unknown, duplicate, missing-value, and conflicting arguments fail closed", () => {
  const target = destination(); seedConfig(target);
  const cases = [
    [["--export"], /flow-skills-sync snapshot/i],
    [["--uninstall"], /no longer provided/i],
    [["--update"], /pull the repository explicitly/i],
    [["--ref", "HEAD"], /flow-skills-sync restore/i],
    [["--wat"], /unsupported argument/i],
    [["--destination"], /missing value/i],
    [["--destination", target, "--destination", target], /duplicate argument/i],
    [["--apply", "--dry-run"], /conflicts/i],
    [["--help", "--dry-run"], /does not accept/i],
    [["--expected-plan-id", "id"], /only with --apply/i],
  ];
  for (const [args, expected] of cases) {
    const before = snapshot(target), result = run(args, target);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, expected);
    assert.deepEqual(snapshot(target), before);
  }
});

test("destination precedence and arbitrary working directories are supported", () => {
  const envTarget = destination(), cliTarget = destination(), cwd = destination();
  seedConfig(envTarget); seedConfig(cliTarget);
  const fromEnv = preview(envTarget);
  const fromCli = json(run(["--destination", cliTarget], envTarget, { cwd }));
  assert.equal(fromEnv.destination, path.resolve(envTarget));
  assert.equal(fromCli.destination, path.resolve(cliTarget));
  assert.equal(fromCli.target.commit, fromEnv.target.commit);
});

test("--help is read-only", () => {
  const target = destination(); seedConfig(target);
  const before = snapshot(target), result = run(["--help"], target, { cwd: destination() });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Preview is the default/);
  assert.deepEqual(snapshot(target), before);
});
