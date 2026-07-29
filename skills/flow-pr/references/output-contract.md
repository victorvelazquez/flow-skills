# Flow PR Output Contract

This contract is presentation-only. It never authorizes Jira access or changes the deterministic PR publication workflow.

## Render Gate

Render the Jira block only when the executor result satisfies every condition:

- `schema` is exactly `flow-pr/result-v1`.
- `status` is exactly `success` or `noop`.
- `phase` is exactly `verify`, proving completed verification semantics.
- `pr` is a non-null verified object and `result.pr.url` is a non-empty URL.

For `blocked`, `drift`, `partial`, `failure`, any unknown status, an incomplete phase, or a missing PR, suppress the entire Jira block and report only the structured publication status and recovery instruction.

## Evidence Rules

- Render verified or evidenced values only. The PR row MUST use `result.pr.url` directly.
- Derive branch and target values from the verified result snapshot and approved request.
- Derive candidate metrics only from the approved request, verified snapshot/base/head facts, already-available completed task context, or narrowly scoped read-only Git inspection anchored to the verified base and head OIDs.
- Use `No detectado` when evidence cannot establish a value. Never guess.
- Resolve subtasks from already-available completed SDD task context first, meaningful commits second, and changed architectural layers last. Do not make Engram mandatory.
- Limit subtasks to 10. Write each as a verb plus what, with at most 8 words.
- Add `_Subtareas derivadas de commits (sin SDD tasks detectadas)_` when commits provide the fallback source.
- Add `_Subtareas derivadas de archivos cambiados (sin commits significativos)_` when changed files provide the fallback source.
- Include `### Bugs resueltos` only for evidenced, non-trivial fixes.

Read-only Git inspection may use the verified range to count commits, read meaningful commit subjects, and list changed paths. It MUST NOT mutate Git, GitHub, or Jira.

## Historical Template

Preserve this template verbatim. Replace placeholders with evidenced values and insert the optional Bugs section only under the rule above.

```markdown
### <FEATURE|FIX|REFACTOR|CHORE|DOCS>: <human-readable title>

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
- <verb + what, max 8 words>
```

## Final Response

Return only a concise publication status followed by the label `JIRA COMMENT` and the complete Jira block in a fenced `markdown` block. Do not repeat a separate PR description. Keep the block emoji-free.

The Jira block is inert copy-paste text. Never call Jira, invoke Jira APIs or CLIs, create or edit Jira comments, or make Jira a publication dependency. Any parent-facing summary MUST preserve the complete fenced block byte-for-byte without paraphrasing, truncating, or reformatting it.
