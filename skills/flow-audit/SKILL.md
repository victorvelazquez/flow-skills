---
name: flow-audit
description: Stack-agnostic code quality audit — uses the runtime script as the source of truth for tool detection, scope resolution, automated checks, and dry-run previews, while the agent performs the final LLM review. Trigger: /flow-audit command.
trigger: /flow-audit command
---

# flow-audit

Trigger: user runs `/flow-audit`

Script path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-audit.mjs'))"
```

Store result as `$SCRIPT`.

## Default Behavior

This skill is **hybrid**.

- The script is the source of truth for detection, scope, and automated checks
- The agent still performs the final code-review judgment and summary
- Happy path: `--auto`
- Safe preview: `--auto --dry-run`

## Primary Commands

### Full automated context + checks

```bash
node "$SCRIPT" --auto
```

### Safe preview without running tools

```bash
node "$SCRIPT" --auto --dry-run
```

### Optional scoping

```bash
node "$SCRIPT" --auto --scope src/features/users
node "$SCRIPT" --auto --since main
```

## What the script handles

- toolchain detection
- scope detection
- monorepo warnings
- running lint/typecheck/test/format/coverage/security
- aggregated pass/fail/error/skipped reporting
- auto-fix commands when explicitly requested later

## What the agent still does

- read the in-scope files
- perform the LLM review (correctness, security, performance, maintainability, test gaps)
- synthesize automated findings + review findings into a concise audit result
- decide whether to propose `/flow-audit --fix` style follow-up actions

## Response Rules

- If `--auto` succeeds, summarize automated results first, then do the code review
- If `--auto --dry-run` was used, do not pretend tools ran; treat it as planning/context only
- If automated checks fail, include that in the report but still perform the LLM review when useful
- Ask the user only if the script errors in a blocking way or if they need to choose whether to apply fixes

## Fallback / Debug Commands

Use these only for debugging or narrower recovery flows:

```bash
node "$SCRIPT" --detect
node "$SCRIPT" --scope --since main
node "$SCRIPT" --run-all
node "$SCRIPT" --run lint
node "$SCRIPT" --fix --auto-only
```

## Restrictions

- NEVER manually recreate detection/scope logic when `--auto` can do it
- NEVER claim tests/lint/typecheck passed unless the script actually ran them
- NEVER skip the LLM review entirely; this skill is intentionally hybrid
