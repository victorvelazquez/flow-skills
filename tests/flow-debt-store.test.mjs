import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { emptyBacklog, serializeBacklog } from "../core/flow-debt-backlog.mjs";
import { DRAFT_SCHEMA, itemId } from "../core/flow-debt-contract.mjs";
import { readFlowDebtStore } from "../scripts/lib/flow-debt-store.mjs";

const empty = emptyBacklog();
const emptyDigest = createHash("sha256")
  .update(serializeBacklog(empty))
  .digest("hex");

function repository() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flow-debt-store-"));
}

function write(root, relative, value) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
}

function snapshot(root) {
  const result = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target).split(path.sep).join("/");
      if (entry.isDirectory()) visit(target);
      else result[relative] = fs.readFileSync(target);
    }
  };
  visit(root);
  return result;
}

function backlog() {
  const draft = {
    schema: DRAFT_SCHEMA,
    title: "Reader debt",
    problem: "Reader must not trust store paths.",
    priority: "p1",
    severity: "high",
    scope: ["scripts/lib/flow-debt-store.mjs"],
    acceptanceCriteria: ["Reject unsafe entries"],
    verification: ["node --test tests/flow-debt-store.test.mjs"],
    producer: { kind: "audit", reference: "audit-reader" },
    evidence: [{ reference: "test:reader", summary: "Reader stays bounded." }],
  };
  return {
    schema: "flow-debt-backlog/v1",
    items: [{ id: itemId(draft), status: "pending", draft }],
  };
}

function emptyResult(availability) {
  return { availability, backlog: empty, digest: emptyDigest, count: 0 };
}

function unsupportedLinkCapability(error) {
  return ["EPERM", "EACCES", "ENOTSUP"].includes(error.code);
}

test("missing debt levels return canonical empty metadata without writes", () => {
  const root = repository();
  const before = snapshot(root);
  assert.deepEqual(
    readFlowDebtStore({ repositoryRoot: root }),
    emptyResult("absent"),
  );
  assert.deepEqual(snapshot(root), before);
});

test("reads, normalizes, counts, and digests only the canonical backlog", () => {
  const root = repository();
  const value = backlog();
  write(root, ".flow/debt/backlog.json", JSON.stringify(value));
  const normalized = serializeBacklog(value);
  const result = readFlowDebtStore({ repositoryRoot: root });
  assert.equal(result.availability, "available");
  assert.deepEqual(result.backlog, JSON.parse(normalized));
  assert.equal(
    result.digest,
    createHash("sha256").update(normalized).digest("hex"),
  );
  assert.equal(result.count, 1);
});

test("legacy layouts win over content while preserving the repository", () => {
  const root = repository();
  write(root, ".flow/debt/backlog.json", serializeBacklog(backlog()));
  write(root, ".flow/debt/README.md", "legacy\n");
  const before = snapshot(root);
  assert.deepEqual(
    readFlowDebtStore({ repositoryRoot: root }),
    emptyResult("legacy_store"),
  );
  assert.deepEqual(snapshot(root), before);
});

test("directory enumeration accepts exactly the entry limit and rejects limit plus one", () => {
  for (const [count, availability] of [
    [16, "legacy_store"],
    [17, "unavailable"],
  ]) {
    const root = repository();
    for (let index = 0; index < count; index += 1)
      write(root, `.flow/debt/legacy-${index}.md`, "legacy\n");
    assert.deepEqual(
      readFlowDebtStore({ repositoryRoot: root }),
      emptyResult(availability),
    );
  }
});

test("unknown entries, malformed stores, size limits, and kind mismatches fail neutrally", () => {
  for (const [relative, content] of [
    [".flow/debt/unknown", "x"],
    [".flow/debt/backlog.json", "{"],
    [".flow/debt/backlog.json", "x".repeat(1024 * 1024 + 1)],
    [".flow", "file"],
    [".flow/debt", "file"],
  ]) {
    const root = repository();
    write(root, relative, content);
    assert.deepEqual(
      readFlowDebtStore({ repositoryRoot: root }),
      emptyResult("unavailable"),
    );
  }
  const root = repository();
  fs.mkdirSync(path.join(root, ".flow", "debt", "backlog.json"), {
    recursive: true,
  });
  assert.deepEqual(
    readFlowDebtStore({ repositoryRoot: root }),
    emptyResult("unavailable"),
  );

  const legacyRoot = repository();
  write(legacyRoot, ".flow/debt/backlog.json", serializeBacklog(backlog()));
  write(legacyRoot, ".flow/debt/pending", "legacy file");
  assert.deepEqual(
    readFlowDebtStore({ repositoryRoot: legacyRoot }),
    emptyResult("unavailable"),
  );
});

test("symbolic and broken links fail before legacy classification when supported", (context) => {
  const root = repository();
  const outside = write(
    repository(),
    "backlog.json",
    serializeBacklog(backlog()),
  );
  const link = path.join(root, ".flow", "debt", "README.md");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    fs.symlinkSync(outside, link, "file");
    assert.deepEqual(
      readFlowDebtStore({ repositoryRoot: root }),
      emptyResult("unavailable"),
    );

    const broken = path.join(root, ".flow", "debt", "BROKEN.md");
    fs.symlinkSync(path.join(root, "missing.md"), broken, "file");
    assert.deepEqual(
      readFlowDebtStore({ repositoryRoot: root }),
      emptyResult("unavailable"),
    );
  } catch (error) {
    if (unsupportedLinkCapability(error)) {
      context.skip(`Symbolic-link fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
});

test("junction or reparse containment fails when supported", (context) => {
  if (process.platform !== "win32") {
    context.skip("Junction coverage requires Windows.");
    return;
  }
  const root = repository();
  const outside = repository();
  write(outside, "debt/backlog.json", serializeBacklog(backlog()));
  try {
    fs.symlinkSync(outside, path.join(root, ".flow"), "junction");
  } catch (error) {
    if (unsupportedLinkCapability(error)) {
      context.skip(`Junction fixture unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  assert.deepEqual(
    readFlowDebtStore({ repositoryRoot: root }),
    emptyResult("unavailable"),
  );
});

test("reader has no mutation, process, child-process, or host-runtime dependency", () => {
  const source = fs.readFileSync(
    new URL("../scripts/lib/flow-debt-store.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /flow-debt-backlog\.mjs/);
  assert.doesNotMatch(
    source,
    /\b(?:mkdir|writeFile|rmSync|rename|chmod|child_process|process|Gentle)\b/i,
  );
});
