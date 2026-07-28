import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { deliveryAuthorityId, deliveryPlanId, resolvePublicationDeliveryPolicy } from "../scripts/lib/review-delivery-policy.mjs";
import { runFileSafe } from "../scripts/lib/helpers.mjs";
import { nativePathsDigest } from "./helpers/native-paths-digest.mjs";

function repo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-publication-policy-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git(["init", "-q", "-b", "main"]); git(["config", "user.email", "flow@example.test"]); git(["config", "user.name", "Flow Test"]);
  git(["config", "flow.reviewLifecycle", "optional"]); fs.writeFileSync(path.join(cwd, "change.txt"), "base\n"); git(["add", "."]); git(["commit", "-qm", "chore: base"]);
  git(["checkout", "-qb", "feat/candidate"]); fs.writeFileSync(path.join(cwd, "change.txt"), "candidate\n"); git(["commit", "-qam", "feat: candidate"]);
  return { cwd, git };
}

function approvedEntry(item) {
  const lineage = "publication";
  const entryPath = path.join(item.cwd, ".review-fixtures", lineage);
  const paths = ["change.txt"];
  const snapshot = { base_tree: item.git(["rev-parse", "main^{tree}"]), candidate_tree: item.git(["rev-parse", "HEAD^{tree}"]), paths, paths_digest: nativePathsDigest(paths) };
  fs.mkdirSync(entryPath, { recursive: true });
  fs.writeFileSync(path.join(entryPath, "review-state.json"), JSON.stringify({ schema: "gentle-ai.review-state-record/v2", revision: "sha256:publication", state: { schema: "gentle-ai.review-state/v2", lineage_id: lineage, state: "approved", initial_snapshot: snapshot } }));
  return { lineage_id: lineage, status: "approved", state: "approved", revision: "sha256:publication", path: entryPath, snapshot };
}

test("publication policy preserves its public resolution and identity exports", () => {
  const item = repo();
  const entry = approvedEntry(item);
  const runner = (command, args, options) => {
    if (command !== "gentle-ai") return runFileSafe(command, args, options);
    if (args[1] === "status") {
      const stdout = JSON.stringify({ schema: "gentle-ai.review-authority-status/v1", complete: true, authoritative: true, entries: [entry] });
      return { ok: true, stdout, output: stdout };
    }
    const stdout = JSON.stringify({ schema: "gentle-ai.review-gate-result/v1", result: "allow", allowed: true, action: "continue", context: { lineage_id: entry.lineage_id, store_revision: entry.revision, base_tree: entry.snapshot.base_tree, candidate_tree: entry.snapshot.candidate_tree, paths_digest: entry.snapshot.paths_digest } });
    return { ok: true, stdout, output: stdout };
  };
  const policy = resolvePublicationDeliveryPolicy({ cwd: item.cwd, baseRef: "main", runner });
  assert.equal(policy.authority.lineage, "publication");
  assert.match(deliveryPlanId(policy), /^[a-f0-9]{64}$/);
  assert.match(deliveryAuthorityId(policy), /^[a-f0-9]{64}$/);
});

test("optional publication continues when no matching authority exists", () => {
  const item = repo();
  const runner = (command, args, options) => command === "gentle-ai"
    ? { ok: true, stdout: JSON.stringify({ schema: "gentle-ai.review-authority-status/v1", complete: true, authoritative: true, entries: [] }), output: "status" }
    : runFileSafe(command, args, options);
  const policy = resolvePublicationDeliveryPolicy({ cwd: item.cwd, baseRef: "main", runner });
  assert.equal(policy.status, "no-applicable-authority");
});

test("commit-only policy APIs are removed while publication exports remain", () => {
  const source = fs.readFileSync(new URL("../scripts/lib/review-delivery-policy.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /export function (?:resolveCommitDeliveryPolicy|validateRealStagedDelivery|buildStagedCandidate|disposeStagedCandidate)/);
  for (const name of ["resolvePublicationDeliveryPolicy", "deliveryPlanId", "deliveryAuthorityId"]) assert.match(source, new RegExp(`export function ${name}`));
});
