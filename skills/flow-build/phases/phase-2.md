## PHASE 2: Data Architecture (15-20 min)

> **Order for this phase:** 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7

> **📌 Scope-based behavior:**
>
> - **MVP/Basic Scope:** Focus only on essential data/API design.
> - **Production-Ready Scope:** In-depth modeling including patterns, constraints, and strategies.

### Objective

> **📌 This phase adapts to your PROJECT_TYPE (detected in Phase 0):**
>
> - **backend / fullstack** → Data Architecture: design DB model, entities, relationships
> - **frontend / mobile** → API Contracts: define how the app consumes the backend API

---

## 🔍 Pre-Flight Check (Smart Skip Logic)

Run the smart-skip script to determine how to proceed with this phase:

```
node "$SCRIPT" --smart-skip --phase 2
```

Read `phases.phase2.recommendation` from the JSON output:

- **`SKIP`** — phase output doc is up-to-date; skip this phase entirely and move to Phase 3.
- **`HYBRID`** — phase output doc exists but has gaps; regenerate only the sections listed in `phases.phase2.gaps`.
- **`FULL`** — phase output doc is missing or stale; run the full phase below.

**Execute Pre-Flight Check for Phase 2:**

- **Target File (backend/fullstack)**: `docs/data-model.md`
- **Target File (frontend/mobile)**: `docs/api-contracts.md`
- **Phase Name**: "DATA ARCHITECTURE / API CONTRACTS"

**Proceed with appropriate scenario based on audit data from `.ai-flow/cache/audit-data.json`**

---

<!-- ============================================================ -->
<!-- BACKEND / FULLSTACK: Database Design                         -->
<!-- ============================================================ -->

## [BACKEND & FULLSTACK ONLY] Phase 2 Questions — Data Architecture

> Skip this section entirely if PROJECT_TYPE is `frontend` or `mobile`. Go to the API Contracts section below.

**2.1 Database Type**

```
[If detected from Phase 0, show:]
✅ Database Detected: [PostgreSQL/MySQL/MongoDB/etc.]
✅ ORM/Client: [Prisma/TypeORM/Sequelize/SQLAlchemy/etc.]

Is this correct? (Y/N)

[If NOT detected, ask:]
What type of database will you use?

A) ⭐ PostgreSQL - Recommended for most backends
B) 🔥 MySQL/MariaDB - Popular, proven
C) ⚡ MongoDB - NoSQL, flexible schema
D) 🏆 Multi-database - PostgreSQL + Redis + S3, etc.
E) Other: [specify]
```

**2.2 Core Data Entities**

```
[If detected from Phase 0, show detected entities and confirm.]

[If NOT detected, list common entities by system type from Phase 1 (e-commerce, SaaS, CRM, social)]

List your entities with brief descriptions:
1.
2.
3.
...
```

**2.3 Relationships**

```
Select relationship patterns that apply:

⭐ One-to-Many: User → Order, Organization → User, Post → Comment, etc.
⭐ Many-to-Many (via join table): Order ↔ Product, User ↔ Role, etc.
⭐ One-to-One: Order → Payment, User → Profile, etc.
⭐ Polymorphic: Activity → (User | Organization | Deal), etc.

Your specific relationships:
- EntityA → EntityB: [type] - [description]
```

**2.4 Data Volume Estimates**

```
Year 1 estimates:
- Total records: Low (<10k) / Medium (10k-1M) / High (>1M)
- Growth rate: Slow / Moderate / Fast
- Data complexity: Low (text) / Medium (images/docs) / High (video/large files)
```

**2.5 Data Retention**

```
A) Keep forever
B) Regulatory compliance (specific period)
C) Archival strategy (archive after __ months)
D) Auto-deletion (delete after __ days/months)
```

**2.6 Data Migration**

```
A) New system - No legacy data
B) Replacing existing - migrate from [system name]
C) Integration - syncing with existing system
```

**2.7 Critical Data Patterns**

```
Select patterns that apply:
A) Soft deletes (deleted_at flag)
B) Audit trail (who changed what/when)
C) Temporal data (historical versions)
D) Multi-tenancy (data isolation per org)
E) Polymorphic relationships
F) Graph relationships
G) Aggregations/Materialized views
H) Partitioning (by date/region/etc.)

State machines for entities with lifecycle (Order: draft→pending→confirmed→shipped→delivered)?
DDD patterns (Aggregate Roots, Domain Events)?
Transaction boundaries (atomic operations)?
```

**2.8 Database Indexes**

```
What indexes do you need?
A) Foreign keys
B) Frequently queried columns (email, status, etc.)
C) Columns in WHERE / JOIN / ORDER BY clauses
D) Composite indexes for multi-column queries

Your specific indexes:
1.
2.
```

**2.9 Transaction Isolation**

```
A) ⭐ READ COMMITTED (recommended default)
B) REPEATABLE READ
C) SERIALIZABLE (enterprise, slowest)

Consistency model:
A) ⭐ Strong consistency
B) Eventual consistency (distributed systems)
```

**2.10 Schema Migrations**

```
Migration tool: Prisma Migrate / TypeORM / Alembic / Flyway / Django / Laravel / Other

Strategy:
A) ⭐ Versioned migrations
B) Auto-migrations
C) Manual SQL scripts

Zero-downtime migrations: Yes (Production) / No (MVP)
```

### Phase 2 Output (Backend/Fullstack)

```
📋 PHASE 2 SUMMARY:
Database: [type]
Core Entities: [list]
Relationships: [key relationships]
Data Volume: [estimates]
Retention: [policies]
Data Patterns: [selected]
Indexes: [list]
Transaction Isolation: [level]
Schema Migrations: [tool + strategy]
```

### Generate Documents (Backend/Fullstack)

Generate `docs/data-model.md`:

- Use template: `.ai-flow/templates/docs/data-model.template.md`
- Include entity catalog, relationships, data patterns
- Include Mermaid ER diagram showing all entities and relationships

---

<!-- ============================================================ -->
<!-- FRONTEND / MOBILE: API Contracts                             -->
<!-- ============================================================ -->

## [FRONTEND & MOBILE ONLY] Phase 2 Questions — API Contracts

> Skip this section entirely if PROJECT_TYPE is `backend`. Use the Data Architecture section above.

### Objective

Define how the frontend/mobile app will consume the backend API: endpoints used, data types, authentication, and data fetching strategy.

**2.1 API Type & Location**

```
What type of API does your app consume?

A) ⭐ REST API (JSON over HTTP)
B) GraphQL
C) gRPC / Protocol Buffers
D) WebSocket / Real-time
E) Multiple / Mixed

API base URL pattern:
A) Same domain (/api/v1/...)
B) Separate domain (api.myapp.com)
C) Third-party only (no custom backend)
D) Not yet defined (will be specified)

Is the API already built or in progress?
A) ✅ Yes, API is live - I can share the docs/spec
B) 🔄 In progress - I have partial docs
C) 📋 Planned - Design phase only
```

**2.2 Authentication Strategy**

```
How does the app authenticate with the API?

A) ⭐ JWT tokens (Bearer Authorization header)
B) Session cookies
C) OAuth 2.0 / Social login (Google, GitHub, etc.)
D) API keys
E) No authentication (public API)

Token storage strategy (if JWT):
A) ⭐ Memory (most secure, lost on refresh)
B) localStorage (convenient, XSS risk)
C) httpOnly cookie (secure, CSRF consideration)

Token refresh strategy:
A) ⭐ Silent refresh (auto-renew before expiry)
B) Re-login on expiry
C) No refresh tokens
```

**2.3 Core API Endpoints Used**

```
List the main API endpoints your app will consume.
Group by resource/domain:

Example:
Auth:
  POST /auth/login       → returns { token, user }
  POST /auth/register    → returns { user }
  POST /auth/refresh     → returns { token }

Users:
  GET  /users/me         → returns { user profile }
  PUT  /users/me         → updates profile

[Your domain]:
  GET  /[resource]       → returns [...]
  POST /[resource]       → creates [...]
  ...

If you have OpenAPI/Swagger docs, paste the URL or share key endpoint specs.
```

**2.4 Data Types & Response Shapes**

```
For your core entities, define the response shape the frontend expects.

Example:
User: { id, email, name, avatar, role, createdAt }
Product: { id, name, price, images[], category, stock }
Order: { id, status, items[], total, createdAt }

Your core types:
1. [Entity]: { fields... }
2. [Entity]: { fields... }
3. [Entity]: { fields... }
```

**2.5 Data Fetching Strategy**

```
How will the app fetch and manage API data?

A) ⭐ React Query / TanStack Query (recommended for React/Next.js)
B) SWR (lightweight, stale-while-revalidate)
C) Redux Toolkit Query (RTK Query)
D) Apollo Client (GraphQL)
E) Vuex/Pinia actions (Vue/Nuxt)
F) Zustand + fetch (minimal)
G) Native fetch/axios only (no caching layer)
H) Flutter http / dio (mobile)
I) Native URLSession / Retrofit (iOS/Android)

Caching strategy:
A) ⭐ Cache with background revalidation
B) Cache-first (offline-first)
C) Network-first (always fresh)
D) No caching

Real-time requirements:
A) WebSockets (live updates, chat, notifications)
B) SSE / Server-Sent Events
C) Polling (every N seconds)
D) No real-time needed
```

**2.6 Error Handling & Loading States**

```
How will the app handle API errors?

Global error handling:
A) ⭐ Global interceptor (axios/fetch wrapper)
B) Per-request error handling
C) Error boundary components

Error response format from API:
{ error: "message" } / { message, code } / Other: [specify]

Loading states:
A) ⭐ Skeleton loaders
B) Spinners
C) Optimistic updates (show result before API confirms)

Offline behavior:
A) Show "offline" banner, retry when reconnected
B) Cache last state, allow read-only
C) No offline support needed
```

**2.7 API Mocking & Development**

```
How will you develop without a live backend?

A) ⭐ MSW (Mock Service Worker) - intercepts at network level
B) JSON Server / json-server (local mock API)
C) Mirage.js
D) Manual mocks in tests only
E) API is already available, no mocking needed

Storybook integration:
A) Yes - stories use mocked API responses
B) No Storybook in this project
```

### Phase 2 Output (Frontend/Mobile)

```
📋 PHASE 2 SUMMARY:
API Type: [REST/GraphQL/etc.]
Auth Strategy: [JWT/OAuth/etc.]
Core Endpoints: [list by domain]
Core Data Types: [list with shapes]
Data Fetching: [library + caching strategy]
Error Handling: [strategy]
Offline Support: [yes/no + approach]
API Mocking: [tool]
```

### Generate Documents (Frontend/Mobile)

Generate `docs/api-contracts.md`:

- API type & base URL
- Auth strategy & token handling
- Core endpoints grouped by domain
- Data type definitions
- Data fetching patterns & caching strategy
- Error handling approach

---

## 📝 Generated Documents

After Phase 2, generate/update:

- Backend/Fullstack: `docs/data-model.md`
- Frontend/Mobile: `docs/api-contracts.md`

---

**Next Phase:** Phase 3 - System Architecture (15-20 min)

Next: read phase-3.md from this phases/ directory

---

_Version: 5.0 (Universal — Backend DB + Frontend/Mobile API Contracts)_
_Last Updated: 2026-03-17_
