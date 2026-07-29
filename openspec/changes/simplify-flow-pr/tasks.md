# Tasks: Simplify `/flow-pr`

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated additions | 1,200–1,700 |
| Estimated deletions | 6,000–8,500 |
| Estimated total changed lines | 7,200–10,200 across 25–35 files |
| 400 / 800-line budget risk | High / High |
| Chained PRs recommended | Yes; not selected |
| Delivery strategy | `single-pr`; one delegated writer |
| Suggested split | One atomic replacement/deletion PR, maintainer-approved `size:exception` |
| Chain strategy | N/A — single PR |

Decision needed before apply: No
Chained PRs recommended: Yes; exception accepted
Chain strategy: N/A — single PR
400-line budget risk: High

Maintainer-approved `size:exception`: use one atomic replacement/deletion change. Minimize additions with shared builders, table-driven cases, and deletion—not ports—of retired fixtures; retain every scenario.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Atomic replacement and dead-surface deletion | Single exception PR | `node --test tests/flow-pr.test.mjs` | Local/bare repos plus fake `gh`; no network | Revert all listed changes together |

## Phase 1: Contracts and Inspection

- [x] 1.1 **RED:** In `tests/flow-pr.test.mjs`, specify strict schemas, extra-property and hostile/control-input rejection, complete outputs, effects, phases, and exits.
- [x] 1.2 **GREEN:** Create `scripts/lib/flow-pr-contracts.mjs` validators and canonical identity serialization; keep shared builders compact. **REFACTOR:** remove duplicated fixtures.
- [x] 1.3 **RED:** Cover canonical root/common-dir and HTTPS/SSH/scp identities; reject `-C`, relative/foreign roots, credentials, hosts, and ambiguous remotes.
- [x] 1.4 **GREEN:** Create `scripts/lib/flow-pr-inspection.mjs` with argv-only local reads, `git ls-remote`, and read-only fakeable `gh`; forbid fetch/ref/FETCH_HEAD/object mutation.
- [x] 1.5 **RED:** Cover nullable upstream, unavailable/invalid `gh`, complete PR/labels, and explicit same-repo/fork push/head identities.

## Phase 2: Preflight, Push, and Reconciliation

- [x] 2.1 **RED:** Cover drift plus protected/detached/dirty/merge/rebase/uncommitted states, invalid refs, upstream mismatch, and base deletion/movement with zero effects.
- [x] 2.2 **GREEN:** Create `scripts/lib/flow-pr-executor.mjs` preflight; re-inspect every authority and reject force, rewrite, merge, retarget, fetch, and object mutation.
- [x] 2.3 **RED:** Cover absent/equal/proven-FF/unknown-ancestry/ahead/diverged remote heads and exact normal refspec/upstream verification.
- [x] 2.4 **GREEN:** Implement non-force push/upstream and post-push `ls-remote` verification in `scripts/lib/flow-pr-executor.mjs`.
- [x] 2.5 **RED:** With fake `gh`, cover create/update/noop, open/closed/merged/ambiguous PRs, explicit draft, disjoint/preserved labels, and composed/environment-prefixed commands.
- [x] 2.6 **GREEN:** Implement deterministic PR reconciliation and complete postcondition verification; mark uncertain mutations `unknown` and fail closed.
- [x] 2.7 **RED:** Cover push-then-PR recovery and idempotent rerun after fresh approval. **GREEN/REFACTOR:** preserve effects without compensation; consolidate reporting.

## Phase 3: Public Workflow and Cleanup

- [x] 3.1 Replace `scripts/flow-pr.mjs`, `commands/flow-pr.md`, `agents/flow-pr-agent.md`, and `skills/flow-pr/SKILL.md`: allow inspect, require semantic execute approval, and deny direct mutations/delegation.
- [x] 3.2 Prove callers with `rg`, preserve `commands/flow-auto-deliver.md` commit-only and `commands/flow-commit.md`/`scripts/flow-commit.mjs`; then delete every design-listed dead module, test, and reference.
- [x] 3.3 Remove Gentle AI, promotion/release/version/tag, chain/tracker, journal/rewrite, and legacy references; add semantic-approval/permission RED/GREEN cases to `tests/flow-agent-contract.test.mjs`.
- [x] 3.4 Reconcile `install.mjs`, asset manifests/lock, conditional `.gitattributes`, and asset/install tests; prove installed bytes equal committed source and retired assets are absent.
- [x] 3.5 Run focused tests including `tests/flow-commit.test.mjs`; use no real remotes and keep the branch unpublished. Reserve the full suite for `sdd-verify`.
