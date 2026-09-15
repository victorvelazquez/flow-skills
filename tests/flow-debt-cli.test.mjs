import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_APPEND_DRAFTS,
  MAX_BACKLOG_ITEMS,
  serializeBacklog,
} from "../core/flow-debt-backlog.mjs";
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

function runArgvFile(cwd, relative) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import fs from "node:fs"; process.argv = JSON.parse(fs.readFileSync(process.env.FLOW_DEBT_TEST_ARGS, "utf8")); await import(process.env.FLOW_DEBT_TEST_CLI);',
    ],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        FLOW_DEBT_TEST_ARGS: path.join(cwd, relative),
        FLOW_DEBT_TEST_CLI: new URL("../scripts/flow-debt.mjs", import.meta.url)
          .href,
      },
    },
  );
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
      "draft-json-too-large": "draft JSON is too large",
      "invalid-draft-json": "invalid draft JSON",
      "duplicate-draft-json": "duplicate draft JSON",
      "existing-draft": "draft already exists",
      "backlog-full": "debt backlog is full",
    }[code],
  });
}

function assertRejectedStoreUnchanged(root, code, attempt) {
  const before = snapshot(root);
  assertError(attempt(), code);
  assert.deepEqual(snapshot(root), before);
}

function assertPreviewIsReadOnly(output) {
  assert.doesNotMatch(
    JSON.stringify(output),
    /"[^"]*(?:path|handle|authority|approval|execute|done|archive|write|mutation|effect|future[-_]?write|promise)[^"]*"\s*:/i,
  );
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
  const archived = draft("Archived item", "archived");
  const later = draft("Later item");
  backlog(root, [done, later, archived, pending]);
  const before = snapshot(root);

  for (const [args, status, items] of [
    [["list"], "pending", [later, pending]],
    [["list", "--status", "done"], "done", [done]],
    [["list", "--status", "all"], "all", [archived, done, later, pending]],
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
    assert.equal(result.output.totalCount, 4);
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

test("create-preview validates input, binds canonical candidates, and never writes", () => {
  const root = repository();
  const single = draft("Done preview item").draft;
  const batch = [draft("Second preview").draft, single];
  const before = snapshot(root);
  const first = run(root, [
    "create-preview",
    "--draft-json",
    JSON.stringify(single),
  ]);
  const second = run(root, [
    "create-preview",
    "--draft-json",
    JSON.stringify(batch),
  ]);
  const reordered = run(root, [
    "create-preview",
    "--draft-json",
    JSON.stringify([...batch].reverse()),
  ]);

  for (const result of [first, second, reordered]) {
    assert.equal(result.status, 0);
    assert.equal(result.output.schema, schema);
    assert.equal(result.output.ok, true);
    assert.equal(result.output.operation, "create-preview");
    assert.equal(result.output.executable, false);
    assert.match(result.output.repository.id, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(result.output), [
      "schema",
      "ok",
      "operation",
      "executable",
      "repository",
      "availability",
      "backlog",
      "previewId",
      "candidates",
    ]);
    assert.equal(result.output.availability, "absent");
    assert.deepEqual(result.output.backlog, {
      digest:
        "6a529208da63f9d9d770dd2b2d374c78f9d4188c32be455d6b15db9adcf15473",
      count: 0,
    });
    assertPreviewIsReadOnly(result.output);
  }
  assert.equal(first.output.candidates.length, 1);
  assert.deepEqual(
    second.output.candidates,
    [...second.output.candidates].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  );
  assert.equal(second.output.previewId, reordered.output.previewId);
  assert.match(first.output.previewId, /^[a-f0-9]{64}$/);
  const differentCandidate = run(root, [
    "create-preview",
    "--draft-json",
    JSON.stringify(draft("Different candidate").draft),
  ]);
  assert.notEqual(first.output.previewId, differentCandidate.output.previewId);

  const sameRepository = repository();
  backlog(sameRepository, [draft("First canonical backlog")]);
  const firstBacklogBefore = snapshot(sameRepository);
  const firstBacklog = run(sameRepository, [
    "create-preview",
    "--draft-json",
    JSON.stringify(single),
  ]);
  assert.deepEqual(snapshot(sameRepository), firstBacklogBefore);
  backlog(sameRepository, [draft("Second canonical backlog")]);
  const secondBacklogBefore = snapshot(sameRepository);
  const secondBacklog = run(sameRepository, [
    "create-preview",
    "--draft-json",
    JSON.stringify(single),
  ]);
  assert.deepEqual(snapshot(sameRepository), secondBacklogBefore);
  assert.equal(
    firstBacklog.output.repository.id,
    secondBacklog.output.repository.id,
  );
  assert.equal(
    firstBacklog.output.backlog.count,
    secondBacklog.output.backlog.count,
  );
  assert.notEqual(
    firstBacklog.output.backlog.digest,
    secondBacklog.output.backlog.digest,
  );
  assert.notEqual(
    firstBacklog.output.previewId,
    secondBacklog.output.previewId,
  );

  const equivalentBacklog = [draft("Equivalent canonical backlog")];
  const firstRepository = repository();
  const secondRepository = repository();
  backlog(firstRepository, equivalentBacklog);
  backlog(secondRepository, equivalentBacklog);
  const firstRepositoryPreview = run(firstRepository, [
    "create-preview",
    "--draft-json",
    JSON.stringify(single),
  ]);
  const secondRepositoryPreview = run(secondRepository, [
    "create-preview",
    "--draft-json",
    JSON.stringify(single),
  ]);
  assert.deepEqual(
    firstRepositoryPreview.output.backlog,
    secondRepositoryPreview.output.backlog,
  );
  assert.notEqual(
    firstRepositoryPreview.output.repository.id,
    secondRepositoryPreview.output.repository.id,
  );
  assert.notEqual(
    firstRepositoryPreview.output.previewId,
    secondRepositoryPreview.output.previewId,
  );
  assert.deepEqual(snapshot(root), before);
});

test("create-preview accepts an exact batch and rejects without writing", () => {
  const root = repository();
  const value = draft("Candidate").draft;
  const normalizedDuplicate = { ...value, title: `  ${value.title}  ` };
  const maxBatch = Array.from(
    { length: MAX_APPEND_DRAFTS },
    (_, index) => draft(`Batch candidate ${index}`).draft,
  );
  const maxBatchBefore = snapshot(root);
  const maxBatchResult = run(root, [
    "create-preview",
    "--draft-json",
    JSON.stringify(maxBatch),
  ]);
  assert.equal(maxBatchResult.status, 0);
  assert.equal(maxBatchResult.output.candidates.length, MAX_APPEND_DRAFTS);
  assert.deepEqual(snapshot(root), maxBatchBefore);

  for (const args of [
    ["create-preview"],
    ["create-preview", "--draft-json"],
    ["create-preview", "--draft-json", "{}", "extra"],
    ["create-preview", "--unknown", JSON.stringify(value)],
    [
      "create-preview",
      "--draft-json",
      JSON.stringify(value),
      "--draft-json",
      JSON.stringify(value),
    ],
  ]) {
    assertRejectedStoreUnchanged(root, "invalid_arguments", () =>
      run(root, args),
    );
  }
  for (const input of [
    "{",
    JSON.stringify({ schema: "flow-debt-draft/v2" }),
    JSON.stringify({ drafts: [value] }),
    "[]",
    JSON.stringify(
      Array.from(
        { length: MAX_APPEND_DRAFTS + 1 },
        (_, index) => draft(`Too many candidate ${index}`).draft,
      ),
    ),
  ]) {
    assertRejectedStoreUnchanged(root, "invalid-draft-json", () =>
      run(root, ["create-preview", "--draft-json", input]),
    );
  }
  assertRejectedStoreUnchanged(root, "duplicate-draft-json", () =>
    run(root, [
      "create-preview",
      "--draft-json",
      JSON.stringify([value, normalizedDuplicate]),
    ]),
  );

  backlog(root, [draft("Candidate"), draft("Done candidate", "done")]);
  assertRejectedStoreUnchanged(root, "existing-draft", () =>
    run(root, ["create-preview", "--draft-json", JSON.stringify(value)]),
  );
  assertRejectedStoreUnchanged(root, "existing-draft", () =>
    run(root, [
      "create-preview",
      "--draft-json",
      JSON.stringify(draft("Done candidate").draft),
    ]),
  );

  const full = repository();
  backlog(
    full,
    Array.from({ length: MAX_BACKLOG_ITEMS }, (_, index) =>
      draft(`Full candidate ${index}`),
    ),
  );
  assertRejectedStoreUnchanged(full, "backlog-full", () =>
    run(full, ["create-preview", "--draft-json", JSON.stringify(value)]),
  );

  const legacy = repository();
  write(legacy, ".flow/debt/README.md", "legacy\n");
  assertRejectedStoreUnchanged(legacy, "legacy_store", () =>
    run(legacy, ["create-preview", "--draft-json", JSON.stringify(value)]),
  );
  const unsafe = repository();
  write(unsafe, ".flow/debt/unknown", "unsafe\n");
  assertRejectedStoreUnchanged(unsafe, "store_unavailable", () =>
    run(unsafe, ["create-preview", "--draft-json", JSON.stringify(value)]),
  );
});

test("create-preview bounds oversized raw UTF-8 JSON before parsing", () => {
  const root = repository();
  write(
    root,
    "argv.json",
    JSON.stringify([
      process.execPath,
      cli,
      "create-preview",
      "--draft-json",
      `"${"x".repeat(2 * 1024 * 1024)}"`,
    ]),
  );
  assertRejectedStoreUnchanged(root, "draft-json-too-large", () =>
    runArgvFile(root, "argv.json"),
  );
});

test("source reuses core draft and backlog functions with bounded discovery", () => {
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
  assert.match(
    source,
    /MAX_APPEND_DRAFTS,\s*MAX_BACKLOG_ITEMS,\s*appendDrafts,\s*emptyBacklog/,
  );
  assert.match(source, /itemId, normalizeDraft/);
  assert.match(source, /values\.map\(normalizeDraft\)/);
  assert.match(source, /appendDrafts\(backlog, values\)/);
  assert.match(source, /appendDrafts\(emptyBacklog\(\), values\)\.items/);
  assert.doesNotMatch(
    source,
    /\bfunction\s+(?:normalizeDraft|appendDrafts|emptyBacklog)\b/,
  );
  assert.doesNotMatch(source, /\.flow/);
  assert.doesNotMatch(
    source,
    /\b(?:writeFile|mkdir|rename|unlink|rmSync|execFile|execSync|spawn\(|Gentle)\b/i,
  );
});
