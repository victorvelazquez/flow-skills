---
name: flow-build
description: Universal documentation builder — guides through 11 phases to generate 15-17 docs for backend, frontend, mobile, and fullstack projects
trigger: /flow-build command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
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

Also detect if a playbook exists locally in the project:
- Check for `playbook/` directory or `.agent/playbook/` in the project root
- Check for `backend-stack.md`, `frontend-stack.md`, `api-contract.md` in any local `playbook/` folder
- Store `PLAYBOOK_LOCAL_DETECTED` = `true` / `false`

Resolve the playbook sync script path too (used only if the user chooses Playbook and no local playbook is detected):

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-playbook-sync.mjs'))"
```

Store result as `$PLAYBOOK_SYNC_SCRIPT`.

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

**Always show both options.** If `playbookLocalDetected == true`, mark B as recommended:

```
Standards:
  A) Standalone — definís todo desde cero
  B) ⭐ Playbook — el equipo ya tiene estándares definidos [✅ detectado local]
     → Phases 3-6 se acortan ~70%
     → Phase 7 se omite (cubierta por el playbook)
```

If `playbookLocalDetected == false`, mark A as recommended:

```
Standards:
  A) ⭐ Standalone — definís todo desde cero
  B) Playbook — usa estándares del equipo (locales o shared si están disponibles)
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

### Playbook resolution guard (mandatory when `STANDARDS=playbook`)

If the user chooses `STANDARDS=playbook`, resolve the real playbook source before Phase 1 continues:

1. If `PLAYBOOK_LOCAL_DETECTED == true`
   - Store `PLAYBOOK_SOURCE=local`
   - Store `PLAYBOOK_REFERENCE_ROOT=playbook/` (or `.agent/playbook/` if that is the detected local source)
   - Store `PLAYBOOK_REFERENCE_LABEL=playbook/`
   - Continue normally

2. If `PLAYBOOK_LOCAL_DETECTED == false`
   - Run:

   ```bash
   node "$PLAYBOOK_SYNC_SCRIPT" --auto --init
   ```

   - This runtime is the source of truth for shared playbook discovery
   - If the result returns `playbook.found === true`:
     - Store `PLAYBOOK_SOURCE=shared`
     - Store `PLAYBOOK_REFERENCE_ROOT=<resolved shared playbook path>`
     - Store `PLAYBOOK_REFERENCE_LABEL=shared playbook resolved by flow-playbook-sync`
     - Store `PLAYBOOK_STATUS_PATH=.flow-skills/playbook-status.md`
     - **Do not ask for approval again**
     - Treat the user's Playbook selection as implicit approval to bootstrap tracking
     - Initialize `.flow-skills/playbook-status.md` automatically and continue in Playbook mode
     - Show a concise status line only, for example:

       ```
       ✅ Shared playbook resolved automatically
       ✅ Playbook tracking initialized: .flow-skills/playbook-status.md
       ```

   - If the result returns `playbook.found !== true`:
     - STOP before Phase 1
     - Explain that no local or shared playbook could be resolved
     - Ask whether to switch to Standalone or stop

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
4. In Playbook mode, pass the resolved playbook context into every phase:
   - `PLAYBOOK_SOURCE=local|shared`
   - `PLAYBOOK_REFERENCE_ROOT`
   - `PLAYBOOK_REFERENCE_LABEL`
   - `PLAYBOOK_STATUS_PATH` when available
   - If `PLAYBOOK_SOURCE=shared`, generated docs must reference the shared playbook generically using `PLAYBOOK_REFERENCE_LABEL`; they must **not** pretend a local `playbook/` folder exists in the repo and must **never** embed an absolute machine path in generated docs
5. Generate the documents specified in the phase output section
6. Wait for user confirmation before moving to the next phase
7. Show progress: `Phase N/10 complete ✅ → Phase N+1: [name]`

---

## Restrictions

- Never skip generating documents at the end of each phase
- Never regenerate README.md before Phase 8 step 8.5
- Phases 9-10 are optional: skip if project already has substantial code (detected in Phase 0)
- Always re-read generated documents before moving to the next phase
- In Playbook mode: Phase 7 is always skipped — do not ask, do not execute
- In Playbook mode: reference playbook documents instead of duplicating their content in generated docs
