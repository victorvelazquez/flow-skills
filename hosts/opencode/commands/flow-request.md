---
description: Preview or host-approved delivery of one configured local contract request.
agent: flow-request-agent
subtask: true
---

CONTEXT:

- User arguments: $ARGUMENTS
- Working directory: !`node -e "process.stdout.write(process.cwd())"`

Load and follow `~/.config/opencode/skills/flow-request/SKILL.md` before responding. The dedicated adapter owns OpenCode's native approval boundary; it treats arguments only as data and never interpolates them into shell syntax.
