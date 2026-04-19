---
name: flow-request
description: Cross-project contract request protocol — frontend creates backend requests, backend resolves them, frontend consumes the delivered contract. Trigger: /flow-request command.
trigger: /flow-request command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# /flow-request

Trigger: user runs `/flow-request <mode> [args]`

## Modes

| Command                                   | Who runs it    | What it does                                                   |
| ----------------------------------------- | -------------- | -------------------------------------------------------------- |
| `/flow-request create <target> "<title>"` | Frontend agent | Creates a REQ-XXX in the target backend's `planning/requests/` |
| `/flow-request resolve [REQ-XXX]`         | Backend agent  | Lists pending requests or resolves a specific one              |
| `/flow-request check <REQ-XXX>`           | Frontend agent | Reads a completed request and extracts the delivered contract  |

## Request File Location

Each backend project has its own requests folder:

```
<backend-root>/planning/requests/
├── README.md
├── REQ-001-terms-versioning.md
├── REQ-002-something-else.md
└── ...
```

Known backends and their paths (relative to frontend root):

| Target key           | Path                                            |
| -------------------- | ----------------------------------------------- |
| `backoffice-api`     | `../CROSS.BackofficeApi/planning/requests/`     |
| `push-notifications` | `../CROSS.PushNotifications/planning/requests/` |

## Request File Format

```markdown
---
id: REQ-XXX
title: <short title>
target: <backend key>
requester: CROSS.BackofficeFront
date: YYYY-MM-DD
priority: high | medium | low
status: pending | in-progress | done
---

## Context

Why this change is needed — the problem from the frontend's perspective.
No implementation details, no code suggestions.

## Expected Contract

What the frontend needs. For each endpoint:

- **Method + Path**: `PATCH /backoffice/terms`
- **Auth**: roles allowed
- **Request body**: field names and types
- **Success response**: shape of the returned data
- **Error cases**: when it should fail and with what

## Constraints

What the frontend cannot change or absorb:

- Breaking changes to existing response shapes
- Field renames on existing endpoints
- Status codes that differ from the current convention

## Notes

Optional context that may help the backend — without dictating implementation.
```

## Delivered Contract Format (added by backend on completion)

```markdown
---
status: done
resolved-date: YYYY-MM-DD
resolved-by: CROSS.BackofficeApi
---

## Delivered Contract

What was actually implemented — the source of truth for the frontend.

- **Method + Path**: exact endpoint
- **Auth**: exact roles
- **Request body**: exact fields
- **Success response**: exact shape
- **Error cases**: exact codes and conditions
- **Breaking changes**: any deviation from the Expected Contract (explain why)

## Observations

Any incompatibility, constraint, or tradeoff the backend found during implementation.
If observations exist, they were communicated before implementation — not after.
```

## Mode: create

### Steps

1. Read `planning/requests/` in the target backend — list existing REQ-XXX files
2. Determine next ID: highest existing number + 1, zero-padded to 3 digits
3. Slugify the title: lowercase, hyphens, max 5 words
4. Write `REQ-XXX-<slug>.md` with `status: pending`
5. Report the created file path

### What the agent does

- Extracts the contract from the conversation context (what the frontend needs)
- Writes the **Context** and **Expected Contract** sections
- Lists constraints from the frontend's perspective
- Does NOT suggest implementation — only describes what is needed
- Does NOT include backend code, architecture decisions, or Prisma schemas

### Response format (happy path)

```
✅ Pedido creado: ../CROSS.BackofficeApi/planning/requests/REQ-001-terms-versioning.md

- Target: backoffice-api
- Prioridad: high
- Estado: pending

El backend puede resolverlo con: /flow-request resolve REQ-001
Cuando esté listo, revisá con: /flow-request check REQ-001
```

## Mode: resolve

### Steps

1. List all `*.md` files in `planning/requests/` (excluding README)
2. Filter by `status: pending` or `status: in-progress`
3. If no REQ-XXX arg given: show the list and ask which to resolve
4. If REQ-XXX arg given: read that file directly
5. Mark the file `status: in-progress`
6. Summarize the Expected Contract for the agent to implement
7. Launch `/sdd-ff` with the request context pre-filled

### What the agent does

- Reads the request file completely
- Checks for Observations section — if needed, writes them BEFORE implementing
- Implements using its own architecture and patterns
- On completion: updates `status: done`, adds `## Delivered Contract` section
- Does NOT blindly follow any implementation hints in the request

### Response format (listing)

```
📋 Pedidos pendientes en planning/requests/

  REQ-001  [high]    Terms — Draft/Publish Versioning Refactor
  REQ-002  [medium]  Something else

Usá /flow-request resolve REQ-001 para empezar con uno específico.
```

### Response format (resolving)

```
🔧 Resolviendo REQ-001: Terms — Draft/Publish Versioning Refactor

Context: <one-line summary>
Expected: <list of endpoints needed>

[Continúa con /sdd-ff o implementación directa]
```

## Mode: check

### Steps

1. Read the specified REQ-XXX file from the target backend
2. Verify `status: done` — if not done, report current status
3. Extract `## Delivered Contract` section
4. Show what was delivered vs what was expected (diff if any)
5. If there are Observations with breaking changes — surface them prominently
6. Report whether the frontend can proceed as-is or needs adjustments

### Response format (done)

```
✅ REQ-001 resuelto por backoffice-api

## Contrato entregado

- PATCH /backoffice/terms  →  actualiza borrador in-place
- POST /backoffice/terms/publish  →  publica sin crear versión nueva
[...]

## Diferencias con lo esperado

- ⚠️  Se usó POST /publish en lugar de PATCH — ajustar la llamada en el service
- ✅  Response shape idéntica a TermsResponseDto

## Próximo paso

Actualizá terms.service.ts con los nuevos endpoints y reemplazá los MSW mocks.
Luego corrés /sdd-apply para la integración.
```

### Response format (not done)

```
⏳ REQ-001 todavía no está resuelto

Estado actual: pending
Creado: 2026-04-02

El backend todavía no procesó este pedido.
```

## Response Rules

- Always show the REQ ID prominently
- Happy path: no confirmation needed, just report the result
- On `create`: show the file path and the two follow-up commands
- On `resolve`: show the expected contract summary before starting implementation
- On `check`: always diff expected vs delivered — never just echo the delivered contract
- If `planning/requests/` doesn't exist in the target: create it with a README, then continue
- If the request has Observations with breaking changes: surface them with ⚠️ before anything else

## Restrictions

- NEVER include backend implementation code in a `create` request
- NEVER suggest how the backend should implement — only what the frontend needs
- NEVER mark a request `done` from the frontend side
- NEVER mark a request `done` from the backend side without writing the Delivered Contract section
- NEVER skip Observations when the backend finds incompatibilities — they go in the file before implementation starts
- NEVER use this skill to create requests between two backends — only frontend → backend
