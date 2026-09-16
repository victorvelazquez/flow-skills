import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, "scripts", "flow-playbook-compare.mjs");

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flow-playbook-compare-"));
}

function playbook(directory, names) {
  const target = path.join(directory, "playbook");
  fs.mkdirSync(target, { recursive: true });
  for (const name of names)
    fs.writeFileSync(path.join(target, name), "# guide\n");
  return target;
}

function run(cwd, args = [], env = {}) {
  const result = spawnSync(process.execPath, [runtime, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    ...result,
    report: result.stdout ? JSON.parse(result.stdout) : null,
  };
}

test("CLI playbook path wins and candidates are sorted neutral advisories", () => {
  const cwd = fixture();
  const cli = playbook(cwd, ["z.md", "a.md"]);
  const configured = playbook(path.join(cwd, "configured"), ["ignored.md"]);
  fs.mkdirSync(path.join(cwd, ".flow"));
  fs.writeFileSync(
    path.join(cwd, ".flow", "playbook.json"),
    JSON.stringify({ playbookPath: configured }),
  );
  const before = fs.readdirSync(cwd, { recursive: true }).sort();

  const result = run(cwd, ["--playbook-path", cli]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report, {
    schema: "flow-playbook-compare/v1",
    ok: true,
    availability: "available",
    source: "cli",
    playbookPath: cli,
    candidates: [
      { path: "a.md", kind: "playbook-document", advisory: true },
      { path: "z.md", kind: "playbook-document", advisory: true },
    ],
  });
  assert.deepEqual(fs.readdirSync(cwd, { recursive: true }).sort(), before);
});

test("file and environment precedence fails closed without fallback", () => {
  const cwd = fixture();
  const configured = playbook(cwd, ["configured.md"]);
  const envPlaybook = playbook(path.join(cwd, "environment"), ["env.md"]);
  fs.mkdirSync(path.join(cwd, ".flow"));
  fs.writeFileSync(
    path.join(cwd, ".flow", "playbook.json"),
    JSON.stringify({ playbookPath: configured }),
  );

  const file = run(cwd, [], { FLOW_PLAYBOOK_PATH: envPlaybook });
  assert.equal(file.status, 0, file.stderr);
  assert.equal(file.report.source, "file");
  assert.equal(file.report.playbookPath, configured);

  const cli = run(cwd, ["--playbook-path", "missing"], {
    FLOW_PLAYBOOK_PATH: envPlaybook,
  });
  assert.equal(cli.status, 1);
  assert.equal(cli.report.source, "cli");
  assert.equal(cli.report.reason, "playbook-path-not-directory");

  fs.writeFileSync(path.join(cwd, ".flow", "playbook.json"), "not json");
  const invalid = run(cwd, [], { FLOW_PLAYBOOK_PATH: envPlaybook });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.report.source, "file");
  assert.equal(invalid.report.reason, "playbook-path-invalid");

  const environment = run(fixture(), [], { FLOW_PLAYBOOK_PATH: envPlaybook });
  assert.equal(environment.status, 0, environment.stderr);
  assert.equal(environment.report.source, "environment");
});

test("missing configuration returns neutral unavailable with no candidates", () => {
  const cwd = fixture();
  const before = fs.readdirSync(cwd, { recursive: true });

  const result = run(cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.report, {
    schema: "flow-playbook-compare/v1",
    ok: true,
    availability: "unavailable",
    source: null,
    candidates: [],
  });
  assert.deepEqual(fs.readdirSync(cwd, { recursive: true }), before);
});
