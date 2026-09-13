---
description: Clean Code & Refactoring Guru audit — detects code smells, architectural violations and proposes targeted refactoring techniques for AI-modified or legacy code.
agent: flow-review-agent
subtask: true
---

Read the skill file at ~/.config/opencode/skills/flow-refactor/SKILL.md FIRST, then follow its workflow exactly.

CONTEXT:

- User arguments: $ARGUMENTS
- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
- OS: !`node -e "process.stdout.write(process.platform)"`
