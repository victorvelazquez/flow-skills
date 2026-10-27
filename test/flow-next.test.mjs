import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// flow-next is instruction-only (no runtime script): its contract is the text the agent reads, so the tests pin that text and
// the wiring that makes `/flow-next` exist (skill, prompt, package.json, README).
const root = (...p) => fileURLToPath(new URL(`../${p.join("/")}`, import.meta.url));
const read = (...p) => readFileSync(root(...p), "utf8").replace(/\r\n/g, "\n");
const SKILL = () => read("skills", "flow-next", "SKILL.md");
const PROMPT = () => read("hosts", "pi", "prompts", "flow-next.md");
const pkg = () => JSON.parse(read("package.json"));

test("flow-next is wired: skill file, Pi prompt, package.json lists and README row", () => {
  assert.ok(existsSync(root("skills", "flow-next", "SKILL.md")));
  assert.ok(existsSync(root("hosts", "pi", "prompts", "flow-next.md")));
  const p = pkg();
  assert.ok(p.pi.skills.includes("skills/flow-next"));
  assert.ok(p.pi.prompts.includes("hosts/pi/prompts/flow-next.md"));
  assert.ok(p.files.includes("skills/flow-next/**"));
  const readme = read("README.md");
  assert.match(readme, /\| `flow-next` \|/);
  assert.match(readme, /`flow-learn`, `flow-next` and `flow-pr`|`flow-learn`, `flow-next`, `flow-pr`/);
});

test("the skill frontmatter names it and the prompt runs it in the principal conversation (no subagent)", () => {
  assert.match(SKILL(), /^---\nname: flow-next\n/);
  assert.match(SKILL(), /Trigger: \/flow-next/);
  assert.doesNotMatch(PROMPT(), /subagent_run/);
  assert.match(PROMPT(), /flow-next/);
  assert.match(PROMPT(), /\$ARGUMENTS/);
});

test("the gate is the ciclo gate: base branch, clean tree, empty index, no stash, local base equal to remote; otherwise nothing is written", () => {
  const s = SKILL();
  for (const part of ["base branch", "clean", "index", "stash", "git fetch", "/flow-base"]) assert.ok(s.includes(part), part);
  assert.match(s, /write nothing/i);
});

test("the selection follows the roadmap rule: first Pendiente row whose table dependencies are Completada; an ID forces; ? only informs", () => {
  const s = SKILL();
  assert.match(s, /first `Pendiente` row/);
  assert.match(s, /dependencies that are rows of the table/i);
  assert.match(s, /`\/flow-next <ID>`/);
  assert.match(s, /`\/flow-next \?`/);
  assert.match(s, /`En curso`/);
});

test("the readiness checklist lists every condition and the high-risk items", () => {
  const s = SKILL();
  for (const c of ["Entrega", "Resultado visible", "ficha", "AGENTS.md", "400", "no open product or design decision"]) assert.ok(s.includes(c), c);
  for (const risk of ["data", "security", "contracts", "concurrency", "delivery"]) assert.match(s, new RegExp(risk, "i"));
});

test("it advances alone only when EVERY condition holds; otherwise it shows a summary and waits for an explicit start", () => {
  const s = SKILL();
  assert.match(s, /only when every condition holds/i);
  assert.match(s, /ask_user_choice/);
  assert.match(s, /start_task/);
  for (const part of ["what it understood", "files", "tests", "risks", "which condition failed"]) assert.match(s, new RegExp(part, "i"));
  assert.match(s, /`--confirm`/);
  assert.match(s, /needs-input/);
});

test("a row whose Notas START with «Migrada; sin verificar» is verified, never implemented, and never marked Completada without the person's OK", () => {
  const s = SKILL();
  assert.match(s, /START with «Migrada; sin verificar»/);
  for (const proof of ["merged pull requests", "commits", "passing tests", "receipts"]) assert.ok(s.includes(proof), proof);
  assert.match(s, /never mark it `Completada` without the person's OK/i);
  assert.match(s, /anywhere else in `Notas` do not count/i);
});

test("it never creates or switches branches, never commits, pushes or opens PRs, and never chains the next task", () => {
  const s = SKILL();
  assert.match(s, /never create or switch branches/i);
  assert.match(s, /\/flow-commit/);
  assert.match(s, /\/flow-pr/);
  assert.match(s, /never chain/i);
  assert.match(s, /one task per invocation/i);
  assert.match(s, /`Siguiente: ...`/);
});
