---
description: Read-only playbook comparison with deterministic neutral replacement candidates.
---

Read the skill file at ~/.config/opencode/skills/flow-playbook-compare/SKILL.md FIRST, then follow its workflow exactly.

CONTEXT:

- User arguments: $ARGUMENTS
- Working directory: !`node -e "process.stdout.write(process.cwd())"`
- Current project: !`node -e "const path=require('path');process.stdout.write(path.basename(process.cwd()))"`
