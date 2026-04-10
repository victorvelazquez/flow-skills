---
name: flow-branch
description: Interactive branch switcher — uses the runtime script as the source of truth for listing, checkout, and local branch deletion. Trigger: /flow-branch command.
trigger: /flow-branch command
---

# /flow-branch

Trigger: user runs `/flow-branch`

## Script Path

```
~/.config/opencode/scripts/flow-branch.mjs
```

Resolve once at session start:

```bash
SCRIPT="$HOME/.config/opencode/scripts/flow-branch.mjs"
```

## Primary Commands

### List branches

```bash
node "$SCRIPT" --auto-list
```

Print the `display` field from the JSON response verbatim — no reformatting needed.
Then ask the user which branch to switch to, or if they want to delete one.

### Checkout a branch (no pending updates expected)

```bash
node "$SCRIPT" --checkout --branch <name>
```

### Checkout and pull in one step (when user confirms pull upfront, or after seeing updateCount)

```bash
node "$SCRIPT" --checkout --branch <name> --pull
```

### Delete a local branch

```bash
node "$SCRIPT" --delete --branch <name>
```

### Force delete after user approval

```bash
node "$SCRIPT" --delete --branch <name> --force
```

## What the script handles

- `git fetch origin`
- Branch inventory and classification (`local+remote`, `local only`, `remote only`)
- Protected branch enforcement
- Current-branch deletion guard
- Update count for `local+remote` branches
- Pull execution when `--pull` is passed
- Pre-formatted `display` table (print as-is)

## What the agent still does

- Print `display` from `--auto-list` response
- Ask the user which branch or action to take
- If `nextAction === "ask-pull"`: ask whether to pull, then re-run checkout with `--pull`
- If `nextAction === "ask-force-delete"`: ask whether to force delete, then re-run with `--force`
- If `nextAction === "pull-error"` or `"error"`: show error and ask what to do

## Response Rules

- **List:** print `display` verbatim, then ask for selection
- **Checkout + `nextAction === "done"`:** confirm success
- **Checkout + `nextAction === "ask-pull"`:** say "hay `updateCount` commits nuevos — ¿hacemos pull?" and re-run with `--pull` if yes
- **Delete + `nextAction === "done"`:** confirm deletion
- **Delete + `nextAction === "ask-force-delete"`:** say "la rama no está mergeada — ¿forzamos el delete?" and re-run with `--force` if yes
- **Any error:** show `error` field and ask what to do

> **Hint for users:** Para eliminar una rama local elegí la opción delete y confirmá.

## Restrictions

- NEVER force delete without explicit user approval
- NEVER re-implement branch classification or display logic — the script provides both
