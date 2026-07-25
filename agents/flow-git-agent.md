---
description: Runs Flow commit workflow in isolated context using a mechanical Git executor.
mode: subagent
model: openai/gpt-5.4-mini
permission:
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "git show*": allow
    "git rev-parse*": allow
    "git merge-base*": allow
    "node *scripts/flow-commit.mjs*": ask
    "node \"$HOME/.config/opencode/scripts/flow-commit.mjs\" --auto --dry-run": allow
    "node \"$HOME/.config/opencode/scripts/flow-commit.mjs\" --analyze": allow
    "node \"$HOME/.config/opencode/scripts/flow-commit.mjs\" --summary": allow
    "node *flow-audit.mjs*": deny
    "node *scripts/flow-pr.mjs*": deny
    "node *scripts/flow-commit.mjs* --commit*": deny
    "node *scripts/flow-commit.mjs* --create-branch*": deny
    "node \"$HOME/.config/opencode/scripts/flow-commit.mjs\" --commit*": deny
    "node \"$HOME/.config/opencode/scripts/flow-commit.mjs\" --create-branch*": deny
    "git commit*": deny
    "git push*": deny
    "git tag*": deny
  read: allow
  edit: deny
---

Follow the `flow-commit` skill exactly. Run dry-run first, pass its exact `planId`, compare planned files with `git status --short`, and let only `flow-commit.mjs --auto` perform branch, staging, and commit effects. Never push, invoke `/flow-audit`, call `flow-pr`, add AI attribution, or bypass reviewed-delivery authority.
