import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  MAX_APPEND_DRAFTS,
  MAX_BACKLOG_ITEMS,
  appendDrafts,
  emptyBacklog,
} from "../core/flow-debt-backlog.mjs";
import { itemId, normalizeDraft } from "../core/flow-debt-contract.mjs";
import { readFlowDebtStore } from "./lib/flow-debt-store.mjs";
import {
  executeFlowDebtPreparation,
  prepareFlowDebtExecution,
  recoverFlowDebtPreparation,
} from "./lib/flow-debt-execution.mjs";

const SCHEMA = "flow-debt-cli/v1";
const MAX_DRAFT_JSON_BYTES = 2 * 1024 * 1024;
const ID = /^debt-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{16}$/;
const messages = {
  invalid_arguments: "invalid arguments",
  invalid_id: "invalid debt id",
  repository_unavailable: "repository unavailable",
  store_unavailable: "debt store unavailable",
  legacy_store: "legacy debt store",
  not_found: "debt item not found",
  "draft-json-too-large": "draft JSON is too large",
  "invalid-draft-json": "invalid draft JSON",
  "duplicate-draft-json": "duplicate draft JSON",
  "existing-draft": "draft already exists",
  "backlog-full": "debt backlog is full",
  invalid_handle: "invalid preparation handle",
  invalid_preparation: "invalid preparation",
  integrity_mismatch: "preparation checksum does not match",
  repository_mismatch: "repository does not match preparation",
  input_mismatch: "input does not match preparation",
  approval_required: "host approval is required",
};

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function parse(argv) {
  if (argv[0] === "list") {
    if (argv.length === 1) return { operation: "list", status: "pending" };
    if (
      argv.length === 3 &&
      argv[1] === "--status" &&
      ["pending", "done", "all"].includes(argv[2])
    ) {
      return { operation: "list", status: argv[2] };
    }
    fail("invalid_arguments");
  }
  if (argv[0] === "show") {
    if (
      argv.length !== 3 ||
      argv[1] !== "--id" ||
      !argv[2] ||
      argv[2].startsWith("--")
    ) {
      fail("invalid_arguments");
    }
    if (!ID.test(argv[2])) fail("invalid_id");
    return { operation: "show", id: argv[2] };
  }
  if (
    argv[0] === "create-preview" &&
    argv.length === 3 &&
    argv[1] === "--draft-json" &&
    argv[2] &&
    !argv[2].startsWith("--")
  ) {
    return { operation: "create-preview", draftJson: argv[2] };
  }
  if (
    argv[0] === "prepare-create" &&
    argv.length === 3 &&
    argv[1] === "--draft-json" &&
    argv[2] &&
    !argv[2].startsWith("--")
  ) {
    return { operation: "prepare", transition: "create", draftJson: argv[2] };
  }
  if (
    ["prepare-done", "prepare-archive"].includes(argv[0]) &&
    argv.length === 3 &&
    argv[1] === "--id" &&
    ID.test(argv[2])
  ) {
    return {
      operation: "prepare",
      transition: argv[0] === "prepare-done" ? "done" : "archive",
      id: argv[2],
    };
  }
  if (
    argv[0] === "execute" &&
    argv.length === 5 &&
    argv[1] === "--handle" &&
    argv[2] &&
    argv[3] === "--host-approval" &&
    argv[4] === "approved"
  ) {
    return { operation: "execute", handle: argv[2] };
  }
  if (
    argv[0] === "recover" &&
    argv.length === 3 &&
    argv[1] === "--handle" &&
    argv[2]
  )
    return { operation: "recover", handle: argv[2] };
  fail("invalid_arguments");
}

function repositoryRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8192,
    shell: false,
  });
  const output = typeof result.stdout === "string" ? result.stdout : "";
  const lines = output.split("\n");
  if (
    result.status !== 0 ||
    result.error ||
    lines.length !== 2 ||
    lines[1] !== "" ||
    !lines[0] ||
    /[\u0000-\u001f\u007f]/.test(lines[0]) ||
    !path.isAbsolute(lines[0])
  ) {
    fail("repository_unavailable");
  }
  try {
    return path.normalize(fs.realpathSync.native(lines[0]));
  } catch {
    fail("repository_unavailable");
  }
}

function repositoryId(repositoryRoot) {
  return createHash("sha256")
    .update(`flow-debt-cli/repository/v1\0${repositoryRoot}`)
    .digest("hex");
}

function store(repositoryRoot) {
  const value = readFlowDebtStore({ repositoryRoot });
  if (value.availability === "unavailable") fail("store_unavailable");
  return value;
}

function drafts(value) {
  if (Buffer.byteLength(value, "utf8") > MAX_DRAFT_JSON_BYTES) {
    fail("draft-json-too-large");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("invalid-draft-json");
  }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  if (!values.length || values.length > MAX_APPEND_DRAFTS) {
    fail("invalid-draft-json");
  }
  try {
    return values.map(normalizeDraft);
  } catch {
    fail("invalid-draft-json");
  }
}

function candidates(values, backlog) {
  const serialized = values.map((entry) => JSON.stringify(entry));
  const ids = values.map(itemId);
  if (
    new Set(serialized).size !== serialized.length ||
    new Set(ids).size !== ids.length
  ) {
    fail("duplicate-draft-json");
  }
  if (backlog.items.length + values.length > MAX_BACKLOG_ITEMS) {
    fail("backlog-full");
  }
  const current = new Set(
    backlog.items.map((entry) => JSON.stringify(entry.draft)),
  );
  const currentIds = new Set(backlog.items.map((entry) => entry.id));
  if (
    serialized.some((entry) => current.has(entry)) ||
    ids.some((entry) => currentIds.has(entry))
  ) {
    fail("existing-draft");
  }
  try {
    appendDrafts(backlog, values);
    return appendDrafts(emptyBacklog(), values).items;
  } catch {
    fail("invalid-draft-json");
  }
}

function handle(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    fail("invalid_handle");
  try {
    const bytes = Buffer.from(value, "base64url");
    if (!bytes.length || bytes.toString("base64url") !== value)
      fail("invalid_handle");
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error?.code) throw error;
    fail("invalid_handle");
  }
}

function encodedHandle(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function previewId(repository, digest, entries) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        domain: "flow-debt-cli/create-preview/v1",
        repository,
        backlog: { digest },
        candidates: entries,
      }),
    )
    .digest("hex");
}

function response(command, repositoryRoot) {
  const repository = { id: repositoryId(repositoryRoot) };
  const value = store(repositoryRoot);
  const items = value.backlog.items.filter((item) => ID.test(item.id));

  if (command.operation === "list") {
    const selected = items.filter(
      (item) => command.status === "all" || item.status === command.status,
    );
    return {
      schema: SCHEMA,
      ok: true,
      operation: "list",
      repository,
      availability: value.availability,
      status: command.status,
      totalCount: items.length,
      selectedCount: selected.length,
      items: selected,
    };
  }
  if (value.availability === "legacy_store") fail("legacy_store");
  if (command.operation === "prepare") {
    const input =
      command.transition === "create"
        ? { drafts: drafts(command.draftJson) }
        : { id: command.id };
    return {
      schema: SCHEMA,
      ok: true,
      operation: "prepare",
      transition: command.transition,
      preparation: encodedHandle(
        prepareFlowDebtExecution({
          repositoryRoot,
          repositoryId: repository.id,
          operation: command.transition,
          input,
        }),
      ),
    };
  }
  if (command.operation === "execute" || command.operation === "recover") {
    const execute = command.operation === "execute";
    const outcome = (
      execute ? executeFlowDebtPreparation : recoverFlowDebtPreparation
    )({
      repositoryRoot,
      repositoryId: repository.id,
      handle: handle(command.handle),
      ...(execute ? { approved: true } : {}),
    });
    return {
      schema: SCHEMA,
      ok: true,
      operation: command.operation,
      transition: outcome.operation,
      status: outcome.status,
    };
  }
  if (command.operation === "create-preview") {
    const entries = candidates(drafts(command.draftJson), value.backlog);
    return {
      schema: SCHEMA,
      ok: true,
      operation: "create-preview",
      executable: false,
      repository,
      availability: value.availability,
      backlog: { digest: value.digest, count: value.count },
      previewId: previewId(repository, value.digest, entries),
      candidates: entries,
    };
  }
  const item = items.find((entry) => entry.id === command.id);
  if (!item) fail("not_found");
  return { schema: SCHEMA, ok: true, operation: "show", repository, item };
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

try {
  const command = parse(process.argv.slice(2));
  emit(response(command, repositoryRoot()));
} catch (error) {
  const code = messages[error?.code] ? error.code : "store_unavailable";
  emit({ schema: SCHEMA, ok: false, code, message: messages[code] });
  process.exitCode = 1;
}
