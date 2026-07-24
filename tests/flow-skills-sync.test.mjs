import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = path.join(root, "scripts", "flow-skills.mjs");

function harness() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-wrapper-"));
  const repo = path.join(parent, "repo override");
  const live = path.join(parent, "live override");
  const unrelated = path.join(parent, "unrelated cwd");
  const capture = path.join(parent, "captured.json");
  fs.mkdirSync(path.join(repo, "tools"), { recursive: true });
  fs.mkdirSync(live);
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(repo, "tools", "flow-assets.mjs"), [
    'import fs from "node:fs";',
    'fs.writeFileSync(process.env.FLOW_CAPTURE, JSON.stringify(process.argv.slice(2)));',
    'if (process.env.FLOW_ENGINE_ERROR) { process.stderr.write(process.env.FLOW_ENGINE_ERROR); process.exit(3); }',
    'process.stdout.write(JSON.stringify({ ok: true, args: process.argv.slice(2) }) + "\\n");',
  ].join("\n"));
  return { parent, repo, live, unrelated, capture };
}

function run(args, fixture, overrides = {}) {
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: fixture.unrelated,
    encoding: "utf8",
    env: {
      ...process.env,
      FLOW_SKILLS_REPO: fixture.repo,
      FLOW_SKILLS_OPENCODE_DIR: fixture.live,
      FLOW_CAPTURE: fixture.capture,
      ...overrides,
    },
  });
}

test("wrapper works from arbitrary cwd with environment path overrides", () => {
  const fixture = harness();
  const result = run(["--status"], fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.capture, "utf8")), [
    "--status",
    "--source",
    fixture.live,
  ]);
});

test("wrapper forwards snapshot arguments and metadata byte-for-byte", () => {
  const fixture = harness();
  const args = [
    "--snapshot",
    "--apply",
    "--expected-plan-id",
    "abc 123",
    "--captured-at",
    "2026-07-23T12:34:56.789Z",
    "--opencode-version",
    "OpenCode version with spaces",
    "--gentle-ai-version",
    "Gentle AI version with spaces",
  ];
  const result = run(args, fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.capture, "utf8")), [
    "--snapshot",
    "--source",
    fixture.live,
    ...args.slice(1),
  ]);
});

test("wrapper reports clear missing repository and source blockers", () => {
  const fixture = harness();
  const missingRepo = run(["--status"], fixture, { FLOW_SKILLS_REPO: path.join(fixture.repo, "missing") });
  assert.notEqual(missingRepo.status, 0);
  assert.match(missingRepo.stderr, /Flow skills repository not found/);

  const missingSource = run(["--status"], fixture, { FLOW_SKILLS_OPENCODE_DIR: path.join(fixture.live, "missing") });
  assert.notEqual(missingSource.status, 0);
  assert.match(missingSource.stderr, /OpenCode source directory not found/);
});

test("wrapper rejects unsupported and mutation-prone legacy arguments", () => {
  const fixture = harness();
  for (const argument of ["--auto", "--context", "--run-export", "--update", "--source", "--verify"]) {
    const result = run([argument], fixture);
    assert.notEqual(result.status, 0, argument);
    assert.match(result.stderr, /Unsupported argument|Usage/);
  }
  const source = fs.readFileSync(wrapper, "utf8");
  assert.doesNotMatch(source, /git\s+(?:fetch|pull|commit|push)|install\.mjs|run-export/i);
});

test("restore preview forwards literal refs without mutation or shell evaluation", () => {
  for (const ref of ["feature/history", "v1.2.3", "a".repeat(40), "HEAD;touch should-not-exist"]) {
    const fixture = harness();
    const liveBefore = fs.readdirSync(fixture.live);
    const result = run(["restore", ref], fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(fixture.capture, "utf8")), [
      "--restore", "--ref", ref, "--destination", fixture.live, "--dry-run",
    ]);
    assert.deepEqual(fs.readdirSync(fixture.live), liveBefore);
    assert.equal(fs.existsSync(path.join(fixture.parent, "should-not-exist")), false);
  }
});

test("restore apply forwards exact authority IDs and surfaces engine blockers", () => {
  const fixture = harness();
  const args = ["restore", "release ref", "--apply", "--expected-target-commit", "commit value", "--expected-plan-id", "plan value"];
  const result = run(args, fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.capture, "utf8")), [
    "--restore", "--ref", "release ref", "--destination", fixture.live, "--apply",
    "--expected-target-commit", "commit value", "--expected-plan-id", "plan value",
  ]);
  const stale = run(args, fixture, { FLOW_ENGINE_ERROR: "Stale restore plan ID" });
  assert.equal(stale.status, 3); assert.match(stale.stderr, /Stale restore plan ID/);
});

test("restore rejects missing refs, incomplete authority, preview IDs, and unsupported flags", () => {
  const fixture = harness();
  for (const args of [
    ["restore"], ["restore", "HEAD", "--apply"],
    ["restore", "HEAD", "--apply", "--expected-target-commit", "commit"],
    ["restore", "HEAD", "--expected-plan-id", "plan"], ["restore", "HEAD", "--dry-run"],
    ["restore", "HEAD", "--backup-root", "elsewhere"],
  ]) {
    const result = run(args, fixture); assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, /restore|Unsupported|Usage/i);
  }
});

test("sync skill preserves snapshot and adds confirmation-bound restore without Git publication", () => {
  const skill = fs.readFileSync(path.join(root, "skills", "flow-skills-sync", "SKILL.md"), "utf8");
  const command = fs.readFileSync(path.join(root, "commands", "flow-skills-sync.md"), "utf8");

  assert.match(skill, /--snapshot --dry-run/);
  assert.match(skill, /explicit (?:user )?(?:authorization|confirmation)/i);
  assert.match(skill, /--expected-plan-id[= ]+<?planId>?/i);
  assert.match(skill, /exact.*planId/i);
  assert.match(skill, /restore <ref>/);
  assert.match(skill, /initial.*preview|first.*preview/i);
  assert.match(skill, /explicit confirmation/i);
  assert.match(skill, /target.*commit.*planId|planId.*target.*commit/is);
  assert.match(skill, /stale.*preview/i);
  assert.match(skill, /backup.*restart/i);
  assert.doesNotMatch(skill, /git\s+(?:commit|push)|\/flow-(?:commit|pr)/i);
  assert.match(command, /\$ARGUMENTS/);
  assert.match(command, /Working directory:/);
});
