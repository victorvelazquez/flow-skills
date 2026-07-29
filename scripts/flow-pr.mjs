#!/usr/bin/env node

import process from "node:process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execute, failureResult } from "./lib/flow-pr-executor.mjs";
import { inspect } from "./lib/flow-pr-inspection.mjs";
import { validateRequest } from "./lib/flow-pr-contracts.mjs";

function usage(message) {
  throw new Error(`${message}\nUsage: flow-pr --inspect --base <ref> [--push-remote <remote>] | flow-pr --materialize-request --request-base64 <base64url> | flow-pr --execute --request <json-file>`);
}

function parse(argv) {
  if (argv.length === 0) usage("A mode is required.");
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!["--inspect", "--materialize-request", "--execute", "--base", "--push-remote", "--request", "--request-base64"].includes(value)) usage(`Unsupported argument: ${value}`);
    if (["--inspect", "--materialize-request", "--execute"].includes(value)) {
      if (flags.has(value)) usage(`Duplicate argument: ${value}`);
      flags.add(value);
    } else {
      if (values.has(value) || index + 1 === argv.length || argv[index + 1].startsWith("--")) usage(`Missing or duplicate value for ${value}`);
      values.set(value, argv[++index]);
    }
  }
  if (flags.size !== 1) usage("Choose exactly one mode.");
  if (flags.has("--inspect")) {
    if (!values.has("--base")) usage("--inspect requires --base.");
    if (values.has("--request") || values.has("--request-base64")) usage("Request inputs are not valid with --inspect.");
    return { mode: "inspect", base: values.get("--base"), pushRemote: values.get("--push-remote") || "origin" };
  }
  if (flags.has("--materialize-request")) {
    if (!values.has("--request-base64") || values.size !== 1) usage("--materialize-request requires only --request-base64.");
    return { mode: "materialize", encoded: values.get("--request-base64") };
  }
  if (!values.has("--request") || values.size !== 1) usage("--execute requires only --request.");
  return { mode: "execute", request: values.get("--request") };
}

function write(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.exit;
}

function materialize(encoded) {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("--request-base64 must be unpadded base64url.");
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded) throw new Error("--request-base64 is not canonical base64url.");
  const request = validateRequest(JSON.parse(bytes.toString("utf8")));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-request-"));
  const requestPath = path.join(directory, "request.json");
  fs.writeFileSync(requestPath, bytes, { mode: 0o600, flag: "wx" });
  return { schema: "flow-pr/request-materialized-v1", status: "materialized", exit: 0, path: requestPath, request };
}
function ownedTempRequest(requestPath) {
  const absolute = path.resolve(requestPath);
  const directory = path.dirname(absolute);
  return path.basename(absolute) === "request.json" && path.basename(directory).startsWith("flow-pr-request-") && path.dirname(directory) === path.resolve(os.tmpdir());
}

try {
  const options = parse(process.argv.slice(2));
  if (options.mode === "inspect") write(inspect({ baseRef: options.base, pushRemote: options.pushRemote }));
  else if (options.mode === "materialize") write(materialize(options.encoded));
  else {
    const owned = ownedTempRequest(options.request);
    try {
      const request = validateRequest(JSON.parse(fs.readFileSync(options.request, "utf8")));
      write(execute(request));
    } finally {
      if (owned) { fs.rmSync(options.request, { force: true }); fs.rmdirSync(path.dirname(options.request)); }
    }
  }
} catch (error) {
  write(failureResult(error));
}
