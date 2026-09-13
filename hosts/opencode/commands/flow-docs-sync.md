---
description: Incremental documentation sync — detects codebase changes vs last snapshot and updates affected docs + Mermaid diagrams.
---

Read the skill file at ~/.config/opencode/skills/flow-docs-sync/SKILL.md FIRST, then follow its workflow exactly.

CONTEXT:

- Working directory: !`node -e "process.stdout.write(process.cwd())"`
- Current project: !`node -e "const path=require('path');process.stdout.write(path.basename(process.cwd()))"`
- OS: !`node -e "process.stdout.write(process.platform + '/' + process.arch)"`
