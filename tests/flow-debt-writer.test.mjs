import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeAtomicFlowDebtFile } from "../scripts/lib/flow-debt-writer.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-debt-writer-"));
  const directory = path.join(root, "debt");
  fs.mkdirSync(directory);
  return { root, target: path.join(directory, "backlog.json") };
}

function residues(target) {
  const directory = path.dirname(target);
  return fs
    .readdirSync(directory)
    .filter((name) => name.includes("flow-debt-writer"));
}

test("replaces a target with exact bytes using only same-directory writer residues", () => {
  const { target } = fixture();
  const expected = Buffer.from([0, 255, 10, 128]);
  const renamed = [];
  fs.writeFileSync(target, "old");

  assert.deepEqual(
    writeAtomicFlowDebtFile(
      { target, bytes: expected },
      { observeRename: (entry) => renamed.push(entry) },
    ),
    { target, bytes: expected.length },
  );
  assert.equal(renamed.length, 1);
  assert.equal(path.dirname(renamed[0].source), path.dirname(target));
  assert.equal(renamed[0].target, target);
  assert.deepEqual(fs.readFileSync(target), expected);
  assert.deepEqual(residues(target), []);
});

test("fails closed under lock contention without changing the contender lock", () => {
  const { target } = fixture();
  const lock = `${target}.flow-debt-writer.lock`;
  fs.writeFileSync(target, "old");
  fs.writeFileSync(lock, "contender");

  assert.throws(
    () => writeAtomicFlowDebtFile({ target, bytes: Buffer.from("new") }),
    /already locked/i,
  );
  assert.equal(fs.readFileSync(lock, "utf8"), "contender");
  assert.equal(fs.readFileSync(target, "utf8"), "old");
});

test("reports a deterministic postcondition mismatch without removing unknown residue-shaped siblings", () => {
  const { target } = fixture();
  const sibling = path.join(
    path.dirname(target),
    ".backlog.json.flow-debt-writer-foreign.tmp",
  );
  fs.writeFileSync(sibling, "untouched");

  assert.throws(
    () =>
      writeAtomicFlowDebtFile(
        { target, bytes: Buffer.from("expected") },
        { readFile: () => Buffer.from("different") },
      ),
    /postcondition/i,
  );
  assert.equal(fs.readFileSync(sibling, "utf8"), "untouched");
  assert.deepEqual(residues(target), [path.basename(sibling)]);
});

test("rejects non-byte inputs before acquiring a lock", () => {
  const { target } = fixture();

  assert.throws(
    () => writeAtomicFlowDebtFile({ target, bytes: "not bytes" }),
    /byte/i,
  );
  assert.equal(fs.existsSync(`${target}.flow-debt-writer.lock`), false);
});
