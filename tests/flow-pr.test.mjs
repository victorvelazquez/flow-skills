import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonical, validateRequest } from "../scripts/lib/flow-pr-contracts.mjs";
import { parseGitHubRemote } from "../scripts/lib/flow-pr-inspection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-pr.mjs");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const maybeGit = (cwd, args) => { const result = spawnSync("git", args, { cwd, encoding: "utf8" }); return result.status === 0 ? result.stdout.trim() : ""; };

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-v4-"));
  const remote = path.join(directory, "remote.git");
  const cwd = path.join(directory, "work");
  fs.mkdirSync(cwd);
  git(directory, ["init", "--bare", "-q", remote]);
  git(cwd, ["init", "-q", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@example.test"]);
  git(cwd, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(cwd, "initial.txt"), "initial\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "chore: initial"]);
  const origin = "https://github.com/example/repo.git";
  git(cwd, ["config", `url.file://${remote.replaceAll("\\", "/")}.insteadOf`, origin]);
  git(cwd, ["remote", "add", "origin", origin]);
  git(cwd, ["push", "-q", "-u", "origin", "main"]);
  git(cwd, ["checkout", "-qb", "feat/contract"]);
  fs.writeFileSync(path.join(cwd, "feature.txt"), "feature\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "feat: contract"]);

  const gh = path.join(directory, "gh.mjs");
  const state = path.join(directory, "prs.json");
  const calls = path.join(directory, "calls.jsonl");
  fs.writeFileSync(gh, `import fs from "node:fs";
const a=process.argv.slice(2),s=process.env.FLOW_PR_STATE,c=process.env.FLOW_PR_CALLS,load=()=>fs.existsSync(s)?JSON.parse(fs.readFileSync(s,"utf8")):[],save=v=>fs.writeFileSync(s,JSON.stringify(v)),val=x=>a[a.indexOf(x)+1];
fs.appendFileSync(c,JSON.stringify(a)+"\\n");let all=load();
if(a[0]==="pr"&&a[1]==="list"){if(process.env.FLOW_PR_FAIL_LIST){process.stderr.write("list unavailable");process.exit(1)}if(process.env.FLOW_PR_INVALID_JSON)process.stdout.write("{");else if(process.env.FLOW_PR_NON_ARRAY)process.stdout.write("{}");else process.stdout.write(JSON.stringify(all));}
else if(a[0]==="pr"&&a[1]==="create"){const [owner,ref]=val("--head").split(":"),pr={number:all.length+1,url:"https://github.com/example/repo/pull/"+(all.length+1),state:"OPEN",isDraft:a.includes("--draft"),headRefOid:process.env.FLOW_PR_HEAD,headRefName:ref,headRepositoryOwner:{login:owner},baseRefName:val("--base"),baseRefOid:process.env.FLOW_PR_BASE,title:val("--title"),body:fs.readFileSync(0,"utf8"),labels:a.flatMap((x,i)=>x==="--label"?[{name:a[i+1]}]:[])};if(!process.env.FLOW_PR_FAIL_CREATE_BEFORE){all.push(pr);save(all)}if(process.env.FLOW_PR_FAIL_CREATE_BEFORE||process.env.FLOW_PR_FAIL_CREATE_AFTER){process.stderr.write("unknown create");process.exit(1)}process.stdout.write(pr.url);}
else if(a[0]==="pr"&&a[1]==="edit"){const p=all.find(x=>String(x.number)===a[2]),editable=a.includes("--title")||a.includes("--body-file")||a.includes("--add-label")||a.includes("--remove-label");if(!editable){process.stderr.write("empty edit");process.exit(9)}if(a.includes("--title"))p.title=val("--title");if(a.includes("--body-file"))p.body=fs.readFileSync(0,"utf8");for(let i=0;i<a.length;i++){if(a[i]==="--add-label"&&!p.labels.some(x=>x.name===a[i+1]))p.labels.push({name:a[i+1]});if(a[i]==="--remove-label")p.labels=p.labels.filter(x=>x.name!==a[i+1]);}save(all);if(process.env.FLOW_PR_FAIL_EDIT_AFTER){process.stderr.write("unknown edit");process.exit(1)}}
else if(a[0]==="pr"&&a[1]==="ready"){const p=all.find(x=>String(x.number)===a[2]);p.isDraft=a.includes("--undo");save(all);if(process.env.FLOW_PR_FAIL_READY_AFTER){process.stderr.write("unknown ready");process.exit(1)}}
else if(a[0]==="pr"&&a[1]==="view"){if(process.env.FLOW_PR_FAIL_VIEW){process.stderr.write("view unavailable");process.exit(1)}const p=structuredClone(all.find(x=>String(x.number)===a[2]));if(process.env.FLOW_PR_BAD_VIEW)p.title="unexpected";if(process.env.FLOW_PR_BAD_BASE_VIEW)p.baseRefOid="0".repeat(40);if(process.env.FLOW_PR_FOREIGN_URL_VIEW)p.url="https://github.com/foreign/repo/pull/"+p.number;process.stdout.write(JSON.stringify(p));}
else{process.stderr.write("unsupported "+a.join(" "));process.exit(1)}`);
  return { directory, remote, cwd, gh, state, calls };
}

function run(item, args, extra = {}) {
  return spawnSync(process.execPath, [runtime, ...args], { cwd: item.cwd, encoding: "utf8", env: { ...process.env, FLOW_PR_GH_SCRIPT: item.gh, FLOW_PR_STATE: item.state, FLOW_PR_CALLS: item.calls, FLOW_PR_HEAD: maybeGit(item.cwd, ["rev-parse", "HEAD"]), FLOW_PR_BASE: maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0], ...extra } });
}
function runFrom(item, cwd, args, extra = {}) { const previous = item.cwd; item.cwd = cwd; try { return run(item, args, extra); } finally { item.cwd = previous; } }
function inspect(item, base = "main", pushRemote = "origin") { return run(item, ["--inspect", "--base", base, "--push-remote", pushRemote]); }
function facts(item, base = "main", pushRemote = "origin") { const value = inspect(item, base, pushRemote); assert.equal(value.status, 0, value.stderr + value.stdout); return JSON.parse(value.stdout).snapshot.facts; }
function request(snapshot, options = {}) {
  const target = snapshot.target;
  const pushRepository = snapshot.push.repository;
  return {
    schema: "flow-pr/request-v1",
    approved: true,
    expected: { snapshot, intent: options.intent || { push: "publish", upstream: "set" } },
    delivery: { mode: options.mode || "same-repo", target, push: { remote: snapshot.push.remote, repository: pushRepository }, head: { owner: pushRepository.owner, ref: snapshot.branch, repository: pushRepository } },
    pr: { title: "feat: contract", body: "Deterministic body\n", draft: true, labels: { add: ["type:feature"], remove: [] }, updateExisting: ["title", "body", "draft", "labels"], ...options.pr },
  };
}
function execute(item, value, extra = {}) { const file = path.join(item.directory, `request-${Math.random().toString(16).slice(2)}.json`); fs.writeFileSync(file, JSON.stringify(value)); return run(item, ["--execute", "--request", file], extra); }
function publishExact(item) { git(item.cwd, ["push", "-q", "-u", "origin", "HEAD:refs/heads/feat/contract"]); }
function calls(item) { return fs.existsSync(item.calls) ? fs.readFileSync(item.calls, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : []; }
function rawPr(snapshot, overrides = {}) {
  return { number: 1, url: "https://github.com/example/repo/pull/1", state: "OPEN", isDraft: true, headRefOid: snapshot.headOid, headRefName: snapshot.branch, headRepositoryOwner: { login: snapshot.head.owner }, baseRefName: snapshot.base.ref, baseRefOid: snapshot.base.oid, title: "feat: contract", body: "Deterministic body\n", labels: [{ name: "type:feature" }], ...overrides };
}
function moveRemote(item, ref = "main") {
  const publisher = path.join(item.directory, `publisher-${ref.replaceAll("/", "-")}`);
  fs.mkdirSync(publisher);
  git(publisher, ["init", "-q"]); git(publisher, ["config", "user.email", "test@example.test"]); git(publisher, ["config", "user.name", "Test"]); git(publisher, ["remote", "add", "origin", item.remote]); git(publisher, ["fetch", "-q", "origin", ref]); git(publisher, ["checkout", "-qb", ref, "FETCH_HEAD"]);
  fs.writeFileSync(path.join(publisher, "remote.txt"), `${Date.now()}\n`); git(publisher, ["add", "."]); git(publisher, ["commit", "-qm", "chore: move remote"]); git(publisher, ["push", "-q", "origin", `HEAD:refs/heads/${ref}`]);
  return git(publisher, ["rev-parse", "HEAD"]);
}
function publishUnknownRemoteHead(item) {
  const publisher = path.join(item.directory, "publisher-unknown-head"); fs.mkdirSync(publisher); git(publisher, ["init", "-q"]); git(publisher, ["config", "user.email", "test@example.test"]); git(publisher, ["config", "user.name", "Test"]); git(publisher, ["remote", "add", "origin", item.remote]); git(publisher, ["fetch", "-q", "origin", "main"]); git(publisher, ["checkout", "-qb", "feat/contract", "FETCH_HEAD"]); fs.writeFileSync(path.join(publisher, "other.txt"), "other\n"); git(publisher, ["add", "."]); git(publisher, ["commit", "-qm", "feat: remote-only"]); git(publisher, ["push", "-q", "origin", "HEAD:refs/heads/feat/contract"]); return git(publisher, ["rev-parse", "HEAD"]);
}
function installPrePushHook(item, source) {
  const gitDir = path.resolve(item.cwd, git(item.cwd, ["rev-parse", "--git-dir"])); const script = path.join(item.directory, `pre-push-${Math.random().toString(16).slice(2)}.mjs`); const hook = path.join(gitDir, "hooks", "pre-push"); fs.writeFileSync(script, source); fs.writeFileSync(hook, `#!/bin/sh\nexec "${process.execPath.replaceAll("\\", "/")}" "${script.replaceAll("\\", "/")}"\n`); fs.chmodSync(hook, 0o755);
}

test("GitHub remote parsing accepts canonical HTTPS, SSH, and scp forms and rejects unsafe identities", () => {
  const expected = { host: "github.com", owner: "Owner", name: "Repo" };
  for (const value of ["https://github.com/Owner/Repo.git", "https://github.com/Owner/Repo", "ssh://git@github.com/Owner/Repo.git", "git@github.com:Owner/Repo.git"]) assert.deepEqual(parseGitHubRemote(value), expected);
  for (const value of ["https://user@github.com/Owner/Repo.git", "https://user:secret@github.com/Owner/Repo.git", "ssh://owner@github.com/Owner/Repo.git", "git@gitlab.com:Owner/Repo.git", "https://github.example/Owner/Repo", "ftp://github.com/Owner/Repo.git"]) assert.throws(() => parseGitHubRemote(value), /unsafe|GitHub URL|github\.com/);
});

test("canonical root and composed or environment-prefixed argv fail without effects", async (t) => {
  const scenarios = [
    { name: "subdirectory", run: (item) => { const child = path.join(item.cwd, "child"); fs.mkdirSync(child); return runFrom(item, child, ["--inspect", "--base", "main"]); } },
    { name: "composed", run: (item) => run(item, ["--inspect;git", "push", "--base", "main"]) },
    { name: "environment-prefixed", run: (item) => run(item, ["FLOW_PR_GH=gh", "--inspect", "--base", "main"]) },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, () => { const item = fixture(); const before = maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/feat/contract"]); const output = JSON.parse(scenario.run(item).stdout); assert.notEqual(output.exit, 0); assert.ok(Object.values(output.effects).every((entry) => entry.state === "not-attempted")); assert.equal(maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/feat/contract"]), before); });
});

test("inspection binds remote base without mutation and handles known fast-forward ancestry", () => {
  const item = fixture();
  const before = git(item.cwd, ["status", "--porcelain"]);
  const initial = facts(item);
  assert.equal(initial.base.oid, git(item.cwd, ["rev-parse", "main"]));
  assert.equal(initial.relation.divergence, "unborn");
  git(item.cwd, ["push", "-q", "origin", "HEAD:refs/heads/feat/contract"]);
  fs.writeFileSync(path.join(item.cwd, "second.txt"), "second\n"); git(item.cwd, ["add", "."]); git(item.cwd, ["commit", "-qm", "feat: second"]);
  const ahead = facts(item);
  assert.deepEqual(ahead.relation, { ahead: 1, behind: 0, divergence: "ahead" });
  assert.equal(git(item.cwd, ["status", "--porcelain"]), before);
});

test("remote base movement drifts even while the local base ref stays stale", () => {
  const item = fixture(); const snapshot = facts(item); const localBase = git(item.cwd, ["rev-parse", "main"]); const remoteBase = moveRemote(item);
  assert.equal(git(item.cwd, ["rev-parse", "main"]), localBase);
  assert.equal(facts(item).base.oid, remoteBase);
  const output = JSON.parse(execute(item, request(snapshot)).stdout);
  assert.equal(output.status, "drift"); assert.equal(output.effects.push.state, "not-attempted"); assert.equal(git(item.cwd, ["rev-parse", "main"]), localBase);
});

test("deleted remote base and unavailable or invalid GitHub facts fail inspection without effects", async (t) => {
  const ghScenarios = [
    { name: "missing-gh", env: { FLOW_PR_GH_SCRIPT: path.join(os.tmpdir(), "missing-flow-pr-gh.mjs") }, code: "gh-unavailable" },
    { name: "unavailable-gh", env: { FLOW_PR_FAIL_LIST: "1" }, code: "gh-unavailable" },
    { name: "invalid-json", env: { FLOW_PR_INVALID_JSON: "1" }, code: "gh-invalid-json" },
    { name: "non-array-json", env: { FLOW_PR_NON_ARRAY: "1" }, code: "gh-invalid-json" },
  ];
  for (const scenario of ghScenarios) await t.test(scenario.name, () => { const item = fixture(); const output = JSON.parse(run(item, ["--inspect", "--base", "main"], scenario.env).stdout); assert.equal(output.status, "failure"); assert.equal(output.error.code, scenario.code); assert.ok(Object.values(output.effects).every((entry) => entry.state === "not-attempted")); });
  await t.test("deleted-base", () => { const item = fixture(); git(item.directory, ["--git-dir", item.remote, "update-ref", "-d", "refs/heads/main"]); const output = JSON.parse(inspect(item).stdout); assert.equal(output.status, "failure"); assert.equal(output.error.code, "remote-ref-missing"); assert.ok(Object.values(output.effects).every((entry) => entry.state === "not-attempted")); });
});

test("strict contracts reject relation, PR consistency, controls, overlaps, extras, and hostile refs", () => {
  const item = fixture(); const snapshot = facts(item); const value = request(snapshot);
  const invalid = [
    [{ ...value, extra: true }, /unsupported/],
    [{ ...value, pr: { ...value.pr, title: "bad\nvalue" } }, /single-line/],
    [{ ...value, pr: { ...value.pr, body: "bad\tbody" } }, /control/],
    [{ ...value, delivery: { ...value.delivery, head: { ...value.delivery.head, ref: "bad\nref" } } }, /safe Git ref/],
    [{ ...value, pr: { ...value.pr, labels: { add: ["x"], remove: ["x"] } } }, /overlap/],
    [{ ...value, expected: { ...value.expected, snapshot: { ...snapshot, relation: { ...snapshot.relation, ahead: "1" } } } }, /relation/],
    [{ ...value, expected: { ...value.expected, snapshot: { ...snapshot, pr: { availability: "exact", exact: null, candidates: [], reason: null } } } }, /inconsistent/],
  ];
  for (const [candidate, message] of invalid) assert.throws(() => validateRequest(candidate), message);
  assert.equal(canonical({ b: 1, a: [true] }), canonical({ a: [true], b: 1 }));
});

test("relation variants are reported with strict integer or null counts", () => {
  const unborn = fixture(); assert.deepEqual(facts(unborn).relation, { ahead: null, behind: null, divergence: "unborn" });
  const equal = fixture(); publishExact(equal); assert.deepEqual(facts(equal).relation, { ahead: 0, behind: 0, divergence: "equal" });
  const ahead = fixture(); publishExact(ahead); fs.writeFileSync(path.join(ahead.cwd, "ahead.txt"), "ahead\n"); git(ahead.cwd, ["add", "."]); git(ahead.cwd, ["commit", "-qm", "feat: ahead"]); assert.deepEqual(facts(ahead).relation, { ahead: 1, behind: 0, divergence: "ahead" });
  const behind = fixture(); fs.writeFileSync(path.join(behind.cwd, "remote-ahead.txt"), "remote ahead\n"); git(behind.cwd, ["add", "."]); git(behind.cwd, ["commit", "-qm", "feat: remote ahead"]); git(behind.cwd, ["push", "-q", "origin", "HEAD:refs/heads/feat/behind"]); git(behind.cwd, ["checkout", "-qb", "feat/behind", "HEAD~1"]); assert.deepEqual(facts(behind).relation, { ahead: 0, behind: 1, divergence: "behind" });
  fs.writeFileSync(path.join(behind.cwd, "diverged.txt"), "diverged\n"); git(behind.cwd, ["add", "."]); git(behind.cwd, ["commit", "-qm", "feat: diverged"]); assert.deepEqual(facts(behind).relation, { ahead: 1, behind: 1, divergence: "diverged" });
});

test("explicit fork delivery independently binds target, push repository, and head owner", () => {
  const item = fixture(); const forkBare = path.join(item.directory, "fork.git"); git(item.directory, ["init", "--bare", "-q", forkBare]); const forkUrl = "https://github.com/contributor/repo.git"; git(item.cwd, ["config", `url.file://${forkBare.replaceAll("\\", "/")}.insteadOf`, forkUrl]); git(item.cwd, ["remote", "add", "fork", forkUrl]);
  const snapshot = facts(item, "main", "fork"); const output = JSON.parse(execute(item, request(snapshot, { mode: "fork" })).stdout);
  assert.equal(output.status, "success"); assert.equal(output.pr.head.owner, "contributor"); assert.equal(output.pr.repository.owner, "example"); assert.equal(git(item.cwd, ["ls-remote", "fork", `refs/heads/${snapshot.branch}`]).split(/\s+/)[0], snapshot.headOid);
});

test("dirty, protected, detached, merge, rebase, and uncommitted states are known and block before mutation", async (t) => {
  const scenarios = [
    { name: "dirty", setup: (item) => fs.writeFileSync(path.join(item.cwd, "dirty.txt"), "dirty\n") },
    { name: "protected", setup: (item) => git(item.cwd, ["checkout", "-q", "main"]) },
    { name: "merge", setup: (item) => fs.writeFileSync(path.join(item.cwd, git(item.cwd, ["rev-parse", "--git-dir"]), "MERGE_HEAD"), `${git(item.cwd, ["rev-parse", "HEAD"])}\n`) },
    { name: "rebase", setup: (item) => fs.mkdirSync(path.join(item.cwd, git(item.cwd, ["rev-parse", "--git-dir"]), "rebase-merge")) },
    { name: "uncommitted", setup: (item) => { git(item.cwd, ["checkout", "-q", "--orphan", "feat/uncommitted"]); git(item.cwd, ["rm", "-q", "-rf", "."]); } },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, () => { const item = fixture(); scenario.setup(item); const inspected = JSON.parse(inspect(item).stdout); assert.equal(inspected.status, "inspect"); const output = JSON.parse(execute(item, request(inspected.snapshot.facts)).stdout); assert.equal(output.status, "blocked"); assert.equal(output.exit, 2); assert.equal(output.blocker.code, "unsafe-local-state"); assert.equal(output.recovery.requiresFreshInspection, true); assert.ok(Object.values(output.effects).every((entry) => entry.state === "not-attempted")); });
  await t.test("detached", () => { const item = fixture(); const approved = request(facts(item)); git(item.cwd, ["checkout", "-q", "--detach"]); const inspected = JSON.parse(inspect(item).stdout); assert.equal(inspected.status, "inspect"); assert.equal(inspected.snapshot.facts.detached, true); assert.equal(inspected.snapshot.facts.branch, null); assert.equal(inspected.snapshot.facts.head.ref, null); assert.ok(Object.values(inspected.effects).every((entry) => entry.state === "not-attempted")); const output = JSON.parse(execute(item, approved).stdout); assert.equal(output.status, "blocked"); assert.equal(output.exit, 2); assert.equal(output.blocker.code, "unsafe-local-state"); assert.equal(output.recovery.requiresFreshInspection, true); assert.ok(Object.values(output.effects).every((entry) => entry.state === "not-attempted")); });
});

test("upstream mismatch and unknown ancestry block without push", async (t) => {
  await t.test("upstream-mismatch", () => { const item = fixture(); publishExact(item); git(item.cwd, ["branch", "--set-upstream-to", "origin/main"]); const snapshot = facts(item); const before = maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/feat/contract"]); const output = JSON.parse(execute(item, request(snapshot)).stdout); assert.equal(output.status, "blocked"); assert.equal(output.blocker.code, "upstream-mismatch"); assert.equal(maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/feat/contract"]), before); });
  await t.test("unknown-ancestry", () => { const item = fixture(); const remoteOid = publishUnknownRemoteHead(item); const snapshot = facts(item); assert.equal(snapshot.push.remoteHeadOid, remoteOid); assert.equal(snapshot.relation.divergence, "unknown"); const output = JSON.parse(execute(item, request(snapshot)).stdout); assert.equal(output.status, "blocked"); assert.equal(output.blocker.code, "non-fast-forward"); assert.equal(maybeGit(item.cwd, ["ls-remote", "origin", "refs/heads/feat/contract"]).split(/\s+/)[0], remoteOid); assert.equal(output.effects.push.state, "not-attempted"); });
});

test("ambiguous, closed, and merged PR authority blocks without PR mutation", async (t) => {
  for (const scenario of ["ambiguous", "closed", "merged"]) await t.test(scenario, () => {
    const item = fixture(); publishExact(item); const baseline = facts(item); const entries = [rawPr(baseline, { state: scenario === "closed" ? "CLOSED" : scenario === "merged" ? "MERGED" : "OPEN" })]; if (scenario === "ambiguous") entries.push(rawPr(baseline, { number: 2, url: "https://github.com/example/repo/pull/2" })); fs.writeFileSync(item.state, JSON.stringify(entries));
    const snapshot = facts(item); fs.writeFileSync(item.calls, ""); const output = JSON.parse(execute(item, request(snapshot, { intent: { push: "verify-existing", upstream: "verify" } })).stdout);
    assert.equal(output.status, "blocked"); assert.ok(["pr-ambiguous", "pr-incompatible"].includes(output.blocker.code)); assert.ok(!calls(item).some((entry) => ["create", "edit", "ready"].includes(entry[1])));
  });
});

test("PR base OID is sourced from GitHub and mismatches or drift block", async (t) => {
  await t.test("matching-base", () => { const item = fixture(); publishExact(item); const baseline = facts(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline)])); const snapshot = facts(item); assert.equal(snapshot.pr.exact.base.oid, snapshot.base.oid); const output = JSON.parse(execute(item, request(snapshot, { intent: { push: "verify-existing", upstream: "verify" } })).stdout); assert.equal(output.status, "noop"); });
  await t.test("mismatched-base", () => { const item = fixture(); publishExact(item); const baseline = facts(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, { baseRefOid: "0".repeat(40) })])); const snapshot = facts(item); assert.notEqual(snapshot.pr.exact.base.oid, snapshot.base.oid); const output = JSON.parse(execute(item, request(snapshot, { intent: { push: "verify-existing", upstream: "verify" } })).stdout); assert.equal(output.status, "blocked"); assert.equal(output.blocker.code, "pr-incompatible"); assert.ok(!calls(item).some((entry) => ["create", "edit", "ready"].includes(entry[1]))); });
  await t.test("base-oid-drift", () => { const item = fixture(); publishExact(item); const baseline = facts(item); const entry = rawPr(baseline); fs.writeFileSync(item.state, JSON.stringify([entry])); const snapshot = facts(item); entry.baseRefOid = snapshot.headOid; fs.writeFileSync(item.state, JSON.stringify([entry])); const output = JSON.parse(execute(item, request(snapshot, { intent: { push: "verify-existing", upstream: "verify" } })).stdout); assert.equal(output.status, "drift"); assert.equal(output.effects.prUpdate.state, "not-attempted"); });
});

test("PR URLs must match the canonical target repository and returned number", async (t) => {
  for (const [name, url] of [["foreign", "https://github.com/foreign/repo/pull/1"], ["wrong-number", "https://github.com/example/repo/pull/2"], ["query", "https://github.com/example/repo/pull/1?x=1"], ["malformed", "not-a-url"]]) await t.test(name, () => { const item = fixture(); publishExact(item); const baseline = facts(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, { url })])); const output = JSON.parse(inspect(item).stdout); assert.equal(output.status, "failure"); assert.match(output.error.message, /url/i); assert.ok(Object.values(output.effects).every((entry) => entry.state === "not-attempted")); });
});

test("authorized title, body, labels, and draft combinations use only supported gh operations", async (t) => {
  const scenarios = [
    { name: "title", raw: { title: "old" }, pr: {}, edit: true, ready: false },
    { name: "body", raw: { body: "old\n" }, pr: {}, edit: true, ready: false },
    { name: "labels", raw: { labels: [{ name: "keep" }] }, pr: {}, edit: true, ready: false },
    { name: "draft-only", raw: { isDraft: false }, pr: { labels: { add: [], remove: [] } }, edit: false, ready: true },
    { name: "combined", raw: { title: "old", isDraft: false }, pr: {}, edit: true, ready: true },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, () => {
    const item = fixture(); publishExact(item); const baseline = facts(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, scenario.raw)])); const snapshot = facts(item); fs.writeFileSync(item.calls, "");
    const output = JSON.parse(execute(item, request(snapshot, { intent: { push: "verify-existing", upstream: "verify" }, pr: scenario.pr })).stdout); const operations = calls(item);
    assert.equal(output.status, "success"); assert.equal(operations.some((entry) => entry[1] === "edit"), scenario.edit); assert.equal(operations.some((entry) => entry[1] === "ready"), scenario.ready); assert.ok(!operations.some((entry) => entry[1] === "edit" && !entry.some((arg) => ["--title", "--body-file", "--add-label", "--remove-label"].includes(arg))));
  });
});

test("post-mutation failures mark affected effects unknown and require fresh inspection", async (t) => {
  const scenarios = [
    { name: "edit", raw: { title: "old" }, env: { FLOW_PR_FAIL_EDIT_AFTER: "1" }, effect: "prUpdate" },
    { name: "draft", raw: { isDraft: false }, env: { FLOW_PR_FAIL_READY_AFTER: "1" }, pr: { labels: { add: [], remove: [] } }, effect: "prUpdate" },
    { name: "verification", raw: { title: "old" }, env: { FLOW_PR_FAIL_VIEW: "1" }, effect: "prUpdate" },
    { name: "base-postcondition", raw: { title: "old" }, env: { FLOW_PR_BAD_BASE_VIEW: "1" }, effect: "prUpdate" },
    { name: "url-postcondition", raw: { title: "old" }, env: { FLOW_PR_FOREIGN_URL_VIEW: "1" }, effect: "prUpdate" },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, () => {
    const item = fixture(); publishExact(item); const baseline = facts(item); fs.writeFileSync(item.state, JSON.stringify([rawPr(baseline, scenario.raw)])); const snapshot = facts(item); const output = JSON.parse(execute(item, request(snapshot, { intent: { push: "verify-existing", upstream: "verify" }, pr: scenario.pr }), scenario.env).stdout);
    assert.equal(output.status, "failure"); assert.equal(output.effects[scenario.effect].state, "unknown"); assert.equal(output.recovery.requiresFreshInspection, true);
  });
});

test("partial push recovery requires inspection and an exact rerun noops", () => {
  const item = fixture(); const first = facts(item); const failed = JSON.parse(execute(item, request(first), { FLOW_PR_FAIL_CREATE_AFTER: "1" }).stdout);
  assert.equal(failed.status, "partial"); assert.equal(failed.effects.push.state, "confirmed"); assert.equal(failed.effects.prCreate.state, "unknown"); assert.equal(failed.effects.labels.state, "unknown"); assert.equal(failed.recovery.requiresFreshInspection, true);
  const fresh = facts(item); const rerun = JSON.parse(execute(item, request(fresh, { intent: { push: "verify-existing", upstream: "verify" } })).stdout);
  assert.equal(rerun.status, "noop"); assert.ok(Object.values(rerun.effects).every((entry) => entry.state === "not-attempted"));
});

test("post-push authority races preserve confirmed push and perform zero PR mutation", async (t) => {
  const scenarios = [
    { name: "base-moves", prepare: (item, snapshot) => { const oldBase = snapshot.base.oid; const movedBase = moveRemote(item); git(item.directory, ["--git-dir", item.remote, "update-ref", "refs/heads/race-base", movedBase]); git(item.directory, ["--git-dir", item.remote, "update-ref", "refs/heads/main", oldBase]); installPrePushHook(item, `import {spawnSync} from "node:child_process";const r=spawnSync("git",["--git-dir",${JSON.stringify(item.remote)},"update-ref","refs/heads/main",${JSON.stringify(movedBase)}]);process.exit(r.status??1);`); return { expected: oldBase, observed: movedBase, select: (facts) => facts.base.oid }; } },
    { name: "pr-appears", prepare: (item, snapshot) => { const appeared = rawPr(snapshot); installPrePushHook(item, `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(item.state)},JSON.stringify([${JSON.stringify(appeared)}]));`); return { expected: "none", observed: "exact", select: (facts) => facts.pr.availability }; } },
    { name: "pr-changes", existing: true, prepare: (item, snapshot) => { const changed = rawPr(snapshot, { title: "changed during push", labels: [{ name: "type:bug" }] }); installPrePushHook(item, `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(item.state)},JSON.stringify([${JSON.stringify(changed)}]));`); return { expected: "feat: contract", observed: "changed during push", select: (facts) => facts.pr.exact.title }; } },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, () => {
    const item = fixture(); let snapshot = facts(item); if (scenario.existing) { fs.writeFileSync(item.state, JSON.stringify([rawPr(snapshot)])); snapshot = facts(item); } const authority = scenario.prepare(item, snapshot); fs.writeFileSync(item.calls, ""); const output = JSON.parse(execute(item, request(snapshot)).stdout); const operations = calls(item);
    assert.equal(output.status, "partial"); assert.equal(output.exit, 4); assert.equal(output.phase, "push"); assert.equal(output.blocker.code, "post-push-authority-drift"); assert.equal(output.snapshot.expected, snapshot.identity); assert.notEqual(output.snapshot.observed, snapshot.identity); assert.equal(authority.select(snapshot), authority.expected); assert.equal(authority.select(output.snapshot.facts), authority.observed); assert.equal(output.effects.push.state, "confirmed"); assert.equal(output.effects.push.after, snapshot.headOid); assert.equal(output.effects.upstream.state, "confirmed"); assert.equal(output.recovery.requiresFreshInspection, true); assert.ok([output.effects.prCreate, output.effects.prUpdate, output.effects.labels].every((entry) => entry.state === "not-attempted")); assert.ok(!operations.some((entry) => ["create", "edit", "ready"].includes(entry[1])));
  });
});

test("runtime materializes an approved request only in an owned OS temp directory", () => {
  const item = fixture(); const value = request(facts(item)); const encoded = Buffer.from(JSON.stringify(value)).toString("base64url"); const output = run(item, ["--materialize-request", "--request-base64", encoded]); assert.equal(output.status, 0, output.stderr); const materialized = JSON.parse(output.stdout);
  assert.equal(materialized.schema, "flow-pr/request-materialized-v1"); assert.deepEqual(materialized.request, value); assert.equal(path.basename(materialized.path), "request.json"); assert.equal(path.dirname(materialized.path).startsWith(os.tmpdir()), true); assert.deepEqual(JSON.parse(fs.readFileSync(materialized.path, "utf8")), value); assert.equal(fs.existsSync(path.join(item.cwd, ".flow-tmp")), false);
  const executed = run(item, ["--execute", "--request", materialized.path]); assert.equal(executed.status, 0, executed.stderr); assert.equal(fs.existsSync(materialized.path), false); assert.equal(fs.existsSync(path.dirname(materialized.path)), false);
});
