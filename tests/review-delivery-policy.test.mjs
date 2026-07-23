import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildStagedCandidate,
  deliveryPlanId,
  disposeStagedCandidate,
  resolveCommitDeliveryPolicy,
  resolvePublicationDeliveryPolicy,
  resolveStructuredDeliveryPolicy,
} from "../scripts/lib/review-delivery-policy.mjs";
import { runFileSafe } from "../scripts/lib/helpers.mjs";
import { nativePathsDigest } from "./helpers/native-paths-digest.mjs";

function authority(candidate, overrides = {}) {
  return {
    schema: "gentle-ai.review-gate-result/v1",
    result: "allow",
    allowed: true,
    action: "continue",
    context: {
      lineage_id: "review-example",
      store_revision: "sha256:revision",
      base_tree: candidate.baseTree,
      candidate_tree: candidate.tree,
      paths_digest: candidate.pathsDigest,
    },
    ...overrides,
  };
}

const candidate = {
  baseTree: "base-tree-1",
  tree: "tree-1",
  paths: ["docs/change.md", "src/change.mjs", "tests/change.test.mjs"],
  pathsDigest: "sha256:4c6ed5fdcd204b9347db0a94bf57272c8246c49357d26e369f7f533108aa2275",
};

function statusEntry(overrides = {}) {
  return {
    lineage_id: "review-example",
    status: "approved",
    state: "approved",
    revision: "sha256:revision",
    ...overrides,
  };
}

function publicationRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-review-publication-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  git(["config", "flow.reviewLifecycle", "optional"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "base\n");
  git(["add", "."]); git(["commit", "-qm", "chore: base"]);
  git(["checkout", "-qb", "feat/candidate"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "candidate\n");
  git(["commit", "-qam", "feat: candidate"]);
  return { cwd, git };
}

function projectedEntry(repo, lineage, state, overrides = {}) {
  const entryPath = path.join(repo.cwd, ".review-fixtures", lineage);
  fs.mkdirSync(entryPath, { recursive: true });
  const paths = ["change.txt"];
  const revision = `sha256:${lineage}`;
  const snapshot = {
    base_tree: repo.git(["rev-parse", "main^{tree}"]),
    candidate_tree: repo.git(["rev-parse", "HEAD^{tree}"]),
    paths,
    paths_digest: nativePathsDigest(paths),
    ...overrides,
  };
  fs.writeFileSync(path.join(entryPath, "review-state.json"), JSON.stringify({
    schema: "gentle-ai.review-state-record/v2", revision,
    state: { schema: "gentle-ai.review-state/v2", lineage_id: lineage, state, initial_snapshot: snapshot },
  }));
  return { lineage_id: lineage, path: entryPath, status: state === "approved" ? "approved" : "active", state, revision };
}

function stagedEntry(cwd, lineage, state, snapshot) {
  const entryPath = path.join(cwd, ".review-fixtures", lineage);
  const revision = "sha256:lineage";
  fs.mkdirSync(entryPath, { recursive: true });
  fs.writeFileSync(path.join(entryPath, "review-state.json"), JSON.stringify({
    schema: "gentle-ai.review-state-record/v2", revision,
    state: { schema: "gentle-ai.review-state/v2", lineage_id: lineage, state, initial_snapshot: {
      base_tree: snapshot.baseTree, candidate_tree: snapshot.tree,
      paths: snapshot.paths, paths_digest: snapshot.pathsDigest,
    } },
  }));
  return { lineage_id: lineage, path: entryPath, revision, status: state, state };
}

test("optional publication ignores unrelated historical authorities without validating", () => {
  const repo = publicationRepo();
  const unrelated = projectedEntry(repo, "review-old", "approved", { candidate_tree: "0".repeat(40) });
  let validationCalls = 0;
  const runner = (command, args, options) => {
    if (command !== "gentle-ai") return runFileSafe(command, args, options);
    if (args[1] === "status") {
      const stdout = JSON.stringify({ schema: "gentle-ai.review-authority-status/v1", complete: true, authoritative: true, entries: [unrelated] });
      return { ok: true, stdout, output: stdout };
    }
    validationCalls++;
    return { ok: false, stdout: "", output: "receipt not available" };
  };
  const policy = resolvePublicationDeliveryPolicy({ cwd: repo.cwd, baseRef: "main", runner });
  assert.equal(policy.status, "no-applicable-authority");
  assert.equal(policy.nextAction, "continue-without-review-authority");
  assert.equal(validationCalls, 0);
});

test("applicable pending and terminal authorities preserve state and one next action", () => {
  for (const [state, action] of [["reviewing", "continue-review"], ["correction_required", "continue-correction"], ["invalidated", "stop-delivery"], ["escalated", "stop-delivery"]]) {
    const repo = publicationRepo();
    const entry = projectedEntry(repo, `review-${state}`, state);
    const runner = (command, args, options) => {
      if (command !== "gentle-ai") return runFileSafe(command, args, options);
      const stdout = JSON.stringify({ schema: "gentle-ai.review-authority-status/v1", complete: true, authoritative: true, entries: [entry] });
      return { ok: true, stdout, output: stdout };
    };
    assert.throws(
      () => resolvePublicationDeliveryPolicy({ cwd: repo.cwd, baseRef: "main", runner }),
      (error) => error.state === state && error.action === action
        && /Do not start or restart review/.test(error.message)
        && (state !== "correction_required" || /Complete the existing correction/.test(error.nextAction)),
    );
  }
});

test("pre-commit allow conservatively resolves one reviewed delivery", () => {
  const policy = resolveStructuredDeliveryPolicy({
    lifecycle: "optional",
    candidate,
    status: { entries: [statusEntry()] },
    validation: authority(candidate),
  });
  assert.equal(policy.topology, "single");
  assert.equal(policy.constraintSource, "pre-commit-allow-compat-v1");
  assert.equal(policy.authority.pathsDigest, candidate.pathsDigest);
});

test("historical unsafe entries do not block the unique applicable approved lineage", () => {
  const policy = resolveStructuredDeliveryPolicy({
    lifecycle: "required",
    candidate,
    status: {
      entries: [
        statusEntry({ lineage_id: "review-old", status: "superseded", state: "escalated" }),
        statusEntry(),
        statusEntry({ lineage_id: "review-other", revision: "sha256:other" }),
      ],
    },
    validation: authority(candidate),
  });
  assert.equal(policy.topology, "single");
  assert.equal(policy.authority.lineage, "review-example");
});

test("future structured delivery constraints take precedence", () => {
  const policy = resolveStructuredDeliveryPolicy({
    lifecycle: "required",
    candidate,
    status: { entries: [statusEntry()] },
    validation: authority(candidate, { deliveryConstraints: { commitTopology: "work-units", maxCommits: 4 } }),
  });
  assert.equal(policy.topology, "grouped");
  assert.equal(policy.constraintSource, "structured-delivery-constraints");
});

test("optional lifecycle without authority preserves grouping", () => {
  const policy = resolveStructuredDeliveryPolicy({
    lifecycle: "optional",
    candidate,
    status: { schema: "gentle-ai.review-authority-status/v1", complete: true, authoritative: true, entries: [] },
    validation: null,
  });
  assert.equal(policy.topology, "grouped");
  assert.equal(policy.constraintSource, "no-applicable-authority");
});

test("optional lifecycle fails closed without structured no-authority evidence", () => {
  assert.throws(
    () => resolveStructuredDeliveryPolicy({ lifecycle: "optional", candidate, status: { entries: [] }, validation: null }),
    /cannot be determined/,
  );
  const partial = authority(candidate);
  delete partial.context.paths_digest;
  assert.throws(
    () => resolveStructuredDeliveryPolicy({ lifecycle: "optional", candidate, status: { entries: [statusEntry()] }, validation: partial }),
    /omitted required/,
  );
});

test("required lifecycle and applicable unsafe authority states fail closed", () => {
  assert.throws(
    () => resolveStructuredDeliveryPolicy({ lifecycle: "required", candidate, status: { entries: [] }, validation: null }),
    /required/,
  );
  for (const state of ["invalidated", "escalated", "ambiguous", "correction_required"]) {
    assert.throws(
      () => resolveStructuredDeliveryPolicy({
        lifecycle: "optional",
        candidate,
        status: { entries: [statusEntry({ state, status: state })] },
        validation: authority(candidate, { result: "deny", allowed: false, action: state }),
      }),
      /blocked/,
    );
  }
});

test("multiple status entries for the applicable lineage fail closed as ambiguous", () => {
  assert.throws(
    () => resolveStructuredDeliveryPolicy({
      lifecycle: "required",
      candidate,
      status: { entries: [statusEntry(), statusEntry({ revision: "sha256:other" })] },
      validation: authority(candidate),
    }),
    /ambiguous/,
  );
});

test("authority drift in lineage revision tree or paths changes or blocks the plan", () => {
  const first = resolveStructuredDeliveryPolicy({ lifecycle: "required", candidate, status: { entries: [statusEntry()] }, validation: authority(candidate) });
  const changedRevision = structuredClone(authority(candidate));
  changedRevision.context.store_revision = "sha256:changed";
  const second = resolveStructuredDeliveryPolicy({
    lifecycle: "required",
    candidate,
    status: { entries: [statusEntry({ revision: "sha256:changed" })] },
    validation: changedRevision,
  });
  assert.notEqual(deliveryPlanId(first), deliveryPlanId(second));
  for (const changed of [
    authority({ ...candidate, tree: "tree-2" }),
    authority({ ...candidate, baseTree: "base-tree-2" }),
    authority({ ...candidate, pathsDigest: "sha256:different" }),
  ]) {
    assert.throws(
      () => resolveStructuredDeliveryPolicy({ lifecycle: "required", candidate, status: { entries: [statusEntry()] }, validation: changed }),
      /does not match/,
    );
  }
});

test("temporary candidate index leaves the real index and worktree unchanged", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-review-candidate-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "chore: initial"]);
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "candidate\n");
  fs.writeFileSync(path.join(cwd, "new.txt"), "new\n");
  const statusBefore = git(["status", "--porcelain=v1"]);
  const indexBefore = git(["write-tree"]);
  const staged = buildStagedCandidate(cwd, ["tracked.txt", "new.txt"]);
  try {
    assert.deepEqual(staged.paths, ["new.txt", "tracked.txt"]);
    assert.notEqual(staged.tree, indexBefore);
    assert.equal(git(["status", "--porcelain=v1"]), statusBefore);
    assert.equal(git(["write-tree"]), indexBefore);
  } finally {
    disposeStagedCandidate(staged);
  }
});

test("native canonical path digest recognizes an exact staged projection and rejects path drift", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-review-native-digest-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  git(["config", "flow.reviewLifecycle", "required"]);
  fs.mkdirSync(path.join(cwd, "nested"));
  fs.writeFileSync(path.join(cwd, "nested", "change.txt"), "base\n");
  fs.writeFileSync(path.join(cwd, "other.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "chore: initial"]);
  fs.writeFileSync(path.join(cwd, "nested", "change.txt"), "candidate\n");
  fs.writeFileSync(path.join(cwd, "other.txt"), "candidate\n");

  const requestedPaths = ["other.txt", "nested\\change.txt", "other.txt"];
  const staged = buildStagedCandidate(cwd, requestedPaths);
  const pathsDigest = nativePathsDigest(staged.paths);
  const snapshot = { ...staged, pathsDigest };
  const applicable = stagedEntry(cwd, "review-native", "approved", snapshot);
  disposeStagedCandidate(staged);
  const status = JSON.stringify({
    schema: "gentle-ai.review-authority-status/v1",
    complete: true,
    authoritative: true,
    entries: [applicable],
  });
  let validationCalls = 0;
  const runner = (command, args, options) => {
    if (command !== "gentle-ai") return runFileSafe(command, args, options);
    if (args[1] === "status") return { ok: true, stdout: status, output: status };
    validationCalls++;
    const stdout = JSON.stringify(authority(snapshot, {
      context: {
        lineage_id: "review-native",
        store_revision: "sha256:lineage",
        base_tree: snapshot.baseTree,
        candidate_tree: snapshot.tree,
        paths_digest: pathsDigest,
      },
    }));
    return { ok: true, stdout, output: stdout };
  };

  const policy = resolveCommitDeliveryPolicy({ cwd, targetPaths: requestedPaths, lineage: "review-native", runner });
  assert.deepEqual(policy.authority.paths, ["nested/change.txt", "other.txt"]);
  assert.equal(policy.authority.pathsDigest, pathsDigest);
  assert.equal(validationCalls, 1);
  assert.throws(
    () => resolveCommitDeliveryPolicy({ cwd, targetPaths: ["nested/change.txt"], lineage: "review-native", runner }),
    /no authority applies to the exact candidate projection/,
  );
  assert.equal(validationCalls, 1);
});

test("native path digest uses UTF-8 byte lengths and canonical slash-sorted unique paths", () => {
  assert.equal(
    nativePathsDigest(["z\\last.txt", "é/ß.txt", "a.txt", "é/ß.txt"]),
    "sha256:b4c3b7046ea966395bd0d0fbed9244213e1af5d2d574b90b51dcd1ed8f43734b",
  );
});

test("missing CLI blocks required lifecycle and preserves optional grouping", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-review-cli-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "chore: initial"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "changed\n");
  const runner = (command, args, options) => command === "gentle-ai"
    ? { ok: false, stdout: "", output: "unavailable", error: { code: "ENOENT" } }
    : runFileSafe(command, args, options);
  git(["config", "flow.reviewLifecycle", "required"]);
  assert.throws(
    () => resolveCommitDeliveryPolicy({ cwd, targetPaths: ["change.txt"], runner }),
    /required.*unavailable/,
  );
  git(["config", "flow.reviewLifecycle", "optional"]);
  const optional = resolveCommitDeliveryPolicy({ cwd, targetPaths: ["change.txt"], runner });
  assert.equal(optional.topology, "grouped");
  assert.equal(optional.constraintSource, "cli-unavailable-optional");
});

test("existing CLI validation outages and malformed responses fail closed", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-review-failure-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "chore: initial"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "changed\n");
  const staged = buildStagedCandidate(cwd, ["change.txt"]);
  const applicable = stagedEntry(cwd, "review-example", "approved", staged);
  disposeStagedCandidate(staged);
  const status = JSON.stringify({ schema: "gentle-ai.review-authority-status/v1", complete: true, authoritative: true, entries: [applicable] });
  for (const failure of [
    { ok: false, stdout: "", output: "failed", status: 1 },
    { ok: true, stdout: "{", output: "{" },
    { ok: false, stdout: "", output: "timeout", error: { code: "ETIMEDOUT" } },
  ]) {
    const runner = (command, args, options) => command === "gentle-ai"
      ? args[1] === "status" ? { ok: true, stdout: status, output: status } : failure
      : runFileSafe(command, args, options);
    assert.throws(
      () => resolveCommitDeliveryPolicy({ cwd, targetPaths: ["change.txt"], runner }),
      /failed|non-JSON/,
    );
  }
});

function lineageRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-review-lineage-"));
  const git = (args, env) => execFileSync("git", args, { cwd, encoding: "utf8", env }).trim();
  git(["init", "-q"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  git(["config", "flow.reviewLifecycle", "required"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "chore: initial"]);
  fs.writeFileSync(path.join(cwd, "change.txt"), "changed\n");
  return { cwd, git };
}

function lineageRunner(repo, returnedLineage, options = {}) {
  const calls = [];
  const revision = "sha256:lineage";
  const staged = buildStagedCandidate(repo.cwd, ["change.txt"]);
  const status = JSON.stringify({
    schema: "gentle-ai.review-authority-status/v1",
    complete: true,
    authoritative: true,
    entries: ["review-one", "review-two"].map((lineage_id) => stagedEntry(repo.cwd, lineage_id, "approved", staged)),
  });
  disposeStagedCandidate(staged);
  return {
    calls,
    runner(command, args, runOptions = {}) {
      if (command !== "gentle-ai") return runFileSafe(command, args, runOptions);
      if (args[1] === "status") return { ok: true, stdout: status, output: status };
      calls.push(args);
      if (options.reject) return { ok: false, stdout: "", output: "lineage selection is required" };
      const git = (gitArgs) => repo.git(gitArgs, runOptions.env || process.env);
      const document = {
        schema: "gentle-ai.review-gate-result/v1",
        result: "allow",
        allowed: true,
        action: "continue",
        context: {
          lineage_id: returnedLineage,
          store_revision: revision,
          base_tree: git(["rev-parse", "HEAD^{tree}"]),
          candidate_tree: git(["write-tree"]),
          paths_digest: staged.pathsDigest,
        },
      };
      const stdout = JSON.stringify(document);
      return { ok: true, stdout, output: stdout };
    },
  };
}

test("explicit lineage is passed as argv and selects only matching native authority", () => {
  const repo = lineageRepo();
  const native = lineageRunner(repo, "review-two");
  const policy = resolveCommitDeliveryPolicy({ cwd: repo.cwd, targetPaths: ["change.txt"], lineage: "review-two", runner: native.runner });
  assert.equal(policy.authority.lineage, "review-two");
  assert.deepEqual(native.calls[0].slice(-2), ["--lineage", "review-two"]);
});

test("explicit lineage never falls back and rejects authority from another lineage", () => {
  const rejectedRepo = lineageRepo();
  const rejected = lineageRunner(rejectedRepo, "review-one", { reject: true });
  assert.throws(
    () => resolveCommitDeliveryPolicy({ cwd: rejectedRepo.cwd, targetPaths: ["change.txt"], lineage: "review-two", runner: rejected.runner }),
    /Native pre-commit validation failed/,
  );
  assert.deepEqual(rejected.calls[0].slice(-2), ["--lineage", "review-two"]);

  const mismatchRepo = lineageRepo();
  const mismatch = lineageRunner(mismatchRepo, "review-one");
  assert.throws(
    () => resolveCommitDeliveryPolicy({ cwd: mismatchRepo.cwd, targetPaths: ["change.txt"], lineage: "review-two", runner: mismatch.runner }),
    /requested lineage/i,
  );
});

test("ambiguous native validation remains fail-closed without explicit lineage", () => {
  const repo = lineageRepo();
  const native = lineageRunner(repo, "review-one", { reject: true });
  assert.throws(
    () => resolveCommitDeliveryPolicy({ cwd: repo.cwd, targetPaths: ["change.txt"], runner: native.runner }),
    /ambiguous for the exact candidate projection/,
  );
  assert.equal(native.calls.length, 0);
});
