import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-request.mjs");

function repository(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const initialized = spawnSync("git", ["init", "-q"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  return directory;
}

function requester(targetPath) {
  const directory = repository("flow-contract-request-");
  fs.mkdirSync(path.join(directory, ".flow"));
  fs.writeFileSync(
    path.join(directory, ".flow", "contract-targets.json"),
    JSON.stringify({
      schema: "flow-contract-targets/v1",
      targets: { api: { path: targetPath } },
    }),
  );
  return directory;
}

function snapshot(directory) {
  const files = {};
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      const relative = path
        .relative(directory, target)
        .split(path.sep)
        .join("/");
      if (entry.isDirectory()) visit(target);
      else files[relative] = fs.readFileSync(target, "utf8");
    }
  };
  visit(directory);
  return files;
}

function run(cwd, args) {
  const result = spawnSync(process.execPath, [runtime, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    ...result,
    report: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

const request = JSON.stringify({
  title: "Expose account status",
  expectedContract: { method: "GET", path: "/accounts/{id}/status" },
});

test("preview validates one configured local target without writes", () => {
  const target = repository("flow-contract-target-");
  const cwd = requester(target);
  const before = snapshot(cwd);

  const result = run(cwd, [
    "preview",
    "--target",
    "api",
    "--request-json",
    request,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report, {
    schema: "flow-contract-request/v1",
    ok: true,
    operation: "preview",
    target: "api",
    delivery: "target",
    crossRepository: true,
    record: {
      schema: "flow-contract-request-record/v1",
      target: "api",
      request: JSON.parse(request),
    },
  });
  assert.deepEqual(snapshot(cwd), before);
  assert.equal(fs.existsSync(path.join(target, ".flow")), false);
});

test("cross-repository execution fails closed without host approval and writes once after approval", () => {
  const target = repository("flow-contract-target-");
  const cwd = requester(target);

  const declined = run(cwd, [
    "execute",
    "--target",
    "api",
    "--request-json",
    request,
  ]);
  assert.equal(declined.status, 1);
  assert.deepEqual(declined.report, {
    schema: "flow-contract-request/v1",
    ok: false,
    operation: "execute",
    reason: "approval-required",
    target: "api",
  });
  assert.equal(fs.existsSync(path.join(target, ".flow")), false);

  const granted = run(cwd, [
    "execute",
    "--target",
    "api",
    "--request-json",
    request,
    "--host-approval",
    "approved",
  ]);
  assert.equal(granted.status, 0, granted.stderr);
  assert.equal(granted.report.delivery, "target");
  assert.equal(granted.report.written, true);
  const files = fs.readdirSync(path.join(target, ".flow", "inbox"));
  assert.deepEqual(files, [`contract-request-${granted.report.recordId}.json`]);

  const replay = run(cwd, [
    "execute",
    "--target",
    "api",
    "--request-json",
    request,
    "--host-approval",
    "approved",
  ]);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(replay.report.written, false);
  assert.deepEqual(fs.readdirSync(path.join(target, ".flow", "inbox")), files);
});

test("invalid configuration and multi-target arguments fail without an outbox write", () => {
  const cwd = repository("flow-contract-request-");
  fs.mkdirSync(path.join(cwd, ".flow"));
  fs.writeFileSync(
    path.join(cwd, ".flow", "contract-targets.json"),
    JSON.stringify({
      schema: "flow-contract-targets/v1",
      targets: { api: { path: "" } },
    }),
  );

  const invalid = run(cwd, [
    "preview",
    "--target",
    "api",
    "--request-json",
    request,
  ]);
  assert.equal(invalid.status, 1);
  assert.equal(invalid.report.reason, "contract-targets-invalid");

  const multiple = run(cwd, [
    "execute",
    "--target",
    "api",
    "--request-json",
    request,
    "--target",
    "other",
  ]);
  assert.equal(multiple.status, 1);
  assert.equal(multiple.report.reason, "invalid-arguments");
  assert.equal(fs.existsSync(path.join(cwd, ".flow", "outbox")), false);
});

test("unknown config properties and UNC target spellings fail closed without writes", () => {
  const cwd = repository("flow-contract-request-");
  const config = path.join(cwd, ".flow", "contract-targets.json");
  fs.mkdirSync(path.dirname(config));
  const invalid = (target) => {
    fs.writeFileSync(config, JSON.stringify(target));
    const result = run(cwd, [
      "preview",
      "--target",
      "api",
      "--request-json",
      request,
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.report.reason, "contract-targets-invalid");
  };

  invalid({
    schema: "flow-contract-targets/v1",
    targets: { api: { path: "." } },
    unexpected: true,
  });
  for (const targetPath of [
    "\\\\server\\share\\api",
    "//server/share/api",
    "\\\\?\\UNC\\server\\share\\api",
    "//?/UNC/server/share/api",
  ])
    invalid({
      schema: "flow-contract-targets/v1",
      targets: { api: { path: targetPath } },
    });
  assert.equal(fs.existsSync(path.join(cwd, ".flow", "outbox")), false);
});

test("an unavailable local target falls back to one immutable requester-local outbox record", () => {
  const missing = path.join(
    os.tmpdir(),
    `flow-contract-missing-${process.pid}`,
  );
  const cwd = requester(missing);

  const result = run(cwd, [
    "execute",
    "--target",
    "api",
    "--request-json",
    request,
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.delivery, "outbox");
  assert.equal(result.report.written, true);
  assert.deepEqual(fs.readdirSync(path.join(cwd, ".flow", "outbox")), [
    `contract-request-${result.report.recordId}.json`,
  ]);
});
