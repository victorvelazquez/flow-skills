import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadDeliveryConfig } from "../scripts/lib/flow-delivery-config.mjs";
import { buildManagedPrBody, mergePrBody } from "../scripts/lib/flow-pr-body.mjs";
import { assertManagedLabelCardinality, buildLabelPlan, labelsForDelivery, normalizeLabelNames } from "../scripts/lib/flow-pr-labels.mjs";
import { buildExactTagPushArgs, buildGhPrCreateArgs } from "../scripts/lib/flow-pr-prs.mjs";

test("delivery config merges additively and cannot unprotect production", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-delivery-config-"));
  const globalPath = path.join(root, "global.json");
  const projectPath = path.join(root, "project.json");
  fs.writeFileSync(globalPath, JSON.stringify({ chain: { reviewBudget: 250 } }));
  fs.writeFileSync(projectPath, JSON.stringify({ labels: { createMissing: false } }));
  const config = loadDeliveryConfig({ cwd: root, globalPath, projectPath });
  assert.equal(config.chain.reviewBudget, 250);
  assert.equal(config.labels.createMissing, false);
  fs.writeFileSync(projectPath, JSON.stringify({ branches: { protected: ["development"] } }));
  assert.throws(() => loadDeliveryConfig({ cwd: root, globalPath, projectPath }), /cannot unprotect production/);
});

test("managed PR body updates preserve reviewer-owned content", () => {
  const first = buildManagedPrBody({ summary: "Initial", changes: ["- one"] });
  const existing = mergePrBody("Reviewer note", first);
  const next = buildManagedPrBody({ summary: "Updated", changes: ["- two"] });
  const merged = mergePrBody(existing, next);
  assert.match(merged, /Updated/);
  assert.match(merged, /Reviewer note/);
  assert.doesNotMatch(merged, /Initial/);
});

test("managed labels and PR argv remain explicit and bounded", () => {
  const desired = labelsForDelivery({ prefix: "feat" });
  const plan = buildLabelPlan([{ name: "human:keep" }, { name: "type:bug" }, { name: "release:hotfix" }], desired, desired);
  assert.deepEqual(plan.preserved, ["human:keep", "release:hotfix"]);
  assert.deepEqual(plan.remove, ["type:bug"]);
  assertManagedLabelCardinality([{ name: "type:feature" }, { name: "human:keep" }], desired);
  assert.deepEqual(normalizeLabelNames([{ id: "1", name: "type:feature", color: "fff" }, "human:keep", {}]), ["type:feature", "human:keep"]);
  assert.throws(() => buildLabelPlan([], desired, []), /create it explicitly/);
  for (const [type, expected] of Object.entries({ feat: "feature", fix: "bug", docs: "docs", refactor: "refactor", chore: "chore", style: "chore", perf: "feature", test: "chore", build: "chore", ci: "chore", revert: "bug" })) {
    assert.deepEqual(labelsForDelivery({ commitType: type }), [`type:${expected}`]);
  }
  assert.deepEqual(labelsForDelivery({ prefix: "feat", breaking: true }), ["type:breaking-change"]);
  assert.deepEqual(buildGhPrCreateArgs("development", "feat: example", "feat/example"), ["pr", "create", "--base", "development", "--head", "feat/example", "--title", "feat: example", "--body-file", "-"]);
  assert.deepEqual(buildExactTagPushArgs("v1.2.3"), ["push", "origin", "refs/tags/v1.2.3"]);
  assert.throws(() => buildExactTagPushArgs("latest"), /valid release tag/);
});
