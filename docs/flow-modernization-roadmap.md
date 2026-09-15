# Flow Modernization Roadmap

This is the canonical Git-backed, cross-session implementation plan for Flow modernization. A fresh session implements **one stable task** from this file; it does not reconstruct intent from chat or memory.

## Operating rule and precedence

When sources disagree, use this order:

1. This Git-tracked roadmap.
2. Current repository state.
3. Persistent memory.
4. Conversation context.

A task is not authorized merely because it appeared in conversation or memory. Amend this roadmap before changing task scope, assurance, ordering, or strategy.

## New-session quick path

1. Start from a clean, updated `main` and create an isolated task branch.
2. Read this entire roadmap and inspect the current repository state.
3. Confirm that every listed dependency is complete on current `main`.
4. Select exactly one pending task; do not bundle its successor.
5. Use strict TDD and obtain independent verification. A capability skip is recorded as a skip, never as a passing result.
6. Do not commit or open a PR unless the user explicitly requests it.

Copy/paste prompt:

```text
Read docs/flow-modernization-roadmap.md in full. On a clean, updated main, verify
that <TASK_ID> dependencies are complete, then implement only <TASK_ID> with strict
TDD and independent verification. Preserve the roadmap's non-negotiables and review
boundary. Do not commit or create a PR unless I explicitly request it. Update this
roadmap's completion record only after merge evidence exists.
```

## Non-negotiables

- Pi is the primary host; OpenCode remains supported through host-specific adapters.
- Git is the source of truth; the portable core remains host-neutral.
- Approvals are host-native, explicit, and never synthesized by the core.
- Flow must not introduce Gentle schemas, receipts, lineages, phases, commands, or delivery authority.
- Never perform live install, deploy, reconcile, or release work without explicit authorization.
- Use strict TDD: record RED, GREEN, relevant alternate/negative coverage, and focused validation.
- An independent verifier reviews the task's acceptance and evidence.
- Keep each task at **<=400 additions plus deletions**, or record an explicit `size:exception` before review.
- One writer at a time; exploration and verification can be independent read-only work.
- Missing capability, unavailable host tooling, or skipped validation is not a pass.

## Status legend

| Status | Meaning |
| --- | --- |
| `integrated/current-main` | Observed in the clean local `main` history when this roadmap was created; this satisfies downstream dependencies unless later repository evidence contradicts it. |
| `pending` | Not started; only its stated scope is available after dependencies complete. |
| `in progress` | A single writer owns a branch; no successor may begin. |
| `blocked` | A dependency, approval, or roadmap decision prevents safe progress. |
| `verified awaiting merge` | Independent evidence exists; completion waits for merge evidence. |
| `complete` | Merge evidence was recorded in this roadmap. |

## Completed history

The following integration evidence is limited to the clean local `main` history observed while creating this roadmap. It does not assert remote PR state beyond that evidence.

| Task | PR | Status | Outcome |
| --- | --- | --- | --- |
| T0 | [#31](https://github.com/victorvelazquez/flow-skills/pull/31) | `integrated/current-main` | Retired auto-deliver guidance and refreshed generated assets. |
| T1 | [#32](https://github.com/victorvelazquez/flow-skills/pull/32) | `integrated/current-main` | Defined portable host-adapter boundaries. |
| T2.1 | [#33](https://github.com/victorvelazquez/flow-skills/pull/33) | `integrated/current-main` | Added deterministic Flow Debt draft contract. |
| T2.2 | [#34](https://github.com/victorvelazquez/flow-skills/pull/34) | `integrated/current-main` | Added deterministic backlog codec. |
| T2.3 | [#35](https://github.com/victorvelazquez/flow-skills/pull/35) | `integrated/current-main` | Packaged portable Flow Debt core modules. |
| T2.4a | [#36](https://github.com/victorvelazquez/flow-skills/pull/36) | `integrated/current-main` | Made deferred findings preview-only. |
| T2.4b | [#37](https://github.com/victorvelazquez/flow-skills/pull/37) | `integrated/current-main` | Packaged the safe store reader. |
| T2.4c.1 | [#38](https://github.com/victorvelazquez/flow-skills/pull/38) | `integrated/current-main` | Exposed read-only debt CLI operations. |
| T2.4c.2 | [#39](https://github.com/victorvelazquez/flow-skills/pull/39) | `integrated/current-main` | Added debt creation preview candidates. |
| T2.4d | [#40](https://github.com/victorvelazquez/flow-skills/pull/40) | `integrated/current-main` | Published Flow Debt runtime across supported hosts. |
| T2.5a | [#41](https://github.com/victorvelazquez/flow-skills/pull/41) | `integrated/current-main` | Added pure pending/done/archived lifecycle helpers and refreshed locks. |

## Current Flow Debt state

Published public behavior is read-only: `list`, `show`, and `create-preview`. The core contains pure pending/done/archived helpers. There are no public mutations and no code authority. This state is intentional; do not infer an execute capability from lifecycle helpers.

## Dependency order

```text
T2.5b -> T2.5c -> T2.5d -> T2.5e -> T2.6 -> T3 -> T4 -> T5 -> T6 -> T7
```

T3 and T4 may be reordered only through an explicit roadmap amendment with the reason, changed dependencies, and review impact.

## Pending task cards

### T2.5b — Atomic writer module only

- **Status:** `pending`
- **Dependencies:** T2.5a complete on current `main`.
- **Objective:** Provide a small, fail-closed Node writer primitive for later authorized mutations.
- **Scope:** Exclusive lock; controlled residue handling; same-directory atomic replacement; postcondition verification; focused module tests.
- **Non-goals:** No CLI, public mutation, preparation handle, approval, adapter wiring, or execution path. Do not promise total TOCTOU or power-loss safety.
- **Acceptance:** Node is explicitly selected; lock contention fails closed; only controlled residues are handled; replacement occurs in the target directory; a failed postcondition is reported as failure; documented limits exclude a total TOCTOU/power-loss guarantee.
- **Verification:** Strict-TDD tests for contention, residues, same-directory replacement, and postcondition failure; independent verifier repeats the focused suite and checks the stated limits.
- **Review boundary:** Writer primitive and its tests/docs only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T2.5c, only after merge evidence updates this card.

### T2.5c — Preparation only

- **Status:** `pending`
- **Dependencies:** T2.5b complete on current `main`.
- **Objective:** Create `create`, `done`, and `archive` preparation paths that return a self-contained integrity handle.
- **Scope:** Bind every handle to repository identity, backlog identity, and input; enforce a 10-minute TTL; test deterministic valid, stale, and mismatched bindings.
- **Non-goals:** No write, execute, approval, public mutation, or code authority.
- **Acceptance:** Each supported transition prepares without changing repository/backlog state; the handle is self-contained and integrity-protected; repository/backlog/input mismatch and expiry reject deterministically.
- **Verification:** Strict-TDD tests for all three prepared transitions, binding mismatch, tamper/integrity failure, and TTL expiry; independent verifier confirms the operation is side-effect-free.
- **Review boundary:** Preparation contract/core and tests only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T2.5d, only after merge evidence updates this card.

### T2.5d — Public execute/recovery with host-native approval

- **Status:** `pending` (likely `size:exception`)
- **Dependencies:** T2.5c complete on current `main`.
- **Objective:** Add public execution and recovery around prepared transitions, gated by explicit host-native approval.
- **Scope:** Execute/recovery routes; stale and replay transitions; Pi/OpenCode adapters; adapter registry and manifests; locks; focused integration tests.
- **Non-goals:** The core must never become code authority. No Gentle schema, receipt, lineage, phase, command, or delivery authority; no release/deploy/install/reconcile without authorization.
- **Acceptance:** Execution accepts only a current, bound preparation; stale and replay attempts have explicit safe transitions; approval is requested and represented by the host adapter, not portable core; recovery is bounded and observable; adapter registration/manifests are packaged consistently.
- **Verification:** Strict-TDD unit and adapter tests for approve/decline, stale/replay, lock contention, successful execute, and recovery; independent verifier exercises packaged adapters and reports unavailable host capability as a skip.
- **Review boundary:** Execution/recovery plus required adapters, registry, manifests, locks, and tests. This is likely over 400 changed lines; declare an explicit `size:exception` before review or split only at a coherent independently safe boundary.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T2.5e, only after merge evidence updates this card.

### T2.5e — Independent mutation verification

- **Status:** `pending`
- **Dependencies:** T2.5d complete on current `main`.
- **Objective:** Independently verify mutation safety and packaging/deployment evidence without granting authority.
- **Scope:** Read-only verification/reporting for concurrency, stale handles, residues, recovery, rollback, postcondition, packaged state, deployed state, and absence of code authority.
- **Non-goals:** No remediation, mutation, approval, install, deployment, reconciliation, release, or code authority. Remediation requires separately authorized work.
- **Acceptance:** The verifier produces evidence for each required category, distinguishes pass/fail/skip, and never mutates state; packaged and deployed checks do not claim success when capability is absent.
- **Verification:** Strict-TDD tests for report classification and non-mutation; independent verifier runs the full matrix against an isolated fixture and records exact skips.
- **Review boundary:** Verifier/reporting and fixtures/tests only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T2.6, only after merge evidence updates this card.

### T2.6 — Flow Debt closure

- **Status:** `pending`
- **Dependencies:** T2.5e complete on current `main`.
- **Objective:** Close Flow Debt modernization with an audit/refactor and complete neutral guidance.
- **Scope:** Audit/refactor; exact manual neutral drafts; migration and legacy guidance; documentation; complete provenance and package checks.
- **Non-goals:** No Gentle coupling, no delivery authority, and no live install/deploy/reconcile/release without authorization.
- **Acceptance:** Legacy guidance is identified or removed deliberately; manual drafts are exact and neutral; migration guidance is actionable; provenance/package checks are complete and independently reviewable.
- **Verification:** Strict-TDD where behavior changes; documentation/provenance/package checks with exact evidence; independent reviewer confirms no Gentle coupling and no hidden authority.
- **Review boundary:** Closure audit, refactor, guidance, docs, and package/provenance evidence only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T3, only after merge evidence updates this card.

### T3 — `flow-playbook-compare`

- **Status:** `pending`
- **Dependencies:** T2.6 complete on current `main`.
- **Objective:** Provide a read-only playbook replacement/comparison workflow.
- **Scope:** Resolve configuration in this decided order: CLI > `.flow/playbook.json` > `FLOW_PLAYBOOK_PATH`; compare and render neutral results.
- **Non-goals:** No automatic `flow-pr`, apply, external delivery, approval, or mutation.
- **Acceptance:** Precedence is tested and documented; output remains read-only and clearly identifies replacement candidates; missing configuration fails or reports neutrally without falling through to side effects.
- **Verification:** Strict-TDD precedence and read-only tests; independent verifier checks all three sources and confirms no `flow-pr`/apply invocation.
- **Review boundary:** Compare command/core/config tests and docs only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T4, only after merge evidence updates this card.

### T4 — `flow-contract-request`

- **Status:** `pending`
- **Dependencies:** T3 complete on current `main`; reordering requires a roadmap amendment.
- **Objective:** Request configured contract targets through explicit preview and execution paths.
- **Scope:** Configurable `.flow/contract-targets.json`; preview; execute; explicit cross-repository approval; local outbox fallback.
- **Non-goals:** No SDD or Gentle coupling, no synthesized approval, no delivery authority, and no cross-repository action without explicit approval.
- **Acceptance:** Targets are validated from configuration; preview has no side effects; execution requires explicit approval for each cross-repository action; unavailable remote delivery uses a transparent local outbox fallback.
- **Verification:** Strict-TDD target/config, preview, approval decline/grant, cross-repository, and outbox tests; independent verifier validates no cross-repository mutation without approval.
- **Review boundary:** Contract-request workflow, config, adapter boundary, tests, and docs only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T5, only after merge evidence updates this card.

### T5 — Simplify `flow-refactor`

- **Status:** `pending`
- **Dependencies:** T4 complete on current `main`.
- **Objective:** Reduce `flow-refactor` to read-only smell detection and neutral drafts.
- **Scope:** Read-only smell analysis and exact neutral draft generation.
- **Non-goals:** No external review authority, delivery authority, mutation, approval synthesis, or automatic apply.
- **Acceptance:** Findings are advisory and reproducible; drafts are neutral and do not invoke external review/delivery behavior; all paths remain read-only.
- **Verification:** Strict-TDD fixture tests for smells and drafts; independent verifier checks command behavior is non-mutating and free of external authority claims.
- **Review boundary:** `flow-refactor` analysis/drafts, tests, and docs only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T6, only after merge evidence updates this card.

### T6 — Decouple `flow-audit`

- **Status:** `pending`
- **Dependencies:** T5 complete on current `main`.
- **Objective:** Make `flow-audit` advisory evidence only and isolate any fix mutation.
- **Scope:** Read-only advisory evidence; an explicitly isolated, separately authorized fix-mutation boundary; optional non-authoritative cache.
- **Non-goals:** No native-review claims, delivery claims, implicit fix mutation, authoritative cache, or Gentle coupling.
- **Acceptance:** Audit output distinguishes evidence from recommendations; fixes cannot run through audit implicitly; cache is optional and never authoritative; no native-review/delivery authority is claimed.
- **Verification:** Strict-TDD evidence, cache, and isolation tests; independent verifier confirms audit remains read-only and a fix requires separate authorization.
- **Review boundary:** Audit evidence/cache and isolated fix boundary/tests/docs only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** T7, only after merge evidence updates this card.

### T7 — Portfolio integration

- **Status:** `pending`
- **Dependencies:** T6 complete on current `main`.
- **Objective:** Integrate the modernized portfolio as a package with reproducible provenance.
- **Scope:** Registry, resources, adapters, package, docs, migration, locks, full tests, provenance, `npm pack`, and independent review.
- **Non-goals:** Release is separately authorized; no publish/release/deploy/install/reconcile by default; no Gentle delivery authority.
- **Acceptance:** Registry/resources/adapters are coherent; package and migration docs are complete; locks and provenance are reproducible; `npm pack` evidence is captured; independent review covers the integrated portfolio.
- **Verification:** Strict-TDD for behavior changes; full focused portfolio suite; provenance/package checks and `npm pack`; independent review. Any unavailable deployment check is an explicit skip, not pass.
- **Review boundary:** Integration artifacts listed above; plan a coherent slice or explicit `size:exception` before review.
- **Completion:** `status: pending`; branch: —; commit: —; PR: —; verification: —.
- **Next allowed task:** None; choose follow-up only through a roadmap amendment.

## Drift control

Before work, read this roadmap in full and verify current `main` plus dependencies. Stop on any conflict among the roadmap, repository state, task card, or requested work; do not resolve it through chat assumptions. Update a completion record only after merge evidence exists. Any scope, assurance, dependency, ordering, or strategy change requires an explicit roadmap amendment before implementation.

## Session-close checklist

- [ ] Only one task was worked.
- [ ] The task card's acceptance, non-goals, and review boundary were checked.
- [ ] Strict-TDD and focused validation evidence are recorded, with skips labeled as skips.
- [ ] Independent verification is recorded or explicitly pending.
- [ ] No commit/PR was made unless the user requested it.
- [ ] Completion was not marked without merge evidence.
- [ ] The next allowed task is named without starting it.

## Handoff template

```text
Task: <TASK_ID>
Branch: <branch or none>
Commit: <commit or none>
PR: <PR URL/number or none>
Status: <pending | in progress | verified awaiting merge | complete | blocked>
Tests: <exact commands and results>
Skips: <capability/tooling skips; never call these passes>
Independent verification: <reviewer and result, or pending>
Next allowed task: <TASK_ID or none>
Roadmap update: <none | exact completion/amendment made with evidence>
```
