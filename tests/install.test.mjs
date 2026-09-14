import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function copyFixtureFile(repo, relative) {
  const source = path.join(workspace, ...relative.split("/"));
  const destination = path.join(repo, ...relative.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function fixtureRepository() {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-skills-installer-"),
  );
  const repo = path.join(parent, "repo");
  fs.mkdirSync(repo);
  const generation = JSON.parse(
    fs.readFileSync(path.join(workspace, "flow-generation.lock.json"), "utf8"),
  );
  const required = new Set([
    ".gitattributes",
    "install.mjs",
    "package.json",
    "flow-generation.lock.json",
    "hosts/pi/flow-assets.json",
    "hosts/pi/flow-assets.lock.json",
    "hosts/opencode/flow-assets.json",
    "hosts/opencode/flow-assets.lock.json",
    ...generation.sources.map(({ source }) => source),
  ]);
  for (const relative of required) copyFixtureFile(repo, relative);
  fs.cpSync(path.join(workspace, "tools"), path.join(repo, "tools"), {
    recursive: true,
  });
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  git(repo, ["config", "user.email", "test@example.test"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "fixture"]);
  return {
    repo,
    installer: path.join(repo, "install.mjs"),
    commit: git(repo, ["rev-parse", "HEAD"]),
    lock: JSON.parse(
      fs.readFileSync(
        path.join(repo, "hosts/opencode/flow-assets.lock.json"),
        "utf8",
      ),
    ),
  };
}

function destination() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-bootstrap-"));
}

function seedConfig(target) {
  const config = {
    $schema: "https://opencode.ai/config.json",
    agent: { "gentle-orchestrator": { model: "openai/test-model" } },
    provider: { custom: { token: "must-not-leak" } },
  };
  const bytes = ` ${JSON.stringify(config)}\r\n`;
  fs.writeFileSync(path.join(target, "opencode.json"), bytes);
  return bytes;
}

function snapshot(root) {
  const files = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else files[relative] = digest(fs.readFileSync(absolute));
    }
  };
  visit(root);
  return files;
}

function run(fixture, args, target, options = {}) {
  return spawnSync(process.execPath, [fixture.installer, ...args], {
    cwd: options.cwd || fixture.repo,
    encoding: "utf8",
    env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target, ...options.env },
  });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function preview(fixture, target, args = []) {
  return json(run(fixture, args, target));
}

function apply(fixture, target, plan, args = []) {
  return run(
    fixture,
    [
      "--apply",
      "--expected-target-commit",
      plan.target.commit,
      "--expected-plan-id",
      plan.planId,
      ...args,
    ],
    target,
  );
}

test("no-argument OpenCode HEAD preview and --dry-run are read-only", () => {
  const fixture = fixtureRepository();
  const target = destination();
  seedConfig(target);
  const before = snapshot(target);
  const first = preview(fixture, target);
  const alias = preview(fixture, target, ["--dry-run"]);
  assert.equal(first.mode, "preview");
  assert.equal(first.host, "opencode");
  assert.equal(first.requestedRef, "HEAD");
  assert.equal(first.target.commit, fixture.commit);
  assert.equal(first.stateChanged, false);
  assert.equal(first.planId, alias.planId);
  assert.deepEqual(snapshot(target), before);

  const transaction = path.join(
    target,
    ".flow-skills",
    "transactions",
    "opencode-deploy",
    "transaction",
  );
  fs.mkdirSync(transaction, { recursive: true });
  fs.writeFileSync(path.join(transaction, "journal.json"), "evidence");
  const blockedBefore = snapshot(target);
  const blocked = run(fixture, [], target);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /incomplete OpenCode deployment transaction/i);
  assert.deepEqual(snapshot(target), blockedBefore);
});

test("installer deploys only the committed OpenCode generation and preserves host configuration", () => {
  const fixture = fixtureRepository();
  const target = destination();
  const configBytes = seedConfig(target);
  const plan = preview(fixture, target);
  assert.deepEqual(plan.counts, {
    add: fixture.lock.totals.count,
    change: 0,
    delete: 0,
  });
  assert.equal(plan.applySupported, true);
  assert.match(plan.applyCommand, new RegExp(plan.planId));
  assert.match(plan.applyCommand, new RegExp(plan.target.commit));
  assert.match(plan.applyCommand, /--host opencode/);
  assert.doesNotMatch(
    JSON.stringify(plan),
    /gentle-orchestrator|must-not-leak/,
  );

  const result = json(apply(fixture, target, plan));
  assert.equal(result.host, "opencode");
  assert.equal(result.verified, true);
  assert.deepEqual(result.counts, plan.counts);
  assert.equal(result.configChanged, false);
  assert.equal(
    fs.readFileSync(path.join(target, "opencode.json"), "utf8"),
    configBytes,
  );
  for (const entry of fixture.lock.records) {
    const installed = path.join(target, ...entry.destination.split("/"));
    assert.equal(fs.existsSync(installed), true, entry.destination);
    assert.equal(
      digest(fs.readFileSync(installed)),
      entry.sha256,
      entry.destination,
    );
  }
});

test("apply requires exact target and plan identities and rejects destination drift before backup", () => {
  const fixture = fixtureRepository();
  const target = destination();
  seedConfig(target);
  for (const args of [
    ["--apply"],
    ["--apply", "--expected-target-commit", "a".repeat(40)],
    ["--apply", "--expected-plan-id", "b".repeat(64)],
  ]) {
    const result = run(fixture, args, target);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, /requires both/i);
  }

  const plan = preview(fixture, target);
  const before = snapshot(target);
  const moved = run(
    fixture,
    [
      "--apply",
      "--expected-target-commit",
      "0".repeat(40),
      "--expected-plan-id",
      plan.planId,
    ],
    target,
  );
  assert.equal(moved.status, 1);
  assert.match(moved.stderr, /target commit changed/i);
  assert.deepEqual(snapshot(target), before);

  json(apply(fixture, target, plan));
  const accepted = preview(fixture, target);
  const managed = fixture.lock.records[0].destination;
  const managedPath = path.join(target, ...managed.split("/"));
  fs.writeFileSync(managedPath, "drift\n");
  const drifted = snapshot(target);
  const stale = apply(fixture, target, accepted);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale OpenCode deployment plan ID/i);
  assert.deepEqual(snapshot(target), drifted);
});

test("--host pi fails with Pi package guidance without reading or writing host configuration", () => {
  const fixture = fixtureRepository();
  const target = destination();
  const configBytes = seedConfig(target);
  const before = snapshot(target);
  const result = run(fixture, ["--host", "pi"], target);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Pi.*package.*pi install/i);
  assert.deepEqual(snapshot(target), before);
  assert.equal(
    fs.readFileSync(path.join(target, "opencode.json"), "utf8"),
    configBytes,
  );
});

test("destination precedence and arbitrary working directories are supported", () => {
  const fixture = fixtureRepository();
  const envTarget = destination();
  const cliTarget = destination();
  const cwd = destination();
  seedConfig(envTarget);
  seedConfig(cliTarget);
  const fromEnv = preview(fixture, envTarget);
  const fromCli = json(
    run(fixture, ["--destination", cliTarget], envTarget, { cwd }),
  );
  assert.equal(fromEnv.destination, path.resolve(envTarget));
  assert.equal(fromCli.destination, path.resolve(cliTarget));
  assert.equal(fromCli.target.commit, fromEnv.target.commit);
});

test("legacy, unknown, duplicate, missing-value, and conflicting arguments fail closed", () => {
  const fixture = fixtureRepository();
  const target = destination();
  seedConfig(target);
  const cases = [
    [
      ["--export"],
      /work from the repository.*node install\.mjs.*--host opencode/i,
    ],
    [["--uninstall"], /no longer provided/i],
    [["--update"], /pull the repository explicitly/i],
    [
      ["--ref", "HEAD"],
      /work from the repository.*node install\.mjs.*--host opencode/i,
    ],
    [["--wat"], /unsupported argument/i],
    [["--host", "other"], /only supports.*opencode/i],
    [["--destination"], /missing value/i],
    [["--destination", target, "--destination", target], /duplicate argument/i],
    [["--apply", "--dry-run"], /conflicts/i],
    [["--help", "--dry-run"], /does not accept/i],
    [["--expected-plan-id", "id"], /only with --apply/i],
  ];
  for (const [args, expected] of cases) {
    const before = snapshot(target);
    const result = run(fixture, args, target);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, expected);
    if (["--export", "--ref"].includes(args[0]))
      assert.doesNotMatch(result.stderr, /flow-skills-sync/i);
    assert.deepEqual(snapshot(target), before);
  }
});

test("--help identifies the OpenCode-only compatibility boundary and remains read-only", () => {
  const fixture = fixtureRepository();
  const target = destination();
  seedConfig(target);
  const before = snapshot(target);
  const result = run(fixture, ["--help"], target, { cwd: destination() });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Preview is the default/);
  assert.match(result.stdout, /Host: opencode/i);
  assert.match(result.stdout, /pi install/i);
  assert.deepEqual(snapshot(target), before);
});
