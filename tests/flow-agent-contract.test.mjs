import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import posix from "node:path/posix";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
const permissionRules = (source, permission) => {
  const block = source.match(new RegExp(`^  ${permission}:\\n([\\s\\S]*?)(?=^  [a-z_]+:|^---$)`, "m"))?.[1] || "";
  return [...block.matchAll(/^    (["'])(.*?)\1: (allow|ask|deny)$/gm)].map(([, , pattern, action]) => ({ pattern, action }));
};
const expandHome = (value, home) => value.replace(/^~/, home);
const externalResource = (file) => `${file.slice(0, file.lastIndexOf("/"))}/*`;
const relativeResource = (pathApi, worktree, file) => pathApi.relative(worktree, file).split(pathApi.sep).join("/");
const matchesPermissionPattern = (pattern, resource) => pattern === "*" || new RegExp(`^${pattern
  .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
  .replaceAll("*", ".*")}$`).test(resource);
const permissionFor = (rules, resource, home) => rules.reduce((action, rule) => {
  const pattern = expandHome(rule.pattern, home);
  return matchesPermissionPattern(pattern, resource) ? rule.action : action;
}, undefined);
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
test("flow-pr agent externally reads only its installed contracts before prepare", () => {
  const agent = read("agents/flow-pr-agent.md");
  const external = permissionRules(agent, "external_directory");
  const edit = permissionRules(agent, "edit");
  const home = "C:/Users/opencode-test";
  const files = [
    `${home}/.config/opencode/skills/flow-pr/SKILL.md`,
    `${home}/.config/opencode/skills/flow-pr/references/output-contract.md`,
  ];
  const resources = files.map(externalResource);

  for (const resource of resources) {
    assert.equal(permissionFor(external, resource, home), "allow");
    assert.notEqual(permissionFor(edit, resource, home), "allow");
  }
  for (const unrelatedResource of [
    `${home}/.config/opencode/*`,
    `${home}/.config/opencode/skills/flow-commit/*`,
    `${home}/.config/opencode/skills/skill-improver/references/*`,
  ]) assert.equal(permissionFor(external, unrelatedResource, home), "deny");

  const externalAllows = external.filter(({ action }) => action === "allow").map(({ pattern }) => pattern);
  assert.deepEqual(externalAllows.filter((pattern) => pattern.startsWith("~/.config/opencode/")), [
    "~/.config/opencode/skills/flow-pr/*",
    "~/.config/opencode/skills/flow-pr/references/*",
  ]);
  for (const broad of ["~/.config/opencode/**", "~/.config/opencode/skills/*", "~/.config/opencode/skills/**"]) assert.ok(!externalAllows.includes(broad));
  assert.match(agent, /Before any `--prepare` invocation, directly read[^\n]+output-contract\.md`; stop if either read fails\./);
});
test("flow-pr agent permits only relative intent edits and canonical external parents", () => {
  const agent = read("agents/flow-pr-agent.md");
  const edit = permissionRules(agent, "edit"); const external = permissionRules(agent, "external_directory"); const home = "C:/Users/opencode-test";
  const cases = [
    ["/home/victor/repo", "/tmp/flow-pr-request-a1/intent.json"],
    ["/home/victor/Developer/Tools/deep/repo", "/tmp/flow-pr-request-b2/intent.json"],
    ["/Users/victor/Developer/repo", "/var/folders/ab/cd/T/flow-pr-request-c3/intent.json"],
    ["C:/Users/victor/Developer/Tools/repo", "C:/Users/victor/AppData/Local/Temp/flow-pr-request-d4/intent.json"],
  ];
  for (const [worktree, intentPath] of cases) {
    assert.equal(permissionFor(edit, posix.relative(worktree, intentPath), home), "allow");
    assert.equal(permissionFor(edit, intentPath, home), "deny");
    assert.equal(permissionFor(external, externalResource(intentPath), home), "allow");
  }
  for (const resource of [
    "../../../tmp/other-request-a1/intent.json",
    "../../../tmp/flow-pr-request-a1/sibling.json",
    "../../../repo/intent.json",
  ]) assert.equal(permissionFor(edit, resource, home), "deny");
  for (const resource of [
    "/tmp/*", "/tmp/other-request-a1/*",
    "/var/folders/ab/cd/T/*", "C:/Users/victor/AppData/Local/Temp/*",
  ]) assert.equal(permissionFor(external, resource, home), "deny");
});
test("flow-pr agent requires exact apply_patch placeholder replacement", () => {
  const agent = read("agents/flow-pr-agent.md");
  assert.match(agent, /use OpenCode `apply_patch` directly/);
  assert.match(agent, /exact returned absolute `intentPath`/);
  assert.match(agent, /replace the exact existing `\{\}` placeholder line/);
  assert.match(agent, /single strict one-line `flow-pr\/intent-v2` JSON document/);
  assert.match(agent, /never use `write`, generic `edit`, Bash, shell redirection, interpolation, encoding, or any alternate path/);
  assert.match(agent, /Never display[^\n]+or expose intent content/);
});
test("flow-pr surfaces omit retired publication authority and direct mutation semantics", () => {
  const contract = ["commands/flow-pr.md", "agents/flow-pr-agent.md", "skills/flow-pr/SKILL.md", "scripts/flow-pr.mjs"].map(read).join("\n");
  assert.match(contract, /Never use automatic modes|Do not.*automatic modes/i);
  assert.doesNotMatch(read("scripts/flow-pr.mjs"), /gentle-ai|planId|journal|--auto|create-tag|promotion|release|chain|tracker|materialize-request|request-base64/i);
});
test("flow-pr drafting preserves safe templates and never invents governance or evidence", () => {
  const command = read("commands/flow-pr.md"); const agent = read("agents/flow-pr-agent.md"); const skill = read("skills/flow-pr/SKILL.md"); const contract = `${command}\n${agent}\n${skill}`;
  assert.match(contract, /preserve its structure, headings, and checklists/i);
  for (const section of ["Summary", "Changes", "Validation", "Risks/Breaking Change", "Out of scope"]) assert.match(contract, new RegExp(section.replace("/", "\\/"), "i"));
  assert.match(contract, /Not run/); assert.match(contract, /Not provided/);
  assert.match(contract, /Never invent tests, checks, issue links, migrations, evidence, impact, labels, or chains/i);
  assert.match(contract, /Preserve closing references|Preserve issue closing references/i); assert.match(contract, /only when supplied/i);
  assert.match(contract, /without validating issues|never create\/validate\/require issues/i); assert.match(contract, /without.*orchestrating chains|never orchestrate chains/i);
  assert.match(contract, /Never derive labels, issue policy|never derive labels or issue policy/i);
  assert.doesNotMatch(read("scripts/lib/flow-pr-drafting.mjs"), /gentle-ai|status:approved|type:feature|jira|review receipt|sdd/i);
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

test("flow-branch command delegates arguments as data to its dedicated runtime-only agent", () => {
  const command = read("commands/flow-branch.md");
  const agent = read("agents/flow-branch-agent.md");
  const skill = read("skills/flow-branch/SKILL.md");
  const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-branch-agent$/m);
  assert.match(command, /^subtask: true$/m);
  assert.match(command, /^\$ARGUMENTS$/m);
  assert.match(agent, /Load `~\/\.config\/opencode\/skills\/flow-branch\/SKILL\.md` before acting/);
  assert.match(agent, /Use only `~\/\.config\/opencode\/scripts\/flow-branch\.mjs`/);
  assert.match(agent, /task:\n    "\*": deny/);
  assert.match(agent, /edit: deny/);
  assert.match(agent, /write: deny/);
  assert.match(agent, /never run Git .* directly/i);
  assert.match(contract, /arguments.*data|arguments only as data/i);
  assert.match(contract, /never interpolat.*shell syntax/i);
  assert.match(contract, /--auto-list/);
  assert.match(contract, /explicit confirmation/i);
  assert.match(contract, /specific branch|specifico/i);
  assert.match(contract, /ask-force-delete/);
});

test("flow-commit exposes compact prepare, semantic intent, seal, and one approval", () => {
  const command = read("commands/flow-commit.md"); const agent = read("agents/flow-git-agent.md"); const skill = read("skills/flow-commit/SKILL.md"); const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-git-agent$/m);
  assert.match(contract, /--prepare/); assert.match(contract, /flow-commit\/intent-v2/); assert.match(contract, /--prepare --handle/); assert.match(contract, /--execute --handle/);
  for (const surface of [command, agent, skill]) {
    assert.match(surface, /one human mutation approval|one human mutation approval|one approval/i);
    assert.match(surface, /Never ask for (?:a )?separate|Do not ask for separate/i);
    assert.match(surface, /raw JSON|Never repeat bodies|without raw JSON/i);
  }
  assert.match(agent, /bash:\n    "\*": deny/);
  assert.match(agent, /task:\n    "\*": deny/);
  assert.match(agent, /--prepare": allow/);
  assert.match(agent, /--prepare --handle \*": allow/);
  assert.match(agent, /--execute --handle \*": ask/);
  assert.match(agent, /git add\*": deny/); assert.match(agent, /git commit\*": deny/); assert.match(agent, /git push\*": deny/); assert.match(agent, /git switch\*": deny/); assert.match(agent, /git update-ref\*": deny/);
  assert.match(agent, /edit:\n    "\*": deny/); assert.match(agent, /flow-commit-\*\/intent\.json": allow/);
  assert.match(agent, /Never delegate/); assert.doesNotMatch(contract, /flow-pr\.mjs|flow-pr-agent|--execute --request|flow-commit\/request-v1|--inspect/);
  assert.match(`${agent}\n${skill}`, /repository basename.*(?:branch\/HEAD|branch.*HEAD)/i);
  assert.match(skill, /prepared-envelope bytes.*opaque prepare handle digest/i);
  assert.match(contract, /Never run.*automatic retry|Never use.*automatic retries/i);
  assert.doesNotMatch(contract, /base64|planId|journal|full request.*approv|exact request.*approv/i);
});

test("flow-commit agent allows relative intent edits and canonical external parents only", () => {
  const agent = read("agents/flow-git-agent.md");
  const edit = permissionRules(agent, "edit");
  const external = permissionRules(agent, "external_directory");
  const cases = [
    {
      pathApi: path.posix,
      worktrees: ["/home/opencode/repo", "/home/opencode/worktrees/team/product/repo"],
      intentFile: "/tmp/flow-commit-a1b2/intent.json",
    },
    {
      pathApi: path.posix,
      worktrees: ["/Users/opencode/repo", "/Users/opencode/worktrees/team/product/repo"],
      intentFile: "/var/folders/ab/cd/T/flow-commit-a1b2/intent.json",
    },
    {
      pathApi: path.win32,
      worktrees: ["C:\\Users\\opencode-test\\repo", "C:\\Users\\opencode-test\\worktrees\\team\\product\\repo"],
      intentFile: "C:\\Users\\opencode-test\\AppData\\Local\\Temp\\flow-commit-a1b2\\intent.json",
    },
  ];

  for (const { pathApi, worktrees, intentFile: nativeIntentFile } of cases) {
    const intentFile = nativeIntentFile.split(pathApi.sep).join("/");
    const parentResource = externalResource(intentFile);
    assert.equal(permissionFor(external, parentResource), "allow");
    assert.equal(permissionFor(edit, intentFile), "deny");

    for (const worktree of worktrees) {
      const editResource = relativeResource(pathApi, worktree, nativeIntentFile);
      assert.equal(permissionFor(edit, editResource), "allow");
      assert.equal(permissionFor(edit, editResource.replace(/intent\.json$/, "request.json")), "deny");
      assert.equal(permissionFor(edit, editResource.replace("flow-commit-a1b2", "flow-pr-request-a1b2")), "deny");
      assert.equal(permissionFor(edit, editResource.replace("flow-commit-a1b2", "unrelated-temp")), "deny");
    }
  }
  for (const deniedResource of [
    "/tmp/*",
    "/tmp/flow-pr-request-a1b2/*",
    "/var/folders/ab/cd/T/*",
    "/var/folders/ab/cd/T/flow-pr-request-a1b2/*",
    "C:/Users/opencode-test/AppData/Local/Temp/*",
    "C:/Users/opencode-test/AppData/Local/Temp/flow-pr-request-a1b2/*",
  ]) assert.equal(permissionFor(external, deniedResource), "deny");

  assert.deepEqual(edit.filter(({ action }) => action === "allow").map(({ pattern }) => pattern), [
    "../*tmp/flow-commit-*/intent.json",
    "../*var/folders/*/*/T/flow-commit-*/intent.json",
    "../*AppData/Local/Temp/flow-commit-*/intent.json",
  ]);
  assert.deepEqual(external.filter(({ action }) => action === "allow").map(({ pattern }) => pattern), [
    "/tmp/flow-commit-*/*",
    "/var/folders/*/*/T/flow-commit-*/*",
    "C:/Users/*/AppData/Local/Temp/flow-commit-*/*",
  ]);
  assert.equal(permissionFor([{ pattern: "*", action: "allow" }, { pattern: "*", action: "deny" }], "resource"), "deny");
});

test("flow-commit agent materializes runtime intent only with OpenCode apply_patch", () => {
  const agent = read("agents/flow-git-agent.md");
  const materialization = agent.split("\n\n").find((paragraph) => paragraph.includes("OpenCode `apply_patch` directly")) || "";

  assert.match(materialization, /use OpenCode `apply_patch` directly on the existing runtime-created file/);
  assert.match(materialization, /exact returned absolute `intentPath`/);
  assert.match(materialization, /replace the exact existing `\{\}` placeholder line with the single strict one-line `flow-commit\/intent-v2` JSON document/);
  assert.match(materialization, /do not create a different file/);
  assert.match(materialization, /never use `write`, generic `edit`, Bash, shell redirection, interpolation, encoding, or any alternate path/);
  assert.match(materialization, /Never edit the repository or display intent content, the intent path/);
  assert.doesNotMatch(materialization, /use (?:the )?OpenCode `write` tool (?:specifically|directly)|use generic `edit`|use Bash/i);
});
