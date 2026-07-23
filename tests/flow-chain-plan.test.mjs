import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { classifyBranch } from "../scripts/lib/flow-branch-policy.mjs";
import { digestChangedPaths } from "../scripts/lib/flow-check-evidence.mjs";
import { DEFAULT_DELIVERY_CONFIG } from "../scripts/lib/flow-delivery-config.mjs";
import {
  buildChainForecast,
  FLOW_CHAIN_PLAN_SCHEMA,
  getChainPlanIdentity,
  normalizeChainPlanRefs,
  parseNumstat,
  summarizeLineAccounting,
  validateChainPlan,
} from "../scripts/lib/flow-chain-plan.mjs";
import { resolveChainRef } from "../scripts/flow-pr.mjs";

function entry(overrides = {}) {
  const changedPaths = overrides.changedPaths || ["src/auth/login.ts"];
  const implementation = changedPaths.filter((item) => !/\.(?:test|spec)\.[^/]+$/i.test(item) && !/(?:^|\/)docs\//i.test(item) && !/\.md$/i.test(item));
  const tests = changedPaths.filter((item) => /\.(?:test|spec)\.[^/]+$/i.test(item));
  const docs = changedPaths.filter((item) => /(?:^|\/)docs\//i.test(item) || /\.md$/i.test(item));
  return { id: "pr-1", head: "feat/auth-core", base: "development", expectedHeadSha: "sha-1", expectedTree: "tree-1", workUnitId: "wu-01", title: "Authenticate users with validated credentials", startState: "Credentials are not validated", endState: "Valid credentials create an authenticated session", priorWork: "No prior chain work", followUp: "Authentication UI", changedPaths, changedPathsDigest: digestChangedPaths(changedPaths), paths: { implementation, tests, docs, sharedSupport: [] }, authoredLines: 120, generatedLines: 0, dependencyIds: [], focusedTest: { command: "node --test auth", result: "Passed" }, runtimeVerification: { scenario: "Submit valid credentials", result: "Session created" }, rollbackBoundary: "Remove only the authentication validation paths declared by wu-01", validationEvidenceRefs: [], outOfScope: "Authentication UI", ...overrides };
}

function stackedPlan() {
  const first = entry();
  const paths = ["src/auth/session.ts", "src/auth/session.spec.ts"];
  const second = entry({ id: "pr-2", head: "test/auth-core", base: first.head, expectedHeadSha: "sha-2", expectedTree: "tree-2", workUnitId: "wu-02", title: "Verify authenticated session creation", changedPaths: paths, changedPathsDigest: digestChangedPaths(paths), paths: { implementation: [paths[0]], tests: [paths[1]], docs: [], sharedSupport: [] }, authoredLines: 80, dependencyIds: [first.id] });
  return { version: FLOW_CHAIN_PLAN_SCHEMA, strategy: "stacked-to-main", repository: { identity: "example/repo" }, integrationRef: { name: "development", expectedSha: "sha-dev", expectedTree: "tree-dev" }, productionRef: { name: "main", expectedSha: "sha-main", expectedTree: "tree-main" }, prs: [first, second] };
}

function featurePlan() {
  const paths = ["src/platform/base.ts"];
  const tracker = entry({ id: "tracker", head: "feat/auth-tracker", expectedHeadSha: "sha-tracker", expectedTree: "tree-tracker", changedPaths: paths, changedPathsDigest: digestChangedPaths(paths), authoredLines: 20, draft: true, noMerge: true });
  delete tracker.workUnitId;
  const child = entry({ base: tracker.head, dependencyIds: [tracker.id] });
  return { ...stackedPlan(), strategy: "feature-branch-chain", expectedFinalTree: child.expectedTree, tracker, prs: [child] };
}

function context(plan) {
  const publications = [...(plan.tracker ? [plan.tracker] : []), ...plan.prs];
  const refs = { development: { sha: "sha-dev", tree: "tree-dev" }, main: { sha: "sha-main", tree: "tree-main" } };
  const diffs = {};
  for (const item of publications) {
    refs[item.head] = { sha: item.expectedHeadSha, tree: item.expectedTree };
    diffs[`${item.base}..${item.head}`] = { changedPaths: [...item.changedPaths], changedPathsDigest: item.changedPathsDigest, authoredLines: item.authoredLines, generatedLines: item.generatedLines };
  }
  return { repositoryIdentity: "example/repo", integrationRef: "development", productionRef: "main", protectedBranches: DEFAULT_DELIVERY_CONFIG.branches.protected, reviewBudget: 400, refs, diffs, classifyBranch: (branch) => classifyBranch(branch, DEFAULT_DELIVERY_CONFIG), isAncestor: () => true, validateEvidence: () => ({ status: "Passed", details: [] }) };
}

test("stacked-to-main validates immediate parents and immutable identity", () => {
  const plan = stackedPlan();
  const result = validateChainPlan(plan, context(plan));
  assert.equal(result.publications[1].base, "feat/auth-core");
  assert.equal(result.planIdentity, getChainPlanIdentity(structuredClone(plan)));
});

test("legacy v1 plans fail closed with regeneration guidance", () => {
  const plan = stackedPlan();
  plan.version = "flow-chain-plan/v1";
  assert.throws(() => validateChainPlan(plan, context(plan)), /legacy.*regenerate/i);
});

test("child work units require complete semantic boundaries", () => {
  const plan = stackedPlan();
  delete plan.prs[0].startState;
  assert.throws(() => validateChainPlan(plan, context(plan)), /startState/);
});

test("tests and docs cannot be separated from their implementation behavior", () => {
  const plan = stackedPlan();
  const tests = ["src/auth/login.spec.ts"];
  Object.assign(plan.prs[0], { changedPaths: tests, changedPathsDigest: digestChangedPaths(tests), paths: { implementation: [], tests, docs: [], sharedSupport: [] } });
  const invalidContext = context(plan);
  assert.throws(() => validateChainPlan(plan, invalidContext), /tests\/docs-only/i);
});

test("shared support requires explicit ownership and rationale", () => {
  const plan = stackedPlan();
  const shared = "src/support/auth-fixture.ts";
  plan.prs[0].changedPaths.push(shared);
  plan.prs[0].changedPathsDigest = digestChangedPaths(plan.prs[0].changedPaths);
  plan.prs[0].paths.sharedSupport.push({ path: shared, ownerWorkUnitId: "", rationale: "" });
  assert.throws(() => validateChainPlan(plan, context(plan)), /sharedSupport.*ownerWorkUnitId/i);
});

test("over-budget work units require immutable maintainer size exception", () => {
  const plan = stackedPlan();
  plan.prs[0].authoredLines = 401;
  const oversizedContext = context(plan);
  assert.throws(() => validateChainPlan(plan, oversizedContext), /size:exception/i);
  plan.prs[0].sizeException = { label: "size:exception", maintainer: "maintainer@example.test", rationale: "Generated contract cannot be split safely" };
  assert.equal(validateChainPlan(plan, oversizedContext).valid, true);
});

test("feature-branch-chain requires a draft no-merge tracker", () => {
  const plan = featurePlan();
  assert.equal(validateChainPlan(plan, context(plan)).publications[0].tracker, true);
  plan.tracker.draft = false;
  assert.throws(() => validateChainPlan(plan, context(plan)), /draft and no-merge/i);
  plan.tracker.draft = true;
  plan.tracker.noMerge = false;
  assert.throws(() => validateChainPlan(plan, context(plan)), /draft and no-merge/i);
});

test("tracker is budget-exempt and aggregate identity-bound, but cannot be a work unit", () => {
  const plan = featurePlan();
  plan.tracker.authoredLines = 900;
  const trackerContext = context(plan);
  const identity = validateChainPlan(plan, trackerContext).planIdentity;
  plan.tracker.expectedTree = "tree-tracker-v2";
  assert.notEqual(getChainPlanIdentity(plan), identity);
  plan.tracker.expectedTree = "tree-tracker";
  plan.tracker.workUnitId = "wu-tracker";
  assert.throws(() => validateChainPlan(plan, trackerContext), /cannot declare workUnitId/i);
});

test("feature plan binds expectedFinalTree to the deepest child and identity", () => {
  const plan = featurePlan(), identity = getChainPlanIdentity(plan);
  plan.expectedFinalTree = "wrong-tree";
  assert.throws(() => validateChainPlan(plan, context(plan)), /deepest semantic child/i);
  assert.notEqual(getChainPlanIdentity(plan), identity);
});

test("child Chain Context carries complete semantic and evidence boundaries", () => {
  const plan = featurePlan();
  const result = validateChainPlan(plan, context(plan));
  assert.deepEqual(result.chainContexts["pr-1"], {
    dependencyDiagram: "[current] wu-01: Authenticate users with validated credentials",
    currentMarker: "wu-01", prior: "No prior chain work", followUp: "Authentication UI",
    start: "Credentials are not validated", end: "Valid credentials create an authenticated session", outOfScope: "Authentication UI",
    verification: { focusedTest: plan.prs[0].focusedTest, runtime: plan.prs[0].runtimeVerification },
    rollback: plan.prs[0].rollbackBoundary,
    budget: { authoredLines: 120, limit: 400, exception: null },
  });
});

test("chain plans reject cycles, polluted diffs, and stale refs", () => {
  const cycle = stackedPlan();
  cycle.prs[0].dependencyIds = [cycle.prs[1].id];
  assert.throws(() => validateChainPlan(cycle, context(cycle)), /dependency cycle/i);
  const polluted = stackedPlan(), pollutedContext = context(polluted);
  pollutedContext.diffs["development..feat/auth-core"].changedPaths.push("src/unrelated.ts");
  assert.throws(() => validateChainPlan(polluted, pollutedContext), /polluted/i);
  const stale = stackedPlan(), staleContext = context(stale);
  staleContext.refs["feat/auth-core"].tree = "changed";
  assert.throws(() => validateChainPlan(stale, staleContext), /stale/i);
});

test("oversized authored changes forecast both supported chain strategies", () => {
  const accounting = summarizeLineAccounting(parseNumstat("250\t0\tsrc/auth/login.ts\n230\t0\tsrc/users/list.ts\n700\t0\tvendor/sdk.js\n", DEFAULT_DELIVERY_CONFIG.chain.generatedPathPatterns));
  const forecast = buildChainForecast(accounting, DEFAULT_DELIVERY_CONFIG);
  assert.equal(forecast.decisionRequired, true);
  assert.deepEqual(forecast.supportedStrategies, ["stacked-to-main", "feature-branch-chain"]);
  assert.equal(accounting.generatedLines, 700);
  assert.equal(forecast.validatedChainPlan, false);
  assert.match(forecast.advisory, /not a validated chain plan/i);
});

function makeChainRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-chain-ref-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "flow@example.test"], { cwd });
  execFileSync("git", ["config", "user.name", "Flow Test"], { cwd });
  fs.writeFileSync(path.join(cwd, "change.txt"), "base\n");
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["commit", "-qm", "chore: initial"], { cwd });
  return cwd;
}

function withCwd(cwd, callback) {
  const previous = process.cwd();
  process.chdir(cwd);
  try { return callback(); } finally { process.chdir(previous); }
}

test("legacy origin context fields normalize before validation and plan identity", () => {
  const legacy = stackedPlan();
  legacy.productionRef.name = "origin/main";
  const normalized = normalizeChainPlanRefs(legacy);
  assert.equal(normalized.productionRef.name, "main");
  assert.equal(validateChainPlan(legacy, context(normalized)).planIdentity, getChainPlanIdentity(normalized));
});

test("literal origin-prefixed branches make legacy context fields ambiguous", () => {
  const legacy = stackedPlan();
  legacy.integrationRef.name = "origin/development";
  const ambiguousContext = context(stackedPlan());
  ambiguousContext.refs["origin/development"] = { sha: "literal-sha", tree: "literal-tree" };
  assert.throws(() => validateChainPlan(legacy, ambiguousContext), /ambiguous.*literal local branch/i);

  assert.throws(
    () => normalizeChainPlanRefs(legacy, { isLiteralBranch: (name) => name === "origin/development" }),
    /ambiguous.*literal local branch/i,
  );
});

test("chain ref resolution preserves literal and explicit Git ref semantics", () => {
  const cwd = makeChainRepo();
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  execFileSync("git", ["branch", "origin/main"], { cwd });
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd });

  const literal = withCwd(cwd, () => resolveChainRef("origin/main"));
  assert.equal(literal.ref, "refs/heads/origin/main");
  const explicit = withCwd(cwd, () => resolveChainRef("refs/remotes/origin/main"));
  assert.equal(explicit.ref, "refs/remotes/origin/main");
  assert.equal(explicit.sha, sha);
});

test("chain ref resolution prefers local branches and supports remote-only canonical names", () => {
  const cwd = makeChainRepo();
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", sha], { cwd });
  assert.notEqual(spawnSync("git", ["rev-parse", "--verify", "refs/heads/main"], { cwd }).status, 0);
  assert.equal(withCwd(cwd, () => resolveChainRef("main")).ref, "refs/remotes/origin/main");

  execFileSync("git", ["branch", "main"], { cwd });
  assert.equal(withCwd(cwd, () => resolveChainRef("main")).ref, "refs/heads/main");
});

test("invalid, missing, and non-declared legacy chain refs fail closed", () => {
  const cwd = makeChainRepo();
  assert.throws(() => withCwd(cwd, () => resolveChainRef("origin/missing")), /accepted only in declared chain plan context refs/i);
  assert.throws(() => withCwd(cwd, () => resolveChainRef("refs/remotes/origin/missing")), /Could not resolve explicit chain ref/i);
  assert.throws(() => withCwd(cwd, () => resolveChainRef("bad ref")), /not a valid branch name/i);
});
