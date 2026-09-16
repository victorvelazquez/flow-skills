#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const schema = "flow-contract-request/v1";
const targetsSchema = "flow-contract-targets/v1";
const recordSchema = "flow-contract-request-record/v1";
const maxRequestBytes = 64 * 1024;

function report(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}

function fail(reason, operation, target) {
  report(
    { schema, ok: false, operation, reason, ...(target ? { target } : {}) },
    1,
  );
}

function parse(argv) {
  const operation = argv[0];
  const approved =
    argv.length === 7 &&
    argv[5] === "--host-approval" &&
    argv[6] === "approved";
  if (
    !["preview", "execute"].includes(operation) ||
    ![5, 7].includes(argv.length) ||
    argv[1] !== "--target" ||
    !argv[2] ||
    argv[3] !== "--request-json" ||
    !argv[4] ||
    (argv.length === 7 && !approved)
  )
    return null;
  return { operation, target: argv[2], requestJson: argv[4], approved };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function requesterRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const root = result.stdout?.trim();
  if (result.status !== 0 || !root || !path.isAbsolute(root)) return null;
  try {
    return fs.realpathSync.native(root);
  } catch {
    return null;
  }
}

function configuredTargets(root) {
  const config = path.join(root, ".flow", "contract-targets.json");
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(config, "utf8"));
  } catch {
    return null;
  }
  if (
    parsed?.schema !== targetsSchema ||
    !parsed.targets ||
    typeof parsed.targets !== "object" ||
    Array.isArray(parsed.targets) ||
    Object.keys(parsed).sort().join("\0") !== "schema\0targets"
  )
    return null;
  for (const [key, value] of Object.entries(parsed.targets)) {
    const targetPath =
      typeof value?.path === "string"
        ? value.path.trim().replaceAll("\\", "/")
        : "";
    if (
      !/^[a-z0-9][a-z0-9-]*$/.test(key) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      typeof value.path !== "string" ||
      !targetPath ||
      targetPath.startsWith("//")
    )
      return null;
  }
  return parsed.targets;
}

function targetRepository(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  const result = spawnSync(
    "git",
    ["-C", targetPath, "rev-parse", "--show-toplevel"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const root = result.stdout?.trim();
  if (result.status !== 0 || !root || !path.isAbsolute(root)) return null;
  try {
    return fs.realpathSync.native(root);
  } catch {
    return null;
  }
}

function request(value) {
  if (Buffer.byteLength(value, "utf8") > maxRequestBytes) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function immutableWrite(directory, filename, value) {
  const target = path.join(directory, filename);
  const bytes = `${JSON.stringify(value)}\n`;
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(target, bytes, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error.code !== "EEXIST" || fs.readFileSync(target, "utf8") !== bytes)
      throw error;
    return false;
  }
}

const input = parse(process.argv.slice(2));
if (input) {
  const requester = requesterRoot();
  const targets = requester && configuredTargets(requester);
  const requestValue = request(input.requestJson);
  if (!requester)
    fail("requester-repository-unavailable", input.operation, input.target);
  else if (!targets)
    fail("contract-targets-invalid", input.operation, input.target);
  else if (!Object.hasOwn(targets, input.target))
    fail("target-unavailable", input.operation, input.target);
  else if (requestValue) {
    const configuredPath = path.resolve(requester, targets[input.target].path);
    const target = targetRepository(configuredPath);
    const delivery = target ? "target" : "outbox";
    const crossRepository = Boolean(target && target !== requester);
    const record = {
      schema: recordSchema,
      target: input.target,
      request: requestValue,
    };
    const recordId = createHash("sha256")
      .update(canonical(record))
      .digest("hex");
    if (input.operation === "preview")
      report({
        schema,
        ok: true,
        operation: "preview",
        target: input.target,
        delivery,
        crossRepository,
        record,
      });
    else if (crossRepository && !input.approved)
      fail("approval-required", "execute", input.target);
    else {
      const destination = target || requester;
      const directory = path.join(
        destination,
        ".flow",
        delivery === "target" ? "inbox" : "outbox",
      );
      const written = immutableWrite(
        directory,
        `contract-request-${recordId}.json`,
        record,
      );
      report({
        schema,
        ok: true,
        operation: "execute",
        target: input.target,
        delivery,
        crossRepository,
        recordId,
        written,
      });
    }
  } else fail("request-json-invalid", input.operation, input.target);
} else fail("invalid-arguments", "unknown");
