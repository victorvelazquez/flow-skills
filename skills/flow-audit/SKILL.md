---
name: flow-audit
description: Stack-agnostic code quality audit — automated checks (lint, typecheck, test, format, coverage, security) + framework-aware LLM code review + auto-fix mode
trigger: /flow-audit command
---

# flow-audit

Trigger: user runs `/flow-audit`

Script path:

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-audit.mjs'))"
```

Store result as `$SCRIPT`. Use it in all commands below.

---

## Stage 1 — Automated Checks

### 1.1 Detect toolchain

```
node "$SCRIPT" --detect
```

Parse JSON: `testRunner`, `linter`, `typeChecker`, `formatter`, `coverage`, `security`, `packageManager`, `framework`, `monorepo`.
If a tool is `null`, mark it as "not configured" and skip it in next steps.
If `monorepo: true`, note it in the report header.

### 1.2 Determine scope

```
node "$SCRIPT" --scope [--since <ref>]
```

Optional flags:

- `--since main` → diff against a branch instead of HEAD~1 (recommended for PR reviews)
- `--scope <path>` → explicit directory or file path

Parse JSON: `files`, `modules`, `hasTests`, `detectionMethod`, `truncated`, `monorepoWarning`.

- If `truncated: true` → note "⚠️ scope truncated at 500 files — consider `--scope <path>` or `--since <branch>`"
- If `monorepoWarning: true` → note "⚠️ monorepo: scope includes all packages — consider `--scope packages/<name>`"
- If `files` is empty → note "no changed files detected" and proceed with full review

### 1.3 Run all tools at once (recommended) OR individually in parallel

**Option A — preferred (single call, true parallel via Promise.all):**

```
node "$SCRIPT" --run-all
```

Returns the aggregated report JSON directly: `{ passed, failed, errored, skipped, overallStatus, summary, totalDuration, ranAt, details }`.

Each entry in `details` includes: `tool`, `status`, `duration`, `keyLines` (first 20 relevant lines), `stdout`, `stderr`.
Read `keyLines` first — only fall back to `stdout`/`stderr` if you need more context.

**Option B — individual calls (issue all simultaneously for parallel execution):**

```
node "$SCRIPT" --run lint
node "$SCRIPT" --run typecheck
node "$SCRIPT" --run test
node "$SCRIPT" --run format
node "$SCRIPT" --run coverage
node "$SCRIPT" --run security
```

Each returns `{ tool, command, exitCode, stdout, stderr, duration, status }`.

Status meanings:

- `status: "passed"` → tool ran cleanly
- `status: "failed"` → tool ran and found issues (lint errors, type errors, test failures) — include output in report
- `status: "error"` → tool could NOT be executed (not installed, permission error, ENOENT) — report as ⚠️ configuration problem, NOT as a code issue
- `status: "skipped"` → tool not detected/configured in this project, note it

Save all results to a temp JSON array, then (only needed for Option B):

```
node "$SCRIPT" --report --file <tempfile>
```

Parse: `{ passed, failed, errored, skipped, overallStatus, summary }`.

Note: `--report` auto-writes to `.flow-skills/work/status.json` if that file exists in the project.

---

## Stage 2 — LLM Code Review

Review the in-scope `files` from Stage 1.2. Read each source file.

### Core perspectives (all stacks):

**P1 — Correctness & logic bugs**

- Off-by-one errors, null/undefined access, wrong conditions, async race conditions, missing error handling

**P2 — Security vulnerabilities**

- Secrets in code, XSS vectors, SQL/command injection, missing auth checks, insecure dependencies

**P3 — Performance**

- N+1 queries, unnecessary re-renders (React: missing keys, inline objects in props/deps), memory leaks (unclosed subscriptions, missing cleanup), O(n²) algorithms, missing pagination

**P4 — Maintainability & readability**

- SOLID violations, DRY violations, high cyclomatic complexity (>10), magic numbers/strings, unclear naming, files >300 lines

**P5 — Test coverage gaps**

- Missing edge cases (null, empty, boundaries), missing error path tests, untested critical paths, weak assertions

### Framework-conditional perspectives:

**P6 — Accessibility (a11y)** ← add when `framework` is `react`, `next`, `nuxt`, `sveltekit`, `angular`, `vue`, or `solid`

- Missing `aria-*` labels, non-keyboard-navigable interactive elements, missing `alt` on images, insufficient color contrast, missing `role` attributes, focus traps

**P7 — Internationalization (i18n)** ← add when `i18next`, `react-i18next`, `vue-i18n`, `@angular/localize`, or similar i18n dep is detected

- Hardcoded user-visible strings (not in translation files), missing translation keys, locale-dependent date/number formatting without `Intl`, concatenated translated strings (breaks non-Latin word order)

**P8 — API contract & type safety at boundaries** ← add when project has API calls (axios, fetch, ky, got) AND a schema library (zod, yup, io-ts, valibot)

- API response shapes not validated with zod/yup at the boundary, `any` casts masking API mismatches, missing error path handling for HTTP errors, response envelope unwrapping inconsistencies

Severity scale: `CRITICAL` (must fix) | `WARN` (fix before merge) | `INFO` (suggestion)

---

## Output Format

Emit a structured report with these exact sections:

```
## [AUTOMATED] — <total duration>ms

- Lint:      ✅ passed (<N>ms) | ❌ failed (<N> errors, <N>ms) | ⚠️ error (tool not found) | ⏭ skipped
- Typecheck: ✅ passed (<N>ms) | ❌ failed (<N> errors, <N>ms) | ⚠️ error (tool not found) | ⏭ skipped
- Tests:     ✅ passed (<N>ms) | ❌ failed (<N> failed, <N>ms)  | ⚠️ error (tool not found) | ⏭ skipped
- Format:    ✅ passed (<N>ms) | ❌ failed (<N> files, <N>ms)   | ⚠️ error (tool not found) | ⏭ skipped
- Coverage:  ✅ passed (<N>ms) | ❌ failed (below threshold, <N>ms) | ⚠️ error | ⏭ skipped
- Security:  ✅ passed (<N>ms) | ❌ failed (<N> vulns, <N>ms)   | ⚠️ error | ⏭ skipped

<For each failed tool: paste keyLines from the result — max 20 lines>
<For status "error": explain which tool binary was not found and how to install it>

## [REVIEW] — <N> files reviewed

### CRITICAL
<file:line — description — fix suggestion — fixable: auto|llm|manual>

### WARN
<file:line — description — fix suggestion — fixable: auto|llm|manual>

### INFO
<file:line — description>

## [VERDICT]

PASS | WARN | FAIL | SKIP

Reason: <one sentence>

## [ACTION PLAN]

🤖 Auto-fixable NOW (`node "$SCRIPT" --fix --auto-only`):
- <issue from REVIEW with fixable: auto, or "none">

🧠 LLM-assisted (I can patch these, verify after):
- <issue from REVIEW with fixable: llm, or "none">

🧑 Manual only (needs your judgment):
- <issue from REVIEW with fixable: manual, or "none">

⏱ Estimated effort: ~<X> min auto + ~<Y> min manual
```

**VERDICT rules:**

- `FAIL` → any CRITICAL issue OR any automated tool `failed` or `error`
- `WARN` → no CRITICAL, but WARN issues exist, or tools were `skipped`
- `PASS` → no issues found, all tools passed
- `SKIP` → ALL tools were skipped (none configured) — note "no toolchain detected" and recommend setup

**Fixability tags** (add to each REVIEW finding):

- `fixable: auto` → can be fixed by running `--fix --auto-only` (lint rules, formatting)
- `fixable: llm` → LLM can propose a patch, then re-run tools to verify (missing error handling, simple type fixes)
- `fixable: manual` → requires human judgment (auth logic, race conditions, architecture decisions)

**ACTION PLAN rules:**

- Only list items that appear in `[REVIEW]` — never invent new issues here
- If a section has no items, write "none" — never omit the section
- Effort estimate: auto fixes ≈ 1 min per item; llm fixes ≈ 5–15 min each; manual ≈ 30+ min each
- If VERDICT is PASS, all three sections should read "none" and effort is "0 min"

---

## Auto-fix mode

When the user asks to fix issues found in the audit, run:

```
node "$SCRIPT" --fix [--auto-only]
```

- `--auto-only` → only runs Tier 1 mechanical fixers (lint:fix, format write) and re-verifies
- Without `--auto-only` → same + emits a repair plan note for LLM-assisted fixes

Returns: `{ fixed, partiallyFixed, stillFailing, verifyResults, fixResults }`.

After running `--fix`, re-run `--run-all` to confirm the overall status improved.

**Fixability tiers:**

- **Tier 1 (auto, high confidence):** ESLint fixable rules, Prettier formatting, cargo fmt, gofmt
- **Tier 2 (LLM-assisted, verify after):** Missing error handling, simple type fixes, dead code removal
- **Never auto-fix (human judgment required):** Auth logic gaps, race conditions, API contract decisions, missing test intent

---

## Restrictions

- **NEVER suggest or execute `git commit` or `git push`**
- Automated checks are read-only unless `--fix` is explicitly requested
- If status.json exists at `.flow-skills/work/status.json`, it is updated automatically by `--report` — no manual merge needed
