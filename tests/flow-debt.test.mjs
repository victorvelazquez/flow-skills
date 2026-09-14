import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DRAFT_SCHEMA,
  MAX_PREVIEW_DRAFTS,
  draftDigest,
  itemId,
  normalizeDraft,
  previewEnvelope,
  previewId,
  slug,
  validateDraft,
} from "../core/flow-debt-contract.mjs";

const draft = (extra = {}) => ({
  schema: DRAFT_SCHEMA,
  title: "Parser debt",
  problem: "Parser has an unsafe fallback.",
  priority: "p1",
  severity: "high",
  scope: ["scripts/parser.mjs"],
  acceptanceCriteria: ["Reject unsafe input"],
  verification: ["node --test tests/parser.test.mjs"],
  producer: { kind: "audit", reference: "audit-42" },
  evidence: [{ reference: "src:42", summary: "Unsafe fallback exists." }],
  ...extra,
});

function rejects(value, code) {
  try {
    validateDraft(value);
  } catch (error) {
    assert.equal(error.code, code);
    return;
  }
  assert.fail("expected draft validation to fail");
}

test("rejects unknown shapes and unsupported schemas exactly", () => {
  rejects({ ...draft(), extra: true }, "invalid_shape");
  rejects({ ...draft(), producer: { kind: "audit" } }, "invalid_shape");
  rejects(draft({ schema: "flow-debt-draft/v2" }), "invalid_schema");
});

test("enforces text, collection, evidence, and producer bounds", () => {
  rejects(draft({ title: "x".repeat(2049) }), "invalid_input");
  rejects(draft({ problem: "unsafe\u0000text" }), "invalid_input");
  rejects(
    draft({ acceptanceCriteria: Array(33).fill("criterion") }),
    "invalid_input",
  );
  rejects(
    draft({ evidence: Array(33).fill({ reference: "r", summary: "s" }) }),
    "invalid_input",
  );
  rejects(
    draft({ producer: { kind: "x".repeat(49), reference: "r" } }),
    "invalid_input",
  );
  rejects(draft({ priority: "p4" }), "invalid_input");
});

test("accepts only safe relative scope paths", () => {
  for (const unsafe of [
    "../escape",
    "/absolute",
    "C:/drive",
    "a\\b",
    "a//b",
    ".",
    "a/../b",
  ]) {
    rejects(draft({ scope: [unsafe] }), "invalid_input");
  }
  assert.deepEqual(normalizeDraft(draft({ scope: ["core/a.mjs"] })).scope, [
    "core/a.mjs",
  ]);
});

test("normalizes sorted values and rejects normalized duplicates", () => {
  const normalized = normalizeDraft(
    draft({
      title: "  Parser debt  ",
      scope: ["scripts/z.mjs", " scripts/a.mjs "],
      acceptanceCriteria: [" B ", "A"],
      verification: ["V2", "V1"],
      evidence: [
        { reference: " b ", summary: " B " },
        { reference: "a", summary: "A" },
      ],
    }),
  );
  assert.deepEqual(normalized.scope, ["scripts/a.mjs", "scripts/z.mjs"]);
  assert.deepEqual(normalized.acceptanceCriteria, ["A", "B"]);
  assert.deepEqual(normalized.verification, ["V1", "V2"]);
  assert.deepEqual(normalized.evidence, [
    { reference: "a", summary: "A" },
    { reference: "b", summary: "B" },
  ]);
  rejects(draft({ scope: ["same", " same "] }), "invalid_input");
  rejects(
    draft({
      evidence: [
        { reference: "a", summary: "A" },
        { reference: " a ", summary: " A " },
      ],
    }),
    "invalid_input",
  );
});

test("uses ASCII-only, bounded, canonical slugs and deterministic item IDs", () => {
  assert.equal(slug("Café debt"), "cafe-debt");
  assert.equal(slug("東京"), "");
  assert.equal(slug("---Parser debt---"), "parser-debt");
  assert.equal(slug("Parser___--..debt"), "parser-debt");
  assert.equal(slug(`${"a".repeat(48)} over`), "a".repeat(48));
  rejects(draft({ title: "東京" }), "invalid_input");
  for (const kind of ["audit-2", "legacy", "x9-y8"])
    validateDraft(draft({ producer: { kind, reference: "r" } }));
  for (const kind of ["audit-", "-audit", "audit_kind", "Audit"]) {
    rejects(draft({ producer: { kind, reference: "r" } }), "invalid_input");
  }
  assert.match(
    itemId(draft({ title: "Café debt" })),
    /^debt-cafe-debt-[a-f0-9]{16}$/,
  );
  assert.equal(itemId(draft({ title: " Parser debt " })), itemId(draft()));
});

test("pins stable digest, item ID, preview ID, and authority-free envelope", () => {
  const validDraft = draft();
  assert.equal(
    draftDigest(validDraft),
    "c47cc849fc093d73d497ccfbcbb0b71cdedae80a5a6d194d7c60d0c754fafe04",
  );
  assert.equal(itemId(validDraft), "debt-parser-debt-c47cc849fc093d73");
  assert.equal(
    previewId([validDraft]),
    "51d136524d28653ac0e0a3a4441e6770e4b377781e02427f3b1415fbe6b8f1e1",
  );
  const envelope = previewEnvelope(draft({ title: " Parser debt " }));
  assert.deepEqual(envelope, previewEnvelope(draft()));
  assert.deepEqual(Object.keys(envelope).sort(), [
    "draft",
    "ok",
    "operation",
    "previewId",
  ]);
  assert.equal(envelope.draft.id, itemId(draft()));
  assert.doesNotMatch(JSON.stringify(envelope), /handle|authority|store|root/i);
});

test("bounds preview batches before normalizing drafts", () => {
  const validDraft = draft();
  const invalidBatch = {
    code: "invalid_input",
    message: "drafts must be a bounded non-empty array",
  };

  assert.throws(() => previewId([]), invalidBatch);
  assert.doesNotThrow(() =>
    previewId(Array(MAX_PREVIEW_DRAFTS).fill(validDraft)),
  );
  assert.throws(
    () => previewId(Array(MAX_PREVIEW_DRAFTS + 1).fill(validDraft)),
    invalidBatch,
  );
  assert.throws(
    () => previewId(Array(MAX_PREVIEW_DRAFTS + 1).fill(null)),
    invalidBatch,
  );
});

test("core contract imports only crypto and has no runtime or Gentle dependencies", () => {
  const source = fs.readFileSync(
    new URL("../core/flow-debt-contract.mjs", import.meta.url),
    "utf8",
  );
  const imports = [
    ...source.matchAll(
      /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?\s*$/gm,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(imports, ["node:crypto"]);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /\b(?:process|fs|child_process)\b/);
  assert.doesNotMatch(
    source,
    /\b(?:Gentle[A-Za-z0-9_]*|gentle[A-Za-z0-9_]*|GENTLE_[A-Z0-9_]*)\b/,
  );
});
