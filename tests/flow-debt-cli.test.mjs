import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { serializeBacklog } from "../core/flow-debt-backlog.mjs";
import { DRAFT_SCHEMA, itemId } from "../core/flow-debt-contract.mjs";

const cli = fileURLToPath(new URL("../scripts/flow-debt.mjs", import.meta.url));
const schema = "flow-debt-cli/v1";

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-debt-cli-"));
  const initialized = spawnSync("git", ["init", "-q"], { cwd: root });
  assert.equal(initialized.status, 0);
  return root;
}

function run(cwd, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^\{.*\}\n$/s);
  return { ...result, output: JSON.parse(result.stdout) };
}

function draft(title, status = "pending") {
  const value = {
    schema: DRAFT_SCHEMA,
    title,
    problem: "A bounded reader needs a public view.",
    priority: "p1",
    severity: "high",
    scope: ["scripts/flow-debt.mjs"],
    acceptanceCriteria: ["Expose canonical debt items."],
    verification: ["node --test tests/flow-debt-cli.test.mjs"],
    producer: { kind: "audit", reference: "audit-cli" },
    evidence: [{ reference: "test:cli", summary: "CLI output is stable." }],
  };
  return { id: itemId(value), status, draft: value };
}

function write(root, relative, value) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function backlog(root, items) {
  write(
    root,
    ".flow/debt/backlog.json",
    serializeBacklog({ schema: "flow-debt-backlog/v1", items }),
  );
}

function snapshot(root) {
  const files = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target).split(path.sep).join("/");
      if (entry.isDirectory()) visit(target);
      else files[relative] = fs.readFileSync(target);
    }
  };
  visit(root);
  return files;
}

function assertError(result, code) {
  assert.equal(result.status, 1);
  assert.deepEqual(result.output, {
    schema,
    ok: false,
    code,
    message: {
      invalid_arguments: "invalid arguments",
      invalid_id: "invalid debt id",
      repository_unavailable: "repository unavailable",
      store_unavailable: "debt store unavailable",
      legacy_store: "legacy debt store",
      not_found: "debt item not found",
    }[code],
  });
}

test("strict syntax rejects commands, positional arguments, unknown, duplicate, and missing flags", () => {
  const root = repository();
  for (const [args, code] of [
    [[], "invalid_arguments"],
    [["create"], "invalid_arguments"],
    [["list", "extra"], "invalid_arguments"],
    [["list", "--unknown"], "invalid_arguments"],
    [["list", "--status"], "invalid_arguments"],
    [["list", "--status", "later"], "invalid_arguments"],
    [
      ["list", "--status", "pending", "--status", "pending"],
      "invalid_arguments",
    ],
    [["show"], "invalid_arguments"],
    [["show", "--id"], "invalid_arguments"],
    [["show", "--status", "pending"], "invalid_arguments"],
    [
      [
        "show",
        "--id",
        "debt-a-0123456789abcdef",
        "--id",
        "debt-a-0123456789abcdef",
      ],
      "invalid_arguments",
    ],
  ]) {
    assertError(run(root, args), code);
  }
});

test("list defaults to pending and filters canonical available items by status", () => {
  const root = repository();
  const pending = draft("Pending item");
  const done = draft("Done item", "done");
  const later = draft("Later item");
  backlog(root, [done, later, pending]);
  const before = snapshot(root);

  for (const [args, status, items] of [
    [["list"], "pending", [later, pending]],
    [["list", "--status", "done"], "done", [done]],
    [["list", "--status", "all"], "all", [done, later, pending]],
  ]) {
    const result = run(root, args);
    assert.equal(result.status, 0);
    assert.deepEqual(
      result.output.items,
      items.sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(Object.keys(result.output), [
      "schema",
      "ok",
      "operation",
      "repository",
      "availability",
      "status",
      "totalCount",
      "selectedCount",
      "items",
    ]);
    assert.equal(result.output.schema, schema);
    assert.equal(result.output.ok, true);
    assert.equal(result.output.operation, "list");
    assert.equal(result.output.availability, "available");
    assert.equal(result.output.status, status);
    assert.equal(result.output.totalCount, 3);
    assert.equal(result.output.selectedCount, items.length);
    assert.match(result.output.repository.id, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(snapshot(root), before);
});

test("nested cwd has one canonical repository identity and never discloses a path", () => {
  const root = repository();
  const nested = path.join(root, "nested", "cwd");
  fs.mkdirSync(nested, { recursive: true });
  const expectedId = createHash("sha256")
    .update(
      `flow-debt-cli/repository/v1\0${path.normalize(fs.realpathSync.native(root))}`,
    )
    .digest("hex");
  const result = run(nested, ["list"]);
  assert.equal(result.status, 0);
  assert.equal(result.output.repository.id, expectedId);
  assert.equal(JSON.stringify(result.output).includes(root), false);
  assert.equal(JSON.stringify(result.output).includes(nested), false);
});

test("show validates canonical IDs and distinguishes found from missing", () => {
  const root = repository();
  const item = draft("Shown item");
  backlog(root, [item]);
  assertError(
    run(root, ["show", "--id", "debt-UPPER-0123456789abcdef"]),
    "invalid_id",
  );
  assertError(
    run(root, ["show", "--id", "debt-shown-item-0123456789abcdef"]),
    "not_found",
  );
  const found = run(root, ["show", "--id", item.id]);
  assert.equal(found.status, 0);
  assert.deepEqual(found.output, {
    schema,
    ok: true,
    operation: "show",
    repository: { id: found.output.repository.id },
    item,
  });
});

test("absent and legacy stores have static behavior without changing their full trees", () => {
  const absent = repository();
  const absentBefore = snapshot(absent);
  const absentResult = run(absent, ["list", "--status", "all"]);
  assert.equal(absentResult.status, 0);
  assert.equal(absentResult.output.availability, "absent");
  assert.deepEqual(absentResult.output.items, []);
  assertError(
    run(absent, ["show", "--id", "debt-item-0123456789abcdef"]),
    "not_found",
  );
  assert.deepEqual(snapshot(absent), absentBefore);

  const legacy = repository();
  write(legacy, ".flow/debt/README.md", "legacy\n");
  const legacyBefore = snapshot(legacy);
  const listed = run(legacy, ["list"]);
  assert.equal(listed.status, 0);
  assert.equal(listed.output.availability, "legacy_store");
  assert.deepEqual(listed.output.items, []);
  assertError(
    run(legacy, ["show", "--id", "debt-item-0123456789abcdef"]),
    "legacy_store",
  );
  assert.deepEqual(snapshot(legacy), legacyBefore);
});

test("unsafe stores and repository failures return JSON-only static errors", () => {
  const unsafe = repository();
  write(unsafe, ".flow/debt/unknown", "unsafe\n");
  const before = snapshot(unsafe);
  assertError(run(unsafe, ["list"]), "store_unavailable");
  assertError(
    run(unsafe, ["show", "--id", "debt-item-0123456789abcdef"]),
    "store_unavailable",
  );
  assert.deepEqual(snapshot(unsafe), before);

  const outside = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-debt-cli-outside-"),
  );
  assertError(run(outside, ["list"]), "repository_unavailable");
});

test("source uses bounded argv-only git discovery, the debt store reader, and no mutation or runtime APIs", () => {
  const source = fs.readFileSync(cli, "utf8");
  assert.match(
    source,
    /spawnSync\(\s*"git",\s*\["rev-parse", "--show-toplevel"\]/,
  );
  assert.match(source, /shell:\s*false/);
  assert.match(source, /stdio:\s*\["ignore", "pipe", "pipe"\]/);
  assert.match(source, /maxBuffer:\s*8192/);
  assert.match(source, /GIT_OPTIONAL_LOCKS:\s*"0"/);
  assert.match(source, /readFlowDebtStore\(\{ repositoryRoot \}\)/);
  assert.doesNotMatch(source, /\.flow/);
  assert.doesNotMatch(
    source,
    /\b(?:writeFile|mkdir|rename|unlink|rmSync|execFile|execSync|spawn\(|Gentle)\b/i,
  );
});
