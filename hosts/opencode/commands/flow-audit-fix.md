---
description: Preview configured audit fixes or run them after explicit native approval.
agent: flow-audit-fix-agent
subtask: true
---

CONTEXT:

- User arguments: $ARGUMENTS
- Working directory: !`node -e "process.stdout.write(process.cwd())"`

Load and follow `~/.config/opencode/skills/flow-audit-fix/SKILL.md` before responding. The dedicated adapter treats arguments only as data and owns the explicit approval boundary.
