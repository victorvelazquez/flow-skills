import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflows = [
  { id: "flow-commit", tools: ["read", "bash"], hint: "[instructions]" },
  { id: "flow-pr", tools: ["read", "bash", "edit"], hint: "[instructions]" },
  { id: "flow-branch", tools: ["read", "bash"], hint: "[branch-or-alias]" },
];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, "expected YAML frontmatter followed by a Markdown body");

  const values = {};
  let activeList;
  for (const line of match[1].split(/\r?\n/)) {
    const key = line.match(/^([a-z-]+):\s*(.*)$/);
    if (key) {
      const [, name, value] = key;
      if (value) values[name] = value.replace(/^"|"$/g, "");
      else {
        values[name] = [];
        activeList = name;
      }
      continue;
    }
    const item = line.match(/^ {2}- (.+)$/);
    assert.ok(item && activeList, `invalid frontmatter line: ${line}`);
    values[activeList].push(item[1]);
  }
  return { frontmatter: values, body: match[2] };
}

test("Pi Flow agents are clean, non-delegating definitions that inherit routing", () => {
  for (const { id, tools } of workflows) {
    const relative = `hosts/pi/agents/${id}.md`;
    const source = read(relative);
    const { frontmatter, body } = parseFrontmatter(source);

    assert.deepEqual(Object.keys(frontmatter).sort(), [
      "description",
      "name",
      "tools",
    ]);
    assert.equal(frontmatter.name, id);
    assert.equal(typeof frontmatter.description, "string");
    assert.deepEqual(frontmatter.tools, tools);
    assert.doesNotMatch(source, /^(?:model|thinking):/m);
    if (id === "flow-branch") {
      assert.match(body, /single workflow authority/i);
      assert.match(body, /Never delegate, invoke subagents, or hand any part/i);
    } else {
      assert.ok(body.includes(`skills/${id}/SKILL.md`));
      assert.match(body, /sole executing Flow/i);
      assert.match(body, /Never delegate/i);
    }
    assert.doesNotMatch(
      source,
      /(?:opencode|\\.config|~\/|[A-Za-z]:\\\\|permissions:|^agent:)/im,
    );
  }
});

test("Pi Flow prompts delegate each workflow as one supervised task without copying it", () => {
  for (const { id, hint } of workflows) {
    const relative = `hosts/pi/prompts/${id}.md`;
    const source = read(relative);
    const { frontmatter, body } = parseFrontmatter(source);

    assert.deepEqual(Object.keys(frontmatter).sort(), [
      "argument-hint",
      "description",
    ]);
    assert.equal(frontmatter["argument-hint"], hint);
    assert.equal(typeof frontmatter.description, "string");
    if (id === "flow-branch")
      assert.match(
        body,
        /Use `subagent_run` to delegate the complete workflow .* with `mode: "task"`\./,
      );
    else {
      assert.ok(
        body.includes(`Use \`subagent_run\` exactly once with named \`${id}\``),
      );
      assert.match(body, /mode: "task"/);
    }
    assert.ok(body.includes(`\`${id}\``));
    assert.match(body, /\$ARGUMENTS/);
    if (id === "flow-branch")
      assert.match(
        body,
        /current conversation and working-directory context unchanged/i,
      );
    if (id === "flow-branch")
      assert.doesNotMatch(
        source,
        /(?:Read the skill|runtime|--prepare|--execute|opencode|\.config|~\/|[A-Za-z]:\\)/i,
      );
  }
});
