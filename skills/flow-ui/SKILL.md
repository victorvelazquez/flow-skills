---
name: flow-ui
description: UI design compliance audit for frontend changes. Validates screens, components, states, accessibility, responsiveness, and alignment with the project UI guide without duplicating flow-audit or flow-refactor. Trigger: /flow-ui command.
trigger: /flow-ui command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-ui

Trigger: user runs `/flow-ui`

## Human-friendly invocation

Prefer this interpretation order for normal usage:

1. `/flow-ui` → review the current working tree UI scope
2. `/flow-ui @some/path` → treat `@...` as an exact path and resolve it like `--scope`
3. `/flow-ui clients` or `/flow-ui pantalla de clientes` → treat free text as a semantic module query and resolve it like `--module`
4. If the user explicitly writes `--scope` or `--module`, respect those flags exactly

This means users do NOT need to write `--auto` for normal usage, and they do NOT need to write `--module` unless they want the technical form explicitly.

## Purpose

This skill is the FINAL UI gate before commit for frontend/interface work.

It validates:
- alignment with `docs/ui-guide.md` when present
- alignment with `docs/ui-review-checklist.md` when present
- baseline UI rules when project UI docs do not exist yet
- consistency of screens, components, states, interaction patterns, accessibility, and responsive behavior

It does NOT replace:
- `/flow-refactor` for code smells, extraction, SRP, and design-system drift at code-structure level
- `/flow-audit` for lint, typecheck, tests, correctness, security, performance, and general maintainability

## Non-overlap contract

### NEVER do work that belongs to `/flow-audit`
Do NOT:
- run lint
- run tests
- run typecheck
- claim technical build health
- audit backend correctness/security/performance

### NEVER do work that belongs to `/flow-refactor`
Do NOT:
- perform generic smell hunting
- focus on hook extraction or SRP unless it directly breaks a UI pattern
- produce broad maintainability review unrelated to interface behavior or consistency

If such issues are detected, mention them briefly and route them to the proper command.

## Script path

Resolve `$SCRIPT`:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-ui.mjs'))"
```

## Default behavior

This skill is hybrid.

- The script is the source of truth for scope detection, frontend detection, and UI-doc resolution
- The agent performs the final design/compliance judgment
- Happy path: `--auto`
- Safe preview: `--auto --dry-run`

## Primary commands

### Full automated context
```bash
node "$SCRIPT" --auto
```

### Safe preview
```bash
node "$SCRIPT" --auto --dry-run
```

### Optional scoping
```bash
node "$SCRIPT" --auto --scope apps/frontend/src/features/clients
node "$SCRIPT" --auto --scope apps/frontend/src/features/clients/ClientForm.tsx
node "$SCRIPT" --auto --scope apps/frontend/src/features/clients,apps/frontend/src/components
node "$SCRIPT" --auto --module "clients"
node "$SCRIPT" --auto --module "pantalla de clientes"
node "$SCRIPT" --auto --since main
node "$SCRIPT" --auto --staged
node "$SCRIPT" --auto --working-tree
```

`--scope` can target a directory, a single file, or a comma-separated list of paths. Use it when you want to review specific screens or components even if they are not currently changed in git.

`--module` can target a human description of a module, screen, or component group. Use it when you know the business name but not the exact file path.

## Validation modes

### 1. Project mode
Use when `docs/ui-guide.md` exists.

Source of truth:
1. `docs/ui-guide.md`
2. `docs/ui-review-checklist.md` if present
3. baseline fallback only as secondary support

This is the strictest mode.

### 2. Baseline mode
Use when `docs/ui-guide.md` does not exist.

Validate only against:
- global baseline rules in this skill
- project-visible internal consistency
- `docs/ui-review-checklist.md` if it exists without a guide

You MUST explicitly say that this is a baseline/global validation and not a project-specific UI authority.

### 3. Bootstrap mode
Use when:
- no `docs/ui-guide.md` exists
- frontend UI work is significant enough that the project should define one

In addition to baseline validation, recommend creating `docs/ui-guide.md` and identify patterns that could become canonical.

## What to read

Read only files relevant to UI scope:
- changed `.tsx`, `.jsx`, `.css`, `.scss`
- changed feature/page/screen files
- shared components touched by those changes
- `docs/ui-guide.md` if present
- `docs/ui-review-checklist.md` if present

Avoid broad repo exploration outside UI scope.

## What to validate

### Layout and hierarchy
- page structure is clear
- spacing is consistent
- primary and secondary actions are visually distinct
- sections are grouped coherently

### Canonical component usage
- shared components are reused where appropriate
- no unnecessary new variant is introduced
- existing UI patterns are respected

### Required states
Check whether applicable states exist:
- loading
- empty
- error
- success
- disabled
- restricted/no-permission

### Forms
- visible labels
- clear validation
- logical grouping
- no placeholder-as-label misuse

### Data display
- table/list hierarchy is clear
- row actions are predictable
- empty/search/filter behavior is consistent

### Accessibility
- focus visibility
- keyboard usability in critical flows
- labels and semantics
- no color-only meaning

### Responsive behavior
- layout remains usable at supported widths
- content does not overlap or become unusable

### Consistency with guide
- the implementation matches the project guide if present
- deviations are identified one by one, not generalized

## Baseline rules fallback

Use these only when project rules are missing or incomplete:

- one clear primary action per view
- consistent spacing and hierarchy
- visible labels for fields
- required states must exist where applicable
- avoid arbitrary visual variants
- shared components before custom duplicates
- destructive actions must be explicit
- long flows should not be hidden inside modals without strong reason
- responsive usability is mandatory
- accessibility minimums are mandatory

## Classification of findings

Every finding must be classified as exactly one of:

- `fix-to-template`
- `documented-exception`
- `guide-update-candidate`

### Meaning
- `fix-to-template`: implementation should be corrected to match the guide/pattern
- `documented-exception`: deviation may stay, but must be explicitly documented
- `guide-update-candidate`: the new pattern looks valid and reusable, and the guide may need a targeted update

Do NOT recommend updating the full guide because of one isolated difference.

## Required output format

```md
## Estado general

- PASS / WARN / FAIL
- Modo usado: project / baseline / bootstrap
- Qué significa en una oración

## Qué está alineado

- Lista breve de aciertos reales

## Diferencias detectadas

| # | Elemento | Archivo | Tipo | Impacto | Clasificación | Acción sugerida |
|---|----------|---------|------|---------|----------------|-----------------|

## Excepciones candidatas

- Solo las que realmente tienen sentido conservar

## Candidatos a actualizar la guía

- Solo patrones nuevos válidos y reutilizables
- Uno por uno

## Veredicto

- ¿Listo para commit? Sí / No
- Próximo paso concreto
```

## Interpretation rules

- If no project guide exists, say so explicitly
- If `docsOnly: true`, explicitly say this was a documentation-only validation and that no screen/component implementation files were reviewed
- If the implementation is acceptable but not yet governed by project UI docs, say that clearly
- Distinguish blockers from follow-up improvements
- Do not invent visual problems that are not present in code/context
- If uncertain, mark as uncertain
- If there are no meaningful UI issues, explicitly say so

## Recommended execution order

For UI work, recommend this sequence before commit:

1. `/flow-refactor`
2. `/flow-audit`
3. `/flow-ui`

`/flow-ui` is the final interface-alignment gate.

## Anti-patterns

- Do NOT duplicate `flow-audit`
- Do NOT duplicate `flow-refactor`
- Do NOT claim strict project misalignment without a project guide
- Do NOT propose broad guide rewrites from one local exception
- Do NOT mix minor polish issues with blocking UI failures
