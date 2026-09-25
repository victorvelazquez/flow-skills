import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import posix from "node:path/posix";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) =>
  fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
const permissionRules = (source, permission) => {
  const block =
    source.match(
      new RegExp(`^  ${permission}:\\n([\\s\\S]*?)(?=^  [a-z_]+:|^---$)`, "m"),
    )?.[1] || "";
  return [...block.matchAll(/^ {4}(["'])(.*?)\1: (allow|ask|deny)$/gm)].map(
    ([, , pattern, action]) => ({ pattern, action }),
  );
};
const expandHome = (value, home) => value.replace(/^~/, home);
const externalResource = (file) => `${file.slice(0, file.lastIndexOf("/"))}/*`;
const relativeResource = (pathApi, worktree, file) =>
  pathApi.relative(worktree, file).split(pathApi.sep).join("/");
const matchesPermissionPattern = (
  pattern,
  resource,
  { windows = false } = {},
) =>
  pattern === "*" ||
  new RegExp(
    `^${pattern
      .replaceAll("\\", "/")
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")}$`,
    windows ? "i" : "",
  ).test(resource.replaceAll("\\", "/"));
const permissionFor = (rules, resource, home, options) =>
  rules.reduce((action, rule) => {
    const pattern = expandHome(rule.pattern, home);
    return matchesPermissionPattern(pattern, resource, options)
      ? rule.action
      : action;
  }, undefined);
test("flow-pr command, agent, and skill expose direct authorized execution", () => {
  const command = read("hosts/opencode/commands/flow-pr.md");
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  const skill = read("skills/flow-pr/SKILL.md");
  const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-pr-agent$/m);
  assert.match(contract, /bare `--prepare`/);
  assert.match(contract, /explicit.*`--base`/i);
  assert.match(contract, /--prepare --handle/);
  assert.match(contract, /intentPath/);
  assert.match(contract, /--execute --handle/);
  for (const surface of [command, agent, skill])
    assert.doesNotMatch(
      surface,
      /(?:is|as|requires|request) (?:the )?(?:one human mutation approval|one approval|second approval)/i,
    );
  assert.match(agent, /task:\n {4}"\*": deny/);
  assert.match(agent, /git push\*": deny/);
  assert.match(agent, /"gh \*": deny/);
  assert.match(agent, /edit:\n {4}"\*": deny/);
  assert.match(agent, /flow-pr-request-\*\/intent\.json": allow/);
  assert.match(agent, /--prepare\*": allow/);
  assert.match(agent, /--execute --handle \*": allow/);
  assert.match(contract, /runtime-created OS-temp|runtime-owned `intentPath`/i);
  assert.match(contract, /no repository edits|Never edit the repository/i);
  assert.match(
    contract,
    /never.*(?:interpolat|shell|redirect|generic shell writes)/i,
  );
  assert.doesNotMatch(
    contract,
    /materialize-request|request-base64|base64url|flow-pr\/request-v1/,
  );
});
test("Pi flow-pr prompt delegates complete execution to one named agent", () => {
  const prompt = read("hosts/pi/prompts/flow-pr.md");
  const agent = read("hosts/pi/agents/flow-pr.md");
  const skill = read("skills/flow-pr/SKILL.md");
  assert.match(prompt, /skills\/flow-pr\/references\/output-contract\.md/);

  assert.doesNotMatch(prompt, /flow_pr_prepare|flow_pr_publish/);
  assert.match(prompt, /named `flow-pr`/);
  assert.match(prompt, /mode: "task"/);
  assert.match(prompt, /JIRA COMMENT/);
  assert.match(prompt, /subagent_run` exactly once/);

  assert.match(agent, /^tools:\n {2}- read\n {2}- bash\n {2}- edit\n---/m);
  assert.match(agent, /--execute --handle/);
  assert.match(agent, /title.*body.*draft/i);
  assert.match(agent, /Never delegate/i);
  assert.doesNotMatch(skill, /ctx\.ui\.custom|parent-TUI/i);
  assert.match(
    skill,
    /manual `\/flow-pr` invocation authorizes push and PR create\/update/i,
  );
  assert.match(skill, /base or fork ambiguity.*actionable blocker/i);
});

test("flow-pr stops on ambiguity without a question tool", () => {
  const command = read("hosts/opencode/commands/flow-pr.md");
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  for (const surface of [command, agent]) {
    assert.doesNotMatch(surface, /OpenCode(?:'s)? `question` tool/i);
    assert.match(surface, /actionable blocker/i);
  }
  assert.doesNotMatch(agent, /^ {2}question: allow$/m);
  assert.doesNotMatch(agent, /^ {2}question: ask$/m);
  assert.doesNotMatch(command, /^\$ARGUMENTS$/m);
});
test("flow-pr agent externally reads only its installed contracts before prepare", () => {
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
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
  ])
    assert.equal(permissionFor(external, unrelatedResource, home), "deny");

  const externalAllows = external
    .filter(({ action }) => action === "allow")
    .map(({ pattern }) => pattern);
  assert.deepEqual(
    externalAllows.filter((pattern) =>
      pattern.startsWith("~/.config/opencode/"),
    ),
    [
      "~/.config/opencode/skills/flow-pr/*",
      "~/.config/opencode/skills/flow-pr/references/*",
    ],
  );
  for (const broad of [
    "~/.config/opencode/**",
    "~/.config/opencode/skills/*",
    "~/.config/opencode/skills/**",
  ])
    assert.ok(!externalAllows.includes(broad));
  assert.match(
    agent,
    /Before any `--prepare` invocation, directly read[^\n]+output-contract\.md`; stop if either read fails\./,
  );
});
test("flow-pr agent permits only relative intent edits and canonical external parents", () => {
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  const edit = permissionRules(agent, "edit");
  const external = permissionRules(agent, "external_directory");
  const home = "C:/Users/opencode-test";
  const cases = [
    {
      pathApi: posix,
      worktree: "/home/victor/repo",
      intentPath: "/tmp/flow-pr-request-a1/intent.json",
      siblingPath: "/tmp/flow-pr-request-a1/sibling.json",
      siblingExternal: "/tmp/other-request-a1/*",
      globalExternal: "/tmp/*",
    },
    {
      pathApi: posix,
      worktree: "/Users/victor/Developer/repo",
      intentPath: "/var/folders/ab/cd/T/flow-pr-request-b2/intent.json",
      siblingPath: "/var/folders/ab/cd/T/flow-pr-request-b2/sibling.json",
      siblingExternal: "/var/folders/ab/cd/T/other-request-b2/*",
      globalExternal: "/var/folders/ab/cd/T/*",
    },
    {
      pathApi: path.win32,
      worktree: "C:\\Users\\victor\\Developer\\Tools\\repo",
      intentPath:
        "C:/Users/victor/AppData/Local/Temp/flow-pr-request-c3/intent.json",
      siblingPath:
        "C:/Users/victor/AppData/Local/Temp/flow-pr-request-c3/sibling.json",
      siblingExternal: "C:/Users/victor/AppData/Local/Temp/other-request-c3/*",
      globalExternal: "C:/Users/victor/AppData/Local/Temp/*",
    },
  ];
  assert.deepEqual(edit, [
    { pattern: "*", action: "deny" },
    { pattern: "../*tmp/flow-pr-request-*/intent.json", action: "allow" },
    {
      pattern: "../*var/folders/*/*/T/flow-pr-request-*/intent.json",
      action: "allow",
    },
    {
      pattern: "../*AppData/Local/Temp/flow-pr-request-*/intent.json",
      action: "allow",
    },
  ]);
  assert.deepEqual(external.slice(0, 4), [
    { pattern: "*", action: "deny" },
    { pattern: "/tmp/flow-pr-request-*/*", action: "allow" },
    { pattern: "/var/folders/*/*/T/flow-pr-request-*/*", action: "allow" },
    {
      pattern: "C:/Users/*/AppData/Local/Temp/flow-pr-request-*/*",
      action: "allow",
    },
  ]);
  for (const {
    pathApi,
    worktree,
    intentPath,
    siblingPath,
    siblingExternal,
    globalExternal,
  } of cases) {
    assert.equal(
      permissionFor(
        edit,
        relativeResource(pathApi, worktree, intentPath),
        home,
      ),
      "allow",
    );
    assert.equal(permissionFor(edit, intentPath, home), "deny");
    assert.equal(
      permissionFor(external, externalResource(intentPath), home),
      "allow",
    );
    assert.equal(
      permissionFor(
        edit,
        relativeResource(pathApi, worktree, siblingPath),
        home,
      ),
      "deny",
    );
    assert.equal(permissionFor(external, siblingExternal, home), "deny");
    assert.equal(permissionFor(external, globalExternal, home), "deny");
  }
  for (const resource of [
    "../../../tmp/other-request-a1/intent.json",
    "../../../repo/intent.json",
  ])
    assert.equal(permissionFor(edit, resource, home), "deny");
});
test("flow-pr agent preserves runtime operational fields during semantic apply_patch authoring", () => {
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  assert.match(
    agent,
    /directly read the complete runtime-created `flow-pr\/intent-v2` template/,
  );
  assert.match(agent, /Use OpenCode `apply_patch` directly/);
  assert.match(agent, /exact returned absolute `intentPath`/);
  assert.match(
    agent,
    /change only the `title`, `body`, and `draft` value lines/,
  );
  for (const field of [
    "labels",
    "updateExisting",
    "deliveryMode",
    "push",
    "schema",
  ])
    assert.match(agent, new RegExp(`\\b${field}\\b`));
  assert.match(agent, /preserve them byte-for-byte/);
  assert.match(
    agent,
    /never reconstruct, remove, reorder, or replace the whole document/,
  );
  assert.match(
    agent,
    /never use `write`, generic `edit`, Bash, shell redirection, interpolation, encoding, or any alternate path/,
  );
  assert.match(agent, /Never display[^\n]+or expose intent content/);
});
test("flow-pr surfaces omit retired publication authority and direct mutation semantics", () => {
  const contract = [
    "hosts/opencode/commands/flow-pr.md",
    "hosts/opencode/agents/flow-pr-agent.md",
    "skills/flow-pr/SKILL.md",
    "scripts/flow-pr.mjs",
  ]
    .map(read)
    .join("\n");
  assert.match(contract, /Never use automatic modes|Do not.*automatic modes/i);
  assert.doesNotMatch(
    read("scripts/flow-pr.mjs"),
    /gentle-ai|planId|journal|--auto|create-tag|promotion|release|chain|tracker|materialize-request|request-base64/i,
  );
});
test("flow-pr drafting preserves safe templates and never invents governance or evidence", () => {
  const command = read("hosts/opencode/commands/flow-pr.md");
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  const skill = read("skills/flow-pr/SKILL.md");
  const contract = `${command}\n${agent}\n${skill}`;
  assert.match(contract, /preserve its structure, headings, and checklists/i);
  for (const section of [
    "Summary",
    "Changes",
    "Validation",
    "Risks/Breaking Change",
    "Out of scope",
  ])
    assert.match(contract, new RegExp(section.replace("/", "\\/"), "i"));
  assert.match(contract, /Not run/);
  assert.match(contract, /Not provided/);
  assert.match(
    contract,
    /Never invent tests, checks, issue links, migrations, evidence, impact, labels, or chains/i,
  );
  assert.match(
    contract,
    /Preserve closing references|Preserve issue closing references/i,
  );
  assert.match(contract, /only when supplied/i);
  assert.match(
    contract,
    /without validating issues|never create\/validate\/require issues/i,
  );
  assert.match(
    contract,
    /without.*orchestrating chains|never orchestrate chains/i,
  );
  assert.match(
    contract,
    /Never derive labels, issue policy|never derive labels or issue policy/i,
  );
  assert.doesNotMatch(
    read("scripts/lib/flow-pr-drafting.mjs"),
    /gentle-ai|status:approved|type:feature|jira|review receipt|sdd/i,
  );
});
test("flow-pr candidate docs contain only v2 callable contracts", () => {
  const paths = [
    "hosts/opencode/commands/flow-pr.md",
    "hosts/opencode/agents/flow-pr-agent.md",
    "skills/flow-pr/SKILL.md",
    "openspec/changes/simplify-flow-pr/design.md",
    "openspec/changes/simplify-flow-pr/exploration.md",
    "openspec/changes/simplify-flow-pr/specs/flow-pr/spec.md",
  ];
  const contract = paths.map(read).join("\n");
  assert.doesNotMatch(
    contract,
    /--materialize-request|--request-base64|flow-pr\/request-v1|--execute --request|full request.*approv|exact request.*approv/i,
  );
  assert.match(contract, /flow-pr\/intent-v2/);
  assert.match(contract, /flow-pr\/request-v2/);
  assert.match(contract, /--execute --handle/);
  assert.match(contract, /execute\.claim|exclusive claim/i);
});
test("flow-pr renders current compact or detailed Jira output only after verified success or noop", () => {
  const skill = read("skills/flow-pr/SKILL.md");
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  const output = read("skills/flow-pr/references/output-contract.md");
  const contract = `${skill}\n${agent}\n${output}`;
  assert.doesNotMatch(output, /Historical Template/);
  for (const profile of ["Compact", "Detailed"])
    assert.match(output, new RegExp(`### ${profile}`));
  assert.match(contract, /schema.*exactly `flow-pr\/result-v1`/i);
  assert.match(contract, /status.*exactly `success` or `noop`/i);
  assert.match(contract, /phase.*exactly `verify`/i);
  assert.match(contract, /non-null verified object|verified non-null `pr`/i);
  for (const status of ["blocked", "drift", "partial", "failure"])
    assert.match(contract, new RegExp(status));
  assert.match(contract, /unknown status|unknown/);
  assert.match(
    contract,
    /suppress the entire Jira block|suppress the Jira block/i,
  );
});
test("flow-pr Jira presentation uses flat evidenced values and optional bounded subtasks", () => {
  const output = read("skills/flow-pr/references/output-contract.md");
  for (const heading of [
    "Cambios técnicos",
    "Cómo validar",
    "Evidencia",
    "Subtareas",
  ])
    assert.match(output, new RegExp(`### ${heading}`));
  for (const row of [
    "Rama",
    "Destino",
    "PR",
    "Commits",
    "Migraciones",
    "Impacto",
  ])
    assert.match(output, new RegExp(`- \\*\\*${row}:\\*\\*`));
  assert.doesNotMatch(output, /\| Dato \| Valor \|/);
  assert.match(output, /PR row MUST use `result\.pr\.url` directly/);
  assert.match(output, /`No detectado`/);
  assert.match(output, /Limit subtasks to 10/);
  assert.match(output, /at most 14 words/);
  assert.match(
    output,
    /Include `### Bugs resueltos` only for evidenced, non-trivial fixes/,
  );
  assert.match(
    output,
    /_Subtareas derivadas de commits \(sin SDD tasks detectadas\)_/,
  );
  assert.match(
    output,
    /_Subtareas derivadas de archivos cambiados \(sin commits significativos\)_/,
  );
  assert.match(
    output,
    /completed SDD task context first, meaningful commits second, and changed architectural layers last/,
  );
  assert.match(output, /Do not make Engram mandatory/);
});
test("flow-pr Jira contract requires durable evidence, manual validation, and lossless relay", () => {
  const command = read("hosts/opencode/commands/flow-pr.md");
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  const skill = read("skills/flow-pr/SKILL.md");
  const output = read("skills/flow-pr/references/output-contract.md");
  const contract = `${command}\n${agent}\n${skill}\n${output}`;
  assert.ok(
    output.indexOf("### Validación ejecutada") <
      output.indexOf("### Cómo validar"),
  );
  assert.match(output, /reports only checks actually executed/i);
  assert.match(output, /No se ejecutaron validaciones automatizadas/);
  assert.match(
    output,
    /ALWAYS contains concrete manual steps a QA or reviewer can follow/i,
  );
  assert.match(
    output,
    /Cómo validar: write concrete steps a QA or reviewer can follow, not generic instructions/,
  );
  assert.match(
    output,
    /`Not run`, `Not provided`, `No se ejecutaron validaciones automatizadas`[\s\S]+prohibited as its sole content/,
  );
  for (const surface of [agent, skill])
    assert.match(
      surface,
      /never (?:use either as the Jira|as Jira) `Cómo validar` content/i,
    );
  assert.match(contract, /publication\.candidate/);
  assert.match(contract, /publication\.baseOid\.\.publication\.headOid/);
  assert.match(
    contract,
    /never inspect another (?:ref, range, working tree, or remote state|range or state)/i,
  );
  assert.match(output, /Require at least one evidenced technical change/);
  assert.match(
    output,
    /Require at least one concrete, actionable manual validation step/,
  );
  assert.match(
    output,
    /suppress the entire Jira block and return structured recovery/i,
  );
  assert.match(
    output,
    /Every subtask must be derived from the same evidenced task, commit, or path source/,
  );
  assert.match(output, /applicable derivation note/i);
  for (const surface of [command, agent, skill, output])
    assert.match(surface, /lossless relay payload/i);
  assert.match(
    contract,
    /byte-for-byte without paraphras(?:e|ing), truncat(?:e|ing), reformat(?:ting|), or summariz(?:e|ing)/i,
  );
  assert.match(
    contract,
    /unverified or insufficient-evidence|insufficient evidence/i,
  );
});
test("flow-pr keeps Jira inert and preserves the fenced block through every handoff", () => {
  const command = read("hosts/opencode/commands/flow-pr.md");
  const agent = read("hosts/opencode/agents/flow-pr-agent.md");
  const skill = read("skills/flow-pr/SKILL.md");
  const output = read("skills/flow-pr/references/output-contract.md");
  for (const surface of [command, agent, skill, output])
    assert.match(surface, /verbatim|byte-for-byte/);
  assert.match(`${command}\n${agent}\n${output}`, /Never call|never call/i);
  assert.match(
    output,
    /Never call Jira, invoke Jira APIs or CLIs, create or edit Jira comments/,
  );
  assert.doesNotMatch(
    agent,
    /^\s+"(?:jira|atl(?:assian)?)\b.*": (?:allow|ask)$/im,
  );
  assert.doesNotMatch(
    output.match(/```markdown\n([\s\S]*?)\n```/)?.[1] || "",
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
  );
  const runtime = [
    "scripts/flow-pr.mjs",
    "scripts/lib/flow-pr-executor.mjs",
    "scripts/lib/flow-pr-contracts.mjs",
  ]
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    runtime,
    /JIRA COMMENT|Cambios técnicos|Bugs resueltos|Subtareas derivadas/,
  );
});
test("flow-commit remains commit-only after Flow Auto Deliver removal", () => {
  const commit = read("hosts/opencode/commands/flow-commit.md");
  const runtime = read("scripts/flow-commit.mjs");
  const migration = read("docs/multihost-migration.md");

  assert.match(`${commit}\n${runtime}`, /flow-commit/);
  assert.equal(
    fs.existsSync(
      path.join(root, "hosts", "opencode", "commands", "flow-auto-deliver.md"),
    ),
    false,
  );
  assert.match(
    migration,
    /`flow-auto-deliver`[^\n]*Removed[^\n]*`flow-commit`[^\n]*(?:does not create PRs or push|no delivery behavior)/i,
  );
});

test("flow-branch command delegates arguments as data to its dedicated runtime-only agent", () => {
  const command = read("hosts/opencode/commands/flow-branch.md");
  const agent = read("hosts/opencode/agents/flow-branch-agent.md");
  const skill = read("skills/flow-branch/SKILL.md");
  const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-branch-agent$/m);
  assert.match(command, /^subtask: true$/m);
  assert.match(agent, /^model: openai\/gpt-5\.4-mini$/m);
  assert.match(command, /^\$ARGUMENTS$/m);
  assert.match(
    agent,
    /Load `~\/\.config\/opencode\/skills\/flow-branch\/SKILL\.md` before acting/,
  );
  assert.match(
    agent,
    /Use only `~\/\.config\/opencode\/scripts\/flow-branch\.mjs`/,
  );
  assert.match(agent, /task:\n {4}"\*": deny/);
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

test("flow-branch agent permits its installed runtime with POSIX and Windows separators", () => {
  const agent = read("hosts/opencode/agents/flow-branch-agent.md");
  const bash = permissionRules(agent, "bash");

  assert.deepEqual(bash, [
    { pattern: "*", action: "deny" },
    { pattern: 'node "*scripts/flow-branch.mjs"', action: "allow" },
    { pattern: 'node "*scripts\\flow-branch.mjs"', action: "allow" },
    { pattern: 'node "*scripts/flow-branch.mjs" *', action: "allow" },
    { pattern: 'node "*scripts\\flow-branch.mjs" *', action: "allow" },
  ]);

  for (const command of [
    'node "C:/Users/opencode-test/.config/opencode/scripts/flow-branch.mjs"',
    'node "C:/Users/opencode-test/.config/opencode/scripts/flow-branch.mjs" "dev"',
    'node "C:\\Users\\opencode-test\\.config\\opencode\\scripts\\flow-branch.mjs"',
    'node "C:\\Users\\opencode-test\\.config\\opencode\\scripts\\flow-branch.mjs" "dev"',
  ])
    assert.equal(permissionFor(bash, command), "allow");

  for (const command of [
    'node "C:/Users/opencode-test/.config/opencode/scripts/flow-pr.mjs" "dev"',
    'node "C:\\Users\\opencode-test\\.config\\opencode\\scripts\\flow-pr.mjs" "dev"',
  ])
    assert.equal(permissionFor(bash, command), "deny");
});

test("flow-commit exposes prepare, structured authoring, seal, and direct execution", () => {
  const command = read("hosts/opencode/commands/flow-commit.md");
  const agent = read("hosts/opencode/agents/flow-git-agent.md");
  const skill = read("skills/flow-commit/SKILL.md");
  const contract = `${command}\n${agent}\n${skill}`;
  assert.match(command, /^agent: flow-git-agent$/m);
  assert.match(contract, /--prepare/);
  assert.match(contract, /flow-commit\/author-intent-v1/);
  assert.match(contract, /--encode-author-intent/);
  assert.match(contract, /--author-intent --handle/);
  assert.match(contract, /--seal --handle/);
  assert.match(contract, /--execute --handle/);
  for (const surface of [command, agent, skill]) {
    assert.doesNotMatch(
      surface,
      /(?:is|as|requires|request) (?:the )?(?:one human mutation approval|one approval|second approval)/i,
    );
    assert.match(
      surface,
      /raw payload|raw JSON|payload content|Never repeat bodies/i,
    );
  }
  assert.match(agent, /bash:\n {4}"\*": deny/);
  assert.match(agent, /task:\n {4}"\*": deny/);
  assert.match(agent, /--prepare": allow/);
  assert.match(agent, /--encode-author-intent --handle \*": allow/);
  assert.match(
    agent,
    /--author-intent --handle \* --payload-b64url \*": allow/,
  );
  assert.match(agent, /--seal --handle \*": allow/);
  assert.match(agent, /--execute --handle \*": allow/);
  assert.match(agent, /git add\*": deny/);
  assert.match(agent, /git commit\*": deny/);
  assert.match(agent, /git push\*": deny/);
  assert.match(agent, /git switch\*": deny/);
  assert.match(agent, /git update-ref\*": deny/);
  assert.match(agent, /^ {2}edit: deny$/m);
  assert.match(agent, /^ {2}write: deny$/m);
  assert.match(agent, /external_directory:\n {4}"\*": deny/);
  assert.match(agent, /Never delegate/);
  assert.doesNotMatch(
    contract,
    /flow-pr\.mjs|flow-pr-agent|--execute --request|flow-commit\/request-v1|--inspect/,
  );
  assert.match(
    `${agent}\n${skill}`,
    /repository basename.*(?:branch\/HEAD|branch.*HEAD)/i,
  );
  assert.match(skill, /prepared-envelope bytes.*opaque prepare handle digest/i);
  assert.match(
    contract,
    /Never run.*automatic retry|Never use.*automatic retries/i,
  );
  assert.doesNotMatch(
    contract,
    /planId|journal|full request.*approv|exact request.*approv/i,
  );
});

test("Pi Flow Commit delegates one complete authorized workflow", () => {
  const skill = read("skills/flow-commit/SKILL.md");
  const prompt = read("hosts/pi/prompts/flow-commit.md");
  const child = read("hosts/pi/agents/flow-commit.md");
  assert.match(
    prompt,
    /subagent_run` exactly once.*named `flow-commit`.*mode: "task"/,
  );
  assert.match(child, /^tools:\n {2}- read\n {2}- bash\n---/m);
  assert.match(child, /--execute --handle/);
  assert.match(
    skill,
    /Manual `\/flow-commit` invocation authorizes local commit execution/,
  );
  for (const surface of [prompt, skill, child])
    assert.doesNotMatch(
      surface,
      /flow_commit_prepare|flow_commit_evidence|flow_commit_publish|flow_commit_cancel|ctx\.ui\.custom/,
    );
});

test("flow-commit agent permits one bounded structured correction without rereading Git facts", () => {
  const agent = read("hosts/opencode/agents/flow-git-agent.md");
  const command = read("hosts/opencode/commands/flow-commit.md");
  const skill = read("skills/flow-commit/SKILL.md");
  const contract = `${agent}\n${command}\n${skill}`;
  const bash = permissionRules(agent, "bash");

  for (const executable of [
    "scripts/flow-commit.mjs",
    "scripts\\flow-commit.mjs",
  ])
    assert.equal(
      permissionFor(
        bash,
        `node "C:/Users/opencode/.config/opencode/${executable}" --author-intent --handle opaque --payload-b64url abc_DEF-123`,
      ),
      "allow",
    );
  assert.equal(
    bash.filter(
      ({ pattern, action }) =>
        pattern.includes("--execute --handle") && action === "allow",
    ).length,
    2,
  );
  assert.equal(
    bash.some(
      ({ pattern, action }) =>
        pattern.includes("--author-intent") && action === "ask",
    ),
    false,
  );
  assert.match(
    contract,
    /`invalid-payload`[\s\S]+`invalid-intent`[\s\S]+`coverage-mismatch`[\s\S]+`invalid-branch`[\s\S]+`protected-branch`/,
  );
  assert.match(agent, /second author failure consumes authority and stops/i);
  assert.match(
    agent,
    /without rereading Git facts or preparing again|without rereading Git facts/i,
  );
  assert.match(
    contract,
    /Seal or execute failure requires fresh user action|seal failure, or execute failure/i,
  );
});

test("flow-commit planning creates a task branch when prepare reports a protected branch", () => {
  const agent = read("hosts/opencode/agents/flow-git-agent.md");
  const skill = read("skills/flow-commit/SKILL.md");

  for (const surface of [agent, skill]) {
    assert.match(surface, /`protected` is `true`/i);
    assert.match(surface, /branchName/i);
    assert.match(surface, /lowercase kebab-case task name/i);
    assert.match(
      surface,
      /`protected` is `false`[^\n]+omit|omit the field otherwise/i,
    );
    assert.match(surface, /Never keep a protected branch/i);
  }
  assert.doesNotMatch(
    skill,
    /write exactly this strict document[\s\S]{0,300}"branch":\{"action":"keep"\}/i,
  );
  assert.match(agent, /runtime derives keep\/create/i);
  assert.match(skill, /runtime derives create[\s\S]+runtime derives keep/i);
  assert.match(agent, /"git switch\*": deny/);
});

test("Flow records branch provenance only at its supported creation boundary", () => {
  const commit = `${read("hosts/opencode/agents/flow-git-agent.md")}\n${read("skills/flow-commit/SKILL.md")}`;
  const branch = `${read("hosts/opencode/agents/flow-branch-agent.md")}\n${read("skills/flow-branch/SKILL.md")}`;
  assert.match(commit, /branch\.<new>\.gh-merge-base=<source>/);
  assert.match(commit, /transactional|transactionally/);
  assert.match(commit, /rollback/i);
  assert.match(branch, /existing local or remote branch identities/);
  assert.match(
    branch,
    /never creates a new branch identity from the current source/,
  );
  assert.match(branch, /Flow Commit owns/);
});

test("flow-debt keeps preparation portable and delegates its only approval to the host adapter", () => {
  const debt = read("skills/flow-debt/SKILL.md");
  const command = read("hosts/opencode/commands/flow-debt.md");
  const agent = read("hosts/opencode/agents/flow-debt-agent.md");
  const refactor = read("skills/flow-refactor/SKILL.md");
  const reviewAgent = read("hosts/opencode/agents/flow-review-agent.md");
  const activeDebt = `${debt}\n${command}\n${agent}`;

  assert.match(
    debt,
    /Resolve `\.\.\/\.\.\/scripts\/flow-debt\.mjs` relative to this `SKILL\.md`/,
  );
  assert.match(debt, /prepare-create.*prepare-done.*prepare-archive/i);
  assert.match(debt, /execute --handle <handle> --host-approval approved/i);
  assert.match(debt, /recover --handle <handle>/i);
  assert.match(debt, /never prompt, infer consent/i);
  assert.match(command, /^agent: flow-debt-agent$/m);
  assert.match(command, /^subtask: true$/m);
  assert.match(command, /\$ARGUMENTS.*data/i);
  assert.match(
    agent,
    /Load `~\/\.config\/opencode\/skills\/flow-debt\/SKILL\.md` before acting/,
  );
  assert.match(agent, /execute --handle \* --host-approval approved': ask/);
  assert.match(agent, /sole human mutation approval/i);
  assert.match(agent, /Never ask separately, synthesize approval/i);
  assert.match(activeDebt, /already-applied.*safely-retryable.*unknown/i);
  assert.doesNotMatch(
    activeDebt,
    /Gentle|receipt|lineage|phase|delivery authority/i,
  );

  const draft = JSON.parse(debt.match(/```json\n([\s\S]*?)\n```/)?.[1] || "{}");
  assert.equal(draft.schema, "flow-debt-draft/v1");
  assert.equal(
    Object.keys(draft).sort().join(","),
    "acceptanceCriteria,evidence,priority,problem,producer,schema,scope,severity,title,verification",
  );
  assert.match(
    refactor,
    /emit exactly one neutral `flow-debt-draft\/v1` document/i,
  );
  assert.match(
    refactor,
    /does not invoke flow-debt, persist the document, or mutate storage/i,
  );
  assert.doesNotMatch(refactor, /\/flow-auto-deliver/i);
  assert.doesNotMatch(reviewAgent, /flow-auto-deliver/i);
});

test("flow-debt manual neutral drafts are exact and remain preview-only", () => {
  const debt = read("skills/flow-debt/SKILL.md");
  const manual =
    debt.match(/## Manual neutral draft\n\n([\s\S]*?)(?=\n## |\s*$)/)?.[1] ||
    "";
  const draft = JSON.parse(
    manual.match(/```json\n([\s\S]*?)\n```/)?.[1] || "{}",
  );

  assert.match(manual, /Manually author this exact neutral v1 document/i);
  assert.deepEqual(draft, {
    schema: "flow-debt-draft/v1",
    title: "Document unclear retry behavior",
    problem: "The current behavior is unclear when a retry is requested.",
    priority: "p2",
    severity: "medium",
    scope: ["scripts/example.mjs"],
    acceptanceCriteria: ["Document the retry outcome."],
    verification: ["Read the documented retry outcome."],
    producer: { kind: "manual", reference: "local-observation" },
    evidence: [
      {
        reference: "manual:local-observation",
        summary: "Observed behavior needs documentation.",
      },
    ],
  });
  assert.match(manual, /`create-preview --draft-json <json>`/);
  assert.match(
    manual,
    /Inspect the returned candidates\s+before any lifecycle/i,
  );
  assert.doesNotMatch(manual, /host-approval|execute|prepare-/i);
});

test("flow-commit agent has no edit or external-directory exceptions", () => {
  const agent = read("hosts/opencode/agents/flow-git-agent.md");
  const edit = permissionRules(agent, "edit");
  const external = permissionRules(agent, "external_directory");
  assert.deepEqual(edit, []);
  assert.deepEqual(external, [{ pattern: "*", action: "deny" }]);
  assert.match(agent, /^ {2}edit: deny$/m);
  assert.match(agent, /^ {2}write: deny$/m);
});

test("flow-commit agent uses the runtime encoder without files or shell composition", () => {
  const agent = read("hosts/opencode/agents/flow-git-agent.md");
  assert.match(agent, /--encode-author-intent/);
  assert.match(
    agent,
    /canonical unpadded Base64URL token bounded to 6000 characters/i,
  );
  assert.match(agent, /Never encode mentally/i);
  assert.match(
    agent,
    /Never encode mentally, use shell substitution\/redirection\/interpolation, write a file/i,
  );
  assert.doesNotMatch(agent, /apply_patch|intentPath|flow-commit\/intent-v2/);
});
