import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, ...file.split("/")), "utf8");

test("flow-pr command, agent, and skill require an explicit approved execute request", () => {
  const command = read("commands/flow-pr.md"); const agent = read("agents/flow-pr-agent.md"); const skill = read("skills/flow-pr/SKILL.md"); const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-pr-agent$/m); assert.match(contract, /--inspect --base/); assert.match(contract, /--materialize-request --request-base64/); assert.match(contract, /--execute --request/); assert.match(contract, /explicit user approval/i); assert.match(agent, /task:\n    "\*": deny/); assert.match(agent, /git push\*": deny/); assert.match(agent, /"gh \*": deny/); assert.match(agent, /edit: deny/); assert.match(agent, /--materialize-request --request-base64 \*": allow/); assert.match(agent, /--execute --request \*": ask/);
  assert.match(contract, /OS-temporary request file/i); assert.match(contract, /Never use generic shell writes or edits|Do not use shell redirection, generic writes, or edits/i);
});
test("flow-pr surfaces omit retired publication authority and direct mutation semantics", () => {
  const contract = ["commands/flow-pr.md", "agents/flow-pr-agent.md", "skills/flow-pr/SKILL.md", "scripts/flow-pr.mjs"].map(read).join("\n");
  assert.match(contract, /Never use `--auto`/);
  assert.doesNotMatch(read("scripts/flow-pr.mjs"), /gentle-ai|planId|journal|--auto|create-tag|promotion|release|chain|tracker/i);
});
test("flow-commit and flow-auto-deliver remain commit-only", () => {
  const commit = read("commands/flow-commit.md"); const auto = read("commands/flow-auto-deliver.md"); const runtime = read("scripts/flow-commit.mjs");
  assert.match(`${commit}\n${auto}\n${runtime}`, /flow-commit/); assert.doesNotMatch(auto, /\/flow-pr/i); assert.match(auto, /Do not audit, edit, push, publish, create a PR/i);
});
