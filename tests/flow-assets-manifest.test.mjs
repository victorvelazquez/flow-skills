import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectManagedFiles,
  sha256,
  validateFileKind,
  validateManifest,
  validateRelativePath,
  verifyLock,
} from "../tools/flow-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest and lock define a deterministic, complete, safe mirror", () => {
  const manifestBytes = fs.readFileSync(path.join(root, "flow-assets.json"));
  const manifest = validateManifest(JSON.parse(manifestBytes));
  const lockBytes = fs.readFileSync(path.join(root, "flow-assets.lock.json"));
  const lock = verifyLock(root);

  assert.equal(lock.$schema, "flow-assets-lock/v1");
  assert.equal(lock.source.kind, "opencode-user-config");
  assert.equal(lock.manifest.sha256, sha256(manifestBytes));
  assert.deepEqual(lock.files.map((entry) => entry.path), [...lock.files.map((entry) => entry.path)].sort());
  assert.equal(new Set(lock.files.map((entry) => entry.path)).size, lock.files.length);
  assert.deepEqual(collectManagedFiles(root, manifest), lock.files.map((entry) => entry.path));
  assert.deepEqual(lockBytes, Buffer.from(`${JSON.stringify(lock, null, 2)}\n`));
  assert.doesNotMatch(lockBytes.toString("utf8"), /(?:[A-Za-z]:\\|\/Users\/|credentials|token|secret)/i);

  assert.ok(manifest.liveMirrored.libraries.length > 0);
  assert.ok(manifest.liveMirrored.libraries.every((entry) => entry.startsWith("scripts/lib/") && !entry.includes("*")));
  assert.ok(manifest.liveMirrored.patterns.find((entry) => entry.path === "skills/ui-design-system/**")?.reason);
  assert.ok(manifest.excluded.includes("opencode.json"));
  assert.ok(manifest.excluded.includes("scripts/tests/**"));

  for (const entry of lock.files) {
    assert.equal(entry.mode, "100644");
    assert.equal(entry.executable, false);
    assert.ok(!entry.path.startsWith("tests/"));
    assert.ok(!["install.mjs", "README.md", "CHANGELOG.md", "package.json", ".gitignore"].includes(entry.path));
  }
});

test("validation rejects traversal, secret-like paths, and symbolic links", () => {
  for (const fixture of [
    "../opencode.json",
    "/absolute/flow.md",
    "skills\\flow-x\\SKILL.md",
    "opencode.json",
    "auth.json",
    "credentials/token.json",
    "provider.json",
    "skills/flow-x/.env.production",
    "scripts/tests/installed-residue.mjs",
  ]) {
    assert.throws(() => validateRelativePath(fixture), fixture);
  }
  assert.throws(() => validateFileKind("skills/flow-x/link", {
    isSymbolicLink: () => true,
    isFile: () => false,
    isDirectory: () => false,
  }), /Symbolic links/);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flow-assets-safe-"));
  fs.writeFileSync(path.join(fixtureRoot, "safe.txt"), "safe\n");
  assert.equal(fs.readFileSync(path.join(fixtureRoot, validateRelativePath("safe.txt")), "utf8"), "safe\n");
});
