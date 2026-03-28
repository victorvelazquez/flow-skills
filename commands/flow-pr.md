---
description: Push branch + create GitHub PR automatically with AI-generated PR Description and Jira Comment.
---

Read the skill file at ~/.config/opencode/skills/flow-pr/SKILL.md FIRST, then follow its workflow exactly.

CONTEXT:

- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
- OS: !`node -e "process.stdout.write(process.platform)"`
