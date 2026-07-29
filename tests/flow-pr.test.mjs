import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { identity, validateRequest, validateSnapshot } from "../scripts/lib/flow-pr-contracts.mjs";
import { parseGitHubRemote } from "../scripts/lib/flow-pr-inspection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-pr.mjs");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const maybeGit = (cwd, args) => { const result = spawnSync("git", args, { cwd, encoding: "utf8" }); return result.status === 0 ? result.stdout.trim() : ""; };

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-v5-"));
  const remote = path.join(directory, "remote.git"); const cwd = path.join(directory, "work"); fs.mkdirSync(cwd);
  git(directory, ["init", "--bare", "-q", remote]); git(cwd, ["init", "-q", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@example.test"]); git(cwd, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(cwd, "initial.txt"), "initial\n"); git(cwd, ["add", "."]); git(cwd, ["commit", "-qm", "chore: initial"]);
  const origin = "https://github.com/example/repo.git"; git(cwd, ["config", `url.file://${remote.replaceAll("\\", "/")}.insteadOf`, origin]); git(cwd, ["remote", "add", "origin", origin]); git(cwd, ["push", "-q", "-u", "origin", "main"]);
  git(cwd, ["checkout", "-qb", "feat/contract"]); fs.writeFileSync(path.join(cwd, "feature.txt"), "feature\n"); git(cwd, ["add", "."]); git(cwd, ["commit", "-qm", "feat: contract"]);
  const gh = path.join(directory, "gh.mjs"); const state = path.join(directory, "prs.json"); const calls = path.join(directory, "calls.jsonl");
  fs.writeFileSync(gh, `import fs from "node:fs";
const a=process.argv.slice(2),s=process.env.FLOW_PR_STATE,c=process.env.FLOW_PR_CALLS,load=()=>fs.existsSync(s)?JSON.parse(fs.readFileSync(s,"utf8")):[],save=v=>fs.writeFileSync(s,JSON.stringify(v)),val=x=>a[a.indexOf(x)+1];
fs.appendFileSync(c,JSON.stringify(a)+"\\n");let all=load();
if(a[0]==="pr"&&a[1]==="list"){if(process.env.FLOW_PR_BLOCK_LIST_READY){if(!fs.existsSync(process.env.FLOW_PR_BLOCK_LIST_READY))fs.writeFileSync(process.env.FLOW_PR_BLOCK_LIST_READY,"ready",{flag:"wx"});const wait=new Int32Array(new SharedArrayBuffer(4));while(!fs.existsSync(process.env.FLOW_PR_BLOCK_LIST_RELEASE))Atomics.wait(wait,0,0,10);}if(process.env.FLOW_PR_FAIL_LIST){process.stderr.write("list unavailable");process.exit(1)}if(process.env.FLOW_PR_INVALID_JSON)process.stdout.write("{");else if(process.env.FLOW_PR_NON_ARRAY)process.stdout.write("{}");else process.stdout.write(JSON.stringify(process.env.FLOW_PR_AMBIGUOUS?[...all,...all.map(x=>({...x,number:x.number+1,url:"https://github.com/example/repo/pull/"+(x.number+1)}))]:all));}
else if(a[0]==="pr"&&a[1]==="create"){const [owner,ref]=val("--head").split(":"),pr={number:all.length+1,url:"https://github.com/example/repo/pull/"+(all.length+1),state:"OPEN",isDraft:a.includes("--draft"),headRefOid:process.env.FLOW_PR_HEAD,headRefName:ref,headRepositoryOwner:{login:owner},baseRefName:val("--base"),baseRefOid:process.env.FLOW_PR_BASE,title:val("--title"),body:fs.readFileSync(0,"utf8"),labels:a.flatMap((x,i)=>x==="--label"?[{name:a[i+1]}]:[])};all.push(pr);save(all);if(process.env.FLOW_PR_FAIL_CREATE_AFTER){process.stderr.write("unknown create");process.exit(1)}process.stdout.write(pr.url);}
else if(a[0]==="pr"&&a[1]==="edit"){const p=all.find(x=>String(x.number)===a[2]);if(a.includes("--title"))p.title=val("--title");if(a.includes("--body-file"))p.body=fs.readFileSync(0,"utf8");for(let i=0;i<a.length;i++){if(a[i]==="--add-label"&&!p.labels.some(x=>x.name===a[i+1]))p.labels.push({name:a[i+1]});if(a[i]==="--remove-label")p.labels=p.labels.filter(x=>x.name!==a[i+1]);}save(all);if(process.env.FLOW_PR_FAIL_EDIT_AFTER){process.stderr.write("unknown edit");process.exit(1)}}
else if(a[0]==="pr"&&a[1]==="ready"){const p=all.find(x=>String(x.number)===a[2]);p.isDraft=a.includes("--undo");save(all);if(process.env.FLOW_PR_FAIL_READY_AFTER){process.stderr.write("unknown ready");process.exit(1)}}
else if(a[0]==="pr"&&a[1]==="view"){if(process.env.FLOW_PR_FAIL_VIEW){process.stderr.write("view unavailable");process.exit(1)}const p=structuredClone(all.find(x=>String(x.number)===a[2]));if(process.env.FLOW_PR_BAD_VIEW)p.title="tampered";if(process.env.FLOW_PR_BAD_BASE_VIEW)p.baseRefOid="0".repeat(40);if(process.env.FLOW_PR_BAD_BODY_VIEW)p.body="unexpected body";if(process.env.FLOW_PR_FOREIGN_URL_VIEW)p.url="https://github.com/foreign/repo/pull/"+p.number;process.stdout.write(JSON.stringify(p));}
else{process.stderr.write("unsupported "+a.join(" "));process.exit(1)}`);
  return { directory, remote, cwd, gh, state, calls };
}

function runtimeEnv(item, extra = {}) { return { ...process.env, FLOW_PR_GH_SCRIPT: item.gh, FLOW_PR_STATE: item.state, FLOW_PR_CALLS: item.calls, FLOW_PR_HEAD: maybeGit(item.cwd, ["rev-parse", "HEAD"]), FLOW_PR_BASE: maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0], ...extra }; }
function run(item, args, extra = {}) { return spawnSync(process.execPath, [runtime, ...args], { cwd: item.cwd, encoding: "utf8", env: runtimeEnv(item, extra) }); }
function runAsync(item, args, extra = {}) {
  const child = spawn(process.execPath, [runtime, ...args], { cwd: item.cwd, env: runtimeEnv(item, extra), stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (value) => stdout += value); child.stderr.on("data", (value) => stderr += value);
  return { child, result: new Promise((resolve) => child.on("close", (status) => resolve({ status, stdout, stderr }))) };
}
function output(result) { assert.ok(result.stdout, result.stderr); return JSON.parse(result.stdout); }
function intent(overrides = {}) { return { schema: "flow-pr/intent-v2", title: "feat: contract", body: "Deterministic body\n", draft: true, labels: { add: ["type:feature"], remove: [] }, updateExisting: ["title", "body", "draft", "labels"], deliveryMode: "same-repo", push: "publish", ...overrides }; }
function begin(item, extra = {}, verbose = false) { return output(run(item, ["--prepare", "--base", "main", ...(verbose ? ["--verbose"] : [])], extra)); }
function finalize(item, prepared, value = intent(), extra = {}, verbose = false) { fs.writeFileSync(prepared.intentPath, JSON.stringify(value)); return output(run(item, ["--prepare", "--handle", prepared.handle, ...(verbose ? ["--verbose"] : [])], extra)); }
function prepared(item, value = intent(), extra = {}) { return finalize(item, begin(item, extra), value, extra); }
function execute(item, preparation, extra = {}, verbose = false) { return output(run(item, ["--execute", "--handle", preparation.handle, ...(verbose ? ["--verbose"] : [])], extra)); }
function directoryFor(handle) { return path.join(os.tmpdir(), `flow-pr-request-${handle.split(".")[0]}`); }
function calls(item) { return fs.existsSync(item.calls) ? fs.readFileSync(item.calls, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : []; }
function publish(item) { git(item.cwd, ["push", "-q", "-u", "origin", "HEAD:refs/heads/feat/contract"]); }
function rawPr(snapshot, overrides = {}) { return { number: 1, url: "https://github.com/example/repo/pull/1", state: "OPEN", isDraft: true, headRefOid: snapshot.headOid, headRefName: snapshot.branch, headRepositoryOwner: { login: snapshot.head.owner }, baseRefName: snapshot.base.ref, baseRefOid: snapshot.base.oid, title: "feat: contract", body: "Deterministic body\n", labels: [{ name: "type:feature" }], ...overrides }; }
function snapshot(item) { const value = begin(item, {}, true); const facts = value.diagnostics.snapshot; fs.rmSync(directoryFor(value.handle), { recursive: true, force: true }); return facts; }
function moveBase(item) {
  const publisher = path.join(item.directory, "publisher"); fs.mkdirSync(publisher); git(publisher, ["init", "-q"]); git(publisher, ["config", "user.email", "test@example.test"]); git(publisher, ["config", "user.name", "Test"]); git(publisher, ["remote", "add", "origin", item.remote]); git(publisher, ["fetch", "-q", "origin", "main"]); git(publisher, ["checkout", "-qb", "main", "FETCH_HEAD"]); fs.writeFileSync(path.join(publisher, "moved.txt"), "moved\n"); git(publisher, ["add", "."]); git(publisher, ["commit", "-qm", "chore: move base"]); git(publisher, ["push", "-q", "origin", "main"]);
}
function publishUnknownRemoteHead(item) {
  const publisher = path.join(item.directory, "publisher-unknown"); fs.mkdirSync(publisher); git(publisher, ["init", "-q"]); git(publisher, ["config", "user.email", "test@example.test"]); git(publisher, ["config", "user.name", "Test"]); git(publisher, ["remote", "add", "origin", item.remote]); git(publisher, ["fetch", "-q", "origin", "main"]); git(publisher, ["checkout", "-qb", "feat/contract", "FETCH_HEAD"]); fs.writeFileSync(path.join(publisher, "other.txt"), "other\n"); git(publisher, ["add", "."]); git(publisher, ["commit", "-qm", "feat: remote only"]); git(publisher, ["push", "-q", "origin", "HEAD:refs/heads/feat/contract"]); return git(publisher, ["rev-parse", "HEAD"]);
}
function installPrePushHook(item, source) {
  const gitDir = path.resolve(item.cwd, git(item.cwd, ["rev-parse", "--git-dir"])); const script = path.join(item.directory, `pre-push-${Math.random().toString(16).slice(2)}.mjs`); const hook = path.join(gitDir, "hooks", "pre-push"); fs.writeFileSync(script, source); fs.writeFileSync(hook, `#!/bin/sh\nexec "${process.execPath.replaceAll("\\", "/")}" "${script.replaceAll("\\", "/")}"\n`); fs.chmodSync(hook, 0o755);
}
async function waitForFile(file, timeout = 5000) { const started = Date.now(); while (!fs.existsSync(file)) { if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${file}`); await new Promise((resolve) => setTimeout(resolve, 10)); } }

test("prepare keeps canonical snapshot and identity internal while exposing compact drafting facts", () => {
  const item = fixture(); const compact = begin(item); const encoded = JSON.stringify(compact);
  assert.equal(compact.schema, "flow-pr/prepare-context-v2"); assert.equal(compact.context.repository, "example/repo"); assert.deepEqual(compact.context.changes.commits, ["feat: contract"]); assert.deepEqual(compact.context.changes.files, ["feature.txt"]);
  assert.doesNotMatch(encoded, /snapshot|identity|headOid|commonDir/); assert.equal(fs.existsSync(path.join(directoryFor(compact.handle), "context.json")), true);
  const verbose = begin(item, {}, true); assert.equal(validateSnapshot(verbose.diagnostics.snapshot), verbose.diagnostics.snapshot); assert.match(verbose.diagnostics.snapshot.identity, /^[0-9a-f]{64}$/);
});

test("runtime-owned semantic intent transport preserves Windows paths, quotes, Markdown backticks, Unicode, and multiline bytes", () => {
  const item = fixture(); const body = "Windows C:\\Users\\Víctor\\repo\n\"quoted\" and `inline`\n```ts\nconst café = 'sí';\n```\n"; const value = intent({ title: "feat: café 'quoted'", body });
  const result = finalize(item, begin(item), value); const envelope = JSON.parse(fs.readFileSync(path.join(directoryFor(result.handle), "request.json"), "utf8"));
  assert.equal(validateRequest(envelope.request), envelope.request); assert.equal(envelope.request.pr.body, body); assert.equal(envelope.request.pr.title, value.title);
  assert.doesNotMatch(JSON.stringify(result), /flow-pr\/request-v2|expected|snapshot|`inline`|Víctor/); assert.equal(result.approval.body.bytes, Buffer.byteLength(body)); assert.equal("preview" in result.approval.body, false);
});

test("one prepared approval executes an ordinary non-force push and verified PR create", () => {
  const item = fixture(); const plan = prepared(item); assert.deepEqual(plan.approval.action, { git: "push", pullRequest: "create", expectation: "push and create" });
  const result = execute(item, plan); assert.equal(result.status, "success"); assert.equal(result.phase, "verify"); assert.equal(result.effects.push, "confirmed"); assert.equal(result.effects.prCreate, "confirmed"); assert.equal(result.pr.url, "https://github.com/example/repo/pull/1");
  assert.equal(git(item.cwd, ["ls-remote", "origin", "refs/heads/feat/contract"]).split(/\s+/)[0], git(item.cwd, ["rev-parse", "HEAD"])); assert.doesNotMatch(fs.readFileSync(path.join(root, "scripts", "lib", "flow-pr-executor.mjs"), "utf8"), /--force|--force-with-lease/);
});

test("publish sets and verifies a missing upstream even when the remote OID already equals HEAD", () => {
  const item = fixture(); git(item.cwd, ["push", "-q", "origin", "HEAD:refs/heads/feat/contract"]); assert.equal(maybeGit(item.cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"]), "");
  const plan = prepared(item); assert.equal(plan.approval.action.git, "push"); const result = execute(item, plan);
  assert.equal(result.status, "success"); assert.equal(result.effects.push, "confirmed"); assert.equal(result.effects.upstream, "confirmed"); assert.equal(git(item.cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"]), "origin/feat/contract");
});

test("verified existing PR behavior supports authorized update and noop", () => {
  const updating = fixture(); publish(updating); const baseline = snapshot(updating); fs.writeFileSync(updating.state, JSON.stringify([rawPr(baseline, { title: "old" })]));
  const updatePlan = prepared(updating, intent({ push: "verify-existing" })); assert.equal(updatePlan.approval.action.pullRequest, "update"); const updated = execute(updating, updatePlan); assert.equal(updated.status, "success"); assert.equal(updated.effects.prUpdate, "confirmed");
  const noopPlan = prepared(updating, intent({ push: "verify-existing" })); assert.equal(noopPlan.approval.action.pullRequest, "noop"); const noop = execute(updating, noopPlan); assert.equal(noop.status, "noop"); assert.ok(Object.values(noop.effects).every((entry) => entry === "not-attempted"));
});

test("fork delivery keeps target and push repository distinct and verified", () => {
  const item = fixture(); const forkBare = path.join(item.directory, "fork.git"); git(item.directory, ["init", "--bare", "-q", forkBare]);
  const forkUrl = "https://github.com/contributor/repo.git"; git(item.cwd, ["config", `url.file://${forkBare.replaceAll("\\", "/")}.insteadOf`, forkUrl]); git(item.cwd, ["remote", "add", "fork", forkUrl]);
  const context = output(run(item, ["--prepare", "--base", "main", "--push-remote", "fork"])); const plan = finalize(item, context, intent({ deliveryMode: "fork" }));
  assert.deepEqual(plan.approval.delivery, { mode: "fork", target: "example/repo", pushRemote: "fork", pushRepository: "contributor/repo" });
  const result = execute(item, plan); assert.equal(result.status, "success"); assert.deepEqual(result.publication.delivery, { target: "example/repo", pushRemote: "fork", pushRepository: "contributor/repo" });
});

test("unsafe local states block preparation before effects", async (t) => {
  const scenarios = {
    dirty: (item) => fs.writeFileSync(path.join(item.cwd, "dirty.txt"), "dirty\n"),
    protected: (item) => git(item.cwd, ["checkout", "-q", "main"]),
    merge: (item) => fs.writeFileSync(path.join(item.cwd, git(item.cwd, ["rev-parse", "--git-dir"]), "MERGE_HEAD"), `${git(item.cwd, ["rev-parse", "HEAD"])}\n`),
    detached: (item) => git(item.cwd, ["checkout", "-q", "--detach"]),
    rebase: (item) => fs.mkdirSync(path.join(item.cwd, git(item.cwd, ["rev-parse", "--git-dir"]), "rebase-merge")),
    uncommitted: (item) => { git(item.cwd, ["checkout", "-q", "--orphan", "feat/uncommitted"]); git(item.cwd, ["rm", "-q", "-rf", "."]); },
  };
  for (const [name, mutate] of Object.entries(scenarios)) await t.test(name, () => { const item = fixture(); mutate(item); const result = begin(item); assert.equal(result.status, "failure"); assert.equal(result.error.code, "unsafe-local-state"); assert.ok(Object.values(result.effects).every((entry) => entry === "not-attempted")); });
});

test("unavailable and invalid GitHub inspection responses fail without effects", async (t) => {
  for (const [name, env, code] of [["unavailable", { FLOW_PR_FAIL_LIST: "1" }, "gh-unavailable"], ["invalid-json", { FLOW_PR_INVALID_JSON: "1" }, "gh-invalid-json"], ["non-array", { FLOW_PR_NON_ARRAY: "1" }, "gh-invalid-json"]]) await t.test(name, () => { const item = fixture(); const result = begin(item, env); assert.equal(result.status, "failure"); assert.equal(result.error.code, code); assert.ok(Object.values(result.effects).every((entry) => entry === "not-attempted")); });
});

test("unknown remote ancestry blocks non-fast-forward publication", () => {
  const item = fixture(); const remoteOid = publishUnknownRemoteHead(item); const context = begin(item, {}, true); assert.equal(context.diagnostics.snapshot.push.remoteHeadOid, remoteOid); assert.equal(context.diagnostics.snapshot.relation.divergence, "unknown"); const plan = finalize(item, context); const result = execute(item, plan); assert.equal(result.status, "blocked"); assert.equal(result.blocker.code, "non-fast-forward"); assert.equal(result.effects.push, "not-attempted");
});

test("closed, merged, and base-incompatible PRs block reconciliation", async (t) => {
  for (const [name, overrides] of [["closed", { state: "CLOSED" }], ["merged", { state: "MERGED" }], ["base-incompatible", { baseRefOid: "0".repeat(40) }]]) await t.test(name, () => { const item = fixture(); publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, overrides)])); const plan = prepared(item, intent({ push: "verify-existing" })); const result = execute(item, plan); assert.equal(result.status, "blocked"); assert.equal(result.blocker.code, "pr-incompatible"); assert.ok(!calls(item).some((entry) => ["create", "edit", "ready"].includes(entry[1]))); });
});

test("hostile or inconsistent PR URLs fail inspection", async (t) => {
  for (const [name, url] of [["foreign", "https://github.com/foreign/repo/pull/1"], ["wrong-number", "https://github.com/example/repo/pull/2"], ["query", "https://github.com/example/repo/pull/1?x=1"], ["malformed", "not-a-url"]]) await t.test(name, () => { const item = fixture(); publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, { url })])); const result = begin(item); assert.equal(result.status, "failure"); assert.match(result.error.message, /url/i); });
});

test("execute reinspection catches branch, HEAD, base, remote, upstream, and PR drift", async (t) => {
  const scenarios = {
    branch: (item) => git(item.cwd, ["checkout", "-qb", "feat/other"]),
    HEAD: (item) => { fs.writeFileSync(path.join(item.cwd, "later.txt"), "later\n"); git(item.cwd, ["add", "."]); git(item.cwd, ["commit", "-qm", "feat: later"]); },
    base: moveBase,
    remote: (item) => { const other = "https://github.com/example/other.git"; git(item.cwd, ["config", `url.file://${item.remote.replaceAll("\\", "/")}.insteadOf`, other]); git(item.cwd, ["remote", "set-url", "origin", other]); },
    upstream: (item) => git(item.cwd, ["branch", "--set-upstream-to", "origin/main"]),
    PR: (item) => { const entries = JSON.parse(fs.readFileSync(item.state, "utf8")); entries[0].title = "changed remotely"; fs.writeFileSync(item.state, JSON.stringify(entries)); },
  };
  for (const [name, mutate] of Object.entries(scenarios)) await t.test(name, () => {
    const item = fixture(); if (name === "PR") { publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline)])); }
    const plan = prepared(item, intent({ push: name === "PR" ? "verify-existing" : "publish" })); mutate(item); const result = execute(item, plan);
    assert.ok(["drift", "blocked"].includes(result.status), JSON.stringify(result)); assert.ok(Object.values(result.effects).every((entry) => entry === "not-attempted"));
  });
});

test("post-push base and PR authority races preserve push and skip PR mutation", async (t) => {
  await t.test("base moves", () => { const item = fixture(); const oldBase = git(item.cwd, ["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0]; moveBase(item); const movedBase = git(item.cwd, ["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0]; git(item.directory, ["--git-dir", item.remote, "update-ref", "refs/heads/main", oldBase]); const plan = prepared(item); installPrePushHook(item, `import{spawnSync}from"node:child_process";const r=spawnSync("git",["--git-dir",${JSON.stringify(item.remote)},"update-ref","refs/heads/main",${JSON.stringify(movedBase)}]);process.exit(r.status??1);`); fs.writeFileSync(item.calls, ""); const result = execute(item, plan); assert.equal(result.status, "partial"); assert.equal(result.phase, "push"); assert.equal(result.blocker.code, "post-push-authority-drift"); assert.equal(result.effects.push, "confirmed"); assert.ok(!calls(item).some((entry) => ["create", "edit", "ready"].includes(entry[1]))); });
  await t.test("PR appears", () => { const item = fixture(); const baseline = snapshot(item); const plan = prepared(item); installPrePushHook(item, `import fs from"node:fs";fs.writeFileSync(${JSON.stringify(item.state)},JSON.stringify([${JSON.stringify(rawPr(baseline))}]));`); fs.writeFileSync(item.calls, ""); const result = execute(item, plan); assert.equal(result.status, "partial"); assert.equal(result.phase, "push"); assert.equal(result.blocker.code, "post-push-authority-drift"); assert.equal(result.effects.push, "confirmed"); assert.ok(!calls(item).some((entry) => ["create", "edit", "ready"].includes(entry[1]))); });
});

test("owned handles reject traversal, missing files, tampering, and expiry", async (t) => {
  await t.test("traversal", () => { const item = fixture(); const result = output(run(item, ["--execute", "--handle", "../request.json"])); assert.equal(result.error.code, "handle-invalid"); });
  await t.test("missing", () => { const item = fixture(); const result = output(run(item, ["--execute", "--handle", `${"a".repeat(64)}.${"b".repeat(64)}`])); assert.equal(result.error.code, "handle-missing"); });
  await t.test("tampered", () => { const item = fixture(); const plan = prepared(item); const file = path.join(directoryFor(plan.handle), "request.json"); fs.appendFileSync(file, " "); const result = execute(item, plan); assert.equal(result.error.code, "handle-tampered"); });
  await t.test("expired", () => { const item = fixture(); const plan = prepared(item); const file = path.join(directoryFor(plan.handle), "request.json"); const envelope = JSON.parse(fs.readFileSync(file, "utf8")); envelope.createdAt = "2000-01-01T00:00:00.000Z"; const bytes = JSON.stringify(envelope); fs.writeFileSync(file, bytes); const expired = `${plan.handle.split(".")[0]}.${identity(bytes)}`; const result = execute(item, { handle: expired }); assert.equal(result.error.code, "handle-expired"); });
  await t.test("abandoned claim", () => { const item = fixture(); const plan = prepared(item); fs.writeFileSync(path.join(directoryFor(plan.handle), "execute.claim"), "abandoned", { flag: "wx" }); fs.writeFileSync(item.calls, ""); const result = execute(item, plan); assert.equal(result.status, "blocked"); assert.equal(result.blocker.code, "handle-claimed"); assert.equal(result.recovery.code, "prepare-again"); assert.equal(calls(item).length, 0); });
  await t.test("request symlink", (context) => { const item = fixture(); const plan = prepared(item); const directory = directoryFor(plan.handle); const request = path.join(directory, "request.json"); const target = path.join(directory, "request-target.json"); fs.copyFileSync(request, target); fs.rmSync(request); try { fs.symlinkSync(target, request, "file"); } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { context.skip(`File symlinks unavailable: ${error.code}`); return; } throw error; } const result = execute(item, plan); assert.equal(result.error.code, "handle-unsafe"); fs.rmSync(directory, { recursive: true, force: true }); });
});

test("concurrent consumers permit exactly one execution to reach mutation", async () => {
  const item = fixture(); const plan = prepared(item); fs.writeFileSync(item.calls, ""); const ready = path.join(item.directory, "list-ready"); const release = path.join(item.directory, "list-release");
  const winnerProcess = runAsync(item, ["--execute", "--handle", plan.handle], { FLOW_PR_BLOCK_LIST_READY: ready, FLOW_PR_BLOCK_LIST_RELEASE: release }); await waitForFile(ready);
  const loser = output(run(item, ["--execute", "--handle", plan.handle])); fs.writeFileSync(release, "release"); const winner = output(await winnerProcess.result);
  assert.equal(loser.status, "blocked"); assert.equal(loser.blocker.code, "handle-claimed"); assert.equal(loser.recovery.code, "prepare-again"); assert.equal(winner.status, "success"); const operations = calls(item); assert.equal(operations.filter((entry) => entry[1] === "create").length, 1); assert.equal(operations.filter((entry) => entry[1] === "edit" || entry[1] === "ready").length, 0);
});

test("unsupported custom temp roots fail preparation early and actionably", () => {
  const item = fixture(); const custom = path.join(item.directory, "custom-temp"); fs.mkdirSync(custom); const result = begin(item, { TMPDIR: custom, TMP: custom, TEMP: custom }); assert.equal(result.status, "failure"); assert.equal(result.error.code, "temp-root-unsupported"); assert.match(result.error.message, /standard Windows|Linux \/tmp|macOS/); assert.equal(calls(item).length, 0);
});

test("default output is compact and verbose diagnostics are explicit", () => {
  const compactItem = fixture(); const compactPlan = prepared(compactItem); const compact = execute(compactItem, compactPlan); assert.equal("diagnostics" in compact, false); assert.equal("snapshot" in compact, false); assert.deepEqual(compact.publication, { repository: "example/repo", branch: "feat/contract", headOid: git(compactItem.cwd, ["rev-parse", "HEAD"]), base: "main", baseOid: git(compactItem.cwd, ["rev-parse", "main"]), action: { git: "pushed", pullRequest: "created" }, delivery: { target: "example/repo", pushRemote: "origin", pushRepository: "example/repo" } }); assert.deepEqual(Object.values(compact.effects).every((entry) => typeof entry === "string"), true); assert.deepEqual(Object.keys(compact.pr).sort(), ["draft", "labels", "number", "state", "title", "url"]);
  const verboseItem = fixture(); const verbosePlan = prepared(verboseItem); const verbose = execute(verboseItem, verbosePlan, {}, true); assert.equal(validateSnapshot(verbose.diagnostics.snapshot.facts), verbose.diagnostics.snapshot.facts);
});

test("secret-like multiline bodies never appear in default create or update JSON", async (t) => {
  const marker = "FLOW_PR_SECRET_7f4c\n`backtick ${must_not_expand}`\nsecond line";
  await t.test("create", () => { const item = fixture(); const context = begin(item); assert.doesNotMatch(JSON.stringify(context), /FLOW_PR_SECRET_7f4c/); const plan = finalize(item, context, intent({ body: marker })); assert.doesNotMatch(JSON.stringify(plan), /FLOW_PR_SECRET_7f4c|must_not_expand/); const result = execute(item, plan); assert.doesNotMatch(JSON.stringify(result), /FLOW_PR_SECRET_7f4c|must_not_expand/); assert.equal(result.status, "success"); });
  await t.test("update", () => { const item = fixture(); publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, { body: "old body\n" })])); const context = begin(item); assert.doesNotMatch(JSON.stringify(context), /FLOW_PR_SECRET_7f4c/); const plan = finalize(item, context, intent({ body: marker, push: "verify-existing" })); assert.doesNotMatch(JSON.stringify(plan), /FLOW_PR_SECRET_7f4c|must_not_expand/); const result = execute(item, plan); assert.doesNotMatch(JSON.stringify(result), /FLOW_PR_SECRET_7f4c|must_not_expand/); assert.equal(result.status, "success"); });
});

test("GitHub postcondition mismatches remain failure with unknown PR effects", () => {
  const item = fixture(); const plan = prepared(item); const result = execute(item, plan, { FLOW_PR_BAD_VIEW: "1" });
  assert.equal(result.status, "partial"); assert.equal(result.phase, "verify"); assert.equal(result.effects.prCreate, "unknown"); assert.equal(result.recovery.code, "prepare-again");
});

test("post-mutation verification failures mark affected effects unknown", async (t) => {
  for (const [name, env] of [["view unavailable", { FLOW_PR_FAIL_VIEW: "1" }], ["base mismatch", { FLOW_PR_BAD_BASE_VIEW: "1" }], ["body mismatch", { FLOW_PR_BAD_BODY_VIEW: "1" }], ["foreign URL", { FLOW_PR_FOREIGN_URL_VIEW: "1" }]]) await t.test(name, () => { const item = fixture(); const result = execute(item, prepared(item), env); assert.equal(result.status, "partial"); assert.equal(result.effects.prCreate, "unknown"); assert.equal(result.recovery.code, "prepare-again"); });
  await t.test("edit unknown", () => { const item = fixture(); publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, { title: "old" })])); const result = execute(item, prepared(item, intent({ push: "verify-existing" })), { FLOW_PR_FAIL_EDIT_AFTER: "1" }); assert.equal(result.status, "failure"); assert.equal(result.effects.prUpdate, "unknown"); });
  await t.test("draft unknown", () => { const item = fixture(); publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, { isDraft: false })])); const result = execute(item, prepared(item, intent({ push: "verify-existing" })), { FLOW_PR_FAIL_READY_AFTER: "1" }); assert.equal(result.status, "failure"); assert.equal(result.effects.prUpdate, "unknown"); });
});

test("ambiguous PR authority blocks preparation before mutation", () => {
  const item = fixture(); publish(item); const baseline = snapshot(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline)])); fs.writeFileSync(item.calls, "");
  const result = begin(item, { FLOW_PR_AMBIGUOUS: "1" }); assert.equal(result.status, "failure"); assert.equal(result.error.code, "pr-ambiguous"); assert.ok(!calls(item).some((entry) => ["create", "edit", "ready"].includes(entry[1])));
});

test("partial or unknown effects consume the handle and require fresh preparation", () => {
  const item = fixture(); const plan = prepared(item); const partial = execute(item, plan, { FLOW_PR_FAIL_CREATE_AFTER: "1" }); assert.equal(partial.status, "partial"); assert.equal(partial.effects.push, "confirmed"); assert.equal(partial.effects.prCreate, "unknown"); assert.equal(partial.recovery.requiresFreshInspection, true); assert.equal(partial.recovery.code, "prepare-again");
  const retry = execute(item, plan); assert.equal(retry.error.code, "handle-missing"); const fresh = prepared(item, intent({ push: "verify-existing" })); assert.equal(execute(item, fresh).status, "noop");
});

test("GitHub remote parsing keeps canonical repository identity strict", () => {
  const expected = { host: "github.com", owner: "Owner", name: "Repo" };
  for (const value of ["https://github.com/Owner/Repo.git", "ssh://git@github.com/Owner/Repo.git", "git@github.com:Owner/Repo.git"]) assert.deepEqual(parseGitHubRemote(value), expected);
  for (const value of ["https://user:secret@github.com/Owner/Repo.git", "git@gitlab.com:Owner/Repo.git", "ftp://github.com/Owner/Repo.git"]) assert.throws(() => parseGitHubRemote(value));
});
