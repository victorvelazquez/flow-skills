---
description: Code quality audit — automated checks (lint, typecheck, test) + 5-perspective LLM code review. Produces structured PASS/WARN/FAIL report.
---

Read the skill file at ~/.config/opencode/skills/flow-audit/SKILL.md FIRST, then follow its workflow exactly.

CONTEXT:

- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
- OS: !`node -e "process.stdout.write(process.platform)"`
