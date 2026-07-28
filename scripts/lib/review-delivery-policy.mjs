import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { runFileSafe } from "./helpers.mjs";

export const REVIEW_DELIVERY_SCHEMA = "flow-review-delivery/v1";
export const REVIEW_LIFECYCLE_CONFIG = "flow.reviewLifecycle";
const LIFECYCLE_VALUES = new Set(["required", "optional", "disabled"]);
const BLOCKING_STATES = new Set(["ambiguous", "correction_required", "escalated", "invalidated"]);
const PENDING_STATES = new Map([["reviewing", "continue-review"], ["correction_required", "continue-correction"]]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortedPaths(values) {
  return [...new Set((values || []).map((value) => String(value || "").replace(/\\/g, "/").trim()).filter(Boolean))].sort();
}

function parseJsonOutput(result, label) {
  if (!result?.ok) throw new Error(`${label} failed; review authority cannot be determined.`);
  const output = result.stdout || result.output || "";
  if (!output.trim()) throw new Error(`${label} returned an empty response.`);
  try { return JSON.parse(output); } catch { throw new Error(`${label} returned an unsupported non-JSON response.`); }
}

function candidatePathsDigest(candidate) {
  const hash = createHash("sha256");
  hash.update("gentle-ai.paths/v1\0");
  for (const logicalPath of sortedPaths(candidate.paths)) {
    const value = Buffer.from(logicalPath);
    hash.update(`${value.length}\0`);
    hash.update(value);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function statusSnapshot(entry) {
  if (!entry?.path) throw new Error("Native review status entry omitted its structured authority path.");
  try {
    const record = JSON.parse(fs.readFileSync(path.join(entry.path, "review-state.json"), "utf8"));
    if (record?.schema !== "gentle-ai.review-state-record/v2" || record.revision !== entry.revision || record.state?.lineage_id !== entry.lineage_id) throw new Error("record identity mismatch");
    return record.state;
  } catch (error) {
    throw new Error(`Native review status entry '${entry.lineage_id || "unknown"}' has unreadable structured authority: ${error.message}`);
  }
}

function projectionMatches(snapshot, candidate) {
  return Boolean(snapshot)
    && snapshot.base_tree === candidate.baseTree
    && snapshot.candidate_tree === candidate.tree
    && snapshot.paths_digest === candidate.pathsDigest
    && JSON.stringify(sortedPaths(snapshot.paths)) === JSON.stringify(sortedPaths(candidate.paths));
}

function applicableStatuses(statusDocument, candidate, lineage) {
  if (statusDocument?.schema !== "gentle-ai.review-authority-status/v1" || statusDocument.complete !== true || statusDocument.authoritative !== true || !Array.isArray(statusDocument.entries)) {
    throw new Error("Native review status did not provide complete authoritative structured evidence.");
  }
  return statusDocument.entries.filter((entry) => (!lineage || entry?.lineage_id === lineage)
    && (projectionMatches(statusSnapshot(entry)?.initial_snapshot, candidate) || projectionMatches(statusSnapshot(entry)?.current_snapshot, candidate)));
}

function validationAuthority(document) {
  if (document?.schema !== "gentle-ai.review-gate-result/v1") throw new Error("Native review validation returned an unsupported structured schema.");
  const context = document.context || {};
  return {
    decision: String(document.result || "").toLowerCase(), allowed: document.allowed === true, action: String(document.action || "").toLowerCase(),
    lineage: context.lineage_id, revision: context.store_revision, baseTree: context.base_tree, candidateTree: context.candidate_tree, pathsDigest: context.paths_digest,
  };
}

function explicitConstraint(document) {
  const constraints = document?.deliveryConstraints || document?.delivery_constraints;
  if (!constraints) return null;
  const topology = String(constraints.topology || constraints.commitTopology || constraints.commit_topology || "").toLowerCase();
  const maxCommits = Number(constraints.maxCommits ?? constraints.max_commits);
  if (topology === "single" || topology === "single-reviewed-delivery" || maxCommits === 1) return { topology: "single", source: "structured-delivery-constraints" };
  if (topology === "grouped" || topology === "work-units" || maxCommits > 1) return { topology: "grouped", source: "structured-delivery-constraints" };
  throw new Error("Structured delivery constraints use an unsupported topology.");
}

export function resolveLifecycleMode(value) {
  const normalized = String(value || "optional").trim().toLowerCase();
  if (!LIFECYCLE_VALUES.has(normalized)) throw new Error(`${REVIEW_LIFECYCLE_CONFIG} must be required, optional, or disabled.`);
  return normalized;
}

export function normalizeRequestedLineage(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Review lineage must be an explicit non-empty string.");
  const lineage = value.trim();
  if (!lineage || /[\0\r\n]/.test(lineage)) throw new Error("Review lineage contains invalid characters.");
  return lineage;
}

export function resolveStructuredDeliveryPolicy({ lifecycle, candidate, status, validation, lineage = null, compatibilitySource = "pre-push-allow-compat-v1" }) {
  const mode = resolveLifecycleMode(lifecycle);
  const base = { schema: REVIEW_DELIVERY_SCHEMA, lifecycle: mode, topology: "grouped", constraintSource: "lifecycle-disabled", authority: null };
  if (mode === "disabled") return base;
  if (!validation) {
    if (mode === "optional" && status?.schema === "gentle-ai.review-authority-status/v1" && status.complete === true && status.authoritative === true && status.entries?.length === 0) {
      return { ...base, status: "no-applicable-authority", constraintSource: "no-applicable-authority", nextAction: "continue-without-review-authority" };
    }
    throw new Error(mode === "optional" ? "Optional review authority cannot be determined from structured status evidence." : "Review lifecycle authority is required but no applicable validation is available.");
  }
  const authority = validationAuthority(validation);
  const unsafe = BLOCKING_STATES.has(authority.action) ? authority.action : BLOCKING_STATES.has(authority.decision) ? authority.decision : null;
  if (unsafe || authority.decision !== "allow" || !authority.allowed || authority.action !== "continue") throw new Error(`Review authority is ${unsafe || "not allowed"}; delivery is blocked.`);
  if (!authority.lineage || !authority.revision || !authority.baseTree || !authority.candidateTree || !authority.pathsDigest) throw new Error("Native review validation omitted required structured authority fields.");
  if (lineage && authority.lineage !== lineage) throw new Error("Native review validation authority does not match the requested lineage.");
  if (authority.baseTree !== candidate.baseTree || authority.candidateTree !== candidate.tree || authority.pathsDigest !== candidate.pathsDigest) throw new Error("Native review validation authority does not match the exact candidate base, tree, and paths.");
  const entry = status.entries?.filter((item) => item?.lineage_id === authority.lineage) || [];
  if (entry.length !== 1 || String(entry[0].state || "").toLowerCase() !== "approved") throw new Error("Applicable review authority is not approved; delivery is blocked.");
  const explicit = explicitConstraint(validation);
  return { ...base, topology: explicit?.topology || "single", constraintSource: explicit?.source || compatibilitySource, authority: { lineage: authority.lineage, revision: authority.revision, baseTree: authority.baseTree, candidateTree: authority.candidateTree, paths: sortedPaths(candidate.paths), pathsDigest: authority.pathsDigest } };
}

function git(runner, cwd, args) {
  return runner("git", args, { cwd });
}

function gitValue(runner, cwd, args, label) {
  const result = git(runner, cwd, args);
  if (!result.ok || !result.stdout.trim()) throw new Error(`Could not resolve ${label}: ${result.output}`);
  return result.stdout.trim();
}

export function readLifecycleMode(cwd, runner = runFileSafe) {
  const result = git(runner, cwd, ["config", "--get", REVIEW_LIFECYCLE_CONFIG]);
  return resolveLifecycleMode(result.ok ? result.stdout : "optional");
}

function committedCandidate(cwd, baseRef, candidateRef, runner) {
  const baseTree = gitValue(runner, cwd, ["rev-parse", `${baseRef}^{tree}`], "publication candidate base tree");
  const tree = gitValue(runner, cwd, ["rev-parse", `${candidateRef}^{tree}`], "publication candidate tree");
  const pathsResult = git(runner, cwd, ["diff", "--name-only", "--no-renames", baseRef, candidateRef, "--"]);
  if (!pathsResult.ok) throw new Error(`Could not inspect publication candidate paths: ${pathsResult.output}`);
  const paths = sortedPaths(pathsResult.stdout.split("\n"));
  return { baseTree, tree, paths, pathsDigest: candidatePathsDigest({ paths }) };
}

export function resolvePublicationDeliveryPolicy({ cwd = process.cwd(), baseRef, candidateRef = "HEAD", gate = "pre-push", lineage = null, runner = runFileSafe } = {}) {
  lineage = normalizeRequestedLineage(lineage);
  const lifecycle = readLifecycleMode(cwd, runner);
  const candidate = committedCandidate(cwd, baseRef, candidateRef, runner);
  if (lifecycle === "disabled") return resolveStructuredDeliveryPolicy({ lifecycle, candidate });
  const statusResult = runner("gentle-ai", ["review", "status", "--cwd", cwd], { cwd });
  if (statusResult.error?.code === "ENOENT") {
    if (lifecycle === "optional") return { ...resolveStructuredDeliveryPolicy({ lifecycle: "disabled", candidate }), lifecycle, constraintSource: "cli-unavailable-optional" };
    throw new Error("Review lifecycle is required but the gentle-ai CLI is unavailable.");
  }
  const status = parseJsonOutput(statusResult, "Native review status");
  const applicable = applicableStatuses(status, candidate, lineage);
  if (applicable.length > 1) throw new Error("Native review status is ambiguous for the exact candidate projection; delivery is blocked.");
  if (applicable.length === 0 && lifecycle === "optional") return resolveStructuredDeliveryPolicy({ lifecycle, candidate, status: { ...status, entries: [] }, validation: null });
  if (applicable.length === 0) throw new Error("Review lifecycle authority is required but no authority applies to the exact candidate projection.");
  const state = String(applicable[0].state || applicable[0].status || "").toLowerCase();
  if (PENDING_STATES.has(state) || BLOCKING_STATES.has(state)) throw new Error(`Review authority is ${state}; delivery is blocked.`);
  const validation = parseJsonOutput(runner("gentle-ai", ["review", "validate", "--gate", gate, "--cwd", cwd, "--base-ref", baseRef, "--lineage", lineage || applicable[0].lineage_id], { cwd }), `Native ${gate} validation`);
  return resolveStructuredDeliveryPolicy({ lifecycle, candidate, status, validation, lineage, compatibilitySource: `${gate}-allow-compat-v1` });
}

export function deliveryPlanId(policy, extra = {}) {
  return sha256(JSON.stringify({ schema: REVIEW_DELIVERY_SCHEMA, policy, ...extra }));
}

export function deliveryAuthorityId(policy) {
  return sha256(JSON.stringify({ schema: REVIEW_DELIVERY_SCHEMA, lifecycle: policy?.lifecycle, topology: policy?.topology, authority: policy?.authority }));
}
