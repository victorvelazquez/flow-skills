import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { writeProvenance } from "../tools/lib/asset-generation.mjs";
import {
  applyOpenCodeDeploy,
  buildOpenCodeDeployPlan,
} from "../tools/lib/managed-deployment.mjs";

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

function snapshot(root) {
  const result = {};
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) visit(absolute);
      else result[relative] = fs.readFileSync(absolute, "utf8");
    }
  };
  visit(root);
  return result;
}

function writeHistoricalV1Generation(repo) {
  const manifest = {
    $schema: "flow-assets/v1",
    excluded: [],
    liveMirrored: {
      libraries: [],
      patterns: [{ path: "commands/flow-a.md" }],
    },
    repoOwned: [],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const assetBytes = Buffer.from("target\n");
  write(repo, "flow-assets.json", manifestBytes);
  write(repo, "commands/flow-a.md", assetBytes);
  write(
    repo,
    "flow-assets.lock.json",
    `${JSON.stringify(
      {
        $schema: "flow-assets-lock/v1",
        capturedAt: "fixture",
        source: { kind: "opencode-user-config" },
        manifest: {
          sha256: createHash("sha256").update(manifestBytes).digest("hex"),
        },
        totals: { bytes: assetBytes.length, count: 1 },
        files: [
          {
            path: "commands/flow-a.md",
            sha256: createHash("sha256").update(assetBytes).digest("hex"),
            bytes: assetBytes.length,
            mode: "100644",
            executable: false,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function fixture({ generation = "v2" } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "flow-assets-deploy-"));
  const repo = path.join(parent, "repo");
  const destination = path.join(parent, "destination");
  fs.mkdirSync(repo);
  fs.mkdirSync(destination);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.test"]);
  git(repo, ["config", "user.name", "Test"]);
  write(repo, "README.md", "fixture\n");
  write(
    repo,
    "package.json",
    `${JSON.stringify(
      {
        name: "fixture",
        version: "1.0.0",
        engines: { node: ">=18" },
        files: ["README.md", "hosts/pi/flow-assets.json"],
        pi: { skills: [] },
      },
      null,
      2,
    )}\n`,
  );
  if (generation === "v1") {
    writeHistoricalV1Generation(repo);
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "historical v1 fixture"]);
    return {
      parent,
      repo,
      destination,
      commit: git(repo, ["rev-parse", "HEAD"]),
    };
  }
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
        sourceSelectors: ["README.md", "hosts/pi/flow-assets.json"],
      },
      null,
      2,
    )}\n`,
  );
  write(repo, "hosts/opencode/commands/flow-a.md", "target\n");
  write(repo, "skills/flow-a/SKILL.md", "portable skill\n");
  write(repo, "scripts/flow-a.mjs", "portable runtime\n");
  write(
    repo,
    "hosts/opencode/flow-assets.json",
    `${JSON.stringify(
      {
        $schema: "flow-host-assets/v2",
        host: "opencode",
        distribution: { kind: "managed-deployment" },
        workflows: [],
        capabilities: { discovery: "slash-command" },
        sourceSelectors: [
          "hosts/opencode/commands/flow-a.md",
          "scripts/flow-a.mjs",
          "skills/flow-a/**",
        ],
        mappings: [
          {
            source: "hosts/opencode/commands/flow-a.md",
            destination: "commands/flow-a.md",
            role: "legacy-adapter",
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
  return {
    parent,
    repo,
    destination,
    commit: git(repo, ["rev-parse", "HEAD"]),
  };
}

function planFor(item) {
  return buildOpenCodeDeployPlan({
    requestedRef: "HEAD",
    destinationRoot: item.destination,
    repoRoot: item.repo,
  });
}

function committedWorkspaceGeneration() {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-assets-committed-generation-"),
  );
  const repo = path.join(parent, "repo");
  const destination = path.join(parent, "destination");
  fs.mkdirSync(repo);
  fs.mkdirSync(destination);
  const generation = JSON.parse(
    fs.readFileSync(path.join(workspace, "flow-generation.lock.json"), "utf8"),
  );
  const required = new Set([
    ".gitattributes",
    "package.json",
    "flow-generation.lock.json",
    "hosts/pi/flow-assets.json",
    "hosts/pi/flow-assets.lock.json",
    "hosts/opencode/flow-assets.json",
    "hosts/opencode/flow-assets.lock.json",
    ...generation.sources.map(({ source }) => source),
  ]);
  for (const relative of required) {
    const source = path.join(workspace, ...relative.split("/"));
    const target = path.join(repo, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
  fs.cpSync(path.join(workspace, "tools"), path.join(repo, "tools"), {
    recursive: true,
  });
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "core.autocrlf", "true"]);
  git(repo, ["config", "user.email", "test@example.test"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "fixture"]);
  return { repo, destination, generation };
}

function apply(item, plan, extra = {}) {
  return applyOpenCodeDeploy({
    requestedRef: "HEAD",
    destinationRoot: item.destination,
    repoRoot: item.repo,
    expectedTargetCommit: plan.target.commit,
    expectedPlanId: plan.planId,
    ...extra,
  });
}

test("OpenCode deploy previews immutable mapped ownership and applies it transactionally", () => {
  const item = fixture();
  write(item.destination, "opencode.json", "host configuration\n");
  const before = snapshot(item.destination);
  const plan = planFor(item);

  assert.deepEqual(plan.operations, [
    { action: "add", path: "commands/flow-a.md" },
    { action: "add", path: "scripts/flow-a.mjs" },
    { action: "add", path: "skills/flow-a/SKILL.md" },
  ]);
  assert.equal(plan.host, "opencode");
  assert.equal(plan.target.commit, item.commit);
  assert.deepEqual(snapshot(item.destination), before);

  const result = apply(item, plan);
  assert.equal(result.verified, true);
  assert.equal(
    fs.readFileSync(path.join(item.destination, "commands/flow-a.md"), "utf8"),
    "target\n",
  );
  assert.equal(
    fs.readFileSync(
      path.join(item.destination, "skills/flow-a/SKILL.md"),
      "utf8",
    ),
    "portable skill\n",
  );
  assert.equal(
    fs.readFileSync(path.join(item.destination, "scripts/flow-a.mjs"), "utf8"),
    "portable runtime\n",
  );
  assert.equal(
    fs.readFileSync(path.join(item.destination, "opencode.json"), "utf8"),
    "host configuration\n",
  );
  const marker = JSON.parse(
    fs.readFileSync(
      path.join(item.destination, ".flow-skills/hosts/opencode.json"),
      "utf8",
    ),
  );
  assert.deepEqual(marker.ownedDestinationPaths, [
    "commands/flow-a.md",
    "scripts/flow-a.mjs",
    "skills/flow-a/SKILL.md",
  ]);
  assert.equal(marker.planId, plan.planId);
  assert.ok(fs.existsSync(result.backupPath));
});

test("OpenCode deploy rejects missing or stale immutable authority before backup or writes", () => {
  for (const kind of ["missing", "commit", "plan", "destination"]) {
    const item = fixture();
    const plan = planFor(item);
    const before = snapshot(item.destination);
    if (kind === "destination")
      write(item.destination, "commands/flow-a.md", "drift\n");
    const options =
      kind === "missing"
        ? { expectedPlanId: undefined }
        : kind === "commit"
          ? { expectedTargetCommit: "0".repeat(40) }
          : kind === "plan"
            ? { expectedPlanId: "0".repeat(64) }
            : {};
    assert.throws(
      () => apply(item, plan, options),
      /requires|target commit|stale|collision/i,
      kind,
    );
    assert.equal(
      fs.existsSync(path.join(item.destination, ".flow-skills/backups")),
      false,
      kind,
    );
    if (kind !== "destination")
      assert.deepEqual(snapshot(item.destination), before, kind);
  }
});

test("OpenCode deploy blocks unowned collisions and rejects marker-only deletion ownership", () => {
  const collision = fixture();
  write(collision.destination, "commands/flow-a.md", "user asset\n");
  const collisionBefore = snapshot(collision.destination);
  assert.throws(() => planFor(collision), /collision|owned/i);
  assert.deepEqual(snapshot(collision.destination), collisionBefore);

  const item = fixture();
  const first = planFor(item);
  apply(item, first);
  write(item.destination, "commands/flow-old.md", "owned old\n");
  const markerPath = path.join(
    item.destination,
    ".flow-skills/hosts/opencode.json",
  );
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  marker.ownedDestinationPaths.push("commands/flow-old.md");
  marker.ownedDestinationPaths.sort();
  fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`);
  write(item.destination, "commands/personal.md", "unowned\n");
  assert.throws(() => planFor(item), /marker.*ownership|marker.*invalid/i);
  assert.equal(
    fs.readFileSync(
      path.join(item.destination, "commands/flow-old.md"),
      "utf8",
    ),
    "owned old\n",
  );
  assert.equal(
    fs.readFileSync(
      path.join(item.destination, "commands/personal.md"),
      "utf8",
    ),
    "unowned\n",
  );
});

test("OpenCode deploy fails closed on malformed markers and restores verified pre-state after failure", () => {
  const malformed = fixture();
  fs.mkdirSync(path.join(malformed.destination, ".flow-skills/hosts"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(malformed.destination, ".flow-skills/hosts/opencode.json"),
    "{bad",
  );
  assert.throws(() => planFor(malformed), /marker.*malformed|marker.*invalid/i);
  const missing = fixture();
  fs.mkdirSync(path.join(missing.destination, ".flow-skills/hosts"), {
    recursive: true,
  });
  assert.throws(() => planFor(missing), /marker.*missing|fails closed/i);

  const item = fixture();
  const plan = planFor(item);
  assert.throws(
    () =>
      apply(item, plan, {
        afterWrites: () => {
          throw new Error("injected failure");
        },
      }),
    /injected failure/i,
  );
  assert.equal(
    fs.existsSync(path.join(item.destination, "commands/flow-a.md")),
    false,
  );
  assert.equal(
    fs.existsSync(
      path.join(item.destination, ".flow-skills/hosts/opencode.json"),
    ),
    false,
  );
  assert.ok(fs.existsSync(path.join(item.destination, ".flow-skills/backups")));
});

test("OpenCode deploy CLI previews and requires both immutable IDs before apply", () => {
  const item = fixture();
  fs.cpSync(path.join(workspace, "tools"), path.join(item.repo, "tools"), {
    recursive: true,
  });
  const tool = path.join(item.repo, "tools/flow-assets.mjs");
  const preview = spawnSync(
    process.execPath,
    [
      tool,
      "--deploy",
      "--host",
      "opencode",
      "--ref",
      "HEAD",
      "--destination",
      item.destination,
      "--dry-run",
    ],
    { encoding: "utf8" },
  );
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.host, "opencode");
  const missing = spawnSync(
    process.execPath,
    [
      tool,
      "--deploy",
      "--host",
      "opencode",
      "--ref",
      "HEAD",
      "--destination",
      item.destination,
      "--apply",
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(missing.status, 0);
  assert.match(
    missing.stderr,
    /expected-target-commit.*expected-plan-id|requires/i,
  );
  const applied = spawnSync(
    process.execPath,
    [
      tool,
      "--deploy",
      "--host",
      "opencode",
      "--ref",
      "HEAD",
      "--destination",
      item.destination,
      "--apply",
      "--expected-target-commit",
      plan.target.commit,
      "--expected-plan-id",
      plan.planId,
    ],
    { encoding: "utf8" },
  );
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(JSON.parse(applied.stdout).verified, true);
  const pi = spawnSync(
    process.execPath,
    [
      tool,
      "--deploy",
      "--host",
      "pi",
      "--ref",
      "HEAD",
      "--destination",
      item.destination,
      "--dry-run",
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(pi.status, 0);
  assert.match(pi.stderr, /only --host opencode|Pi package state/i);
});

test("v2 committed OpenCode generation survives core.autocrlf=true before preview", () => {
  const item = committedWorkspaceGeneration();
  for (const record of item.generation.sources) {
    const bytes = execFileSync("git", ["show", `HEAD:${record.source}`], {
      cwd: item.repo,
      encoding: null,
    });
    assert.equal(bytes.length, record.bytes, record.source);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      record.sha256,
      record.source,
    );
  }
  const plan = buildOpenCodeDeployPlan({
    requestedRef: "HEAD",
    destinationRoot: item.destination,
    repoRoot: item.repo,
  });
  assert.equal(plan.target.generationId, item.generation.generationId);
  assert.equal(plan.counts.add, plan.target.totals.count);
});

test("relocated OpenCode text sources are canonical and Git-protected", () => {
  const generation = JSON.parse(
    fs.readFileSync(path.join(workspace, "flow-generation.lock.json"), "utf8"),
  );
  const relocated = generation.sources
    .map(({ source }) => source)
    .filter((source) =>
      /^hosts\/opencode\/(?:agents|commands)\/flow-.*\.md$/.test(source),
    );
  assert.ok(relocated.length > 0);
  for (const source of relocated) {
    assert.equal(
      fs.readFileSync(path.join(workspace, ...source.split("/"))).includes(13),
      false,
      source,
    );
    assert.match(
      git(workspace, ["check-attr", "text", "--", source]),
      /: text: unset$/,
      source,
    );
  }
});

test("OpenCode deploy treats refs as literal Git argv and historical v1 generations use the restore fallback", () => {
  const item = fixture({ generation: "v1" });
  const marker = path.join(item.parent, "executed");
  assert.throws(
    () =>
      buildOpenCodeDeployPlan({
        requestedRef: `HEAD;touch ${marker}`,
        destinationRoot: item.destination,
        repoRoot: item.repo,
      }),
    /resolve|Git/i,
  );
  assert.equal(fs.existsSync(marker), false);
  assert.throws(
    () =>
      buildOpenCodeDeployPlan({
        requestedRef: "HEAD",
        destinationRoot: item.destination,
        repoRoot: item.repo,
      }),
    /v1|restore fallback|historical/i,
  );
});
