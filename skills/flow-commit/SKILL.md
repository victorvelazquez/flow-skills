---
name: flow-commit
description: Universal git commit workflow — uses the runtime script as the source of truth for automatic commits, protected-branch handling, and dry-run previews. Trigger: /flow-commit command.
trigger: /flow-commit command
---

# flow-commit

Trigger: user runs `/flow-commit`

Script:

```bash
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs"
```

## Default Behavior

The script is the source of truth. Prefer the runtime flow over manual orchestration.

- Happy path: run `--auto`
- Safe preview: run `--auto --dry-run`
- Ask the user **only** if the script returns an actual error or a blocking ambiguity

## Primary Commands

### Automatic execution

```bash
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --auto
```

### Safe rehearsal

```bash
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --auto --dry-run
```

## What the script handles

- protected-branch detection
- automatic working-branch creation
- changed-file discovery
- deterministic commit grouping
- commit message generation
- leftover detection for known files
- dry-run planning without side effects

## Response Rules

- If the script succeeds, present a concise summary of what it did or plans to do
- If dry-run was used, clearly label the result as a preview with no side effects
- If the script fails, present the error and ask what action to take

## Fallback / Debug Commands

Use these only for debugging or recovery, not as the normal path:

```bash
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --analyze
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --summary --count 5
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --create-branch --name "feat/example"
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --commit --files "f1,f2" --message "feat(scope): add example"
```

## Restrictions

- NEVER push from this skill
- NEVER re-implement commit logic in the prompt when the script can do it
- NEVER ask for confirmation on the happy path just because the script succeeded
