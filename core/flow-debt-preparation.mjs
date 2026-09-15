import { createHash } from "node:crypto";

import { normalizeDraft } from "./flow-debt-contract.mjs";
import {
  appendDrafts,
  archiveItem,
  markDone,
  normalizeBacklog,
} from "./flow-debt-backlog.mjs";

export const PREPARATION_SCHEMA = "flow-debt-preparation/v1";
export const PREPARATION_TTL_MS = 10 * 60 * 1000;
// Detects accidental corruption or unresealed edits, not active-attacker authenticity.
export const PREPARATION_INTEGRITY =
  "sha256-checksum/accidental-corruption-only";

const operations = new Set(["create", "done", "archive"]);
const canonicalItemId = /^debt-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{16}$/;
const json = (value) => JSON.stringify(value);
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const checksum = (value) => createHash("sha256").update(value).digest("hex");

function exact(value, keys, code = "invalid_input", message = "invalid input") {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    json(Object.keys(value).sort()) !== json([...keys].sort())
  ) {
    fail(code, message);
  }
}

function text(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value) ||
    !value.trim()
  ) {
    fail("invalid_input", "invalid input");
  }
  return value.trim();
}

const canonicalBacklog = (backlog) => json(normalizeBacklog(backlog));
const payload = ({ checksum: _checksum, ...handle }) => json(handle);

function input(operation, value) {
  exact(value, operation === "create" ? ["drafts"] : ["id"]);
  if (operation === "create") {
    if (!Array.isArray(value.drafts) || !value.drafts.length)
      fail("invalid_input", "invalid input");
    try {
      return {
        drafts: value.drafts
          .map(normalizeDraft)
          .sort((left, right) =>
            json(left) < json(right) ? -1 : json(left) > json(right) ? 1 : 0,
          ),
      };
    } catch {
      fail("invalid_input", "invalid input");
    }
  }
  const id = text(value.id);
  if (!canonicalItemId.test(id)) fail("invalid_input", "invalid input");
  return { id };
}

function legal(operation, backlog, preparationInput) {
  try {
    if (operation === "create") appendDrafts(backlog, preparationInput.drafts);
    else if (operation === "done") markDone(backlog, preparationInput.id);
    else archiveItem(backlog, preparationInput.id);
  } catch (error) {
    if (error?.code === "not_found") throw error;
    fail("invalid_transition", "invalid transition");
  }
}

function now(value) {
  const current = value ?? Date.now();
  if (!Number.isSafeInteger(current) || current < 0)
    fail("invalid_input", "invalid input");
  return current;
}

function valid(handle) {
  exact(
    handle,
    [
      "schema",
      "integrity",
      "operation",
      "repositoryId",
      "backlogId",
      "input",
      "issuedAt",
      "expiresAt",
      "checksum",
    ],
    "invalid_preparation",
    "invalid preparation",
  );
  try {
    if (
      handle.schema !== PREPARATION_SCHEMA ||
      handle.integrity !== PREPARATION_INTEGRITY ||
      !operations.has(handle.operation) ||
      text(handle.repositoryId) !== handle.repositoryId ||
      !/^[a-f0-9]{64}$/.test(handle.backlogId) ||
      !Number.isSafeInteger(handle.issuedAt) ||
      !Number.isSafeInteger(handle.expiresAt) ||
      handle.expiresAt !== handle.issuedAt + PREPARATION_TTL_MS ||
      !/^[a-f0-9]{64}$/.test(handle.checksum) ||
      json(input(handle.operation, handle.input)) !== json(handle.input)
    ) {
      fail("invalid_preparation", "invalid preparation");
    }
  } catch {
    fail("invalid_preparation", "invalid preparation");
  }
  return handle;
}

function prepare(operation, request, options) {
  exact(
    request,
    operation === "create"
      ? ["repositoryId", "backlog", "drafts"]
      : ["repositoryId", "backlog", "id"],
  );
  const preparationInput = input(
    operation,
    operation === "create" ? { drafts: request.drafts } : { id: request.id },
  );
  canonicalBacklog(request.backlog);
  legal(operation, request.backlog, preparationInput);
  const issuedAt = now(options?.now);
  const handle = {
    schema: PREPARATION_SCHEMA,
    integrity: PREPARATION_INTEGRITY,
    operation,
    repositoryId: text(request.repositoryId),
    backlogId: checksum(canonicalBacklog(request.backlog)),
    input: preparationInput,
    issuedAt,
    expiresAt: issuedAt + PREPARATION_TTL_MS,
  };
  return { ...handle, checksum: checksum(payload(handle)) };
}

export const prepareCreate = (request, options = {}) =>
  prepare("create", request, options);
export const prepareDone = (request, options = {}) =>
  prepare("done", request, options);
export const prepareArchive = (request, options = {}) =>
  prepare("archive", request, options);

export function validatePreparation(handle, request, options = {}) {
  const sealed = valid(handle);
  if (sealed.checksum !== checksum(payload(sealed)))
    fail("integrity_mismatch", "preparation checksum does not match");
  if (sealed.repositoryId !== text(request?.repositoryId))
    fail("repository_mismatch", "repository does not match preparation");
  if (sealed.backlogId !== checksum(canonicalBacklog(request?.backlog)))
    fail("backlog_mismatch", "backlog does not match preparation");
  const preparationInput = input(sealed.operation, request?.input);
  if (json(sealed.input) !== json(preparationInput))
    fail("input_mismatch", "input does not match preparation");
  if (now(options?.now) >= sealed.expiresAt)
    fail("preparation_expired", "preparation has expired");
  legal(sealed.operation, request.backlog, preparationInput);
  return structuredClone(sealed);
}
