import assert from "node:assert/strict";
import test from "node:test";

import {
  coordinatePromotionReview,
  PROMOTION_REVIEW_COORDINATOR_SCHEMA,
} from "../scripts/lib/promotion-review-coordinator.mjs";

const sha = (value) => `sha256:${String(value).padStart(64, "0")}`;
const identity = {
  repositoryFingerprint: sha(1), promotionFingerprint: sha(2),
  targetIdentity: sha(3), nativeCapabilityIdentity: sha(4),
};
const authority = { version: "compact-v2", lineage_id: "review-one", state: "reviewing", generation: 1, revision: sha(5) };
const status = (state, overrides = {}) => ({
  schema: "gentle-ai.review-integration.status/v1",
  contract: "gentle-ai.review-integration/v1", operation: "review.status",
  applicability: "current_target", authority: { ...authority, state },
  receipt: { status: "expected_missing" }, action: "finalize",
  replayability: "not_replayable", target_identity: identity.targetIdentity,
  frozen: { tier: "low" }, selected_lenses: [], projection: {}, candidates: [], ...overrides,
});
const lensStatus = (lenses, tier = lenses.length === 4 ? "high" : "medium") =>
  status("reviewing", { frozen: { tier }, selected_lenses: lenses });
const run = (nativeStatus, extra = {}) => coordinatePromotionReview({
  ...identity, status: nativeStatus, lenses: [], lensResults: [], ...extra,
});

test("maps every lifecycle state to exactly one bounded next action", () => {
  const cases = [
    [status("reviewing"), {}, "reviewing", "finalize_review"],
    [status("correction_required"), {}, "correction_required", "request_bounded_correction"],
    [status("validating", { action: "validate" }), {}, "validating", "collect_evidence"],
    [status("validating"), {}, "validating", "finalize_review"],
    [status("approved", { receipt: { status: "present" }, action: "validate" }), {}, "approved", "validate_receipt"],
    [status("approved"), {}, "approved", "stop"],
    [status("approved", { replayability: "exact_replay_safe" }), {}, "approved", "replay_receipt"],
    [status("invalidated", { action: "recover" }), {}, "invalidated", "recover"],
    [status("invalidated", { action: "stop" }), {}, "invalidated", "stop"],
    [status("escalated", { action: "maintainer_action" }), {}, "escalated", "maintainer_action"],
    [status("scope_changed", { action: "stop" }), {}, "scope_changed", "stop"],
  ];
  for (const [native, extra, state, action] of cases) {
    const result = run(native, extra);
    assert.equal(result.schema, PROMOTION_REVIEW_COORDINATOR_SCHEMA);
    assert.equal(result.state, state);
    assert.equal(result.nextAction.type, action);
    assert.equal(Object.hasOwn(result, "nextActions"), false);
    assert.ok(Object.keys(result.nextAction).length <= 4);
  }
});

test("starts only from explicit no-authority status and never from gates", () => {
  const none = status("reviewing", {
    applicability: "unrelated", authority: undefined, action: "start",
    receipt: { status: "not_applicable" }, replayability: "status_required",
  });
  const first = run(none, { intendedLineage: "promotion-one" });
  assert.equal(first.nextAction.type, "start_review");
  assert.match(first.nextAction.executionKey, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.state, "no_authority");
  for (const native of [none, null]) {
    const result = run(native, { lineage: "review-one", authorityRevision: sha(5) });
    assert.equal(result.state, "scope_changed");
    assert.equal(result.nextAction.type, "stop");
  }
});

test("start execution key is deterministic and a persisted ledger prevents replay", () => {
  const none = status("reviewing", {
    applicability: "unrelated", authority: undefined, action: "start",
    receipt: { status: "not_applicable" }, replayability: "status_required",
  });
  const first = run(none, { intendedLineage: "promotion-one" });
  assert.equal(run(none, { intendedLineage: "promotion-one" }).nextAction.executionKey, first.nextAction.executionKey);
  for (const field of ["completed", "inFlight"]) {
    const replay = run(none, { intendedLineage: "promotion-one", actionLedger: { completed: [], inFlight: [], [field]: [first.nextAction.executionKey] } });
    assert.deepEqual(replay.nextAction, { type: "await_status", executionKey: first.nextAction.executionKey });
  }
  assert.notEqual(run(none, { intendedLineage: "promotion-two" }).nextAction.executionKey, first.nextAction.executionKey);
});

test("delegates lenses in native order with stable execution keys and deduplicates results", () => {
  const lenses = ["review-risk", "review-resilience", "review-readability", "review-reliability"];
  const first = run(lensStatus(lenses), { lenses });
  assert.equal(first.nextAction.type, "delegate_lens");
  assert.equal(first.nextAction.lens, lenses[0]);
  const result = { lens: lenses[0], executionKey: first.nextAction.executionKey, digest: sha(7) };
  const second = run(lensStatus(lenses), { lenses, lensResults: [result] });
  assert.equal(second.nextAction.lens, lenses[1]);
  assert.notEqual(second.nextAction.executionKey, first.nextAction.executionKey);
  assert.equal(run(lensStatus(lenses), { lenses, lensResults: [result, result] }).nextAction.reasonCode, "lens-results-malformed");
  assert.equal(run(lensStatus(lenses), { lenses, lensResults: [{ ...result, lens: "unknown" }] }).nextAction.type, "stop");
  assert.equal(run(lensStatus(lenses), { lenses, lensResults: [{ ...result, executionKey: sha(9) }] }).nextAction.reasonCode, "lens-results-malformed");
});

test("rejects a reversed complete set and a later lens without its prefix", () => {
  const lenses = ["review-risk", "review-resilience", "review-readability", "review-reliability"];
  const firstAction = run(lensStatus(lenses), { lenses }).nextAction;
  const first = { lens: lenses[0], executionKey: firstAction.executionKey, digest: sha(7) };
  const secondAction = run(lensStatus(lenses), { lenses, lensResults: [first] }).nextAction;
  const second = { lens: lenses[1], executionKey: secondAction.executionKey, digest: sha(8) };
  for (const lensResults of [[second, first], [second]]) {
    const result = run(lensStatus(lenses), { lenses, lensResults });
    assert.equal(result.nextAction.type, "stop");
    assert.equal(result.nextAction.reasonCode, "lens-results-malformed");
  }
});

test("finalize requires all digests and permits the Slice 1 admission boundary", () => {
  const lenses = ["review-risk"];
  const delegated = run(lensStatus(lenses), { lenses });
  const lensResults = [{ lens: lenses[0], executionKey: delegated.nextAction.executionKey, digest: sha(8) }];
  assert.equal(run(lensStatus(lenses), { lenses, lensResults }).nextAction.type, "finalize_review");
  const blocked = run(lensStatus(lenses), { lenses, lensResults, admissionResult: { allowed: false, diagnostics: [{ reasonCode: "path-outside-genesis" }] } });
  assert.equal(blocked.nextAction.type, "stop");
  assert.equal(blocked.nextAction.reasonCode, "causal-admission-failed");
  assert.equal(blocked.admissionResult.allowed, false);
  assert.equal(run(status("validating"), { admissionResult: { allowed: false } }).nextAction.reasonCode, "causal-admission-failed");
});

test("lens results cannot cross authority revisions or native capabilities", () => {
  const lenses = ["review-risk"];
  const delegated = run(lensStatus(lenses), { lenses });
  const lensResults = [{ lens: lenses[0], executionKey: delegated.nextAction.executionKey, digest: sha(8) }];
  const changedRevision = lensStatus(lenses); changedRevision.authority = { ...authority, revision: sha(6) };
  assert.equal(run(changedRevision, { lenses, lensResults, authorityRevision: sha(6) }).nextAction.reasonCode, "lens-results-malformed");
  assert.equal(run(lensStatus(lenses), { lenses, lensResults, nativeCapabilityIdentity: sha(9) }).nextAction.reasonCode, "lens-results-malformed");
});

test("malformed ambiguous unknown and identity-drift status fail closed", () => {
  const inputs = [
    null,
    { ...status("reviewing"), applicability: "ambiguous", authority: undefined, candidates: ["a", "b"] },
    status("future_state"),
    status("reviewing", { target_identity: sha(9) }),
    status("reviewing", { authority: { ...authority, lineage_id: "other" } }),
  ];
  for (const native of inputs) {
    const result = run(native, { lineage: "review-one", authorityRevision: sha(5) });
    assert.equal(result.nextAction.type, "stop");
    assert.ok(result.nextAction.reasonCode);
    assert.notEqual(result.nextAction.type, "retry");
  }
});

test("coordinator fingerprint is deterministic and binds every frozen identity field", () => {
  const input = status("reviewing");
  const baseline = run(input).coordinatorFingerprint;
  assert.equal(run(structuredClone(input)).coordinatorFingerprint, baseline);
  for (const key of Object.keys(identity)) {
    assert.notEqual(run(input, { [key]: sha(9) }).coordinatorFingerprint, baseline, key);
  }
  assert.notEqual(run(input, { lineage: "review-two" }).coordinatorFingerprint, baseline);
  assert.notEqual(run(input, { authorityRevision: sha(9) }).coordinatorFingerprint, baseline);
});
