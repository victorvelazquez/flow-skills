import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "core", "workflows.json"), "utf8"),
);
const expectedSkills = registry.workflows
  .map(({ id }) => `skills/${id}`)
  .sort();
const expectedRuntimes = registry.workflows
  .map(({ runtime }) => runtime)
  .filter(Boolean)
  .sort();
const requiredDebtCore = [
  "core/flow-debt-backlog.mjs",
  "core/flow-debt-contract.mjs",
];
const requiredLibraries = [
  "scripts/lib/detect-tooling.mjs",
  "scripts/lib/dotnet-format.mjs",
  "scripts/lib/flow-audit-cache.mjs",
  "scripts/lib/flow-audit-output.mjs",
  "scripts/lib/flow-pr-contracts.mjs",
  "scripts/lib/flow-pr-drafting.mjs",
  "scripts/lib/flow-pr-executor.mjs",
  "scripts/lib/flow-pr-inspection.mjs",
  "scripts/lib/helpers.mjs",
  "scripts/lib/process-control.mjs",
  "scripts/lib/scope.mjs",
];
const requiredPackageFiles = [
  "README.md",
  ...requiredDebtCore,
  "docs/multihost-migration.md",
  "flow-generation.lock.json",
  "hosts/pi/flow-assets.json",
  "hosts/pi/flow-assets.lock.json",
  "package.json",
  ...expectedSkills.map((skill) => `${skill}/**`),
  ...expectedRuntimes,
  ...requiredLibraries,
].sort();

function readJson(relative, packageRoot = root) {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, relative), "utf8"));
}

function isContainedPackagePath(relative) {
  return (
    typeof relative === "string" &&
    !relative.includes("\\") &&
    !relative.startsWith("/") &&
    !relative
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  );
}

function copyResource(sourceRoot, destinationRoot, relative) {
  const source = path.join(sourceRoot, ...relative.split("/"));
  const destination = path.join(destinationRoot, ...relative.split("/"));
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source))
      copyResource(sourceRoot, destinationRoot, `${relative}/${entry}`);
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function packedFixture(packageJson) {
  const packageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-pi-package-"),
  );
  for (const entry of packageJson.files) {
    const relative = entry.endsWith("/**") ? entry.slice(0, -3) : entry;
    copyResource(root, packageRoot, relative);
  }
  return packageRoot;
}

function discoverPiSkills(packageRoot) {
  const packageJson = readJson("package.json", packageRoot);
  return packageJson.pi.skills.map((relative) => {
    assert.ok(
      isContainedPackagePath(relative),
      `unsafe skill resource: ${relative}`,
    );
    const skillPath = path.join(packageRoot, relative, "SKILL.md");
    assert.ok(fs.existsSync(skillPath), `missing skill resource: ${relative}`);
    return relative;
  });
}

test("Pi package metadata declares only the explicit v1 skill resources", () => {
  const packageJson = readJson("package.json");

  assert.equal(packageJson.engines.node, ">=18");
  assert.ok(packageJson.keywords.includes("pi"));
  assert.ok(packageJson.keywords.includes("pi-package"));
  assert.deepEqual(packageJson.pi.skills, expectedSkills);
  assert.deepEqual(packageJson.files, requiredPackageFiles);
  assert.deepEqual(
    packageJson.files.filter((entry) => entry.startsWith("core/")),
    requiredDebtCore,
  );

  const manifest = readJson("hosts/pi/flow-assets.json");
  assert.equal(manifest.$schema, "flow-host-assets/v2");
  assert.equal(manifest.host, "pi");
  assert.equal(manifest.distribution.kind, "package-resources");
  assert.deepEqual(
    manifest.workflows,
    registry.workflows.map(({ id }) => id),
  );
  assert.equal(Object.hasOwn(manifest, "destination"), false);
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /(?:[A-Za-z]:\\|\/Users\/|credentials|token|secret|opencode)/i,
  );
});

test("packed Pi discovery is complete and independent of OpenCode assets", () => {
  const packageRoot = packedFixture(readJson("package.json"));
  const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
  assert.match(readme, /docs\/multihost-migration\.md/);
  assert.ok(
    fs.existsSync(path.join(packageRoot, "docs", "multihost-migration.md")),
    "the packaged README migration-guide link must resolve",
  );
  fs.mkdirSync(path.join(packageRoot, "hosts", "opencode", "commands"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(packageRoot, "hosts", "opencode", "commands", "poison.md"),
    "this must not affect Pi discovery\n",
  );

  assert.deepEqual(discoverPiSkills(packageRoot), expectedSkills);
  for (const workflow of registry.workflows.filter(({ runtime }) => runtime)) {
    const skillDirectory = path.join(packageRoot, "skills", workflow.id);
    const runtime = path.resolve(skillDirectory, "..", "..", workflow.runtime);
    assert.equal(runtime.startsWith(`${packageRoot}${path.sep}`), true);
    assert.ok(
      fs.existsSync(runtime),
      `missing packaged runtime: ${workflow.runtime}`,
    );
  }
  for (const coreModule of requiredDebtCore)
    assert.ok(
      fs.existsSync(path.join(packageRoot, ...coreModule.split("/"))),
      `missing packaged portable debt core module: ${coreModule}`,
    );
  assert.equal(fs.existsSync(path.join(packageRoot, "commands")), false);
  assert.equal(fs.existsSync(path.join(packageRoot, "agents")), false);
});

test("undeclared, malformed, and missing Pi skill resources are rejected", () => {
  const packageJson = readJson("package.json");
  const fixture = packedFixture(packageJson);
  const accidental = path.join(fixture, "skills", "flow-accidental");
  fs.mkdirSync(accidental, { recursive: true });
  fs.writeFileSync(path.join(accidental, "SKILL.md"), "# accidental\n");

  assert.deepEqual(discoverPiSkills(fixture), expectedSkills);

  const malformed = structuredClone(packageJson);
  malformed.pi.skills[0] = "skills/flow-audit/../flow-accidental";
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify(malformed, null, 2)}\n`,
  );
  assert.throws(() => discoverPiSkills(fixture), /unsafe skill resource/i);

  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  fs.unlinkSync(path.join(fixture, "skills", "flow-audit", "SKILL.md"));
  assert.throws(() => discoverPiSkills(fixture), /missing skill resource/i);
});
