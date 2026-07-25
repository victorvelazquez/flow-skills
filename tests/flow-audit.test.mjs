import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDotnetFormatExecution } from "../scripts/lib/dotnet-format.mjs";
import {
  getCandidateFingerprint,
  getCachePath,
  readPassCache,
  writePassCache,
} from "../scripts/lib/flow-audit-cache.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "flow-audit.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function makeRepo(packageJson = null) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-audit-canonical-"));
  git(cwd, ["init", "-q", "-b", "main"]);
  git(cwd, ["config", "user.email", "flow-audit@example.test"]);
  git(cwd, ["config", "user.name", "Flow Audit Test"]);
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n");
  if (packageJson) {
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify(packageJson));
    fs.writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3, packages: { "": { name: "fixture" } } }));
  }
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "initial"]);
  return cwd;
}

function run(cwd, args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("publication evidence binds exact base, candidate, merge base, and paths", () => {
  const cwd = makeRepo();
  git(cwd, ["checkout", "-qb", "integration"]);
  fs.writeFileSync(path.join(cwd, "candidate.txt"), "candidate\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "candidate"]);
  const candidate = getCandidateFingerprint(cwd, { baseRef: "main", candidateRef: "integration" });
  assert.equal(candidate.publication.mergeBase, candidate.publication.publicationBaseCommit);
  assert.deepEqual(candidate.publication.changedPaths, ["candidate.txt"]);
  assert.ok(candidate.publication.pathsDigest);
});

test("delivery cache accepts only exact fresh PASS publication evidence", () => {
  const cwd = makeRepo();
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "flow-audit-cache-"));
  const previous = process.env.FLOW_AUDIT_CACHE_DIR;
  process.env.FLOW_AUDIT_CACHE_DIR = cache;
  try {
    const candidate = getCandidateFingerprint(cwd, { toolConfigDigest: "a".repeat(64) });
    writePassCache(candidate, { overallStatus: "PASS", details: [
      { tool: "fixture", command: "fixture", status: "passed", exitCode: 0, stdout: "ok", stderr: "" },
    ] });
    assert.ok(readPassCache(candidate));
    assert.equal(readPassCache(getCandidateFingerprint(cwd, { toolConfigDigest: "b".repeat(64) })), null);

    const cachePath = getCachePath(candidate.repoIdentity);
    const forged = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    forged.checks[0].stdoutHash = "0".repeat(64);
    fs.writeFileSync(cachePath, JSON.stringify(forged));
    assert.equal(readPassCache(candidate), null);

    writePassCache(candidate, { overallStatus: "PASS", details: [
      { tool: "fixture", command: "fixture", status: "passed", exitCode: 0, stdout: "ok", stderr: "" },
    ] });
    fs.appendFileSync(path.join(cwd, "tracked.txt"), "changed\n");
    assert.equal(readPassCache(getCandidateFingerprint(cwd, { toolConfigDigest: "a".repeat(64) })), null);
  } finally {
    if (previous === undefined) delete process.env.FLOW_AUDIT_CACHE_DIR;
    else process.env.FLOW_AUDIT_CACHE_DIR = previous;
  }
});

test("dotnet formatter passes every Git-controlled path as an exact argv element", () => {
  const paths = [
    "src/space name.cs",
    "src/semi;&meta.cs",
    "src/%PATH%.cs",
    "src/single'quote.cs",
    'src/double"quote.cs',
    "src\\windows\\separator.cs",
  ];
  const execution = buildDotnetFormatExecution('"solution with space.sln"', paths);
  assert.equal(execution.file, "dotnet");
  assert.deepEqual(execution.args, [
    "format", "solution with space.sln", "--verify-no-changes", "--include", ...paths,
  ]);
  assert.doesNotMatch(execution.command, /--include src\/space name\.cs/);
});

test("checks-only reuses exact PASS evidence and fails on stale candidates", () => {
  const cwd = makeRepo({ scripts: { test: "node -e \"process.exit(0)\"" } });
  git(cwd, ["checkout", "-qb", "integration"]);
  fs.writeFileSync(path.join(cwd, "candidate.txt"), "candidate\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "candidate"]);
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "flow-audit-cache-"));
  const first = run(cwd, ["--checks-only", "--base-ref", "main", "--candidate-ref", "integration"], { FLOW_AUDIT_CACHE_DIR: cache });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(JSON.parse(first.stdout).evidence.source, "fresh");
  const hit = run(cwd, ["--checks-only", "--base-ref", "main", "--candidate-ref", "integration"], { FLOW_AUDIT_CACHE_DIR: cache });
  assert.equal(hit.status, 0);
  assert.equal(JSON.parse(hit.stdout).evidence.source, "local-cache");
  const forced = run(cwd, ["--checks-only", "--base-ref", "main", "--candidate-ref", "integration", "--no-pass-cache"], { FLOW_AUDIT_CACHE_DIR: cache });
  assert.equal(forced.status, 0, forced.stdout + forced.stderr);
  assert.deepEqual(JSON.parse(forced.stdout).evidence, {
    source: "fresh",
    advisory: false,
    authoritative: true,
    written: false,
  });
  fs.appendFileSync(path.join(cwd, "candidate.txt"), "dirty\n");
  const stale = run(cwd, ["--checks-only", "--base-ref", "main", "--candidate-ref", "integration"], { FLOW_AUDIT_CACHE_DIR: cache });
  assert.equal(stale.status, 0);
  assert.equal(JSON.parse(stale.stdout).evidence.source, "fresh");
});

test("candidate-scoped dotnet format ignores untouched debt and rejects changed formatting", { skip: spawnSync("dotnet", ["--version"], { encoding: "utf8" }).status !== 0 }, () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-audit-dotnet-"));
  git(cwd, ["init", "-q", "-b", "main"]);
  git(cwd, ["config", "user.email", "flow-audit@example.test"]);
  git(cwd, ["config", "user.name", "Flow Audit Test"]);
  fs.writeFileSync(path.join(cwd, ".gitignore"), "bin/\nobj/\n");
  fs.writeFileSync(path.join(cwd, "Fixture.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n');
  fs.writeFileSync(path.join(cwd, "Debt.cs"), "public class Debt{public int Value=>1;}\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "initial debt"]);
  git(cwd, ["checkout", "-qb", "integration"]);
  fs.writeFileSync(path.join(cwd, "Changed.cs"), "public class Changed\n{\n    public int Value => 2;\n}\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "formatted candidate"]);
  const pass = run(cwd, ["--checks-only", "--base-ref", "main", "--candidate-ref", "integration", "--no-pass-cache"]);
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  const detail = JSON.parse(pass.stdout).automated.details.find((item) => item.tool === "dotnet-format");
  assert.match(detail.command, /Changed\.cs/);
  assert.doesNotMatch(detail.command, /Debt\.cs/);
  fs.writeFileSync(path.join(cwd, "Changed.cs"), "public class Changed{public int Value=>3;}\n");
  git(cwd, ["commit", "-qam", "bad candidate formatting"]);
  const fail = run(cwd, ["--checks-only", "--base-ref", "main", "--candidate-ref", "integration", "--no-pass-cache"]);
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout).automated.details.find((item) => item.tool === "dotnet-format").status, "failed");
});

test("single-tool failures preserve complete output", () => {
  const marker = "END-OF-FAILURE";
  const cwd = makeRepo({ scripts: { test: `node -e "process.stdout.write('x'.repeat(100000)+'${marker}');process.exit(2)"` } });
  const result = run(cwd, ["--run", "test"]);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "failed");
  assert.match(output.stdout, new RegExp(marker));
  assert.ok(output.stdout.length > 100000);
});
