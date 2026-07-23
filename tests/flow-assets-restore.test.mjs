import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildRestorePlan, sha256 } from "../tools/flow-assets.mjs";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engine = path.join(workspace, "tools", "flow-assets.mjs");
const patterns = ["agents/flow-*.md", "commands/flow-*.md", "scripts/flow-*.mjs", "skills/flow-*/**", "skills/ui-design-system/**"];

function git(cwd, args, input) {
  return execFileSync("git", args, { cwd, input, encoding: input == null ? "utf8" : undefined, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}

function write(root, relative, contents, mode = 0o644) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, { mode });
}

function manifest(libraries = []) {
  return { $schema: "flow-assets/v1", excluded: [], liveMirrored: { libraries, patterns: patterns.map((entry) => ({ path: entry, ...(entry === "skills/ui-design-system/**" ? { reason: "fixture" } : {}) })) }, repoOwned: [] };
}

function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "flow-assets-restore-"));
  const repo = path.join(parent, "history");
  const live = path.join(parent, "live");
  fs.mkdirSync(repo); fs.mkdirSync(live);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.test"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["config", "core.autocrlf", "true"]);
  return { parent, repo, live };
}

function commitGeneration(repo, files, options = {}) {
  const data = options.manifest || manifest(options.libraries);
  const manifestBytes = Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
  write(repo, "flow-assets.json", manifestBytes);
  for (const [relative, value] of Object.entries(files)) write(repo, relative, value.bytes, value.mode === "100755" ? 0o755 : 0o644);
  let records = Object.entries(files).map(([relative, value]) => ({ path: relative, sha256: sha256(value.bytes), bytes: value.bytes.length,
    mode: value.mode || "100644", executable: value.mode === "100755" })).sort((a, b) => a.path.localeCompare(b.path));
  let lock = { $schema: "flow-assets-lock/v1", capturedAt: "fixture", source: { kind: "opencode-user-config" },
    manifest: { sha256: sha256(manifestBytes) }, totals: { bytes: records.reduce((sum, entry) => sum + entry.bytes, 0), count: records.length }, files: records };
  if (options.mutateLock) lock = options.mutateLock(structuredClone(lock));
  write(repo, "flow-assets.lock.json", options.lockBytes || `${JSON.stringify(lock, null, 2)}\n`);
  git(repo, ["add", "."]);
  for (const record of records.filter((entry) => entry.mode === "100755")) git(repo, ["update-index", "--chmod=+x", "--", record.path]);
  if (options.treeMode) {
    const object = git(repo, ["hash-object", "-w", "--stdin"], Buffer.from("target"));
    git(repo, ["update-index", "--add", "--cacheinfo", `${options.treeMode},${object},scripts/flow-type.mjs`]);
  }
  git(repo, ["commit", "-qm", options.message || "fixture generation"]);
  return git(repo, ["rev-parse", "HEAD"]);
}

const file = (value, mode = "100644") => ({ bytes: Buffer.isBuffer(value) ? value : Buffer.from(value), mode });

test("byte-preserving attributes create the first restore-capable generation", () => {
  const generation = fixture();
  commitGeneration(generation.repo, { "scripts/flow-crlf.mjs": file("crlf\r\n") });
  assert.throws(() => buildRestorePlan({ requestedRef: "HEAD", destinationRoot: generation.live, repoRoot: generation.repo }), /blob record mismatch/i);
  write(generation.repo, ".gitattributes", fs.readFileSync(path.join(workspace, ".gitattributes")));
  git(generation.repo, ["add", ".gitattributes"]);
  git(generation.repo, ["add", "--renormalize", "--", "scripts/flow-crlf.mjs"]);
  git(generation.repo, ["commit", "-qm", "preserve asset bytes"]);
  assert.equal(buildRestorePlan({ requestedRef: "HEAD", destinationRoot: generation.live, repoRoot: generation.repo }).target.totals.count, 1);
});

test("full SHA, branch, and lightweight and annotated tags freeze the same generation", () => {
  const { repo, live } = fixture();
  const commit = commitGeneration(repo, { "scripts/flow-binary.mjs": file(Buffer.from([0, 255, 1])), "scripts/flow-run.mjs": file("run\n", "100755"), "skills/flow-x/SKILL.md": file("nested\n") });
  git(repo, ["tag", "light", commit]); git(repo, ["tag", "-a", "annotated", "-m", "fixture", commit]);
  const plans = [commit, "main", "light", "annotated"].map((requestedRef) => buildRestorePlan({ requestedRef, destinationRoot: live, repoRoot: repo }));
  assert.ok(plans.every((plan) => plan.target.commit === commit && plan.target.tree === plans[0].target.tree));
  assert.deepEqual(plans[0].operations, [
    { action: "add", path: "scripts/flow-binary.mjs" },
    { action: "add", path: "scripts/flow-run.mjs" },
    { action: "add", path: "skills/flow-x/SKILL.md" },
  ]);
  assert.equal(plans[0].target.files[1].mode, "100755");
  assert.equal(plans[0].applySupported, false);
  assert.equal(plans[0].requiredApplyIds.restorePlanId, plans[0].planId);
  assert.equal(plans[0].target.files.some((entry) => entry.path === "skills/flow-x/SKILL.md"), true);
});

test("shell-like refs are literal argv and are never executed", () => {
  const { parent, repo, live } = fixture(); commitGeneration(repo, { "scripts/flow-a.mjs": file("a\n") });
  const marker = path.join(parent, "executed");
  assert.throws(() => buildRestorePlan({ requestedRef: `HEAD;touch ${marker}`, destinationRoot: live, repoRoot: repo }), /resolve restore ref/i);
  assert.equal(fs.existsSync(marker), false);
});

test("historical generations fail closed on missing or malformed authority", async (t) => {
  const cases = [
    ["missing manifest", ({ repo }) => { write(repo, "flow-assets.lock.json", "{}\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "legacy"]); }, /manifest.*missing/i],
    ["missing lock", ({ repo }) => { write(repo, "flow-assets.json", `${JSON.stringify(manifest(), null, 2)}\n`); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "legacy"]); }, /lock.*missing/i],
    ["malformed manifest", ({ repo }) => { write(repo, "flow-assets.json", "{bad"); write(repo, "flow-assets.lock.json", "{}\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "bad"]); }, /manifest.*JSON/i],
    ["malformed lock", ({ repo }) => commitGeneration(repo, { "scripts/flow-a.mjs": file("a") }, { lockBytes: "{bad" }), /lock.*JSON/i],
    ["hash tampering", ({ repo }) => commitGeneration(repo, { "scripts/flow-a.mjs": file("a") }, { mutateLock: (lock) => { lock.files[0].sha256 = "0".repeat(64); return lock; } }), /blob record/i],
    ["size tampering", ({ repo }) => commitGeneration(repo, { "scripts/flow-a.mjs": file("a") }, { mutateLock: (lock) => { lock.files[0].bytes++; lock.totals.bytes++; return lock; } }), /blob record/i],
    ["mode tampering", ({ repo }) => commitGeneration(repo, { "scripts/flow-a.mjs": file("a") }, { mutateLock: (lock) => { lock.files[0].mode = "100755"; lock.files[0].executable = true; return lock; } }), /blob record/i],
    ["path tampering", ({ repo }) => commitGeneration(repo, { "scripts/flow-a.mjs": file("a") }, { mutateLock: (lock) => { lock.files[0].path = "scripts/flow-z.mjs"; return lock; } }), /ownership/i],
    ["type tampering", ({ repo }) => commitGeneration(repo, { "scripts/flow-type.mjs": file("target") }, { treeMode: "120000" }), /type|mode/i],
  ];
  for (const [name, setup, expected] of cases) await t.test(name, () => {
    const item = fixture(); setup(item);
    assert.throws(() => buildRestorePlan({ requestedRef: "HEAD", destinationRoot: item.live, repoRoot: item.repo }), expected);
  });
});

test("preview plans sorted add/change/mode-change/delete without unrelated files or writes", () => {
  const { repo, live } = fixture();
  commitGeneration(repo, {
    "agents/flow-add.md": file("add\n"), "commands/flow-change.md": file("new\n"),
    "scripts/flow-mode.mjs": file("same\n", "100755"),
  });
  write(live, "commands/flow-change.md", "old\n"); write(live, "scripts/flow-mode.mjs", "same\n");
  write(live, "skills/flow-old/SKILL.md", "old\n"); write(live, "skills/flow-old/cache/state.json", "cache\n");
  write(live, "opencode.json", "config\n"); write(live, "tests/unrelated.mjs", "test\n");
  const beforeRepo = git(repo, ["status", "--porcelain=v1"]), beforeLive = snapshot(live);
  const first = buildRestorePlan({ requestedRef: "HEAD", destinationRoot: live, repoRoot: repo });
  const second = buildRestorePlan({ requestedRef: "HEAD", destinationRoot: live, repoRoot: repo });
  assert.deepEqual(first.operations, [
    { action: "add", path: "agents/flow-add.md" }, { action: "change", path: "commands/flow-change.md" },
    { action: "change", path: "scripts/flow-mode.mjs" }, { action: "delete", path: "skills/flow-old/SKILL.md" },
  ]);
  assert.equal(first.planId, second.planId); assert.equal(git(repo, ["status", "--porcelain=v1"]), beforeRepo);
  assert.deepEqual(snapshot(live), beforeLive); assert.doesNotMatch(JSON.stringify(first), /cache\/state|opencode\.json|tests\/unrelated/);
});

test("plan ID changes with a moving ref, live state, or current manifest", () => {
  const { repo, live } = fixture(); commitGeneration(repo, { "scripts/flow-a.mjs": file("one\n") });
  const first = buildRestorePlan({ requestedRef: "main", destinationRoot: live, repoRoot: repo });
  write(live, "scripts/flow-a.mjs", "live\n");
  const liveDrift = buildRestorePlan({ requestedRef: "main", destinationRoot: live, repoRoot: repo });
  write(repo, "flow-assets.json", `${JSON.stringify(manifest(["scripts/lib/new.mjs"]), null, 2)}\n`);
  const manifestDrift = buildRestorePlan({ requestedRef: "main", destinationRoot: live, repoRoot: repo });
  git(repo, ["restore", "flow-assets.json"]); commitGeneration(repo, { "scripts/flow-a.mjs": file("two\n") });
  const moved = buildRestorePlan({ requestedRef: "main", destinationRoot: live, repoRoot: repo });
  assert.equal(new Set([first.planId, liveDrift.planId, manifestDrift.planId, moved.planId]).size, 4);
});

test("restore CLI rejects apply as unsupported in this work unit", () => {
  const live = fs.mkdtempSync(path.join(os.tmpdir(), "flow-assets-restore-cli-"));
  const result = spawnSync(process.execPath, [engine, "--restore", "--ref", "HEAD", "--destination", live, "--apply"], { encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /restore apply is unsupported/i);
});

function snapshot(root) {
  const result = {};
  const visit = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name), relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) visit(absolute); else result[relative] = { sha256: sha256(fs.readFileSync(absolute)), mode: fs.statSync(absolute).mode & 0o111 };
  } };
  visit(root); return result;
}
