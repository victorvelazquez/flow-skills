import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateOpenCodeAdapterMappings } from "../tools/lib/asset-generation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) =>
  fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
const readJson = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(path.join(root, ...file.split("/")));
const opencodeCommand = (name) => `hosts/opencode/commands/${name}.md`;
const opencodeAgent = (name) => `hosts/opencode/agents/${name}.md`;
const portableDebtCore = [
  "core/flow-debt-backlog.mjs",
  "core/flow-debt-contract.mjs",
  "core/flow-debt-preparation.mjs",
];

const readOnlyWorkflows = [
  "flow-audit",
  "flow-build",
  "flow-debt",
  "flow-docs-sync",
  "flow-playbook-sync",
  "flow-refactor",
  "flow-request",
  "flow-ui",
];

test("OpenCode read-only adapters retain native discovery and route to the portable skills", () => {
  const adapters = readOnlyWorkflows.map(opencodeCommand);

  for (const adapter of adapters) {
    const source = read(adapter);
    assert.match(
      source,
      /~\/.config\/opencode\/skills\/flow-(?:audit|build|debt|docs-sync|playbook-sync|refactor|request|ui)\/SKILL\.md/,
    );
  }
  for (const adapter of [
    opencodeCommand("flow-audit"),
    opencodeCommand("flow-build"),
    opencodeCommand("flow-docs-sync"),
    opencodeCommand("flow-playbook-sync"),
    opencodeCommand("flow-refactor"),
    opencodeCommand("flow-request"),
    opencodeCommand("flow-ui"),
  ])
    assert.match(read(adapter), /CONTEXT:/);
  assert.match(read(opencodeCommand("flow-refactor")), /\$ARGUMENTS/);
});

test("OpenCode content adapters map repository sources to unchanged command destinations", () => {
  const manifest = readJson("hosts/opencode/flow-assets.json");
  const workflows = readJson("core/workflows.json").workflows;

  assert.deepEqual(
    manifest.workflows.filter((workflow) =>
      readOnlyWorkflows.includes(workflow),
    ),
    readOnlyWorkflows,
  );
  assert.deepEqual(
    manifest.mappings
      .filter(({ workflow }) => readOnlyWorkflows.includes(workflow))
      .map(({ source, destination }) => ({ source, destination })),
    readOnlyWorkflows.map((workflow) => ({
      source: opencodeCommand(workflow),
      destination: `commands/${workflow}.md`,
    })),
  );
  for (const mapping of manifest.mappings.filter(({ workflow }) =>
    readOnlyWorkflows.includes(workflow),
  )) {
    assert.equal(
      exists(mapping.source),
      true,
      `missing adapter: ${mapping.source}`,
    );
    assert.equal(mapping.destination.startsWith("commands/"), true);
    assert.equal(
      exists(mapping.destination),
      false,
      `legacy source remains: ${mapping.destination}`,
    );
    assert.equal(
      workflows.some(
        ({ id, hosts }) =>
          id === mapping.workflow && hosts.opencode === "supported",
      ),
      true,
      `adapter claims undeclared workflow: ${mapping.workflow}`,
    );
  }
  assert.deepEqual(manifest.protectedScopes, [
    "cache/**",
    "credentials/**",
    "node_modules/**",
    "opencode.json",
    "opencode.jsonc",
    "package.json",
    "plugins/**",
    "providers/**",
    "sessions/**",
  ]);
  assert.deepEqual(manifest.excludedScopes, manifest.protectedScopes);
});

test("OpenCode maps the flow-debt runtime once as a portable same-path resource", () => {
  const manifest = readJson("hosts/opencode/flow-assets.json");
  const runtime = "scripts/flow-debt.mjs";

  assert.deepEqual(
    manifest.sourceSelectors.filter((entry) => entry === runtime),
    [runtime],
  );
  assert.deepEqual(
    manifest.mappings.filter(({ source }) => source === runtime),
    [{ source: runtime, destination: runtime, role: "portable" }],
  );
});

test("OpenCode adapter mapping rejects unsupported workflows and destinations outside approved host scopes", () => {
  const manifest = readJson("hosts/opencode/flow-assets.json");
  const registry = readJson("core/workflows.json");

  assert.equal(validateOpenCodeAdapterMappings(manifest, registry), manifest);

  const unsupportedWorkflow = structuredClone(manifest);
  unsupportedWorkflow.workflows[0] = "flow-missing";
  unsupportedWorkflow.mappings.find(({ role }) => role === "adapter").workflow =
    "flow-missing";
  assert.throws(
    () => validateOpenCodeAdapterMappings(unsupportedWorkflow, registry),
    /unsupported registry workflow/i,
  );

  const outsideCommands = structuredClone(manifest);
  outsideCommands.mappings.find(({ role }) => role === "adapter").destination =
    "plugins/flow-audit.md";
  assert.throws(
    () => validateOpenCodeAdapterMappings(outsideCommands, registry),
    /mapped destination must remain/i,
  );

  const legacyRootSource = structuredClone(manifest);
  legacyRootSource.mappings.find(
    ({ workflow }) => workflow === "flow-branch",
  ).source = "commands/flow-branch.md";
  assert.throws(
    () => validateOpenCodeAdapterMappings(legacyRootSource, registry),
    /mapped destination must remain/i,
  );

  const arbitraryCore = structuredClone(manifest);
  const coreMapping = arbitraryCore.mappings.find(
    ({ source }) => source === "core/flow-debt-contract.mjs",
  );
  coreMapping.source = "core/flow-debt-foreign.mjs";
  coreMapping.destination = "core/flow-debt-foreign.mjs";
  arbitraryCore.sourceSelectors[
    arbitraryCore.sourceSelectors.indexOf("core/flow-debt-contract.mjs")
  ] = "core/flow-debt-foreign.mjs";
  assert.throws(
    () => validateOpenCodeAdapterMappings(arbitraryCore, registry),
    /approved core debt modules/i,
  );

  const duplicateRuntime = structuredClone(manifest);
  duplicateRuntime.mappings.push(
    structuredClone(
      duplicateRuntime.mappings.find(
        ({ source }) => source === "scripts/flow-debt.mjs",
      ),
    ),
  );
  assert.throws(
    () => validateOpenCodeAdapterMappings(duplicateRuntime, registry),
    /destination must remain/i,
  );

  const wrongRole = structuredClone(manifest);
  wrongRole.mappings.find(
    ({ source }) => source === "scripts/flow-debt.mjs",
  ).role = "agent";
  assert.throws(
    () => validateOpenCodeAdapterMappings(wrongRole, registry),
    /destination must remain/i,
  );

  const wrongDestination = structuredClone(manifest);
  wrongDestination.mappings.find(
    ({ source }) => source === "scripts/flow-debt.mjs",
  ).destination = "commands/flow-debt.mjs";
  assert.throws(
    () => validateOpenCodeAdapterMappings(wrongDestination, registry),
    /destination must remain/i,
  );
});

test("OpenCode Git and GitHub adapters return unavailable instead of inferring missing approval", () => {
  for (const [agent, expected] of [
    [
      "flow-branch-agent",
      /approval is unavailable, return `unavailable` without invoking the gated runtime operation/i,
    ],
    [
      "flow-git-agent",
      /approval is unavailable, return `unavailable` without invoking execute/i,
    ],
    [
      "flow-pr-agent",
      /question capability is unavailable, return `unavailable` without mutation/i,
    ],
  ])
    assert.match(read(opencodeAgent(agent)), expected);
});

test("OpenCode managed mappings include each adapter's portable skills, runtime dependencies, and debt core modules", () => {
  const manifest = readJson("hosts/opencode/flow-assets.json");
  const portable = manifest.mappings.filter(({ role }) => role === "portable");

  assert.deepEqual(
    portable.filter(({ source }) => source.startsWith("core/")),
    portableDebtCore.map((source) => ({
      source,
      destination: source,
      role: "portable",
    })),
  );
  assert.deepEqual(
    manifest.sourceSelectors.filter((source) => source.startsWith("core/")),
    portableDebtCore,
  );
  assert.deepEqual(
    portable.find(
      ({ source }) => source === "scripts/lib/flow-debt-execution.mjs",
    ),
    {
      source: "scripts/lib/flow-debt-execution.mjs",
      destination: "scripts/lib/flow-debt-execution.mjs",
      role: "portable",
    },
  );
  assert.deepEqual(
    portable.find(({ source }) => source === "scripts/lib/flow-debt-store.mjs"),
    {
      source: "scripts/lib/flow-debt-store.mjs",
      destination: "scripts/lib/flow-debt-store.mjs",
      role: "portable",
    },
  );

  for (const skill of readJson("package.json").pi.skills) {
    assert.deepEqual(
      portable.find(({ source }) => source === `${skill}/**`),
      {
        source: `${skill}/**`,
        destination: `${skill}/**`,
        role: "portable",
      },
    );
  }
  for (const runtime of readJson("core/workflows.json")
    .workflows.map(({ runtime }) => runtime)
    .filter(Boolean))
    assert.deepEqual(
      portable.find(({ source }) => source === runtime),
      { source: runtime, destination: runtime, role: "portable" },
    );
});

test("OpenCode adapter syntax stays outside the Pi package boundary", () => {
  const packageFiles = readJson("package.json").files;
  for (const workflow of readOnlyWorkflows) {
    const adapter = read(opencodeCommand(workflow));
    assert.match(adapter, /~\/\.config\/opencode\/skills\//);
    assert.equal(
      packageFiles.some((selector) =>
        opencodeCommand(workflow).startsWith(selector.replace("/**", "")),
      ),
      false,
    );
  }
});

test("OpenCode Git adapters retain native argument routing and distinct approval gates", () => {
  const branch = read(opencodeCommand("flow-branch"));
  const commit = read(opencodeCommand("flow-commit"));
  const branchAgent = read(opencodeAgent("flow-branch-agent"));
  const commitAgent = read(opencodeAgent("flow-git-agent"));

  assert.match(branch, /^agent: flow-branch-agent$/m);
  assert.match(branch, /^\$ARGUMENTS$/m);
  assert.match(branchAgent, /--auto-list/);
  assert.match(branchAgent, /ask-pull/);
  assert.match(branchAgent, /ask-force-delete/);
  assert.match(branchAgent, /specific branch/i);
  assert.match(
    branchAgent,
    /approval is unavailable, return `unavailable` without invoking the gated runtime operation/i,
  );
  assert.match(commit, /^agent: flow-git-agent$/m);
  assert.match(commitAgent, /--execute --handle \*": ask/);
  assert.match(commitAgent, /one human mutation approval/i);
});

test("OpenCode Git adapters fail closed when approval is unavailable or a sealed plan is stale", () => {
  const commitAgent = read(opencodeAgent("flow-git-agent"));
  assert.match(commitAgent, /approval.*unavailable.*without invoking execute/i);
  assert.match(commitAgent, /stale.*sealed.*handle.*fresh preparation/i);
  assert.doesNotMatch(
    read("skills/flow-commit/SKILL.md"),
    /permission:\s*(?:allow|ask|deny)/i,
  );
});

test("OpenCode Git and GitHub adapter mappings preserve destinations and native contracts", () => {
  const manifest = readJson("hosts/opencode/flow-assets.json");
  const registry = readJson("core/workflows.json");
  const commandWorkflows = ["flow-branch", "flow-commit", "flow-pr"];
  const agents = [
    "flow-branch-agent",
    "flow-debt-agent",
    "flow-git-agent",
    "flow-pr-agent",
    "flow-request-agent",
    "flow-review-agent",
  ];

  assert.deepEqual(
    manifest.mappings
      .filter(({ workflow }) => commandWorkflows.includes(workflow))
      .map(({ workflow, source, destination }) => ({
        workflow,
        source,
        destination,
      })),
    commandWorkflows.map((workflow) => ({
      workflow,
      source: opencodeCommand(workflow),
      destination: `commands/${workflow}.md`,
    })),
  );
  assert.equal(
    manifest.mappings.some(
      ({ source }) => source === opencodeCommand("flow-auto-deliver"),
    ),
    false,
  );
  assert.deepEqual(
    manifest.mappings
      .filter(({ role }) => role === "agent")
      .map(({ source, destination }) => ({ source, destination })),
    agents.map((agent) => ({
      source: opencodeAgent(agent),
      destination: `agents/${agent}.md`,
    })),
  );
  for (const workflow of commandWorkflows.slice(0, 3))
    assert.equal(
      registry.workflows.some(
        ({ id, hosts }) => id === workflow && hosts.opencode === "supported",
      ),
      true,
    );
  for (const adapter of [
    ...commandWorkflows.map(opencodeCommand),
    ...agents.map(opencodeAgent),
  ])
    assert.equal(exists(adapter), true, `missing adapter: ${adapter}`);
  assert.equal(validateOpenCodeAdapterMappings(manifest, registry), manifest);
});

test("OpenCode flow-request adapter reserves cross-repository execution for native approval", () => {
  const command = read(opencodeCommand("flow-request"));
  const agent = read(opencodeAgent("flow-request-agent"));

  assert.match(command, /^agent: flow-request-agent$/m);
  assert.match(agent, /execute --target \* --request-json \*': allow/);
  assert.match(
    agent,
    /execute --target \* --request-json \* --host-approval approved': ask/,
  );
  assert.match(
    agent,
    /approval is declined or unavailable, do not invoke execute/i,
  );
  assert.match(
    agent,
    /same-repository or outbox result, invoke the plain execute form/i,
  );
  assert.match(
    agent,
    /Never add `--host-approval approved` without the native prompt/i,
  );
});

test("OpenCode PR adapter owns native clarification and one execute approval", () => {
  const command = read(opencodeCommand("flow-pr"));
  const agent = read(opencodeAgent("flow-pr-agent"));
  assert.match(command, /OpenCode's `question` tool/i);
  assert.match(agent, /^ {2}question: allow$/m);
  assert.match(agent, /--execute --handle \*": ask/);
  assert.match(
    agent,
    /question capability is unavailable, return `unavailable` without mutation/i,
  );
  assert.match(
    agent,
    /Drift, blocked, partial, failure, or unknown effects require fresh preparation/i,
  );
  assert.doesNotMatch(
    read("skills/flow-pr/SKILL.md"),
    /OpenCode|apply_patch|question tool/i,
  );
});
