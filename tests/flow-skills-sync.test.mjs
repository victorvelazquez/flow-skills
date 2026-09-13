import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = path.join(root, "scripts", "flow-skills.mjs");

function run(args = []) {
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-retired-")),
    encoding: "utf8",
    env: {
      ...process.env,
      FLOW_SKILLS_REPO: path.join(root, "does-not-need-to-exist"),
      FLOW_SKILLS_OPENCODE_DIR: path.join(root, "does-not-need-to-exist"),
    },
  });
}

test("the legacy Flow Skills Sync wrapper rejects every entry without reading a host", () => {
  for (const args of [[], ["--snapshot", "--dry-run"], ["restore", "HEAD"]]) {
    const result = run(args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, /retired|reconcile/i);
    assert.doesNotMatch(
      result.stderr,
      /source directory not found|repository not found/i,
    );
  }
});

test("Flow Skills Sync has no end-user skill or command surface", () => {
  assert.equal(
    fs.existsSync(path.join(root, "skills", "flow-skills-sync", "SKILL.md")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, "commands", "flow-skills-sync.md")),
    false,
  );

  const migration = fs.readFileSync(
    path.join(root, "docs", "multihost-migration.md"),
    "utf8",
  );
  assert.match(migration, /`flow-skills-sync`[^\n]*Removed/i);
  assert.match(migration, /tools\/flow-assets\.mjs --reconcile/i);
  assert.match(
    migration,
    /--host opencode --source <absolute-path> --dry-run/i,
  );
});

test("the retired wrapper does not imply approval or host mutation", () => {
  const contract = fs.readFileSync(wrapper, "utf8");

  assert.doesNotMatch(
    contract,
    /--apply|--approve|git\s+(?:commit|push)|pi install/i,
  );
  assert.match(contract, /retired|reconcile/i);
});
