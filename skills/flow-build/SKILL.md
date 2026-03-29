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

> **Note**: The `phases/` directory contains static phase template files. Playbook variants
> (`phase-N-playbook.md`) are used when `STANDARDS = playbook`. They are installed by
> `node install.mjs` and will be present at `$PHASES` after installation.

---

## Stage 1 — Detect Project (Script)

```
node "$SCRIPT" --context
```

Parse JSON: `{ projectType, framework, language, cacheExists, isExistingProject, existingDocs, suggestedScope, orm, ormSchemaFile, testRunner, linter, formatter, packageManager, hasDocker, hasCIConfig, aiConfigFiles, directoryStructure, auditData, cacheFile }`.

Store `PROJECT_TYPE` = `projectType`.

Also detect if a playbook exists in the project:
- Check for `playbook/` directory or `.agent/playbook/` in the project root
- Check for `backend-stack.md`, `frontend-stack.md`, `api-contract.md` in any `playbook/` folder
- Store `PLAYBOOK_DETECTED` = `true` / `false`

---

## Stage 2 — Confirm & Configure (LLM)

Build the configuration report dynamically based on what was detected. **Only ask what the system cannot infer.**

### Header (always show)

```
FLOW-BUILD CONFIGURATION:

Existing docs: [existingDocs.found]/[existingDocs.total]
[If existingDocs.found > 0 → list them with a one-line description each]
```

### Project Type block

**If `projectType != unknown`** — show as confirmation:
```
Project Type: [framework] / [language] ✅ (detectado)
¿Es correcto? (S/N)
```

**If `projectType == unknown`** — ask:
```
Project Type: no detectado — ¿cuál es?
  A) Backend (API)
  B) Frontend
  C) Fullstack (monorepo backend + frontend)
```

### Scope block (always ask)

```
Scope:
  A) MVP / Basic
  B) Production-Ready
  C) Enterprise
```

### Standards block

**Always show both options.** If `playbookDetected == true`, mark B as recommended:

```
Standards:
  A) Standalone — definís todo desde cero
  B) ⭐ Playbook — el equipo ya tiene estándares definidos [✅ detectado]
     → Phases 3-6 se acortan ~70%
     → Phase 7 se omite (cubierta por el playbook)
```

If `playbookDetected == false`, mark A as recommended:

```
Standards:
  A) ⭐ Standalone — definís todo desde cero
  B) Playbook — el equipo ya tiene estándares definidos
     → Phases 3-6 se acortan ~70%
     → Phase 7 se omite (cubierta por el playbook)
```

### Phase 0 block

**If `isExistingProject == true`**:
```
Phase 0 (análisis del proyecto existente): ¿Correr? (S/N)
```

**If `isExistingProject == false`**:
```
Phase 0: NO aplica — proyecto nuevo
```

### Closing line (always show)

```
→ Respondé: [lista solo los campos que el usuario debe responder]
```

Wait for user confirmation. Store `SCOPE` and `STANDARDS` (`standalone` or `playbook`).

---

## Stage 3 — Execute Phases (LLM)

Execute each phase in order. **Which file to read depends on `STANDARDS`.**

### Phase execution order

| Phase | Standalone (`STANDARDS=standalone`) | Playbook (`STANDARDS=playbook`) | When |
| ----- | ----------------------------------- | -------------------------------- | ---- |
| 0     | phase-0.md                          | phase-0.md                       | If `isExistingProject: true` AND user said Y |
| 1     | phase-1.md                          | phase-1.md                       | Always |
| 2     | phase-2.md                          | phase-2.md                       | Always — BACKEND section if `backend/fullstack`, FRONTEND section if `frontend/mobile` |
| 3     | phase-3.md                          | phase-3-playbook.md              | Always |
| 4     | phase-4.md                          | phase-4-playbook.md              | Always |
| 5     | phase-5.md                          | phase-5-playbook.md              | Always |
| 6     | phase-6.md                          | phase-6-playbook.md              | Always |
| 7     | phase-7.md                          | **SKIP**                         | Standalone: always. Playbook: omit (covered by playbook) |
| 8     | phase-8.md                          | phase-8-playbook.md              | Always (generates final docs) |
| 9     | phase-9.md                          | phase-9.md                       | Optional — use correct category set for PROJECT_TYPE |
| 10    | phase-10.md                         | phase-10.md                      | Optional — use correct acceptance criteria focus for PROJECT_TYPE |

### For each phase

1. Read the correct phase file from `$PHASES` based on `STANDARDS`
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
- In Playbook mode: Phase 7 is always skipped — do not ask, do not execute
- In Playbook mode: reference playbook documents instead of duplicating their content in generated docs
