---
name: flow-debt
description: Manage project-local .flow/debt technical debt tasks. Trigger: /flow-debt list/show/create/apply/done/archive, or when persisting Debt Task Drafts from /flow-refactor or /flow-audit.
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-debt

`/flow-debt` manages durable technical debt tasks under the current project's `.flow/debt/` directory and can apply one bounded debt task when explicitly invoked.

## Authorization boundary

- This command authorizes writing project-local `.flow/debt/` files for `create`, `done`, and `archive`.
- `apply <id>` authorizes bounded code edits only for that single task after validating the debt still exists.
- `apply --all-safe` authorizes only mechanical, low-risk tasks. Never batch broad refactors, security/auth changes, schema/data changes, public contract changes, migrations, or unclear tasks.
- Do not fix unrelated debt. Do not touch stable working code outside the task scope.
- Ask before continuing if the task is broad, risky, stale, ambiguous, or requires changing public behavior.

## Storage layout

Use this project-local structure:

```text
.flow/
  debt/
    README.md
    index.md
    pending/<id>.md
    done/<id>.md
```

Create missing directories only when a write subcommand is invoked (`create`, `apply`, `done`, `archive`). `list` and `show` must be read-only.

## Subcommands

### No args / `list`

1. Read `.flow/debt/index.md` and `.flow/debt/pending/*.md` if they exist.
2. If `.flow/debt/` does not exist, say there are no persisted debt tasks yet and recommend `/flow-debt create` with a Debt Task Draft.
3. List pending tasks by priority, severity, status, source command, and scope.
4. Recommend the next action: apply one safe task, clarify a risky task, or create tasks from recent Debt Task Drafts.
5. Do not create files in list mode.

### `show <id>`

Read `.flow/debt/pending/<id>.md` first, then `.flow/debt/done/<id>.md`. Summarize status, scope, risk, acceptance criteria, and verification. Do not edit files.

### `create`

Create one pending task per Debt Task Draft or user-provided finding.

1. Resolve source material in this order:
   - If the user provided text after `create`, use that text.
   - If no text was provided, inspect the current conversation context for the latest visible `/flow-refactor` or `/flow-audit` report and extract its `Debt Task Drafts` section.
   - If no `Debt Task Drafts` section is visible, ask the user to paste the Debt Task Draft or report text and stop.
2. Never invent tasks from memory, assumptions, or vague summaries. Persist only drafts/findings that are explicitly present in command arguments or visible conversation context.
3. Create `.flow/debt/README.md`, `.flow/debt/index.md`, `.flow/debt/pending/`, and `.flow/debt/done/` if missing.
4. Generate stable IDs: `YYYYMMDD-short-kebab-title`. If a file exists, append `-2`, `-3`, etc.
5. Preserve source command and origin (`existing` or `new-deferred`).
6. Create one file per finding using the task template below.
7. Update `index.md` with pending task links grouped by priority.
8. Do not edit application code during `create`.

#### `create` with no arguments

When invoked exactly as `/flow-debt create`, the expected behavior is to create tasks from the most recent Debt Task Drafts already visible in the conversation. If the latest report has no drafts, say that there is nothing to persist. If the context is unavailable or ambiguous, ask for the report instead of guessing.

### `apply <id>`

1. Read the pending task.
2. Validate the debt still exists by inspecting only the listed scope/files.
3. If the task is stale/resolved, ask whether to archive as done; do not edit code.
4. Plan the smallest safe change that satisfies the acceptance criteria.
5. Fix only the selected debt. No opportunistic cleanup.
6. Verify with the task's recommended checks and project profile.
7. Move the file from `pending/` to `done/` and update `index.md` only after successful verification.
8. If verification fails or cannot run, keep the task pending and report the blocker.

### `apply --all-safe`

Apply only tasks that are clearly mechanical and low risk, such as removing dead code, renaming local variables, extracting a small duplicated helper, or replacing a local magic number with a constant. Skip and report anything involving broad architecture, security, data/schema, auth, migrations, public contracts, cross-module behavior, or unclear acceptance criteria.

### `archive <id>` / `done <id>`

Use only when the user explicitly says the task is already resolved or should be closed without code edits. Move the task to `done/`, update status/date/notes, and update `index.md`.

## TecnomylPY.Backend profile

When the current project is TecnomylPY.Backend:

- Tests are optional by default unless explicitly requested.
- Prefer verification with `dotnet build animus-api.sln`, format/security checks, or the task's profile-recommended commands.
- Preserve shared SQL Server database compatibility.
- Do not create or apply schema changes, cascade deletes, destructive migrations, or public API contract changes without explicit confirmation.
- Respect secure logging rules: never add logging of emails, user IDs, customer IDs, role names, request parameters, customer data, or order details.

## Debt task template

Every task file must use this structure:

```md
---
id: YYYYMMDD-short-kebab-title
title: Short human title
status: pending
priority: normal|high|critical
source_command: /flow-refactor|/flow-audit|/flow-auto-deliver|manual
date: YYYY-MM-DD
project: <project name>
profile: <profile or none>
origin: existing|new-deferred
severity: low|medium|high|critical
recommended_action: Create future task|Create priority future task|Stop and ask before continuing
---

# Short human title

## Risk

Why this matters.

## Scope

- Files/modules in scope.

## Files

- path/to/file

## Acceptance Criteria

- Observable done condition.

## Verification

- Command or manual check to prove completion.

## Notes

- Source finding, context, constraints, and non-goals.
```

## Index format

Keep `.flow/debt/index.md` concise:

```md
# Flow Debt Index

## Pending

### Critical
- [id](pending/id.md) — title — scope

### High
- [id](pending/id.md) — title — scope

### Normal
- [id](pending/id.md) — title — scope

## Done

- [id](done/id.md) — title — completed YYYY-MM-DD
```

## Output format

Respond in the user's language, keeping task files and technical artifacts in English.

Use this concise structure:

```md
## Estado
- Qué se hizo o qué se encontró.

## Tareas
- id — título — prioridad — estado

## Verificación
- Comandos/checks ejecutados o por qué no aplican.

## Riesgos / límites
- Riesgos, tareas omitidas, o confirmación requerida.

## Próximo paso
- Una acción concreta.
```

## Restrictions

- Never write outside `.flow/debt/` during `create`, `list`, `show`, `done`, or `archive`.
- Never apply code changes from a draft unless the user invoked `apply`.
- Never batch risky tasks.
- Never mark a task done before verification succeeds, unless the user explicitly requested archival without edits.
- Never hide current-diff blockers as future debt; that belongs to `/flow-refactor` or `/flow-audit` recommended actions.
