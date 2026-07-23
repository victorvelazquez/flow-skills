import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPhysicalCommitGroups, parseNullDelimitedPaths, parsePorcelainStatus } from "../scripts/flow-commit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = path.join(root, "tests", "flow-commit-harness.mjs");
const nativePathsDigestHelper = new URL("./helpers/native-paths-digest.mjs", import.meta.url).href;

const files = [
  { path: "src/auth/change.mjs", feature: "auth", type: "source", status: "M", statuses: ["M"] },
  { path: "src/users/change.mjs", feature: "users", type: "source", status: "M", statuses: ["M"] },
  { path: "src/orders/change.mjs", feature: "orders", type: "source", status: "M", statuses: ["M"] },
  { path: "src/billing/change.mjs", feature: "billing", type: "source", status: "M", statuses: ["M"] },
];

test("four work units remain metadata but one reviewed physical group is planned", () => {
  const planning = buildPhysicalCommitGroups(files, { topology: "single" });
  assert.equal(planning.workUnits.length, 4);
  assert.equal(planning.groups.length, 1);
  assert.equal(planning.groups[0].key, "reviewed-delivery");
  assert.deepEqual(planning.groups[0].files.map((file) => file.path).sort(), files.map((file) => file.path).sort());
  assert.deepEqual(planning.groups[0].workUnitKeys, planning.workUnits.map((group) => group.key));
});

test("normal grouping is unchanged without single-delivery authority", () => {
  const planning = buildPhysicalCommitGroups(files, { topology: "grouped" });
  assert.equal(planning.groups, planning.workUnits);
  assert.equal(planning.groups.length, 4);
});

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function indexBytes(cwd) {
  const indexPath = git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  return fs.readFileSync(indexPath);
}

function stagedPaths(cwd) {
  return execFileSync("git", ["diff", "--cached", "--name-only", "-z", "HEAD", "--"], { cwd })
    .toString("utf8").split("\0").filter(Boolean).sort();
}

function makeRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-reviewed-"));
  git(cwd, ["init", "-q", "-b", "feat/reviewed-delivery"]);
  git(cwd, ["config", "user.email", "flow@example.test"]);
  git(cwd, ["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "chore: initial"]);
  for (const scope of ["auth", "users", "orders", "billing"]) {
    fs.mkdirSync(path.join(cwd, "src", scope), { recursive: true });
    fs.writeFileSync(path.join(cwd, "src", scope, "change.mjs"), `export const ${scope}Changed = true;\n`);
  }
  git(cwd, ["config", "flow.reviewLifecycle", "required"]);
  const gentle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "flow-gentle-mock-")), "gentle.mjs");
  const reviewEntry = path.join(cwd, ".git", "review-fixtures");
  fs.writeFileSync(gentle, `import {execFileSync} from "node:child_process";
import {nativePathsDigest} from ${JSON.stringify(nativePathsDigestHelper)};
import fs from "node:fs";
const a=process.argv.slice(2), op=a[1], git=(args)=>execFileSync("git",args,{encoding:"utf8",env:process.env}).trim();
 const revision=process.env.FLOW_AUTH_REVISION||"sha256:one", lineageIndex=a.indexOf("--lineage"), requestedLineage=lineageIndex>=0?a[lineageIndex+1]:null, returnedLineage=process.env.FLOW_RETURN_LINEAGE||requestedLineage||"review-task";
if(op==="status"){const index=git(["rev-parse","--git-path","flow-review-index-"+process.pid]),env={...process.env,GIT_INDEX_FILE:index},g=(args)=>execFileSync("git",args,{encoding:"utf8",env}).trim();g(["read-tree","HEAD"]);g(["add","--all"]);const paths=g(["diff","--cached","--name-only","-z","HEAD","--"]).split("\\0").filter(Boolean).sort(),digest=nativePathsDigest(paths),base=git(["rev-parse","HEAD^{tree}"]),tree=g(["write-tree"]);fs.rmSync(index,{force:true});const entries=[["review-old","escalated","0".repeat(40),"sha256:old"],["review-task","approved",tree,revision],["review-other","approved","f".repeat(40),revision]].map(([lineage_id,state,candidate_tree,entryRevision])=>{const entryPath=process.env.FLOW_REVIEW_ENTRY+"/"+lineage_id;fs.mkdirSync(entryPath,{recursive:true});fs.writeFileSync(entryPath+"/review-state.json",JSON.stringify({schema:"gentle-ai.review-state-record/v2",revision:entryRevision,state:{schema:"gentle-ai.review-state/v2",lineage_id,state,initial_snapshot:{base_tree:base,candidate_tree,paths,paths_digest:digest}}}));return{lineage_id,path:entryPath,status:state,state,revision:entryRevision}});process.stdout.write(JSON.stringify({schema:"gentle-ai.review-authority-status/v1",complete:true,authoritative:true,entries}));process.exit(0);}
if(process.env.FLOW_LINEAGE_LOG)fs.appendFileSync(process.env.FLOW_LINEAGE_LOG,(requestedLineage||"none")+"\\n");
if(process.env.FLOW_DENY_PRE_COMMIT==="1"){process.stderr.write("denied");process.exit(1);}
if(process.env.FLOW_DENY_REAL_PRE_COMMIT==="1"&&!process.env.GIT_INDEX_FILE){process.stderr.write("real denied");process.exit(1);}
let paths=git(["diff","--cached","--name-only","-z","HEAD","--"]).split("\\0").filter(Boolean).sort();
if(process.env.FLOW_AUTH_PATH_MODE==="omit")paths=paths.slice(1);
const pathsDigest=nativePathsDigest(paths);
process.stdout.write(JSON.stringify({schema:"gentle-ai.review-gate-result/v1",result:"allow",allowed:true,action:"continue",context:{lineage_id:returnedLineage,store_revision:revision,base_tree:git(["rev-parse","HEAD^{tree}"]),candidate_tree:git(["write-tree"]),paths_digest:pathsDigest}}));`);
  return { cwd, gentle, reviewEntry };
}

function run(repo, args, env = {}, harnessPath = harness) {
  return spawnSync(process.execPath, [harnessPath, ...args], {
    cwd: repo.cwd,
    encoding: "utf8",
    env: { ...process.env, TEST_GENTLE_AI_SCRIPT: repo.gentle, FLOW_REVIEW_ENTRY: repo.reviewEntry, ...env },
  });
}

function makeInstrumentedHarness(t, replacements) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-instrumented-"));
  const scriptsDir = path.join(tempRoot, "scripts");
  fs.cpSync(path.join(root, "scripts"), scriptsDir, { recursive: true });

  const runtimePath = path.join(scriptsDir, "flow-commit.mjs");
  let runtimeSource = fs.readFileSync(runtimePath, "utf8");
  for (const [original, replacement] of replacements) {
    assert.ok(runtimeSource.includes(original), `Missing instrumentation target: ${original}`);
    runtimeSource = runtimeSource.replace(original, replacement);
  }
  fs.writeFileSync(runtimePath, runtimeSource);

  const harnessPath = path.join(tempRoot, "flow-commit-harness.mjs");
  const harnessSource = fs.readFileSync(harness, "utf8")
    .replace("../scripts/flow-commit.mjs", "./scripts/flow-commit.mjs")
    .replace("../scripts/lib/helpers.mjs", "./scripts/lib/helpers.mjs");
  fs.writeFileSync(harnessPath, harnessSource);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  return harnessPath;
}

test("reviewed work units execute as exactly one commit", () => {
  const repo = makeRepo();
  const preview = run(repo, ["--auto", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.workUnits.length, 4);
  assert.equal(plan.plannedCommitGroups.length, 1);
  const result = run(repo, ["--auto", "--expected-plan-id", plan.planId]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(repo.cwd, ["rev-list", "--count", "HEAD~1..HEAD"]), "1");
  assert.deepEqual(git(repo.cwd, ["show", "--pretty=", "--name-only", "HEAD"]).split("\n").filter(Boolean).sort(), plan.knownFiles.sort());
  assert.deepEqual(stagedPaths(repo.cwd), []);
});

test("explicit lineage binds planning, planId, execution, and final staged validation", () => {
  const repo = makeRepo();
  const lineageLog = path.join(repo.cwd, "lineage.log");
  git(repo.cwd, ["config", "flow.reviewLifecycle", "required"]);
  fs.writeFileSync(path.join(repo.cwd, ".git", "info", "exclude"), "lineage.log\n");
  const env = { FLOW_LINEAGE_LOG: lineageLog };
  const preview = run(repo, ["--auto", "--dry-run", "--lineage", "review-task"], env);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.deliveryPolicy.authority.lineage, "review-task");

  const omitted = run(repo, ["--auto", "--expected-plan-id", plan.planId], env);
  assert.equal(omitted.status, 1);
  assert.match(omitted.stderr, /plan identity.*drifted/i);
  const different = run(repo, ["--auto", "--expected-plan-id", plan.planId, "--lineage", "review-other"], env);
  assert.equal(different.status, 1);
  assert.match(different.stderr, /no authority applies to the exact candidate projection/i);
  assert.equal(git(repo.cwd, ["rev-list", "--count", "HEAD"]), "1");

  const executed = run(repo, ["--auto", "--expected-plan-id", plan.planId, "--lineage", "review-task"], env);
  assert.equal(executed.status, 0, executed.stderr);
  const calls = fs.readFileSync(lineageLog, "utf8").trim().split("\n");
  assert.deepEqual(calls.slice(-2), ["review-task", "review-task"]);
  assert.equal(git(repo.cwd, ["rev-list", "--count", "HEAD"]), "2");
});

test("denial, authority drift, partial staging, and path mismatch create zero commits", () => {
  for (const scenario of ["denial", "drift", "partial", "paths"]) {
    const repo = makeRepo();
    const before = git(repo.cwd, ["rev-parse", "HEAD"]);
    if (scenario === "partial") {
      fs.writeFileSync(path.join(repo.cwd, "base.txt"), "staged\n");
      git(repo.cwd, ["add", "base.txt"]);
      fs.writeFileSync(path.join(repo.cwd, "base.txt"), "unstaged\n");
    }
    const env = scenario === "denial"
      ? { FLOW_DENY_PRE_COMMIT: "1" }
      : {};
    const preview = run(repo, ["--auto", "--dry-run"], env);
    if (scenario === "drift" || scenario === "paths") {
      assert.equal(preview.status, 0, preview.stderr);
      const planId = JSON.parse(preview.stdout).planId;
      const driftEnv = scenario === "drift"
        ? { FLOW_AUTH_REVISION: "sha256:changed" }
        : { FLOW_AUTH_PATH_MODE: "omit" };
      const result = run(repo, ["--auto", "--expected-plan-id", planId], driftEnv);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /plan identity|drifted|exact candidate/);
    } else {
      assert.equal(preview.status, 1);
    }
    assert.equal(git(repo.cwd, ["rev-parse", "HEAD"]), before);
  }
});

test("reviewed validation failure after staging restores the exact index", () => {
  const repo = makeRepo();
  const preview = run(repo, ["--auto", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  const beforeHead = git(repo.cwd, ["rev-parse", "HEAD"]);
  const beforeTree = git(repo.cwd, ["write-tree"]);
  const beforePaths = stagedPaths(repo.cwd);
  const beforeBytes = indexBytes(repo.cwd);

  const result = run(repo, ["--auto", "--expected-plan-id", JSON.parse(preview.stdout).planId], { FLOW_DENY_REAL_PRE_COMMIT: "1" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /review authority cannot be determined/i);
  assert.equal(git(repo.cwd, ["rev-parse", "HEAD"]), beforeHead);
  assert.deepEqual(indexBytes(repo.cwd), beforeBytes);
  assert.equal(git(repo.cwd, ["write-tree"]), beforeTree);
  assert.deepEqual(stagedPaths(repo.cwd), beforePaths);
});

test("successful pre-commit hook cannot leave an unreviewed commit or staged index", () => {
  const repo = makeRepo();
  const preview = run(repo, ["--auto", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  fs.writeFileSync(path.join(repo.cwd, ".git", "info", "exclude"), "hook-extra.txt\n");
  fs.writeFileSync(path.join(repo.cwd, "hook-extra.txt"), "hook staged\n");
  const hook = path.join(repo.cwd, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\ngit add -f -- hook-extra.txt\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  const beforeHead = git(repo.cwd, ["rev-parse", "HEAD"]);
  const beforeTree = git(repo.cwd, ["write-tree"]);
  const beforePaths = stagedPaths(repo.cwd);
  const beforeBytes = indexBytes(repo.cwd);

  const result = run(repo, ["--auto", "--expected-plan-id", JSON.parse(preview.stdout).planId]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /reviewed delivery verification failed/i);
  assert.equal(git(repo.cwd, ["rev-parse", "HEAD"]), beforeHead);
  assert.equal(git(repo.cwd, ["rev-list", "--count", `${beforeHead}..HEAD`]), "0");
  assert.deepEqual(indexBytes(repo.cwd), beforeBytes);
  assert.equal(git(repo.cwd, ["write-tree"]), beforeTree);
  assert.deepEqual(stagedPaths(repo.cwd), beforePaths);
});

test("hook tree mismatch restores prior partial staging, exact index, HEAD, and worktree", (t) => {
  const repo = makeRepo();
  const preview = run(repo, ["--auto", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);

  const partialPath = path.join(repo.cwd, "src", "auth", "change.mjs");
  const reviewedWorktree = fs.readFileSync(partialPath, "utf8");
  fs.writeFileSync(partialPath, "export const authChanged = false;\n");
  git(repo.cwd, ["add", "src/auth/change.mjs"]);
  fs.writeFileSync(partialPath, reviewedWorktree);

  fs.writeFileSync(path.join(repo.cwd, ".git", "info", "exclude"), "hook-extra.txt\n");
  fs.writeFileSync(path.join(repo.cwd, "hook-extra.txt"), "hook staged\n");
  const hook = path.join(repo.cwd, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\ngit add -f -- hook-extra.txt\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);

  const beforeHead = git(repo.cwd, ["rev-parse", "HEAD"]);
  const beforeTree = git(repo.cwd, ["write-tree"]);
  const beforePaths = stagedPaths(repo.cwd);
  const beforeBytes = indexBytes(repo.cwd);
  const beforeWorktree = new Map(
    [...plan.knownFiles, "hook-extra.txt"].map((file) => [file, fs.readFileSync(path.join(repo.cwd, file))]),
  );
  assert.deepEqual(beforePaths, ["src/auth/change.mjs"]);
  assert.notEqual(git(repo.cwd, ["show", ":src/auth/change.mjs"]), beforeWorktree.get("src/auth/change.mjs").toString("utf8").trim());

  const originalGate = "if (deliveryPolicy.topology === \"single\") assertSingleDeliveryScope(analysis, inScopeFiles);";
  const testGate = "if (deliveryPolicy.topology === \"single\" && process.env.FLOW_TEST_ALLOW_PARTIAL !== \"1\") assertSingleDeliveryScope(analysis, inScopeFiles);";
  const instrumentedHarness = makeInstrumentedHarness(t, [[originalGate, testGate]]);
  const result = run(
    repo,
    ["--auto", "--expected-plan-id", plan.planId],
    { FLOW_TEST_ALLOW_PARTIAL: "1" },
    instrumentedHarness,
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /reviewed delivery verification failed/i);
  assert.equal(git(repo.cwd, ["rev-parse", "HEAD"]), beforeHead);
  assert.equal(git(repo.cwd, ["rev-list", "--count", `${beforeHead}..HEAD`]), "0");
  assert.deepEqual(indexBytes(repo.cwd), beforeBytes);
  assert.equal(git(repo.cwd, ["write-tree"]), beforeTree);
  assert.deepEqual(stagedPaths(repo.cwd), beforePaths);
  for (const [file, contents] of beforeWorktree) {
    assert.deepEqual(fs.readFileSync(path.join(repo.cwd, file)), contents);
  }
});

test("CAS rollback fails closed without moving a deterministically divergent HEAD", (t) => {
  const repo = makeRepo();
  const preview = run(repo, ["--auto", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  fs.writeFileSync(path.join(repo.cwd, ".git", "info", "exclude"), "hook-extra.txt\n");
  fs.writeFileSync(path.join(repo.cwd, "hook-extra.txt"), "hook staged\n");
  const hook = path.join(repo.cwd, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\ngit add -f -- hook-extra.txt\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);

  const beforeHead = git(repo.cwd, ["rev-parse", "HEAD"]);
  const beforeTree = git(repo.cwd, ["write-tree"]);
  const beforeBytes = indexBytes(repo.cwd);
  const divergentHead = git(repo.cwd, ["commit-tree", beforeTree, "-p", beforeHead, "-m", "chore: concurrent head"]);
  const originalRollback = "const rollback = runFileSafe(\"git\", [\"update-ref\", \"HEAD\", baseCommit, createdCommit]);";
  const testRollback = `if (process.env.FLOW_TEST_DIVERGENT_HEAD) {
        const divergence = runFileSafe("git", ["update-ref", "HEAD", process.env.FLOW_TEST_DIVERGENT_HEAD, createdCommit]);
        if (!divergence.ok) throw new Error(\`Could not inject divergent HEAD: \${divergence.output}\`);
      }
      ${originalRollback}`;
  const instrumentedHarness = makeInstrumentedHarness(t, [[originalRollback, testRollback]]);

  const result = run(
    repo,
    ["--auto", "--expected-plan-id", JSON.parse(preview.stdout).planId],
    { FLOW_TEST_DIVERGENT_HEAD: divergentHead },
    instrumentedHarness,
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEAD rollback failed closed/i);
  assert.equal(git(repo.cwd, ["rev-parse", "HEAD"]), divergentHead);
  assert.notEqual(git(repo.cwd, ["rev-parse", "HEAD"]), beforeHead);
  assert.deepEqual(indexBytes(repo.cwd), beforeBytes);
  assert.equal(fs.readFileSync(path.join(repo.cwd, "hook-extra.txt"), "utf8"), "hook staged\n");
});

function makeSimpleRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-commit-contract-"));
  git(cwd, ["init", "-q"]);
  git(cwd, ["config", "user.email", "flow@example.test"]);
  git(cwd, ["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "a.txt"), "base-a\n");
  fs.writeFileSync(path.join(cwd, "b.txt"), "base-b\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "chore: initial"]);
  return cwd;
}

test("direct commit isolates staged paths and preserves partial staging", () => {
  const isolated = makeSimpleRepo();
  fs.writeFileSync(path.join(isolated, "a.txt"), "changed-a\n");
  fs.writeFileSync(path.join(isolated, "b.txt"), "changed-b\n");
  git(isolated, ["add", "b.txt"]);
  const blocked = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--commit", "--files", "a.txt", "--message", "fix: isolate"], { cwd: isolated, encoding: "utf8" });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /staged paths outside this group.*b\.txt/i);
  assert.equal(git(isolated, ["diff", "--cached", "--name-only"]), "b.txt");

  const partial = makeSimpleRepo();
  fs.writeFileSync(path.join(partial, "a.txt"), "staged\n");
  git(partial, ["add", "a.txt"]);
  fs.writeFileSync(path.join(partial, "a.txt"), "staged\nunstaged\n");
  const committed = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--commit", "--files", "a.txt", "--message", "fix: preserve index"], { cwd: partial, encoding: "utf8" });
  assert.equal(committed.status, 0, committed.stderr);
  assert.equal(git(partial, ["show", "HEAD:a.txt"]), "staged");
  assert.equal(fs.readFileSync(path.join(partial, "a.txt"), "utf8"), "staged\nunstaged\n");
});

test("direct commit treats message metacharacters literally", () => {
  const cwd = makeSimpleRepo();
  const marker = path.join(cwd, "flow-commit-injected");
  const message = "fix: keep $(touch flow-commit-injected) `touch flow-commit-injected`; & | < > ^ %PATH% ! \\\"quotes\\\"\n\nLiteral body";
  fs.writeFileSync(path.join(cwd, "a.txt"), "changed\n");
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--commit", "--files", "a.txt", "--message", message], { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(cwd, ["log", "-1", "--format=%B"]), message);
  assert.equal(fs.existsSync(marker), false);
});

test("NUL-delimited staged paths preserve newlines and shell metacharacters", () => {
  const filename = " literal\n$(touch flow-path-dollar) `touch flow-path-backtick`; \"quoted\" <in >out.txt\n";
  assert.deepEqual(parseNullDelimitedPaths(`${filename}\0normal path.txt\0`), [filename, "normal path.txt"]);
});

test("porcelain v1 -z parser preserves hostile paths and rename/copy records", () => {
  const hostile = " leading\n$(touch flow-status-payload); `quoted` trailing ";
  assert.deepEqual(
    parsePorcelainStatus(`?? ${hostile}\0R  renamed target \0original\nname\0 C copied target\0source name \0`),
    [
      { X: "?", Y: "?", path: hostile, originalPath: null },
      { X: "R", Y: " ", path: "renamed target ", originalPath: "original\nname" },
      { X: " ", Y: "C", path: "copied target", originalPath: "source name " },
    ],
  );
});

test("reviewed auto commits an exact hostile pathname without executing payloads", { skip: process.platform === "win32" }, () => {
  const repo = makeRepo();
  const filename = " leading\n$(touch flow-status-payload); `touch flow-status-backtick` trailing ";
  fs.writeFileSync(path.join(repo.cwd, filename), "hostile\n");

  const preview = run(repo, ["--auto", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.ok(plan.knownFiles.includes(filename));
  assert.ok(plan.plannedCommitGroups[0].files.includes(filename));

  const result = run(repo, ["--auto", "--expected-plan-id", plan.planId]);
  assert.equal(result.status, 0, result.stderr);
  const committed = execFileSync("git", ["show", "--pretty=", "--name-only", "-z", "HEAD"], { cwd: repo.cwd }).toString("utf8").split("\0").filter(Boolean);
  assert.ok(committed.includes(filename));
  assert.equal(execFileSync("git", ["status", "--porcelain=v1", "-z"], { cwd: repo.cwd }).length, 0);
  assert.equal(fs.existsSync(path.join(repo.cwd, "flow-status-payload")), false);
  assert.equal(fs.existsSync(path.join(repo.cwd, "flow-status-backtick")), false);
});

test("direct commit stages shell metacharacters literally without executing payloads", () => {
  const cwd = makeSimpleRepo();
  const filename = "literal $(touch flow-path-dollar) `touch flow-path-backtick`; spaced.txt";
  fs.writeFileSync(path.join(cwd, filename), "literal\n");
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--commit", "--files", filename, "--message", "fix: literal path"], { cwd, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(execFileSync("git", ["show", "--pretty=", "--name-only", "-z", "HEAD"], { cwd }).toString("utf8").split("\0").filter(Boolean), [filename]);
  assert.equal(fs.existsSync(path.join(cwd, "flow-path-dollar")), false);
  assert.equal(fs.existsSync(path.join(cwd, "flow-path-backtick")), false);
  assert.deepEqual(stagedPaths(cwd), []);
});

test("failed commit restores the exact index and preserves partial staging and worktree", () => {
  const cwd = makeSimpleRepo();
  fs.writeFileSync(path.join(cwd, "a.txt"), "staged-a\n");
  git(cwd, ["add", "a.txt"]);
  fs.writeFileSync(path.join(cwd, "a.txt"), "staged-a\nunstaged-a\n");
  fs.writeFileSync(path.join(cwd, "b.txt"), "changed-b\n");
  const hook = path.join(cwd, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  fs.chmodSync(hook, 0o755);
  const beforeTree = git(cwd, ["write-tree"]);
  const beforePaths = stagedPaths(cwd);
  const beforeBytes = indexBytes(cwd);
  const beforeWorktree = fs.readFileSync(path.join(cwd, "a.txt"), "utf8");

  const result = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--commit", "--files", "a.txt,b.txt", "--message", "fix: rollback index"], { cwd, encoding: "utf8", shell: false });

  assert.equal(result.status, 1);
  assert.deepEqual(indexBytes(cwd), beforeBytes);
  assert.equal(git(cwd, ["write-tree"]), beforeTree);
  assert.deepEqual(stagedPaths(cwd), beforePaths);
  assert.equal(fs.readFileSync(path.join(cwd, "a.txt"), "utf8"), beforeWorktree);
  assert.equal(fs.readFileSync(path.join(cwd, "b.txt"), "utf8"), "changed-b\n");
});

test("dry-run protects dev and analysis classifies docs directories", () => {
  const cwd = makeSimpleRepo();
  git(cwd, ["branch", "-M", "dev"]);
  fs.mkdirSync(path.join(cwd, "src", "auth"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "auth", "login.ts"), "auth\n");
  fs.writeFileSync(path.join(cwd, "src", "auth", "login.spec.ts"), "test\n");
  const dryRun = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--auto", "--dry-run", "--branch-name", "feature/User Login"], { cwd, encoding: "utf8" });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(plan.protectedBranchDetected, true);
  assert.equal(plan.plannedBranch, "feat/user-login");
  assert.equal(plan.plannedCommitGroups.length, 1);

  const docs = makeSimpleRepo();
  fs.mkdirSync(path.join(docs, "docs", "runbooks"), { recursive: true });
  fs.mkdirSync(path.join(docs, "doc"), { recursive: true });
  fs.writeFileSync(path.join(docs, "docs", "runbooks", "cleanup.md"), "docs\n");
  fs.writeFileSync(path.join(docs, "doc", "overview.txt"), "doc\n");
  const analysis = spawnSync(process.execPath, [path.join(root, "scripts", "flow-commit.mjs"), "--analyze"], { cwd: docs, encoding: "utf8" });
  assert.deepEqual(JSON.parse(analysis.stdout).changes.untracked.map(({ path: file, type }) => ({ path: file, type })), [
    { path: "doc/overview.txt", type: "doc" },
    { path: "docs/runbooks/cleanup.md", type: "doc" },
  ]);
});
