# Flow PR Output Contract

This contract is presentation-only. It never authorizes Jira access or changes the deterministic PR publication workflow.

## Render Gate

Render the Jira block only when the executor result satisfies every condition:

- `schema` is exactly `flow-pr/result-v1`.
- `status` is exactly `success` or `noop`.
- `phase` is exactly `verify`, proving completed verification semantics.
- `pr` is a non-null verified object and `result.pr.url` is a non-empty URL.
- `result.publication.candidate` is present, its `baseOid` and `headOid` exactly match `result.publication`, and it evidences at least one technical change plus a concrete manual validation step.

For `blocked`, `drift`, `partial`, `failure`, any unknown status, an incomplete phase, or a missing PR, suppress the entire Jira block and report only the structured publication status and recovery instruction.

## Evidence Rules

- Render verified or evidenced values only. The PR row MUST use `result.pr.url` directly.
- Derive branch and target values from `result.publication`.
- Use `result.publication.candidate` first. It contains only the verified `baseOid`, `headOid`, `commitCount`, `commitSubjects`, `changedPaths`, and `truncated` facts for the publication range.
- When the candidate or completed task context is insufficient, narrowly scoped read-only Git inspection is permitted only against `result.publication.baseOid..result.publication.headOid`. Do not inspect another ref, range, working tree, or remote state.
- Use `No detectado` when evidence cannot establish a value. Never guess.
- Require at least one evidenced technical change from completed task context, `candidate.commitSubjects`, or `candidate.changedPaths`. Require at least one concrete, actionable manual validation step derived from that evidence. If either cannot be derived, suppress the entire Jira block and return structured recovery. Do not invent either value.
- Resolve subtasks from already-available completed SDD task context first, meaningful commits second, and changed architectural layers last. Do not make Engram mandatory.
- Limit subtasks to 10. Write each as a verb plus what, with at most 8 words.
- Every subtask must be derived from the same evidenced task, commit, or path source, and must include the applicable derivation note.
- Add `_Subtareas derivadas de commits (sin SDD tasks detectadas)_` when commits provide the fallback source.
- Add `_Subtareas derivadas de archivos cambiados (sin commits significativos)_` when changed files provide the fallback source.
- Include `### Bugs resueltos` only for evidenced, non-trivial fixes.

Read-only Git inspection may use only the verified range to count commits, read meaningful commit subjects, and list changed paths. It MUST NOT mutate Git, GitHub, or Jira.

## Validation Rules

- `### Validación ejecutada` reports only checks actually executed. When none ran, write exactly `No se ejecutaron validaciones automatizadas`.
- `### Cómo validar` ALWAYS contains concrete manual steps a QA or reviewer can follow, derived from the evidenced change. The historical rule is explicit: “Cómo validar: write concrete steps a QA or reviewer can follow, not generic instructions”.
- `Not run`, `Not provided`, `No se ejecutaron validaciones automatizadas`, or equivalent text is prohibited as the sole content of `### Cómo validar`.

## Historical Template

Preserve this template verbatim. Replace placeholders with evidenced values and insert the optional Bugs section only under the rule above.

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
| Dato | Valor |
| --- | --- |
| Rama | <branch> |
| Destino | <target or both manual-release targets> |
| PR | <URL> |
| Commits | <candidate.commitCount> |
| Migraciones | <candidate.hasMigrations> |
| Impacto | <candidate.impactArea> |

### Subtareas
- <verb + what, max 8 words>
```

## Final Response

Return only a concise publication status followed by the label `JIRA COMMENT` and the complete Jira block in a fenced `markdown` block. Do not repeat a separate PR description. Keep the block emoji-free.

The Jira block is inert copy-paste text. Never call Jira, invoke Jira APIs or CLIs, create or edit Jira comments, or make Jira a publication dependency. Mark the complete fenced block as a lossless relay payload. Any parent-facing summary MUST return it byte-for-byte without paraphrasing, truncating, reformatting, or summarizing it.
