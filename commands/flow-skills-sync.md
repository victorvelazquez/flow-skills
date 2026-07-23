---
description: Preview or apply a live OpenCode Flow snapshot to the local flow-skills mirror
---

Read `~/.config/opencode/skills/flow-skills-sync/SKILL.md` first and follow its workflow exactly.

Forward the user's arguments unchanged to the live wrapper:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs $ARGUMENTS
```

Context:

- Working directory: !`node -e "process.stdout.write(process.cwd())"`
- Arguments: `$ARGUMENTS`
