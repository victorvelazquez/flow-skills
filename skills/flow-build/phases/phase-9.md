## PHASE 9: Implementation Roadmap (5-10 min)

> **Order for this phase:** OPTIONAL. Executed after Phase 8 or on demand.

> **📌 Scope-based behavior:**
>
> - **All Scopes:** Generate a complete Implementation Roadmap with atomic tasks.

### Objective

Translate all architectural and business specifications into a prioritized, actionable implementation plan (Roadmap) with clear milestones and tasks.

> **📌 This phase adapts to your PROJECT_TYPE:**
>
> - **backend / fullstack** → Backend context variables (ENTITY_DIR, REPO_DIR, CTRL_DIR)
> - **frontend** → Frontend context variables (COMP_DIR, PAGE_DIR, HOOKS_DIR)
> - **mobile** → Mobile context variables (SCREEN_DIR, NAV_DIR, COMP_DIR)

---

## Context Variables (Extract from docs)

// turbo

<!-- ─── BACKEND / FULLSTACK ─── -->

**[BACKEND & FULLSTACK]**

```
From ai-instructions.md:
├── LANG: {{LANGUAGE}}           # e.g., TypeScript, Python, Go, Java
├── EXT: {{FILE_EXTENSION}}      # e.g., .ts, .py, .go, .java
├── SRC: {{SOURCE_DIR}}          # e.g., src/, app/, lib/
├── TESTS: {{TESTS_DIR}}         # e.g., tests/, __tests__/, spec/
└── ARCH: {{ARCHITECTURE}}       # e.g., Clean, Hexagonal, MVC, Layered

From docs/architecture.md:
├── ENTITY_DIR: {{ENTITY_PATH}}  # e.g., entities/, models/, domain/
├── REPO_DIR: {{REPO_PATH}}      # e.g., repositories/, data/
├── SERVICE_DIR: {{SERVICE_PATH}}# e.g., services/, usecases/
├── CTRL_DIR: {{CONTROLLER_PATH}}# e.g., controllers/, handlers/, api/
└── DTO_DIR: {{DTO_PATH}}        # e.g., dtos/, schemas/, types/
```

<!-- ─── FRONTEND ─── -->

**[FRONTEND]**

```
From ai-instructions.md:
├── LANG: {{LANGUAGE}}           # e.g., TypeScript, JavaScript
├── FRAMEWORK: {{FRAMEWORK}}     # e.g., React, Next.js, Vue, Nuxt, Svelte, Angular
├── SRC: {{SOURCE_DIR}}          # e.g., src/, app/, lib/
├── TESTS: {{TESTS_DIR}}         # e.g., tests/, __tests__/, spec/
└── STYLE: {{STYLING_APPROACH}}  # e.g., Tailwind, CSS Modules, Styled Components

From docs/architecture.md & ui-structure.md:
├── COMP_DIR: {{COMPONENTS_PATH}} # e.g., components/, src/components/
├── PAGE_DIR: {{PAGES_PATH}}      # e.g., pages/, app/, src/views/
├── STORE_DIR: {{STORE_PATH}}     # e.g., store/, state/, context/
├── HOOKS_DIR: {{HOOKS_PATH}}     # e.g., hooks/, composables/
└── ASSETS_DIR: {{ASSETS_PATH}}   # e.g., assets/, public/
```

<!-- ─── MOBILE ─── -->

**[MOBILE]**

```
From ai-instructions.md:
├── LANG: {{LANGUAGE}}           # e.g., TypeScript, Dart, Swift, Kotlin
├── FRAMEWORK: {{FRAMEWORK}}     # e.g., React Native, Flutter, Native
├── SRC: {{SOURCE_DIR}}          # e.g., src/, lib/
└── TESTS: {{TEST_DIR}}          # e.g., tests/, __tests__/, spec/

From docs/architecture.md & navigation.md:
├── COMP_DIR: {{COMPONENTS_PATH}} # e.g., components/, widgets/
├── SCREEN_DIR: {{SCREENS_PATH}}  # e.g., screens/, pages/
├── NAV_DIR: {{NAV_PATH}}         # e.g., navigation/, router/
└── STORE_DIR: {{STORE_PATH}}     # e.g., store/, state/, provider/
```

**Use these variables in ALL file paths. Never hardcode language-specific paths.**

---

## Task Format (MANDATORY)

**Every task MUST use this exact format:**

```
- [ ] TXXX [CAT] Description • 1 SP → {{path}} | deps: TXXX
```

**Components:**

- `TXXX` - Sequential ID (T001, T002...)
- `[CAT]` - Category (see below)
- `Description` - Specific action (verb + what + where)
- `1 SP` - Story Points (1 or 2 only)
- `→ {{path}}` - Target file path using context variables
- `deps: TXXX` - Dependencies (or `deps: none`)

---

## Categories [CAT]

<!-- ─── BACKEND / FULLSTACK ─── -->

**[BACKEND & FULLSTACK]**

| Cat | Name       | Description                  | SP Range |
| --- | ---------- | ---------------------------- | -------- |
| [E] | Entity     | Schema, model, migration     | 1 SP     |
| [R] | Repository | Data access layer            | 1 SP     |
| [S] | Service    | Business logic, use cases    | 1-2 SP   |
| [C] | Controller | Endpoints, routes, handlers  | 1 SP     |
| [T] | Test       | Unit, integration, e2e tests | 1-2 SP   |
| [D] | Docs       | Documentation updates        | 1 SP     |
| [I] | Infra      | Config, setup, DevOps        | 1-2 SP   |

<!-- ─── FRONTEND ─── -->

**[FRONTEND]**

| Cat | Name       | Description                       | SP Range |
| --- | ---------- | --------------------------------- | -------- |
| [U] | UI/Comp    | Atoms, Molecules, Organisms       | 1 SP     |
| [P] | Page       | Page layout, route implementation | 1-2 SP   |
| [L] | Logic/Hook | Custom hooks, business logic      | 1 SP     |
| [S] | State      | Store actions, reducers, context  | 1 SP     |
| [A] | API/Data   | Fetching, services, transformers  | 1-2 SP   |
| [T] | Test       | Unit, component, e2e tests        | 1-2 SP   |
| [D] | Docs       | Documentation updates             | 1 SP     |

<!-- ─── MOBILE ─── -->

**[MOBILE]**

| Cat | Name        | Description                       | SP Range |
| --- | ----------- | --------------------------------- | -------- |
| [U] | UI/Comp     | Reusable components/widgets       | 1 SP     |
| [P] | Screen      | Screen layout & logic             | 1-2 SP   |
| [N] | Nav         | Navigation setup, deep links      | 1 SP     |
| [S] | State/Data  | State management, local storage   | 1-2 SP   |
| [F] | Native/Feat | Permissions, native modules, SDKs | 1-2 SP   |
| [T] | Test        | Unit, integration, e2e tests      | 1-2 SP   |
| [D] | Docs        | Documentation updates             | 1 SP     |

---

## Atomic Task Rules

**Maximum 1-2 SP per task. Break down larger tasks:**

**BAD (too large):**

```
- [ ] T001 [E] Create User entity with CRUD • 5 SP
```

**GOOD (atomic, language-agnostic):**

```
- [ ] T001 [E] Create User entity schema (id, email, password, role) • 1 SP → {{SRC}}/{{ENTITY_DIR}}/User{{EXT}} | deps: none
- [ ] T002 [E] Add User validation rules (email format, password min length) • 1 SP → {{SRC}}/{{ENTITY_DIR}}/User{{EXT}} | deps: T001
- [ ] T003 [R] Create UserRepository interface/contract • 1 SP → {{SRC}}/{{REPO_DIR}}/UserRepository{{EXT}} | deps: T001
```

---

## Workflow: 6 Steps

// turbo

### Step 9.1: Extract Context & Inventory

**1. Extract context variables from documentation (use the correct variable set for your PROJECT_TYPE).**
**2. Extract inventory:**

- Backend/Fullstack: Entities, Endpoints, Services
- Frontend: Components, Pages, API integrations
- Mobile: Screens, Navigation flows, Permissions

### Step 9.2: Coverage Matrix

Ensure every Feature has the full set of task categories covered:

- Backend/Fullstack: [E], [R], [S], [C], [T], [D], [I]
- Frontend: [U], [P], [L], [S], [A], [T], [D]
- Mobile: [U], [P], [N], [S], [F], [T], [D]

### Step 9.3: Epic Definition

**[BACKEND & FULLSTACK]**

- EP-000: Foundation (Project setup, config, auth infrastructure)
- EP-001: Authentication & Authorization
- EP-002: Domain entities (one Epic per aggregate root)
- EP-ZZZ: Operations & DevOps

**[FRONTEND]**

- EP-000: Foundation (Layout, Theme, Store config)
- EP-001: Component Library / Atoms
- EP-002: Core Features (Login, Dashboard, etc.)
- EP-ZZZ: Operations & PWA

**[MOBILE]**

- EP-000: Foundation (Platform setup, Navigation config)
- EP-001: Core UI & Theme
- EP-002: Main User Journeys
- EP-ZZZ: Store Preparation & Deployment

### Step 9.4: Task Generation

Generate atomic tasks using the `{{VARIABLE}}` paths.

### Step 9.5: Validate Coverage

Check for gaps in coverage. Every entity/screen/component must have tasks for all required categories.

### Step 9.6: Generate Document

Generate `planning/roadmap.md`.

---

## 📝 Generated Documents

After Phase 9, generate/update:

- `planning/roadmap.md` - Complete implementation roadmap

---

_Version: 5.0 (Universal — Backend/Frontend/Mobile unified)_
_Last Updated: 2026-03-17_
