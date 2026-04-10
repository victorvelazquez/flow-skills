---
name: flow-branch
description: Interactive branch switcher — uses the runtime script as the source of truth for listing, checkout, and local branch deletion. Trigger: /flow-branch command.
trigger: /flow-branch command
---

# /flow-branch

Trigger: user runs `/flow-branch`

## Script Path

```bash
SCRIPT="$HOME/.config/opencode/scripts/flow-branch.mjs"
```

## Primary Commands

```bash
# List all branches
node "$SCRIPT" --auto-list

# Checkout a branch
node "$SCRIPT" --checkout --branch <name>

# Checkout and pull in one step
node "$SCRIPT" --checkout --branch <name> --pull

# Delete a local branch
node "$SCRIPT" --delete --branch <name>

# Force delete (only after explicit per-branch user approval)
node "$SCRIPT" --delete --branch <name> --force
```

## What the script handles

- `git fetch origin`
- Branch inventory and classification (`local+remote`, `local only`, `remote only`)
- Protected branch flag (`protected: true`)
- Current-branch deletion guard
- Update count for `local+remote` branches
- Pull execution when `--pull` is passed
- Pre-formatted `display` table (print as-is)

## Agent Behavior

### List

Run `--auto-list`, print the `display` field verbatim, then ask the user which branch to switch to or delete.

### Checkout

- Run `--checkout --branch <name>`
- If `nextAction === "ask-pull"`: say "hay `updateCount` commits nuevos — ¿hacemos pull?" — re-run with `--pull` if yes
- If `nextAction === "done"`: confirm success
- If `nextAction === "error"` or `"pull-error"`: show `error` field and ask what to do

### Delete — Confirmation Protocol (MANDATORY)

Applies to EVERY delete: single branch, multiple branches, or "delete all except X".
The user's initial instruction is a **request**, not a confirmation. Always follow these steps.

**Step 1 — Build the list**

From the `--auto-list` output, collect the branches to delete and filter out:
- Any branch named `main`, `master`, `develop`, or `development` — always protected
- Any branch with `protected: true`
- Any `remote only` branch — no local copy exists
- The current branch

**Step 2 — Show and confirm**

Present the filtered list and STOP until the user explicitly says yes/sí/si:

```
Voy a eliminar estas ramas locales:
  - chore/fix-something
  - feat/old-feature

⚠️ Omitidas (protegidas): main
⚠️ Omitidas (remote-only, sin copia local): v1

¿Confirmás? (sí / no)
```

**Step 3 — Execute one by one**

Only after confirmation, run `--delete` sequentially.
If any branch returns `nextAction === "ask-force-delete"`, STOP and ask for that specific branch:

```
'release/v0.0.1' no está mergeada — ¿forzamos el delete de esta rama? (sí / no)
```

Never bulk-approve force deletes. Each unmerged branch requires its own answer.

## Restrictions

- NEVER delete any branch without completing the Confirmation Protocol
- NEVER treat the user's initial instruction as confirmation — it is a request, not an approval
- NEVER delete or attempt to delete `main`, `master`, `develop`, `development`, or any branch with `protected: true`
- NEVER force delete without explicit per-branch user approval
- NEVER delete `remote only` branches — they have no local copy
- NEVER re-implement branch classification or display logic — the script provides both
