import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertReviewedDeliveryTopology } from "../scripts/flow-pr.mjs";
import { FLOW_CHAIN_PLAN_SCHEMA, parseNumstat, summarizeLineAccounting } from "../scripts/lib/flow-chain-plan.mjs";
import { DEFAULT_DELIVERY_CONFIG } from "../scripts/lib/flow-delivery-config.mjs";
import { digestChangedPaths } from "../scripts/lib/flow-check-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "flow-pr.mjs");
const publicationHarness = path.join(root, "tests", "flow-pr-harness.mjs");
const nativePathsDigestHelper = new URL("./helpers/native-paths-digest.mjs", import.meta.url).href;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function run(cwd, args, env = {}) {
  let effectiveArgs = args;
  if (args[0] === "--publish-promotion" && env.FLOW_TEST_RAW_PUBLISH_ARGS !== "1") {
    const state = JSON.parse(fs.readFileSync(args[args.indexOf("--state-file") + 1], "utf8"));
    effectiveArgs = [...args, "--coordinator-state-file", state.review.coordinatorStateFile,
      "--expected-promotion-plan-id", state.review.promotionPlanId];
  }
  if (args.includes("--chain-plan") && !args.includes("--dry-run") && !args.includes("--expected-chain-plan-id") && env.FLOW_TEST_RAW_CHAIN_ARGS !== "1") {
    const preview = run(cwd, [...args, "--dry-run"], { ...env, FLOW_TEST_RAW_CHAIN_ARGS: "1" });
    assert.equal(preview.status, 0, preview.stderr);
    effectiveArgs = [...args, "--expected-chain-plan-id", JSON.parse(preview.stdout).chainPlanId];
  }
  const command = args[0] === "--publish-promotion"
    ? [publicationHarness, ...effectiveArgs]
    : env.FLOW_USE_HARNESS === "1"
      ? [publicationHarness, ...effectiveArgs]
      : [script, ...effectiveArgs];
  return spawnSync(process.execPath, command, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 8 * 1024 * 1024,
  });
}

function makeRepo({ integration = "development", production = "main", configured = false } = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-canonical-"));
  const remote = path.join(fixture, "remote.git");
  const cwd = path.join(fixture, "work");
  fs.mkdirSync(cwd);
  git(fixture, ["init", "--bare", "-q", remote]);
  git(cwd, ["init", "-q", "-b", production]);
  git(cwd, ["config", "user.email", "flow-pr@example.test"]);
  git(cwd, ["config", "user.name", "Flow PR Test"]);
  if (configured) {
    git(cwd, ["config", "flow.integrationBranch", integration]);
    git(cwd, ["config", "flow.productionBranch", production]);
  }
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }, null, 2) + "\n");
  fs.writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({
    name: "fixture", version: "1.0.0", lockfileVersion: 3,
    packages: { "": { name: "fixture", version: "1.0.0" } },
  }, null, 2) + "\n");
  fs.writeFileSync(path.join(cwd, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-qm", "chore: initial"]);
  const originUrl = "https://github.com/example/repo.git";
  git(cwd, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, originUrl]);
  git(cwd, ["remote", "add", "origin", originUrl]);
  git(cwd, ["push", "-q", "-u", "origin", production]);
  git(cwd, ["checkout", "-qb", integration]);
  fs.writeFileSync(path.join(cwd, "feature.txt"), "candidate\n");
  git(cwd, ["add", "feature.txt"]);
  git(cwd, ["commit", "-qm", "feat: candidate"]);
  git(cwd, ["push", "-q", "-u", "origin", integration]);
  return { fixture, remote, cwd, integration, production, originUrl };
}

function prepare(repo) {
  const stateFile = path.join(repo.fixture, "promotion.json");
  const coordinatorFile = path.join(repo.fixture, "coordinator.json");
  const gentle = path.join(repo.fixture, "promotion-gentle.mjs"), audit = path.join(repo.fixture, "promotion-audit.mjs");
  fs.writeFileSync(audit, "");
  fs.writeFileSync(gentle, `import fs from"node:fs";import{execFileSync}from"node:child_process";import{createHash}from"node:crypto";import{nativePathsDigest}from${JSON.stringify(nativePathsDigestHelper)};const a=process.argv.slice(2),op=a[1],s=(x)=>"sha256:"+x.repeat(64),at=(f)=>a[a.indexOf(f)+1],git=(x)=>execFileSync("git",x,{encoding:"utf8"}).trim(),promotionPathsDigest=(values)=>"sha256:"+createHash("sha256").update(values.join("\\0")).digest("hex");if(op==="capabilities")process.stdout.write(JSON.stringify({schema:"gentle-ai.review-integration.capabilities/v1",contract:"gentle-ai.review-integration/v1",operations:["review.status","review.start","review.finalize","review.validate"]}));else if(op==="status")process.stdout.write(JSON.stringify({schema:"gentle-ai.review-integration.status/v1",contract:"gentle-ai.review-integration/v1",operation:"review.status",applicability:"current_target",authority:{version:"compact-v2",lineage_id:"promotion-tests",state:"approved",generation:1,revision:s("5")},receipt:{status:"present",identity:s("7")},action:"validate",replayability:"not_replayable",target_identity:s("3"),frozen:{tier:"low"},selected_lenses:[],projection:{},candidates:[]}));else{const base=at("--base-ref"),paths=git(["diff","--name-only","--no-renames",base,"HEAD","--"]).split("\\n").filter(Boolean).sort(),gate=at("--gate"),pathsDigest=a.includes("--contract")?promotionPathsDigest(paths):nativePathsDigest(paths);if(gate&&process.env.FLOW_EVENT_LOG)fs.appendFileSync(process.env.FLOW_EVENT_LOG,"gate:"+gate+":"+base+":"+at("--lineage")+"\\n");if(process.env.FLOW_GENTLE_FAIL_GATE===gate){process.stderr.write("missing or stale receipt");process.exit(1)}process.stdout.write(JSON.stringify({schema:"gentle-ai.review-integration.operation/v1",contract:"gentle-ai.review-integration/v1",operation:"review.validate",result:{schema:"gentle-ai.review-gate-result/v1",result:"allow",allowed:true,action:"continue",reason:"approved",context:{lineage_id:"promotion-tests",store_revision:s("5"),base_tree:git(["rev-parse",base+"^{tree}"]),candidate_tree:git(["rev-parse","HEAD^{tree}"]),paths_digest:pathsDigest}}}));}`);
  const env = { FLOW_USE_HARNESS: "1", TEST_GENTLE_AI_SCRIPT: gentle, TEST_AUDIT_SCRIPT: audit };
  const planned = run(repo.cwd, ["--promotion-review", "--state-file", coordinatorFile], env);
  assert.equal(planned.status, 0, planned.stderr);
  const action = JSON.parse(planned.stdout);
  const validated = run(repo.cwd, ["--promotion-review", "--state-file", coordinatorFile, "--execute-action",
    "--expected-coordinator-fingerprint", action.coordinatorFingerprint, "--execution-key", action.nextAction.executionKey], env);
  assert.equal(validated.status, 0, validated.stderr);
  const promotionPlanId = JSON.parse(validated.stdout).promotionPlanId;
  const result = run(repo.cwd, ["--prepare-promotion", "--refresh", "--state-file", stateFile,
    "--coordinator-state-file", coordinatorFile, "--expected-promotion-plan-id", promotionPlanId], env);
  assert.equal(result.status, 0, result.stderr);
  repo.promotionGentle = gentle;
  return { stateFile, state: JSON.parse(result.stdout) };
}

function writeMocks(repo, options = {}) {
  const log = path.join(repo.fixture, "events.log");
  const ghState = path.join(repo.fixture, "gh-state.json");
  const gentle = repo.promotionGentle || path.join(repo.fixture, "gentle.mjs");
  const audit = path.join(repo.fixture, "audit.mjs");
  const gh = path.join(repo.fixture, "gh.mjs");
  const reviewEntry = path.join(repo.fixture, "review-entry");
  if (!repo.promotionGentle) fs.writeFileSync(gentle, `import fs from "node:fs"; import {nativePathsDigest} from ${JSON.stringify(nativePathsDigestHelper)}; import {execFileSync} from "node:child_process";
const a=process.argv.slice(2), op=a[1], gate=a[a.indexOf("--gate")+1], value=(flag)=>{const index=a.indexOf(flag);return index>=0?a[index+1]:null;}, git=(args)=>execFileSync("git",args,{encoding:"utf8"}).trim();
if(op==="status"){let integration;try{integration=git(["config","--get","flow.integrationBranch"])}catch{}integration=integration||["development","develop","dev"].find(x=>{try{git(["rev-parse","--verify","origin/"+x]);return true}catch{return false}});const base="origin/"+integration,paths=git(["diff","--name-only","--no-renames",base,"HEAD","--"]).split("\\n").filter(Boolean).sort(),digest=nativePathsDigest(paths),revision="sha256:task";fs.mkdirSync(process.env.FLOW_REVIEW_ENTRY,{recursive:true});fs.writeFileSync(process.env.FLOW_REVIEW_ENTRY+"/review-state.json",JSON.stringify({schema:"gentle-ai.review-state-record/v2",revision,state:{schema:"gentle-ai.review-state/v2",lineage_id:"review-task",state:"approved",initial_snapshot:{base_tree:git(["rev-parse",base+"^{tree}"]),candidate_tree:git(["rev-parse","HEAD^{tree}"]),paths,paths_digest:digest}}}));process.stdout.write(JSON.stringify({schema:"gentle-ai.review-authority-status/v1",complete:true,authoritative:true,entries:[{lineage_id:"review-task",path:process.env.FLOW_REVIEW_ENTRY,status:"approved",state:"approved",revision}]}));process.exit(0);}
const base=value("--base-ref"), requestedLineage=value("--lineage"), lineage=requestedLineage||"review-task", lineageSource=process.env.FLOW_LOG_LINEAGE_SOURCE==="1"?":"+(requestedLineage?"explicit":"resolved"):"", headBinding=process.env.FLOW_LOG_GATE_HEAD==="1"?":"+git(["rev-parse","HEAD"])+":"+git(["rev-parse","HEAD^{tree}"]):""; fs.appendFileSync(process.env.FLOW_EVENT_LOG, "gate:"+gate+":"+base+":"+lineage+lineageSource+headBinding+"\\n");
if(process.env.FLOW_GENTLE_FAIL_GATE===gate){process.stderr.write("missing or stale receipt");process.exit(1);}
const paths=git(["diff","--name-only","--no-renames",base,"HEAD","--"]).split("\\n").filter(Boolean).sort();
const pathsDigest=nativePathsDigest(paths);
process.stdout.write(JSON.stringify({schema:"gentle-ai.review-gate-result/v1",result:"allow",allowed:true,action:"continue",context:{lineage_id:lineage,store_revision:"sha256:task",base_tree:git(["rev-parse",base+"^{tree}"]),candidate_tree:git(["rev-parse","HEAD^{tree}"]),paths_digest:pathsDigest}}));`);
  fs.writeFileSync(audit, `import fs from "node:fs"; import {createHash} from "node:crypto"; import {execFileSync} from "node:child_process";
const a=process.argv.slice(2), base=a[a.indexOf("--base-ref")+1], candidate=a[a.indexOf("--candidate-ref")+1];
const git=(args)=>execFileSync("git",args,{encoding:"utf8"}).trim(), hash=(v)=>createHash("sha256").update(v).digest("hex");
const nativeRoot=fs.realpathSync.native(git(["rev-parse","--show-toplevel"])), root=process.platform==="win32"?nativeRoot.replace(/\\\\/g,"/").toLowerCase():nativeRoot.replace(/\\\\/g,"/"), remote=git(["config","--get","remote.origin.url"]);
const baseCommit=git(["rev-parse","--verify",base+"^{commit}"]), candidateCommit=git(["rev-parse","--verify",candidate+"^{commit}"]);
const changed=git(["diff","--name-only","--no-renames",baseCommit,candidateCommit,"--"]).split("\\n").filter(Boolean).sort();
fs.appendFileSync(process.env.FLOW_EVENT_LOG,"audit:"+(a.includes("--no-pass-cache")?"fresh":"cache")+":"+base+":"+candidate+"\\n");
const forged=process.env.FLOW_AUDIT_FORGED==="1";
process.stdout.write(JSON.stringify({success:true,evidence:{source:forged?"local-cache":"fresh",authoritative:!forged},candidate:{root,remote,repoIdentity:hash(JSON.stringify({remote,root})),toolConfigDigest:"a".repeat(64),publication:{baseRef:base,candidateRef:candidate,publicationBaseCommit:baseCommit,candidateCommit,candidateTree:git(["rev-parse",candidateCommit+"^{tree}"]),pathsDigest:hash(changed.join("\\0"))}}}));`);
  fs.writeFileSync(gh, `import fs from "node:fs"; import {spawnSync} from "node:child_process";
const a=process.argv.slice(2), log=process.env.FLOW_EVENT_LOG, statePath=process.env.FLOW_GH_STATE;
const load=()=>fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,"utf8")):[], save=(s)=>fs.writeFileSync(statePath,JSON.stringify(s));
const value=(flag)=>a[a.indexOf(flag)+1], select=(item)=>Object.fromEntries(value("--json").split(",").filter(Boolean).map(field=>[field,item?.[field]])), mutate=()=>spawnSync("git",["--git-dir",process.env.FLOW_REMOTE,"update-ref","refs/heads/"+process.env.FLOW_RELEASE_BRANCH,process.env.FLOW_REPLACEMENT],{shell:false});
let state=load(); const scope=a[0], command=a[1];
if(scope==="label"&&command==="list"){
 const names=(process.env.FLOW_GH_LABELS||"type:feature,type:bug,type:docs,type:refactor,type:chore,type:breaking-change").split(",").filter(Boolean); process.stdout.write(JSON.stringify(names.map(name=>select({name}))));
}else if(command==="list"){
 const countPath=statePath+".list-count", listCall=(fs.existsSync(countPath)?Number(fs.readFileSync(countPath,"utf8")):0)+1; fs.writeFileSync(countPath,String(listCall));
  if(Number(process.env.FLOW_GH_DRIFT_ON_LIST_CALL||0)===listCall&&state[0]){const kind=process.env.FLOW_GH_DRIFT_KIND; if(kind==="title")state[0].title+=" drift"; else if(kind==="body")state[0].body+=" drift"; else if(kind==="oid")state[0].headRefOid="0".repeat(40); else if(kind==="base")state[0].baseRefName="other-base"; else if(kind==="head")state[0].headRefName="other-head"; else if(kind==="state")state[0].state="CLOSED"; else if(kind==="label")state[0].labels=[{name:"human:keep"},{name:"type:bug"}]; save(state);}
  if(process.env.FLOW_GH_LIST_FAIL_FILE&&fs.existsSync(process.env.FLOW_GH_LIST_FAIL_FILE)&&(!process.env.FLOW_GH_LIST_FAIL_CALL||Number(process.env.FLOW_GH_LIST_FAIL_CALL)===listCall)){fs.unlinkSync(process.env.FLOW_GH_LIST_FAIL_FILE);process.stderr.write("synthetic list failure");process.exit(1);}
  const head=value("--head"), base=a.includes("--base")?value("--base"):null, requested=value("--state"); process.stdout.write(JSON.stringify(state.filter(pr=>(requested==="all"||pr.state==="OPEN")&&pr.headRefName===head&&(!base||pr.baseRefName===base)).map(select)));
}else if(command==="edit"){
 const pr=state.find(x=>String(x.number)===String(a[2])); if(!pr){process.exit(1);} const values=(flag)=>a.flatMap((x,i)=>x===flag?[a[i+1]]:[]), add=values("--add-label"), remove=values("--remove-label"), title=a.includes("--title")?value("--title"):null, hasBody=a.includes("--body-file"); pr.labels=(pr.labels||[]).filter(x=>!remove.includes(x.name)); for(const label of add)if(!pr.labels.some(x=>x.name===label))pr.labels.push({name:label}); if(title!==null)pr.title=title; if(hasBody)pr.body=fs.readFileSync(0,"utf8"); save(state); fs.appendFileSync(log,"edit:"+a[2]+":"+add.join(",")+":"+(title!==null?"title":"")+":"+(hasBody?"body":"")+"\\n"); process.stdout.write(pr.url);
}else if(command==="create"){
 const call=state.length+1, base=value("--base"), head=value("--head"), repo=value("--repo");
 fs.appendFileSync(log,"create:"+base+":"+head+":"+repo+":"+(a.includes("--draft")?"draft":"ready")+"\\n");
 const existing=state.find(pr=>pr.state==="OPEN"&&pr.headRefName===head&&pr.baseRefName===base); if(existing){process.stderr.write("already exists "+existing.url);process.exit(1);}
 if(Number(process.env.FLOW_GH_FAIL_CALL||0)===call){process.stderr.write("synthetic gh failure");process.exit(1);}
 if(Number(process.env.FLOW_MUTATE_DURING_CREATE_CALL||0)===call)mutate();
 const oid=spawnSync("git",["--git-dir",process.env.FLOW_REMOTE,"rev-parse","refs/heads/"+head],{encoding:"utf8",shell:false}).stdout.trim();
 const owner=process.env.FLOW_GH_OWNER_MISMATCH_ON_CREATE==="1"?"fork":process.env.FLOW_GH_OWNER_INCOMPLETE_ON_CREATE==="1"?"":"example";
 const labels=a.flatMap((x,i)=>x==="--label"?[{name:a[i+1]}]:[]), pr={number:call,url:"https://github.com/example/repo/pull/"+call,state:"OPEN",isDraft:a.includes("--draft"),headRefOid:oid,headRefName:head,headRepository:{name:"repo",nameWithOwner:""},headRepositoryOwner:{login:owner},baseRefName:base,title:value("--title"),body:fs.readFileSync(0,"utf8"),labels}; state.push(pr); save(state);
 if(Number(process.env.FLOW_GH_CREATE_THEN_FAIL_CALL||0)===call){process.stderr.write("synthetic response failure");process.exit(1);}
 if(process.env.FLOW_MUTATE_RELEASE_AFTER_FIRST_PR==="1"&&call===1)mutate();
 process.stdout.write(pr.url);
}else if(command==="view"){
  const url=a[2], pr=state.find(x=>x.url===url||String(x.number)===String(url)), views=(fs.existsSync(log)?fs.readFileSync(log,"utf8").split("\\n").filter(x=>x.startsWith("view:")).length:0)+1;
  fs.appendFileSync(log,"view:"+url+":"+value("--repo")+"\\n");
 const out={...pr}; if(Number(process.env.FLOW_VIEW_OID_MISMATCH_CALL||0)===views)out.headRefOid="0".repeat(40); if(Number(process.env.FLOW_VIEW_METADATA_MISMATCH_CALL||0)===views){if(process.env.FLOW_VIEW_METADATA_MISMATCH_KIND==="body")out.body+=" drift";else out.labels=[{name:"type:bug"}];} process.stdout.write(JSON.stringify(select(out)));
}else if(command==="close"){
 const url=a[2], pr=state.find(x=>x.url===url); if(pr)pr.state="CLOSED"; save(state); fs.appendFileSync(log,"close:"+url+":"+value("--repo")+"\\n");
}else if(command==="ready"){
 const url=a[2], pr=state.find(x=>x.url===url), calls=(fs.existsSync(log)?fs.readFileSync(log,"utf8").split("\\n").filter(x=>x.startsWith("ready:")).length:0)+1;
  fs.appendFileSync(log,"ready:"+url+":"+value("--repo")+"\\n");
  if(Number(process.env.FLOW_ADVANCE_BEFORE_READY_CALL||0)===calls)mutate();
  if(Number(process.env.FLOW_READY_APPLY_THEN_FAIL_CALL||0)===calls){if(pr)pr.isDraft=false;save(state);process.stderr.write("synthetic ambiguous ready failure");process.exit(1);}
  if(Number(process.env.FLOW_READY_FAIL_CALL||0)===calls){process.stderr.write("synthetic ready failure");process.exit(1);}
  if(pr)pr.isDraft=false; save(state);
}else if(command==="merge"){
 fs.appendFileSync(log,"merge:"+a[2]+"\\n");
}`);
  return {
    FLOW_EVENT_LOG: log,
    FLOW_GH_STATE: ghState,
    TEST_GENTLE_AI_SCRIPT: gentle,
    TEST_AUDIT_SCRIPT: audit,
    TEST_GH_SCRIPT: gh,
    FLOW_REMOTE: repo.remote,
    FLOW_REVIEW_ENTRY: reviewEntry,
    ...options,
  };
}

function events(env) {
  return fs.existsSync(env.FLOW_EVENT_LOG)
    ? fs.readFileSync(env.FLOW_EVENT_LOG, "utf8").trim().split("\n").filter(Boolean)
    : [];
}

function pullRequests(env) {
  return fs.existsSync(env.FLOW_GH_STATE)
    ? JSON.parse(fs.readFileSync(env.FLOW_GH_STATE, "utf8"))
    : [];
}

test("promotion refs are dynamic for conventional and configured aliases", () => {
  for (const config of [
    { integration: "development", production: "main", configured: false },
    { integration: "develop", production: "master", configured: false },
    { integration: "dev", production: "main", configured: false },
    { integration: "staging-dev", production: "release-prod", configured: true },
  ]) {
    const repo = makeRepo(config);
    const result = run(repo.cwd, ["--promotion-context", "--refresh"]);
    assert.equal(result.status, 0, result.stderr);
    const context = JSON.parse(result.stdout);
    assert.equal(context.branch, config.integration);
    assert.equal(context.productionBranch, config.production);
    assert.equal(context.integrationRef, `origin/${config.integration}`);
    assert.equal(context.baseRef, `origin/${config.production}`);
  }
});

test("publish validates every exact gate before creating PRs and uses reviewed heads/targets", () => {
  const repo = makeRepo({ integration: "staging-dev", production: "release-prod", configured: true });
  const { stateFile, state } = prepare(repo);
  const env = writeMocks(repo);
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 0, result.stderr);
  const log = events(env);
  assert.deepEqual(log, [
    `gate:pre-pr:${state.release.baseRef}:${state.release.lineage}`,
    `audit:fresh:${state.release.baseRef}:${state.release.candidateRef}`,
    `gate:pre-push:${state.release.baseRef}:${state.release.lineage}`,
    `gate:pre-pr:${state.publication.baseRef}:${state.publication.lineage}`,
    `audit:fresh:${state.publication.baseRef}:${state.publication.candidateRef}`,
    `create:${repo.integration}:${state.release.branch}:example/repo:draft`,
    "view:https://github.com/example/repo/pull/1:example/repo",
    `create:${repo.production}:${state.release.branch}:example/repo:draft`,
    "view:https://github.com/example/repo/pull/2:example/repo",
    "view:https://github.com/example/repo/pull/1:example/repo",
    "ready:https://github.com/example/repo/pull/1:example/repo",
    "view:https://github.com/example/repo/pull/1:example/repo",
    "view:https://github.com/example/repo/pull/2:example/repo",
    "ready:https://github.com/example/repo/pull/2:example/repo",
    "view:https://github.com/example/repo/pull/2:example/repo",
  ]);
  assert.equal(git(repo.cwd, ["ls-remote", "origin", `refs/heads/${state.release.branch}`]).split(/\s+/)[0], state.release.candidateCommit);
  const output = JSON.parse(result.stdout);
  assert.equal(output.bumpPr.target, repo.integration);
  assert.equal(output.prs[0].target, repo.production);
  assert.equal(pullRequests(env).every((pr) => pr.state === "OPEN" && pr.isDraft === false), true);
  assert.equal(pullRequests(env).every((pr) => pr.headRepository.nameWithOwner === "" && pr.headRepositoryOwner.login === "example"), true);
  assert.equal(pullRequests(env).every((pr) => pr.body && pr.labels.some((label) => label.name === "type:chore")), true);
  assert.equal(log.some((event) => event.startsWith("close:")), false);
});

test("publish requires and revalidates the exact Phase-2 coordinator binding before side effects", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = writeMocks(repo, { FLOW_TEST_RAW_PUBLISH_ARGS: "1" });
  const missing = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /exact Phase-2 coordinator state and expected promotionPlanId/);
  assert.deepEqual(events(env), []);

  const mismatch = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile,
    "--coordinator-state-file", state.review.coordinatorStateFile,
    "--expected-promotion-plan-id", `sha256:${"9".repeat(64)}`], env);
  assert.equal(mismatch.status, 1);
  assert.deepEqual(events(env), []);

  const coordinator = JSON.parse(fs.readFileSync(state.review.coordinatorStateFile, "utf8"));
  coordinator.schema = "flow-pr-promotion-coordinator/v1";
  fs.writeFileSync(state.review.coordinatorStateFile, JSON.stringify(coordinator));
  const old = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile,
    "--coordinator-state-file", state.review.coordinatorStateFile,
    "--expected-promotion-plan-id", state.review.promotionPlanId], env);
  assert.equal(old.status, 1);
  assert.match(old.stderr, /old or unsupported/);
  assert.deepEqual(events(env), []);
});

test("caller-controlled authority script overrides cannot authorize publication", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const env = writeMocks(repo);
  const marker = path.join(repo.fixture, "malicious-authority-ran");
  for (const [key, trustedKey] of [["FLOW_GENTLE_AI_SCRIPT", "TEST_GENTLE_AI_SCRIPT"], ["FLOW_AUDIT_SCRIPT", "TEST_AUDIT_SCRIPT"]]) {
    const malicious = path.join(repo.fixture, `malicious-${key}.mjs`);
    const source = fs.readFileSync(env[trustedKey], "utf8").replace("\n", `\nfs.writeFileSync(${JSON.stringify(marker)}, "executed");\n`);
    fs.writeFileSync(malicious, source);
    env[key] = malicious;
  }
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(marker), false);
});

test("remote production or integration advancement blocks all PR creation", () => {
  for (const branchKind of ["production", "integration"]) {
    const repo = makeRepo();
    const { stateFile, state } = prepare(repo);
    const env = writeMocks(repo);
    if (branchKind === "production") {
      git(repo.cwd, ["--git-dir", repo.remote, "update-ref", `refs/heads/${repo.production}`, state.promotion.candidateCommit]);
    } else {
      fs.appendFileSync(path.join(repo.cwd, "feature.txt"), "advance\n");
      git(repo.cwd, ["commit", "-qam", "feat: advance remote"]);
      git(repo.cwd, ["push", "-q", "origin", repo.integration]);
      git(repo.cwd, ["reset", "--hard", "-q", state.promotion.candidateCommit]);
    }
    const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
    assert.equal(result.status, 1);
    assert.equal(events(env).some((event) => event.startsWith("create:")), false);
  }
});

test("missing or stale native authority blocks publication before any PR", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const env = writeMocks(repo, { FLOW_GENTLE_FAIL_GATE: "pre-pr" });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing or stale receipt/);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

test("direct unreviewed candidate mutation blocks publication", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  fs.appendFileSync(path.join(repo.cwd, "feature.txt"), "unreviewed\n");
  git(repo.cwd, ["commit", "-qam", "fix: direct unreviewed mutation"]);
  const env = writeMocks(repo);
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

test("remote release advancement after push blocks the first PR", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const hook = path.join(repo.remote, "hooks", "post-receive");
  fs.writeFileSync(hook, `#!/bin/sh\ngit update-ref "refs/heads/${state.release.branch}" "${state.promotion.candidateCommit}"\n`);
  fs.chmodSync(hook, 0o755);
  const env = writeMocks(repo);
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reviewed release/);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

test("release advancement after the first draft closes it and blocks the second draft", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = writeMocks(repo, {
    FLOW_MUTATE_RELEASE_AFTER_FIRST_PR: "1",
    FLOW_RELEASE_BRANCH: state.release.branch,
    FLOW_REPLACEMENT: state.promotion.candidateCommit,
  });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reviewed release .* advanced after review/);
  assert.equal(events(env).filter((event) => event.startsWith("create:")).length, 1);
  assert.deepEqual(pullRequests(env).map((pr) => pr.state), ["CLOSED"]);
});

test("second draft creation failure closes the first draft", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const env = writeMocks(repo, { FLOW_GH_FAIL_CALL: "2" });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Failed to create draft PR: synthetic gh failure/);
  assert.equal(events(env).filter((event) => event.startsWith("create:")).length, 2);
  assert.deepEqual(pullRequests(env).map((pr) => pr.state), ["CLOSED"]);
});

function failAfterRemoteDraft(repo, stateFile, state) {
  state.release.shouldCreateAnnotatedTag = true;
  fs.writeFileSync(stateFile, JSON.stringify(state));
  const failFile = path.join(repo.fixture, "fail-list-once");
  fs.writeFileSync(failFile, "fail");
  const env = writeMocks(repo, { FLOW_GH_CREATE_THEN_FAIL_CALL: "1", FLOW_GH_LIST_FAIL_FILE: failFile, FLOW_GH_LIST_FAIL_CALL: "2" });
  const failed = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(failed.status, 1);
  assert.equal(pullRequests(env).length, 1);
  return env;
}

test("retry reuses exact release tag and reconciles exact remotely-created draft", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = failAfterRemoteDraft(repo, stateFile, state);
  const existing = pullRequests(env)[0];
  existing.title = "stale title";
  existing.body = "Human release template";
  existing.labels = [{ name: "human:keep" }, { name: "type:bug" }];
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify([existing]));
  const tag = `v${state.version.after}`;
  assert.equal(git(repo.cwd, ["rev-parse", `${tag}^{commit}`]), state.release.candidateCommit);
  assert.notEqual(git(repo.cwd, ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]), "");
  const retry = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).bumpPr.action, "update");
  assert.deepEqual(JSON.parse(retry.stdout).bumpPr.labels, ["type:chore"]);
  assert.equal(pullRequests(env).length, 2);
  assert.equal(pullRequests(env)[0].headRepository.nameWithOwner, "");
  assert.equal(pullRequests(env)[0].headRepositoryOwner.login, "example");
  assert.match(pullRequests(env)[0].body, /Human release template/);
  assert.match(pullRequests(env)[0].body, /Version bump/);
  assert.notEqual(pullRequests(env)[0].title, "stale title");
  assert.deepEqual(pullRequests(env)[0].labels.map((label) => label.name).sort(), ["human:keep", "type:chore"]);
  assert.equal(events(env).some((event) => event.startsWith("close:")), false);
});

test("promotion noop verifies exact managed metadata without closing the draft", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = failAfterRemoteDraft(repo, stateFile, state);
  const retry = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).bumpPr.action, "noop");
  assert.equal(events(env).some((event) => event.startsWith("close:")), false);
  assert.deepEqual(pullRequests(env)[0].labels.map((label) => label.name), ["type:chore"]);
});

test("promotion metadata mismatch fails closed for labels and body", () => {
  for (const kind of ["labels", "body"]) {
    const repo = makeRepo();
    const { stateFile } = prepare(repo);
    const env = writeMocks(repo, { FLOW_VIEW_METADATA_MISMATCH_CALL: "1", FLOW_VIEW_METADATA_MISMATCH_KIND: kind });
    const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
    assert.equal(result.status, 1, `${kind}: ${result.stderr}`);
    assert.match(result.stderr, /Managed PR metadata verification failed|Managed label validation failed/);
    assert.deepEqual(pullRequests(env).map((pr) => [pr.state, pr.isDraft]), [["CLOSED", true]]);
  }
});

test("retry rejects a release tag moved to a different commit", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = failAfterRemoteDraft(repo, stateFile, state);
  git(repo.cwd, ["tag", "-f", `v${state.version.after}`, state.promotion.candidateCommit]);
  const retry = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /tag .*different commit/i);
});

test("draft recovery rejects divergent and ambiguous existing PRs", () => {
  for (const ambiguous of [false, true]) {
    const repo = makeRepo();
    const { stateFile, state } = prepare(repo);
    const env = writeMocks(repo);
    const candidate = { number: 1, url: "https://github.com/example/repo/pull/1", state: "OPEN", isDraft: true,
      headRefOid: ambiguous ? state.release.candidateCommit : "0".repeat(40), headRefName: state.release.branch,
      headRepository: { nameWithOwner: "example/repo" }, baseRefName: repo.integration, labels: [] };
    fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(ambiguous ? [candidate, { ...candidate, number: 2, url: candidate.url + "2" }] : [candidate]));
    const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, ambiguous ? /ambiguous/ : /does not match (?:frozen|local head OID)/);
  }
});

test("draft creation and recovery fail closed on mismatched or incomplete head repository fallback", () => {
  for (const [label, option, pattern] of [
    ["mismatch", { FLOW_GH_OWNER_MISMATCH_ON_CREATE: "1" }, /does not match frozen/],
    ["incomplete", { FLOW_GH_OWNER_INCOMPLETE_ON_CREATE: "1" }, /authority is incomplete/],
  ]) {
    const repo = makeRepo();
    const { stateFile } = prepare(repo);
    const env = writeMocks(repo, option);
    const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
    assert.equal(result.status, 1, label);
    assert.match(result.stderr, pattern, label);
    assert.equal(pullRequests(env).length, 1, label);
    assert.equal(pullRequests(env)[0].state, "CLOSED", label);
  }
});

test("cache-only deterministic evidence cannot authorize publication", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const env = writeMocks(repo, { FLOW_AUDIT_FORGED: "1" });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /did not match fresh frozen publication authority/);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

test("changing origin identity with identical commits blocks publication", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const changedOrigin = "https://github.com/attacker/repo.git";
  git(repo.cwd, ["config", `url.${pathToFileURL(repo.remote).href}.insteadOf`, changedOrigin]);
  git(repo.cwd, ["remote", "set-url", "origin", changedOrigin]);
  const env = writeMocks(repo);
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Promotion coordinator state does not match the exact frozen promotion context/);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

test("remote mutation during draft creation closes the mismatched draft", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = writeMocks(repo, {
    FLOW_MUTATE_DURING_CREATE_CALL: "1",
    FLOW_RELEASE_BRANCH: state.release.branch,
    FLOW_REPLACEMENT: state.promotion.candidateCommit,
  });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match frozen head repository\/ref\/OID\/base authority/);
  assert.deepEqual(pullRequests(env).map((pr) => pr.state), ["CLOSED"]);
});

test("post-create OID mismatch closes the draft before publication continues", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const env = writeMocks(repo, { FLOW_VIEW_OID_MISMATCH_CALL: "1" });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match frozen head repository\/ref\/OID\/base authority/);
  assert.deepEqual(pullRequests(env).map((pr) => pr.state), ["CLOSED"]);
});

test("remote advancement before readiness closes every draft", () => {
  const repo = makeRepo();
  const { stateFile, state } = prepare(repo);
  const env = writeMocks(repo, {
    FLOW_ADVANCE_BEFORE_READY_CALL: "1",
    FLOW_RELEASE_BRANCH: state.release.branch,
    FLOW_REPLACEMENT: state.promotion.candidateCommit,
  });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reviewed release .* advanced after review/);
  assert.equal(pullRequests(env).every((pr) => pr.state === "CLOSED"), true);
  assert.equal(pullRequests(env).some((pr) => pr.state === "OPEN" && pr.isDraft === false), false);
});

test("partial readiness failure leaves no open ready PR", () => {
  const repo = makeRepo();
  const { stateFile } = prepare(repo);
  const env = writeMocks(repo, { FLOW_READY_FAIL_CALL: "2" });
  const result = run(repo.cwd, ["--publish-promotion", "--state-file", stateFile], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /synthetic ready failure/);
  assert.equal(pullRequests(env).length, 2);
  assert.equal(pullRequests(env).every((pr) => pr.state === "CLOSED"), true);
  assert.equal(pullRequests(env).some((pr) => pr.state === "OPEN" && pr.isDraft === false), false);
});

test("integration auto cannot bypass orchestration and no-op promotion fails closed", () => {
  const repo = makeRepo();
  assert.match(run(repo.cwd, ["--auto"]).stderr, /internally orchestrated/);
  git(repo.cwd, ["checkout", "-q", repo.production]);
  git(repo.cwd, ["branch", "-f", repo.integration, repo.production]);
  git(repo.cwd, ["checkout", "-q", repo.integration]);
  git(repo.cwd, ["push", "-q", "--force", "origin", repo.integration]);
  const noOp = run(repo.cwd, ["--promotion-context", "--refresh"]);
  assert.equal(noOp.status, 1);
  assert.equal(JSON.parse(noOp.stdout).noOp, true);
});

test("normal feature branches still resolve the dynamic integration target", () => {
  const repo = makeRepo({ integration: "staging-dev", production: "release-prod", configured: true });
  git(repo.cwd, ["checkout", "-qb", "feature/compatible"]);
  fs.writeFileSync(path.join(repo.cwd, "task.txt"), "task\n");
  git(repo.cwd, ["add", "."]);
  git(repo.cwd, ["commit", "-qm", "feat: task"]);
  const result = run(repo.cwd, ["--scan"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).targetBranches, [repo.integration]);
});

test("scan accepts every configured task prefix and routes it to integration", () => {
  for (const prefix of DEFAULT_DELIVERY_CONFIG.branchPolicy.taskPrefixes) {
    const repo = makeRepo();
    git(repo.cwd, ["checkout", "-qb", `${prefix}/compatible`]);
    const result = run(repo.cwd, ["--scan"]);
    assert.equal(result.status, 0, `${prefix}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout).targetBranches, [repo.integration], prefix);
  }
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo.cwd, ".flow"));
  fs.writeFileSync(path.join(repo.cwd, ".flow", "delivery.json"), JSON.stringify({ branchPolicy: { taskPrefixes: ["custom"] } }));
  git(repo.cwd, ["checkout", "-qb", "custom/compatible"]);
  const configured = run(repo.cwd, ["--scan"]);
  assert.equal(configured.status, 0, configured.stderr);
  assert.deepEqual(JSON.parse(configured.stdout).targetBranches, [repo.integration]);
});

test("dirty auto rejects before fetch and clean integration routes before oversize handling", () => {
  const dirty = makeRepo();
  fs.writeFileSync(path.join(dirty.cwd, "dirty.txt"), "dirty\n");
  git(dirty.cwd, ["remote", "set-url", "origin", path.join(dirty.fixture, "missing.git")]);
  const rejected = run(dirty.cwd, ["--auto"]);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /remote fetch was not attempted/);
  assert.doesNotMatch(rejected.stderr, /Remote preflight failed/);

  const integration = makeRepo({ integration: "dev" });
  fs.writeFileSync(path.join(integration.cwd, "large.txt"), Array.from({ length: 450 }, (_, index) => `line ${index}`).join("\n"));
  git(integration.cwd, ["add", "."]); git(integration.cwd, ["commit", "-qm", "feat: large promotion"]);
  const routed = run(integration.cwd, ["--auto"]);
  assert.equal(routed.status, 1);
  assert.match(routed.stderr, /internally orchestrated/);
  assert.equal(routed.stdout.trim(), "");
});

test("oversized integration aliases stay on dry-run promotion while oversized tasks require a chain plan", () => {
  for (const integration of ["development", "develop", "dev"]) {
    const repo = makeRepo({ integration });
    fs.writeFileSync(path.join(repo.cwd, "large.txt"), Array.from({ length: 450 }, (_, index) => `line ${index}`).join("\n"));
    git(repo.cwd, ["add", "."]);
    git(repo.cwd, ["commit", "-qm", "feat: large promotion"]);

    const preview = run(repo.cwd, ["--auto", "--dry-run"]);
    assert.equal(preview.status, 0, `${integration}: ${preview.stderr}`);
    const plan = JSON.parse(preview.stdout);
    assert.equal(plan.integration, true, integration);
    assert.equal(plan.branch, integration, integration);
    assert.equal(plan.prs[0].target, repo.production, integration);
    assert.equal(plan.decisionRequired, undefined, integration);
  }

  const task = makeRepo();
  git(task.cwd, ["checkout", "-qb", "feat/oversized-task", task.integration]);
  fs.writeFileSync(path.join(task.cwd, "large.txt"), Array.from({ length: 450 }, (_, index) => `line ${index}`).join("\n"));
  git(task.cwd, ["add", "."]);
  git(task.cwd, ["commit", "-qm", "feat: large task"]);

  const decision = run(task.cwd, ["--auto", "--dry-run"]);
  assert.equal(decision.status, 0, decision.stderr);
  const plan = JSON.parse(decision.stdout);
  assert.equal(plan.decisionRequired, true);
  assert.equal(plan.chainForecast.oversized, true);
  assert.deepEqual(plan.prs, []);
});

test("single reviewed delivery blocks incompatible topology before publication", () => {
  assert.doesNotThrow(() => assertReviewedDeliveryTopology({ topology: "single" }, 1));
  assert.throws(
    () => assertReviewedDeliveryTopology({ topology: "single" }, 4),
    /exactly one commit.*will not be rewritten/s,
  );
  assert.doesNotThrow(() => assertReviewedDeliveryTopology({ topology: "grouped" }, 4));
});

function makeTaskRepo(commitCount = 1) {
  const repo = makeRepo();
  git(repo.cwd, ["checkout", "-qb", "feat/reviewed-delivery", repo.integration]);
  for (let index = 1; index <= commitCount; index++) {
    fs.writeFileSync(path.join(repo.cwd, `task-${index}.txt`), `task ${index}\n`);
    git(repo.cwd, ["add", "."]);
    git(repo.cwd, ["commit", "-qm", `feat(task): add part ${index}`]);
  }
  git(repo.cwd, ["config", "flow.reviewLifecycle", "required"]);
  return repo;
}

function makeFourFileTaskRepo() {
  const repo = makeRepo();
  git(repo.cwd, ["checkout", "-qb", "feat/exact-summary", repo.integration]);
  for (const file of ["src/order.cs", "src/customer.cs", "tests/order.test.cs", "docs/order.md"]) {
    const fullPath = path.join(repo.cwd, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${file}\n`);
  }
  git(repo.cwd, ["add", "."]);
  git(repo.cwd, ["commit", "-qm", "feat(order): add exact candidate"]);
  git(repo.cwd, ["config", "flow.reviewLifecycle", "required"]);
  return repo;
}

function seedOrdinaryPr(repo, env, title, body, overrides = {}) {
  git(repo.cwd, ["push", "-q", "-u", "origin", "HEAD"]);
  const head = git(repo.cwd, ["branch", "--show-current"]);
  const pr = {
    number: 41,
    url: "https://github.com/example/repo/pull/41",
    state: "OPEN",
    isDraft: false,
    headRefOid: git(repo.cwd, ["rev-parse", "HEAD"]),
    headRefName: head,
    headRepository: { name: "repo", nameWithOwner: "" },
    headRepositoryOwner: { login: "example" },
    baseRefName: repo.integration,
    title,
    body,
    labels: [{ name: "human:keep" }, { name: "type:feature" }],
    ...overrides,
  };
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify([pr]));
  fs.rmSync(`${env.FLOW_GH_STATE}.list-count`, { force: true });
  return pr;
}

test("win32-safe scan and dry-run expose only the exact one-commit four-file candidate", () => {
  const repo = makeFourFileTaskRepo();
  const scanResult = run(repo.cwd, ["--scan"]);
  assert.equal(scanResult.status, 0, scanResult.stderr);
  const scan = JSON.parse(scanResult.stdout);
  assert.equal(scan.totalCommits, 1);
  assert.equal(scan.changedFiles.length, 4);
  assert.equal(scan.deployment.hasMigrations, false);
  assert.doesNotMatch(scanResult.stdout, /keycloak/i);
  assert.equal(scan.comparisonRange, `${scan.mergeBase}..HEAD`);

  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const preview = run(repo.cwd, ["--auto", "--dry-run"], env);
  assert.equal(preview.status, 0, preview.stderr);
  const summary = JSON.parse(preview.stdout).changeSummary;
  assert.equal(summary.commitCount, 1);
  assert.equal(summary.changedFileCount, 4);
  assert.deepEqual(summary.changedFiles, scan.changedFiles);
  assert.deepEqual(summary.fileStats, scan.fileStats);
  assert.deepEqual(summary.breakingChanges, { present: false, commits: [] });
  assert.equal(summary.deployment.hasMigrations, false);
  assert.equal(summary.impactArea, scan.impactArea);
  assert.deepEqual(summary.comparison, {
    range: `${scan.mergeBase}..HEAD`,
    baseBranch: scan.baseBranch,
    baseRef: scan.baseRef,
    mergeBase: scan.mergeBase,
    strategy: scan.mergeBaseStrategy,
  });
  assert.equal(JSON.parse(preview.stdout).prs[0].action, "create");
});

test("git analysis failure blocks scan without historical fallback data", () => {
  const repo = makeFourFileTaskRepo();
  const blob = git(repo.cwd, ["hash-object", "src/order.cs"]);
  const gitDir = git(repo.cwd, ["rev-parse", "--git-dir"]);
  fs.rmSync(path.resolve(repo.cwd, gitDir, "objects", blob.slice(0, 2), blob.slice(2)));
  const failed = run(repo.cwd, ["--scan"]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Could not analyze diff stats/);
  assert.equal(failed.stdout.trim(), "");
});

test("existing exact PR plans update, edits without create, and recovers idempotently", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const initial = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  const humanNote = "## Human Notes\nKeep this reviewer note byte-for-byte.\n";
  seedOrdinaryPr(repo, env, `${initial.prs[0].title} stale`, `${initial.prDescription}\n\n${humanNote}`);

  const preview = run(repo.cwd, ["--auto", "--dry-run"], env);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.prs[0].action, "update");
  assert.equal(plan.prs[0].remote.headOid, git(repo.cwd, ["rev-parse", "HEAD"]));
  const executed = run(repo.cwd, ["--auto", "--expected-plan-id", plan.planId], env);
  assert.equal(executed.status, 0, executed.stderr);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
  assert.equal(events(env).some((event) => event.startsWith("edit:41:")), true);
  assert.match(pullRequests(env)[0].body, /Keep this reviewer note byte-for-byte\./);

  const staleRetry = run(repo.cwd, ["--auto", "--expected-plan-id", plan.planId], env);
  assert.equal(staleRetry.status, 1);
  assert.match(staleRetry.stderr, /plan identity is missing or drifted/);
  const freshPreview = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  assert.equal(freshPreview.prs[0].action, "noop");
  const editsBefore = events(env).filter((event) => event.startsWith("edit:")).length;
  const noop = run(repo.cwd, ["--auto", "--expected-plan-id", freshPreview.planId], env);
  assert.equal(noop.status, 0, noop.stderr);
  assert.equal(JSON.parse(noop.stdout).prs[0].action, "noop");
  assert.equal(events(env).filter((event) => event.startsWith("edit:")).length, editsBefore);
});

test("existing exact PR typo-only update preserves every unrelated body byte", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const bodyFile = path.join(repo.fixture, "desired-body.md");
  const desiredBody = "Health probe: /healthz\n\nHuman spacing and notes stay.\n";
  fs.writeFileSync(bodyFile, desiredBody);
  const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run", "--pr-body-file", bodyFile], env).stdout);
  const existingBody = desiredBody.replace("/healthz", "/healtz");
  seedOrdinaryPr(repo, env, generated.prs[0].title, existingBody);

  const preview = JSON.parse(run(repo.cwd, ["--auto", "--dry-run", "--pr-body-file", bodyFile], env).stdout);
  assert.equal(preview.prs[0].action, "update");
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", preview.planId, "--pr-body-file", bodyFile], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(pullRequests(env)[0].body, desiredBody);
  assert.equal(events(env).some((event) => event === "edit:41:::body"), true);
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

test("ordinary PR repository authority blocks forks, owner mismatches, and incomplete fallback fields", () => {
  for (const [label, overrides] of [
    ["fork", { headRepository: { name: "repo", nameWithOwner: "fork/repo" }, headRepositoryOwner: { login: "fork" } }],
    ["owner mismatch", { headRepository: { name: "repo", nameWithOwner: "" }, headRepositoryOwner: { login: "fork" } }],
    ["missing owner", { headRepository: { name: "repo", nameWithOwner: "" }, headRepositoryOwner: null }],
    ["missing repository", { headRepository: { name: "", nameWithOwner: "" }, headRepositoryOwner: { login: "example" } }],
  ]) {
    const repo = makeTaskRepo();
    const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
    const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
    seedOrdinaryPr(repo, env, generated.prs[0].title, generated.prDescription, overrides);
    const result = run(repo.cwd, ["--auto", "--dry-run"], env);
    assert.equal(result.status, 1, label);
    assert.match(result.stderr, /repository authority|repository authority is incomplete/i, label);
    assert.equal(events(env).some((event) => event.startsWith("create:") || event.startsWith("edit:")), false, label);
  }
});

test("existing identical PR is an idempotent noop", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  seedOrdinaryPr(repo, env, generated.prs[0].title, generated.prDescription);
  const preview = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  assert.equal(preview.prs[0].action, "noop");
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", preview.planId], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(events(env).some((event) => event.startsWith("create:") || event.startsWith("edit:")), false);
});

test("ordinary reconciliation replaces only stale managed type labels", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  seedOrdinaryPr(repo, env, generated.prs[0].title, generated.prDescription, { labels: [{ name: "human:keep" }, { name: "release:hotfix" }, { name: "type:bug" }] });
  const preview = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  assert.equal(preview.prs[0].action, "update");
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", preview.planId], env);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(pullRequests(env)[0].labels.map((label) => label.name).sort(), ["human:keep", "release:hotfix", "type:feature"]);
});

test("missing managed label blocks planning and noop verifies postcondition", () => {
  const missingRepo = makeTaskRepo();
  const missingEnv = writeMocks(missingRepo, { FLOW_USE_HARNESS: "1", FLOW_GH_LABELS: "type:bug" });
  const missing = run(missingRepo.cwd, ["--auto", "--dry-run"], missingEnv);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /lacks expected managed label type:feature.*create it explicitly/);
  assert.equal(events(missingEnv).some((event) => event.startsWith("create:") || event.startsWith("edit:")), false);

  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  seedOrdinaryPr(repo, env, generated.prs[0].title, generated.prDescription);
  const preview = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  env.FLOW_GH_DRIFT_ON_LIST_CALL = "6";
  env.FLOW_GH_DRIFT_KIND = "label";
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", preview.planId], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Managed label validation failed/);
});

test("remote PR title, body, OID, base, head, or state drift causes zero mutation", () => {
  for (const drift of ["title", "body", "oid", "base", "head", "state"]) {
    const repo = makeTaskRepo();
    const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
    const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
    seedOrdinaryPr(repo, env, `${generated.prs[0].title} stale`, generated.prDescription);
    const preview = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
    env.FLOW_GH_DRIFT_ON_LIST_CALL = "2";
    env.FLOW_GH_DRIFT_KIND = drift;
    const result = run(repo.cwd, ["--auto", "--expected-plan-id", preview.planId], env);
    assert.equal(result.status, 1, `${drift}: ${result.stderr}`);
    assert.equal(events(env).some((event) => event.startsWith("create:") || event.startsWith("edit:")), false, drift);
  }
});

test("ambiguous existing exact PR blocks planning", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const generated = JSON.parse(run(repo.cwd, ["--auto", "--dry-run"], env).stdout);
  const first = seedOrdinaryPr(repo, env, generated.prs[0].title, generated.prDescription);
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify([first, { ...first, number: 42, url: `${first.url}2` }]));
  const result = run(repo.cwd, ["--auto", "--dry-run"], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ambiguous \(2 candidates\)/);
  assert.equal(events(env).some((event) => event.startsWith("create:") || event.startsWith("edit:")), false);
});

test("ordinary publication runs pre-push before push and pre-pr before PR", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1", FLOW_LOG_LINEAGE_SOURCE: "1" });
  const preview = run(repo.cwd, ["--auto", "--dry-run"], env);
  assert.equal(preview.status, 0, preview.stderr);
  const previewJson = JSON.parse(preview.stdout);
  const planId = previewJson.planId;
  assert.equal(typeof planId, "string");
  assert.notEqual(planId, "");
  assert.equal(previewJson.prs[0].action, "create");
  assert.notEqual(git(repo.cwd, ["merge-base", `origin/${repo.integration}`, "HEAD"]), `origin/${repo.integration}`);
  assert.deepEqual(events(env), [`gate:pre-push:origin/${repo.integration}:review-task:explicit`]);
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", planId], env);
  assert.equal(result.status, 0, result.stderr);
  const log = events(env);
  assert.deepEqual(log.filter((event) => event.startsWith("gate:")), [
    `gate:pre-push:origin/${repo.integration}:review-task:explicit`,
    `gate:pre-push:origin/${repo.integration}:review-task:explicit`,
    `gate:pre-pr:origin/${repo.integration}:review-task:explicit`,
  ]);
  assert.equal(log.filter((event) => event.startsWith("create:")).length, 1);
  assert.equal(JSON.parse(result.stdout).prs[0].action, "create");
  assert.deepEqual(JSON.parse(result.stdout).prs[0].labels, ["type:feature"]);
});

test("ordinary PR operation failure cannot produce top-level success", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const preview = run(repo.cwd, ["--auto", "--dry-run"], env);
  assert.equal(preview.status, 0, preview.stderr);
  env.FLOW_GH_FAIL_CALL = "1";
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", JSON.parse(preview.stdout).planId], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required PR creation failed.*FLOW_RECOVERY_STATE=.*pr-publication/s);
  assert.doesNotMatch(result.stdout, /"success"\s*:\s*true/);
});

test("pre-push denial and incompatible topology publish nothing", () => {
  const deniedRepo = makeTaskRepo();
  const deniedEnv = writeMocks(deniedRepo, { FLOW_USE_HARNESS: "1", FLOW_GENTLE_FAIL_GATE: "pre-push" });
  const denied = run(deniedRepo.cwd, ["--auto", "--dry-run"], deniedEnv);
  assert.equal(denied.status, 1);
  assert.equal(git(deniedRepo.cwd, ["ls-remote", "--heads", "origin", "feat/reviewed-delivery"]), "");

  const multiRepo = makeTaskRepo(4);
  const multiEnv = writeMocks(multiRepo, { FLOW_USE_HARNESS: "1" });
  const incompatible = run(multiRepo.cwd, ["--auto", "--dry-run"], multiEnv);
  assert.equal(incompatible.status, 1);
  assert.match(incompatible.stderr, /exactly one commit/);
  assert.equal(git(multiRepo.cwd, ["ls-remote", "--heads", "origin", "feat/reviewed-delivery"]), "");
});

test("pre-pr denial leaves pushed branch with recovery and creates no PR", () => {
  const repo = makeTaskRepo();
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const preview = run(repo.cwd, ["--auto", "--dry-run"], env);
  assert.equal(preview.status, 0, preview.stderr);
  const planId = JSON.parse(preview.stdout).planId;
  env.FLOW_GENTLE_FAIL_GATE = "pre-pr";
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const result = run(repo.cwd, ["--auto", "--expected-plan-id", planId], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Branch was pushed, but no PR was created.*FLOW_RECOVERY_STATE/s);
  assert.notEqual(git(repo.cwd, ["ls-remote", "--heads", "origin", "feat/reviewed-delivery"]), "");
  assert.equal(events(env).some((event) => event.startsWith("create:")), false);
});

function createChainBranch(repo, base, branch, file) {
  git(repo.cwd, ["checkout", "-q", base]);
  git(repo.cwd, ["checkout", "-qb", branch]);
  const fullPath = path.join(repo.cwd, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${branch}\n`);
  git(repo.cwd, ["add", file]);
  git(repo.cwd, ["commit", "-qm", `feat: add ${path.basename(file)}`]);
}

function chainRef(repo, name) {
  return { name, expectedSha: git(repo.cwd, ["rev-parse", name]), expectedTree: git(repo.cwd, ["rev-parse", `${name}^{tree}`]) };
}

function chainEntry(repo, id, head, base, dependencyIds = []) {
  const changedPaths = git(repo.cwd, ["diff", "--name-only", `${base}..${head}`]).split("\n").filter(Boolean);
  const accounting = summarizeLineAccounting(parseNumstat(git(repo.cwd, ["diff", "--numstat", `${base}..${head}`]), DEFAULT_DELIVERY_CONFIG.chain.generatedPathPatterns));
  const workUnitId = id.replace("pr-", "wu-");
  return { id, head, base, expectedHeadSha: git(repo.cwd, ["rev-parse", head]), expectedTree: git(repo.cwd, ["rev-parse", `${head}^{tree}`]), workUnitId, title: `Deliver behavior ${id}`, startState: `${id} behavior is absent`, endState: `${id} behavior is available`, priorWork: dependencyIds.join(", ") || "No prior chain work", followUp: "Other work units", changedPaths, changedPathsDigest: digestChangedPaths(changedPaths), paths: { implementation: changedPaths, tests: [], docs: [], sharedSupport: [] }, authoredLines: accounting.authoredLines, generatedLines: accounting.generatedLines, dependencyIds, focusedTest: { command: `node --test ${id}`, result: "Passed" }, runtimeVerification: { naReason: "Fixture has no runtime boundary" }, rollbackBoundary: `Remove only ${changedPaths.join(", ")}`, validationEvidenceRefs: [], outOfScope: "Other work units" };
}

function writeChainPlan(repo, strategy, prs, tracker = null) {
  const plan = { version: FLOW_CHAIN_PLAN_SCHEMA, strategy, repository: { identity: "example/repo" }, integrationRef: chainRef(repo, repo.integration), productionRef: chainRef(repo, repo.production), ...(tracker ? { tracker, expectedFinalTree: prs.at(-1).expectedTree } : {}), prs };
  const file = path.join(repo.fixture, `${strategy}.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

function featureChainFixture() {
  const repo = makeRepo();
  git(repo.cwd, ["config", "flow.reviewLifecycle", "disabled"]);
  createChainBranch(repo, repo.integration, "feat/feature-tracker", "src/tracker.mjs");
  createChainBranch(repo, "feat/feature-tracker", "feat/feature-child", "src/child.mjs");
  const tracker = { ...chainEntry(repo, "tracker", "feat/feature-tracker", repo.integration), draft: true, noMerge: true };
  delete tracker.workUnitId;
  const child = chainEntry(repo, "pr-1", "feat/feature-child", tracker.head, [tracker.id]);
  const planFile = writeChainPlan(repo, "feature-branch-chain", [child], tracker);
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  return { repo, tracker, child, planFile, env };
}

function retainMergedChildAndAdvanceTracker(fixture, mode = "squash") {
  const { repo, tracker, child, env } = fixture;
  git(repo.cwd, ["checkout", "-q", tracker.head]);
  if (mode === "merge") git(repo.cwd, ["merge", "--no-ff", "-qm", "merge child", child.head]);
  else {
    git(repo.cwd, ["read-tree", "--reset", "-u", child.head]);
    git(repo.cwd, ["commit", "-qm", "feat: squash child aggregate"]);
  }
  git(repo.cwd, ["push", "-q", "origin", `${tracker.head}:${tracker.head}`]);
  const currentSha = git(repo.cwd, ["rev-parse", tracker.head]), currentTree = git(repo.cwd, ["rev-parse", `${tracker.head}^{tree}`]);
  const prs = pullRequests(env);
  prs[0].headRefOid = currentSha;
  Object.assign(prs[1], { state: "MERGED", mergedAt: "2026-07-18T18:00:00Z", mergeCommit: { oid: currentSha } });
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  git(repo.fixture, ["--git-dir", repo.remote, "update-ref", "-d", `refs/heads/${child.head}`]);
  git(repo.cwd, ["branch", "-D", child.head]);
  return { currentSha, currentTree, prs };
}

function finalizableTrackerFixture() {
  const fixture = featureChainFixture(), { repo, planFile, env } = fixture;
  const preview = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], env);
  const chainPlanId = JSON.parse(preview.stdout).chainPlanId;
  const published = run(repo.cwd, ["--auto", "--chain-plan", planFile, "--expected-chain-plan-id", chainPlanId], env);
  assert.equal(published.status, 0, published.stderr);
  const stateFile = path.join(repo.fixture, "chain-state.json");
  fs.writeFileSync(stateFile, JSON.stringify(JSON.parse(published.stdout).chainState));
  const aggregate = retainMergedChildAndAdvanceTracker(fixture, "squash");
  git(repo.cwd, ["config", "flow.reviewLifecycle", "required"]);
  git(repo.cwd, ["checkout", "-q", repo.integration]);
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const args = ["--finalize-chain-tracker", "--chain-plan", planFile, "--chain-state-file", stateFile, "--expected-chain-plan-id", chainPlanId];
  return { ...fixture, ...aggregate, chainPlanId, stateFile, args };
}

function forgeFinalizationAuthority(stateFile) {
  const state = JSON.parse(fs.readFileSync(stateFile));
  for (const key of ["lineage", "revision", "receiptIdentity", "gateIdentity", "targetIdentity"]) {
    state.finalization.aggregateAuthority[key] = `forged-${key}`;
  }
  const { schema, planIdentity, trackerPublication, currentTracker, aggregateAuthority } = state.finalization;
  state.finalization.actionKey = createHash("sha256")
    .update(JSON.stringify({ schema, planIdentity, trackerPublication, currentTracker, aggregateAuthority }))
    .digest("hex");
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

test("stacked chain preserves immutable identity, idempotency, and recovery", () => {
  const repo = makeRepo();
  git(repo.cwd, ["config", "flow.reviewLifecycle", "disabled"]);
  createChainBranch(repo, repo.integration, "feat/chain-one", "src/one.mjs");
  createChainBranch(repo, "feat/chain-one", "feat/chain-two", "src/two.mjs");
  const first = chainEntry(repo, "pr-1", "feat/chain-one", repo.integration);
  const second = chainEntry(repo, "pr-2", "feat/chain-two", "feat/chain-one", ["pr-1"]);
  const planFile = writeChainPlan(repo, "stacked-to-main", [first, second]);
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const preview = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], env);
  assert.equal(preview.status, 0, preview.stderr);
  const previewJson = JSON.parse(preview.stdout);
  assert.equal(previewJson.strategy, "stacked-to-main");
  assert.equal(previewJson.planIdentity.length, 64);
  assert.doesNotMatch(previewJson.jiraComment, /\b(?:Closes|Fixes|Resolves)\b/i);

  const failed = run(repo.cwd, ["--auto", "--chain-plan", planFile], { ...env, FLOW_GH_FAIL_CALL: "2" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /FLOW_RECOVERY_STATE=.*planIdentity/s);
  assert.equal(pullRequests(env).length, 1);
  const existing = pullRequests(env)[0];
  existing.title = "stale chain title";
  existing.body += "\n\nHuman chain note";
  existing.labels = [{ name: "human:keep" }, { name: "type:bug" }];
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify([existing]));
  const retry = run(repo.cwd, ["--auto", "--chain-plan", planFile], env);
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(pullRequests(env).length, 2);
  assert.equal(JSON.parse(retry.stdout).prs[0].action, "update");
  assert.match(pullRequests(env)[0].body, /Human chain note/);
  assert.deepEqual(pullRequests(env)[0].labels.map((label) => label.name).sort(), ["human:keep", "type:feature"]);
  assert.ok(JSON.parse(retry.stdout).completedSteps.includes("skip-push:pr-1"));
  assert.equal(JSON.parse(retry.stdout).tracker, undefined);
  assert.equal(JSON.parse(retry.stdout).nextAction, undefined);
});

test("feature branch chain creates draft tracker before child without issue calls", () => {
  const repo = makeRepo();
  git(repo.cwd, ["config", "flow.reviewLifecycle", "disabled"]);
  createChainBranch(repo, repo.integration, "feat/feature-tracker", "src/tracker.mjs");
  createChainBranch(repo, "feat/feature-tracker", "feat/feature-child", "src/child.mjs");
  const tracker = { ...chainEntry(repo, "tracker", "feat/feature-tracker", repo.integration), draft: true, noMerge: true };
  delete tracker.workUnitId;
  const child = chainEntry(repo, "pr-1", "feat/feature-child", "feat/feature-tracker", ["tracker"]);
  const planFile = writeChainPlan(repo, "feature-branch-chain", [child], tracker);
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const result = run(repo.cwd, ["--auto", "--chain-plan", planFile], env);
  assert.equal(result.status, 0, result.stderr);
  const prs = pullRequests(env);
  assert.equal(prs[0].headRefName, tracker.head);
  assert.equal(prs[0].isDraft, true);
  assert.equal(prs[1].baseRefName, tracker.head);
  assert.equal(prs[1].isDraft, false);
  assert.match(prs[0].body, /## Chain Control Plane[\s\S]*FLOW_TRACKER_NO_MERGE[\s\S]*Final aggregate review required/);
  assert.match(prs[1].body, /Start state:[\s\S]*End state:[\s\S]*Out of scope:[\s\S]*Focused test:[\s\S]*Runtime:[\s\S]*Rollback boundary:[\s\S]*Authored budget:/);
  const output = JSON.parse(result.stdout);
  assert.equal(output.tracker.status, "verified-draft-no-merge");
  assert.equal(output.children[0].status, "ready");
  assert.deepEqual([output.chainState.tracker.publication.role, output.chainState.tracker.publication.prNumber,
    output.chainState.children[0].publication.role, output.chainState.children[0].publication.workUnitId], ["tracker", 1, "child", child.workUnitId]);
  assert.match(output.chainState.children[0].publication.managedBodyDigest, /^[0-9a-f]{64}$/);
  assert.match(output.chainState.children[0].publication.publicationIdentity, /^[0-9a-f]{64}$/);
  assert.equal(output.nextAction.type, "finalize_tracker_after_children");
  assert.deepEqual(output.nextAction.requires, ["all children merged", "fresh aggregate review", "fresh aggregate receipt validation"]);
  assert.deepEqual(JSON.parse(result.stdout).prs.map((pr) => [pr.action, pr.labels]), [["create", ["type:feature"]], ["create", ["type:feature"]]]);
  assert.doesNotMatch(events(env).join("\n"), /issue|branch-pr|chained-pr|work-unit-commits/i);
});

test("feature tracker fails closed when an existing PR is non-draft", () => {
  const repo = makeRepo();
  git(repo.cwd, ["config", "flow.reviewLifecycle", "disabled"]);
  createChainBranch(repo, repo.integration, "feat/feature-tracker", "src/tracker.mjs");
  createChainBranch(repo, "feat/feature-tracker", "feat/feature-child", "src/child.mjs");
  const tracker = { ...chainEntry(repo, "tracker", "feat/feature-tracker", repo.integration), draft: true, noMerge: true }; delete tracker.workUnitId;
  const planFile = writeChainPlan(repo, "feature-branch-chain", [chainEntry(repo, "pr-1", "feat/feature-child", tracker.head, [tracker.id])], tracker);
  const env = writeMocks(repo, { FLOW_USE_HARNESS: "1" });
  const first = run(repo.cwd, ["--auto", "--chain-plan", planFile], env);
  assert.equal(first.status, 0, first.stderr);
  const state = pullRequests(env); state[0].isDraft = false; fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(state));
  const retry = run(repo.cwd, ["--auto", "--chain-plan", planFile, "--expected-chain-plan-id", JSON.parse(first.stdout).chainPlanId], env);
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /tracker.*open non-draft/i);
});

test("feature-chain recovery preserves tracker lineage and explicit later action", () => {
  const repo = makeRepo(); git(repo.cwd, ["config", "flow.reviewLifecycle", "disabled"]);
  createChainBranch(repo, repo.integration, "feat/feature-tracker", "src/tracker.mjs");
  createChainBranch(repo, "feat/feature-tracker", "feat/feature-child", "src/child.mjs");
  const tracker = { ...chainEntry(repo, "tracker", "feat/feature-tracker", repo.integration), draft: true, noMerge: true }; delete tracker.workUnitId;
  const planFile = writeChainPlan(repo, "feature-branch-chain", [chainEntry(repo, "pr-1", "feat/feature-child", tracker.head, [tracker.id])], tracker);
  const result = run(repo.cwd, ["--auto", "--chain-plan", planFile], writeMocks(repo, { FLOW_USE_HARNESS: "1", FLOW_GH_FAIL_CALL: "2" }));
  assert.equal(result.status, 1);
  const recovery = JSON.parse(result.stderr.match(/FLOW_RECOVERY_STATE=(\{.*\})/s)[1]);
  assert.match(recovery.lineage, /^chain-/); assert.match(recovery.revision, /^sha256:/);
  assert.equal(recovery.tracker.status, "verified-draft"); assert.equal(recovery.children[0].status, "planned");
  assert.equal(recovery.nextAction.type, "finalize_tracker_after_children");
  assert.equal(recovery.chainPlanId, recovery.expectedChainPlanId);
});

test("chain live publication requires the exact deterministic dry-run plan binding before mutation", () => {
  const { repo, planFile, env, tracker, child } = featureChainFixture();
  const first = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], env);
  const second = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], env);
  assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
  const chainPlanId = JSON.parse(first.stdout).chainPlanId;
  assert.equal(chainPlanId, JSON.parse(first.stdout).planIdentity);
  assert.equal(chainPlanId, JSON.parse(second.stdout).chainPlanId);
  for (const expected of [null, "0".repeat(64)]) {
    fs.writeFileSync(env.FLOW_EVENT_LOG, "");
    const args = ["--auto", "--chain-plan", planFile, ...(expected ? ["--expected-chain-plan-id", expected] : [])];
    const rejected = run(repo.cwd, args, { ...env, FLOW_TEST_RAW_CHAIN_ARGS: "1" });
    assert.equal(rejected.status, 1); assert.match(rejected.stderr, /expected-chain-plan-id/i);
    assert.deepEqual(events(env), []);
    assert.equal(git(repo.cwd, ["ls-remote", "--heads", "origin", tracker.head]), "");
    assert.equal(git(repo.cwd, ["ls-remote", "--heads", "origin", child.head]), "");
  }
  const published = run(repo.cwd, ["--auto", "--chain-plan", planFile, "--expected-chain-plan-id", chainPlanId], env);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(JSON.parse(published.stdout).chainState.chainPlanId, chainPlanId);
});

test("tracker finalization safely accepts deleted child branches only after all children merged with exact historical metadata", () => {
  const fixture = featureChainFixture(), { repo, planFile, env, child } = fixture;
  const preview = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], env);
  const chainPlanId = JSON.parse(preview.stdout).chainPlanId;
  const published = run(repo.cwd, ["--auto", "--chain-plan", planFile, "--expected-chain-plan-id", chainPlanId], env);
  assert.equal(published.status, 0, published.stderr);
  const stateFile = path.join(repo.fixture, "chain-state.json");
  fs.writeFileSync(stateFile, JSON.stringify(JSON.parse(published.stdout).chainState));
  const args = ["--finalize-chain-tracker", "--chain-plan", planFile, "--chain-state-file", stateFile, "--expected-chain-plan-id", chainPlanId];
  git(repo.cwd, ["checkout", "-q", "feat/feature-tracker"]);
  git(repo.cwd, ["config", "flow.reviewLifecycle", "required"]);
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const wrongBinding = run(repo.cwd, [...args.slice(0, -1), "0".repeat(64)], env);
  assert.equal(wrongBinding.status, 1); assert.match(wrongBinding.stderr, /expected-chain-plan-id|do not match/i); assert.deepEqual(events(env), []);
  const incomplete = run(repo.cwd, args, env);
  assert.equal(incomplete.status, 1); assert.match(incomplete.stderr, /expectedFinalTree.*missing or extra content/i); assert.deepEqual(events(env), []);

  const { currentSha, currentTree, prs } = retainMergedChildAndAdvanceTracker(fixture, "squash");
  assert.equal(currentTree, JSON.parse(fs.readFileSync(planFile)).expectedFinalTree);
  assert.equal(git(repo.cwd, ["ls-remote", "--heads", "origin", child.head]), "");
  assert.equal(git(repo.cwd, ["branch", "--list", child.head]), "");
  prs[1].state = "OPEN"; fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const unmerged = run(repo.cwd, args, env);
  assert.equal(unmerged.status, 1); assert.match(unmerged.stderr, /not MERGED/i); assert.equal(events(env).some((event) => /^(?:ready|merge):/.test(event)), false);
  prs[1].state = "MERGED"; const childOid = prs[1].headRefOid; prs[1].headRefOid = "0".repeat(40); fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const wrongChild = run(repo.cwd, args, env);
  assert.equal(wrongChild.status, 1); assert.match(wrongChild.stderr, /exact frozen/i); assert.equal(events(env).some((event) => /^(?:ready|merge):/.test(event)), false);
  prs[1].headRefOid = childOid; fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const exactBody = prs[1].body;
  const substitute = { ...structuredClone(prs[1]), number: 3, url: "https://github.com/example/repo/pull/3",
    body: exactBody.replaceAll(chainPlanId, "f".repeat(64)).replaceAll("wu-1", "wu-substitute") };
  prs.push(substitute); fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const trustedState = JSON.parse(fs.readFileSync(stateFile));
  const substitutedState = structuredClone(trustedState);
  substitutedState.children[0].publication.prNumber = substitute.number;
  substitutedState.children[0].publication.prUrl = substitute.url;
  fs.writeFileSync(stateFile, JSON.stringify(substitutedState));
  const wrongNumber = run(repo.cwd, args, env);
  assert.equal(wrongNumber.status, 1); assert.match(wrongNumber.stderr, /publication record.*does not match/i);
  fs.writeFileSync(stateFile, JSON.stringify(trustedState));
  prs[1].body = substitute.body; fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const wrongManagedIdentity = run(repo.cwd, args, env);
  assert.equal(wrongManagedIdentity.status, 1); assert.match(wrongManagedIdentity.stderr, /managed plan\/work-unit metadata was substituted/i);
  prs[1].body = exactBody; fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const boundEnv = { ...env, FLOW_LOG_GATE_HEAD: "1" };
  const noReceipt = run(repo.cwd, args, { ...boundEnv, FLOW_GENTLE_FAIL_GATE: "pre-pr" });
  assert.equal(noReceipt.status, 1); assert.match(noReceipt.stderr, /pre-pr validation|missing or stale receipt/i);
  assert.equal(pullRequests(env)[0].isDraft, true);
  assert.equal(events(env).some((event) => event.startsWith("ready:")), false);
  assert.equal(events(env).some((event) => /review.*start/i.test(event)), false);

  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  git(repo.cwd, ["checkout", "-q", repo.integration]);
  const finalized = run(repo.cwd, args, boundEnv);
  assert.equal(finalized.status, 0, finalized.stderr);
  const finalizedOutput = JSON.parse(finalized.stdout);
  assert.equal(finalizedOutput.success, true); assert.equal(finalizedOutput.idempotent, false);
  assert.deepEqual(finalizedOutput.tracker, { prUrl: prs[0].url, sha: currentSha, tree: currentTree, ready: true });
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).finalization.status, "completed");
  assert.equal(pullRequests(env)[0].isDraft, false);
  assert.equal(events(env).filter((event) => event.startsWith("gate:pre-pr:")).length, 1);
  assert.match(events(env).find((event) => event.startsWith("gate:pre-pr:")), new RegExp(`${currentSha}:${currentTree}$`));
  assert.equal(events(env).filter((event) => event.startsWith("ready:")).length, 1);
  assert.equal(events(env).some((event) => event.startsWith("merge:")), false);
});

test("tracker readiness reconciles an applied side effect after CLI failure", () => {
  const fixture = finalizableTrackerFixture(), { repo, env, args, stateFile } = fixture;
  const result = run(repo.cwd, args, { ...env, FLOW_READY_APPLY_THEN_FAIL_CALL: "1" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout), state = JSON.parse(fs.readFileSync(stateFile));
  assert.equal(output.reconciledAmbiguousReady, true);
  assert.equal(state.finalization.status, "completed");
  assert.equal(output.actionKey, state.finalization.actionKey);
  assert.equal(pullRequests(env)[0].isDraft, false);
});

test("tracker readiness preserves in-flight authority across a bounded draft retry", () => {
  const fixture = finalizableTrackerFixture(), { repo, env, args, stateFile } = fixture;
  const failed = run(repo.cwd, args, { ...env, FLOW_READY_FAIL_CALL: "1" });
  assert.equal(failed.status, 1, failed.stderr);
  const recovery = JSON.parse(failed.stdout), inFlight = JSON.parse(fs.readFileSync(stateFile)).finalization;
  assert.equal(recovery.retryable, true); assert.equal(inFlight.status, "inFlight");
  assert.equal(recovery.actionKey, inFlight.actionKey); assert.equal(pullRequests(env)[0].isDraft, true);
  assert.match(inFlight.actionKey, /^[0-9a-f]{64}$/);
  assert.deepEqual([inFlight.currentTracker.sha, inFlight.currentTracker.tree], [fixture.currentSha, fixture.currentTree]);
  assert.equal(inFlight.trackerPublication.publicationIdentity, JSON.parse(fs.readFileSync(stateFile)).tracker.publication.publicationIdentity);
  for (const key of ["lineage", "revision", "receiptIdentity", "gateIdentity", "targetIdentity"]) assert.equal(typeof inFlight.aggregateAuthority[key], "string");
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const retried = run(repo.cwd, args, env);
  assert.equal(retried.status, 0, retried.stderr);
  const completed = JSON.parse(fs.readFileSync(stateFile)).finalization;
  assert.equal(completed.status, "completed"); assert.equal(completed.actionKey, inFlight.actionKey);
  assert.equal(events(env).filter((event) => event.startsWith("gate:pre-pr:")).length, 1);
  assert.equal(events(env).filter((event) => event.startsWith("ready:")).length, 1);
});

test("tracker readiness rejects an externally-ready tracker without an in-flight record", () => {
  const fixture = finalizableTrackerFixture(), { repo, env, args, stateFile } = fixture;
  const prs = pullRequests(env); prs[0].isDraft = false; fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  const result = run(repo.cwd, args, env);
  assert.equal(result.status, 1); assert.match(result.stderr, /external readiness is unauthorized/i);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).finalization, undefined);
  assert.equal(events(env).some((event) => event.startsWith("ready:")), false);
});

test("completed tracker readiness is idempotent and never calls ready again", () => {
  const fixture = finalizableTrackerFixture(), { repo, env, args, stateFile } = fixture;
  const first = run(repo.cwd, args, env);
  assert.equal(first.status, 0, first.stderr);
  const actionKey = JSON.parse(fs.readFileSync(stateFile)).finalization.actionKey;
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const repeated = run(repo.cwd, args, env);
  assert.equal(repeated.status, 0, repeated.stderr);
  const output = JSON.parse(repeated.stdout);
  assert.equal(output.idempotent, true); assert.equal(output.actionKey, actionKey);
  assert.equal(events(env).some((event) => event.startsWith("ready:")), false);
  assert.equal(events(env).filter((event) => event.startsWith("gate:pre-pr:")).length, 1);
});

test("forged in-flight and completed journals never substitute for fresh aggregate authority", () => {
  for (const journalStatus of ["inFlight", "completed"]) {
    const fixture = finalizableTrackerFixture(), { repo, env, args, stateFile } = fixture;
    const initial = run(repo.cwd, args, journalStatus === "inFlight" ? { ...env, FLOW_READY_FAIL_CALL: "1" } : env);
    assert.equal(initial.status, journalStatus === "inFlight" ? 1 : 0, initial.stderr);
    assert.equal(JSON.parse(fs.readFileSync(stateFile)).finalization.status, journalStatus);
    forgeFinalizationAuthority(stateFile);
    fs.writeFileSync(env.FLOW_EVENT_LOG, "");
    const replay = run(repo.cwd, args, env);
    assert.equal(replay.status, 1);
    assert.match(replay.stderr, /does not match the freshly validated current tracker receipt and target binding/i);
    assert.equal(events(env).filter((event) => event.startsWith("gate:pre-pr:")).length, 1);
    assert.equal(events(env).some((event) => event.startsWith("ready:")), false);
  }
});

test("stale or absent aggregate receipt blocks in-flight and completed replay", () => {
  for (const journalStatus of ["inFlight", "completed"]) {
    const fixture = finalizableTrackerFixture(), { repo, env, args, stateFile } = fixture;
    const initial = run(repo.cwd, args, journalStatus === "inFlight" ? { ...env, FLOW_READY_FAIL_CALL: "1" } : env);
    assert.equal(initial.status, journalStatus === "inFlight" ? 1 : 0, initial.stderr);
    fs.writeFileSync(env.FLOW_EVENT_LOG, "");
    const replay = run(repo.cwd, args, { ...env, FLOW_GENTLE_FAIL_GATE: "pre-pr" });
    assert.equal(replay.status, 1);
    assert.match(replay.stderr, /pre-pr validation|missing or stale receipt/i);
    assert.equal(events(env).some((event) => event.startsWith("ready:")), false);
    assert.equal(JSON.parse(fs.readFileSync(stateFile)).finalization.status, journalStatus);
  }
});

test("auto-retargeted child base fails closed and never readies the tracker", () => {
  const fixture = finalizableTrackerFixture(), { repo, env, args } = fixture;
  const prs = pullRequests(env);
  prs[1].baseRefName = repo.integration;
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  fs.writeFileSync(env.FLOW_EVENT_LOG, "");
  const result = run(repo.cwd, args, env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /retargeted from immutable parent.*Keep every parent branch until all descendants are merged/i);
  assert.equal(pullRequests(env)[0].isDraft, true);
  assert.equal(events(env).some((event) => event.startsWith("ready:") || event.startsWith("gate:pre-pr:")), false);
});

test("tracker finalization rejects a final tree detached from the immutable original tracker", () => {
  const fixture = featureChainFixture(), { repo, tracker, child, planFile, env } = fixture;
  const preview = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], env), chainPlanId = JSON.parse(preview.stdout).chainPlanId;
  const published = run(repo.cwd, ["--auto", "--chain-plan", planFile, "--expected-chain-plan-id", chainPlanId], env);
  const stateFile = path.join(repo.fixture, "chain-state.json"); fs.writeFileSync(stateFile, JSON.stringify(JSON.parse(published.stdout).chainState));
  const plan = JSON.parse(fs.readFileSync(planFile));
  const staleSha = git(repo.cwd, ["commit-tree", plan.expectedFinalTree, "-p", plan.integrationRef.expectedSha, "-m", "detached aggregate"]);
  git(repo.cwd, ["push", "-q", "--force", "origin", `${staleSha}:refs/heads/${tracker.head}`]);
  const prs = pullRequests(env); prs[0].headRefOid = staleSha;
  Object.assign(prs[1], { state: "MERGED", mergedAt: "2026-07-18T18:00:00Z", mergeCommit: { oid: staleSha } });
  fs.writeFileSync(env.FLOW_GH_STATE, JSON.stringify(prs));
  git(repo.fixture, ["--git-dir", repo.remote, "update-ref", "-d", `refs/heads/${child.head}`]);
  const result = run(repo.cwd, ["--finalize-chain-tracker", "--chain-plan", planFile, "--chain-state-file", stateFile, "--expected-chain-plan-id", chainPlanId], env);
  assert.equal(result.status, 1); assert.match(result.stderr, /does not descend from.*original tracker/i);
  assert.equal(pullRequests(env)[0].isDraft, true);
});

test("legacy chain publication fails closed and never creates a missing child branch", () => {
  const repo = makeRepo();
  git(repo.cwd, ["config", "flow.reviewLifecycle", "disabled"]);
  const missing = { ...chainEntry(repo, "pr-1", repo.integration, repo.integration), head: "feat/missing-child", expectedHeadSha: "missing", expectedTree: "missing-tree" };
  const planFile = writeChainPlan(repo, "stacked-to-main", [missing]);
  const legacy = JSON.parse(fs.readFileSync(planFile, "utf8"));
  legacy.version = "flow-chain-plan/v1";
  fs.writeFileSync(planFile, JSON.stringify(legacy));
  const before = git(repo.cwd, ["branch", "--list", missing.head]);
  const result = run(repo.cwd, ["--auto", "--dry-run", "--chain-plan", planFile], writeMocks(repo, { FLOW_USE_HARNESS: "1" }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /legacy.*regenerate/i);
  assert.equal(before, "");
  assert.equal(git(repo.cwd, ["branch", "--list", missing.head]), "");
});
