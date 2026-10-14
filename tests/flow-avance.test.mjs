import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectManagedFiles,
  readManifest,
  verifyLock,
} from "../tools/flow-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));

test("flow-avance publishes a read-only report with optional confirmed workflow handoff", () => {
  const workflow = json("core/workflows.json").workflows.find(
    ({ id }) => id === "flow-avance",
  );
  assert.deepEqual(workflow, {
    id: "flow-avance",
    contract: "skills/flow-avance/SKILL.md",
    resources: ["skills/flow-avance"],
    runtime: null,
    outcome:
      "read-only objective progress with optional confirmed next-step handoff",
    mutation: "read-only",
    hosts: { pi: "supported" },
  });
  const pkg = json("package.json");
  assert.ok(pkg.pi.skills.includes("skills/flow-avance"));
  assert.ok(pkg.pi.prompts.includes("hosts/pi/prompts/flow-avance.md"));
  assert.ok(pkg.files.includes("skills/flow-avance/**"));
  assert.deepEqual(pkg.pi.extensions, []);
  const host = json("hosts/pi/flow-assets.json");
  assert.ok(host.workflows.includes("flow-avance"));
  assert.ok(host.sourceSelectors.includes("skills/flow-avance/**"));
  const other = json("hosts/opencode/flow-assets.json");
  assert.equal(other.workflows.includes("flow-avance"), false);
  assert.equal(
    other.sourceSelectors.some((entry) => entry.includes("flow-avance")),
    false,
  );
  assert.equal(
    other.mappings.some((entry) =>
      JSON.stringify(entry).includes("flow-avance"),
    ),
    false,
  );
});

test("legacy mirror excludes flow-avance without losing unknown historical flow skills", () => {
  const manifest = readManifest(root);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "flow-avance-legacy-"));
  try {
    for (const side of ["source", "repository"]) {
      const directory = path.join(fixture, side);
      for (const file of [
        "skills/flow-avance/SKILL.md",
        "skills/flow-avance/references/reporting.md",
        "skills/flow-historical/SKILL.md",
      ]) {
        const target = path.join(directory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "fixture\n");
      }
      assert.deepEqual(collectManagedFiles(directory, manifest), [
        "skills/flow-historical/SKILL.md",
      ]);
      assert.ok(
        fs.existsSync(path.join(directory, "skills/flow-avance/SKILL.md")),
      );
    }
    assert.doesNotThrow(() => verifyLock(root));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("Pi prompt loads the skill in the parent and scopes delegation to confirmed work", () => {
  const prompt = read("hosts/pi/prompts/flow-avance.md");
  assert.match(prompt, /^description: .+$/m);
  assert.match(prompt, /Read.*`flow-avance`.*SKILL\.md/i);
  assert.match(prompt, /current Pi conversation/i);
  assert.match(prompt, /no parameters/i);
  assert.match(prompt, /Do not delegate.*report/i);
  assert.match(prompt, /ask_user_choice/);
  assert.match(
    prompt,
    /Only after.*start_next_step.*normal workflow.*delegation/i,
  );
  assert.doesNotMatch(
    prompt,
    /\$ARGUMENTS|argument-hint:|subagent_run|scripts\//,
  );
});

test("flow-avance always responds in Spanish regardless of conversation language", () => {
  for (const file of [
    "hosts/pi/prompts/flow-avance.md",
    "skills/flow-avance/SKILL.md",
    "skills/flow-avance/references/reporting.md",
  ]) {
    const content = read(file);
    assert.match(content, /Always respond in Spanish/i, file);
    assert.match(content, /clarifications.*limitations/i, file);
    assert.match(content, /Preserve.*technical identifiers.*paths/i, file);
    assert.doesNotMatch(
      content,
      /user's language|translat(?:e|ing) labels/i,
      file,
    );
  }
});

test("skill uses complete concise metadata and the skill-creator section order", () => {
  const skill = read("skills/flow-avance/SKILL.md");
  assert.match(skill, /^name: flow-avance$/m);
  assert.match(skill, /^description: "Trigger: \/flow-avance\..+"$/m);
  assert.match(skill, /^license: MIT$/m);
  assert.match(skill, /^ {2}author: .+$/m);
  assert.match(skill, /^ {2}version: "1\.1\.0"$/m);
  assert.match(skill, /^compatibility: .+Pi.+$/m);
  const sections = [
    "Activation Contract",
    "Hard Rules",
    "Decision Gates",
    "Execution Steps",
    "Output Contract",
    "References",
  ];
  let previous = -1;
  for (const section of sections) {
    const position = skill.indexOf(`## ${section}`);
    assert.ok(position > previous, `missing or misplaced ${section}`);
    previous = position;
  }
  const description = skill.match(/^description: "(.+)"$/m)[1];
  assert.ok(description.length <= 160);
  assert.ok(
    skill.split(/\s+/).length < 700,
    "keep operational guidance compact",
  );
  for (const target of [...skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
    (match) => match[1],
  )) {
    assert.equal(target.includes(":"), false, "skill references must be local");
    assert.ok(
      fs.existsSync(path.resolve(root, "skills/flow-avance", target)),
      target,
    );
  }
});

test("report phase preserves read-only boundaries and treats ODD as an existing source", () => {
  const skill = read("skills/flow-avance/SKILL.md");
  const guide = read("skills/flow-avance/references/reporting.md");
  assert.match(skill, /Pi only/i);
  assert.match(skill, /Do not write files, memory, or Todo/i);
  assert.match(skill, /Do not start implementation/i);
  assert.match(skill, /Do not initialize ODD/i);
  assert.match(guide, /Do not run tests, builds, installs/i);
  assert.match(guide, /mem_context/);
  assert.match(guide, /mem_search/);
  assert.match(guide, /mem_get_observation/);
  assert.match(guide, /unavailable|timeout/i);
  assert.match(guide, /snapshot.*not.*authority/i);
  assert.match(guide, /same objective/i);
  assert.match(guide, /Do not scan other repositories/i);
  assert.match(guide, /Never read secrets/i);
});

test("report handles preparation, ambiguity, conflicting evidence and descriptive tasks", () => {
  const guide = read("skills/flow-avance/references/reporting.md");
  for (const scenario of [
    "Preparation without ODD",
    "ODD available",
    "No recoverable context",
    "Clean session or multiple objectives",
    "Conflicting or stale evidence",
    "Objective completed or paused",
  ])
    assert.ok(guide.includes(scenario), scenario);
  for (const heading of [
    "PROYECTO Y META DE CIERRE",
    "BALANCE DE TAREAS",
    "COMPLETADO",
    "POR CONFIRMAR",
    "EN CURSO",
    "RUTA PENDIENTE · EN ORDEN",
    "DECISIONES NECESARIAS",
    "PRÓXIMO PASO",
    "EVIDENCIA Y LÍMITES",
  ])
    assert.ok(guide.includes(heading), heading);
  assert.match(guide, /action, scope and intended result/i);
  assert.match(guide, /decision is not implementation/i);
  assert.match(guide, /Do not infer.*priority.*newest/i);
  assert.match(guide, /Do not invent remaining tasks/i);
  assert.match(guide, /Do not silently switch objectives/i);
  assert.match(guide, /no percentages/i);
});

test("continuation offers one native choice after the report and fails closed", () => {
  const skill = read("skills/flow-avance/SKILL.md");
  const guide = read("skills/flow-avance/references/reporting.md");
  assert.match(skill, /report phase/i);
  assert.match(skill, /confirmed execution phase/i);
  assert.match(skill, /ordinary.*delegation/i);
  assert.match(guide, /commentary.*before.*ask_user_choice/i);
  assert.match(guide, /not.*final.*before.*selector/i);
  const choice = JSON.parse(guide.split("```json\n")[1]?.split("```")[0]);
  assert.deepEqual(Object.keys(choice).sort(), [
    "allowCustomResponse",
    "options",
    "question",
  ]);
  assert.equal(
    choice.question,
    "¿Avanzamos con el próximo paso? <paso concreto>",
  );
  assert.equal(choice.allowCustomResponse, false);
  assert.deepEqual(
    choice.options.map(({ label, value }) => [label, value]),
    [
      ["Sí", "start_next_step"],
      ["No", "stop_after_report"],
    ],
  );
  for (const option of choice.options) assert.ok(option.description.length > 0);
  assert.match(guide, /model-facing.*value.*start_next_step/);
  assert.doesNotMatch(
    guide,
    /Continue only if this call explicitly returns `details\.selection\.value`/,
  );
  assert.match(guide, /User selected:.*\(value: start_next_step\)/);
  assert.match(guide, /without a cancellation or error/);
  assert.match(
    guide,
    /No, cancellation, missing tool, UI error, or unknown response/i,
  );
  assert.match(guide, /Never infer consent from.*label.*index.*source/i);
  assert.match(guide, /Do not automatically.*backlog.*selector/i);
});

test("continuation eligibility and execution retain scope and authorization boundaries", () => {
  const guide = read("skills/flow-avance/references/reporting.md");
  for (const condition of [
    "one concrete, current step",
    "within the agreed scope",
    "executable by the principal agent",
    "no unresolved decision or external blocker",
    "complete or paused",
    "requires the user to act",
    "merely proposed or ambiguous",
  ])
    assert.ok(guide.includes(condition), condition);
  assert.match(guide, /normal workflow.*delegation/i);
  assert.match(guide, /only the displayed step/i);
  assert.match(guide, /not.*manual.*\/flow-commit.*\/flow-pr/i);
  assert.match(guide, /provider-owned consent.*destructive.*publication/i);
  assert.match(guide, /Recheck.*preconditions.*changed.*stop/i);
  assert.match(guide, /pause.*do not.*resume/i);
  assert.match(guide, /No selector is required.*no eligible step/i);
});

test("presentation uses TUI-friendly groups, item outcomes and no empty sections", () => {
  const skill = read("skills/flow-avance/SKILL.md");
  const guide = read("skills/flow-avance/references/reporting.md");
  assert.match(skill, /bold standalone labels/i);
  assert.match(skill, /Omit empty status groups/i);
  assert.match(guide, /Do not use Markdown headings, HTML tags, or tables/i);
  assert.match(guide, /Omit empty status groups/i);
  assert.match(guide, /absence is not completion/i);
  assert.match(guide, /bold action title.*separate.*result/i);
  assert.match(guide, /route.*short titles.*exceptions/i);
  assert.match(guide, /Criterio/);
  assert.match(guide, /COMPLETADO.*POR CONFIRMAR/s);
  assert.match(
    guide,
    /Always show.*PROYECTO Y META DE CIERRE.*BALANCE DE TAREAS.*PRÓXIMO PASO.*EVIDENCIA Y LÍMITES/i,
  );
  const example = guide.split("```text\n")[1]?.split("```")[0];
  assert.ok(example, "include a rendering example");
  assert.doesNotMatch(example, /^#{1,6}\s|<\/?[a-z][^>]*>|\|/im);
  assert.match(example, /\*\*✅ COMPLETADO\*\*/);
  assert.match(example, /\*\*🔵 EN CURSO\*\*/);
  for (const label of ["🎯 PROYECTO Y META DE CIERRE", "📊 BALANCE DE TAREAS", "📋 RUTA PENDIENTE · EN ORDEN", "🚀 PRÓXIMO PASO", "🔎 EVIDENCIA Y LÍMITES"])
    assert.ok(example.includes(`**${label}**`), label);
  assert.doesNotMatch(example, /^- \*\*(?:🎯|📊|✅|🔵|📋|🚀|🔎)/m);
  assert.doesNotMatch(example, /Ninguna|No hay trabajo|No hay otras tareas/);
});

test("clean sessions report the whole project without requiring objective selection", () => {
  for (const file of ["hosts/pi/prompts/flow-avance.md", "skills/flow-avance/SKILL.md", "skills/flow-avance/references/reporting.md"]) {
    const content = read(file);
    assert.match(content, /whole current project's approved scope/i, file);
    assert.match(content, /clean sessions/i, file);
    assert.doesNotMatch(content, /Use an explicitly selected objective; otherwise ask|Several objectives, none selected/i, file);
  }
  const guide = read("skills/flow-avance/references/reporting.md");
  assert.match(guide, /read the master roadmap.*linked task authorities/i);
  assert.match(guide, /Missing conversation history alone is not a reason to stop/i);
  assert.match(guide, /not a full code audit or ecosystem-wide inspection/i);
});

test("balance counts distinct deliverable tasks without inventing unknown totals", () => {
  const guide = read("skills/flow-avance/references/reporting.md");
  assert.match(guide, /Deduplicate aliases.*parent fronts and technical subtasks are not extra tasks/i);
  assert.match(guide, /Remaining defined tasks include the current task exactly once/i);
  assert.match(guide, /Tasks implemented but not delivered remain in this count/i);
  assert.match(guide, /undefined fronts separately.*unknown task quantity, unknown scope, or both/i);
  assert.match(guide, /Total restante: todavía indeterminado/);
  assert.match(guide, /never add fronts to task totals/i);
  assert.match(guide, /Show completed-task counts only if authoritative history supports them/i);
  assert.match(guide, /source-reported, not verified/i);
  assert.match(guide, /other projects' documented delivery workflows/i);
});

test("route preserves approved order and explains exceptions rather than every dependency", () => {
  const guide = read("skills/flow-avance/references/reporting.md");
  assert.match(guide, /Order the route by current approved dependencies and priority/i);
  assert.match(guide, /Numbering conveys sequence/i);
  assert.match(guide, /Route numbering is a position, not a delivery-task count/i);
  assert.match(guide, /A blocked task does not authorize selecting a later independent task/i);
  assert.match(guide, /identify exactly how many are omitted when known/i);
  assert.match(guide, /No repetitive dependency prose or per-item result paragraphs/i);
  const example = guide.split("```text\n")[1].split("```")[0];
  assert.match(example, /Pendientes definidas: 3, incluida 1 en curso/);
  assert.match(example, /3\. Integración.*🔒 bloqueada:/);
  assert.match(example, /4\. Idiomas — sin desglosar; no cuenta como tareas/);
  assert.doesNotMatch(example, /después de/i);
});
