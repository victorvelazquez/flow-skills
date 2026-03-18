---
name: flow-build
description: Universal documentation builder — guides through 11 phases to generate 15-17 docs for backend, frontend, mobile, and fullstack projects
trigger: /flow-build command
---

# flow-build

Trigger: user runs `/flow-build`

Script path:

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-build.mjs'))"
```

Store result as `$SCRIPT`. Phases dir:

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','skills','flow-build','phases'))"
```

Store result as `$PHASES`.

> **Note**: The `phases/` directory contains 11 static phase template files (`phase-01.md`
> through `phase-11.md`). These files are **static workflow templates shipped with the repo**,
> NOT generated at runtime. They are installed by `node install.mjs` and will be present at
> `$PHASES` after installation. If `$PHASES` does not exist, re-run `node install.mjs` from
> the flow-skills repository root.

---

## Stage 1 — Detect Project (Script)

```
node "$SCRIPT" --context
```

Parse JSON: `{ projectType, framework, language, cacheExists, isExistingProject, existingDocs, suggestedScope, orm, ormSchemaFile, testRunner, linter, formatter, packageManager, hasDocker, hasCIConfig, aiConfigFiles, directoryStructure, auditData, cacheFile }`.

Store `PROJECT_TYPE` = `projectType`.

---

## Stage 2 — Confirm & Configure (LLM)

Present a configuration report:

```
FLOW-BUILD CONFIGURATION:

Project Type: [projectType] (detected)
Framework:    [framework]
Language:     [language]
Existing docs: [existingDocs.found]/[existingDocs.total]

Is this correct? (Y/N — if N, specify the correct project type)

Mode:
A) ⭐ Interactive (full control, all questions, ~90-120 min)
B) Smart Auto-Suggest (6 critical questions, AI suggests rest, ~15-25 min)

Scope:
A) ⭐ MVP / Basic
B) Production-Ready
C) Enterprise

Existing project detected: [yes/no]
→ Run Phase 0 (analysis) first? (Y/N)
```

Wait for user confirmation. Store `MODE` and `SCOPE`.

---

## Stage 3 — Execute Phases (LLM)

Execute each phase in order by reading its file from `$PHASES`.

**Phase execution order:**

| Phase | File        | When                                                                                              |
| ----- | ----------- | ------------------------------------------------------------------------------------------------- |
| 0     | phase-0.md  | If `isExistingProject: true` AND user said Y                                                      |
| 1     | phase-1.md  | Always                                                                                            |
| 2     | phase-2.md  | Always — use BACKEND section if `backend/fullstack`, FRONTEND/MOBILE section if `frontend/mobile` |
| 3     | phase-3.md  | Always — use correct 3.1 framework list for PROJECT_TYPE                                          |
| 4     | phase-4.md  | Always                                                                                            |
| 5     | phase-5.md  | Always                                                                                            |
| 6     | phase-6.md  | Always                                                                                            |
| 7     | phase-7.md  | Always                                                                                            |
| 8     | phase-8.md  | Always (generates final docs)                                                                     |
| 9     | phase-9.md  | Optional — use correct category set for PROJECT_TYPE                                              |
| 10    | phase-10.md | Optional — use correct acceptance criteria focus for PROJECT_TYPE                                 |

**For each phase:**

1. Read the phase file from `$PHASES/phase-N.md`
2. Follow its instructions exactly
3. Apply conditional blocks based on `PROJECT_TYPE`
4. Generate the documents specified in the phase output section
5. Wait for user confirmation before moving to the next phase
6. Show progress: `Phase N/10 complete ✅ → Phase N+1: [name]`

---

## Restrictions

- Never skip generating documents at the end of each phase
- Never regenerate README.md before Phase 8 step 8.5
- Phases 9-10 are optional: skip if project already has substantial code (detected in Phase 0)
- Always re-read generated documents before moving to the next phase
- In Smart Auto-Suggest mode: ask only 6 critical questions per phase, auto-fill the rest
