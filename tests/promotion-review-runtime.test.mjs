import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const harness = path.join(root, "tests", "flow-pr-harness.mjs");
const sha = (value) => `sha256:${String(value).padStart(64, "0")}`;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-review-runtime-"));
  const remote = path.join(dir, "remote.git"), cwd = path.join(dir, "work");
  fs.mkdirSync(cwd); git(dir, ["init", "--bare", "-q", remote]); git(cwd, ["init", "-q", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@example.test"]); git(cwd, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n");
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }) + "\n");
  git(cwd, ["add", "."]); git(cwd, ["commit", "-qm", "chore: base"]);
  const origin = "https://github.com/example/repo.git";
  git(cwd, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, origin]); git(cwd, ["remote", "add", "origin", origin]);
  git(cwd, ["push", "-q", "-u", "origin", "main"]); git(cwd, ["checkout", "-qb", "development"]);
  fs.writeFileSync(path.join(cwd, "candidate.txt"), "candidate\n"); git(cwd, ["add", "."]); git(cwd, ["commit", "-qm", "feat: candidate"]);
  git(cwd, ["push", "-q", "-u", "origin", "development"]);
  return { dir, cwd, remote, state: path.join(dir, "coordinator.json"), status: path.join(dir, "status.json"), log: path.join(dir, "native.log"), statusCount: path.join(dir, "status.count") };
}

function status(applicability = "unrelated", state = "reviewing", selectedLenses = [], revision = sha(5), action = null, riskTier = "low") {
  return {
    schema: "gentle-ai.review-integration.status/v1", contract: "gentle-ai.review-integration/v1", operation: "review.status",
    applicability, authority: applicability === "current_target"
      ? { version: "compact-v2", lineage_id: "promotion-runtime", state, generation: 1, revision } : undefined,
    receipt: { status: state === "approved" ? "present" : applicability === "unrelated" ? "not_applicable" : "expected_missing",
      ...(state === "approved" ? { identity: sha(7) } : {}) },
    action: action || (applicability === "unrelated" ? "start" : state === "approved" ? "validate" : "finalize"),
    replayability: applicability === "unrelated" ? "status_required" : "not_replayable",
    target_identity: sha(3), selected_lenses: selectedLenses,
    ...(applicability === "current_target" ? { frozen: { tier: riskTier, original_changed_lines: 1, correction_budget: 1 } } : {}),
    projection: { private_path: "Z:/must-not-be-read/projection.json", unknown: { path: "secret" } }, candidates: [], private_path: "Z:/must-not-be-read/review-state.json",
  };
}

function nativeScript(repo) {
  const file = path.join(repo.dir, "gentle.mjs");
  fs.writeFileSync(file, `import fs from "node:fs";import {execFileSync} from "node:child_process";import {createHash} from "node:crypto";
const a=process.argv.slice(2),op=a[1];
if(op==="capabilities"){process.stdout.write(JSON.stringify({schema:"gentle-ai.review-integration.capabilities/v1",contract:"gentle-ai.review-integration/v1",build:{id:"${sha(9)}"},operations:["review.status","review.start","review.finalize","review.validate"]}));process.exit(0)}
if(op==="status"){const n=fs.existsSync(process.env.STATUS_COUNT)?Number(fs.readFileSync(process.env.STATUS_COUNT,"utf8")):0;fs.writeFileSync(process.env.STATUS_COUNT,String(n+1));process.stdout.write(fs.readFileSync(process.env.STATUS,"utf8"));process.exit(0)}
fs.appendFileSync(process.env.LOG,op+"\\n");
if(process.env.FAIL_ACTION===op){process.stderr.write("ambiguous synthetic failure");process.exit(1)}
if(process.env.MALFORMED_ACTION===op){process.stdout.write("{}");process.exit(0)}
if(op==="start")fs.writeFileSync(process.env.STATUS,JSON.stringify(${JSON.stringify(status("current_target"))}));
if(op==="finalize"){const value=JSON.parse(fs.readFileSync(process.env.STATUS,"utf8")),nextState=process.env.FINALIZE_RETURN_STATE||"approved",nextAction=process.env.FINALIZE_RETURN_ACTION||"validate";value.authority.state=process.env.FINALIZE_STATUS_STATE||nextState;value.authority.revision=process.env.FINALIZE_STATUS_REVISION||"${sha(8)}";value.action=process.env.FINALIZE_STATUS_ACTION||nextAction;if(nextState==="approved")value.receipt={status:"present",identity:"${sha(7)}"};fs.writeFileSync(process.env.STATUS,JSON.stringify(value));}
const at=(flag)=>{const i=a.indexOf(flag);return i<0?null:a[i+1]},git=(x)=>execFileSync("git",x,{encoding:"utf8"}).trim(),base=at("--base-ref")||"origin/main",paths=git(["diff","--name-only","--no-renames",base,"HEAD","--"]).split("\\n").filter(Boolean).sort(),start={schema:"gentle-ai.review-integration.start/v1",contract:"gentle-ai.review-integration/v1",operation:"review.start",action:"created",lineage_id:at("--lineage"),state:"reviewing",risk_level:"low",lenses_required:false,selected_lenses:[],projection:"workspace",changed_files:1,changed_lines:1,correction_budget:1,risk_reasons:[]};
const promotionPathsDigest=(values)=>"sha256:"+createHash("sha256").update(values.join("\\0")).digest("hex");
const context={lineage_id:"promotion-runtime",store_revision:JSON.parse(fs.readFileSync(process.env.STATUS,"utf8")).authority?.revision||"${sha(5)}",base_tree:git(["rev-parse",base+"^{tree}"]),candidate_tree:git(["rev-parse","HEAD^{tree}"]),paths_digest:promotionPathsDigest(paths)};if(process.env.VALIDATION_CONTEXT_MODE==="empty")for(const k of Object.keys(context))delete context[k];if(process.env.VALIDATION_CONTEXT_MODE==="wrong-lineage")context.lineage_id="other";if(process.env.VALIDATION_CONTEXT_MODE==="wrong-tree")context.candidate_tree="0".repeat(40);
const gate={schema:"gentle-ai.review-gate-result/v1",result:"allow",allowed:true,action:"continue",reason:"approved",context};
if(op==="validate"&&process.env.VALIDATION_CONTEXT_MODE==="wrong-receipt"){const value=${JSON.stringify(status("current_target", "approved"))};value.receipt.identity="${sha(77)}";fs.writeFileSync(process.env.STATUS,JSON.stringify(value));}
const finalState=process.env.FINALIZE_RETURN_STATE||"approved",finalAction=process.env.FINALIZE_RETURN_ACTION||"validate";process.stdout.write(JSON.stringify(op==="start"?start:{schema:"gentle-ai.review-integration.operation/v1",contract:"gentle-ai.review-integration/v1",operation:"review."+op,result:op==="validate"?gate:{operation:"review/finalize",lineage_id:"promotion-runtime",state:finalState,action:finalAction,store_revision:"${sha(8)}"}}));`);
  return file;
}

function run(repo, args, extra = {}) {
  const gentle = nativeScript(repo), audit = path.join(repo.dir, "audit.mjs"); fs.writeFileSync(audit, "");
  return spawnSync(process.execPath, [harness, "--promotion-review", "--state-file", repo.state, ...args], {
    cwd: repo.cwd, encoding: "utf8", env: { ...process.env, TEST_GENTLE_AI_SCRIPT: gentle, TEST_AUDIT_SCRIPT: audit, STATUS: repo.status, STATUS_COUNT: repo.statusCount, LOG: repo.log, ...extra },
  });
}

function output(result) {
  assert.notEqual(result.stdout, "", result.stderr);
  return JSON.parse(result.stdout);
}

test("persists start before execution and replay never creates a second review budget", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status()));
  const planned = run(repo, []), action = output(planned).nextAction;
  assert.equal(action.type, "start_review");
  const executed = run(repo, ["--execute-action", "--expected-coordinator-fingerprint", output(planned).coordinatorFingerprint, "--execution-key", action.executionKey]);
  assert.equal(executed.status, 0, executed.stderr); assert.equal(fs.readFileSync(repo.log, "utf8"), "start\n");
  const replay = run(repo, []); assert.notEqual(output(replay).nextAction.type, "start_review");
  assert.equal(fs.readFileSync(repo.log, "utf8"), "start\n");
});

test("ambiguous native execution resumes status and does not retry start", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status()));
  const planned = output(run(repo, [])), action = planned.nextAction;
  const failed = run(repo, ["--execute-action", "--expected-coordinator-fingerprint", planned.coordinatorFingerprint, "--execution-key", action.executionKey], { FAIL_ACTION: "start" });
  assert.equal(failed.status, 1); assert.equal(output(failed).nextAction.type, "await_status");
  assert.equal(fs.readFileSync(repo.log, "utf8"), "start\n");
  run(repo, [], { FAIL_ACTION: "start" }); assert.equal(fs.readFileSync(repo.log, "utf8"), "start\n");
});

test("false causal finding outside genesis blocks finalize without reading private paths", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing", ["review-risk"], sha(5), null, "medium")));
  const delegated = output(run(repo, ["--lenses", "review-risk"]));
  const results = path.join(repo.dir, "lenses.json");
  fs.writeFileSync(results, JSON.stringify([{ lens: "review-risk", executionKey: delegated.nextAction.executionKey,
    result: { findings: [{ id: "false-1", severity: "CRITICAL", causalDisposition: "introduced", location: "base.txt:1" }] } }]));
  const blocked = output(run(repo, ["--lenses", "review-risk", "--lens-results-file", results]));
  assert.equal(blocked.nextAction.type, "stop"); assert.equal(blocked.nextAction.reasonCode, "causal-admission-failed");
  assert.equal(blocked.admissionResult.diagnostics[0].reasonCode, "path-outside-genesis");
  assert.equal(output(run(repo, ["--lenses", "review-risk"])).nextAction.type, "stop");
  assert.equal(fs.readFileSync(repo.state, "utf8").includes("must-not-be-read"), false);
  assert.equal(JSON.stringify(blocked).includes("must-not-be-read"), false);
  assert.equal(fs.existsSync(repo.log), false);
});

test("persists an ordered 4R prefix and delegates one missing lens at a time", () => {
  const repo = fixture();
  const lenses = ["review-risk", "review-resilience", "review-readability", "review-reliability"], file = path.join(repo.dir, "lenses.json"), values = [];
  fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing", lenses, sha(5), null, "high")));
  let current = output(run(repo, []));
  for (let index = 0; index < lenses.length; index++) {
    assert.equal(current.nextAction.lens, lenses[index]);
    values.push({ lens: lenses[index], executionKey: current.nextAction.executionKey, result: { findings: [] } });
    fs.writeFileSync(file, JSON.stringify(values));
    current = output(run(repo, ["--lens-results-file", file]));
    assert.equal(JSON.parse(fs.readFileSync(repo.state, "utf8")).lensResults.length, index + 1);
    if (index < lenses.length - 1) assert.equal(JSON.parse(fs.readFileSync(repo.state, "utf8")).admission, undefined);
  }
  assert.equal(current.nextAction.type, "finalize_review");
  assert.equal(JSON.parse(fs.readFileSync(repo.state, "utf8")).admission.decision.allowed, true);
});

test("CLI lenses are only an exact assertion of negotiated native lenses", () => {
  const repo = fixture();
  const lenses = ["review-risk", "review-resilience", "review-readability", "review-reliability"];
  fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing", lenses, sha(5), null, "high")));
  const omitted = output(run(repo, []));
  assert.equal(omitted.nextAction.type, "delegate_lens");
  assert.equal(omitted.nextAction.lens, lenses[0]);
  const mismatch = run(repo, ["--lenses", lenses.slice(0, 3).join(",")]);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /exactly assert negotiated native selected_lenses/);
});

test("accepts explicit low zero-lens and medium one-lens native contracts", () => {
  const low = fixture(); fs.writeFileSync(low.status, JSON.stringify(status("current_target")));
  const emptyResults = path.join(low.dir, "empty-lenses.json"); fs.writeFileSync(emptyResults, "[]");
  assert.equal(output(run(low, ["--lens-results-file", emptyResults])).nextAction.type, "finalize_review");
  const lowState = JSON.parse(fs.readFileSync(low.state, "utf8"));
  assert.equal(lowState.riskTier, "low"); assert.deepEqual(lowState.lenses, []);

  const medium = fixture();
  fs.writeFileSync(medium.status, JSON.stringify(status("current_target", "reviewing", ["review-reliability"], sha(5), null, "medium")));
  const delegated = output(run(medium, []));
  assert.equal(delegated.nextAction.type, "delegate_lens");
  assert.equal(delegated.nextAction.lens, "review-reliability");
  assert.equal(JSON.parse(fs.readFileSync(medium.state, "utf8")).riskTier, "medium");
});

test("rejects absent malformed and risk-mismatched native selected lenses", () => {
  const cases = [
    (() => { const value = status("current_target"); delete value.selected_lenses; return value; })(),
    { ...status("current_target"), selected_lenses: "review-risk" },
    status("current_target", "reviewing", ["review-risk"], sha(5), null, "low"),
    status("current_target", "reviewing", [], sha(5), null, "medium"),
    status("current_target", "reviewing", ["unknown"], sha(5), null, "medium"),
    status("current_target", "reviewing", ["review-risk"], sha(5), null, "high"),
  ];
  for (const nativeStatus of cases) {
    const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(nativeStatus));
    const result = run(repo, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /selected_lenses|risk tier/);
  }
});

test("rejects native risk tier drift from persisted coordinator authority", () => {
  const repo = fixture();
  fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing", ["review-risk"], sha(5), null, "medium")));
  assert.equal(output(run(repo, [])).nextAction.type, "delegate_lens");
  fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing",
    ["review-risk", "review-resilience", "review-readability", "review-reliability"], sha(5), null, "high")));
  const drifted = run(repo, []);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stderr, /risk tier drifted/);
});

test("rejects gapped duplicate out-of-order and stale incremental lens records", () => {
  for (const kind of ["gap", "duplicate", "unknown", "stale"]) {
    const repo = fixture();
    const lenses = ["review-risk", "review-resilience", "review-readability", "review-reliability"];
    fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing", lenses, sha(5), null, "high")));
    const first = output(run(repo, ["--lenses", lenses.join(",")]));
    const lens = kind === "gap" || kind === "unknown" ? (kind === "gap" ? lenses[1] : "review-other") : lenses[0];
    const values = [{ lens, executionKey: kind === "stale" ? sha(99) : first.nextAction.executionKey, result: { findings: [] } }];
    if (kind === "duplicate") values.push(values[0]);
    const file = path.join(repo.dir, "bad.json"); fs.writeFileSync(file, JSON.stringify(values));
    const result = run(repo, ["--lenses", lenses.join(","), "--lens-results-file", file]);
    if (kind === "stale") assert.equal(output(result).nextAction.reasonCode, "lens-results-malformed");
    else { assert.equal(result.status, 1); assert.match(result.stderr, /ordered prefix|order/i); }
  }
});

test("runtime rejects reversed records and a later lens without its prefix", () => {
  for (const reversed of [true, false]) {
    const repo = fixture();
    const lenses = ["review-risk", "review-resilience", "review-readability", "review-reliability"], file = path.join(repo.dir, "lenses.json");
    fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "reviewing", lenses, sha(5), null, "high")));
    const firstAction = output(run(repo, ["--lenses", lenses.join(",")])).nextAction;
    const first = { lens: lenses[0], executionKey: firstAction.executionKey, result: { findings: [] } };
    fs.writeFileSync(file, JSON.stringify([first]));
    const secondAction = output(run(repo, ["--lenses", lenses.join(","), "--lens-results-file", file])).nextAction;
    const second = { lens: lenses[1], executionKey: secondAction.executionKey, result: { findings: [] } };
    fs.writeFileSync(file, JSON.stringify(reversed ? [second, first] : [second]));
    const result = run(repo, ["--lenses", lenses.join(","), "--lens-results-file", file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ordered prefix/);
  }
});

test("executes admitted finalize and approved receipt validation exactly once", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target")));
  const results = path.join(repo.dir, "empty-lenses.json"); fs.writeFileSync(results, "[]");
  const finalize = output(run(repo, ["--lens-results-file", results])).nextAction;
  assert.equal(finalize.type, "finalize_review");
  assert.equal(output(run(repo, [])).nextAction.type, "finalize_review");
  const saved = JSON.parse(fs.readFileSync(repo.state, "utf8")); saved.admission.lensResultSetDigest = sha(99); fs.writeFileSync(repo.state, JSON.stringify(saved));
  assert.equal(output(run(repo, [])).nextAction.type, "stop");
  run(repo, ["--lens-results-file", results]);
  const finalized = output(run(repo, ["--lens-results-file", results, "--execute-action",
    "--expected-coordinator-fingerprint", output(run(repo, ["--lens-results-file", results])).coordinatorFingerprint,
    "--execution-key", finalize.executionKey]));
  assert.equal(finalized.nextAction.type, "validate_receipt", JSON.stringify(finalized));
  const finalizedState = JSON.parse(fs.readFileSync(repo.state, "utf8"));
  assert.equal(finalizedState.authority.revision, sha(8));
  assert.equal(finalizedState.authority.expectedTransition, undefined);
  const validated = output(run(repo, ["--lens-results-file", results, "--execute-action",
    "--expected-coordinator-fingerprint", finalized.coordinatorFingerprint,
    "--execution-key", finalized.nextAction.executionKey]));
  assert.equal(validated.nextAction.type, "receipt_validated");
  assert.match(validated.promotionPlanId, /^sha256:[0-9a-f]{64}$/);
  assert.match(validated.promotionPlan.validationIdentity, /^sha256:[0-9a-f]{64}$/);
  assert.equal(fs.readFileSync(repo.log, "utf8"), "finalize\nvalidate\n");
});

test("finalize advances only through the exact returned validating transition", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target")));
  const results = path.join(repo.dir, "empty-lenses.json"); fs.writeFileSync(results, "[]");
  const planned = output(run(repo, ["--lens-results-file", results]));
  const finalized = output(run(repo, ["--lens-results-file", results, "--execute-action",
    "--expected-coordinator-fingerprint", planned.coordinatorFingerprint,
    "--execution-key", planned.nextAction.executionKey], { FINALIZE_RETURN_STATE: "validating" }));
  assert.equal(finalized.state, "validating", JSON.stringify(finalized));
  assert.equal(finalized.nextAction.type, "collect_evidence");
  const saved = JSON.parse(fs.readFileSync(repo.state, "utf8"));
  assert.equal(saved.authority.revision, sha(8));
  assert.equal(saved.authority.expectedTransition, undefined);
});

test("finalize rejects status drift unrelated to the exact returned transition", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target")));
  const results = path.join(repo.dir, "empty-lenses.json"); fs.writeFileSync(results, "[]");
  const planned = output(run(repo, ["--lens-results-file", results]));
  const drifted = run(repo, ["--lens-results-file", results, "--execute-action",
    "--expected-coordinator-fingerprint", planned.coordinatorFingerprint,
    "--execution-key", planned.nextAction.executionKey], { FINALIZE_STATUS_REVISION: sha(9) });
  assert.equal(drifted.status, 1);
  assert.match(drifted.stderr || drifted.stdout, /drifted outside the exact returned finalize transition/);
  const saved = JSON.parse(fs.readFileSync(repo.state, "utf8"));
  assert.equal(saved.authority.revision, sha(8));
  assert.equal(saved.authority.expectedTransition.revision, sha(8));
});

test("prepare requires the exact approved promotion plan before creating a branch", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "approved")));
  const planned = output(run(repo, []));
  assert.equal(planned.promotionPlanId, undefined);
  const validated = output(run(repo, ["--execute-action", "--expected-coordinator-fingerprint", planned.coordinatorFingerprint,
    "--execution-key", planned.nextAction.executionKey]));
  const before = git(repo.cwd, ["branch", "--format=%(refname:short)"]);
  for (const args of [[], ["--expected-promotion-plan-id", sha(99)]]) {
    const result = spawnSync(process.execPath, [harness, "--prepare-promotion", "--state-file", path.join(repo.dir, "promotion.json"),
      "--coordinator-state-file", repo.state, ...args], { cwd: repo.cwd, encoding: "utf8",
      env: { ...process.env, TEST_GENTLE_AI_SCRIPT: nativeScript(repo), TEST_AUDIT_SCRIPT: path.join(repo.dir, "audit.mjs"), STATUS: repo.status, STATUS_COUNT: repo.statusCount, LOG: repo.log } });
    assert.equal(result.status, 1); assert.equal(git(repo.cwd, ["branch", "--format=%(refname:short)"]), before);
  }
  assert.match(validated.promotionPlanId, /^sha256:/);
  assert.equal(output(run(repo, [])).promotionPlanId, validated.promotionPlanId);
  const prepared = spawnSync(process.execPath, [harness, "--prepare-promotion", "--state-file", path.join(repo.dir, "promotion.json"),
    "--coordinator-state-file", repo.state, "--expected-promotion-plan-id", validated.promotionPlanId], {
    cwd: repo.cwd, encoding: "utf8", env: { ...process.env, TEST_GENTLE_AI_SCRIPT: nativeScript(repo),
      TEST_AUDIT_SCRIPT: path.join(repo.dir, "audit.mjs"), STATUS: repo.status, STATUS_COUNT: repo.statusCount, LOG: repo.log } });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.match(git(repo.cwd, ["branch", "--format=%(refname:short)"]), /release\//);
});

test("prepare fetches remote refs and rejects a stale plan before branch creation", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "approved")));
  const planned = output(run(repo, []));
  const validated = output(run(repo, ["--execute-action", "--expected-coordinator-fingerprint", planned.coordinatorFingerprint,
    "--execution-key", planned.nextAction.executionKey]));
  const before = git(repo.cwd, ["branch", "--format=%(refname:short)"]), candidate = git(repo.cwd, ["rev-parse", "HEAD"]);
  git(repo.cwd, ["--git-dir", repo.remote, "update-ref", "refs/heads/main", candidate]);
  const audit = path.join(repo.dir, "audit.mjs"); fs.writeFileSync(audit, "");
  const result = spawnSync(process.execPath, [harness, "--prepare-promotion", "--state-file", path.join(repo.dir, "promotion.json"),
    "--coordinator-state-file", repo.state, "--expected-promotion-plan-id", validated.promotionPlanId], {
    cwd: repo.cwd, encoding: "utf8", env: { ...process.env, TEST_GENTLE_AI_SCRIPT: nativeScript(repo), TEST_AUDIT_SCRIPT: audit,
      STATUS: repo.status, STATUS_COUNT: repo.statusCount, LOG: repo.log } });
  assert.equal(result.status, 1); assert.equal(git(repo.cwd, ["branch", "--format=%(refname:short)"]), before);
  assert.equal(git(repo.cwd, ["rev-parse", "origin/main"]), candidate);
});

test("receipt validation context must bind lineage revision trees paths and current receipt", () => {
  for (const mode of ["empty", "wrong-lineage", "wrong-tree", "wrong-receipt"]) {
    const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "approved")));
    const planned = output(run(repo, []));
    const result = run(repo, ["--execute-action", "--expected-coordinator-fingerprint", planned.coordinatorFingerprint,
      "--execution-key", planned.nextAction.executionKey], { VALIDATION_CONTEXT_MODE: mode });
    const value = output(result);
    assert.equal(value.promotionPlanId, undefined, mode);
    if (mode !== "wrong-receipt") {
      assert.equal(result.status, 1, mode);
      assert.equal(value.executionDiagnostic.code, mode === "empty" ? "native-validate-context-incompatible" : "native-validate-context-mismatch");
    }
  }
});

test("old coordinator state is rejected with rerun guidance", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status("current_target", "approved")));
  fs.writeFileSync(repo.state, JSON.stringify({ schema: "flow-pr-promotion-coordinator/v1", lenses: [] }));
  const result = run(repo, []);
  assert.equal(result.status, 1); assert.match(result.stderr, /rerun \/flow-pr promotion review/i);
});

test("malformed exit-zero action output stays in-flight and re-reads status once", () => {
  const repo = fixture(); fs.writeFileSync(repo.status, JSON.stringify(status()));
  const planned = output(run(repo, [])), before = Number(fs.readFileSync(repo.statusCount, "utf8"));
  const result = run(repo, ["--execute-action", "--expected-coordinator-fingerprint", planned.coordinatorFingerprint,
    "--execution-key", planned.nextAction.executionKey], { MALFORMED_ACTION: "start" });
  const resumed = output(result), state = JSON.parse(fs.readFileSync(repo.state, "utf8"));
  assert.equal(result.status, 1); assert.equal(resumed.nextAction.type, "await_status");
  assert.equal(resumed.executionDiagnostic.disposition, "status-re-read-no-retry");
  assert.equal(state.actionLedger.completed.length, 0); assert.equal(state.actionLedger.inFlight.length, 1);
  assert.equal(Number(fs.readFileSync(repo.statusCount, "utf8")) - before, 2);
});
