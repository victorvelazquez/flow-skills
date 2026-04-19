---
name: flow-skills-sync
description: Skill manager for the flow-skills repository — uses the runtime script as the source of truth for local sync/update/install context, export, prune, and dry-run planning. Trigger: /flow-skills-sync command.
trigger: /flow-skills-sync command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-skills-sync

Trigger: user runs `/flow-skills-sync`

## Script Path

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-skills.mjs'))"
```

Store as `$SCRIPT`.

## Default Behavior

The script is the source of truth. Prefer the runtime flow over manual orchestration.

- Happy path: `--auto`
- Safe preview: `--auto --dry-run`
- Ask the user only if the script returns a blocker

## Primary Commands

### Automatic execution

```bash
node "$SCRIPT" --auto
```

### Safe preview

```bash
node "$SCRIPT" --auto --dry-run
```

## What the script handles

- context detection (`publish`, `update`, `install`, `synced`)
- local sync context gathering
- export detection and export execution
- prune of deleted skills/scripts/commands during export
- update flow (`git pull` + `node install.mjs`)
- dry-run planning without side effects

## What the agent still does

- present the detected mode clearly
- if mode is `publish`, explain that local sync is done and the correct next step is `/flow-commit` followed by `/flow-pr` inside `Tools/flow-skills`
- if mode is `install`, explain the manual install path
- do not use this skill itself for commit/push/PR

## Response Rules

- If `mode` is `synced`, report there is nothing to do
- If dry-run was used, present it as a preview only
- If `mode` is `publish` and export succeeded, stop there and tell the user to continue with `/flow-commit` and `/flow-pr` if they want to publish remotely
- If the script fails, present the blocker/error and ask what action to take

## Fallback / Debug Commands

Use these only for debugging or recovery:

```bash
node "$SCRIPT" --context
node "$SCRIPT" --run-export
node "$SCRIPT" --update
```

## Restrictions

- NEVER manually recreate mode detection when `--auto` can do it
- NEVER run export twice in the same publish flow unless the user explicitly asks
- NEVER commit, push, or open a PR from this skill
- NEVER pretend install/update/export ran when the script was executed with `--dry-run`
