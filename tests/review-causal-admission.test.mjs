import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { admitReviewFindings, REVIEW_CAUSAL_ADMISSION_CAPABILITY } from "../scripts/lib/review-causal-admission.mjs";

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-causal-admission-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const write = (name, value) => {
    const target = path.join(cwd, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  git(["init", "-q"]);
  git(["config", "user.email", "flow@example.test"]);
  git(["config", "user.name", "Flow Test"]);
  write("src/changed.cs", "one\ntwo\nthree\n");
  write("src/unchanged.cs", "unsafe\n");
  write("src/deleted.cs", "old\n");
  write("src/mode.sh", "run\n");
  write("src/rename-old.cs", "rename\n");
  fs.writeFileSync(path.join(cwd, "src/binary.bin"), Buffer.from([0, 1]));
  git(["add", "."]); git(["commit", "-qm", "base"]);
  const baseRef = git(["rev-parse", "HEAD"]);
  const baseTree = git(["rev-parse", "HEAD^{tree}"]);
  write("src/changed.cs", "one\nTWO\nthree\n");
  write("src/added.cs", "new\n");
  fs.writeFileSync(path.join(cwd, "src/binary.bin"), Buffer.from([0, 2]));
  fs.rmSync(path.join(cwd, "src/deleted.cs"));
  git(["mv", "src/rename-old.cs", "src/rename-new.cs"]);
  git(["add", "."]); git(["update-index", "--chmod=+x", "src/mode.sh"]); git(["commit", "-qm", "candidate"]);
  const candidateRef = git(["rev-parse", "HEAD"]);
  const candidateTree = git(["rev-parse", "HEAD^{tree}"]);
  const genesisPaths = ["src/changed.cs", "src/added.cs", "src/deleted.cs", "src/binary.bin", "src/mode.sh", "src/rename-old.cs", "src/rename-new.cs"];
  const admit = (findings, overrides = {}) => admitReviewFindings({
    cwd, baseRef, candidateRef, baseTree, candidateTree, genesisPaths, findings, ...overrides,
  });
  return { admit, cwd, baseRef, candidateRef, baseTree, candidateTree, genesisPaths };
}

const severe = (location, overrides = {}) => ({
  id: "finding-1", severity: "CRITICAL", causalDisposition: "worsened", location, ...overrides,
});

test("rejects Tecnomyl-style worsened finding outside frozen genesis and delta", () => {
  const result = fixture().admit([severe("src/unchanged.cs:1")]);
  assert.equal(result.allowed, false);
  assert.deepEqual(result.rejectedFindingIndexes, [0]);
  assert.equal(result.diagnostics[0].reasonCode, "path-outside-genesis");
});

test("accepts changed lines and rejects unchanged lines in a changed file", () => {
  const repo = fixture();
  assert.equal(repo.admit([severe("src/changed.cs:2")]).allowed, true);
  const rejected = repo.admit([severe("src/changed.cs:1")]);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.diagnostics[0].reasonCode, "range-outside-delta-hunks");
});

test("literal pathspec metacharacters cannot import hunks from matching paths", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-causal-pathspec-"));
  const git = (args, input) => execFileSync("git", args, { cwd, encoding: "utf8", input }).trim();
  git(["init", "--bare", "-q"]); git(["config", "user.email", "flow@example.test"]); git(["config", "user.name", "Flow Test"]);
  const blob = (value) => git(["hash-object", "-w", "--stdin"], value);
  const tree = (literal, matching) => {
    const src = git(["mktree"], `100644 blob ${blob(literal)}\titem*.cs\n100644 blob ${blob(matching)}\titem-other.cs\n`);
    return git(["mktree"], `040000 tree ${src}\tsrc\n`);
  };
  const baseTree = tree("stable\nbase\n", "stable\nbase\n");
  const baseRef = git(["commit-tree", baseTree, "-m", "base"]);
  const candidateTree = tree("stable\ncandidate\n", "CHANGED\nbase\n");
  const candidateRef = git(["commit-tree", candidateTree, "-p", baseRef, "-m", "candidate"]);
  const admit = (line) => admitReviewFindings({ cwd, baseRef, candidateRef, baseTree, candidateTree, genesisPaths: ["src/item*.cs"], findings: [severe(`src/item*.cs:${line}`)] });
  assert.equal(admit(2).allowed, true);
  assert.equal(admit(1).diagnostics[0].reasonCode, "range-outside-delta-hunks");
});

test("handles whole-file add/delete and requires ranges for ordinary text modifications", () => {
  const repo = fixture();
  assert.equal(repo.admit([severe("src/added.cs")]).allowed, true);
  assert.equal(repo.admit([severe("src/deleted.cs")]).allowed, true);
  assert.equal(repo.admit([severe("src/deleted.cs:1")]).allowed, true);
  assert.equal(repo.admit([severe("src/added.cs:2")]).diagnostics[0].reasonCode, "range-outside-delta-hunks");
  assert.equal(repo.admit([severe("src/changed.cs")]).diagnostics[0].reasonCode, "text-range-required");
});

test("rejects malformed, traversal, absolute, and multiple locations", () => {
  const repo = fixture();
  const cases = [
    [severe("src/changed.cs:0"), "location-malformed"],
    [severe("../src/changed.cs:2"), "path-traversal"],
    [severe("C:/repo/src/changed.cs:2"), "path-absolute"],
    [{ ...severe("src/changed.cs:2"), locations: ["src/changed.cs:2"] }, "location-ambiguous"],
  ];
  for (const [finding, reason] of cases) assert.equal(repo.admit([finding]).diagnostics[0].reasonCode, reason);
});

test("accepts exact whole-file binary/mode evidence and fails closed on ranges or renames", () => {
  const repo = fixture();
  assert.equal(repo.admit([severe("src/binary.bin")]).allowed, true);
  assert.equal(repo.admit([severe("src/mode.sh")]).allowed, true);
  assert.equal(repo.admit([severe("src/binary.bin:1")]).diagnostics[0].reasonCode, "range-unverifiable");
  assert.equal(repo.admit([severe("src/rename-new.cs")]).diagnostics[0].reasonCode, "rename-ambiguous");
});

test("passes non-blocking and non-candidate-causal findings unchanged", () => {
  const repo = fixture();
  const findings = [
    severe("src/unchanged.cs:1", { severity: "WARNING" }),
    severe("src/unchanged.cs:1", { causalDisposition: "pre-existing" }),
    severe("src/unchanged.cs:1", { causalDisposition: "base-only" }),
    severe("src/unchanged.cs:1", { causalDisposition: "unknown" }),
  ];
  assert.deepEqual(repo.admit(findings).rejectedFindingIndexes, []);
});

test("guards deterministic and inferential severe findings and exposes supersession capability", () => {
  const repo = fixture();
  for (const proofKind of ["deterministic", "inferential"]) {
    assert.equal(repo.admit([severe("src/unchanged.cs:1", { proofKind })]).allowed, false);
  }
  assert.equal(REVIEW_CAUSAL_ADMISSION_CAPABILITY.id, "flow.review-causal-admission");
  assert.match(REVIEW_CAUSAL_ADMISSION_CAPABILITY.version, /^1\./);
  assert.equal(REVIEW_CAUSAL_ADMISSION_CAPABILITY.supersedableByNative, true);
});

test("uses exact frozen refs and trees rather than unstaged workspace content", () => {
  const repo = fixture();
  fs.writeFileSync(path.join(repo.cwd, "src/unchanged.cs"), "locally changed\n");
  assert.equal(repo.admit([severe("src/unchanged.cs:1")]).allowed, false);
  assert.throws(() => repo.admit([], { candidateTree: repo.baseTree }), /candidateRef tree does not match/);
});
