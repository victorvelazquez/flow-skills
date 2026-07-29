---
description: Inspect changes and execute explicit, verified Conventional Commit units
agent: flow-git-agent
subtask: true
---

Read the skill file at ~/.config/opencode/skills/flow-commit/SKILL.md FIRST, then follow its workflow exactly.

Inspection is read-only. Before executing a request that creates a branch, stages files, or creates commits, present the exact request and obtain mutation approval.

CONTEXT:

- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
- OS: !`node -e "process.stdout.write(process.platform)"`
