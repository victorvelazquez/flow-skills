## PHASE 10: Agile Planning - User Stories (5-10 min)

> **Order for this phase:** OPTIONAL. Executed after Phase 9 or on demand.

> **📌 Scope-based behavior:**
>
> - **All Scopes:** Generate detailed User Stories for each milestone in the Roadmap.

### Objective

Break down technical roadmap tasks into user-centric Agile requirements (User Stories) to facilitate development, testing, and acceptance criteria definition.

> **📌 This phase adapts to your PROJECT_TYPE:**
>
> - **backend / fullstack** → Security/Gherkin focus (5-6 scenarios: happy path + error + security)
> - **frontend** → UX/Accessibility/Responsiveness focus
> - **mobile** → Touch/Gestures/Permissions/Offline/Native focus

- All Epics: 30-60 minutes
- One Epic: 5-10 minutes
- One User Story: 2-3 minutes

---

## Command Modes

```
/flow-build fase 10              → Generate all (or Sprint 1 selection)
/flow-build fase 10 EP-001       → Generate User Stories for specific Epic
/flow-build fase 10 HU-001-001   → Generate/regenerate specific User Story
```

---

## Workflow: 4 Steps

// turbo

### Step 10.1: Load Context from Roadmap

**Extract from `planning/roadmap.md`:**

```
CONTEXT LOADED
├── Language: {{LANGUAGE}}
├── Framework: {{FRAMEWORK}}
├── Architecture: {{ARCHITECTURE}}
├── Epics: X
├── Features: X
├── Tasks: X
└── Total SP: X
```

**Load additional context from:**

- `project-brief.md` - Business context, target users
- `ai-instructions.md` - Tech stack, patterns
- `docs/api.md` or `docs/api-contracts.md` - Endpoints specification
- `specs/security.md` - Security requirements

---

### Step 10.2: Select Scope

```
SCOPE SELECTION
├── A) All Epics (complete backlog)
├── B) Sprint 1 only (P0/P1 priorities)
├── C) Specific Epics (select which)
└── D) Cancel
```

---

### Step 10.3: Generate User Story Documents

**For each Feature in roadmap, create `planning/user-stories/EP-XXX/HU-XXX-YYY.md`:**

```markdown
# User Story: HU-{{EPIC}}-{{FEATURE}}

**Title:** {{FEATURE_NAME}}
**Priority:** {{PRIORITY}} (Must Have | Should Have | Could Have)
**Story Points:** {{SP}} SP
**Sprint:** {{SPRINT}} or "Backlog"

## Description

**As a** {{USER_TYPE}}
**I want** {{DESIRED_FUNCTIONALITY}}
**So that** {{USER_BENEFIT}}

---

## Acceptance Criteria

> Minimum 5-6 scenarios — apply PROJECT_TYPE-specific focus below

1. **Given** {{PRECONDITION}}
   **When** {{ACTION}}
   **Then** {{EXPECTED_RESULT}}

[...5-6 total scenarios]

---

## Technical Notes

- {{IMPLEMENTATION_DETAIL_1}}
- {{SECURITY_REQUIREMENT}}
- {{INTEGRATION_DETAIL}}

---

## Tasks

> Inherited from planning/roadmap.md Feature {{FEATURE_NUMBER}}

{{TASKS_FROM_ROADMAP}}

---

## Dependencies

- **Requires:** {{REQUIRED_STORIES}}
- **Blocks:** {{BLOCKED_STORIES}}

---

## Definition of Done

- [ ] Code implemented and peer reviewed
- [ ] Unit tests passing (coverage >= 80%)
- [ ] Integration tests implemented
- [ ] Security requirements verified
- [ ] API/UI documentation updated
- [ ] QA validation completed
- [ ] No lint/format errors
```

---

#### Acceptance Criteria Focus by PROJECT_TYPE

**[BACKEND & FULLSTACK]** — Security + Gherkin (5-6 scenarios minimum):

- Happy path (2-3 scenarios)
- Error cases (2 scenarios: validation error, not found, conflict, etc.)
- Security scenario (1-2: unauthorized, forbidden, rate limited, SQL injection attempt, etc.)

**[FRONTEND]** — UX/Accessibility/Responsiveness:

- **UX/Interaction:** "When I click X, Y happens with a smooth transition."
- **Accessibility:** "The component must be keyboard navigable and have ARIA labels."
- **Responsiveness:** "Display 1 column on mobile, 3 columns on desktop."
- **Validation:** "Show inline error message if field is empty."

**[MOBILE]** — Touch/Gestures/Permissions/Offline/Native:

- **UX/Touch:** "When I swipe left on X, Y action is triggered."
- **Gestures:** "Long-pressing Y opens the context menu."
- **Permissions:** "If camera permission is denied, show helpful alert with link to settings."
- **Offline:** "User can continue editing X while offline; sync starts when connection returns."
- **Native:** "System biometrics dialog appears before accessing Y."

---

### Step 10.4: Generate Test Cases (Separate Files)

**For each User Story, create `planning/user-stories/EP-XXX/tests/TC-XXX-YYY.md`:**

```markdown
# Test Cases: HU-{{EPIC}}-{{FEATURE}}

> Derived from Acceptance Criteria (1-2 test cases per scenario)

## TC-001: {{TEST_NAME}} (Happy Path)

- **Precondition:** {{INITIAL_STATE}}
- **Test Data:** Field1: `value1`, Field2: `value2`
- **Steps:**
  1. {{STEP_1}}
  2. {{STEP_2}}
- **Expected Result:** {{EXPECTED_OUTCOME}}
- **Priority:** High
- **Type:** Functional
- **Automatable:** Yes/No

## TC-002: {{TEST_NAME}} (Error Case)

[...]

## TC-003: {{TEST_NAME}} (Edge/Security Case)

[...]
```

---

### Step 10.5: Update Roadmap with Links

**After generating, update `planning/roadmap.md`:**

```markdown
### Feature 1.1: {{FEATURE_NAME}} • {{SP}} SP

**User Story:** [HU-001-001](planning/user-stories/EP-001/HU-001-001.md)
**Status:** Not Started
```

---

## Generation Rules

- **Title:** From Feature name in roadmap
- **Priority:** MoSCoW (Must/Should/Could/Won't Have)
- **As a:** From project-brief.md (target users)
- **Minimum 5-6 Gherkin scenarios** (backend/fullstack) or equivalent criteria (frontend/mobile)
- **Technical Notes:** Pull from ai-instructions.md, architecture.md, security.md
- **Tasks:** Inherit from roadmap (don't duplicate)
- **Test Cases:** 1-2 test cases per acceptance scenario, include specific test data

## DO NOT

- ❌ Create User Story without roadmap context
- ❌ Skip acceptance criteria (minimum 5-6 required for backend/fullstack)
- ❌ Generate generic test cases without test data
- ❌ Duplicate tasks from roadmap
- ❌ Hardcode language-specific details
- ❌ Forget to update roadmap with links

---

## Summary

```
PHASE 10 COMPLETE
├── Generated: X User Stories
├── Total SP: X SP
├── Test Cases: X
├── Files: planning/user-stories/EP-XXX/
└── Updated: planning/roadmap.md (added links)

Next steps:
1. Review User Stories in planning/user-stories/
2. Start implementing: /flow-dev-feature HU-001-001
3. Generate more: /flow-build fase 10 EP-XXX
```

---

## 📝 Generated Documents

After Phase 10, generate/update:

- `planning/user-stories/*.md` - Detailed Agile requirements
- `planning/roadmap.md` - (updated with story links)

---

**CONGRATULATIONS!** Project documentation and planning are complete.

---

_Version: 5.0 (Universal — Backend/Frontend/Mobile unified)_
_Last Updated: 2026-03-17_
