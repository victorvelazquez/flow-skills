# Apply Progress: Simplify `/flow-pr`

**Mode:** Standard
**Delivery:** Single PR, maintainer-approved `size:exception` (Engram `sdd/simplify-flow-pr/delivery` #6882)
**Completed:** 17/17 persisted task entries

## Completed Tasks

- [x] 1.1–1.5 Contracts, canonical identity, side-effect-free inspection, and hostile-input coverage.
- [x] 2.1–2.7 Preflight, ordinary push, PR reconciliation, postconditions, and partial recovery.
- [x] 3.1–3.5 Public workflow replacement, caller-proven deletion, asset reconciliation, and focused verification.

## Task-to-Evidence Mapping

| Task | Existing evidence |
|---|---|
| 1.1 | `node --test tests/flow-pr.test.mjs tests/flow-agent-contract.test.mjs tests/flow-commit.test.mjs` exited 0 with 21 passed; `tests/flow-pr.test.mjs` covers contract shape, extra properties, controls, and hostile refs. |
| 1.2 | The same 21-pass command covers `scripts/lib/flow-pr-contracts.mjs` canonical serialization and request validation. |
| 1.3 | The same 21-pass command covers canonical root and hostile ref rejection; the inspection module is the recorded implementation artifact. |
| 1.4 | The local bare-repository/fake-`gh` runtime harness in `tests/flow-pr.test.mjs` passed 4 tests; `scripts/lib/flow-pr-inspection.mjs` is the recorded argv-only implementation artifact. |
| 1.5 | The same 4-pass runtime harness covers an unpublished branch with nullable upstream and fake-`gh` PR facts. |
| 2.1 | The 21-pass focused command covers drift; `scripts/lib/flow-pr-executor.mjs` is the recorded preflight artifact. |
| 2.2 | The same 21-pass command covers the executor preflight contract and blocked/drift result paths. |
| 2.3 | The 4-pass local/bare-repository runtime harness covers normal publication state and idempotent rerun behavior. |
| 2.4 | The same 4-pass runtime harness verifies the normal push path and its resulting remote/upstream effects. |
| 2.5 | The 4-pass fake-`gh` harness covers create and noop reconciliation; `tests/flow-pr.test.mjs` is the focused artifact. |
| 2.6 | The same fake-`gh` harness exercises verified create/noop result paths; `scripts/lib/flow-pr-executor.mjs` records unknown-effect and postcondition handling. |
| 2.7 | The same runtime harness verifies a fresh-inspection idempotent rerun; apply-progress preserves the partial-recovery contract evidence. |
| 3.1 | `tests/flow-agent-contract.test.mjs` is included in the 21-pass command and proves inspect allowance, execute approval, mutation denial, and no delegation. |
| 3.2 | Current-source `rg` caller proof found no production caller of the deleted modules; the focused Flow Commit suite in the 21-pass command preserved `/flow-commit` behavior. |
| 3.3 | The agent-contract portion of the 21-pass command proves removal of retired `/flow-pr` surface language and permission boundaries. |
| 3.4 | `node --test tests/flow-assets-manifest.test.mjs` exited 0 with 12 passed and 1 Windows skip; `node --test tests/install.test.mjs` exited 0 with 19 passed. |
| 3.5 | The recorded focused commands passed: Flow PR/agent/Flow Commit 21/0, asset manifest 12/0 with 1 skip, installer 19/0. No full suite ran. |

## Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused Flow PR / agent / Flow Commit | `node --test tests/flow-pr.test.mjs tests/flow-agent-contract.test.mjs tests/flow-commit.test.mjs` — exit 0; 21 passed, 0 failed |
| Runtime harness | `tests/flow-pr.test.mjs` — local bare Git repositories plus a fake `gh` program; 4 passed, 0 failed; no network |
| Asset manifest | `node --test tests/flow-assets-manifest.test.mjs` — exit 0; 12 passed, 0 failed, 1 Windows executable-mode skip |
| Installer compatibility | `node --test tests/install.test.mjs` — exit 0; 19 passed, 0 failed |
| Rollback boundary | Revert the listed Flow PR implementation paths and asset metadata together. `/flow-commit` and `flow-auto-deliver` are outside this boundary. |

## Implementation Path Inventory

### Created

- `scripts/lib/flow-pr-contracts.mjs`
- `scripts/lib/flow-pr-executor.mjs`
- `scripts/lib/flow-pr-inspection.mjs`

### Changed

- `.gitattributes`
- `agents/flow-pr-agent.md`
- `commands/flow-pr.md`
- `flow-assets.json`
- `flow-assets.lock.json`
- `scripts/flow-pr.mjs`
- `skills/flow-pr/SKILL.md`
- `tests/flow-agent-contract.test.mjs`
- `tests/flow-assets-manifest.test.mjs`
- `tests/flow-pr.test.mjs`

### Deleted

- `scripts/lib/flow-branch-policy.mjs`
- `scripts/lib/flow-chain-plan.mjs`
- `scripts/lib/flow-check-evidence.mjs`
- `scripts/lib/flow-delivery-config.mjs`
- `scripts/lib/flow-pr-body.mjs`
- `scripts/lib/flow-pr-labels.mjs`
- `scripts/lib/flow-pr-prs.mjs`
- `scripts/lib/promotion-review-coordinator.mjs`
- `scripts/lib/review-causal-admission.mjs`
- `scripts/lib/review-delivery-policy.mjs`
- `skills/flow-pr/references/chain-plan.md`
- `skills/flow-pr/references/output-contract.md`
- `tests/flow-chain-plan.test.mjs`
- `tests/flow-delivery-modules.test.mjs`
- `tests/flow-pr-harness.mjs`
- `tests/promotion-review-coordinator.test.mjs`
- `tests/promotion-review-runtime.test.mjs`
- `tests/review-causal-admission.test.mjs`
- `tests/review-delivery-policy.test.mjs`

`commands/flow-commit.md`, `scripts/flow-commit.mjs`, and `commands/flow-auto-deliver.md` have no implementation diff.

### Separate SDD Artifact Paths

- `openspec/changes/simplify-flow-pr/proposal.md`
- `openspec/changes/simplify-flow-pr/design.md`
- `openspec/changes/simplify-flow-pr/tasks.md`
- `openspec/changes/simplify-flow-pr/apply-progress.md`
- Engram `sdd/simplify-flow-pr/proposal` (#6877)
- Engram `sdd/simplify-flow-pr/design` (#6879)
- Engram `sdd/simplify-flow-pr/tasks` (#6881)
- Engram `sdd/simplify-flow-pr/apply-progress` (#6883)

## Caller and Publication Evidence

- Current-source `rg` caller proof found no production caller for the deleted `/flow-pr` modules; matches outside `/flow-pr` were excluded unrelated Flow tools, historical OpenSpec artifacts, or explicit prohibition tests.
- `commands/flow-auto-deliver.md`, `commands/flow-commit.md`, and `scripts/flow-commit.mjs` were preserved; the focused Flow Commit suite passed.
- Branch remained `feat/guided-flow-skills-sync`; `git rev-parse --abbrev-ref '@{upstream}'` reported no upstream. No staging, commit, push, PR, fetch, live install/sync, or real GitHub mutation occurred. Installer tests used isolated temporary destinations only.

## Size and Changed Paths

- Current implementation diff: 421 additions / 7,966 deletions (8,387 changed lines) across 28 tracked changed/deleted paths plus three new runtime-library paths.
- The result is deletion-dominant and stays within the approved single-PR `size:exception` rationale.
- Asset manifest/lock contain 67 managed files and 548,845 bytes; retired `/flow-pr` libraries and references are absent.

## Result Contract

- **status:** success
- **executive_summary:** Replaced `/flow-pr` with deterministic inspect/request/execute contracts and removed retired review, promotion, release, chain, and journal surfaces. All 17 persisted task entries are complete; no commit or remote publication occurred.
- **artifacts:** OpenSpec proposal, design, tasks, and apply-progress paths listed above; Engram proposal #6877, design #6879, tasks #6881, and apply-progress #6883.
- **next_recommended:** sdd-verify
- **risks:** Maintainer-approved `size:exception`; the task artifact contains 17 checklist entries although the launch message referred to 16.
- **skill_resolution:** paths-injected — 4 skills loaded

## Deviations

None — this corrective rerun changes only hybrid SDD artifacts and records no new implementation or test claim.
