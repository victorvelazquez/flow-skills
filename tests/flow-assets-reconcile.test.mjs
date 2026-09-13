import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  writeProvenance,
  verifyProvenance,
} from "../tools/lib/asset-generation.mjs";
import {
  applyReconciliation,
  buildReconciliationPlan,
} from "../tools/lib/reconciliation.mjs";

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(root, relative, bytes) {
  const target = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

function files(root) {
  const output = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else output[relative] = fs.readFileSync(absolute, "utf8");
    }
  };
  visit(root);
  return output;
}

function fixture() {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-assets-reconcile-"),
  );
  const repo = path.join(parent, "repo");
  const source = path.join(parent, "live-opencode");
  fs.mkdirSync(repo);
  fs.mkdirSync(source);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.test"]);
  git(repo, ["config", "user.name", "Test"]);
  write(
    repo,
    "package.json",
    `${JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        engines: { node: ">=18" },
        files: ["package.json"],
        pi: { skills: [] },
      },
      null,
      2,
    )}\n`,
  );
  write(
    repo,
    "hosts/pi/flow-assets.json",
    `${JSON.stringify(
      {
        $schema: "flow-host-assets/v2",
        host: "pi",
        distribution: { kind: "package-resources" },
        workflows: [],
        capabilities: { discovery: "fixture" },
        sourceSelectors: ["package.json"],
      },
      null,
      2,
    )}\n`,
  );
  write(repo, "hosts/opencode/commands/flow-a.md", "repository adapter\n");
  write(repo, "skills/flow-a/SKILL.md", "repository shared skill\n");
  write(repo, "scripts/flow-a.mjs", "repository runtime\n");
  write(
    repo,
    "hosts/opencode/flow-assets.json",
    `${JSON.stringify(
      {
        $schema: "flow-host-assets/v2",
        host: "opencode",
        distribution: { kind: "managed-deployment" },
        workflows: ["flow-a"],
        capabilities: { discovery: "slash-command" },
        sourceSelectors: ["hosts/opencode/commands/flow-a.md"],
        mappings: [
          {
            workflow: "flow-a",
            source: "hosts/opencode/commands/flow-a.md",
            destination: "commands/flow-a.md",
            role: "adapter",
          },
        ],
        protectedScopes: ["opencode.json"],
        excludedScopes: ["opencode.json"],
      },
      null,
      2,
    )}\n`,
  );
  writeProvenance(repo);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "fixture"]);
  write(source, "commands/flow-a.md", "live adapter correction\n");
  write(source, "skills/flow-a/SKILL.md", "live shared change\n");
  write(source, "scripts/flow-a.mjs", "live runtime change\n");
  write(source, "flow-generation.lock.json", "live lock change\n");
  write(source, "credentials/token.json", "must-not-be-read\n");
  write(source, "sessions/current.json", "must-not-be-read\n");
  write(source, "opencode.json", "must-not-be-read\n");
  write(source, "commands/personal.md", "must-not-be-read\n");
  return { repo, source };
}

function productionShapedFixture() {
  const item = fixture();
  write(
    item.repo,
    "hosts/opencode/agents/flow-a-agent.md",
    "repository agent\n",
  );
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(item.repo, "hosts/opencode/flow-assets.json"),
      "utf8",
    ),
  );
  manifest.workflows = ["flow-a"];
  manifest.sourceSelectors = [
    "hosts/opencode/agents/flow-a-agent.md",
    "hosts/opencode/commands/flow-a.md",
    "scripts/flow-a.mjs",
    "skills/flow-a/**",
  ];
  manifest.mappings = [
    {
      source: "hosts/opencode/agents/flow-a-agent.md",
      destination: "agents/flow-a-agent.md",
      role: "agent",
    },
    {
      workflow: "flow-a",
      source: "hosts/opencode/commands/flow-a.md",
      destination: "commands/flow-a.md",
      role: "adapter",
    },
    {
      source: "scripts/flow-a.mjs",
      destination: "scripts/flow-a.mjs",
      role: "portable",
    },
    {
      source: "skills/flow-a/**",
      destination: "skills/flow-a/**",
      role: "portable",
    },
  ];
  write(
    item.repo,
    "hosts/opencode/flow-assets.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeProvenance(item.repo);

  write(item.source, "agents/flow-a-agent.md", "live agent correction\n");
  write(item.source, "commands/flow-a.md", "repository adapter\n");
  write(item.source, "scripts/flow-a.mjs", "live runtime drift\n");
  write(item.source, "skills/flow-a/SKILL.md", "live skill drift\n");
  write(item.source, "flow-generation.lock.json", "live lock drift\n");
  write(
    item.source,
    "hosts/opencode/flow-assets.json",
    "live manifest drift\n",
  );
  write(item.source, "credentials/token.json", "must-not-be-read\n");
  write(item.source, "commands/personal.md", "must-not-be-read\n");
  return item;
}

function preview(item) {
  return buildReconciliationPlan({
    host: "opencode",
    sourceRoot: item.source,
    repoRoot: item.repo,
  });
}

test("reconciliation is explicit, read-only, adapter-only, and identity-bound", () => {
  const item = fixture();
  const beforeRepo = files(item.repo);
  const beforeSource = files(item.source);
  const plan = preview(item);

  assert.equal(plan.direction, "live host -> repository");
  assert.equal(plan.host, "opencode");
  assert.deepEqual(plan.operations, [
    {
      action: "change",
      source: "commands/flow-a.md",
      destination: "hosts/opencode/commands/flow-a.md",
    },
  ]);
  assert.deepEqual(plan.reportOnly, [
    {
      action: "change",
      source: "flow-generation.lock.json",
      destination: "flow-generation.lock.json",
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(plan),
    /must-not-be-read|credentials|sessions|opencode\.json|personal\.md/,
  );
  assert.equal(
    plan.requiredApplyIds.repositoryCommit,
    git(item.repo, ["rev-parse", "HEAD"]),
  );
  assert.match(plan.planId, /^[a-f0-9]{64}$/);
  assert.deepEqual(files(item.repo), beforeRepo);
  assert.deepEqual(files(item.source), beforeSource);

  assert.throws(
    () =>
      applyReconciliation({
        host: "opencode",
        sourceRoot: item.source,
        repoRoot: item.repo,
        expectedRepositoryCommit: plan.requiredApplyIds.repositoryCommit,
        expectedPlanId: plan.planId,
      }),
    /approval/i,
  );
  assert.deepEqual(files(item.repo), beforeRepo);
});

test("approved reconciliation imports only adapters, regenerates provenance, and never changes the host", () => {
  const item = fixture();
  const plan = preview(item);
  const sourceBefore = files(item.source);
  const result = applyReconciliation({
    host: "opencode",
    sourceRoot: item.source,
    repoRoot: item.repo,
    expectedRepositoryCommit: plan.requiredApplyIds.repositoryCommit,
    expectedPlanId: plan.planId,
    approved: true,
  });

  assert.equal(result.verified, true);
  assert.equal(result.planId, plan.planId);
  assert.equal(
    fs.readFileSync(
      path.join(item.repo, "hosts/opencode/commands/flow-a.md"),
      "utf8",
    ),
    "live adapter correction\n",
  );
  assert.equal(
    fs.readFileSync(path.join(item.repo, "skills/flow-a/SKILL.md"), "utf8"),
    "repository shared skill\n",
  );
  assert.deepEqual(files(item.source), sourceBefore);
  assert.equal(verifyProvenance(item.repo).$schema, "flow-generation-lock/v2");
});

test("production-shaped reconciliation imports only changed host adapters and reports portable/control drift", () => {
  const item = productionShapedFixture();
  const plan = preview(item);
  const runtimeBefore = fs.readFileSync(
    path.join(item.repo, "scripts/flow-a.mjs"),
    "utf8",
  );

  assert.deepEqual(plan.operations, [
    {
      action: "change",
      source: "agents/flow-a-agent.md",
      destination: "hosts/opencode/agents/flow-a-agent.md",
    },
  ]);
  assert.deepEqual(
    plan.reportOnly.map(({ action, source, destination }) => ({
      action,
      source,
      destination,
    })),
    [
      {
        action: "change",
        source: "flow-generation.lock.json",
        destination: "flow-generation.lock.json",
      },
      {
        action: "change",
        source: "hosts/opencode/flow-assets.json",
        destination: "hosts/opencode/flow-assets.json",
      },
      {
        action: "change",
        source: "scripts/flow-a.mjs",
        destination: "scripts/flow-a.mjs",
      },
      {
        action: "change",
        source: "skills/flow-a/SKILL.md",
        destination: "skills/flow-a/SKILL.md",
      },
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(plan),
    /must-not-be-read|credentials|personal\.md/,
  );

  const result = applyReconciliation({
    host: "opencode",
    sourceRoot: item.source,
    repoRoot: item.repo,
    expectedRepositoryCommit: plan.requiredApplyIds.repositoryCommit,
    expectedPlanId: plan.planId,
    approved: true,
  });
  assert.equal(result.verified, true);
  assert.equal(
    fs.readFileSync(
      path.join(item.repo, "hosts/opencode/agents/flow-a-agent.md"),
      "utf8",
    ),
    "live agent correction\n",
  );
  assert.equal(
    fs.readFileSync(path.join(item.repo, "scripts/flow-a.mjs"), "utf8"),
    runtimeBefore,
  );
});

test("stale, concurrent, and failed reconciliation preserves repository preimages", () => {
  const stale = fixture();
  const stalePlan = preview(stale);
  const staleBefore = files(stale.repo);
  write(stale.source, "commands/flow-a.md", "concurrent source drift\n");
  assert.throws(
    () =>
      applyReconciliation({
        host: "opencode",
        sourceRoot: stale.source,
        repoRoot: stale.repo,
        expectedRepositoryCommit: stalePlan.requiredApplyIds.repositoryCommit,
        expectedPlanId: stalePlan.planId,
        approved: true,
      }),
    /stale|drift/i,
  );
  assert.deepEqual(files(stale.repo), staleBefore);

  const item = fixture();
  const plan = preview(item);
  const before = files(item.repo);
  assert.throws(
    () =>
      applyReconciliation({
        host: "opencode",
        sourceRoot: item.source,
        repoRoot: item.repo,
        expectedRepositoryCommit: plan.requiredApplyIds.repositoryCommit,
        expectedPlanId: plan.planId,
        approved: true,
        afterLock: () =>
          assert.throws(
            () =>
              applyReconciliation({
                host: "opencode",
                sourceRoot: item.source,
                repoRoot: item.repo,
                expectedRepositoryCommit:
                  plan.requiredApplyIds.repositoryCommit,
                expectedPlanId: plan.planId,
                approved: true,
              }),
            /already in progress/i,
          ),
        injectFailureAfterWrites: true,
      }),
    /injected/i,
  );
  assert.deepEqual(files(item.repo), before);
});

test("reconcile CLI requires explicit host, absolute source, dry-run preview, and has no implicit callers", () => {
  const tool = path.join(workspace, "tools", "flow-assets.mjs");
  for (const args of [
    ["--reconcile", "--dry-run"],
    ["--reconcile", "--host", "opencode", "--source", "relative", "--dry-run"],
    ["--reconcile", "--host", "opencode", "--source", workspace],
    ["--snapshot", "--source", workspace, "--dry-run"],
  ]) {
    const result = spawnSync(process.execPath, [tool, ...args], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, /reconcile|absolute|snapshot.*retired/i);
  }
  for (const relative of [
    "tools/lib/managed-deployment.mjs",
    "install.mjs",
    "tests/pi-package.test.mjs",
  ]) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(workspace, relative), "utf8"),
      /reconciliation\.mjs|applyReconciliation|buildReconciliationPlan/,
      relative,
    );
  }
  const engine = fs.readFileSync(tool, "utf8");
  assert.equal((engine.match(/reconciliation\.mjs/g) || []).length, 1);
  assert.ok(
    engine.indexOf('args.includes("--reconcile")') <
      engine.indexOf('args.includes("--deploy")'),
  );
  const verify = spawnSync(
    process.execPath,
    [tool, "--verify", "--host", "pi"],
    { encoding: "utf8" },
  );
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).host, "pi");
});
