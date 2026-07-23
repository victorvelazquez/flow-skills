---
name: flow-refactor
description: Code smell & refactoring audit for AI-modified or legacy code. Stack-aware (React, NestJS, .NET, Python). Detects bloaters, SRP violations, component extraction opportunities, and design-system drift. Trigger: /flow-refactor command.
trigger: /flow-refactor command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "2.0"
---

# flow-refactor

## Non-negotiable safety policy

- This command is a **read-only audit**. Do not edit files, run auto-fixers, or refactor code unless the user explicitly asks for a separate implementation step.
- Use this command only on demand for module, legacy, or debt analysis; it is not a habitual delivery-readiness step. It neither replaces nor redoes a valid native 4R current-diff review; focus on the explicitly requested module/debt scope instead.
- Review only the resolved scope. Do not expand into unrelated modules just because you noticed historical smells.
- Separate findings into:
  - **New/changed code**: issues introduced by the current task or diff. These must be corrected before PR when severity is 🔴 or 🟡.
  - **Existing code**: pre-existing issues outside the current task. Report them as observations with suggested actions; do not require fixing them in the current task unless they create immediate production risk.
- Avoid “cleanup while here”. Stable production code that already works must not be touched without a clear request or a material risk.
- Global quality baseline: behavior, API, component, and integration changes should include focused tests or equivalent verification unless the active project profile or explicit user instruction relaxes that expectation.
- Test enforcement is project-dependent. Apply the global baseline first, then the active project's profile or explicit user instructions.

## Step 1 — Resolve scope

Resolve `$SCRIPT`:
```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-refactor.mjs'))"
```

| Invocation | Script call |
|---|---|
| `/flow-refactor` | `node "$SCRIPT" --scope` |
| `/flow-refactor --since` | `node "$SCRIPT" --since` (the script auto-detects `origin/development`, `origin/develop`, `origin/main`, or `origin/master`) |
| `/flow-refactor --since <branch>` | `node "$SCRIPT" --since <branch>` |
| `/flow-refactor --module <path>` | `node "$SCRIPT" --module <path>` (`--module` is an alias for `--scope`) |
| `/flow-refactor --scope <file>` | `node "$SCRIPT" --scope <file>` |

The script is **scope/context only**. It must not run lint, tests, build, format, security scans, or auto-fixers. It returns `{ mode: "refactor", scope: { files[] }, nextAction: "llm-refactor-review" }`. If native lifecycle context is valid for the exact current diff, use this only for explicit `--module`, legacy, or debt analysis. If `scope.files` is empty → tell user and suggest `--since` or `--module`. Otherwise read all files.

---

## Step 2 — Detect stack

From the file list, determine stack(s). A single run can be **mixed** (e.g., PR touching frontend + backend):

| Signal | Stack |
|---|---|
| `.tsx` / `.jsx` or React import | **React** |
| `.ts` + `@nestjs/*` import | **NestJS** |
| `.cs` / `.csproj` | **.NET** |
| `.py` | **Python** |
| anything else | **Generic** |

Apply **Universal** rules to all files. Apply stack rules **only** to files of that stack. For mixed runs, report findings grouped by stack.

### Project profile: TecnomylPY.Backend

Activate this profile when the working directory or repository name is `TecnomylPY.Backend`, or when `AGENTS.md` identifies the project as `Tecnomyl Backend - Animus API`.

This is a stable enterprise ASP.NET Core 6 API in production. It shares a SQL Server database with Animus Desktop ERP. The audit goal is to prevent dirty code, unsafe changes, and accidental architectural drift — **not** to force broad modernization.

#### Tecnomyl review posture

- Default mode: **production-safe clean-code audit**.
- Do not require new tests by default. If tests would be valuable, list them as optional suggestions, not blockers.
- Do not recommend touching working legacy code merely for style. Existing smells should be visible, but separated from new/changed-code blockers.
- Block or mark important when new/changed code introduces dirty code, unsafe behavior, security/logging risk, data corruption risk, or architecture violations.
- For existing code, use “Observación existente” and propose one of:
  - leave as-is,
  - create follow-up refactor task,
  - fix now only if production risk is immediate.
- Preserve API compatibility unless the user requested a contract change.
- Preserve database compatibility. Do not suggest schema changes, cascade deletes, column/table renames, or migrations without explicit coordination.

#### Tecnomyl-specific rules

- Controllers must stay thin: routing, auth, request/response only. Business logic belongs in Services/Domain.
- Services should not become dumping grounds. Flag new methods that mix unrelated responsibilities or grow hard to reason about.
- Repositories should own EF/data access. Flag raw SQL/string concatenation, unsafe dynamic queries, and missing parameterization.
- For read-only EF queries, prefer `AsNoTracking()` when practical.
- Never log user-controlled or business-sensitive data: emails, user IDs, customer IDs, role names, request parameters, customer data, order details.
- HTTP integrations must use `IHttpClientFactory`, not `new HttpClient()`.
- Endpoints touching sensitive operations must have appropriate `[Authorize]`/role checks.
- Be careful with nullability and exception paths. Do not hide exceptions with silent catch blocks.
- Avoid unnecessary public DTO contract churn. Added response fields are acceptable only when requested or backwards-compatible.
- Keep naming consistent with existing project conventions, even when there are historical typos required for API compatibility.
- Prefer small, surgical fixes. If a proper refactor is larger than the task, report it as a follow-up suggestion.

#### Tecnomyl verification posture

- Minimum preferred verification for production code changes: `dotnet build animus-api.sln`.
- Tests are optional for now unless the user explicitly asks for them.
- If a change is high-risk and tests would normally be expected, say: “Sugerencia opcional: agregar prueba enfocada”, but do not fail the audit solely for missing tests.

---

## Step 3 — Apply rules

Use this as a senior review matrix. The goal is not style nitpicking; it is to identify concrete maintainability, correctness, security, and architecture risks while keeping current-diff blockers separate from pre-existing debt.

### Senior Review Matrix

#### Design / Clean Architecture

- Check SRP, DRY, KISS, semantic naming, “readable over clever”, sparse useful comments, modularity, and a single source of truth.
- Flag Refactoring.Guru smell families when visible:
  - **Bloaters**: long methods/classes, primitive obsession, long parameter lists, data clumps.
  - **Change Preventers**: divergent change, shotgun surgery, parallel inheritance hierarchies.
  - **Dispensables**: dead code, duplicated code, lazy classes, speculative generality, excessive comments replacing clear code.
  - **Couplers**: feature envy, inappropriate intimacy, message chains, middle man.
  - **Object-Orientation Abusers**: switch/conditional complexity, refused bequest, temporary fields.
- Suggest concrete techniques only when justified by the evidence: `Extract Method`, `Extract Class`, `Introduce Parameter Object`, `Replace Magic Number with Constant`, `Replace Nested Conditional with Guard Clauses`, `Move Method`, or `Strategy`/`State` only when conditional variation is stable and worth the abstraction.

#### Frontend

- Review container/presentational separation, local vs global state boundaries, no direct state mutation, lazy loading for heavy routes/components, re-render risks, and cleanup for event listeners, intervals, timers, subscriptions, and observers.
- Check styling/design-system consistency and accessibility basics: semantic elements, labels, focus states, keyboard access, contrast-risk signals, and meaningful alt text where applicable.

#### Backend / API

- Keep controllers thin and push business logic into services/domain.
- Check validation boundaries, REST/GraphQL consistency, status codes, centralized error handling, and whether internal details leak to clients.
- Heavy or long-running work should be queued/backgrounded when appropriate instead of blocking request/response paths.

#### Data / DB

- Watch for N+1 queries, missing eager loading/projection, unbounded queries, unsafe dynamic SQL, and transaction boundary mistakes.
- Index recommendations are follow-up suggestions, not automatic fixes.
- Treat migrations and schema changes as high-risk. Respect shared database constraints and never suggest destructive schema work without explicit coordination.
- Check connection pooling/resource disposal issues when visible.

#### Security

- Check injection, XSS, secrets in code/config, least privilege, missing authorization, sensitive logging, and insecure dependencies when visible in the reviewed scope.
- Security findings that expose immediate risk are blockers even if the code is pre-existing.

#### Automation / Quality Observations

- Lint, format, test, coverage, CI, and toolchain gaps primarily belong to `/flow-audit`.
- `/flow-refactor` may mention visible quality gaps as context, but must not run checks or turn them into refactor blockers unless they directly affect the current diff.

### Recommended Actions Policy

- **New/changed code issue** → `Fix now`. Do not create a future debt task unless the user explicitly defers it.
- **Existing non-critical debt** → `Create future task`.
- **Existing compromising debt** (meaning it raises maintenance or delivery risk but is not an immediate incident) → `Create priority future task`.
- **Existing critical/immediate risk** → `Stop and ask before continuing`.

### Durable Debt Artifact Policy

- Existing debt that should become a future or priority task should be captured as a project-local `.flow/debt` task artifact when the active command has write authorization.
- `/flow-refactor` is read-only, so output a `Debt Task Draft` block that `/flow-auto-deliver` or `/flow-debt` can persist, unless this skill is explicitly running inside a write-capable authorized loop.
- Do not hide existing debt. Keep it visible, but separate it from current-diff blockers.

### Universal (all stacks)

- Function/method > 25 lines → `Extract Method`
- Function with > 3 params → `Introduce Parameter Object`
- Class with > 1 responsibility → `Extract Class` / `SRP`
- Logic duplicated in 2+ places → `DRY` / `Extract Method`
- Magic number or magic string → `Replace with Named Constant`
- Nested `if/else` depth > 2 → `Replace with Guard Clauses`
- Unused var, import, or dead code → remove
- `console.log` / debug print left in → remove
- Generic name (`data`, `result`, `temp`) → rename to intent

---

### React frontend

**SRP & size**
- Component > 100 lines with mixed UI + logic → `Extract Custom Hook`
- Component fetches data (`useQuery`/`useMutation`) AND renders complex JSX → split: container fetches, presentational renders
- `useEffect` with wrong/missing deps → fix dep array

**Extraction & reuse**
- JSX block > 30 lines inline in render → `Extract Component`
- Same JSX structure in 2+ files → `Extract Component`; if cross-feature → place in `src/components/`
- Component in `features/X/components/` usable by multiple features → move to `src/components/`
- Component receives > 5 props → evaluate split or `children`/composition

**Composition**
- Layout wrapper hard-codes children → accept `children` prop
- Boolean prop controls completely different render (`isModal`, `isEditing`) → split into separate components
- Repeated slot pattern (icon + label + action) across 3+ components → extract as compound component
- Props drilled > 2 levels → use context or Zustand slice

**MUI / design system**
- Hardcoded hex in `sx` / `style` (e.g., `'#0761E9'`) → theme token (`primary.main`, `text.secondary`, …)
- `style={{}}` prop → convert to `sx`
- Magic `px` value in `sx` spacing (e.g., `mt: '24px'`) → theme multiple (`mt: 3`)
- Identical `sx` block on `Box`/`Stack` in 3+ places → extract as layout component
- Icon from random lib when `lucide-react` or `@mui/icons-material` equivalent exists → replace

---

### NestJS backend

- Business logic in `@Controller` method → move to `@Injectable` service (`Move Method`)
- DTO missing or typed as `any` → add DTO with `class-validator`
- `any` in service/controller layer → replace with typed interface
- `@Injectable` doing unrelated concerns → split (`SRP`)
- Multi-write without `prisma.$transaction()` → add transaction
- DB call inside controller → move to service/repository layer

---

### .NET backend

- Logic beyond orchestration in Controller action → move to Service/Domain layer
- Missing null check on reference type → add guard
- `var` where type is non-obvious → prefer explicit type
- `string` used as ID / enum → typed enum or value object
- Sync I/O method → add `async`/`await`

When the Tecnomyl profile is active, apply the stricter Tecnomyl-specific rules above and suppress generic modernization advice that would require touching stable legacy code outside the current scope.

---

### Python

- Function > 25 lines → `Extract Function`
- `except Exception` silent catch → narrow exception type
- Public function without type hints → add annotations
- Mutable default arg (`def f(x=[])`) → use `None` guard
- `print()` in production code → remove

---

## Step 4 — Build report

### Mode: Quick (default) and --since

```
## Estado
[1–2 oraciones sobre el estado general]

## Hallazgos que bloquean (new/changed)
🔴 Crítico | 🟡 Importante | 🔵 Menor

| # | Archivo | Línea | Severidad | Problema | Técnica | Acción |
|---|---------|-------|-----------|----------|---------|--------|

## Observaciones de deuda existente
| # | Archivo | Línea | Severidad | Observación | Acción recomendada |
|---|---------|-------|-----------|-------------|--------------------|

## Acciones recomendadas
- Fix now: [new/changed blockers]
- Create future task: [existing non-critical debt]
- Create priority future task: [existing compromising debt]
- Stop and ask: [existing critical/immediate risks]

## Debt Task Drafts (if any)
- id: <suggested-id>
  title: <short title>
  priority: normal|high|critical
  source command: /flow-refactor
  origin: existing|new-deferred
  severity: low|medium|high|critical
  risk: <why this matters>
  recommended action: Create future task|Create priority future task|Stop and ask before continuing
  scope: <files/modules>
  files: [<path>]
  acceptance criteria: [<observable done condition>]
  verification: [<suggested read-only checks>]
  notes: <context>

[Si React en scope y hay candidatos:]
## Extracción de componentes
| Componente | Archivo actual | Destino sugerido | Motivo |
|------------|---------------|-----------------|--------|

[Solo si hay hallazgos 🔴:]
## Correcciones críticas
[before/after mínimo, solo lo relevante]

## Veredicto
¿Listo para PR? Sí / No — una oración.
```

### Mode: --module (deep)

Same as Quick plus:
- **Resumen por archivo** (1 línea de salud por archivo) before the findings table
- No cap on findings
- Correcciones: include 🔴 AND 🟡
- Extracción de componentes: always include if React, with suggested destination path
- Veredicto: add *"¿Vale refactorizar el módulo completo o es mantenible con ajustes puntuales?"*

---

## Output rules

- Spanish for all prose; keep code, paths, identifiers in their original language
- NEVER paste full file content — only the relevant excerpt
- NEVER invent findings — only report what is present
- NEVER edit code in this command. If fixes are needed, recommend a separate implementation step.
- Always distinguish new/changed-code findings from existing-code observations when the scope includes both.
- Use the required sections: `Estado`, `Hallazgos que bloquean (new/changed)`, `Observaciones de deuda existente`, `Acciones recomendadas`, `Debt Task Drafts (if any)`, `Veredicto`. Omit a section only when it truly has no content, except `Estado` and `Veredicto`.
- Current-diff blockers must not be buried as debt. Existing debt must not block the current change unless it is an immediate critical risk.
- If a file is clean, say so explicitly
- Max 15 rows in quick mode table — group minors if needed
- Omit optional sections that have no content (no empty headers); keep `Estado` and `Veredicto` always.
- Unsure about a finding → "posible smell — verificar en contexto"
