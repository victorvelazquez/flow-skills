import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  BACKLOG_SCHEMA,
  MAX_APPEND_DRAFTS,
  MAX_BACKLOG_ITEMS,
  appendDrafts,
  archiveItem,
  emptyBacklog,
  markDone,
  normalizeBacklog,
  parseBacklog,
  serializeBacklog,
} from "../core/flow-debt-backlog.mjs";
import { DRAFT_SCHEMA, itemId } from "../core/flow-debt-contract.mjs";

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

const item = (value = draft(), status = "pending") => ({
  id: itemId(value),
  status,
  draft: value,
});

function rejectsBacklog(action) {
  assert.throws(action, {
    code: "invalid_backlog",
    message: "invalid backlog",
  });
}

test("creates an empty exact backlog", () => {
  assert.deepEqual(emptyBacklog(), { schema: BACKLOG_SCHEMA, items: [] });
  assert.notEqual(emptyBacklog(), emptyBacklog());
});

test("parse rejects non-text, malformed JSON, and invalid stores neutrally", () => {
  for (const value of [
    null,
    {},
    42,
    "",
    "{",
    "[]",
    '{"schema":"v2","items":[]}',
  ]) {
    rejectsBacklog(() => parseBacklog(value));
  }
});

test("requires exact backlog, item, status, and draft shapes", () => {
  const valid = { schema: BACKLOG_SCHEMA, items: [item()] };
  for (const value of [
    { ...valid, extra: true },
    { schema: BACKLOG_SCHEMA },
    { schema: BACKLOG_SCHEMA, items: [{ ...item(), extra: true }] },
    { schema: BACKLOG_SCHEMA, items: [{ id: item().id, status: "pending" }] },
    {
      schema: BACKLOG_SCHEMA,
      items: [{ ...item(), draft: draft({ schema: "v2" }) }],
    },
    { schema: BACKLOG_SCHEMA, items: [item(draft(), "ignored")] },
    {
      schema: BACKLOG_SCHEMA,
      items: [{ ...item(draft(), "archived"), id: "debt-spoofed" }],
    },
    {
      schema: BACKLOG_SCHEMA,
      items: [{ ...item(draft(), "archived"), draft: draft({ schema: "v2" }) }],
    },
  ]) {
    rejectsBacklog(() => normalizeBacklog(value));
  }
});

test("rejects spoofed IDs and repeated stored IDs", () => {
  rejectsBacklog(() =>
    normalizeBacklog({
      schema: BACKLOG_SCHEMA,
      items: [{ ...item(), id: "debt-spoofed" }],
    }),
  );
  rejectsBacklog(() =>
    normalizeBacklog({ schema: BACKLOG_SCHEMA, items: [item(), item()] }),
  );
});

test("bounds stored items and append batches before unbounded normalization", () => {
  const valid = item();
  rejectsBacklog(() =>
    normalizeBacklog({
      schema: BACKLOG_SCHEMA,
      items: Array(MAX_BACKLOG_ITEMS + 1).fill(valid),
    }),
  );
  rejectsBacklog(() =>
    appendDrafts(emptyBacklog(), Array(MAX_APPEND_DRAFTS + 1).fill(null)),
  );
});

test("normalizes nested drafts and canonically orders items by ID", () => {
  const beta = draft({ title: "Beta debt" });
  const alpha = draft({ title: "Alpha debt" });
  const normalized = normalizeBacklog({
    schema: BACKLOG_SCHEMA,
    items: [item(beta, "done"), item(alpha)],
  });

  assert.deepEqual(
    normalized.items.map((entry) => entry.id),
    [itemId(alpha), itemId(beta)].sort(),
  );
  assert.equal(normalized.items[0].draft.title, "Alpha debt");
});

test("parses and serializes archived items byte-stably", () => {
  const source = {
    schema: BACKLOG_SCHEMA,
    items: [item(draft({ title: "Archived debt" }), "archived")],
  };
  const first = serializeBacklog(source);

  assert.equal(parseBacklog(first).items[0].status, "archived");
  assert.equal(serializeBacklog(parseBacklog(first)), first);
});

test("transitions pending to done and done to archived without mutating input", () => {
  const alpha = item(draft({ title: "Alpha debt" }));
  const beta = item(draft({ title: "Beta debt" }), "done");
  const source = { schema: BACKLOG_SCHEMA, items: [beta, alpha] };
  const before = JSON.stringify(source);

  const completed = markDone(source, alpha.id);
  assert.equal(JSON.stringify(source), before);
  assert.equal(completed.changed, true);
  assert.deepEqual(completed.item, { ...alpha, status: "done" });
  assert.deepEqual(
    completed.backlog.items.map((entry) => entry.id),
    [alpha.id, beta.id].sort(),
  );

  const archived = archiveItem(completed.backlog, alpha.id);
  assert.equal(archived.changed, true);
  assert.deepEqual(archived.item, { ...alpha, status: "archived" });
  assert.equal(
    archived.backlog.items.find((entry) => entry.id === alpha.id).status,
    "archived",
  );
});

test("returns deterministic no-ops for repeated lifecycle transitions", () => {
  const done = item(draft({ title: "Done debt" }), "done");
  const archived = item(draft({ title: "Archived debt" }), "archived");

  for (const [transition, source, expected] of [
    [markDone, done, done],
    [archiveItem, archived, archived],
  ]) {
    const result = transition(
      { schema: BACKLOG_SCHEMA, items: [source] },
      source.id,
    );
    assert.equal(result.changed, false);
    assert.deepEqual(result.item, expected);
    assert.deepEqual(result.backlog, {
      schema: BACKLOG_SCHEMA,
      items: [expected],
    });
  }
});

test("fails closed for invalid lifecycle transitions and distinguishes missing IDs", () => {
  const pending = item();
  const archived = item(draft({ title: "Archived debt" }), "archived");
  const backlog = { schema: BACKLOG_SCHEMA, items: [pending, archived] };

  rejectsBacklog(() => archiveItem(backlog, pending.id));
  rejectsBacklog(() => markDone(backlog, archived.id));
  rejectsBacklog(() => markDone(backlog, "debt-invalid"));
  assert.throws(() => archiveItem(emptyBacklog(), pending.id), {
    code: "not_found",
    message: "debt item not found",
  });
});

test("append is immutable and creates only pending canonical items", () => {
  const existing = { schema: BACKLOG_SCHEMA, items: [item()] };
  const incoming = draft({ title: "Renderer debt" });
  const before = JSON.stringify(existing);
  const incomingBefore = JSON.stringify(incoming);
  const result = appendDrafts(existing, [incoming]);

  assert.equal(JSON.stringify(existing), before);
  assert.equal(JSON.stringify(incoming), incomingBefore);
  assert.notEqual(result, existing);
  assert.deepEqual(
    result.items.map((entry) => entry.status),
    ["pending", "pending"],
  );
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    [...result.items.map((entry) => entry.id)].sort(),
  );
});

test("append rejects duplicate batches and existing collisions", () => {
  const incoming = draft({ title: "Renderer debt" });
  rejectsBacklog(() => appendDrafts(emptyBacklog(), [incoming, incoming]));
  rejectsBacklog(() =>
    appendDrafts({ schema: BACKLOG_SCHEMA, items: [item(incoming)] }, [
      incoming,
    ]),
  );
});

test("serializes deterministically with one trailing newline and stable parse bytes", () => {
  const source = normalizeBacklog({
    schema: BACKLOG_SCHEMA,
    items: [
      item(draft({ title: "Zeta debt" })),
      item(draft({ title: "Alpha debt" })),
    ],
  });
  const first = serializeBacklog(source);
  const second = serializeBacklog(parseBacklog(first));

  assert.match(first, /^\{\n {2}"schema":/);
  assert.ok(first.endsWith("\n"));
  assert.ok(!first.endsWith("\n\n"));
  assert.equal(second, first);
});

test("backlog codec imports only the draft contract and has no runtime dependencies", () => {
  const source = fs.readFileSync(
    new URL("../core/flow-debt-backlog.mjs", import.meta.url),
    "utf8",
  );
  const imports = [
    ...source.matchAll(
      /^\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?\s*$/gm,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(imports, ["./flow-debt-contract.mjs"]);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(
    source,
    /\b(?:fs|process|child_process|cli|host|approval|authority)\b/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:Gentle[A-Za-z0-9_]*|gentle[A-Za-z0-9_]*|GENTLE_[A-Z0-9_]*)\b/,
  );
});
