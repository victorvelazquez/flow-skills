import { execFileSync } from "node:child_process";
import path from "node:path";

export const REVIEW_CAUSAL_ADMISSION_CAPABILITY = Object.freeze({
  id: "flow.review-causal-admission",
  version: "1.0.0",
  supersedableByNative: true,
});

const BLOCKING = new Set(["BLOCKER", "CRITICAL"]);
const CANDIDATE_CAUSAL = new Set(["introduced", "behavior-activated", "worsened"]);
const MAX_REJECTIONS = 100;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function assertObjectId(value, label) {
  if (!/^[0-9a-f]{40,64}$/.test(String(value || ""))) {
    throw new Error(`${label} must be an exact immutable Git object ID.`);
  }
}

function canonicalPath(value) {
  const file = String(value || "");
  if (!file || file !== file.trim() || /[\\\0\r\n]/.test(file)) return { reason: "path-noncanonical" };
  if (file.startsWith("/") || /^[A-Za-z]:\//.test(file)) return { reason: "path-absolute" };
  const parts = file.split("/");
  if (parts.includes("..")) return { reason: "path-traversal" };
  if (parts.includes("") || parts.includes(".") || path.posix.normalize(file) !== file) {
    return { reason: "path-noncanonical" };
  }
  return { path: file };
}

function parseLocation(finding) {
  if (Array.isArray(finding?.location) || Object.hasOwn(finding || {}, "locations")) {
    return { reason: "location-ambiguous" };
  }
  const value = finding?.location;
  if (typeof value !== "string" || !value) return { reason: "location-missing" };
  const match = value.match(/^(.+):([1-9]\d*)(?:-([1-9]\d*))?$/);
  let file = value;
  let start = null;
  let end = null;
  if (match) {
    [, file] = match;
    start = Number(match[2]);
    end = Number(match[3] || match[2]);
    if (end < start) return { reason: "location-malformed" };
  } else if (/:/.test(value)) {
    return /^[A-Za-z]:\//.test(value) ? { reason: "path-absolute" } : { reason: "location-malformed" };
  }
  const canonical = canonicalPath(file);
  return canonical.reason ? canonical : { ...canonical, start, end };
}

function parseDelta(cwd, baseTree, candidateTree) {
  const tokens = git(cwd, ["diff", "--name-status", "-z", "-M", baseTree, candidateTree]).split("\0");
  const delta = new Map();
  for (let index = 0; index < tokens.length;) {
    let status = tokens[index++];
    if (!status) continue;
    let first;
    if (status.includes("\t")) [status, first] = status.split("\t", 2);
    first ||= tokens[index++];
    if (/^[RC]/.test(status)) {
      const second = tokens[index++];
      delta.set(first, { status, ambiguous: true });
      delta.set(second, { status, ambiguous: true });
    } else {
      delta.set(first, { status });
    }
  }
  return delta;
}

function fileEvidence(cwd, baseTree, candidateTree, file, change) {
  if (change.ambiguous) return { kind: "ambiguous" };
  const numstat = git(cwd, ["--literal-pathspecs", "diff", "--numstat", "--no-renames", baseTree, candidateTree, "--", file]);
  if (/^-\t-\t/.test(numstat)) return { kind: "binary" };
  const summary = git(cwd, ["--literal-pathspecs", "diff", "--summary", "--no-renames", baseTree, candidateTree, "--", file]);
  if (/mode change|old mode|new mode/.test(summary) || change.status === "T") return { kind: "mode" };
  const patch = git(cwd, ["--literal-pathspecs", "diff", "--no-ext-diff", "--no-renames", "--unified=0", baseTree, candidateTree, "--", file]);
  const hunks = [...patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map((match) => ({
    oldStart: Number(match[1]), oldCount: Number(match[2] ?? 1),
    newStart: Number(match[3]), newCount: Number(match[4] ?? 1),
  }));
  return { kind: change.status === "A" ? "add" : change.status === "D" ? "delete" : "text", hunks };
}

function intersects(start, end, hunkStart, count) {
  return count > 0 && start <= hunkStart + count - 1 && end >= hunkStart;
}

function reasonForFinding(location, genesis, change, evidence) {
  if (location.reason) return location.reason;
  if (!genesis.has(location.path)) return "path-outside-genesis";
  if (!change) return "path-outside-git-delta";
  if (evidence.kind === "ambiguous") return "rename-ambiguous";
  if (location.start == null) return ["add", "delete", "binary", "mode"].includes(evidence.kind)
    ? null : "text-range-required";
  if (["binary", "mode"].includes(evidence.kind)) return "range-unverifiable";
  if (["add", "delete", "text"].includes(evidence.kind)) {
    const side = evidence.kind === "delete" ? "old" : evidence.kind === "add" ? "new" : "both";
    const hunks = evidence.hunks;
    if (hunks?.some((h) => (side !== "new" && intersects(location.start, location.end, h.oldStart, h.oldCount))
      || (side !== "old" && intersects(location.start, location.end, h.newStart, h.newCount)))) return null;
  }
  return "range-outside-delta-hunks";
}

function recommendation(reason) {
  if (reason === "path-outside-genesis" || reason === "path-outside-git-delta") return "pre-existing";
  if (reason === "range-outside-delta-hunks") return "base-only";
  return "unknown";
}

function bounded(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value : typeof value === "string" ? value.slice(0, 300) : null;
}

export function admitReviewFindings({ cwd, baseRef, candidateRef, baseTree, candidateTree, genesisPaths, findings }) {
  for (const [value, label] of [[baseRef, "baseRef"], [candidateRef, "candidateRef"], [baseTree, "baseTree"], [candidateTree, "candidateTree"]]) {
    assertObjectId(value, label);
  }
  if (git(cwd, ["rev-parse", `${baseRef}^{tree}`]).trim() !== baseTree) throw new Error("baseRef tree does not match frozen baseTree.");
  if (git(cwd, ["rev-parse", `${candidateRef}^{tree}`]).trim() !== candidateTree) throw new Error("candidateRef tree does not match frozen candidateTree.");
  const genesis = new Set((genesisPaths || []).map((file) => {
    const parsed = canonicalPath(file);
    if (parsed.reason) throw new Error(`Frozen genesis path is invalid: ${file}`);
    return parsed.path;
  }));
  const delta = parseDelta(cwd, baseTree, candidateTree);
  const evidence = new Map();
  const diagnostics = [];
  let rejectedCount = 0;
  for (const [index, finding] of (findings || []).entries()) {
    const severity = String(finding?.severity || "").toUpperCase();
    const disposition = String(finding?.causalDisposition ?? finding?.causal_disposition ?? finding?.disposition ?? "").toLowerCase();
    if (!BLOCKING.has(severity) || !CANDIDATE_CAUSAL.has(disposition)) continue;
    const location = parseLocation(finding);
    const change = location.path ? delta.get(location.path) : null;
    if (change && !evidence.has(location.path)) evidence.set(location.path, fileEvidence(cwd, baseTree, candidateTree, location.path, change));
    const reasonCode = reasonForFinding(location, genesis, change, evidence.get(location.path));
    if (reasonCode) {
      rejectedCount++;
      if (diagnostics.length < MAX_REJECTIONS) diagnostics.push({
        index, id: bounded(finding?.id), reasonCode, location: bounded(finding?.location),
        diagnostic: `Finding at index ${index} is not proven candidate-causal: ${reasonCode}.`,
        recommendedDisposition: recommendation(reasonCode),
      });
    }
  }
  return {
    capability: REVIEW_CAUSAL_ADMISSION_CAPABILITY,
    allowed: diagnostics.length === 0,
    rejectedFindingIndexes: diagnostics.map((item) => item.index),
    rejectedFindingIds: diagnostics.map((item) => item.id).filter((id) => id != null),
    rejectedFindingCount: rejectedCount,
    diagnostics,
    truncated: rejectedCount > diagnostics.length,
  };
}
