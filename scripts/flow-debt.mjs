import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readFlowDebtStore } from "./lib/flow-debt-store.mjs";

const SCHEMA = "flow-debt-cli/v1";
const ID = /^debt-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{16}$/;
const messages = {
  invalid_arguments: "invalid arguments",
  invalid_id: "invalid debt id",
  repository_unavailable: "repository unavailable",
  store_unavailable: "debt store unavailable",
  legacy_store: "legacy debt store",
  not_found: "debt item not found",
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
