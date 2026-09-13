import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) =>
  fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
const expectedIds = [
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
];
const supportedHosts = new Set(["opencode", "pi"]);
const forbiddenCoreTokens =
  /\$ARGUMENTS|~\/.config\/opencode|\bapply_patch\b|\bquestion tool\b/i;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateRegistry(registry, { adapters = supportedHosts } = {}) {
  assert.deepEqual(Object.keys(registry).sort(), ["$schema", "workflows"]);
  assert.equal(registry.$schema, "flow-workflows/v1");
  assert.ok(Array.isArray(registry.workflows));

  const ids = registry.workflows.map((workflow) => workflow.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, ids.length);

  for (const workflow of registry.workflows) {
    assert.deepEqual(Object.keys(workflow).sort(), [
      "contract",
      "hosts",
      "id",
      "mutation",
      "outcome",
      "resources",
      "runtime",
    ]);
    assert.match(workflow.id, /^(?:flow-[a-z0-9-]+|ui-design-system)$/);
    assert.match(workflow.contract, /^skills\/[a-z0-9-]+\/SKILL\.md$/);
    assert.deepEqual(workflow.resources, [...workflow.resources].sort());
    assert.ok(workflow.resources.length > 0);
    for (const resource of workflow.resources) {
      assert.match(resource, /^skills\/[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)*$/);
      assert.ok(!resource.includes(".."));
    }
    assert.ok(
      workflow.runtime === null ||
        /^scripts\/flow-[a-z0-9-]+\.mjs$/.test(workflow.runtime),
    );
    assert.deepEqual(Object.keys(workflow.hosts).sort(), ["opencode", "pi"]);
    for (const [host, claim] of Object.entries(workflow.hosts)) {
      assert.equal(claim, "supported");
      assert.ok(
        adapters.has(host),
        `${workflow.id} claims absent ${host} adapter`,
      );
    }
  }
}

function readRegistry() {
  return JSON.parse(
    fs.readFileSync(path.join(root, "core", "workflows.json"), "utf8"),
  );
}

test("portable workflow registry is complete, sorted, resource-backed, and host-neutral", () => {
  const registry = readRegistry();
  validateRegistry(registry);

  assert.deepEqual(
    registry.workflows.map((workflow) => workflow.id),
    expectedIds,
  );
  assert.doesNotMatch(JSON.stringify(registry), forbiddenCoreTokens);
  for (const workflow of registry.workflows) {
    assert.ok(
      fs.existsSync(path.join(root, workflow.contract)),
      workflow.contract,
    );
    for (const resource of workflow.resources)
      assert.ok(fs.existsSync(path.join(root, resource)), resource);
    if (workflow.runtime)
      assert.ok(
        fs.existsSync(path.join(root, workflow.runtime)),
        workflow.runtime,
      );
  }
});

test("registry validation rejects duplicate or unsorted IDs, missing resources, and undeclared adapter claims", () => {
  const registry = readRegistry();

  const duplicate = clone(registry);
  duplicate.workflows.splice(1, 0, clone(duplicate.workflows[0]));
  assert.throws(() => validateRegistry(duplicate));

  const unsorted = clone(registry);
  [unsorted.workflows[0], unsorted.workflows[1]] = [
    unsorted.workflows[1],
    unsorted.workflows[0],
  ];
  assert.throws(() => validateRegistry(unsorted));

  const missingContract = clone(registry);
  missingContract.workflows[0].contract = "skills/missing/SKILL.md";
  assert.equal(
    fs.existsSync(path.join(root, missingContract.workflows[0].contract)),
    false,
  );

  const absentAdapter = clone(registry);
  assert.throws(
    () => validateRegistry(absentAdapter, { adapters: new Set(["pi"]) }),
    /absent opencode adapter/i,
  );
});

test("support resources have no runtime, and host-neutral paths remain contained", () => {
  const registry = readRegistry();
  const support = registry.workflows.find(
    ({ id }) => id === "ui-design-system",
  );
  assert.equal(support.runtime, null);

  const escapedResource = clone(registry);
  escapedResource.workflows[0].resources = [
    "skills/flow-audit/../../commands/flow-audit.md",
  ];
  assert.throws(() => validateRegistry(escapedResource));
});

test("read-only shared contracts require neither an OpenCode installation nor host permission syntax", () => {
  const sharedFiles = [
    "skills/flow-audit/SKILL.md",
    "skills/flow-refactor/SKILL.md",
    "skills/flow-ui/SKILL.md",
    "skills/ui-design-system/SKILL.md",
    "skills/flow-build/SKILL.md",
    "skills/flow-debt/SKILL.md",
    "skills/flow-docs-sync/SKILL.md",
    "skills/flow-playbook-sync/SKILL.md",
    "skills/flow-request/SKILL.md",
  ];
  const forbidden =
    /\$ARGUMENTS|\bopencode\b|\bflow-review-agent\b|(?:^|\n)\s*(?:bash|edit|write|task|question):\s*(?:allow|ask|deny)\b/im;

  for (const file of sharedFiles)
    assert.doesNotMatch(read(file), forbidden, `${file} must be host-neutral`);
});

test("branch and commit shared contracts retain safety semantics without host interaction syntax", () => {
  const sharedFiles = [
    "skills/flow-branch/SKILL.md",
    "skills/flow-commit/SKILL.md",
  ];
  const forbidden =
    /\$ARGUMENTS|\bopencode\b|~\/\.config|\bflow-(?:branch|git)-agent\b|(?:^|\n)\s*(?:bash|edit|write|task|question):\s*(?:allow|ask|deny)\b/im;

  for (const file of sharedFiles)
    assert.doesNotMatch(read(file), forbidden, `${file} must be host-neutral`);

  const branch = read(sharedFiles[0]);
  assert.match(branch, /separate explicit confirmation/i);
  assert.match(branch, /force-delete.*specific branch/i);
  const commit = read(sharedFiles[1]);
  assert.match(commit, /immutable|sealed/i);
  assert.match(commit, /one human mutation approval/i);
});

test("PR shared contract owns workflow outcomes without host interaction implementation", () => {
  const source = read("skills/flow-pr/SKILL.md");
  assert.doesNotMatch(
    source,
    /\$ARGUMENTS|\bopencode\b|~\/\.config|\bapply_patch\b|\bquestion tool\b|(?:^|\n)\s*(?:bash|edit|write|task|question):\s*(?:allow|ask|deny)\b/im,
  );
  assert.match(source, /prepare, one approval, and execute/i);
  assert.match(source, /immutable|stale/i);
  assert.match(source, /lossless relay payload/i);
});
