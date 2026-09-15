import {
  MAX_PREVIEW_DRAFTS,
  itemId,
  normalizeDraft,
} from "./flow-debt-contract.mjs";

export const BACKLOG_SCHEMA = "flow-debt-backlog/v1";
export const MAX_BACKLOG_ITEMS = 256;
export const MAX_APPEND_DRAFTS = MAX_PREVIEW_DRAFTS;

const statuses = new Set(["pending", "done", "archived"]);
const canonicalItemId = /^debt-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{16}$/;

function invalid() {
  throw Object.assign(new Error("invalid backlog"), {
    code: "invalid_backlog",
  });
}

function notFound() {
  throw Object.assign(new Error("debt item not found"), {
    code: "not_found",
  });
}

function exact(value, keys) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).sort().join(",") !== keys.sort().join(",")
  ) {
    invalid();
  }
}

function compareItems(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function normalize(value) {
  exact(value, ["schema", "items"]);
  if (value.schema !== BACKLOG_SCHEMA) invalid();
  if (!Array.isArray(value.items) || value.items.length > MAX_BACKLOG_ITEMS) {
    invalid();
  }

  const ids = new Set();
  const drafts = new Set();
  const items = value.items.map((entry) => {
    exact(entry, ["id", "status", "draft"]);
    if (!statuses.has(entry.status)) invalid();

    const draft = normalizeDraft(entry.draft);
    const id = itemId(draft);
    if (entry.id !== id || ids.has(id)) invalid();

    const encoded = JSON.stringify(draft);
    if (drafts.has(encoded)) invalid();
    ids.add(id);
    drafts.add(encoded);
    return { id, status: entry.status, draft };
  });

  return { schema: BACKLOG_SCHEMA, items: items.sort(compareItems) };
}

export function emptyBacklog() {
  return { schema: BACKLOG_SCHEMA, items: [] };
}

export function normalizeBacklog(value) {
  try {
    return normalize(value);
  } catch {
    invalid();
  }
}

export function parseBacklog(text) {
  if (typeof text !== "string") invalid();
  try {
    return normalize(JSON.parse(text));
  } catch {
    invalid();
  }
}

export function serializeBacklog(value) {
  return `${JSON.stringify(normalizeBacklog(value), null, 2)}\n`;
}

function transitionItem(backlog, id, from, to) {
  const normalized = normalizeBacklog(backlog);
  if (typeof id !== "string" || !canonicalItemId.test(id)) invalid();

  const index = normalized.items.findIndex((entry) => entry.id === id);
  if (index === -1) notFound();

  const item = normalized.items[index];
  if (item.status === to) {
    return { backlog: normalized, changed: false, item };
  }
  if (item.status !== from) invalid();

  const next = { ...item, status: to };
  return {
    backlog: {
      schema: BACKLOG_SCHEMA,
      items: normalized.items.map((entry, entryIndex) =>
        entryIndex === index ? next : entry,
      ),
    },
    changed: true,
    item: next,
  };
}

export function markDone(backlog, id) {
  return transitionItem(backlog, id, "pending", "done");
}

export function archiveItem(backlog, id) {
  return transitionItem(backlog, id, "done", "archived");
}

export function appendDrafts(backlog, values) {
  const normalized = normalizeBacklog(backlog);
  if (!Array.isArray(values) || values.length > MAX_APPEND_DRAFTS) invalid();
  if (normalized.items.length + values.length > MAX_BACKLOG_ITEMS) invalid();

  let additions;
  try {
    additions = values.map((value) => {
      const draft = normalizeDraft(value);
      return { id: itemId(draft), status: "pending", draft };
    });
  } catch {
    invalid();
  }

  const ids = new Set(normalized.items.map((entry) => entry.id));
  const drafts = new Set(
    normalized.items.map((entry) => JSON.stringify(entry.draft)),
  );
  for (const entry of additions) {
    const encoded = JSON.stringify(entry.draft);
    if (ids.has(entry.id) || drafts.has(encoded)) invalid();
    ids.add(entry.id);
    drafts.add(encoded);
  }

  return {
    schema: BACKLOG_SCHEMA,
    items: [...normalized.items, ...additions].sort(compareItems),
  };
}
