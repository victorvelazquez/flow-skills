---
name: flow-branch
description: Interactive branch switcher — uses the runtime script as the source of truth for listing, checkout, and local branch deletion. Trigger: /flow-branch command.
trigger: /flow-branch command
---

# /flow-branch

Trigger: user runs `/flow-branch`

## Script Path

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-branch.mjs'))"
```

Store as `$SCRIPT`.

## Default Behavior

The script is the source of truth. Prefer the runtime flow over manual branch logic.

- Branch list: `--auto-list`
- Checkout: `--checkout --branch <name>`
- Delete local branch: `--delete --branch <name>`
- Force delete only after the normal delete fails and the user explicitly confirms

## Primary Commands

### List branches

```bash
node "$SCRIPT" --auto-list
```

### Checkout a branch

```bash
node "$SCRIPT" --checkout --branch <name>
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
- branch inventory and classification (`local+remote`, `local only`, `remote only`)
- protected branch checks
- current-branch deletion guard
- checkout behavior for local and remote-only branches
- update count for local+remote branches

## What the agent still does

- present the branch list nicely
- let the user choose a branch or delete action
- ask whether to pull when the selected branch has remote updates
- ask whether to force delete only if normal delete fails because the branch is not merged

## Response Rules

- If listing succeeds, show the available branches clearly
- If checkout succeeds and `updateCount > 0`, ask whether to pull
- If normal delete fails because the branch is not merged, ask whether to force delete
- If the script fails for another reason, show the error and ask what to do

## Restrictions

- NEVER allow deletion of protected branches: `main`, `master`, `dev`, `development`
- NEVER force delete without explicit user approval
- NEVER re-implement branch classification logic in the prompt when the script can do it
