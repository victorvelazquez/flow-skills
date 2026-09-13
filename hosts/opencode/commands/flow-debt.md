---
description: Manage and apply durable technical debt tasks stored in project-local .flow/debt files.
---

Manage durable technical debt tasks for the current project.

Arguments: `$ARGUMENTS`

Load and follow `~/.config/opencode/skills/flow-debt/SKILL.md` exactly.

This command is the user authorization boundary for writing project-local `.flow/debt/` task files and, for `apply`, bounded code edits for a selected debt task. Do not edit code or create files outside the selected subcommand scope.

Supported subcommands:

- no args: list pending tasks and recommend the next safe action.
- `list`: list pending and recently done tasks.
- `show <id>`: display one debt task.
- `create`: create one task per Debt Task Draft from the latest visible `/flow-refactor` or `/flow-audit` report, or from user-provided finding text, then update `.flow/debt/index.md`.
- `apply <id>`: validate the task still exists, fix only that debt, verify, then move the task to `done` only after successful verification.
- `apply --all-safe`: apply only mechanical/low-risk pending tasks; never broad refactors, security, schema, auth, data, or public-contract work in batch.
- `archive <id>` / `done <id>`: mark a task done without code edits only when the user explicitly says it is already resolved.

For `create`, resolve source material in this order:

1. If the user provides free text after `create`, use it as the source material.
2. If no text is provided, inspect the current conversation context for the latest visible `/flow-refactor` or `/flow-audit` report and extract its `Debt Task Drafts` section.
3. If no draft/report is available in context, ask for the Debt Task Draft or report text and stop.

Never invent debt tasks from memory or assumptions. Only persist drafts/findings that are explicitly present in the command arguments or visible conversation context.
