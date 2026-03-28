---
name: flow-playbook-sync
description: Bidirectional sync between a project's implementation state and the shared engineering playbook — tracks which patterns are implemented, pending, or excluded.
trigger: /flow-playbook-sync command, or invoked automatically by flow-pr on completion
---

# flow-playbook-sync

Trigger: user runs `/flow-playbook-sync [--init] [--reset] [--dry-run]`

Script path:

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-playbook-sync.mjs'))"
```

Store result as `$SCRIPT`. Use it in all commands below.

---

## Operating modes

### Normal mode (no flags)

1. Check if `.flow-skills/playbook-status.md` exists in the current project directory.
2. If it does **NOT** exist → **abort silently**. Print nothing. Do not warn the user.
3. If it exists → proceed with the sync flow below.

### Init mode (`--init`)

1. Check if `.flow-skills/playbook-status.md` already exists.
2. If it **already exists** → print:
   ```
   ℹ️  Ya existe un playbook-status.md en este proyecto.
   Usá --reset para regenerarlo desde cero.
   ```
   Then stop.
3. If it does **not** exist → run the init flow below.

### Reset mode (`--reset`)

Same as `--init` but skips the existence check and overwrites the existing file.
Always show a confirmation prompt before overwriting:
```
⚠️  Esto va a regenerar el playbook-status.md desde cero.
¿Confirmás? [s/n]
```

---

## Finding the playbook

The playbook lives in `Tools/flow-skills/playbook/` relative to the developer's root directory.
Resolve its path in this order:

1. **Env variable**: if `FLOW_PLAYBOOK_PATH` is set, use it directly.
2. **Script flag**: if `--playbook-path <path>` was passed, use it directly.
3. **Walk upward**: starting from `process.cwd()`, walk up directory by directory looking for `Tools/flow-skills/playbook/`. Stop at filesystem root.
4. **Hardcoded fallback**: resolve `../../Tools/flow-skills/playbook/` relative to `process.cwd()` (assumes `Developer/<project>/` structure).

```
node "$SCRIPT" --find-playbook
```

Returns JSON: `{ found: boolean, path: string | null, method: string }`.

If `found: false`, print:
```
❌ No se encontró el playbook. Pasá --playbook-path <ruta> o configurá FLOW_PLAYBOOK_PATH.
```
Then stop.

---

## Playbook files

The playbook consists of 8 files (always process all for `--init`; use targeted selection for normal sync):

| File | Prefix | Topics |
|------|--------|--------|
| `api-contract.md` | `[API]` | Response envelopes, error structure, auth, pagination |
| `backend-stack.md` | `[BE]` | NestJS, Prisma, infrastructure, observability |
| `backend-patterns.md` | `[BE]` | Repository pattern, guards, interceptors, queues |
| `error-catalog.md` | `[ERR]` | Error codes, structured error handling |
| `frontend-stack.md` | `[FE]` | React, routing, HTTP client, env config |
| `frontend-patterns.md` | `[FE]` | Queries, state management, forms, error boundaries |
| `infra-stack.md` | `[INFRA]` | Docker, CI/CD, environments |
| `testing-strategy.md` | `[TEST]` | Unit, integration, E2E strategies |

Each `§N` reference points to a heading number within the file (e.g., `backend-patterns.md §4` = the 4th `##` heading).

---

## Normal sync flow

### Step 1 — Read status

Read `.flow-skills/playbook-status.md`. Parse:
- `Implemented` items (already done — for context only)
- `Pending` items (candidates for promotion)
- `Excluded` items (skip — already decided)
- The `Playbook:` header line (path to the playbook directory)

### Step 2 — Determine what changed

```
node "$SCRIPT" --diff
```

Returns JSON: `{ method: string, summary: string, files: string[], hasDiff: boolean }`.

- `method: "git-last-commit"` → used `git log -1 + git diff HEAD~1..HEAD`
- `method: "git-staged"` → used staged changes
- `method: "no-git"` → git not available or no commits

If `hasDiff: false` or method is `"no-git"`:
→ Ask the user: *"No detecté cambios recientes en git. ¿Podés describir qué implementaste?"*
→ Use their response as the context for the analysis.

### Step 3 — Select relevant playbook sections

Cross-reference the diff with the playbook to determine which files to read:

- Read playbook sections that correspond to technologies touched in the diff
  (e.g., diff touches a Prisma file → read `backend-patterns.md`; diff touches a React query hook → read `frontend-patterns.md`)
- Always include sections whose items appear in the `Pending` list
- **Do NOT read the full playbook** — only the relevant sections

### Step 4 — Analyze

With the diff context and the playbook sections, determine:

**a) Pending → Implemented promotions**
For each item in `Pending`: was this pattern implemented in the recent diff?
Look for: imports, class names, decorators, patterns that match the description.

**b) New patterns for the playbook**
Does the diff introduce something the playbook doesn't cover?
(New library, new architectural pattern, new convention established.)

**c) Pending → Excluded candidates**
Is there evidence in the diff that a pending item was intentionally skipped or is out of scope?

### Step 5 — Present proposals

Print each proposal numbered, with a clear action:

```
🔍 Analizando cambios vs playbook...

📋 Cambios detectados:

1. ✅ Implementado: [BE] BullMQ dead letter queue (backend-patterns.md §14)
   → Mover de Pending a Implemented

2. 🆕 Nuevo para el playbook: Rate limiting con @nestjs/throttler
   → Agregar a backend-patterns.md

   Diff propuesto:
   + ## §18 — Rate Limiting
   + Use `@nestjs/throttler` with `ThrottlerGuard` applied globally.
   + ...

3. ⏸️  Excluir: [BE] Multi-tenancy schema-per-tenant
   → No aplica: proyecto single-tenant

¿Aprobás estos cambios? [s/n/ver-más]
```

If there are no proposals → print:
```
✅ Playbook sync — sin cambios detectados
```
Then stop.

### Step 6 — Wait for explicit approval

For each approved proposal:
- Show the exact diff to be applied
- Wait for per-item confirmation (or bulk "s" to approve all)
- Apply the change

### Step 7 — Update playbook-status.md

After all approvals:
- Move approved `Pending` items to `Implemented`
- Add new `Excluded` entries with reasons
- Update the `Última sync:` date in the header

For playbook file additions: print the diff but **do NOT write to the playbook file automatically**.
Instead, print:
```
📝 Para agregar esto al playbook, copiá el diff de arriba en:
   {playbook-path}/backend-patterns.md
```

---

## Init flow (`--init` / `--reset`)

### Step 1 — Find playbook

Same as normal flow Step 1.

### Step 2 — Analyze the project

```
node "$SCRIPT" --analyze
```

Returns JSON with:
- `hasPkg: boolean` — has package.json
- `deps: string[]` — installed dependency names
- `hasSchema: boolean` — has prisma/schema.prisma
- `hasMigrations: boolean` — has prisma/migrations/
- `hasDockerCompose: boolean`
- `hasCI: boolean` — has .github/workflows/ or .gitlab-ci.yml
- `structure: string[]` — top-level directories

### Step 3 — Read all 8 playbook files

Read each file in full to extract the pattern list (headings + one-liner descriptions).

### Step 4 — Generate playbook-status.md draft

Infer implementation status from the project analysis:

| Signal | Inference |
|--------|-----------|
| dep `@nestjs/swagger` present | `[API]` envelope pattern probably Implemented |
| dep `prisma` present | `[BE]` Prisma patterns probably Implemented |
| dep `bullmq` present | `[BE]` BullMQ patterns probably Implemented |
| dep `@tanstack/react-query` | `[FE]` TanStack Query patterns probably Implemented |
| dep `zustand` | `[FE]` Zustand patterns probably Implemented |
| dep `@opentelemetry/*` | `[BE]` OpenTelemetry probably Implemented |
| dep NOT present | Corresponding patterns → Pending |
| pattern clearly out of scope | Excluded with reason |

Use conservative defaults: when in doubt, put in `Pending` (not `Implemented`).

### Step 5 — Show draft and wait for approval

Show the complete draft to the user:
```
📋 Borrador de playbook-status.md para {project-name}:

---
{full content}
---

¿Lo guardamos? Podés pedirme ajustes antes. [s/n/ajustar]
```

### Step 6 — Save

Write to `.flow-skills/playbook-status.md`.
Create `.flow-skills/` directory if it doesn't exist.

Print:
```
✅ playbook-status.md creado en .flow-skills/playbook-status.md
   Próximo paso: corré /flow-playbook-sync después de tu próximo PR.
```

---

## playbook-status.md format

```markdown
# Playbook Status — {project-name}
> Generado: YYYY-MM-DD
> Playbook: {relative-path-to-playbook-dir}
> Última sync: YYYY-MM-DD

## Implemented
<!-- Patrones del playbook ya aplicados en este proyecto -->
- [BE] Envelope {data, meta} con HttpResponse interceptor → api-contract.md §2
- [BE] Prisma repository pattern → backend-patterns.md §4
- [FE] TanStack Query con queryOptions factory → frontend-patterns.md §2
- [FE] Zustand slices por feature → frontend-patterns.md §3

## Pending
<!-- Patrones pendientes de implementar, con referencia exacta -->
- [BE] OpenTelemetry instrumentation → backend-stack.md §6
- [BE] BullMQ dead letter queue → backend-patterns.md §14
- [FE] Error boundary global → frontend-patterns.md §11

## Excluded
<!-- Patrones que no aplican a este proyecto — con razón explícita -->
- [BE] Multi-tenancy schema-per-tenant → proyecto single-tenant, no aplica
- [BE] Keycloak OIDC → usa JWT propio, migración fuera de scope actual
```

**Rules for the status file:**
- Every item MUST have a `→ {file}.md §{N}` reference
- `Excluded` items MUST have a reason after the `→`
- The `Playbook:` path must be relative to the project root (use `../` traversal or absolute)
- Never remove items from `Excluded` automatically — only the user can do that

---

## flow-pr integration

When invoked by `flow-pr` (automatic post-PR trigger):

1. Run in normal mode (no flags)
2. If `.flow-skills/playbook-status.md` does not exist → **silent no-op**
3. If it exists → run the normal sync flow
4. Present proposals as part of the PR completion summary

`flow-pr` should call this skill with:
```
/flow-playbook-sync
```
No special flags needed.

---

## Script commands reference

| Command | Output |
|---------|--------|
| `node "$SCRIPT" --find-playbook` | `{ found, path, method }` |
| `node "$SCRIPT" --diff` | `{ method, summary, files, hasDiff }` |
| `node "$SCRIPT" --analyze` | `{ hasPkg, deps, hasSchema, ... }` |
| `node "$SCRIPT" --check-status` | `{ exists: boolean, path: string }` |

---

## Restrictions

- **NEVER write to playbook files automatically** — only propose diffs, let the user apply them
- **NEVER remove items from `Excluded`** — only users can un-exclude patterns
- **NEVER promote a `Pending` item without explicit diff evidence** — inference alone is not enough
- If `.flow-skills/playbook-status.md` does not exist and `--init` was not passed → **silent exit, zero output**
