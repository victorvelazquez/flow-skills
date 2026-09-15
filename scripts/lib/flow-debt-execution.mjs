import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  appendDrafts,
  archiveItem,
  markDone,
  serializeBacklog,
} from "../../core/flow-debt-backlog.mjs";
import {
  prepareArchive,
  prepareCreate,
  prepareDone,
  validatePreparation,
} from "../../core/flow-debt-preparation.mjs";
import { readFlowDebtStore } from "./flow-debt-store.mjs";
import { withFlowDebtWriteLock } from "./flow-debt-writer.mjs";

const operations = new Set(["create", "done", "archive"]);

function fail(code, message = code.replaceAll("_", " ")) {
  throw Object.assign(new Error(message), { code });
}

function rootPath(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || !repositoryRoot)
    fail("repository_unavailable");
  try {
    const requested = path.resolve(repositoryRoot);
    const stat = fs.lstatSync(requested);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail("repository_unavailable");
    return fs.realpathSync.native(requested);
  } catch (error) {
    if (error?.code) throw error;
    fail("repository_unavailable");
  }
}

function boundRepositoryId(root, supplied) {
  const actual = createHash("sha256")
    .update(`flow-debt-cli/repository/v1\0${root}`)
    .digest("hex");
  if (supplied !== undefined && supplied !== actual)
    fail("repository_mismatch");
  return actual;
}

function current(repositoryRoot) {
  const root = rootPath(repositoryRoot);
  const value = readFlowDebtStore({
    repositoryRoot: root,
    allowWriterLock: true,
  });
  if (!["absent", "available"].includes(value.availability))
    fail("store_unavailable");
  return { root, backlog: value.backlog };
}

function operationInput(handle) {
  return handle.operation === "create"
    ? { drafts: handle.input.drafts }
    : { id: handle.input.id };
}

function transition(backlog, handle) {
  if (handle.operation === "create")
    return appendDrafts(backlog, handle.input.drafts);
  if (handle.operation === "done")
    return markDone(backlog, handle.input.id).backlog;
  if (handle.operation === "archive")
    return archiveItem(backlog, handle.input.id).backlog;
  fail("invalid_preparation");
}

function postcondition(backlog, handle) {
  if (handle.operation === "create") {
    const currentItems = new Map(backlog.items.map((item) => [item.id, item]));
    return handle.input.drafts.every((draft) => {
      const item = currentItems.get(
        // appendDrafts is the core's canonical draft-to-item implementation.
        appendDrafts({ schema: backlog.schema, items: [] }, [draft]).items[0]
          .id,
      );
      return (
        item?.status === "pending" &&
        JSON.stringify(item.draft) === JSON.stringify(draft)
      );
    });
  }
  const item = backlog.items.find((entry) => entry.id === handle.input.id);
  return item?.status === (handle.operation === "done" ? "done" : "archived");
}

function validationStatus({ backlog, repositoryId, handle, now }) {
  try {
    validatePreparation(
      handle,
      { repositoryId, backlog, input: operationInput(handle) },
      { now },
    );
    return "current";
  } catch (error) {
    return error?.code || "invalid_preparation";
  }
}

function boundedRecovery({ backlog, repositoryId, handle, now }) {
  if (!handle || !operations.has(handle.operation)) fail("invalid_preparation");
  const validation = validationStatus({ backlog, repositoryId, handle, now });
  if (
    [
      "invalid_preparation",
      "integrity_mismatch",
      "repository_mismatch",
      "input_mismatch",
    ].includes(validation)
  )
    fail(validation);
  if (postcondition(backlog, handle)) return "already-applied";
  return validation === "current" ? "safely-retryable" : "unknown";
}

function debtDirectory(root) {
  const flow = path.join(root, ".flow");
  const debt = path.join(flow, "debt");
  for (const target of [flow, debt]) {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
      continue;
    }
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("store_unavailable");
  }
  return debt;
}

export function prepareFlowDebtExecution({
  repositoryRoot,
  repositoryId,
  operation,
  input,
  now,
} = {}) {
  if (!operations.has(operation)) fail("invalid_arguments");
  const { root, backlog } = current(repositoryRoot);
  const boundId = boundRepositoryId(root, repositoryId);
  const request =
    operation === "create"
      ? { repositoryId: boundId, backlog, drafts: input?.drafts }
      : { repositoryId: boundId, backlog, id: input?.id };
  const options = { now };
  if (operation === "create") return prepareCreate(request, options);
  if (operation === "done") return prepareDone(request, options);
  return prepareArchive(request, options);
}

export function recoverFlowDebtPreparation({
  repositoryRoot,
  repositoryId,
  handle,
  now,
} = {}) {
  const { root, backlog } = current(repositoryRoot);
  const status = boundedRecovery({
    backlog,
    repositoryId: boundRepositoryId(root, repositoryId),
    handle,
    now,
  });
  return { status, operation: handle.operation };
}

export function executeFlowDebtPreparation({
  repositoryRoot,
  repositoryId,
  handle,
  now,
  approved,
  onLocked,
} = {}) {
  if (!handle || !operations.has(handle.operation)) fail("invalid_preparation");
  if (approved !== true)
    return { status: "approval-required", operation: handle.operation };

  const root = rootPath(repositoryRoot);
  const boundId = boundRepositoryId(root, repositoryId);
  const target = path.join(debtDirectory(root), "backlog.json");
  try {
    return withFlowDebtWriteLock(
      { target },
      ({ write }) => {
        const { backlog } = current(root);
        const status = boundedRecovery({
          backlog,
          repositoryId: boundId,
          handle,
          now,
        });
        if (status === "already-applied")
          return { status, operation: handle.operation };
        if (status !== "safely-retryable")
          return { status: "stale", operation: handle.operation };

        write(Buffer.from(serializeBacklog(transition(backlog, handle))));
        return { status: "completed", operation: handle.operation };
      },
      { onLocked },
    );
  } catch {
    return recoverFlowDebtPreparation({
      repositoryRoot: root,
      repositoryId: boundId,
      handle,
      now,
    });
  }
}
