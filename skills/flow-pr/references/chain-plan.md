# Flow Chain Plan v2

Use `--chain-plan <path>` only after dry-run reports an oversized candidate or when publishing an existing reviewed chain. Dry-run returns deterministic equal `chainPlanId`/`planIdentity`; every live publication requires that exact value as `--expected-chain-plan-id` before fetch, push, or PR mutation.

## Strategies

| Strategy | Base and dependency rule |
| --- | --- |
| `stacked-to-main` | First PR targets integration. Every later PR targets the immediate previous head and depends on its ID. |
| `feature-branch-chain` | Draft/no-merge tracker targets integration. Child 1 targets tracker; every later child targets the immediate previous head. |

Each child PR is exactly one semantic work unit. It declares a stable ID, outcome title, start/end state, dependencies and prior/follow-up/out-of-scope work, focused test command/result, runtime scenario/result or N/A reason, exact rollback boundary, and implementation/test/docs/shared-support paths. Tests and docs stay with implementation; shared support names its owner and rationale. Authored lines must be at most 400 unless the immutable plan records maintainer `size:exception` acceptance and rationale.

Feature-branch-chain requires exactly one draft/no-merge tracker and `expectedFinalTree` equal to the deepest semantic child's content tree. Both the original tracker SHA/tree and expected final tree remain in immutable `chainPlanId`. The tracker is a control-plane object, never a work unit or subject to the per-child budget. `noMerge` means Flow-managed no-merge-until-finalized; required GitHub draft state is the initial platform merge block. Initial publication still requires every original ref exactly.

The machine-readable `finalize_tracker_after_children` action points to internal `/flow-pr` operation `finalize_chain_tracker`. After every verified create/update/noop, external chain state binds each publication's exact repository, PR number/canonical URL, role/workUnit, plan ID, refs/OID, managed metadata, and record identity. This local file is evidence only, never aggregate review authorization. Every invocation, including `inFlight` and `completed` replay, freshly discovers the current tracker's approved native authority and validates its `pre-pr` receipt, then compares exact lineage/revision/receipt/gate/target binding with journal evidence before any readiness reconciliation. Before `gh pr ready`, Flow atomically journals that evidence with plan/publication, current tracker SHA/tree, and deterministic action key. Applied-but-failed ready completes only after the fresh gate allows; still-draft returns a bounded retry, ready without a matching journal is unauthorized, and an exact completed replay is a readiness noop only after fresh validation. Flow never merges.

Flow validates every ref, tree, immediate-base diff, path digest, line count, ancestry edge, semantic boundary, and evidence reference before mutation. Child bases are immutable: GitHub auto-retargeting is rejected. Keep each parent branch until every descendant PR has merged; branch deletion is supported only afterward, provided retained historical PR metadata still reports the exact frozen head/base/OID. Generated paths remain in identity but do not consume authored review budget. Legacy v1, protected, lifecycle, unknown, duplicate, cyclic, polluted, stale, divergent, or arbitrary-base plans fail closed. Regenerate v1 plans; Flow never migrates them silently.

The path-based forecast is advisory only and is not a validated chain plan. Flow-pr may push validated existing branch contents and create/update PR metadata. It never splits commits, creates chain branches, retrospectively transforms a monolithic candidate, rebases, force-pushes, merges, or retargets. Retry only with the unchanged immutable `planIdentity`.
