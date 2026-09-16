import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-refactor.mjs");
const digest = (value) => createHash("sha256").update(value).digest("hex");

function fixture(files) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flow-refactor-"));
  const directory = path.join(cwd, "fixture");
  fs.mkdirSync(directory);
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(directory, name), content);
  return { cwd, directory };
}

function run(cwd) {
  return JSON.parse(
    execFileSync(process.execPath, [runtime, "--scope", "fixture"], {
      cwd,
      encoding: "utf8",
    }),
  );
}

test("flow-refactor emits sorted evidence-backed findings and exact neutral drafts", () => {
  const { cwd, directory } = fixture({
    "z.js": 'console.log("debug");\n',
    "a.js": '// TODO: reduce this module\nconsole.debug("debug");\n',
  });
  const before = Object.fromEntries(
    fs
      .readdirSync(directory)
      .map((name) => [
        name,
        digest(fs.readFileSync(path.join(directory, name))),
      ]),
  );

  const first = run(cwd);
  const second = run(cwd);

  assert.deepEqual(first, second);
  assert.deepEqual(first.findings, [
    {
      rule: "todo-marker",
      path: "fixture/a.js",
      line: 1,
      summary: "A TODO marker is present.",
    },
    {
      rule: "debug-output",
      path: "fixture/a.js",
      line: 2,
      summary: "Debug output is present.",
    },
    {
      rule: "debug-output",
      path: "fixture/z.js",
      line: 1,
      summary: "Debug output is present.",
    },
  ]);
  assert.deepEqual(first.drafts[0], {
    schema: "flow-debt-draft/v1",
    title: "Resolve TODO in fixture/a.js",
    problem: "A TODO marker is present in the reviewed source.",
    priority: "p2",
    severity: "medium",
    scope: ["fixture/a.js"],
    acceptanceCriteria: ["Address or document the TODO at line 1."],
    verification: [
      "Read fixture/a.js and confirm the TODO is addressed or documented.",
    ],
    producer: {
      kind: "flow-refactor",
      reference: "flow-refactor:todo-marker:fixture/a.js:1",
    },
    evidence: [
      {
        reference: "fixture/a.js:1",
        summary: "A TODO marker is present.",
      },
    ],
  });
  const after = Object.fromEntries(
    fs
      .readdirSync(directory)
      .map((name) => [
        name,
        digest(fs.readFileSync(path.join(directory, name))),
      ]),
  );
  assert.deepEqual(after, before, "runtime leaves fixture bytes unchanged");
});

test("flow-refactor reports a clean scope neutrally", () => {
  const { cwd } = fixture({ "clean.js": "export const answer = 42;\n" });
  const result = run(cwd);

  assert.equal(result.status, "clean");
  assert.equal(result.message, "No supported smells detected.");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.drafts, []);
});

test("flow-refactor has no runtime mutation, approval, review, delivery, or apply path", () => {
  const source = fs.readFileSync(runtime, "utf8");
  assert.doesNotMatch(
    source,
    /writeFile|mkdir|rmSync|spawn|execFile|host-approval|nextAction|--apply/i,
  );
});
