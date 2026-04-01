---
name: flow-playbook-sync
description: Bidirectional sync between a project's implementation state and the shared engineering playbook — uses the runtime script as the source of truth for automatic planning, init/reset, and dry-run previews. Trigger: /flow-playbook-sync command, or invoked automatically by flow-pr on completion.
trigger: /flow-playbook-sync command, or invoked automatically by flow-pr on completion
---

# flow-playbook-sync

Trigger: user runs `/flow-playbook-sync [--init] [--reset] [--dry-run]`

Script path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-playbook-sync.mjs'))"
```

Store as `$SCRIPT`.

## Default Behavior

The script is the source of truth. Prefer the runtime flow over manual orchestration.

- Normal sync: `--auto`
- Init draft / reset planning: `--auto --init` or `--auto --reset`
- Safe preview: add `--dry-run`
- Ask the user **only** if the script returns a blocker or explicit approval is still needed for content changes

## Primary Commands

### Normal sync

```bash
node "$SCRIPT" --auto
```

### Safe preview

```bash
node "$SCRIPT" --auto --dry-run
```

### Init / reset planning

```bash
node "$SCRIPT" --auto --init
node "$SCRIPT" --auto --reset --dry-run
```

## What the script handles

- locating the shared playbook
- checking whether `.flow-skills/playbook-status.md` exists
- resolving sync vs init vs reset mode
- diff discovery from git
- project structure/dependency analysis
- silent no-op behavior when sync is triggered without a status file
- dry-run planning without side effects

## What the agent still does

- read the relevant playbook sections when the script says analysis should continue
- analyze the diff or init context
- prepare proposals / draft content
- ask for approval before writing content changes or applying promotions/exclusions

## Response Rules

- If the script returns `noop: true` and `silent: true`, do not surface noisy output unless the user explicitly asked what happened
- If the script succeeds, present only the concise next step or proposal summary
- If dry-run was used, label the result as a preview with no side effects
- If the script fails, present the blocker/error and ask what action to take

## Fallback / Debug Commands

Use these only for debugging or recovery, not as the normal path:

```bash
node "$SCRIPT" --find-playbook
node "$SCRIPT" --check-status
node "$SCRIPT" --diff
node "$SCRIPT" --analyze
```

## Restrictions

- NEVER write to playbook files automatically unless the user explicitly approved the content changes
- NEVER remove `Excluded` items automatically
- NEVER bypass the script’s mode resolution when `--auto` can do it
