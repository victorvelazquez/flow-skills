import { createHash } from "node:crypto";

export const DRAFT_SCHEMA = "flow-debt-draft/v1";
export const MAX_PREVIEW_DRAFTS = 8;

const priorities = new Set(["p0", "p1", "p2", "p3"]);
const severities = new Set(["critical", "high", "medium", "low"]);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function exact(value, keys, label) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).sort().join(",") !== keys.sort().join(",")
  ) {
    fail("invalid_shape", `${label} has unknown or missing fields`);
  }
}

function text(value, label, max = 2048) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    fail("invalid_input", `${label} is unsafe`);
  }
  const normalized = value.trim();
  if (!normalized) fail("invalid_input", `${label} is empty`);
  return normalized;
}

function list(value, label, check) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    fail("invalid_input", `${label} must be a bounded array`);
  }
  const normalized = value.map((entry) => {
    const result = text(entry, label);
    if (check && !check(result)) fail("invalid_input", `${label} is invalid`);
    return result;
  });
  normalized.sort();
  if (new Set(normalized).size !== normalized.length) {
    fail("invalid_input", `${label} contains duplicates`);
  }
  return normalized;
}

function scopePath(value) {
  return (
    !value.startsWith("/") &&
    !/^[A-Za-z]:/.test(value) &&
    !value.includes("\\") &&
    /^[A-Za-z0-9._/-]+$/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

export function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function normalizeDraft(value) {
  exact(
    value,
    [
      "schema",
      "title",
      "problem",
      "priority",
      "severity",
      "scope",
      "acceptanceCriteria",
      "verification",
      "producer",
      "evidence",
    ],
    "draft",
  );
  if (value.schema !== DRAFT_SCHEMA) {
    fail("invalid_schema", "unsupported draft schema");
  }

  const title = text(value.title, "title");
  if (!slug(title)) fail("invalid_input", "title has no ASCII slug");
  const priority = text(value.priority, "priority");
  const severity = text(value.severity, "severity");
  if (!priorities.has(priority) || !severities.has(severity)) {
    fail("invalid_input", "priority or severity is invalid");
  }

  exact(value.producer, ["kind", "reference"], "producer");
  const kind = text(value.producer.kind, "producer kind", 48);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(kind)) {
    fail("invalid_input", "producer kind is invalid");
  }

  if (
    !Array.isArray(value.evidence) ||
    !value.evidence.length ||
    value.evidence.length > 32
  ) {
    fail("invalid_input", "evidence must be a bounded array");
  }
  const evidence = value.evidence
    .map((entry) => {
      exact(entry, ["reference", "summary"], "evidence");
      return {
        reference: text(entry.reference, "evidence reference"),
        summary: text(entry.summary, "evidence summary"),
      };
    })
    .sort((left, right) => {
      const a = json(left);
      const b = json(right);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  if (new Set(evidence.map(json)).size !== evidence.length) {
    fail("invalid_input", "evidence contains duplicates");
  }

  return {
    schema: DRAFT_SCHEMA,
    title,
    problem: text(value.problem, "problem"),
    priority,
    severity,
    scope: list(value.scope, "scope", scopePath),
    acceptanceCriteria: list(value.acceptanceCriteria, "acceptanceCriteria"),
    verification: list(value.verification, "verification"),
    producer: {
      kind,
      reference: text(value.producer.reference, "producer reference"),
    },
    evidence,
  };
}

export function validateDraft(value) {
  normalizeDraft(value);
}

export function draftDigest(value) {
  return sha(json(normalizeDraft(value)));
}

export function itemId(value) {
  const draft = normalizeDraft(value);
  return `debt-${slug(draft.title)}-${sha(json(draft)).slice(0, 16)}`;
}

export function previewId(drafts) {
  if (
    !Array.isArray(drafts) ||
    drafts.length === 0 ||
    drafts.length > MAX_PREVIEW_DRAFTS
  ) {
    fail("invalid_input", "drafts must be a bounded non-empty array");
  }
  return sha(json({ operation: "create", drafts: drafts.map(normalizeDraft) }));
}

export function previewEnvelope(value) {
  const draft = normalizeDraft(value);
  return {
    ok: true,
    operation: "create",
    previewId: previewId([draft]),
    draft: { id: itemId(draft), draft },
  };
}
