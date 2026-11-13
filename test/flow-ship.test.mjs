import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// flow-ship is instruction-only (no runtime script of its own): it chains the two verified transactions that already exist, /flow-commit and then /flow-pr,
// each through its own named agent. Its contract is the text the agent reads, so the tests pin that text and the wiring that makes `/flow-ship` exist
// (skill, prompt, package.json, README, roadmap). The decisions of the person (12 November): the chain stops before the merge (the person reviews the PR and merges),
// nothing is asked in between because running the command is the confirmation, and a failing stage shows its blocker and stops.
const root = (...p) => fileURLToPath(new URL(`../${p.join("/")}`, import.meta.url));
const read = (...p) => readFileSync(root(...p), "utf8").replace(/\r\n/g, "\n");
const SKILL = () => read("skills", "flow-ship", "SKILL.md");
const PROMPT = () => read("hosts", "pi", "prompts", "flow-ship.md");
const pkg = () => JSON.parse(read("package.json"));

test("flow-ship is wired: skill file, Pi prompt, package.json lists, README and roadmap row", () => {
  assert.ok(existsSync(root("skills", "flow-ship", "SKILL.md")));
  assert.ok(existsSync(root("hosts", "pi", "prompts", "flow-ship.md")));
  const p = pkg();
  assert.ok(p.pi.skills.includes("skills/flow-ship"));
  assert.ok(p.pi.prompts.includes("hosts/pi/prompts/flow-ship.md"));
  assert.ok(p.files.includes("skills/flow-ship/**"));
  const readme = read("README.md");
  assert.match(readme, /\| `flow-ship` \|/);
  assert.match(readme, /`flow-pr` and `flow-ship`|`flow-pr`, `flow-ship`/);
  assert.match(read("docs", "ROADMAP.md"), /\| FS6 \|[^\n]*\| Completada \|/);
});

test("the skill frontmatter names it and the prompt hands it the arguments as data, not shell syntax", () => {
  assert.match(SKILL(), /^---\nname: flow-ship\n/);
  assert.match(SKILL(), /Trigger: \/flow-ship/);
  const p = PROMPT();
  assert.match(p, /flow-ship/);
  assert.match(p, /\$ARGUMENTS/);
  assert.match(p, /untrusted data, never shell syntax/);
  assert.match(p, /`--unstage` is the only option/);
});

test("the prompt chains exactly two named agents in order, once each, in task mode: flow-commit, then flow-pr after verifying the commit with Git", () => {
  const p = PROMPT();
  assert.match(p, /`subagent_run` named `flow-commit` exactly once/);
  assert.match(p, /`subagent_run` named `flow-pr` exactly once/);
  assert.ok(p.indexOf("flow-commit") < p.indexOf("`flow-pr` exactly once"), "commit comes first");
  assert.match(p, /`mode: "task"`/);
  assert.match(p, /only after verifying its success with Git/);
  assert.doesNotMatch(p, /named `flow-base`/, "flow-base is never run by the chain");
});

test("running the command is the confirmation: it asks nothing in between, and it authorizes commit, push and PR but never merge or /flow-base", () => {
  const p = PROMPT();
  assert.match(p, /authorizes the local commit AND the push and PR create\/update/);
  assert.match(p, /never merge/i);
  assert.match(p, /never `\/flow-base`/);
  assert.match(p, /Do not ask conversational confirmation/);
  assert.match(p, /second TUI/);
  const s = SKILL();
  assert.match(s, /never merge/i);
  assert.match(s, /never run `\/flow-base`/i);
  assert.match(s, /never wait for the CI|does not wait for the CI/i);
});

test("a failing stage stops: it shows the blocker, names the command that continues and never retries on its own", () => {
  const s = SKILL();
  assert.match(s, /stop/i);
  assert.match(s, /never retry/i);
  assert.match(s, /`\/flow-commit`/);
  assert.match(s, /`\/flow-pr`/);
  assert.match(s, /run `\/flow-ship` again/i);
  assert.match(PROMPT(), /never retry on your own/);
});

test("the stages follow the state of Git, so the command can be run again: dirty tree commits then publishes, a clean branch only publishes, a clean base branch has nothing to ship", () => {
  const s = SKILL();
  for (const part of ["git status --porcelain", "git diff --cached --name-only", "origin/HEAD"]) assert.ok(s.includes(part), part);
  assert.match(s, /nothing to ship/i);
  assert.match(s, /skips the commit stage/i);
});

test("after the commit stage the parent checks with Git before it publishes: the commit moved HEAD, the tree is clean and the index is empty; a mismatch stops the chain", () => {
  const s = SKILL();
  assert.match(s, /`?HEAD`? (moved|changed|differs)/i);
  assert.match(s, /index is empty/i);
  assert.match(s, /mismatch/i);
});

test("the PR stage gets only observed evidence as data, and the Jira comment travels byte for byte", () => {
  const s = SKILL();
  assert.match(s, /observed/i);
  assert.match(s, /never claim verification you did not observe/i);
  assert.match(PROMPT(), /byte-for-byte lossless/);
  assert.match(s, /JIRA COMMENT/);
  assert.match(s, /never call Jira/i);
});

test("the answer ends with the next step for the person: review the PR, wait for a green CI, merge, then /flow-base", () => {
  const s = SKILL();
  assert.match(s, /Siguiente|Next:/);
  assert.match(s, /review the PR/i);
  assert.match(s, /green CI/i);
  assert.match(s, /`\/flow-base`/);
});

test("the existing commands keep their one-time contracts: /flow-commit still never pushes and /flow-pr still never merges", () => {
  assert.match(read("hosts", "pi", "prompts", "flow-commit.md"), /authorizes local commit execution, not push or PR/);
  assert.match(read("hosts", "pi", "prompts", "flow-pr.md"), /authorizes push and PR create\/update, never merge/);
  assert.match(read("hosts", "pi", "prompts", "flow-commit.md"), /Use `subagent_run` exactly once/);
});

test("the English rule of the repository: the skill and the prompt carry no Spanish prose", () => {
  for (const text of [SKILL(), PROMPT()]) assert.doesNotMatch(text, /\b(¿|¡|persona define|revisá|fusioná|corré)\b/i);
});
