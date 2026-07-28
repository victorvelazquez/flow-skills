# Apply Progress: Simplify `/flow-commit`

## Status

Standard mode. All 13 tasks are complete under the maintainer-approved single-PR `size:exception`.

## Completed Tasks

- [x] 1.1–1.4 Git executor RED contracts and safety cases
- [x] 2.1–2.3 Git-only inspect/execute runtime and refactor
- [x] 3.1–3.3 Consumer contract migration and publication-policy pruning
- [x] 4.1–4.3 Dead-code cleanup, asset reconciliation, and final verification

## Work Unit Evidence

| Work unit | Focused test command and exact result | Runtime harness | Rollback boundary |
|---|---|---|---|
| Git executor and tests | `node --test tests/flow-commit.test.mjs`: 11 passed, 0 failed | Temporary repositories exercise inspect → explicit request → ordered commits, hook rollback, and concurrent HEAD preservation | `scripts/flow-commit.mjs`, `tests/flow-commit.test.mjs` |
| Consumer/publication alignment | `node --test tests/flow-agent-contract.test.mjs tests/review-delivery-policy.test.mjs`: 7 passed, 0 failed | Agent/command/skill contract assertions plus temporary publication-policy repository | `skills/flow-commit/`, `agents/flow-git-agent.md`, `commands/flow-commit.md`, `commands/flow-auto-deliver.md`, `scripts/lib/review-delivery-policy.mjs` and paired tests |
| Dead code and assets | `node --test tests/flow-assets-manifest.test.mjs tests/flow-assets-restore.test.mjs`: 24 passed, 0 failed, 1 Windows mode skip | N/A — manifest/lock reconciliation has no runtime boundary; manifest test proves exact managed records | Deleted harness/work-unit/reference files and their `flow-assets.json`, `.gitattributes`, and lock records |

## Final Verification

- `node --test tests/*.test.mjs`: 200 passed, 0 failed, 1 skipped; 201 total tests; 629.664s.
- Unrelated dirty-file SHA-256 values were unchanged before and after apply.
- `/flow-pr` publication export tests passed.

## Delivery Boundary

- Mode: single PR, maintainer-approved `size:exception`.
- Scope: Git-only `/flow-commit` replacement, its consumers/tests/assets, and commit-only policy cleanup.
- The exception remains deletion-heavy; no branch, commit, push, PR, build, install, or lifecycle operation was performed.

## Exact Implementation Path Inventory

### Changed

- `.gitattributes`
- `agents/flow-git-agent.md`
- `commands/flow-auto-deliver.md`
- `commands/flow-commit.md`
- `flow-assets.json`
- `flow-assets.lock.json` — targeted manifest digest, totals, and affected managed-asset records only
- `scripts/flow-commit.mjs`
- `scripts/lib/review-delivery-policy.mjs`
- `skills/flow-commit/SKILL.md`
- `tests/flow-agent-contract.test.mjs`
- `tests/flow-assets-manifest.test.mjs`
- `tests/flow-commit.test.mjs`
- `tests/review-delivery-policy.test.mjs`

### Deleted

- `scripts/lib/flow-work-units.mjs`
- `skills/flow-commit/references/review-delivery.md`
- `tests/flow-commit-harness.mjs`
- `tests/flow-work-units.test.mjs`

### SDD Artifacts Updated

- `openspec/changes/simplify-flow-commit/tasks.md`
- `openspec/changes/simplify-flow-commit/apply-progress.md`

## Pre-existing Dirty Content Preservation

The following unrelated dirty paths were preserved byte-for-byte:

- `commands/flow-skills-sync.md`
- `skills/flow-skills-sync/SKILL.md`
- `tests/flow-skills-sync.test.mjs`
- `tests/install.test.mjs`

`flow-assets.lock.json` was already dirty. Reconciliation changed only its manifest digest, aggregate totals, and records for the exact Flow Commit assets changed or deleted above. Its pre-existing capture metadata and unrelated records — including the existing Flow Skills Sync asset records — were retained; no wholesale restoration or lock regeneration was performed.

## Verify Remediation Continuation

All four blockers from `verify-report` were fixed without reopening the design:

1. `scripts/flow-commit.mjs` now binds the active symbolic branch and revalidates it before staging, before commit hooks, and after commit hooks. `tests/flow-commit.test.mjs` covers a same-HEAD post-commit branch switch and proves the first unit is retained while the later unit is not executed.
2. `scripts/flow-commit.mjs` now compares raw commit-object message bytes using a spec-compatible terminal-newline canonical form instead of trimming. `tests/flow-commit.test.mjs` covers leading whitespace, trailing whitespace, trailing newline, and leading/trailing newline bodies.
3. `scripts/flow-commit.mjs` routes CLI parse, request-read, usage, and execution failures through a complete `flow-commit/result-v1` document. `tests/flow-commit.test.mjs` asserts every required result field for malformed JSON and invalid argument/usage failures.
4. `tests/flow-assets-manifest.test.mjs` now captures unrelated fixture-file preimages and their lock records before a targeted reconciliation, then proves exact post-operation equality. The fixture does not mutate the user's unrelated dirty files.

### Remediation Path Inventory

Changed during this remediation:

- `scripts/flow-commit.mjs`
- `tests/flow-commit.test.mjs`
- `tests/flow-assets-manifest.test.mjs`
- `flow-assets.lock.json` — only the existing managed `scripts/flow-commit.mjs` record and aggregate byte total were reconciled for the runtime change

### Remediation Test Evidence

- `node --test tests/flow-commit.test.mjs tests/flow-assets-manifest.test.mjs tests/flow-assets-restore.test.mjs`: **47 passed, 0 failed, 1 skipped (48 total)**.
- A remediation full-suite attempt, `node --test tests/*.test.mjs`, was **user-aborted at subtest 69**. No failure was observed before cancellation, but it is **not completion evidence** and no remediation full-suite pass is claimed.
- By explicit maintainer testing policy, the full suite is deferred to the single final `sdd-verify` run to avoid redundant 10–11 minute executions.

## Result Contract

| Field | Value |
|---|---|
| `status` | `success` |
| `executive_summary` | All four verify blockers were remediated with focused evidence; final full-suite verification is deferred to `sdd-verify`. |
| `artifacts` | OpenSpec tasks/progress and Engram tasks/progress are persisted. |
| `next_recommended` | `sdd-verify` |
| `risks` | Maintainer-approved, deletion-heavy single-PR `size:exception`; remediation full-suite completion is intentionally deferred to final `sdd-verify`. |
| `skill_resolution` | `paths-injected` |
