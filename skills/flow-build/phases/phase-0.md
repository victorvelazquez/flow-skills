## PHASE 0: Context Discovery (2-5 min)

> **Order for this phase:** ALWAYS executed FIRST if an existing project is detected. Skip ONLY for new projects.

> **📌 Scope-based behavior:**
>
> - **Interactive Mode:** Ask user for permission to scan files layer by layer.
> - **Autonomous Mode:** Scan all layers automatically and present the final report.

### Objective

Efficiently analyze existing projects using a **layered, incremental approach**.

---

## 🚫 Critical Exclusion Rules

To avoid false-positive detections, **IGNORE** the following folders and files during all detection steps:

- `.ai-flow/work/` (contains active development tasks)
- `.ai-flow/archive/` (contains completed tasks)
- `.agent/` (contains AI workflows)
- `docs/` and `specs/` (if they contain AI Flow generated documentation)
- `planning/` (if it contains AI Flow generated roadmap and user stories)
- `project-brief.md`, `ai-instructions.md`, `AGENT.md`

**A project is considered "Existing" only if it contains functional source code or framework configuration files OUTSIDE these excluded paths.**

---

## 0.0 Check for Existing Analysis (Layer 0)

Check if `.ai-flow/cache/docs-analysis.json` exists and is fresh.

**If found:**
Ask user to use cached analysis or re-analyze.

**If not found:**
Proceed to Layer 1.

---

// turbo

## ⚡ Layer 1: Fast Metadata Scan (10-20 seconds)

**Purpose:** Detect framework, language, build tool, and existing AI configurations.

⭐ **Context Links:**

- Node.js: [package.json](file:///package.json)
- Python: [requirements.txt](file:///requirements.txt) | [pyproject.toml](file:///pyproject.toml)
- PHP: [composer.json](file:///composer.json)
- Go: [go.mod](file:///go.mod)
- Java: [pom.xml](file:///pom.xml) | [build.gradle](file:///build.gradle) | [build.xml](file:///build.xml)
- NetBeans: [nbproject/project.xml](file:///nbproject/project.xml)
- Eclipse: [.project](file:///.project) | [.classpath](file:///.classpath)

### 0.1.1 Universal Tech Stack Detection

**Action:** Use your internal knowledge to detect the language and framework by scanning the root configuration files (package.json, pyproject.toml, etc.).

**Detect (but don't be limited to):**

- **Node.js:** NestJS, Express, Fastify, etc.
- **Python:** FastAPI, Django, Flask, etc.
- **PHP:** Laravel, Symfony, etc.
- **Java/Kotlin:** Spring Boot, Micronaut, Ktor, NetBeans (Ant), Eclipse (Maven/Gradle), etc.
- **Go:** Gin, Echo, Fiber, etc.
- **C#/.NET, Ruby, Rust, Elixir.**

**NetBeans Project Detection (Java):**

Check for NetBeans-specific markers:

- `nbproject/project.xml` - NetBeans project descriptor
- `build.xml` - Ant build configuration
- `manifest.mf` - JAR manifest file
- `src/` with Java source files
- `lib/` for dependencies (optional)

**Eclipse Project Detection (Java):**

Check for Eclipse-specific markers:

- `.project` - Eclipse project descriptor
- `.classpath` - Classpath configuration
- `.settings/` - IDE settings directory
- `pom.xml` (Maven) or `build.gradle` (Gradle)
- `src/main/java/` or `src/` for source code

**Project Type Classification:**

1. **NetBeans Web Application:**
   - Has `web/` or `WebContent/` directory
   - Contains `web.xml` in `web/WEB-INF/`
   - Servlets/JSP files present
   - Build.xml with web-related targets

2. **NetBeans Desktop Application:**
   - Has Swing `.form` files in `src/`
   - JavaFX `.fxml` files
   - Main class with GUI initialization (JFrame/Application)
   - No web/ directory

3. **Eclipse Desktop Application (Swing/JavaFX):**
   - Has `.project` file
   - Maven/Gradle with JavaFX or Swing dependencies
   - Main class with GUI initialization
   - No web facets

4. **Eclipse Desktop Application (SWT):**
   - Has `.project` file
   - Dependencies: `org.eclipse.swt.*`, `org.eclipse.jface.*`
   - Main class extends `ApplicationWorkbenchAdvisor` or uses `Display`
   - May have `.product` file (RCP)

5. **Enterprise Application (NetBeans/Eclipse):**
   - EJB configurations
   - persistence.xml (JPA)
   - ejb-jar.xml
   - Enterprise modules

**Build System Detection:**

NetBeans:

- Default: Apache Ant (build.xml)
- Modern: Maven (pom.xml) or Gradle (build.gradle)
- Hybrid: Ant + Ivy

Eclipse:

- Default: Maven (pom.xml) or Gradle (build.gradle)
- Legacy: Ant with Eclipse compiler
- PDE: Eclipse Plugin Development

**Version Detection:**

- NetBeans: Check `nbproject/project.properties` for version
- Eclipse: Check `.project` XML for `<buildSpec>` and `<nature>` tags
- Java version: Check build config (Maven/Gradle) or project properties

### 0.1.2 Find AI & Documentation

- Find existing AI configs (`AGENT.md`, `.cursorrules`, etc.)
- Scan for `README.md` and existing `docs/`.

### Layer 1 Output

Show a summary of detected Name, Language, Framework, ORM, and Documentation files.

---

## 0.2 Layer 2: Structural Analysis (30-90 seconds)

**Purpose:** Analyze directory organization and architecture patterns without reading code line-by-line.

### 0.2.1 Pattern Detection

1. **Identify Pattern:** Feature-based, Layer-based, Modular Monolith, or Hybrid.
2. **Entity Detection:** Scan for Schema/Entity files based on the detected ORM (Prisma, TypeORM, Django Models, etc.).
3. **Maturity Check:** Assess documentation and test coverage ratio.

### Layer 2 Output

Summary of Architecture Pattern, Code Structure counts (Controllers, Services, etc.), and Recommended Build Scope (MVP/Production/Enterprise).

---

## 0.3 Layer 3: Selective Deep Analysis (1-5 minutes, OPTIONAL)

**Purpose:** Read and parse representative code files for detailed insights into API endpoints, data relationships, and security patterns.

### 0.3.1 Areas of Analysis

- **API Endpoints:** Parse routes/controllers.
- **Data Model:** Map entity relationships.
- **Security:** Detect auth patterns (JWT, OAuth), validation (Zod, Pydantic), and middleware.

### 0.3.2 Sampling Strategy

Use stratified sampling to read only the most relevant files (e.g., core controllers and entities) to stay within context limits.

---

## ✅ Validation & Synthesis

### Present Findings

Show the final "🔍 PROJECT STACK DETECTED" report and ask for confirmation.

### 💾 Cache & Pre-populate

**Create directory structure (if not exists):**

```bash
mkdir -p .ai-flow/cache
```

1. **Export:** Save results to `.ai-flow/cache/docs-analysis.json`.
2. **Pre-populate:** Fill answers for Phases 1-7 based on detected data.

---

## 0.4 Layer 4: Documentation Audit (30-90s, CONDITIONAL)

**Trigger:** Only if `docs/` or `specs/` directories exist with content.

**Purpose:** Validate existing documentation against implemented code to detect inconsistencies.

### 0.4.1 Ask User Permission

```
📚 Existing documentation detected (12 files in docs/, 3 in specs/)

Would you like to audit documentation vs code?
A) Yes, audit and show inconsistencies (recommended) ⭐
B) No, skip audit (continue to Phase 1)

> _
```

**If user selects B:** Skip to section 0.5 (Validation & Synthesis).

### 0.4.2 Parse Existing Documentation

**Action:** Extract documented information from:

- `docs/architecture.md` → Architecture patterns
- `docs/data-model.md` → Entities and fields
- `docs/api.md` → Endpoints and methods
- `specs/requirements.md` → Business requirements

### 0.4.3 Compare Code vs Documentation

**Compare:**

1. **Entities:** Schema files (Prisma, TypeORM, etc.) vs `docs/data-model.md`
2. **Endpoints:** Controllers/Routes vs `docs/api.md`
3. **Architecture:** Code structure vs `docs/architecture.md`
4. **Tech Stack:** `package.json` vs documented stack

**Detect:**

- Items in code but not in docs (undocumented features)
- Items in docs but not in code (missing implementations or obsolete docs)
- Mismatches in fields, types, or patterns

### 0.4.4 Classify Inconsistencies

**Severity Levels:**

🔴 **CRITICAL** (Requires user decision):

- Documented entity/endpoint not implemented
- Major architectural mismatch

🟡 **MEDIUM** (Auto-correctable with confirmation):

- Implemented endpoint not documented
- Missing fields in docs

🟢 **LOW** (Auto-correctable):

- Obsolete fields in docs
- Outdated version numbers

### 0.4.5 Generate Audit Summary

**Output:** Concise summary (full report saved for later).

```
---
📊 Documentation Audit Summary

Consistency Score: 72%

🔴 Critical: 2 issues
  - Entity 'Category' documented but not in schema
  - Endpoint POST /api/auth/register documented but missing

🟡 Medium: 5 issues
  - 3 endpoints implemented but not documented
  - 2 entity fields missing in docs

🟢 Minor: 3 issues
  - 3 obsolete fields in documentation

💡 Recommendation:
  - Review critical issues before continuing
  - Full audit report will be generated in Phase 8
  - Auto-corrections can be applied after Phase 8
---
```

### 0.4.6 Handle Critical Issues (If Any)

**If critical issues found:**

```
⚠️ Critical inconsistencies detected!

How would you like to proceed?
A) Continue to Phase 1 (address issues later in Phase 8) ⭐
B) Review critical issues now (interactive)
C) Cancel /flow-build (fix manually first)

> _
```

**Option A (Recommended):** Continue to Phase 1

- Save audit data for Phase 8
- Phase 8 will offer to apply corrections

**Option B:** Interactive review now

```
🔴 Critical Issue 1/2: Entity 'Category'
   Documented in docs/data-model.md but NOT in schema

   What should we do?
   A) Mark as "To Implement" (add to roadmap)
   B) Mark as "Obsolete" (remove from docs in Phase 8)
   C) Skip for now

> _
```

**Option C:** Cancel

- User fixes issues manually
- Re-run `/flow-build` later

### 0.4.7 Save Audit Data

> **📌 IMPORTANT - Phases 9-10 for Existing Projects:**
>
> If the project has **substantial functional code already implemented** (detected in Layer 1-3):
>
> - Set `phase9.recommendation = "SKIP"` with reason: "Project already implemented - roadmap not needed"
> - Set `phase10.recommendation = "SKIP"` with reason: "Project already implemented - user stories not needed"
>
> **Phases 9-10 are only useful for:**
>
> - New projects (no code yet)
> - Projects in early development (< 30% features implemented)
>
> **For existing projects**, focus on Phases 1-8 (documentation sync) instead.

**Save to:** `.ai-flow/cache/audit-data.json`

```json
{
  "auditPerformed": true,
  "timestamp": "2025-12-22T16:43:00Z",
  "consistencyScore": 72,
  "critical": 2,
  "medium": 5,
  "minor": 3,
  "userDecisions": {
    "Category": "obsolete",
    "POST /api/auth/register": "to_implement"
  },
  "phases": {
    "phase1": {
      "file": "project-brief.md",
      "exists": true,
      "consistencyScore": 100,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Complete business context documented"
    },
    "phase2": {
      "file": "docs/data-model.md",
      "exists": true,
      "consistencyScore": 98,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "All entities documented and match schema"
    },
    "phase3": {
      "file": "docs/architecture.md",
      "exists": true,
      "consistencyScore": 87,
      "recommendation": "HYBRID",
      "gaps": ["api_versioning", "rate_limiting"],
      "reason": "Architecture documented but missing 2 details"
    },
    "phase4": {
      "file": "specs/security.md",
      "exists": true,
      "consistencyScore": 95,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Security patterns match implementation"
    },
    "phase5": {
      "file": "docs/code-standards.md",
      "exists": true,
      "consistencyScore": 92,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Standards documented and enforced"
    },
    "phase6": {
      "file": "docs/testing.md",
      "exists": true,
      "consistencyScore": 90,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Testing strategy documented"
    },
    "phase7": {
      "file": "docs/deployment.md",
      "exists": true,
      "consistencyScore": 82,
      "recommendation": "HYBRID",
      "gaps": ["monitoring_strategy", "incident_runbooks"],
      "reason": "Deployment documented but missing operational details"
    },
    "phase8": {
      "file": "AGENT.md",
      "exists": true,
      "consistencyScore": 95,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Final documentation complete and up-to-date"
    },
    "phase9": {
      "file": "planning/roadmap.md",
      "exists": false,
      "consistencyScore": 0,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Project already implemented - roadmap not needed for existing code"
    },
    "phase10": {
      "file": "planning/user-stories/",
      "exists": false,
      "consistencyScore": 0,
      "recommendation": "SKIP",
      "gaps": [],
      "reason": "Project already implemented - user stories not needed for existing features"
    }
  }
}
```

**Recommendation Logic:**

- **SKIP** (≥95%): Phase can be skipped, use existing docs
- **HYBRID** (80-94%): Ask only missing questions, merge with existing docs
- **FULL** (<80% or file missing): Execute full phase with pre-filled answers

This data will be used in Phases 1-7 to:

1. Determine if phase can be skipped
2. Identify specific gaps to ask about
3. Merge new answers with existing documentation

This data will be used in Phase 8 to:

1. Generate detailed audit report
2. Apply auto-corrections
3. Update roadmap with "To Implement" items

---

## 0.5 Validation & Synthesis

### Present Findings

Show the final report including:

1. **🔍 PROJECT STACK DETECTED** (from Layers 1-3)
2. **📊 Documentation Audit Summary** (from Layer 4, if executed)

Ask for confirmation to proceed to Phase 1.

### 💾 Cache & Pre-populate

**Create directory structure (if not exists):**

```bash
mkdir -p .ai-flow/cache .ai-flow/work .ai-flow/archive
```

1. **Export code analysis:** `.ai-flow/cache/docs-analysis.json`
2. **Export audit data:** `.ai-flow/cache/audit-data.json` (if Layer 4 executed)
3. **Pre-populate:** Fill answers for Phases 1-7 based on detected data

### 🎯 Set Flags for Phase 8

If documentation audit was performed:

- Set flag: `auditPerformed: true`
- Phase 8 will:
  - Generate detailed audit report (`docs/audit-report.md`)
  - Offer to apply auto-corrections (🟡 Medium + 🟢 Low)
  - Update roadmap with "To Implement" items (🔴 Critical marked as such)

---

✅ **Phase 0 Complete: Context Analysis Finalized**

---

### Phase Summary

- Pre-populated detected tech stack values.
- Architectural patterns identified.
- Context cached in `.ai-flow/cache/docs-analysis.json`.
- **Documentation audit completed** (if existing docs found).
- **Inconsistencies flagged** for Phase 8 resolution.

---

**Next Phase:** Phase 1 - Discovery & Business Requirements

**What happens next:**

- Phase 1-7 will use pre-populated answers (40-60% filled)
- You'll only answer questions that couldn't be auto-detected
- Phase 8 will offer to resolve documentation inconsistencies

Next: read phase-1.md from this phases/ directory

---

_Version: 4.3 (Antigravity Optimized - With Integrated Audit)_
_Last Updated: 2025-12-22_
