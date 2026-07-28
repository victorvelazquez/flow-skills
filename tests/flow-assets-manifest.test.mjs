import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  applySnapshot,
  buildPlan,
  collectManagedFiles,
  sha256,
  statusSnapshot,
  transactionRoot,
  validateFileKind,
  validateManifest,
  validateRelativePath,
  verifyLock,
} from "../tools/flow-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifestFixture = {
  $schema: "flow-assets/v1",
  excluded: [],
  liveMirrored: {
    libraries: [],
    patterns: [
      { path: "agents/flow-*.md" },
      { path: "commands/flow-*.md" },
      { path: "scripts/flow-*.mjs" },
      { path: "skills/flow-*/**" },
      { path: "skills/ui-design-system/**", reason: "fixture" },
    ],
  },
  repoOwned: [],
};

function write(rootPath, relative, contents) {
  const target = path.join(rootPath, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "flow-assets-plan-"));
  const source = path.join(parent, "live");
  const repo = path.join(parent, "repo");
  fs.mkdirSync(source);
  fs.mkdirSync(repo);
  write(repo, "flow-assets.json", `${JSON.stringify(manifestFixture, null, 2)}\n`);
  return { source, repo, manifest: validateManifest(manifestFixture) };
}

function state(rootPath) {
  const output = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(rootPath, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else output[relative] = sha256(fs.readFileSync(absolute));
    }
  };
  visit(rootPath);
  return output;
}

const metadata = {
  capturedAt: "2026-07-23T12:00:00.000Z",
  opencodeVersion: "test-opencode",
  gentleAiVersion: "test-gentle-ai",
};

test("manifest and lock define a deterministic, complete, safe mirror", () => {
  const manifestBytes = fs.readFileSync(path.join(root, "flow-assets.json"));
  const manifest = validateManifest(JSON.parse(manifestBytes));
  const lockBytes = fs.readFileSync(path.join(root, "flow-assets.lock.json"));
  const lock = verifyLock(root);

  assert.equal(lock.$schema, "flow-assets-lock/v1");
  assert.equal(lock.source.kind, "opencode-user-config");
  assert.equal(lock.manifest.sha256, sha256(manifestBytes));
  assert.deepEqual(lock.files.map((entry) => entry.path), [...lock.files.map((entry) => entry.path)].sort());
  assert.equal(new Set(lock.files.map((entry) => entry.path)).size, lock.files.length);
  assert.deepEqual(collectManagedFiles(root, manifest), lock.files.map((entry) => entry.path));
  assert.deepEqual(lockBytes, Buffer.from(`${JSON.stringify(lock, null, 2)}\n`));
  assert.doesNotMatch(lockBytes.toString("utf8"), /(?:[A-Za-z]:\\|\/Users\/|credentials|token|secret)/i);

  assert.ok(manifest.liveMirrored.libraries.length > 0);
  assert.ok(manifest.liveMirrored.libraries.every((entry) => entry.startsWith("scripts/lib/") && !entry.includes("*")));
  assert.ok(!manifest.liveMirrored.libraries.includes("scripts/lib/flow-work-units.mjs"));
  assert.ok(!lock.files.some((entry) => entry.path === "scripts/lib/flow-work-units.mjs"));
  assert.ok(!lock.files.some((entry) => entry.path === "skills/flow-commit/references/review-delivery.md"));
  assert.ok(manifest.liveMirrored.patterns.find((entry) => entry.path === "skills/ui-design-system/**")?.reason);
  assert.ok(manifest.excluded.includes("opencode.json"));
  assert.ok(manifest.excluded.includes("scripts/tests/**"));
  assert.ok(manifest.repoOwned.includes(".gitattributes"));
  assert.ok(!lock.files.some((entry) => entry.path === ".gitattributes"));

  const attributeLines = fs.readFileSync(path.join(root, ".gitattributes"), "utf8").split(/\r?\n/).filter(Boolean);
  const expectedAttributes = [...manifest.liveMirrored.patterns.map((entry) => entry.path), ...manifest.liveMirrored.libraries]
    .map((entry) => `${entry} -text`).sort();
  assert.deepEqual([...attributeLines].sort(), expectedAttributes);

  for (const entry of lock.files) {
    assert.equal(entry.mode, "100644");
    assert.equal(entry.executable, false);
    assert.ok(!entry.path.startsWith("tests/"));
    assert.ok(!["install.mjs", "README.md", "CHANGELOG.md", "package.json", ".gitignore"].includes(entry.path));
    assert.match(execFileSync("git", ["check-attr", "text", "--", entry.path], { cwd: root, encoding: "utf8" }).trim(), /: text: unset$/);
    const bytes = fs.readFileSync(path.join(root, ...entry.path.split("/")));
    const expectedOid = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(execFileSync("git", ["hash-object", `--path=${entry.path}`, "--", entry.path], { cwd: root, encoding: "utf8" }).trim(), expectedOid);
    assert.equal(sha256(bytes), entry.sha256);
    assert.equal(bytes.length, entry.bytes);
  }
});

test("targeted reconciliation preserves unrelated dirty-file preimages and lock records", () => {
  const item = fixture();
  const fixtureManifest = {
    ...manifestFixture,
    liveMirrored: {
      ...manifestFixture.liveMirrored,
      libraries: ["scripts/lib/flow-target.mjs"],
    },
  };
  const manifestBytes = `${JSON.stringify(fixtureManifest, null, 2)}\n`;
  fs.writeFileSync(path.join(item.repo, "flow-assets.json"), manifestBytes);
  const manifest = validateManifest(fixtureManifest);
  for (const [relative, bytes] of [
    ["scripts/lib/flow-target.mjs", "before\n"],
    ["commands/flow-skills-sync.md", "unrelated command dirty bytes\n"],
    ["skills/flow-skills-sync/SKILL.md", "unrelated skill dirty bytes\n"],
  ]) {
    write(item.source, relative, bytes);
  }
  let plan = buildPlan(item.source, item.repo, manifest);
  applySnapshot({ sourceRoot: item.source, repoRoot: item.repo, expectedPlanId: plan.planId, metadata });
  const unrelatedPaths = ["commands/flow-skills-sync.md", "skills/flow-skills-sync/SKILL.md"];
  const beforeBytes = new Map(unrelatedPaths.map((relative) => [relative, fs.readFileSync(path.join(item.repo, ...relative.split("/")))]));
  const beforeRecords = new Map(verifyLock(item.repo).files
    .filter((entry) => unrelatedPaths.includes(entry.path))
    .map((entry) => [entry.path, structuredClone(entry)]));

  write(item.source, "scripts/lib/flow-target.mjs", "targeted replacement\n");
  plan = buildPlan(item.source, item.repo, manifest);
  assert.deepEqual(plan.operations, [{ action: "change", path: "scripts/lib/flow-target.mjs" }]);
  applySnapshot({ sourceRoot: item.source, repoRoot: item.repo, expectedPlanId: plan.planId, metadata });

  const afterLock = verifyLock(item.repo);
  for (const relative of unrelatedPaths) {
    assert.deepEqual(fs.readFileSync(path.join(item.repo, ...relative.split("/"))), beforeBytes.get(relative));
    assert.deepEqual(afterLock.files.find((entry) => entry.path === relative), beforeRecords.get(relative));
  }
});

test("validation rejects traversal, secret-like paths, and symbolic links", () => {
  for (const fixture of [
    "../opencode.json",
    "/absolute/flow.md",
    "skills\\flow-x\\SKILL.md",
    "opencode.json",
    "auth.json",
    "credentials/token.json",
    "provider.json",
    "skills/flow-x/.env.production",
    "scripts/tests/installed-residue.mjs",
  ]) {
    assert.throws(() => validateRelativePath(fixture), fixture);
  }
  assert.throws(() => validateFileKind("skills/flow-x/link", {
    isSymbolicLink: () => true,
    isFile: () => false,
    isDirectory: () => false,
  }), /Symbolic links/);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flow-assets-safe-"));
  fs.writeFileSync(path.join(fixtureRoot, "safe.txt"), "safe\n");
  assert.equal(fs.readFileSync(path.join(fixtureRoot, validateRelativePath("safe.txt")), "utf8"), "safe\n");
});

test("status reports identical mirrors with zero counts", () => {
  const { source, repo, manifest } = fixture();
  write(source, "scripts/flow-z.mjs", "same\n");
  write(repo, "scripts/flow-z.mjs", "same\n");

  assert.deepEqual(statusSnapshot(source, repo, manifest), {
    status: "synchronized",
    synchronized: true,
    counts: { add: 0, change: 0, delete: 0 },
  });
});

test("snapshot preview is sorted, stable, and read-only", () => {
  const { source, repo, manifest } = fixture();
  write(source, "scripts/flow-z.mjs", "add z\n");
  write(source, "scripts/flow-a.mjs", "add a\n");
  write(source, "commands/flow-z.md", "new z\n");
  write(source, "commands/flow-a.md", "new a\n");
  write(repo, "commands/flow-z.md", "old z\n");
  write(repo, "commands/flow-a.md", "old a\n");
  write(repo, "agents/flow-z.md", "delete z\n");
  write(repo, "agents/flow-a.md", "delete a\n");
  const sourceBefore = state(source);
  const repoBefore = state(repo);

  const first = buildPlan(source, repo, manifest);
  const second = buildPlan(source, repo, manifest);

  assert.deepEqual(first.add, ["scripts/flow-a.mjs", "scripts/flow-z.mjs"]);
  assert.deepEqual(first.change, ["commands/flow-a.md", "commands/flow-z.md"]);
  assert.deepEqual(first.delete, ["agents/flow-a.md", "agents/flow-z.md"]);
  assert.deepEqual(first.operations, [
    { action: "add", path: "scripts/flow-a.mjs" },
    { action: "add", path: "scripts/flow-z.mjs" },
    { action: "change", path: "commands/flow-a.md" },
    { action: "change", path: "commands/flow-z.md" },
    { action: "delete", path: "agents/flow-a.md" },
    { action: "delete", path: "agents/flow-z.md" },
  ]);
  assert.equal(first.planId, second.planId);
  assert.match(first.planId, /^[a-f0-9]{64}$/);
  assert.deepEqual(state(source), sourceBefore);
  assert.deepEqual(state(repo), repoBefore);
});

test("snapshot detects and preserves executable mode changes", { skip: process.platform === "win32" && "Windows does not expose Unix executable bits on temp files." }, () => {
  const { source, repo, manifest } = fixture();
  write(source, "scripts/flow-mode.mjs", "same\n");
  write(repo, "scripts/flow-mode.mjs", "same\n");
  fs.chmodSync(path.join(source, "scripts", "flow-mode.mjs"), 0o755);
  const plan = buildPlan(source, repo, manifest);
  assert.deepEqual(plan.change, ["scripts/flow-mode.mjs"]);
  applySnapshot({ sourceRoot: source, repoRoot: repo, expectedPlanId: plan.planId, metadata });
  assert.equal(Boolean(fs.statSync(path.join(repo, "scripts", "flow-mode.mjs")).mode & 0o111), true);
  assert.equal(verifyLock(repo).files[0].mode, "100755");
});

test("snapshot apply rejects missing and stale plan IDs with zero writes", () => {
  const sourceDrift = fixture();
  write(sourceDrift.source, "scripts/flow-a.mjs", "first\n");
  const sourcePlan = buildPlan(sourceDrift.source, sourceDrift.repo, sourceDrift.manifest);
  const sourceRepoBefore = state(sourceDrift.repo);
  assert.throws(() => applySnapshot({
    sourceRoot: sourceDrift.source,
    repoRoot: sourceDrift.repo,
    metadata,
  }), /expected plan ID/i);
  assert.deepEqual(state(sourceDrift.repo), sourceRepoBefore);
  write(sourceDrift.source, "scripts/flow-a.mjs", "drifted\n");
  assert.throws(() => applySnapshot({
    sourceRoot: sourceDrift.source,
    repoRoot: sourceDrift.repo,
    expectedPlanId: sourcePlan.planId,
    metadata,
  }), /stale plan ID/i);
  assert.deepEqual(state(sourceDrift.repo), sourceRepoBefore);

  const destinationDrift = fixture();
  write(destinationDrift.source, "scripts/flow-a.mjs", "live\n");
  write(destinationDrift.repo, "scripts/flow-a.mjs", "repo\n");
  const destinationPlan = buildPlan(destinationDrift.source, destinationDrift.repo, destinationDrift.manifest);
  write(destinationDrift.repo, "scripts/flow-a.mjs", "destination drift\n");
  const driftedRepoBefore = state(destinationDrift.repo);
  assert.throws(() => applySnapshot({
    sourceRoot: destinationDrift.source,
    repoRoot: destinationDrift.repo,
    expectedPlanId: destinationPlan.planId,
    metadata,
  }), /stale plan ID/i);
  assert.deepEqual(state(destinationDrift.repo), driftedRepoBefore);
});

test("exact plan ID applies, updates the lock, and verifies before success", () => {
  const { source, repo, manifest } = fixture();
  write(source, "scripts/flow-a.mjs", "live\n");
  const plan = buildPlan(source, repo, manifest);
  let verified = 0;

  const result = applySnapshot({
    sourceRoot: source,
    repoRoot: repo,
    expectedPlanId: plan.planId,
    metadata,
    verify: (repoRoot) => {
      verified += 1;
      return verifyLock(repoRoot);
    },
  });

  assert.equal(verified, 1);
  assert.equal(result.planId, plan.planId);
  assert.equal(result.verified, true);
  assert.equal(fs.readFileSync(path.join(repo, "scripts", "flow-a.mjs"), "utf8"), "live\n");
  assert.equal(verifyLock(repo).totals.count, 1);
});

test("injected apply failure rolls files and lock back", () => {
  const { source, repo, manifest } = fixture();
  write(source, "scripts/flow-a.mjs", "old a\n");
  write(source, "scripts/flow-b.mjs", "old b\n");
  const initial = buildPlan(source, repo, manifest);
  applySnapshot({ sourceRoot: source, repoRoot: repo, expectedPlanId: initial.planId, metadata });
  write(source, "scripts/flow-a.mjs", "new a\n");
  write(source, "scripts/flow-b.mjs", "new b\n");
  const plan = buildPlan(source, repo, manifest);
  const before = state(repo);

  assert.throws(() => applySnapshot({
    sourceRoot: source,
    repoRoot: repo,
    expectedPlanId: plan.planId,
    metadata,
    injectFailureAfterWrites: 1,
  }), /Injected snapshot failure/);
  assert.deepEqual(state(repo), before);
  verifyLock(repo);
});

test("engine CLI rejects unsupported snapshot arguments", () => {
  const result = spawnSync(process.execPath, [
    path.join(root, "tools", "flow-assets.mjs"),
    "--snapshot",
    "--source",
    root,
    "--dry-run",
    "--unknown",
  ], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported argument: --unknown/);
});

test("apply lock and spanning revalidation reject concurrent and drifted writes", () => {
  const locked = fixture(); write(locked.source, "scripts/flow-a.mjs", "live\n");
  const lockedPlan = buildPlan(locked.source, locked.repo, locked.manifest); const lockedBefore = state(locked.repo);
  applySnapshot({ sourceRoot: locked.source, repoRoot: locked.repo, expectedPlanId: lockedPlan.planId, metadata, afterLock: () => {
    assert.throws(() => applySnapshot({ sourceRoot: locked.source, repoRoot: locked.repo, expectedPlanId: lockedPlan.planId, metadata }), /already in progress/); assert.deepEqual(state(locked.repo), lockedBefore); } });
  for (const drift of ["source", "destination"]) {
    const item = fixture(); write(item.source, "scripts/flow-a.mjs", "live\n");
    if (drift === "destination") write(item.repo, "scripts/flow-a.mjs", "old\n");
    const plan = buildPlan(item.source, item.repo, item.manifest); const before = state(item.repo);
    assert.throws(() => applySnapshot({ sourceRoot: item.source, repoRoot: item.repo, expectedPlanId: plan.planId, metadata, afterPlan: () =>
      write(drift === "source" ? item.source : item.repo, "scripts/flow-a.mjs", "drift\n") }), /drifted/);
    if (drift === "source") assert.deepEqual(state(item.repo), before); else assert.equal(fs.readFileSync(path.join(item.repo, "scripts", "flow-a.mjs"), "utf8"), "drift\n");
    assert.equal(fs.existsSync(transactionRoot(item.repo)), false);
  }
});

test("next apply recovers a process interruption after backup and leaves no residue", () => {
  const item = fixture(); write(item.source, "scripts/flow-a.mjs", "old\n"); let plan = buildPlan(item.source, item.repo, item.manifest);
  applySnapshot({ sourceRoot: item.source, repoRoot: item.repo, expectedPlanId: plan.planId, metadata });
  write(item.source, "scripts/flow-a.mjs", "new\n"); plan = buildPlan(item.source, item.repo, item.manifest);
  const runner = path.join(path.dirname(item.repo), "interrupt.mjs"); fs.writeFileSync(runner, `import { applySnapshot } from ${JSON.stringify(pathToFileURL(path.join(root, "tools", "flow-assets.mjs")).href)};\napplySnapshot({sourceRoot:${JSON.stringify(item.source)},repoRoot:${JSON.stringify(item.repo)},expectedPlanId:${JSON.stringify(plan.planId)},metadata:${JSON.stringify(metadata)},afterBackup:()=>process.exit(86)});\n`);
  assert.equal(spawnSync(process.execPath, [runner]).status, 86);
  let recovered = false; const result = applySnapshot({ sourceRoot: item.source, repoRoot: item.repo, expectedPlanId: plan.planId, metadata, afterRecovery: () =>
    { recovered = fs.readFileSync(path.join(item.repo, "scripts", "flow-a.mjs"), "utf8") === "old\n"; } });
  assert.equal(recovered && result.verified, true);
  assert.equal(fs.existsSync(transactionRoot(item.repo)), false);
});
