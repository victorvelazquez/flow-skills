## PHASE 5: Code Standards (15-20 min)

> **Order for this phase:** 5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8 → 5.9 → 5.10 → 5.11 → 5.12 → 5.13

> **📌 Scope-based behavior:**
>
> - **MVP:** Ask 5.1-5.5 only (formatting, naming, structure, coverage target, Git workflow), skip 5.6-5.13 (advanced practices)
> - **Production-Ready:** Ask all questions 5.1-5.13
> - **Enterprise:** Ask all questions 5.1-5.13 with emphasis on governance and documentation

### Objective

Establish code quality rules, naming conventions, and development practices.

---

## 🔍 Pre-Flight Check (Smart Skip Logic)

Run the smart-skip script to determine how to proceed with this phase:

```
node "$SCRIPT" --smart-skip --phase 5
```

Read `phases.phase5.recommendation` from the JSON output:

- **`SKIP`** — `docs/code-standards.md` is up-to-date; skip this phase entirely and move to Phase 6.
- **`HYBRID`** — `docs/code-standards.md` exists but has gaps; regenerate only the sections listed in `phases.phase5.gaps`.
- **`FULL`** — `docs/code-standards.md` is missing or stale; run the full phase below.

**Execute Pre-Flight Check for Phase 5:**

- **Target File**: `docs/code-standards.md`
- **Phase Name**: "CODE STANDARDS"
- **Key Items**: Linters, formatters, naming conventions, code review process
- **Typical Gaps**: Team-specific conventions, code review workflow

**Proceed with appropriate scenario based on audit data from `.flow-skills/cache/audit-data.json`**

---

## Phase 5 Questions (Full Mode)

**5.1 Code Style & Formatting**

```
Formatting preferences:

Indentation:
A) ⭐ 2 spaces - Recommended for JavaScript/TypeScript
B) 4 spaces - Common for Python, Java
C) Tabs

Quotes:
A) ⭐ Single quotes - 'text' (JavaScript)
B) Double quotes - "text" (Python, Java)

Line length:
A) ⭐ 80 characters - Traditional
B) 100 characters - Modern balance
C) 120 characters - Wide screens

Semicolons (JavaScript/TypeScript):
A) ⭐ Required - Always use semicolons
B) Optional - ASI (Automatic Semicolon Insertion)

Trailing commas:
A) ⭐ Yes - ES5+ compatible, cleaner diffs
B) No

Formatter & Linter:
A) ⭐ Prettier + ESLint - Recommended combination
   - Prettier: Auto-format on save (style/formatting)
   - ESLint: Code quality and error detection
   - Use eslint-config-prettier to avoid conflicts

B) ESLint only - With formatting rules
   - Handles both linting and formatting
   - More config overhead

C) Prettier only - Formatting without linting
   - Fast, opinionated formatting
   - No code quality checks

D) EditorConfig only - Basic cross-editor consistency

E) Manual formatting - Not recommended

Your choice: __
```

**5.2 Naming Conventions**

```
Naming style by type:

Files:
A) ⭐ kebab-case - user-service.ts, api-controller.ts
B) camelCase - userService.ts, apiController.ts
C) PascalCase - UserService.ts, ApiController.ts

Classes/Interfaces:
A) ✅ PascalCase - UserService, IUserRepository

Functions/Methods:
A) ✅ camelCase - getUserById, createOrder

Variables:
A) ✅ camelCase - userName, totalPrice

Constants:
A) ✅ UPPER_SNAKE_CASE - MAX_RETRIES, API_BASE_URL

Interfaces (TypeScript):
A) ⭐ I-prefix - IUserService, IRepository
B) No prefix - UserService, Repository
C) -Interface suffix - UserServiceInterface

Boolean variables:
A) ✅ is/has/can prefix - isActive, hasPermission, canEdit
```

**5.3 File Organization**

> **Note:** The AI will adapt the following examples to match your selected language/framework from Phase 3 (questions 3.1 and 3.2). File extensions, naming conventions, and folder names will be automatically adjusted.

```
Project structure approach:

A) ⭐ Feature-based (Modular) - Recommended for most projects

Group by feature/module with subfolders for organization:

[DYNAMIC EXAMPLE - AI will adapt based on your stack]

TypeScript/NestJS example:
src/
  modules/
    users/
      dto/
        create-user.dto.ts
        update-user.dto.ts
      entities/
        user.entity.ts
      users.controller.ts
      users.service.ts
      users.repository.ts
      users.module.ts
    orders/
      dto/
      entities/
      orders.controller.ts
  common/
    guards/
    interceptors/
  config/

Python/FastAPI example:
src/
  modules/
    users/
      schemas/
        user_create.py
        user_update.py
      models/
        user.py
      users_controller.py
      users_service.py
      users_repository.py
    orders/
      schemas/
      models/
  common/
    dependencies/
    middleware/

Java/Spring Boot example:
src/main/java/com/myapp/
  modules/
    users/
      dto/
        CreateUserDto.java
        UpdateUserDto.java
      domain/
        User.java
      UsersController.java
      UsersService.java
      UsersRepository.java
    orders/
  common/
    config/
    security/

Go example:
src/
  modules/
    users/
      models/
        user.go
      handlers/
        user_handler.go
      services/
        user_service.go
      repositories/
        user_repository.go
    orders/
  common/
    middleware/

C#/.NET Core example:
src/
  Modules/
    Users/
      DTOs/
        CreateUserDto.cs
        UpdateUserDto.cs
      Entities/
        User.cs
      UsersController.cs
      UsersService.cs
      UsersRepository.cs
    Orders/
      DTOs/
      Entities/
  Common/
    Middleware/
    Extensions/

Benefits: Scalable, easy to find related code, clear module boundaries
---
B) 🏆 Feature-based (Flat) - Simple projects

Flat structure within each feature (AI will adapt naming):

src/
  users/
    user_controller
    user_service
    user_repository
    user_dto
    user_entity
  orders/
    order_controller
    order_service
    ...

Benefits: Simpler, fewer folders, good for small projects
---
C) Layer-based (Traditional) - Legacy style

Group by technical layer/type (AI will adapt naming):

src/
  controllers/
    user_controller
    order_controller
  services/
    user_service
    order_service
  repositories/
    user_repository
    order_repository
  entities/
    user_entity
    order_entity
  dto/
    create_user_dto
    create_order_dto

Benefits: Clear separation by type, familiar for MVC developers
Drawbacks: Hard to see feature boundaries, files scattered
---
D) Hybrid - Domain + Shared layers

Modules for features + shared technical folders (AI will adapt):

src/
  modules/
    users/
      (feature code)
    orders/
      (feature code)
  shared/
    services/
    utils/
  infrastructure/
    database/
    .flow-skills/cache/

Your choice: __
Why?
---
After you select, the AI will generate the exact folder structure with proper:
- File extensions (.ts, .py, .java, .go)
- Naming conventions (camelCase, snake_case, PascalCase)
- Framework-specific folders (dto vs schemas, entities vs models vs domain)
- Common patterns for your chosen stack
```

**5.4 Import Organization**

```
Import ordering:

A) ⭐ Recommended order:
1.  External libraries (react, express, etc.)
2.  Internal modules (@/services, @/utils)
3.  Relative imports (./user.dto, ../shared)
4.  Types/Interfaces
5.  Styles/Assets

B) Alphabetical
C) No specific order

Path aliases:
A) ✅ Yes - Use @ for src root
- import { UserService } from '@/services/user.service';

B) No - Use relative paths only
```

**5.5 TypeScript/Type Rules**

```
(Skip if not using TypeScript)

A) ✅ Strict mode - Enable all strict checks ⭐
B) ❌ any allowed - Use any when needed (not recommended)
C) ⚠️ Gradual typing - Start loose, tighten over time

Rules:
- ✅ No implicit any
- ✅ Strict null checks
- ✅ No unused variables
- ✅ Explicit function return types
- ✅ Interface over type (when possible)

Type preference:
A) Interfaces for object shapes
B) Types for unions/intersections
C) Mix both as needed ⭐
```

**5.6 Error Handling**

```
Error handling strategy:

A) ⭐ Try-catch with custom error classes
- Centralized error handler
- HTTP error mapping
- Detailed error messages

B) Error codes/enums
- Consistent error codes across app

C) Result pattern
- Never throw, return Result<T, Error>

Your approach: __

Error logging:
A) ⭐ All errors logged with context
B) Only server errors (5xx)
C) Errors + warnings

Error responses to client:
A) ⭐ Detailed in dev, generic in production
- Dev: Full stack trace
- Prod: Error code + user-friendly message

B) Always detailed
C) Always generic
```

**5.7 Comments & Documentation**

````
When to comment:

A) ⭐ Recommended approach:
- Complex business logic
- Non-obvious solutions
- TODOs and FIXMEs
- Public APIs (JSDoc/Docstrings)
- Configuration decisions

B) Minimal comments - Self-documenting code only
C) Extensive comments - Every function

Doc comments:
A) ✅ JSDoc for TypeScript/JavaScript
B) ✅ Docstrings for Python
C) ✅ JavaDoc for Java

Example:
```typescript
/**
 * Calculates user's total order value for the current month
 * @param userId - The unique user identifier
 * @param includeDiscounts - Whether to apply promotional discounts
 * @returns Total value in cents
 */
async function calculateMonthlyTotal(
  userId: string,
  includeDiscounts: boolean
): Promise<number>;
```

````

**5.8 Testing Standards**

```

Test coverage requirements:

Minimum coverage:
A) 🏆 80%+ - Enterprise standard
B) ⭐ 70%+ - Recommended for most projects
C) 50%+ - Minimum acceptable
D) No requirement

What to test:

- ✅ Services/Business logic - 80%+ coverage
- ✅ Controllers/Routes - 60%+ coverage
- ✅ Utilities/Helpers - 90%+ coverage
- ✅ Database repositories - 70%+ coverage
- ❓ DTOs/Entities - Usually no tests needed

Test file naming:
A) ⭐ .spec.ts / .test.ts - Next to source file
B) Separate tests/ folder

Mocking strategy:
A) ⭐ Mock external dependencies (DB, APIs)
B) Integration tests with real DB
C) Mix: Unit tests mock, integration tests don't

```

**5.9 Code Complexity Limits**

```

Code quality metrics:

Function length:
A) ⭐ Max 50 lines per function
B) Max 100 lines
C) No limit

Cyclomatic complexity:
A) ⭐ Max complexity 10
B) Max complexity 15
C) No limit

Parameters:
A) ⭐ Max 4 parameters (use object for more)
B) Max 6 parameters
C) No limit

Nesting depth:
A) ⭐ Max 3 levels
B) Max 4 levels
C) No limit

```

**5.10 Git Commit Standards**

````

Commit message format:

A) ⭐ Conventional Commits

```

<type>(<scope>): <subject>

<body>

<footer>
```

Types: feat, fix, docs, style, refactor, test, chore

Example:

```
feat(auth): add JWT refresh token rotation

- Implement token rotation on every refresh
- Store refresh tokens in Redis
- Add expiration cleanup job

Closes #123
```

B) Simple descriptive messages
C) No standard

Branch naming:
A) ⭐ feature/description, bugfix/description, hotfix/description
B) Your initials + description (e.g., jd/add-auth)
C) No standard

````

**5.11 Versioning & Changelog**

```

Versioning policy:

What versioning scheme will you use?
A) ⭐ SemVer (Major.Minor.Patch) (recommended)
B) Date (YYYY.MM.DD)
C) Other: \_\_

Migration strategy:
How will you handle breaking changes and migrations?
A) ⭐ Document in the changelog and provide migration scripts (recommended)
B) Only document changes
C) Other: \_\_

Changelog:
How will you document and communicate changes?
A) ⭐ CHANGELOG.md in the repository (recommended)
B) Releases on GitHub/GitLab
C) Notes in documentation
D) Other: \_\_

Who will be responsible for updating the changelog?
A) ⭐ Tech Lead (recommended)
B) Author of the change (who does the PR)
C) Documentation team
D) Other: \_\_
Example roles: Tech Lead, release manager, PR author, documentation team, etc.

```

**5.12 Logging Standards**

```
What logging approach will you use?

Log format:
A) ⭐ Structured JSON - Machine-readable, easy to parse (recommended)
B) Plain text - Human-readable, traditional
C) Both - Different formats for different environments

Log levels:
- DEBUG: Detailed debugging info (development only)
- INFO: General information (request start, successful operations)
- WARN: Warnings (deprecated features, recoverable errors)
- ERROR: Errors (failed operations, exceptions)
- FATAL: Critical errors (system failures)

Default log level:
- Development: __
- Production: __

Log context to include:
A) Request ID (for tracing)
B) User ID (if authenticated)
C) IP address
D) User agent
E) Request path
F) Response status
G) Duration
H) Error stack traces

→ Your selection (e.g., A, B, E, F, G): __

Log aggregation tool:
A) ⭐ CloudWatch (AWS)
B) Datadog
C) ELK Stack (Elasticsearch, Logstash, Kibana)
D) Splunk
E) Other: __

Log retention: __ days
```

**5.13 Custom Project Rules**

```
Do you have any project-specific rules for AI assistants?

❌ NEVER Rules (things that should NEVER be done):

Examples of NEVER rules:
- Never use ORM X, always use ORM Y
- Never modify files in the /legacy folder
- Never use inline styles in components
- Never bypass the API gateway

Your custom NEVER rules:
1. __
2. __
3. __
(Leave blank if none)

✅ ALWAYS Rules (things that should ALWAYS be done):

Examples of ALWAYS rules:
- Always use the company's error handling wrapper
- Always include tenant_id in database queries
- Always use the shared logging utility
- Always run security scan before commit

Your custom ALWAYS rules:
1. __
2. __
3. __
(Leave blank if none)
```

### Phase 5 Output

```
📋 PHASE 5 SUMMARY:

Formatting: [indentation, quotes, line length, formatter + linter]
Naming: [files, classes, functions, variables, constants, interfaces style]
File Organization: [feature-based / layer-based / hybrid + rationale]
Imports: [ordering strategy, path aliases]
Type Rules: [strict mode, rules applied, type preferences]
Error Handling: [strategy, logging approach, client response format]
Comments: [when to comment, doc style (JSDoc/Docstrings/JavaDoc)]
Testing: [coverage % target, what to test, file naming, mocking strategy]
Complexity: [function length, cyclomatic complexity, parameters, nesting depth limits]
Git: [commit format (conventional/simple), branch naming convention]
Versioning: [scheme (SemVer/Date), migration strategy, changelog method, responsibility]
Logging Standards: [format (JSON/text), levels, context, aggregation tool, retention]
Custom Rules: [NEVER rules count, ALWAYS rules count]

Is this correct? (Yes/No)
```

---

### 📄 Generate Phase 5 Documents

**Before starting generation:**

```
📖 Loading context from previous phases...
✅ Re-reading project-brief.md
✅ Re-reading docs/architecture.md
✅ Re-reading ai-instructions.md
✅ Re-reading specs/security.md
```

**Generate documents automatically:**

**1. `docs/code-standards.md`**

- Fill with all code quality rules, naming conventions, formatting
- Write to: `docs/code-standards.md`

**2. Update `ai-instructions.md`**

- Add code style rules to formatting section
- Add complexity limits and testing requirements

```
✅ Generated: docs/code-standards.md
✅ Updated: ai-instructions.md (code standards added)

Documents have been created with all Phase 5 information.

📝 Would you like to make any corrections before continuing?

→ If yes: Edit the files and type "ready" when done. I'll re-read them.
→ If no: Type "continue" to proceed to Phase 6.
```

**If user edits files:**
Re-read files to refresh context before continuing.

---

**Proceed to Phase 6 only after documents are validated.**

> ⚠️ **CRITICAL:** DO NOT generate README.md in this phase. README.md is ONLY generated in Phase 8 (step 8.5) after framework initialization.

---

## 📝 Generated Documents

After Phase 5, generate/update:

- `docs/code-standards.md` - Development practices and quality rules

---

**Next Phase:** Phase 6 - Testing Strategy (15-20 min)

Next: read phase-6.md from this phases/ directory

---

**Last Updated:** 2025-12-20
**Version:** 2.1.8
