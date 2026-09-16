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
3. Confirm that every listed dependency has merge evidence on current `main`.
4. If the predecessor card still says `verified awaiting merge`, reconcile it to `complete` in the new task branch using that merge evidence.
5. Select exactly one pending task; predecessor reconciliation is metadata, not bundled implementation work.
6. Use strict TDD and obtain independent verification. A capability skip is recorded as a skip, never as a passing result.
7. Do not commit or open a PR unless the user explicitly requests it.

Copy/paste prompt:

```text
Read docs/flow-modernization-roadmap.md in full. On a clean, updated main, verify
merge evidence for <TASK_ID>'s dependencies and reconcile any predecessor still marked
verified awaiting merge. Then implement only <TASK_ID> with strict TDD and independent
verification. Preserve the roadmap's non-negotiables and review boundary. Do not
commit or create a PR unless I explicitly request it.
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
| `complete` | Merge evidence from current `main` was recorded in this roadmap, either immediately or through successor-branch reconciliation. |

## Rolling merge reconciliation

Use one implementation PR per task. A verified task remains `verified awaiting merge` in its own PR because that PR cannot truthfully contain evidence of its future merge.

After that PR merges:

1. Update local `main` and verify the predecessor's merge evidence there.
2. Create the successor's isolated branch.
3. In that branch, update the predecessor card to `complete` with its commit/PR/merge evidence.
4. Implement and verify only the successor, leaving it `verified awaiting merge`.
5. Include both the predecessor metadata reconciliation and the successor work in the successor's single PR.

The successor is authorized by observed merge evidence on clean, updated `main`; it does not require a separate roadmap-only commit or PR. A stale predecessor card may be reconciled only when repository evidence is unambiguous. Missing or contradictory evidence is `BLOCKED`.

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
| T2.5b | [#43](https://github.com/victorvelazquez/flow-skills/pull/43) | `complete` | Added the atomic writer module; merge commit `11a1fc0` is on current `main`. |
| T2.5c | [#44](https://github.com/victorvelazquez/flow-skills/pull/44) | `complete` | Added self-contained preparation handles; merge commit `1045a5a` from `feat/flow-debt-preparation-ttl` is on current `main`. |
| T2.5d | [#45](https://github.com/victorvelazquez/flow-skills/pull/45) | `complete` | Added host-approved execution and recovery; merge commit `a8083eb` is on current `main`. |

## Current Flow Debt state

Published public behavior includes read-only `list`, `show`, and `create-preview`, plus host-approved `execute` and `recover` mutations completed by T2.5d. The portable core does not hold code authority: it cannot synthesize approval or authorize its own mutations. Host adapters own explicit approval, and execution accepts only a current, bound preparation after that approval. Do not infer authority from lifecycle helpers or from the existence of executable mutation paths.

## Dependency order

```text
T2.5b -> T2.5c -> T2.5d -> T2.5e -> T2.6 -> T3 -> T4 -> T5 -> T6 -> T7
```

T3 and T4 may be reordered only through an explicit roadmap amendment with the reason, changed dependencies, and review impact.

## Pending task cards

### T2.5b — Atomic writer module only

- **Status:** `complete`
- **Dependencies:** T2.5a complete on current `main`.
- **Objective:** Provide a small, fail-closed Node writer primitive for later authorized mutations.
- **Scope:** Exclusive lock; controlled residue handling; same-directory atomic replacement; postcondition verification; focused module tests.
- **Non-goals:** No CLI, public mutation, preparation handle, approval, adapter wiring, or execution path. Do not promise total TOCTOU or power-loss safety.
- **Acceptance:** Node is explicitly selected; lock contention fails closed; only controlled residues are handled; replacement occurs in the target directory; a failed postcondition is reported as failure; documented limits exclude a total TOCTOU/power-loss guarantee.
- **Verification:** Strict-TDD tests for contention, residues, same-directory replacement, and postcondition failure; independent verifier repeats the focused suite and checks the stated limits.
- **Review boundary:** Writer primitive and its tests/docs only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: complete`; branch: `feat/flow-debt-atomic-writer`; commit: `11a1fc0`; PR: [#43](https://github.com/victorvelazquez/flow-skills/pull/43); verification: merge commit observed on current `main`.
- **Next allowed task:** T2.5c.

### T2.5c — Preparation only

- **Status:** `complete`
- **Dependencies:** T2.5b complete on current `main`.
- **Objective:** Create `create`, `done`, and `archive` preparation paths that return a self-contained integrity handle.
- **Scope:** Bind every handle to repository identity, backlog identity, and input; enforce a 10-minute TTL; test deterministic valid, stale, and mismatched bindings.
- **Non-goals:** No write, execute, approval, public mutation, or code authority.
- **Acceptance:** Each supported transition prepares without changing repository/backlog state; the handle is self-contained and integrity-protected; repository/backlog/input mismatch and expiry reject deterministically.
- **Verification:** Strict-TDD tests for all three prepared transitions, binding mismatch, tamper/integrity failure, and TTL expiry; independent verifier confirms the operation is side-effect-free.
- **Review boundary:** Preparation contract/core and tests only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: complete`; branch: `feat/flow-debt-preparation-ttl`; commit: `1045a5a`; PR: [#44](https://github.com/victorvelazquez/flow-skills/pull/44); verification: merge commit observed on current `main`.
- **Next allowed task:** T2.5d.

### T2.5d — Public execute/recovery with host-native approval

- **Status:** `complete` (`size:exception`: 1,009 additions + 163 deletions = 1,172 changed lines; declared before review. Correction validation passed.)
- **Dependencies:** T2.5c complete on current `main`.
- **Objective:** Add public execution and recovery around prepared transitions, gated by explicit host-native approval.
- **Scope:** Execute/recovery routes; stale and replay transitions; Pi/OpenCode adapters; adapter registry and manifests; locks; focused integration tests.
- **Non-goals:** The core must never become code authority. No Gentle schema, receipt, lineage, phase, command, or delivery authority; no release/deploy/install/reconcile without authorization.
- **Acceptance:** Execution accepts only a current, bound preparation; stale and replay attempts have explicit safe transitions; approval is requested and represented by the host adapter, not portable core; recovery is bounded and observable; adapter registration/manifests are packaged consistently.
- **Verification:** Strict-TDD unit and adapter tests for approve/decline, stale/replay, lock contention, successful execute, and recovery; independent verifier exercises packaged adapters and reports unavailable host capability as a skip.
- **Review boundary:** Execution/recovery plus required adapters, registry, manifests, locks, and tests. This is likely over 400 changed lines; declare an explicit `size:exception` before review or split only at a coherent independently safe boundary.
- **Completion:** `status: complete`; branch: `feat/flow-debt-host-native-execution`; commit: `a8083eb`; PR: [#45](https://github.com/victorvelazquez/flow-skills/pull/45); verification: corrected shared read/validate/compute/write lock and root asset/lock packaging; focused execution/CLI/adapter/package suite (55/55), full suite (334 passed; 7 Windows capability skips), Pi/OpenCode provenance verifies, `npm pack --dry-run`, and `git diff --check` passed; merge commit observed on current `main`.
- **Next allowed task:** T2.5e.

### T2.5e — Independent mutation verification

- **Status:** `complete`
- **Dependencies:** T2.5d complete on current `main`.
- **Objective:** Independently verify mutation safety and packaging/deployment evidence without granting authority.
- **Scope:** Internal read-only verification/reporting for concurrency, stale handles, residues, recovery, rollback, postcondition, packaged state, deployed state, and absence of self-authorizing code authority in the portable core.
- **Non-goals:** No public verifier interface; no remediation, mutation, approval, manifest/lock publication, install, deployment, reconciliation, release, or code authority. Remediation requires separately authorized work.
- **Acceptance:** The internal verifier produces evidence for each required category, distinguishes pass/fail/skip, and never mutates state; it confirms that approval remains host-owned and the portable core cannot self-authorize; packaged and deployed checks do not claim success when capability is absent.
- **Verification:** Strict-TDD tests for report classification and non-mutation; independent verifier runs the full matrix against an isolated fixture and records exact skips.
- **Review boundary:** Verifier/reporting and fixtures/tests only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: complete`; branch: `feat/flow-debt-independent-verification`; commit: `f35dc41`; PR: [#47](https://github.com/victorvelazquez/flow-skills/pull/47); verification: merge commit `f35dc41` observed as an ancestor of updated `main` (`72b142c`).
- **Next allowed task:** T2.6.

### T2.6 — Flow Debt closure

- **Status:** `complete`
- **Dependencies:** T2.5e complete on current `main`.
- **Objective:** Close Flow Debt modernization with an audit/refactor and complete neutral guidance.
- **Scope:** Audit/refactor; exact manual neutral drafts; migration and legacy guidance; documentation; complete provenance and package checks.
- **Non-goals:** No Gentle coupling, no delivery authority, and no live install/deploy/reconcile/release without authorization.
- **Acceptance:** Legacy guidance is identified or removed deliberately; manual drafts are exact and neutral; migration guidance is actionable; provenance/package checks are complete and independently reviewable.
- **Verification:** Strict-TDD where behavior changes; documentation/provenance/package checks with exact evidence; independent reviewer confirms no Gentle coupling and no hidden authority.
- **Review boundary:** Closure audit, refactor, guidance, docs, and package/provenance evidence only; <=400 changed lines or explicit `size:exception`.
- **Completion:** `status: complete`; branch: `feat/flow-debt-closure`; commit: `2409e3f`; PR: [#49](https://github.com/victorvelazquez/flow-skills/pull/49); verification: merge commit `2409e3f` observed on updated `main`.
- **Next allowed task:** T3.

### T3 — `flow-playbook-compare`

- **Status:** `complete`
- **Dependencies:** T2.6 complete on current `main`.
- **Objective:** Publish `flow-playbook-compare` as a new read-only playbook replacement/comparison workflow while retaining `flow-playbook-sync`.
- **Scope:** Resolve the configured playbook path in this decided order: CLI `--playbook-path` > `.flow/playbook.json` schema `{ "playbookPath": "<path>" }` > `FLOW_PLAYBOOK_PATH`. A higher-priority invalid value fails closed with no fallback. Compare and render a deterministic JSON report with stable, sorted, neutral advisory replacement candidates.
- **Non-goals:** No `flow-pr`, apply, delivery, approval, external action, or mutation.
- **Acceptance:** Precedence and fail-closed invalid configuration are tested and documented; output is read-only and identifies neutral replacement candidates deterministically; missing configuration returns neutral `unavailable` with zero candidates and no side effects.
- **Verification:** Strict-TDD precedence, invalid-source, deterministic ordering, unavailable, and read-only tests; independent verifier checks all three sources and confirms no `flow-pr`/apply invocation.
- **Review boundary:** Compare command/core/config tests and docs only; `size:exception`: 405 additions + 35 deletions = 440 changed lines, authorized because required generated root asset and v2 provenance locks publish the workflow.
- **Completion:** `status: complete`; branch: `feat/flow-playbook-compare`; commit: `4b35dcf`; PR: [#50](https://github.com/victorvelazquez/flow-skills/pull/50); verification: focused 13/13; full 342 passed, 0 failed, 7 Windows capability skips; Pi/OpenCode provenance generation `da5e7b4a38ac8a147d76e0f873e491ccdaeb0a8c6884fb0ee4c4d824680a6425`; `npm pack --dry-run` and `git diff --check` passed; independent verifier PASS; authorized 405 additions + 35 deletions = 440 changed-line size exception due required generated locks. Merge reconciliation: updated `main` contains T3 commit `4b35dcf` through merge commit `f8dc497`.
- **Next allowed task:** T4.

### T4 — `flow-contract-request`

- **Status:** `complete`
- **Dependencies:** T3 complete on current `main`; reconciled from merge commit `f8dc497` containing T3 commit `4b35dcf`.
- **Objective:** Modernize the existing `flow-request` workflow in place with explicit single-target preview and execution.
- **Authorized contract:** `.flow/contract-targets.json` is exactly `{ "schema": "flow-contract-targets/v1", "targets": { "<target-key>": { "path": "<local repository path>" } } }` with no unknown top-level properties; UNC and normalized `//` network paths are invalid. `preview --target <target-key> --request-json <JSON object>` validates exactly one configured local target and returns a deterministic candidate without writing. `execute` accepts the same one-target input and writes one immutable JSON record to `<target>/.flow/inbox/contract-request-<sha256>.json`; if that local repository is unavailable, it writes the same immutable record to requester-local `.flow/outbox/contract-request-<sha256>.json`. The runtime makes no network request. Every cross-repository `execute` requires the host adapter's native approval before it can invoke the approved runtime form; the portable runtime never creates approval.
- **Scope:** Existing `flow-request` contract/runtime; configurable local-repository targets; single-target preview/execute; host-native cross-repository approval; requester-local immutable JSON outbox fallback.
- **Non-goals:** No SDD or Gentle coupling, no synthesized approval, no delivery authority, no network transport, no multi-target invocation, and no cross-repository action without explicit approval.
- **Acceptance:** Configuration and local targets are validated; preview has no side effects; each cross-repository execution is host-approved; a locally unavailable target produces a transparent immutable requester-local outbox fallback.
- **Verification:** Strict-TDD target/config, preview, approval decline/grant, cross-repository, and outbox tests; independent verifier validates no cross-repository mutation without approval.
- **Review boundary:** Contract-request workflow, config, adapter boundary, tests, and docs only; `size:exception`: 713 additions + 308 deletions = 1,021 changed lines, explicitly authorized because replacing the 243-line legacy contract and publishing its runtime, host adapter, package metadata, and required root/v2 provenance locks form one inseparable safe workflow.
- **Completion:** `status: complete`; branch: `feat/flow-contract-request`; commit: `c594e65`; PR: [#51](https://github.com/victorvelazquez/flow-skills/pull/51); verification: merge commit `16fa079` observed on updated `main` contains T4 commit `c594e65`; strict-TDD RED observed; focused 59/59 with 1 Windows capability skip; full 348 passed, 0 failed, 7 Windows capability skips; Pi/OpenCode provenance generation `184b996342357e92995941dab2a0b3915be02b560fc19e706711f56e9110e6ec`; `npm pack --dry-run` and `git diff --check` passed; independent verifier PASS; authorized 713 additions + 308 deletions = 1,021 changed-line size exception.
- **Next allowed task:** T5.

### T5 — Simplify `flow-refactor`

- **Status:** `verified awaiting merge`
- **Dependencies:** T4 complete on current `main`.
- **Objective:** Reduce `flow-refactor` to read-only smell detection and neutral drafts.
- **Scope:** Read-only smell analysis and exact neutral draft generation.
- **Non-goals:** No external review authority, delivery authority, mutation, approval synthesis, or automatic apply.
- **Acceptance:** Findings are advisory and reproducible; drafts are neutral and do not invoke external review/delivery behavior; all paths remain read-only.
- **Verification:** Strict-TDD fixture tests for smells and drafts; independent verifier checks command behavior is non-mutating and free of external authority claims.
- **Review boundary:** `flow-refactor` analysis/drafts, tests, and docs only; `size:exception`: 298 additions + 367 deletions = 665 changed lines. This exact review-surface total excludes `odd/tasks/flow-refactor-readonly.md` because the ODD tracker is operational metadata, not deliverable review content. Replacing the oversized heuristic LLM rubric with a bounded deterministic runtime, exact fixture coverage, relay-only host guidance, and their required generated asset/provenance locks is one inseparable safe workflow.
- **Completion:** `status: verified awaiting merge`; branch: `feat/flow-refactor-readonly`; commit: none; PR: none; verification: strict-TDD RED observed; focused `flow-refactor` (3/3), flow-agent-contract (23/23), and OpenCode adapter (12/12) passed; full verification passed with 7 Windows capability skips; root/Pi/OpenCode provenance verification passed (generation `1eada80304a45cfc173c784a9ccbcdb19447546ba2c36209ba7129dae7bed55e`); `npm pack --dry-run` and `git diff --check` passed; independent verifier PASS; authorized 298 additions + 367 deletions = 665 changed-line size exception.
- **Next allowed task:** T6, only after T5 merge evidence is observed on updated `main`; reconcile this card in the T6 branch.

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
- **Next allowed task:** T7, only after T6 merge evidence is observed on updated `main`; reconcile this card in the T7 branch.

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

Before work, read this roadmap in full and verify current `main` plus dependencies. Stop on any conflict among the roadmap, repository state, task card, or requested work; do not resolve it through chat assumptions. Mark a task `complete` only from merge evidence observed on updated `main`; when using rolling reconciliation, record that evidence in the successor branch before implementing the successor. Any scope, assurance, dependency, ordering, or strategy change requires an explicit roadmap amendment before implementation.

## Session-close checklist

- [ ] Only one task was worked.
- [ ] The task card's acceptance, non-goals, and review boundary were checked.
- [ ] Strict-TDD and focused validation evidence are recorded, with skips labeled as skips.
- [ ] Independent verification is recorded or explicitly pending.
- [ ] No commit/PR was made unless the user requested it.
- [ ] Completion was not marked without merge evidence from updated `main`.
- [ ] Any predecessor reconciliation records exact merge evidence in the current task branch.
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
