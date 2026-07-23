import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "install.mjs");

function seedConfig(target, overrides = {}) {
  const config = {
    $schema: "https://opencode.ai/config.json",
    agent: { "gentle-orchestrator": {
      model: "openai/test-model",
      permission: { question: "allow", task: { "*": "deny", explore: "allow" } },
      tools: { task: true, read: true },
    } },
    permission: { bash: "ask" },
    provider: { custom: { models: { preserved: { name: "Preserved" } } } },
    ...overrides,
  };
  fs.writeFileSync(path.join(target, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

function wildcardMatch(value, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`).test(value);
}

function resolveBashPermission(rules, command) {
  return rules
    .filter((rule) => rule.permission === "bash" && wildcardMatch(command, rule.pattern))
    .at(-1)?.action;
}

test("installer copies every runtime asset and agent byte-for-byte but excludes source tests", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-install-"));
  for (const dir of ["skills", "commands", "scripts", "agents"]) {
    fs.mkdirSync(path.join(target, dir), { recursive: true });
  }
  seedConfig(target);
  fs.writeFileSync(path.join(target, "scripts", "flow-pr.test.mjs"), "stale installed test\n");
  fs.mkdirSync(path.join(target, "scripts", "lib"), { recursive: true });
  fs.writeFileSync(path.join(target, "scripts", "lib", "flow-chain-plan.test.mjs"), "stale nested test\n");
  fs.writeFileSync(path.join(target, "scripts", "user-workflow.test.mjs"), "unrelated user test\n");
  fs.writeFileSync(path.join(target, "scripts", "lib", "custom-tool.test.mjs"), "unrelated nested test\n");
  const result = spawnSync(process.execPath, [installer], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const runtimeRoots = ["scripts", "agents"];
  for (const runtimeRoot of runtimeRoots) {
    for (const source of filesUnder(path.join(root, runtimeRoot))) {
      const relative = path.relative(path.join(root, runtimeRoot), source);
      if (runtimeRoot === "agents" && !path.basename(source).startsWith("flow-")) continue;
      const installed = path.join(target, runtimeRoot, relative);
      assert.equal(fs.existsSync(installed), true, installed);
      assert.deepEqual(fs.readFileSync(installed), fs.readFileSync(source), relative);
    }
  }
  assert.equal(fs.existsSync(path.join(target, "tests")), false);
  assert.equal(fs.existsSync(path.join(target, "scripts", "flow-pr.test.mjs")), false);
  assert.equal(fs.existsSync(path.join(target, "scripts", "lib", "flow-chain-plan.test.mjs")), false);
  assert.equal(fs.readFileSync(path.join(target, "scripts", "user-workflow.test.mjs"), "utf8"), "unrelated user test\n");
  assert.equal(fs.readFileSync(path.join(target, "scripts", "lib", "custom-tool.test.mjs"), "utf8"), "unrelated nested test\n");
  assert.equal(fs.existsSync(path.join(target, "agents", "flow-pr-agent.md")), true);
  assert.equal(fs.existsSync(path.join(target, "scripts", "lib", "flow-audit-cache.mjs")), true);
  assert.equal(fs.existsSync(path.join(target, "scripts", "lib", "dotnet-format.mjs")), true);
  assert.deepEqual(
    fs.readFileSync(path.join(target, "skills", "ui-design-system", "SKILL.md")),
    fs.readFileSync(path.join(root, "skills", "ui-design-system", "SKILL.md")),
  );
});

test("installer dry-run reports Flow-owned stale tests without deleting any test assets", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-dry-run-cleanup-"));
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  seedConfig(target);
  const owned = path.join(target, "scripts", "flow-pr.test.mjs");
  const unrelated = path.join(target, "scripts", "user-workflow.test.mjs");
  fs.writeFileSync(owned, "stale installed test\n");
  fs.writeFileSync(unrelated, "unrelated user test\n");

  const result = spawnSync(process.execPath, [installer, "--dry-run"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /flow-pr\.test\.mjs — would remove stale Flow test/);
  assert.equal(fs.existsSync(owned), true);
  assert.equal(fs.readFileSync(unrelated, "utf8"), "unrelated user test\n");
});

test("flow-pr routes through the parent orchestrator and keeps its executor non-orchestrating", () => {
  const command = fs.readFileSync(path.join(root, "commands", "flow-pr.md"), "utf8");
  const agent = fs.readFileSync(path.join(root, "agents", "flow-pr-agent.md"), "utf8");
  assert.match(command, /^agent: gentle-orchestrator$/m);
  assert.doesNotMatch(command, /^subtask:/m);
  assert.match(command, /parent `gentle-orchestrator` owns reviewer task delegation/);
  assert.match(agent, /Never invoke reviewer tasks or any other agent/);
  assert.match(agent, /^  task:\r?\n    "\*": deny$/m);
});

test("installer adds only flow-pr-agent, backs up mutations, and reinstall is idempotent", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-config-"));
  const original = seedConfig(target);
  const configFile = path.join(target, "opencode.json");
  const backupFile = `${configFile}.flow-skills.bak`;
  const install = () => spawnSync(process.execPath, [installer], {
    cwd: root, encoding: "utf8", env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target },
  });
  const first = install();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(backupFile, "utf8")), original);
  const installed = JSON.parse(fs.readFileSync(configFile, "utf8"));
  assert.deepEqual(installed.agent["gentle-orchestrator"].permission.task,
    { "*": "deny", explore: "allow", "flow-pr-agent": "allow" });
  const expected = structuredClone(original);
  expected.agent["gentle-orchestrator"].permission.task["flow-pr-agent"] = "allow";
  assert.deepEqual(installed, expected);
  const backup = fs.readFileSync(backupFile);
  const second = install();
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.deepEqual(fs.readFileSync(backupFile), backup);
  assert.deepEqual(JSON.parse(fs.readFileSync(configFile, "utf8")), installed);
});

test("asset copy failure leaves opencode config byte-identical and permission inactive", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-copy-failure-"));
  seedConfig(target);
  const configFile = path.join(target, "opencode.json");
  const original = fs.readFileSync(configFile);
  const result = spawnSync(process.execPath, [installer], {
    cwd: root, encoding: "utf8", env: {
      ...process.env, FLOW_SKILLS_OPENCODE_DIR: target, FLOW_SKILLS_TEST_FAIL_COPY_AT: "2",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Injected asset copy failure at copy 2/);
  assert.deepEqual(fs.readFileSync(configFile), original);
  assert.equal(JSON.parse(fs.readFileSync(configFile, "utf8"))
    .agent["gentle-orchestrator"].permission.task["flow-pr-agent"], undefined);
  assert.equal(fs.existsSync(`${configFile}.flow-skills.bak`), false);
});

test("installer fails closed before copying assets for unsupported config shapes", () => {
  for (const config of [{}, { agent: { "gentle-orchestrator": { permission: { task: true } } } },
    { agent: { "gentle-orchestrator": { permission: { task: { "*": "allow" } } } } }]) {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-unsupported-"));
    fs.writeFileSync(path.join(target, "opencode.json"), JSON.stringify(config));
    const result = spawnSync(process.execPath, [installer], {
      cwd: root, encoding: "utf8", env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target },
    });
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(path.join(target, "agents", "flow-pr-agent.md")), false);
  }
});

test("installed flow commit permissions handle quoted paths and keep dangerous modes denied", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-permissions-"));
  for (const dir of ["skills", "commands", "scripts", "agents"]) {
    fs.mkdirSync(path.join(target, dir), { recursive: true });
  }
  seedConfig(target);

  const installResult = spawnSync(process.execPath, [installer], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target },
  });
  assert.equal(installResult.status, 0, installResult.stdout + installResult.stderr);

  const configResult = spawnSync("opencode", ["debug", "agent", "flow-git-agent"], {
    cwd: target,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: target,
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    },
  });
  assert.equal(configResult.status, 0, configResult.error?.message ?? configResult.stdout + configResult.stderr);
  const rules = JSON.parse(configResult.stdout).permission;
  const quotedScript = 'node "$HOME/.config/opencode/scripts/flow-commit.mjs"';

  const readOnlyCommands = [
    `${quotedScript} --auto --dry-run`,
    `${quotedScript} --analyze`,
    `${quotedScript} --summary`,
  ];
  for (const command of readOnlyCommands) assert.equal(resolveBashPermission(rules, command), "allow");
  for (const suffix of ["; git push", "&& git push", "| git push", "`git push`", "$(git push)", "> output.txt"]) {
    for (const command of readOnlyCommands) {
      assert.equal(resolveBashPermission(rules, `${command} ${suffix}`), "ask", `${command} ${suffix}`);
    }
  }
  assert.equal(resolveBashPermission(rules, `${quotedScript} --auto --expected-plan-id plan-123`), "ask");
  assert.equal(resolveBashPermission(rules, `${quotedScript} --commit`), "deny");
  assert.equal(resolveBashPermission(rules, `${quotedScript} --create-branch`), "deny");
});

test("installed flow PR permissions allow v3.10 workflows and deny composed commands", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-skills-pr-permissions-"));
  for (const dir of ["skills", "commands", "scripts", "agents"]) {
    fs.mkdirSync(path.join(target, dir), { recursive: true });
  }
  seedConfig(target);

  const installResult = spawnSync(process.execPath, [installer], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target },
  });
  assert.equal(installResult.status, 0, installResult.stdout + installResult.stderr);

  const configResult = spawnSync("opencode", ["debug", "agent", "flow-pr-agent"], {
    cwd: target,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: target,
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    },
  });
  assert.equal(configResult.status, 0, configResult.error?.message ?? configResult.stdout + configResult.stderr);
  const rules = JSON.parse(configResult.stdout).permission;
  const scripts = [
    'node "$HOME/.config/opencode/scripts/flow-pr.mjs"',
    'node "C:\\Users\\victor\\.config\\opencode\\scripts\\flow-pr.mjs"',
    'node "$SCRIPT"',
  ];
  const commandFamilies = [
    ["static", "--scan"],
    ["static", "--check-cicd"],
    ["static", "--version-context"],
    ["ordinary", "--auto --dry-run"],
    ["ordinary", "--auto --expected-plan-id plan-ordinary"],
    ["ordinary", "--auto"],
    ["override", '--auto --dry-run --title-override "fix(auth): tighten validation" --pr-body-file ".flow-tmp/pr-body.md"'],
    ["override", '--auto --expected-plan-id plan-override --title-override "fix(auth): tighten validation" --pr-body-file ".flow-tmp/pr-body.md"'],
    ["chain", '--auto --dry-run --chain-plan ".flow-tmp/chain.json"'],
    ["chain", '--auto --chain-plan ".flow-tmp/chain.json" --expected-chain-plan-id sha256:abc'],
    ["promotion-context", "--promotion-context --refresh"],
    ["promotion-review", '--promotion-review --state-file "state.json" --refresh'],
    ["promotion-prepare", '--prepare-promotion --refresh --state-file "state.json" --coordinator-state-file "coordinator.json" --expected-promotion-plan-id sha256:def'],
    ["promotion-publish", '--publish-promotion --state-file "state.json" --coordinator-state-file "coordinator.json" --expected-promotion-plan-id sha256:def'],
  ];
  const suffixes = [
    "; git push", "&& git push", "|| git push", "| git push", "`git push`", "$(git push)",
    "> output.txt", ">> output.txt", "2> output.txt", "2>> output.txt", "& git push",
    "< input.txt", "<< input.txt", "<<< input.txt", "<(git push)",
    "\r git push", "\n git push", "\r\ngit push",
  ];

  for (const script of scripts) {
    for (const [family, args] of commandFamilies) {
      const command = `${script} ${args}`;
      assert.equal(resolveBashPermission(rules, command), "allow", `${family}: ${command}`);
      for (const suffix of suffixes) {
        assert.equal(resolveBashPermission(rules, `${command} ${suffix}`), "deny", `${family}: ${command} ${JSON.stringify(suffix)}`);
      }
    }
    for (const args of [
      '--finalize-chain-tracker --chain-plan "chain.json"',
      '--auto --finalize-chain-tracker --chain-plan "chain.json"',
      '--auto --chain-plan "chain.json" --finalize-chain-tracker',
      '--finalize-chain-tracker --chain-plan "chain.json" --auto',
    ]) assert.equal(resolveBashPermission(rules, `${script} ${args}`), "ask");
    assert.equal(resolveBashPermission(rules, `${script} --push`), "deny");
    assert.equal(resolveBashPermission(rules, `${script} --create-pr --target development`), "deny");
  }

  for (const command of ["git status --short", "git diff --stat", "git log -1", "git show HEAD",
    "git rev-parse --show-toplevel", "git merge-base HEAD origin/main"]) {
    assert.equal(resolveBashPermission(rules, command), "allow", command);
    for (const suffix of suffixes) {
      assert.equal(resolveBashPermission(rules, `${command} ${suffix}`), "deny", `${command} ${JSON.stringify(suffix)}`);
    }
  }

  const firstFlowAllow = rules.findIndex((rule) => rule.permission === "bash"
    && rule.action === "allow" && rule.pattern.includes("flow-pr.mjs"));
  const lastFlowAllow = rules.findLastIndex((rule) => rule.permission === "bash"
    && rule.action === "allow" && (rule.pattern.includes("flow-pr.mjs") || rule.pattern.includes("$SCRIPT")));
  const firstCompositionDeny = rules.findIndex((rule) => rule.permission === "bash"
    && rule.action === "deny" && /^[*].*[;&|`<>\r\n]|^[*].*\$\(/.test(rule.pattern));
  assert.notEqual(firstFlowAllow, -1);
  assert.ok(firstCompositionDeny > lastFlowAllow, "composition denials must follow every broad Flow PR allow");

  assert.equal(resolveBashPermission(rules, "node scripts/flow-audit.mjs --auto"), "deny");
  assert.equal(resolveBashPermission(rules, "node scripts/flow-commit.mjs --auto"), "deny");
  assert.equal(resolveBashPermission(rules, "git commit -m test"), "deny");
  assert.equal(resolveBashPermission(rules, "git push origin branch"), "deny");
  assert.equal(resolveBashPermission(rules, "git tag v1.0.0"), "deny");
  assert.equal(resolveBashPermission(rules, "gh pr create --title test"), "deny");
  assert.equal(resolveBashPermission(rules, "gh pr edit 1"), "deny");
  assert.equal(resolveBashPermission(rules, "gh pr merge 1"), "deny");
});

test("flow-pr v3.10 contract binds publication to the canonical override preview", () => {
  const skill = fs.readFileSync(path.join(root, "skills", "flow-pr", "SKILL.md"), "utf8");
  assert.match(skill, /version: "3\.10"/);
  assert.match(skill, /the first `planId` is discovery-only/);
  assert.match(skill, /second canonical dry-run with the exact overrides/);
  assert.match(skill, /second dry-run's `planId` and the same byte-identical override inputs/);

  const discovery = 'node "$SCRIPT" --auto --dry-run';
  const preview = 'node "$SCRIPT" --auto --dry-run --title-override "<title>" --pr-body-file ".flow-tmp/pr-body.md"';
  const publication = 'node "$SCRIPT" --auto --expected-plan-id "<override-planId>" --title-override "<title>" --pr-body-file ".flow-tmp/pr-body.md"';
  const discoveryIndex = skill.indexOf(discovery);
  const previewIndex = skill.indexOf(preview, discoveryIndex + discovery.length);
  const publicationIndex = skill.indexOf(publication, previewIndex + preview.length);
  assert.ok(discoveryIndex >= 0 && previewIndex > discoveryIndex && publicationIndex > previewIndex,
    "discovery, canonical override preview, and exact-plan publication must remain ordered");
  assert.equal(preview.replace(" --dry-run", " --expected-plan-id \"<override-planId>\""), publication,
    "publication must preserve the canonical preview override bytes");
});
