---
description: UI design compliance audit — validates new or refactored screens/components against the project UI guide, checklist, and baseline interface rules before commit.
---

Read the skill file at ~/.config/opencode/skills/flow-ui/SKILL.md FIRST, then follow its workflow exactly.

If the user adds text after `/flow-ui`, interpret it using this priority:

1. If it starts with `@`, treat it as an exact path scope.
2. If it uses explicit technical flags like `--scope` or `--module`, respect them exactly.
3. Otherwise, treat the extra text as a semantic module description to resolve.

CONTEXT:

- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
- OS: !`node -e "process.stdout.write(process.platform)"`
