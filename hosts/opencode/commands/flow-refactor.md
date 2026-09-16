---
description: Deterministic read-only Flow refactor smell detection and neutral draft output.
agent: flow-review-agent
subtask: true
---

CONTEXT:

- User arguments: `$ARGUMENTS` (data only)

Pass `$ARGUMENTS` to `flow-review-agent` as data. It reads the installed portable contract at `~/.config/opencode/skills/flow-refactor/SKILL.md`. For `/flow-refactor`, it runs only the installed read-only runtime and relays its JSON unchanged. It does not request approval, invoke review or delivery, or apply changes.
