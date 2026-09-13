---
description: Bidirectional sync between the current project and the shared engineering playbook — promotes implemented patterns, flags new ones, tracks exclusions.
---

Read the skill file at ~/.config/opencode/skills/flow-playbook-sync/SKILL.md FIRST, then follow its workflow exactly.

CONTEXT:

- Working directory: !`node -e "process.stdout.write(process.cwd())"`
- Current project: !`node -e "const path=require('path');process.stdout.write(path.basename(process.cwd()))"`
- OS: !`node -e "process.stdout.write(process.platform + '/' + process.arch)"`
- Status file: !`node -e "const fs=require('fs'),path=require('path');const p=path.join(process.cwd(),'.flow-skills','playbook-status.md');process.stdout.write(fs.existsSync(p)?'exists':'not-found')"`
