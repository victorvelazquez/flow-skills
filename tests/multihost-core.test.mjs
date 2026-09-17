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
  "flow-audit-fix",
  "flow-branch",
  "flow-build",
  "flow-commit",
  "flow-debt",
  "flow-docs-sync",
  "flow-playbook-compare",
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
const activeProductRoots = [
  "skills",
  "scripts",
  "hosts/opencode/commands",
  "hosts/opencode/agents",
];
const activeProductFiles = [
  "README.md",
  "package.json",
  "flow-assets.json",
  "core/workflows.json",
  "core/host-adapter-contract.md",
  "docs/multihost-migration.md",
  "hosts/opencode/flow-assets.json",
  "hosts/pi/flow-assets.json",
];
const prohibitedImplementationFamilies = [
  ["gentle-ai", /gentle-ai/i, "gentle-ai adapter"],
  ["gentle_ai", /gentle_ai/i, "gentle_ai adapter"],
  ["gentleAi*", /gentleAi\w*/i, "gentleAiAdapter"],
  ["gentle-pi", /gentle-pi/i, "gentle-pi adapter"],
  ["gentle_pi", /gentle_pi/i, "gentle_pi adapter"],
  ["gentlePi*", /gentlePi\w*/i, "gentlePiAdapter"],
  ["@gentle-ai", /@gentle-ai/i, "@gentle-ai/provider"],
  ["@gentle-pi", /@gentle-pi/i, "@gentle-pi/provider"],
  [
    "gentle_review capture names",
    /gentle_review(?:_capture(?:_group)?)?/i,
    "gentle_review_capture_group",
  ],
  ["GENTLE_AI_*", /GENTLE_AI_\w*/i, "GENTLE_AI_TOKEN"],
  [
    "gentle-ai.review-integration",
    /gentle-ai\.review-integration/i,
    "gentle-ai.review-integration",
  ],
  ["rdd-mode", /rdd-mode/i, "rdd-mode"],
];

function productFilesIn(directory) {
  const absoluteDirectory = path.join(root, directory);
  return fs
    .readdirSync(absoluteDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(directory, entry.name);
      return entry.isDirectory()
        ? productFilesIn(relativePath)
        : [relativePath];
    });
}

function assertNoGentleImplementationDependency(source, label = "source") {
  for (const [family, pattern] of prohibitedImplementationFamilies)
    assert.doesNotMatch(source, pattern, `${label} contains ${family}`);
}

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

test("flow-debt registry publishes its existing runtime without changing its contract", () => {
  const debt = readRegistry().workflows.find(({ id }) => id === "flow-debt");

  assert.deepEqual(debt, {
    id: "flow-debt",
    contract: "skills/flow-debt/SKILL.md",
    resources: ["skills/flow-debt"],
    runtime: "scripts/flow-debt.mjs",
    outcome: "project-local debt lifecycle guidance",
    mutation: "approval-required",
    hosts: { opencode: "supported", pi: "supported" },
  });
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

test("host adapter contract defines portable analysis and mutation boundaries", () => {
  const contract = read("core/host-adapter-contract.md");

  assert.match(contract, /## Neutral vocabulary and boundaries/i);
  for (const term of [
    "Analysis result",
    "Finding",
    "Evidence",
    "Proposal",
    "Mutation result",
  ])
    assert.match(contract, new RegExp(`\\*\\*${term}\\*\\*`, "i"));
  assert.match(contract, /\*\*Finding\*\*.*scoped.*referenceable/i);
  assert.match(contract, /\*\*Evidence\*\*.*scoped.*referenceable/i);
  assert.match(contract, /confidence.*limitations/i);
  assert.match(
    contract,
    /analysis and proposals?.*non-mutating.*never approval/i,
  );
  assert.match(
    contract,
    /mutation.*host-native approval.*revalidat.*workflow-owned immutable input/i,
  );
  assert.match(contract, /adapters own interaction and presentation/i);
  assert.match(
    contract,
    /does not prescribe.*permission APIs.*approval tokens.*review transactions.*host commands.*workflow taxonomies.*storage models.*serialized schemas/i,
  );
});

test("active Flow product surfaces contain no Gentle implementation dependencies", () => {
  const files = [
    ...activeProductFiles,
    ...activeProductRoots.flatMap(productFilesIn),
  ].sort();

  assert.deepEqual(
    files.filter((file) => /(?:lock|test|openspec|CHANGELOG)/i.test(file)),
    [],
  );
  for (const file of files)
    assertNoGentleImplementationDependency(read(file), file);
});

test("neutrality guard rejects every prohibited family but permits generic Flow vocabulary", () => {
  for (const [family, pattern, fixture] of prohibitedImplementationFamilies) {
    assert.match(fixture, pattern, `${family} fixture`);
    assert.throws(
      () => assertNoGentleImplementationDependency(fixture),
      assert.AssertionError,
      family,
    );
  }

  assert.doesNotThrow(() =>
    assertNoGentleImplementationDependency(
      "Flow records authority, review, evidence, receipts, and lineage when the domain requires them.",
    ),
  );
});
