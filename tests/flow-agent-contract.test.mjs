import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "install.mjs");

function installDestination() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "flow-agent-contract-"));
  const config = { agent: { "gentle-orchestrator": {
    tools: { task: true }, permission: { task: { "*": "deny", "flow-pr-agent": "allow" } },
  } } };
  fs.writeFileSync(path.join(target, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);
  const env = { ...process.env, FLOW_SKILLS_OPENCODE_DIR: target };
  const preview = spawnSync(process.execPath, [installer], { cwd: root, encoding: "utf8", env });
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  const applied = spawnSync(process.execPath, [installer, "--apply", "--expected-target-commit", plan.target.commit,
    "--expected-plan-id", plan.planId], { cwd: root, encoding: "utf8", env });
  assert.equal(applied.status, 0, applied.stderr);
  return target;
}

function wildcardMatch(value, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`).test(value);
}

function resolveBashPermission(rules, command) {
  return rules.filter((rule) => rule.permission === "bash" && wildcardMatch(command, rule.pattern)).at(-1)?.action;
}

function debugAgent(target, agent) {
  const result = spawnSync("opencode", ["debug", "agent", agent], {
    cwd: target, encoding: "utf8", shell: process.platform === "win32",
    env: { ...process.env, OPENCODE_CONFIG_DIR: target, OPENCODE_DISABLE_PROJECT_CONFIG: "1" },
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr);
  return JSON.parse(result.stdout).permission;
}

test("flow-pr routes through the parent orchestrator and keeps its executor non-orchestrating", () => {
  const command = fs.readFileSync(path.join(root, "commands", "flow-pr.md"), "utf8");
  const agent = fs.readFileSync(path.join(root, "agents", "flow-pr-agent.md"), "utf8");
  assert.match(command, /^agent: gentle-orchestrator$/m);
  assert.doesNotMatch(command, /^subtask:/m);
  assert.match(command, /parent `gentle-orchestrator` owns reviewer task delegation/);
  assert.match(agent, /Never invoke reviewer tasks or any other agent/);
  assert.match(agent, /^  task:\r?\n    "\*": deny$/m);
});

test("commit source and installed PR agent preserve their permission boundaries", () => {
  const target = installDestination();
  const commitAgent = fs.readFileSync(path.join(root, "agents", "flow-git-agent.md"), "utf8");
  assert.match(commitAgent, /flow-commit\.mjs\* --inspect": allow/);
  assert.match(commitAgent, /flow-commit\.mjs\* --execute\*": ask/);
  assert.match(commitAgent, /flow-commit\.mjs\* --auto\*": deny/);
  assert.match(commitAgent, /git (?:add|commit|push)\*": deny/);

  const prRules = debugAgent(target, "flow-pr-agent");
  const prScript = 'node "$HOME/.config/opencode/scripts/flow-pr.mjs"';
  for (const args of ["--scan", "--auto --dry-run", "--auto --expected-plan-id plan-ordinary",
    '--promotion-review --state-file "state.json" --refresh']) {
    assert.equal(resolveBashPermission(prRules, `${prScript} ${args}`), "allow", args);
    assert.equal(resolveBashPermission(prRules, `${prScript} ${args}; git push`), "deny", args);
  }
  assert.equal(resolveBashPermission(prRules, `${prScript} --push`), "deny");
  assert.equal(resolveBashPermission(prRules, "git push origin branch"), "deny");
});

test("commit surfaces require inspect, explicit request, and mutation approval", () => {
  const skill = fs.readFileSync(path.join(root, "skills", "flow-commit", "SKILL.md"), "utf8");
  const agent = fs.readFileSync(path.join(root, "agents", "flow-git-agent.md"), "utf8");
  const command = fs.readFileSync(path.join(root, "commands", "flow-commit.md"), "utf8");
  const autoDeliver = fs.readFileSync(path.join(root, "commands", "flow-auto-deliver.md"), "utf8");
  const contract = `${skill}\n${agent}\n${command}\n${autoDeliver}`;
  assert.match(contract, /--inspect/);
  assert.match(contract, /--execute --request/);
  assert.match(contract, /mutation approval/i);
  assert.doesNotMatch(contract, /planId|lineage|reviewed-delivery|--auto --dry-run|suffix retries/i);
  assert.doesNotMatch(autoDeliver, /flow-audit|\/flow-pr/i);
});

test("flow-pr publication remains bound to its canonical override preview", () => {
  const skill = fs.readFileSync(path.join(root, "skills", "flow-pr", "SKILL.md"), "utf8");
  assert.match(skill, /version: "3\.10"/);
  assert.match(skill, /the first `planId` is discovery-only/);
  assert.match(skill, /second canonical dry-run with the exact overrides/);
  assert.match(skill, /second dry-run's `planId` and the same byte-identical override inputs/);
  const preview = 'node "$SCRIPT" --auto --dry-run --title-override "<title>" --pr-body-file ".flow-tmp/pr-body.md"';
  const publication = 'node "$SCRIPT" --auto --expected-plan-id "<override-planId>" --title-override "<title>" --pr-body-file ".flow-tmp/pr-body.md"';
  assert.equal(preview.replace(" --dry-run", " --expected-plan-id \"<override-planId>\""), publication);
});
