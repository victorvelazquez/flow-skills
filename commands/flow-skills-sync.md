---
description: Guide or run preview-first Flow snapshots and confirmation-bound restores
---

Read `~/.config/opencode/skills/flow-skills-sync/SKILL.md` first and follow its workflow exactly.

Route the invocation before running any command:

- If `$ARGUMENTS` is empty or whitespace-only, do not invoke the wrapper without arguments. Follow the skill's **Guided No-Argument Workflow**. Its first and only initial command must be the read-only comparison preview `node ~/.config/opencode/scripts/flow-skills.mjs --snapshot --dry-run`.
- If `$ARGUMENTS` is non-empty, forward it unchanged to the live wrapper:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs $ARGUMENTS
```

Do not trim, parse, reorder, or infer non-empty arguments.

Context:

- Working directory: !`node -e "process.stdout.write(process.cwd())"`
- Arguments: `$ARGUMENTS`
