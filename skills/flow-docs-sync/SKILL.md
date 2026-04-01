---
name: flow-docs-sync
description: Incremental documentation sync — uses the runtime script as the source of truth for snapshot/diff/cache planning, while the agent performs the incremental doc updates. Trigger: /flow-docs-sync command.
trigger: /flow-docs-sync command
---

# flow-docs-sync

Trigger: user runs `/flow-docs-sync`

Script path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-docs-sync.mjs'))"
```

Store as `$SCRIPT`.

## Default Behavior

This skill is **hybrid**.

- The script is the source of truth for snapshot/diff/cache state
- The agent still performs the incremental documentation updates
- Happy path: `--auto`
- Safe preview: `--auto --dry-run`

## Primary Commands

### Full sync context

```bash
node "$SCRIPT" --auto
```

### Safe preview

```bash
node "$SCRIPT" --auto --dry-run
```

## What the script handles

- current codebase snapshot
- comparison against `.flow-skills/cache/docs-analysis.json`
- changed vs unchanged docs planning
- whether cache update is required
- dry-run planning without writing cache

## What the agent still does

- read the affected documentation files
- apply incremental updates only where needed
- preserve unchanged content and format
- regenerate Mermaid diagrams when relevant
- run `--update-cache` after doc updates are completed

## Response Rules

- If `--auto` says there are no changes, report docs are already synchronized
- If `--auto --dry-run` was used, present it as a preview only
- If there are changed docs, present the planned targets concisely and proceed with incremental updates
- Ask the user only if the script errors in a blocking way or if the requested doc changes are ambiguous

## Fallback / Debug Commands

Use these only for debugging or recovery:

```bash
node "$SCRIPT" --snapshot
node "$SCRIPT" --diff
node "$SCRIPT" --update-cache
```

## Restrictions

- NEVER rewrite whole docs when incremental updates are enough
- NEVER run `--update-cache` before doc updates are actually finished
- NEVER manually recreate diff/cache logic when `--auto` can do it
