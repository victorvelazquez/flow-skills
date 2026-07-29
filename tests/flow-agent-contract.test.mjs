import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
const jiraTemplate = `### <FEATURE|FIX|REFACTOR|CHORE|DOCS>: <human-readable title>

<what changed and why>

### Cambios técnicos
- <reviewer-facing change>

### Cómo validar
- <concrete validation step>

### Evidencia
| Dato | Valor |
| --- | --- |
| Rama | <branch> |
| Destino | <target or both manual-release targets> |
| PR | <URL> |
| Commits | <candidate.commitCount> |
| Migraciones | <candidate.hasMigrations> |
| Impacto | <candidate.impactArea> |

### Subtareas
- <verb + what, max 8 words>`;

test("flow-pr command, agent, and skill expose prepare, one approval, and execute", () => {
  const command = read("commands/flow-pr.md"); const agent = read("agents/flow-pr-agent.md"); const skill = read("skills/flow-pr/SKILL.md"); const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-pr-agent$/m); assert.match(contract, /--prepare --base/); assert.match(contract, /--prepare --handle/); assert.match(contract, /intentPath/); assert.match(contract, /--execute --handle/);
  for (const surface of [command, agent, skill]) { assert.match(surface, /one human mutation approval|one approval/i); assert.match(surface, /Never ask for a separate|do not ask separately/i); }
  assert.match(agent, /task:\n    "\*": deny/); assert.match(agent, /git push\*": deny/); assert.match(agent, /"gh \*": deny/); assert.match(agent, /edit:\n    "\*": deny/); assert.match(agent, /flow-pr-request-\*\/intent\.json": allow/); assert.match(agent, /--prepare\*": allow/); assert.match(agent, /--execute --handle \*": ask/);
  assert.match(contract, /runtime-created OS-temp|runtime-owned `intentPath`/i); assert.match(contract, /no repository edits|Never edit the repository/i); assert.match(contract, /never.*(?:interpolat|shell|redirect|generic shell writes)/i);
  assert.doesNotMatch(contract, /materialize-request|request-base64|base64url|flow-pr\/request-v1/);
});
test("flow-pr surfaces omit retired publication authority and direct mutation semantics", () => {
  const contract = ["commands/flow-pr.md", "agents/flow-pr-agent.md", "skills/flow-pr/SKILL.md", "scripts/flow-pr.mjs"].map(read).join("\n");
  assert.match(contract, /Never use automatic modes|Do not.*automatic modes/i);
  assert.doesNotMatch(read("scripts/flow-pr.mjs"), /gentle-ai|planId|journal|--auto|create-tag|promotion|release|chain|tracker|materialize-request|request-base64/i);
});
test("flow-pr candidate docs contain only v2 callable contracts", () => {
  const paths = ["commands/flow-pr.md", "agents/flow-pr-agent.md", "skills/flow-pr/SKILL.md", "openspec/changes/simplify-flow-pr/design.md", "openspec/changes/simplify-flow-pr/exploration.md", "openspec/changes/simplify-flow-pr/specs/flow-pr/spec.md"];
  const contract = paths.map(read).join("\n");
  assert.doesNotMatch(contract, /--materialize-request|--request-base64|flow-pr\/request-v1|--execute --request|full request.*approv|exact request.*approv/i);
  assert.match(contract, /flow-pr\/intent-v2/); assert.match(contract, /flow-pr\/request-v2/); assert.match(contract, /--execute --handle/); assert.match(contract, /execute\.claim|exclusive claim/i);
});
test("flow-pr renders the historical Jira block only after verified success or noop", () => {
  const skill = read("skills/flow-pr/SKILL.md"); const agent = read("agents/flow-pr-agent.md"); const output = read("skills/flow-pr/references/output-contract.md"); const contract = `${skill}\n${agent}\n${output}`;
  const fenced = output.match(/## Historical Template[\s\S]*?```markdown\n([\s\S]*?)\n```/);
  assert.equal(fenced?.[1], jiraTemplate);
  assert.match(contract, /schema.*exactly `flow-pr\/result-v1`/i); assert.match(contract, /status.*exactly `success` or `noop`/i); assert.match(contract, /phase.*exactly `verify`/i); assert.match(contract, /non-null verified object|verified non-null `pr`/i);
  for (const status of ["blocked", "drift", "partial", "failure"]) assert.match(contract, new RegExp(status));
  assert.match(contract, /unknown status|unknown/); assert.match(contract, /suppress the entire Jira block|suppress the Jira block/i);
});
test("flow-pr Jira presentation uses evidenced values and optional bounded subtasks", () => {
  const output = read("skills/flow-pr/references/output-contract.md");
  for (const heading of ["Cambios técnicos", "Cómo validar", "Evidencia", "Subtareas"]) assert.match(output, new RegExp(`### ${heading}`));
  for (const row of ["Rama", "Destino", "PR", "Commits", "Migraciones", "Impacto"]) assert.match(output, new RegExp(`\\| ${row} \\|`));
  assert.match(output, /PR row MUST use `result\.pr\.url` directly/); assert.match(output, /`No detectado`/); assert.match(output, /Limit subtasks to 10/); assert.match(output, /at most 8 words/);
  assert.match(output, /Include `### Bugs resueltos` only for evidenced, non-trivial fixes/);
  assert.match(output, /_Subtareas derivadas de commits \(sin SDD tasks detectadas\)_/); assert.match(output, /_Subtareas derivadas de archivos cambiados \(sin commits significativos\)_/);
  assert.match(output, /completed SDD task context first, meaningful commits second, and changed architectural layers last/); assert.match(output, /Do not make Engram mandatory/);
});
test("flow-pr keeps Jira inert and preserves the fenced block through every handoff", () => {
  const command = read("commands/flow-pr.md"); const agent = read("agents/flow-pr-agent.md"); const skill = read("skills/flow-pr/SKILL.md"); const output = read("skills/flow-pr/references/output-contract.md");
  for (const surface of [command, agent, skill, output]) assert.match(surface, /verbatim|byte-for-byte/);
  assert.match(`${command}\n${agent}\n${output}`, /Never call|never call/i); assert.match(output, /Never call Jira, invoke Jira APIs or CLIs, create or edit Jira comments/);
  assert.doesNotMatch(agent, /^\s+"(?:jira|atl(?:assian)?)\b.*": (?:allow|ask)$/im);
  assert.doesNotMatch(output.match(/```markdown\n([\s\S]*?)\n```/)?.[1] || "", /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  const runtime = ["scripts/flow-pr.mjs", "scripts/lib/flow-pr-executor.mjs", "scripts/lib/flow-pr-contracts.mjs"].map(read).join("\n");
  assert.doesNotMatch(runtime, /JIRA COMMENT|Cambios técnicos|Bugs resueltos|Subtareas derivadas/);
});
test("flow-commit and flow-auto-deliver remain commit-only", () => {
  const commit = read("commands/flow-commit.md"); const auto = read("commands/flow-auto-deliver.md"); const runtime = read("scripts/flow-commit.mjs");
  assert.match(`${commit}\n${auto}\n${runtime}`, /flow-commit/); assert.doesNotMatch(auto, /\/flow-pr/i); assert.match(auto, /Do not audit, edit, push, publish, create a PR/i);
});
