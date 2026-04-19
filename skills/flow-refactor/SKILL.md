---
name: flow-refactor
description: >
  Clean Code & Refactoring Guru audit for code modified by AI or legacy modules.
  Detects code smells, architectural violations and proposes targeted refactoring techniques.
  Trigger: When user runs /flow-refactor or wants to audit code quality after AI changes or on legacy modules.
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-refactor

Trigger: user runs `/flow-refactor`

Script path (reuses flow-audit scope detection):

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-audit.mjs'))"
```

Store result as `$SCRIPT`.

---

## Modes

| Command | Mode | What it does |
|---|---|---|
| `/flow-refactor` | **Quick** (default) | Audits staged → unstaged files. Use before committing. |
| `/flow-refactor --since` | **Branch diff** | Auto-detects base branch. Audits ALL files changed since branching. Use after committing, before PR. |
| `/flow-refactor --since develop` | **Branch diff explicit** | Same but with explicit branch name. |
| `/flow-refactor --module src/loans` | **Deep module** | Full audit of a specific module. Use for legacy code review. |
| `/flow-refactor --scope src/loans/loans.service.ts` | **Single file** | Audit one specific file. |

---

## Step 1 — Resolve scope

### Default mode (`/flow-refactor`)

```bash
node "$SCRIPT" --scope --dry-run
```

Uses the script's auto-detection: staged → last commit diff → unstaged → directory scan.

### `--since` mode (no value = auto-detect base branch)

Run this to find the base branch:

```bash
git branch -r | grep -E "origin/(develop|development|main|master)" | head -5
```

Pick the first match in this priority: `develop` → `development` → `main` → `master`.
Then run:

```bash
node "$SCRIPT" --scope --since <detected-branch>
```

### `--since <branch>` (explicit)

```bash
node "$SCRIPT" --scope --since <branch>
```

### `--module <path>`

```bash
node "$SCRIPT" --scope --scope <path>
```

### `--scope <file>`

```bash
node "$SCRIPT" --scope --scope <file>
```

The script returns a JSON with `files[]` — the list to audit. Read each file.

---

## Step 2 — Perform the audit

Read the in-scope files and apply this checklist.

### Stack detection

Before auditing, identify the stack from the files:

- `.ts` + `@nestjs/*` imports → **NestJS backend**
- `.tsx` / `.jsx` + React imports → **React frontend**
- `.cs` / `.csproj` → **.NET**
- `.py` → **Python**
- Other → generic rules only

Apply the stack-specific rules below on top of the universal rules.

---

### Universal rules (all stacks)

**Bloaters**
- Methods / functions over 25 lines → `Extract Method`
- Functions with more than 3 parameters → `Introduce Parameter Object`
- Classes with more than one clear responsibility → `Extract Class`

**Dispensables**
- Unused variables, imports, dead code → remove
- `console.log` / debug prints left in → remove
- Comments that explain *what* instead of *why* → remove
- Duplicated logic in 2+ places → `Extract Method` / `DRY`
- Magic numbers / magic strings → `Replace Magic Number with Constant`

**Conditionals**
- Nested `if/else` (depth > 2) → `Replace Nested Conditional with Guard Clauses`
- Long `if/else if` chains with type checks → `Replace Conditional with Polymorphism`

**Naming**
- Inconsistent casing (`camelCase` vs `snake_case` in same layer) → rename
- Generic names (`data`, `result`, `temp`, `obj`) → rename to intent

**Modern JS/TS**
- Manual loops replaceable by `.map()` / `.filter()` / `.reduce()` → suggest functional equivalent only if it improves clarity

---

### NestJS-specific rules

- Business logic inside a `@Controller` method → move to `@Injectable` service (`Move Method`)
- Missing or incomplete DTOs with `any` typed bodies → add DTO with class-validator
- `any` type in service/controller layer → replace with typed interface
- `@Injectable` service doing unrelated things (e.g., sending email + calculating loan) → split (`SRP`)
- Missing `prisma.$transaction()` on multi-write operations → add transaction
- Direct DB calls inside a controller → move to repository/service layer

---

### React-specific rules

- Component over 150 lines mixing UI + logic → `Extract Custom Hook` for logic
- `useEffect` with missing or wrong dependencies → fix dependency array
- Props drilling more than 2 levels → suggest context or state store
- Inline functions inside JSX on hot paths → extract to `useCallback`
- `any` typed props → add proper interface / `type Props = {}`
- Component doing more than one thing (fetch + render + format) → split (`SRP`)

---

### .NET-specific rules

- Logic inside a Controller action beyond orchestration → move to Service/Domain layer
- Missing null checks on reference types (non-nullable context) → add guard
- `var` overuse where type is not obvious → prefer explicit type
- `string` used for identifiers that should be typed (IDs, enums) → use typed enum or value object
- Missing async/await on I/O methods → add async pattern

---

### Python-specific rules

- Functions over 25 lines → `Extract Function`
- `except Exception` catching everything silently → narrow exception type
- Missing type hints on public functions → add type annotations
- Mutable default arguments (`def foo(items=[])`) → replace with `None` guard
- `print()` left in production code → remove

---

## Step 3 — Build the report

### Quick mode (default) — compact output

```
## Resumen
[1-2 oraciones: estado general del código auditado]

## Hallazgos

| Archivo | Línea | Problema | Técnica |
|---------|-------|----------|---------|
| ...     | ...   | ...      | ...     |

Severidad: 🔴 Crítico | 🟡 Importante | 🔵 Menor

## Código corregido
[Solo para hallazgos 🔴 Críticos — antes/después mínimo]

## Veredicto
[¿Listo para PR? Sí / No — una oración con la razón principal]
```

**Rules for quick mode:**
- Max ~15 findings in the table — group minor ones if there are many
- Código corregido: ONLY for 🔴 Critical findings, show minimal before/after
- No lengthy explanations — table + verdict is the core
- If zero critical findings: skip "Código corregido" section entirely

### Deep module mode (`--module`) — extended output

Same structure but:
- No finding limit in the table
- Add a **"Resumen por archivo"** section before the table with 1-line health per file
- Código corregido for 🔴 Crítico AND 🟡 Importante findings
- Verdict includes: *"¿Vale la pena refactorizar este módulo completo o es mantenible con ajustes?"*

---

## Response rules

- **Spanish** for all explanatory text when the user speaks Spanish
- Keep file paths, code, identifiers, and technical terms in their original language
- NEVER paste the full file contents back — only the relevant excerpt
- NEVER invent findings — only report what is actually present in the code
- If a file is clean, say so explicitly — don't pad the table
- Separate clearly: 🔴 Crítico (blocks PR) / 🟡 Importante (fix soon) / 🔵 Menor (backlog)
- Unsure about a finding? Say "posible smell — verificar en contexto"
- If scope returns 0 files: tell the user nothing was detected and suggest `--since <branch>` or `--module <path>`
