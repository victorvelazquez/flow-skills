import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exists = (file) => fs.existsSync(path.join(root, ...file.split("/")));

const relocatedContentCommands = [
  "flow-audit",
  "flow-build",
  "flow-debt",
  "flow-docs-sync",
  "flow-playbook-sync",
  "flow-refactor",
  "flow-request",
  "flow-ui",
];

const migrationGuide = "docs/multihost-migration.md";
const legacyNames = [
  "flow-audit",
  "flow-branch",
  "flow-build",
  "flow-commit",
  "flow-debt",
  "flow-docs-sync",
  "flow-playbook-sync",
  "flow-pr",
  "flow-refactor",
  "flow-request",
  "flow-ui",
  "ui-design-system",
  "flow-auto-deliver",
  "flow-figma",
  "flow-skills-sync",
];
const removedNames = ["flow-auto-deliver", "flow-figma", "flow-skills-sync"];
const read = (file) =>
  fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
const readJson = (file) => JSON.parse(read(file));
const migrationRowPattern = (name, status) =>
  new RegExp(
    "\\\\|\\\\s*`" + name + "`[^\\\\n]*\\\\|\\\\s*" + status + "\\\\s*\\\\|",
    "i",
  );

test("relocated OpenCode content commands have no legacy repository source path", () => {
  for (const workflow of relocatedContentCommands) {
    assert.equal(exists(`commands/${workflow}.md`), false);
    assert.equal(exists(`hosts/opencode/commands/${workflow}.md`), true);
  }
});

test("relocated OpenCode Git and GitHub adapters reject legacy repository source paths", () => {
  for (const [directory, names] of [
    ["commands", ["flow-branch", "flow-commit", "flow-pr"]],
    [
      "agents",
      [
        "flow-branch-agent",
        "flow-git-agent",
        "flow-pr-agent",
        "flow-request-agent",
        "flow-review-agent",
      ],
    ],
  ])
    for (const name of names) {
      assert.equal(exists(`${directory}/${name}.md`), false);
      assert.equal(exists(`hosts/opencode/${directory}/${name}.md`), true);
    }
});

test("the migration matrix assigns a disposition and transition to every prior command or skill", () => {
  const guide = read(migrationGuide);

  assert.match(guide, /\|\s*Legacy surface\s*\|\s*Status\s*\|/i);
  for (const name of legacyNames) {
    assert.match(
      guide,
      new RegExp(
        "\\\\|\\\\s*`" +
          name +
          "`[^\\\\n]*\\\\|\\\\s*(?:Retained|Replaced|Removed)\\\\s*\\\\|",
        "i",
      ),
      `${name} must have a retained, replaced, or removed migration row`,
    );
  }
  assert.match(
    guide,
    /`flow-auto-deliver`[^\n]*`flow-commit`[^\n]*(?:no PR|does not .*push)/i,
  );
  assert.match(
    guide,
    /`flow-figma`[^\n]*(?:No v1 replacement|flow-ui.*audit)/i,
  );
  assert.match(
    guide,
    /`flow-skills-sync`[^\n]*tools\/flow-assets\.mjs --reconcile/i,
  );
  assert.match(guide, /Pi.*primary/i);
  assert.match(guide, /never .*blindly replace|Do not .*blindly replace/i);
});

test("retained workflows stay declared for both hosts while removed names have no hidden substitute", () => {
  const guide = read(migrationGuide);
  const registry = readJson("core/workflows.json");
  const piManifest = readJson("hosts/pi/flow-assets.json");
  const openCodeManifest = readJson("hosts/opencode/flow-assets.json");

  for (const workflow of registry.workflows) {
    assert.match(guide, migrationRowPattern(workflow.id, "Retained"));
    assert.equal(workflow.hosts.pi, "supported");
    assert.equal(workflow.hosts.opencode, "supported");
    assert.ok(piManifest.workflows.includes(workflow.id));
    if (workflow.id !== "ui-design-system")
      assert.ok(openCodeManifest.workflows.includes(workflow.id));
  }
  for (const name of removedNames)
    assert.match(guide, migrationRowPattern(name, "Removed"));
});

test("removed legacy surfaces have no public registry, package, or OpenCode adapter mapping", () => {
  const registry = readJson("core/workflows.json");
  const packageJson = readJson("package.json");
  const openCodeManifest = readJson("hosts/opencode/flow-assets.json");
  const piManifest = readJson("hosts/pi/flow-assets.json");
  const publicContracts = JSON.stringify({
    registry,
    packageJson: { files: packageJson.files, pi: packageJson.pi },
    openCodeManifest,
    piManifest,
  });

  for (const name of removedNames) {
    assert.equal(exists(`commands/${name}.md`), false, `${name} root command`);
    assert.equal(
      exists(`hosts/opencode/commands/${name}.md`),
      false,
      `${name} OpenCode adapter`,
    );
    assert.doesNotMatch(publicContracts, new RegExp(name));
  }
  assert.equal(exists("skills/flow-skills-sync/SKILL.md"), false);
});

test("legacy Flow Debt stores require manual drafts, previews, and separate authority", () => {
  const guide = read(migrationGuide);
  const legacy =
    guide.match(
      /## Legacy Flow Debt stores\r?\n\r?\n([\s\S]*?)(?=\r?\n## |\s*$)/,
    )?.[1] || "";

  assert.match(legacy, /no automatic migration/i);
  assert.match(legacy, /Preserve\s+legacy-store data/i);
  assert.match(legacy, /manually author neutral v1 drafts/i);
  assert.match(legacy, /`create-preview`/);
  assert.match(legacy, /Inspect the returned candidates/i);
  assert.match(
    legacy,
    /external legacy-layout resolution under repository policy/i,
  );
  assert.match(legacy, /separately authorized lifecycle/i);
  assert.doesNotMatch(legacy, /automatically migrates|auto-migrates/i);
  assert.doesNotMatch(legacy, /node tools\/flow-assets\.mjs --reconcile/i);
});

test("README defers legacy transitions to the matrix without stale finish or release claims", () => {
  const readme = read("README.md");

  assert.match(readme, /docs\/multihost-migration\.md/);
  assert.doesNotMatch(readme, /flow-(?:finish|release)/i);
  assert.doesNotMatch(readme, /Use `\/flow-skills-sync`/i);
});
