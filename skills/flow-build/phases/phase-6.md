## PHASE 6: Testing Strategy (15-20 min)

> **Order for this phase:**
>
> - **MVP:** 6.1 → 6.2 (smoke tests) → 6.7 (CI basics)
> - **Production-Ready:** 6.1 → 6.1b → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7
> - **Enterprise:** 6.1 → 6.1b → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7 → 6.8 → 6.9

> **📌 Scope-based behavior:**
>
> - **MVP:** Ask 6.1 (framework), 6.2 (smoke tests only), 6.7 (CI basics) - **Target: 15-25% coverage**
> - **Production-Ready:** Ask all questions 6.1-6.7 - **Target: 60-80% coverage**
> - **Enterprise:** Ask all questions 6.1-6.9 - **Target: 80-95% coverage + contract/load tests**

### Objective

Define testing approach, tools, and quality gates.

**🚨 Important: All projects require basic testing. Scope determines depth, not whether to test.**

---

## 🔍 Pre-Flight Check (Smart Skip Logic)

> 📎 **Reference:** See [prompts/shared/smart-skip-preflight.md](../../.ai-flow/prompts/shared/smart-skip-preflight.md) for the complete smart skip logic.

**Execute Pre-Flight Check for Phase 6:**

- **Target File**: `docs/testing.md`
- **Phase Name**: "TESTING STRATEGY"
- **Key Items**: Test framework, coverage targets, test types, CI/CD integration
- **Typical Gaps**: E2E strategy, load testing, performance testing

**Proceed with appropriate scenario based on audit data from `.ai-flow/cache/audit-data.json`**

---

## Phase 6 Questions (Full Mode)

**6.1 Testing Framework**

```

Which testing tools will you use?

JavaScript/TypeScript:
A) ⭐ Jest - Most popular, great ecosystem
B) Vitest - Modern, fast, Vite-compatible
C) Mocha + Chai
D) AVA

Python:
E) ⭐ pytest - Modern, feature-rich
F) unittest - Built-in
G) nose2

Java:
H) ⭐ JUnit 5 + Mockito
I) TestNG

Your choice: \_\_

Assertion library: **
Mocking library: **

```

**6.1b Testing Philosophy** (Production-Ready and Enterprise only)

```
What is your testing philosophy?

A) ⭐ Test-First (TDD) - Write tests before code
   - Red-Green-Refactor cycle
   - Higher initial effort, better design
   - Best for: Complex business logic, critical systems

B) 🔥 Test-After - Write tests after implementation
   - Faster initial development
   - Risk of untested edge cases
   - Best for: Rapid prototyping, time-sensitive features

C) ⚡ Behavior-Driven (BDD) - Write tests as specifications
   - Given/When/Then format
   - Business-readable tests
   - Best for: Domain-heavy applications

D) 🏆 Hybrid - TDD for core logic, test-after for simple features
   - Balance of speed and quality
   - Pragmatic approach

Your choice: __
```

**6.2 Test Types**

```
[If MVP scope selected, ask simplified version:]

For MVP, we'll focus on smoke tests (critical path verification).
Which critical flows should be tested?

Select 3-5 most important endpoints/features:
A) Authentication (login/register)
B) Main business operation (e.g., create order, post article)
C) User profile/account management
D) Payment processing (if applicable)
E) Data retrieval (main GET endpoints)

Selected: __

Test approach: Integration tests covering happy path of selected flows
Coverage target: 15-25%
Test type: Integration/E2E only (no unit tests required for MVP)

[If Production-Ready or Enterprise scope selected, ask full version:]

Which test types will you implement?

A) ✅ Unit Tests
   - Test individual functions/methods in isolation
   - Fast, numerous
   - Mock all dependencies

B) ✅ Integration Tests
   - Test multiple components together
   - Database, external APIs
   - Slower but more realistic

C) ✅ E2E (End-to-End) Tests
   - Test full user flows
   - API endpoints from request to response
   - Tool: Supertest (Node.js), pytest with TestClient (Python)

D) 🏆 Contract Tests (Advanced - Enterprise recommended)
   - Verify API contracts between services
   - Tool: Pact, Spring Cloud Contract

E) ⚡ Load/Performance Tests (Enterprise recommended)
   - Tool: Artillery, K6, JMeter

F) 🔬 Chaos Engineering (Enterprise only)
   - Test system resilience to failures
   - Tool: Chaos Monkey, Litmus, Gremlin

Selected: __

Pyramid distribution:
- 70% Unit tests
- 20% Integration tests
- 10% E2E tests
  (Adjust as needed)

```

**6.3 Test Database** [Skip if MVP scope]

```
[Production-Ready/Enterprise only]

How will you handle database in tests?

A) ⭐ In-memory database
   - SQLite for testing, PostgreSQL for prod
   - Fast, isolated

B) 🏆 Docker test database
   - Same DB as production
   - More realistic
   - Tool: Testcontainers

C) 🔄 Shared test database
   - One DB for all tests
   - Reset between test suites

D) 🎭 Mock database
   - Mock all DB calls
   - Fastest, but less realistic

Your choice: __

Test data strategy:
A) ⭐ Factories/Fixtures - Generate test data programmatically
B) Seed files - Load from JSON/SQL files
C) Inline - Create data in each test

```

**6.4 Test Data Management** [Skip if MVP scope]

```
[Production-Ready/Enterprise only]

How will you create test data?

A) ⭐ Factory pattern
   - Libraries: factory_boy (Python), Fishery (TypeScript)
   - Generate realistic data on demand

B) Fixtures
   - Predefined test data
   - Loaded before tests

C) Faker
   - Random realistic data
   - Library: @faker-js/faker, Faker (Python)

Your approach: __

Example test data needs:
- Users with various roles
- Products with different states
- Orders in different stages
- Payment records
- [Add your specific needs]

```

**6.5 Mocking Strategy** [Skip if MVP scope]

```
[Production-Ready/Enterprise only]

What will you mock?

A) ✅ External APIs - Third-party services
B) ✅ Database - In unit tests
C) ✅ File system - S3, local storage
D) ✅ Time/Date - For deterministic tests
E) ✅ Email/SMS - Sending services
F) ✅ Payment gateways

Mocking approach:
A) ⭐ Manual mocks - jest.fn(), unittest.mock
B) Library - MSW (Mock Service Worker), nock
C) Test doubles - Stubs, spies, mocks

When NOT to mock:
- Internal business logic
- Simple utilities
- Value objects

```

**6.6 Test Organization** [Skip if MVP scope]

```
[Production-Ready/Enterprise only]

Test file structure:

A) ⭐ Co-located with source
```

src/
users/
user.service.ts
user.service.spec.ts

```

B) Separate test directory
```

src/users/user.service.ts
tests/users/user.service.test.ts

````

Test naming:

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com', name: 'Test' };

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
    });

    it('should throw error when email is duplicated', async () => {
      // ...
    });
  });
});
````

Naming pattern:
A) ⭐ "should [expected behavior] when [condition]"
B) "it [expected behavior]"
C) Free-form

````

**6.6.1 Contract Testing** [If selected in 6.2]

```
[Production-Ready/Enterprise only]

Contract testing tool:
A) ⭐ Pact - Consumer-driven contracts
B) Spring Cloud Contract - Provider contracts
C) Other: __

Contract strategy:
A) ⭐ Consumer-driven - Frontend/consumers define contracts
B) Provider-driven - Backend defines contracts
C) Both - Hybrid approach

Contract storage:
A) ⭐ Pact Broker - Centralized contract storage
B) Git repository - Version contracts in code
C) Other: __

Contract versioning:
- Strategy: __
- Breaking changes: __
```

**6.6.2 Load/Performance Testing** [If selected in 6.2]

```
[Production-Ready/Enterprise only]

Load testing tool:
A) ⭐ Artillery - Node.js, YAML-based
B) K6 - Modern, JavaScript-based
C) JMeter - Java-based, GUI available
D) Locust - Python-based
E) Other: __

Test scenarios:
- Normal load: __ requests/second
- Peak load: __ requests/second
- Stress test: __ requests/second (beyond capacity)
- Duration: __ minutes

Performance thresholds:
- Response time p50: < __ ms
- Response time p95: < __ ms
- Response time p99: < __ ms
- Error rate: < __%
- Throughput: > __ requests/second

When to run:
A) ⭐ Before major releases
B) Weekly automated runs
C) On-demand only
```

**6.6.3 Chaos Engineering** [If selected in 6.2 - Enterprise only]

```
[Enterprise only]

Chaos engineering tool:
A) ⭐ Chaos Monkey (Netflix)
B) Litmus (Kubernetes)
C) Gremlin - Managed chaos platform
D) Custom scripts
E) Other: __

Chaos experiments to run:
A) Network latency injection
B) Service failures
C) Database connection failures
D) CPU/memory exhaustion
E) Disk space issues
F) Network partition

→ Your selection (e.g., A, B, C): __

Safety rules:
- Run only in: [Staging, Production with approval]
- Blast radius: __% of traffic/instances
- Auto-rollback: [Yes/No]
- Approval required: [Yes/No]
```

**6.7 CI/CD Testing** [All scopes - simplified for MVP]

```
[If MVP scope:]
For MVP, we'll set up basic CI to run smoke tests.

When will smoke tests run?
A) ⭐ On pull request (GitHub Actions, GitLab CI) - Recommended
B) Before deploy only

Selected: __

Quality gate for MVP:
- ✅ All smoke tests must pass
- ⚠️ Coverage tracking (no minimum required)

[If Production-Ready or Enterprise scope:]

When will tests run?

A) ⭐ On every commit (pre-commit hook) - Catch issues early
B) 🔥 On pull request (GitHub Actions, GitLab CI) - Most popular, prevents broken merges
C) ⭐ Before deploy (staging pipeline) - Recommended safety check
D) Nightly (comprehensive test suite) - For slow/extensive tests

Selected: __

Quality gates:

- ✅ All tests must pass
- ✅ Coverage must be >= __% (15-25% MVP, 60-80% Production, 80-95% Enterprise)
- ✅ No linting errors
- ⚡ Performance benchmarks met (optional, Enterprise recommended)

Failing a quality gate:
A) ⭐ Block merge/deploy - Force fix
B) ⚠️ Warning only - Allow with justification

```

### Phase 6 Output

```
📋 PHASE 6 SUMMARY:

**If MVP scope (A):**
Testing Framework: [Jest/pytest/JUnit] (6.1)
Test Types: Smoke tests on critical paths [selected 3-5 critical flows] (6.2)
Test Approach: Integration/E2E tests covering happy path only (6.2)
Coverage Target: 15-25% (6.2)
CI/CD Testing: [on PR/before deploy] + quality gate: all tests must pass (6.7)
Status: Basic testing implemented for MVP

**If Production-Ready (B):**
Testing Framework: [Jest/pytest/JUnit + assertion library + mocking library] (6.1)
Test Types: [unit/integration/e2e - selected types] (6.2)
Test Distribution: [pyramid percentages: 70/20/10 or custom] (6.2)
Test Database: [in-memory/Docker/shared/mock + initial data strategy] (6.3)
Test Data Management: [factories/fixtures/faker approach + specific test data needs] (6.4)
Mocking Strategy: [what to mock (APIs/DB/files/time/email/payments) + approach] (6.5)
Test Organization: [co-located/separate folder + naming pattern] (6.6)
CI/CD Testing: [when tests run (commit/PR/deploy/nightly) + quality gates (pass/60-80% coverage/lint) + gate behavior (block/warn)] (6.7)
Status: Comprehensive testing strategy implemented

**If Enterprise (C):**
Testing Framework: [Jest/pytest/JUnit + assertion library + mocking library] (6.1)
Test Types: [unit/integration/e2e/contract/load/chaos - all types] (6.2)
Test Distribution: [pyramid percentages: 70/20/10 or custom] (6.2)
Test Database: [in-memory/Docker/shared/mock + initial data strategy] (6.3)
Test Data Management: [factories/fixtures/faker approach + specific test data needs] (6.4)
Mocking Strategy: [what to mock (APIs/DB/files/time/email/payments) + approach] (6.5)
Test Organization: [co-located/separate folder + naming pattern] (6.6)
Contract Testing: [tool (Pact/Spring Cloud Contract) + strategy + storage + versioning] (6.6.1)
Load Testing: [tool (Artillery/K6/JMeter) + scenarios + thresholds + schedule] (6.6.2)
Chaos Engineering: [tool (Chaos Monkey/Litmus/Gremlin) + experiments + safety rules] (6.6.3)
CI/CD Testing: [when tests run (commit/PR/deploy/nightly) + quality gates (pass/80-95% coverage/lint/performance) + gate behavior (block/warn)] (6.7)
Status: Exhaustive testing strategy with advanced scenarios

Is this correct? (Yes/No)
```
---
### 📄 Generate Phase 6 Documents

**Before starting generation:**

```
📖 Loading context from previous phases...
✅ Re-reading docs/code-standards.md
✅ Re-reading ai-instructions.md
```

**Generate `docs/testing.md` automatically:**

- Use template: `.ai-flow/templates/docs/testing.template.md`
- **If MVP scope:** Fill with basic testing strategy: framework selection, smoke tests on critical paths, coverage 15-25%, basic CI setup. Mark advanced sections as "Not implemented yet - expand when moving to Production-Ready"
- **If Production-Ready:** Fill with comprehensive testing strategy: framework, unit/integration/e2e tests, 60-80% coverage, test data management, mocking, full CI/CD
- **If Enterprise:** Fill with exhaustive testing strategy: all Production-Ready items + contract tests, load tests, security tests, 80-95% coverage, performance benchmarks
- Write to: `docs/testing.md`

```
✅ Generated: docs/testing.md

Document has been created with all Phase 6 information.

📝 Would you like to make any corrections before continuing?

→ If yes: Edit the file and type "ready" when done. I'll re-read it.
→ If no: Type "continue" to proceed to Phase 7.
```

**If user edits file:**
Re-read file to refresh context before continuing.
---
**Proceed to Phase 7 only after documents are validated.**

> ⚠️ **CRITICAL:** DO NOT generate README.md in this phase. README.md is ONLY generated in Phase 8 (step 8.5) after framework initialization.
---

## 📝 Generated Documents

After Phase 6, generate/update:
- `docs/testing.md` - Testing strategy and quality gates

---

**Next Phase:** Phase 7 - Operations & Deployment (10-15 min)

Next: read phase-7.md from this phases/ directory

---

**Last Updated:** 2025-12-20
**Version:** 2.1.8

---

## PHASE 7: Operations & Deployment (10-15 min)

````
