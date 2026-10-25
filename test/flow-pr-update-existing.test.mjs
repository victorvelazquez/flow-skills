import assert from "node:assert/strict";
import test from "node:test";

import { snapshotWithIdentity } from "../scripts/lib/flow-pr-contracts.mjs";
import { execute } from "../scripts/lib/flow-pr-executor.mjs";

const OLD = "1".repeat(40);
const NEW = "2".repeat(40);
const BASE = "3".repeat(40);
const OTHER = "4".repeat(40);
const sha = "a".repeat(64);
const repo = { host: "github.com", owner: "acme", name: "demo" };
const BRANCH = "feat/demo";

function prFacts(headOid, baseOid = BASE) {
  return {
    number: 7,
    url: "https://github.com/acme/demo/pull/7",
    state: "open",
    draft: false,
    repository: repo,
    head: { owner: "acme", ref: BRANCH, oid: headOid },
    base: { ref: "main", oid: baseOid },
    title: "Old title",
    body: "Old body",
    labels: [],
  };
}

function snapshot({ remoteHead, pr, equal }) {
  return snapshotWithIdentity({
    root: "/tmp/demo",
    commonDir: "/tmp/demo/.git",
    branch: BRANCH,
    headOid: NEW,
    clean: true,
    detached: false,
    committed: true,
    mergeState: "none",
    workingTree: {
      version: 1,
      statusSha256: sha,
      indexSha256: sha,
      normalizationSha256: sha,
      files: [],
    },
    target: repo,
    push: { remote: "origin", remoteHeadOid: remoteHead, repository: repo },
    head: { oid: NEW, owner: "acme", ref: BRANCH, repository: repo },
    base: {
      evidence: "pr:7",
      oid: BASE,
      ref: "main",
      repository: repo,
      source: "existing-pr",
    },
    candidate: null,
    upstream: { remote: "origin", ref: BRANCH },
    remotes: [{ name: "origin", fetch: repo, push: repo }],
    relation: equal
      ? { ahead: 0, behind: 0, divergence: "equal" }
      : { ahead: 1, behind: 0, divergence: "ahead" },
    pr: pr
      ? { availability: "exact", exact: pr, candidates: [pr], reason: null }
      : { availability: "none", exact: null, candidates: [], reason: null },
  });
}

function request(before) {
  return {
    schema: "flow-pr/request-v2",
    expected: {
      intent: { push: "publish", upstream: "set" },
      snapshot: before,
    },
    delivery: {
      mode: "same-repo",
      target: repo,
      push: { remote: "origin", repository: repo },
      head: { owner: "acme", ref: BRANCH, repository: repo },
    },
    pr: {
      title: "New title",
      body: "New body",
      draft: false,
      labels: { add: [], remove: [] },
      updateExisting: ["title", "body"],
    },
  };
}

function harness({ before, after, viewHead = NEW }) {
  const calls = [];
  const inspections = [before, after];
  const inspector = () => ({
    status: "inspect",
    snapshot: { facts: inspections.shift() || after },
  });
  const runner = (command, args) => {
    calls.push([command, ...args].slice(0, 3).join(" "));
    if (command === "git") return { ok: true, stdout: "", stderr: "" };
    if (args[1] === "view")
      return {
        ok: true,
        stdout: JSON.stringify({
          number: 7,
          url: "https://github.com/acme/demo/pull/7",
          state: "OPEN",
          isDraft: false,
          headRefOid: viewHead,
          headRefName: BRANCH,
          headRepositoryOwner: { login: "acme" },
          baseRefName: "main",
          baseRefOid: BASE,
          title: "New title",
          body: "New body",
          labels: [],
        }),
        stderr: "",
      };
    if (args[1] === "create")
      return { ok: true, stdout: "https://github.com/acme/demo/pull/7\n", stderr: "" };
    return { ok: true, stdout: "", stderr: "" };
  };
  return { calls, inspector, runner };
}

test("pushing new commits to an existing PR updates its description in one run", () => {
  const before = snapshot({ remoteHead: OLD, pr: prFacts(OLD), equal: false });
  const after = snapshot({ remoteHead: NEW, pr: prFacts(NEW), equal: true });
  const { calls, inspector, runner } = harness({ before, after });
  const out = execute(request(before), { inspector, runner, env: {} });
  assert.equal(out.status, "success");
  assert.equal(out.blocker, null);
  assert.equal(out.effects.push.state, "confirmed");
  assert.equal(out.effects.prUpdate.state, "confirmed");
  assert.ok(calls.some((call) => call.startsWith("git push")));
  assert.ok(calls.some((call) => call.startsWith("gh pr edit")));
});

test("a PR that does not point at the pushed commit still blocks before any PR edit", () => {
  const before = snapshot({ remoteHead: OLD, pr: prFacts(OLD), equal: false });
  const after = snapshot({ remoteHead: NEW, pr: prFacts(OTHER), equal: true });
  const { calls, inspector, runner } = harness({ before, after });
  const out = execute(request(before), { inspector, runner, env: {} });
  assert.notEqual(out.status, "success");
  assert.equal(out.blocker.code, "pr-incompatible");
  assert.ok(!calls.some((call) => call.startsWith("gh pr edit")));
});

test("another immutable PR change during the push is still post-push drift", () => {
  const before = snapshot({ remoteHead: OLD, pr: prFacts(OLD), equal: false });
  const after = snapshot({
    remoteHead: NEW,
    pr: prFacts(NEW, OTHER),
    equal: true,
  });
  const { calls, inspector, runner } = harness({ before, after });
  const out = execute(request(before), { inspector, runner, env: {} });
  assert.equal(out.status, "partial");
  assert.equal(out.blocker.code, "post-push-authority-drift");
  assert.ok(!calls.some((call) => call.startsWith("gh pr edit")));
});

test("creating a new PR after a push is unchanged", () => {
  const before = snapshot({ remoteHead: null, pr: null, equal: false });
  const after = snapshot({ remoteHead: NEW, pr: null, equal: true });
  const { calls, inspector, runner } = harness({ before, after });
  const req = request(before);
  req.pr.updateExisting = [];
  const out = execute(req, { inspector, runner, env: {} });
  assert.equal(out.status, "success");
  assert.ok(calls.some((call) => call.startsWith("gh pr create")));
});
