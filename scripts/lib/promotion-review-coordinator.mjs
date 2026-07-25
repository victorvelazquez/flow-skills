import { createHash } from "node:crypto";

export const PROMOTION_REVIEW_COORDINATOR_SCHEMA = "flow-pr-promotion-coordinator/v2";

const STATUS_SCHEMA = "gentle-ai.review-integration.status/v1";
const CONTRACT = "gentle-ai.review-integration/v1";
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATES = new Set([
  "reviewing", "correction_required", "validating", "approved",
  "invalidated", "escalated", "scope_changed",
]);
const ACTIONS = new Set([
  "start", "finalize", "validate", "recover", "maintainer_action",
  "select_lineage", "repair_authority", "stop",
]);
const APPLICABILITY = new Set(["current_target", "unrelated", "ambiguous", "corrupted"]);
const RECEIPTS = new Set(["expected_missing", "present", "publication_pending", "not_applicable"]);
const REPLAYABILITY = new Set(["not_replayable", "exact_replay_safe", "status_required", "manual_action_required"]);
export const CANONICAL_REVIEW_LENSES = [
  "review-risk", "review-resilience", "review-readability", "review-reliability",
];

export function validNativeLensSelection(riskTier, lenses) {
  if (!Array.isArray(lenses)) return false;
  if (riskTier === "low") return lenses.length === 0;
  if (riskTier === "medium") return lenses.length === 1 && CANONICAL_REVIEW_LENSES.includes(lenses[0]);
  if (riskTier === "high") return JSON.stringify(lenses) === JSON.stringify(CANONICAL_REVIEW_LENSES);
  return false;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function stop(base, state, reasonCode) {
  return { ...base, state, nextAction: { type: "stop", reasonCode } };
}

function executionKey(identity, lineage, authorityRevision, lens) {
  return digest([
    PROMOTION_REVIEW_COORDINATOR_SCHEMA, identity.repositoryFingerprint,
    identity.promotionFingerprint, identity.targetIdentity, lineage,
    authorityRevision, identity.nativeCapabilityIdentity, lens,
  ]);
}

function validIdentity(identity) {
  return Object.values(identity).every((value) => SHA256.test(String(value || "")));
}

function validateResults(lenses, records, identity, lineage, authorityRevision) {
  if (!Array.isArray(lenses) || !Array.isArray(records)
    || lenses.length > 4 || records.length > 4
    || lenses.some((lens) => typeof lens !== "string" || lens.length > 100 || !NAME.test(lens))
    || new Set(lenses).size !== lenses.length) return null;
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    if (!record || record.lens !== lenses[index] || seen.has(record.lens)
      || record.executionKey !== executionKey(identity, lineage, authorityRevision, record.lens)
      || !SHA256.test(String(record.digest || ""))) return null;
    seen.add(record.lens);
  }
  return { seen, digests: records.map(({ lens, digest: resultDigest }) => ({ lens, digest: resultDigest })) };
}

function recordedActions(ledger) {
  if (ledger == null) return new Set();
  const completed = ledger?.completed;
  const inFlight = ledger?.inFlight;
  if (!Array.isArray(completed) || !Array.isArray(inFlight)
    || completed.length > 100 || inFlight.length > 100) return null;
  const keys = [...completed, ...inFlight];
  if (keys.some((key) => !SHA256.test(String(key || ""))) || new Set(keys).size !== keys.length) return null;
  return new Set(keys);
}

export function coordinatePromotionReview(input = {}) {
  const status = input.status;
  const nativeAuthority = status?.authority;
  const identity = {
    repositoryFingerprint: input.repositoryFingerprint,
    promotionFingerprint: input.promotionFingerprint,
    targetIdentity: input.targetIdentity,
    nativeCapabilityIdentity: input.nativeCapabilityIdentity,
  };
  const lineage = input.lineage ?? nativeAuthority?.lineage_id ?? null;
  const authorityRevision = input.authorityRevision ?? nativeAuthority?.revision ?? null;
  const coordinatorFingerprint = digest([
    PROMOTION_REVIEW_COORDINATOR_SCHEMA, identity.repositoryFingerprint,
    identity.promotionFingerprint, identity.targetIdentity, lineage,
    authorityRevision, identity.nativeCapabilityIdentity,
  ]);
  const base = {
    schema: PROMOTION_REVIEW_COORDINATOR_SCHEMA,
    coordinatorFingerprint,
    admissionResult: input.admissionResult ?? null,
  };
  const started = input.lineage != null || input.authorityRevision != null;
  if (!validIdentity(identity)) return stop(base, "scope_changed", "promotion-identity-malformed");
  const actionKeys = recordedActions(input.actionLedger);
  if (!actionKeys) return stop(base, "scope_changed", "action-ledger-malformed");
  if (!status || status.schema !== STATUS_SCHEMA || status.contract !== CONTRACT
    || status.operation !== "review.status" || !ACTIONS.has(status.action)
    || !APPLICABILITY.has(status.applicability) || !RECEIPTS.has(status.receipt?.status)
    || !REPLAYABILITY.has(status.replayability) || !SHA256.test(String(status.target_identity || ""))
    || !Array.isArray(status.candidates) || !status.projection || typeof status.projection !== "object") {
    return stop(base, "scope_changed", started ? "status-missing-after-start" : "status-malformed");
  }
  if (status.applicability === "ambiguous" || status.applicability === "corrupted") {
    return stop(base, "scope_changed", `status-${status.applicability}`);
  }
  if (status.applicability === "unrelated") {
    if (started) return stop(base, "scope_changed", "authority-no-longer-applicable");
    if (status.action !== "start") return stop(base, "scope_changed", "no-authority-action-unsupported");
    if (!NAME.test(String(input.intendedLineage || ""))) return stop(base, "no_authority", "intended-lineage-missing");
    const startKey = digest([PROMOTION_REVIEW_COORDINATOR_SCHEMA, "start", coordinatorFingerprint, input.intendedLineage]);
    return actionKeys.has(startKey)
      ? { ...base, state: "no_authority", nextAction: { type: "await_status", executionKey: startKey } }
      : { ...base, state: "no_authority", nextAction: { type: "start_review", executionKey: startKey } };
  }
  if (status.applicability !== "current_target" || !nativeAuthority
    || !SHA256.test(String(nativeAuthority.revision || ""))
    || typeof nativeAuthority.lineage_id !== "string" || !NAME.test(nativeAuthority.lineage_id)
    || !["compact-v2", "legacy-v1"].includes(nativeAuthority.version)
    || !Number.isInteger(nativeAuthority.generation) || nativeAuthority.generation < 1) {
    return stop(base, "scope_changed", "status-malformed");
  }
  if (!validNativeLensSelection(status.frozen?.tier, status.selected_lenses)
    || JSON.stringify(input.lenses) !== JSON.stringify(status.selected_lenses)) {
    return stop(base, "scope_changed", "native-risk-lens-mismatch");
  }
  if (status.target_identity !== identity.targetIdentity
    || (input.lineage != null && nativeAuthority.lineage_id !== input.lineage)
    || (input.authorityRevision != null && nativeAuthority.revision !== input.authorityRevision)) {
    return stop(base, "scope_changed", "frozen-authority-mismatch");
  }
  const state = String(nativeAuthority.state || "").toLowerCase();
  if (!STATES.has(state)) return stop(base, "scope_changed", "status-state-unknown");
  if (state === "scope_changed") return stop(base, state, "native-scope-changed");
  if (state === "correction_required") return { ...base, state, nextAction: { type: "request_bounded_correction" } };
  if (state === "escalated") return { ...base, state, nextAction: { type: "maintainer_action" } };
  if (state === "invalidated") return status.action === "recover"
    ? { ...base, state, nextAction: { type: "recover" } }
    : stop(base, state, "native-recovery-not-allowed");
  if (state === "approved") {
    if (status.receipt.status === "present") {
      return { ...base, state, nextAction: { type: "validate_receipt" } };
    }
    return status.replayability === "exact_replay_safe"
      ? { ...base, state, nextAction: { type: "replay_receipt" } }
      : stop(base, state, "approved-receipt-missing");
  }
  if (state === "validating") {
    if (status.action === "validate") return { ...base, state, nextAction: { type: "collect_evidence" } };
    if (status.action === "finalize" && input.admissionResult != null && input.admissionResult.allowed !== true) {
      return stop(base, state, "causal-admission-failed");
    }
    return status.action === "finalize"
      ? { ...base, state, nextAction: { type: "finalize_review" } }
      : stop(base, state, "validating-action-unsupported");
  }

  const results = validateResults(input.lenses ?? [], input.lensResults ?? [], identity, lineage, authorityRevision);
  if (!results) return stop(base, state, "lens-results-malformed");
  const missing = input.lenses.find((lens) => !results.seen.has(lens));
  if (missing) return {
    ...base, state,
    nextAction: { type: "delegate_lens", lens: missing, executionKey: executionKey(identity, lineage, authorityRevision, missing) },
  };
  if (input.admissionResult != null && input.admissionResult.allowed !== true) {
    return stop(base, state, "causal-admission-failed");
  }
  return status.action === "finalize"
    ? { ...base, state, nextAction: { type: "finalize_review", resultDigests: results.digests } }
    : stop(base, state, "reviewing-action-unsupported");
}
