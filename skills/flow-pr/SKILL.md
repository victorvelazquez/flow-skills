---
name: flow-pr
description: Push branch + create GitHub PR using the runtime script as the source of truth for automatic happy-path execution, production guardrails, and dry-run previews. Trigger: When user runs /flow-pr or wants to submit their work as a pull request.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "3.0"
---

# /flow-pr

Trigger: user runs `/flow-pr`

## Script Path

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-pr.mjs'))"
```

Store as `$SCRIPT`.

## Default Behavior

The script is the source of truth. Prefer the runtime flow over manual orchestration.

- Happy path: run `--auto`
- Safe preview: run `--auto --dry-run`
- Ask the user **only** if the script returns an actual blocker or failure

## Primary Commands

### Automatic execution

```bash
node "$SCRIPT" --auto
```

### Safe rehearsal

```bash
node "$SCRIPT" --auto --dry-run
```

## What the script handles

- branch scanning and target resolution
- clean working tree enforcement
- push automation
- task PR creation
- integration PR automation
- production release guardrails for `main` / `master`
- version bump flow for integration PRs
- PR description generation
- Jira comment generation
- dry-run planning without side effects

## Response Rules

- If the script succeeds, present the result concisely
- If a PR was created, return the URL clearly
- If dry-run was used, clearly label the result as a preview with no side effects
- If the script fails, present the blocker/error and ask what action to take

## Fallback / Debug Commands

Use these only for debugging or recovery, not as the normal path:

```bash
node "$SCRIPT" --scan
node "$SCRIPT" --check-cicd
node "$SCRIPT" --version-context
node "$SCRIPT" --release-guard --source development --target main --is-clean true --version 1.2.3
node "$SCRIPT" --push
node "$SCRIPT" --create-pr --target development --title "feat: example" --body-file "body.md"
```

## Restrictions

- NEVER bypass the script’s production guardrails
- NEVER recreate the PR workflow manually if `--auto` can do it
- NEVER ask for confirmation on the happy path just because the script succeeded
- NEVER run tests from this skill; use `/flow-audit` if needed
