# Tasks: Simplify `/flow-commit`

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated change | ~700 added / ~2,300 deleted / ~-1,600 net; ~3,000 changed lines |
| Estimated files | 17 |
| Risk | High |
| Delivery | Single PR; maintainer `size:exception` approved before apply |

Chained PRs recommended: Yes
800-line budget risk: High
400-line budget risk: High
Decision needed before apply: No — approved
Chain strategy: Not applicable (single PR)

The mandatory 1,531-line runtime replacement alone exceeds 800 changed lines. No compliant reduction reaches budget when deletions count; additions remain minimized while retaining every specified safety case, and the maintainer exception is approved.

### Suggested Work Units

| Unit (owner) | Goal / likely PR | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1 (delegated writer) | Git executor and tests / single PR | `node --test tests/flow-commit.test.mjs` | temporary-repo inspect→execute scenarios | runtime and commit tests |
| 2 (delegated writer) | Consumer/publication alignment / single PR | `node --test tests/flow-agent-contract.test.mjs tests/review-delivery-policy.test.mjs` | command→agent→skill request review | skill, agent, commands, policy |
| 3 (delegated writer) | Dead-code/assets cleanup / single PR | `node --test tests/flow-assets-manifest.test.mjs tests/flow-assets-restore.test.mjs` | N/A—manifest-only reconciliation | deleted files and affected asset records |

## Phase 1: RED — Contracts and Safety

- [x] 1.1 In `tests/flow-commit.test.mjs`, RED-test inspection/request/result schemas, noop, statuses/exits, exact complete/disjoint coverage, root/branch/HEAD drift, merge state, and leftovers.
- [x] 1.2 RED-test protected/current/colliding/invalid/detached branches; exact supplied names with no retries; Conventional titles, body preservation/structure; ordered multi-unit success and second-unit partial progress.
- [x] 1.3 RED-test hostile NUL-safe paths plus literal `requirements.txt`, `CMakeLists.txt`, executable MD/MDX, and `README.sh`; reject absolute/escaping paths, root selectors, any staged/partially staged index, and `commit -a`.
- [x] 1.4 RED-test hook-added/staged/committed/external drift, exact tree/message/parent checks, failing-unit index restoration, runtime-created-HEAD rollback, and CAS collision preserving concurrent HEAD.

## Phase 2: GREEN — Git-Only Runtime

- [x] 2.1 Rewrite `scripts/flow-commit.mjs` with ephemeral NUL-safe inspection, strict request validation, exact argv-safe coverage/staging, protected-branch collision safety, and structured outcomes.
- [x] 2.2 Implement ordered hook-enabled commits, per-unit revalidation, index-byte snapshots, tree/message/path verification, bounded restoration/CAS rollback, partial retention, recovery, and no persistence or inference.
- [x] 2.3 REFACTOR runtime/test helpers for clarity without weakening RED cases; rerun `node --test tests/flow-commit.test.mjs`.

## Phase 3: Consumer and Compatibility Alignment

- [x] 3.1 Update `skills/flow-commit/SKILL.md`, `agents/flow-git-agent.md`, `commands/flow-commit.md`, and `commands/flow-auto-deliver.md` to inspect→explicit request→result; remove Gentle AI, planId, rounds, lineage, lifecycle/topology, heuristics, historical modes, and suffix retries.
- [x] 3.2 Update `tests/flow-agent-contract.test.mjs` to verify inspect/request/result ownership, mutation approval, denied direct Git/publication actions, and aligned command/agent/skill/auto-deliver wording.
- [x] 3.3 Prune commit-only APIs from `scripts/lib/review-delivery-policy.mjs`; update `tests/review-delivery-policy.test.mjs` to preserve `/flow-pr` behavior and `resolvePublicationDeliveryPolicy`, `deliveryPlanId`, and `deliveryAuthorityId` exports.

## Phase 4: Safe Cleanup and Verification

- [x] 4.1 Prove all callers are migrated, then delete `tests/flow-commit-harness.mjs`, `scripts/lib/flow-work-units.mjs`, and `tests/flow-work-units.test.mjs`; verify no removed concept or import remains.
- [x] 4.2 RED-test targeted reconciliation, then remove only deleted-library records from `flow-assets.json` and `.gitattributes`; patch only corresponding `flow-assets.lock.json` records, preserving unrelated dirty metadata/files.
- [x] 4.3 Run focused tests from all work units, then `node --test tests/*.test.mjs`; do not build. Confirm exact file ownership, no unrelated diff mutation, and publication exports remain intact.
