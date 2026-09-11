# Flow PR Output Contract

This contract is presentation-only. It never authorizes Jira access or changes the deterministic PR publication workflow.

## Render Gate

Render the Jira block only when the executor result satisfies every condition:

- `schema` is exactly `flow-pr/result-v1`.
- `status` is exactly `success` or `noop`.
- `phase` is exactly `verify`, proving completed verification semantics.
- `pr` is a non-null verified object and `result.pr.url` is a non-empty URL.
- `result.publication.candidate` is present, its `baseOid` and `headOid` exactly match `result.publication`, and the allowed evidence sources establish at least one technical change plus a concrete manual validation step.

For `blocked`, `drift`, `partial`, `failure`, any unknown status, an incomplete phase, or a missing PR, suppress the entire Jira block and report only the structured publication status, runtime-provided `error.diagnostics` when present, and recovery instruction. Every diagnostic message is static, valid UTF-8, at most 512 bytes, and never contains child-process or caught-error text. Classifications are: PR create `spawn-error`, `exit-nonzero`, `process-unknown`; inspection `inspection-failure`; mutation/verification `push-unknown`, `push-unverified`, `pr-update-unknown`, `draft-transition-unknown`, `pr-verification-unknown`, `pr-operation-unknown`, `postcondition-failed`; runtime `runtime-failure`. Every `exit-nonzero` PR-create diagnostic includes exactly one `reasonCode`: `auth-required`, `auth-forbidden`, `repository-unavailable`, `head-unavailable`, `base-unavailable`, `no-commits`, `validation-rejected`, `rate-limited`, `network-failure`, or `unknown`. Other PR-create failure classifications never include `reasonCode`. Every PR-create diagnostic includes exactly one `invocationMode`: `default`, `command-override`, or `script-override`. Never reconstruct diagnostics from commands, snapshots, handles, environment, local files, or other output.

## Evidence Handoff

When this workflow is delegated, the caller must include any already-known completed-task evidence in the invocation context. Use a compact, explicit block containing only facts the caller actually observed:

```text
Completed task evidence:
- Implemented: <verified completed behavior>
- Automated validation: <exact command/check and outcome>
- Manual validation: <concrete QA action, when known>
- Migrations: <executed/detected/not detected, when known>
- Out of scope: <explicit boundary, when known>
```

Omit unknown rows. This block is evidence input, not Jira prose. Never accept plans, expected checks, test-file existence, or workflow configuration as proof of execution. If the caller omits known evidence, the workflow must remain conservative; it cannot recover facts from an isolated parent conversation.

## Evidence Rules

- Render verified or evidenced values only. The PR row MUST use `result.pr.url` directly.
- Derive branch and target values from `result.publication`.
- Consult evidence in this order: (1) `result.publication.candidate`; (2) explicit completed task context supplied in the invocation or conversation; (3) narrowly scoped read-only Git inspection of `result.publication.baseOid..result.publication.headOid`; (4) verified PR checks returned by the runtime or executor, when available. Do not inspect another ref, range, working tree, or remote state.
- The candidate contains only the verified `baseOid`, `headOid`, `commitCount`, `commitSubjects`, `changedPaths`, and `truncated` facts for the publication range. Do not assume fields beyond that schema.
- Completed task context is evidence only when it explicitly identifies completed work or a completed check. Planning text, proposed acceptance criteria, and test-file existence do not prove implementation or execution.
- Read-only Git inspection may establish commits and changed paths only. It cannot establish test execution, CI success, business behavior, migration success, or manual validation.
- Verified PR checks may establish their exact check names, outcomes, and counts only when those facts are returned by the runtime or executor. Never infer them from a PR, a workflow file, or a test file.
- Use `No detectado` when evidence cannot establish a value. Never guess.
- Require at least one evidenced technical change from completed task context, `candidate.commitSubjects`, or `candidate.changedPaths`. Require at least one concrete, actionable manual validation step derived from that evidence. If either cannot be derived, suppress the entire Jira block and return structured recovery. Do not invent either value.
- Resolve subtasks from already-available completed SDD task context first, meaningful commits second, and changed architectural layers last. Do not make Engram mandatory.
- Limit subtasks to 10. Write each as a verb plus what, with at most 14 words.
- Every subtask must be derived from the same evidenced task, commit, or path source, and must include the applicable derivation note.
- Add `_Subtareas derivadas de commits (sin SDD tasks detectadas)_` when commits provide the fallback source.
- Add `_Subtareas derivadas de archivos cambiados (sin commits significativos)_` when changed files provide the fallback source.
- Include `### Bugs resueltos` only for evidenced, non-trivial fixes.

## Delegated Relay Contract

When the render gate passes, emit this exact outer shape:

````text
<verified publication status>

JIRA COMMENT
```markdown
<canonical Compact or Detailed template>
```
````

The `JIRA COMMENT` heading and fenced Markdown block form one indivisible relay payload. A parent or wrapper must reproduce them byte-for-byte in its final response. It may add a concise status before the heading, but must not summarize, reformat, truncate, translate, or reconstruct the Jira payload. This relay requirement does not authorize Jira mutation.

## Presentation Profiles

Select the profile from verified evidence, not from the desired narrative:

| Profile | Use when evidence shows | Presentation |
| --- | --- | --- |
| Compact | Documentation-only, trivial, or one mechanical change with no evidenced cross-layer, schema/data-model, migration, feature, or meaningful-fix scope | Use the compact template. Keep the summary and bullets concise. |
| Detailed | A feature, migration, schema/data-model change, cross-layer change, or meaningful fix | Use the detailed template. Include only supported sections and multiple concrete bullets when evidence warrants them. |

When evidence cannot classify the change safely, use Compact and do not imply a broader scope. A change may still require Detailed when its verified paths, commits, or completed task context establish any Detailed trigger.

## Evidence-Derived Fields

- Derive `Migraciones` as `Detectado` only when verified changed paths or commit facts identify a migration. Otherwise use `No detectado`; do not infer it from an absent schema field.
- Derive `Impacto` only from evidenced affected layers or concrete changes, for example API, persistence, frontend, or cross-layer. Otherwise use `No detectado`.
- State business rules, invariants, functional scope, deployment steps, compatibility risks, and out-of-scope items only when the available evidence establishes them.

Read-only Git inspection may use only the verified range to count commits, read meaningful commit subjects, and list changed paths. It MUST NOT mutate Git, GitHub, or Jira.

## Validation Rules

- `### Validación ejecutada` reports only checks actually executed. List exact commands, check names, outcomes, or counts only when each fact is evidenced.
- Before writing `No se ejecutaron validaciones automatizadas`, check every allowed evidence source in the Evidence Rules. Use that exact text only when none proves an automated validation ran.
- `### Cómo validar` ALWAYS contains concrete manual steps a QA or reviewer can follow, derived from the evidenced change. The historical rule is explicit: “Cómo validar: write concrete steps a QA or reviewer can follow, not generic instructions”.
- `### Cómo validar` is not a restatement of executed checks. `Not run`, `Not provided`, `No se ejecutaron validaciones automatizadas`, or equivalent text is prohibited as its sole content.

## Canonical Templates

Use the selected template as the presentation shell. Replace placeholders with evidenced values. Omit every optional section rather than filling it with generic prose. Preserve headings, list indentation, and fenced Markdown so the complete block remains directly copyable into Jira. Never use pipe-based Markdown tables inside the Jira payload: Jira's visual editor may split, truncate, or flatten their cells during paste. Render evidence as a flat labeled list instead.

### Compact

```markdown
### <FEATURE|FIX|REFACTOR|CHORE|DOCS>: <human-readable title>

<what changed and why>

### Cambios técnicos
- <reviewer-facing change>

### Validación ejecutada
- <executed check or No se ejecutaron validaciones automatizadas>

### Cómo validar
- <concrete validation step>

### Evidencia
- **Rama:** `<branch>`
- **Destino:** `<target or both manual-release targets>`
- **PR:** <URL>
- **Commits:** <candidate.commitCount>
- **Migraciones:** <Detectado or No detectado>
- **Impacto:** <evidenced layers/changes or No detectado>

### Subtareas
- <verb + what, max 14 words>
```

### Detailed

```markdown
### <FEATURE|FIX|REFACTOR|CHORE|DOCS>: <human-readable title>

<what changed and why>

### Alcance funcional
- <evidenced user-facing behavior or outcome>

### Cambios técnicos
- <evidenced implementation change>
- <additional evidenced implementation change, when applicable>

### Reglas de negocio
- <evidenced rule or invariant>

### Migración y despliegue
- <evidenced migration, rollout, or deployment requirement>

### Bugs resueltos
- <evidenced bug and its resolved behavior>

### Validación ejecutada
- <evidenced command, check name, result, or count>

### Cómo validar
- <concrete reviewer or QA action derived from the change>
- <additional concrete action, when applicable>

### Riesgos / compatibilidad
- <evidenced risk, compatibility constraint, or breaking consideration>

### Evidencia
- **Rama:** `<branch>`
- **Destino:** `<target or both manual-release targets>`
- **PR:** <URL>
- **Commits:** <candidate.commitCount>
- **Migraciones:** <Detectado or No detectado>
- **Impacto:** <evidenced layers/changes or No detectado>

### Subtareas
- <verb + what, max 14 words>

### Fuera de alcance
- <evidenced excluded work>
```

In the Detailed template, `Alcance funcional`, `Reglas de negocio`, `Migración y despliegue`, `Bugs resueltos`, `Riesgos / compatibilidad`, and `Fuera de alcance` are optional and appear only with evidence. `Cambios técnicos`, `Validación ejecutada`, `Cómo validar`, `Evidencia`, and `Subtareas` are required once the render gate passes. Use `No se ejecutaron validaciones automatizadas` under `Validación ejecutada` only under its specific validation rule.

## Final Response

Return only a concise publication status followed by the label `JIRA COMMENT` and the complete Jira block in a fenced `markdown` block. Do not repeat a separate PR description. Keep the block emoji-free.

The Jira block is inert copy-paste text. Never call Jira, invoke Jira APIs or CLIs, create or edit Jira comments, or make Jira a publication dependency. Mark the complete fenced block as a lossless relay payload. Any parent-facing summary MUST return it byte-for-byte without paraphrasing, truncating, reformatting, or summarizing it.
