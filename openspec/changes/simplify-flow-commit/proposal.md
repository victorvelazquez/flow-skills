# Proposal: Simplify `/flow-commit`

## Intent

`/flow-commit` is blocked and overcoupled because a Git automation command became a second Gentle AI authority implementation. Replace it with a small, deterministic Git-focused workflow that commits all intended changes safely while leaving semantic decisions to the skill/agent.

## Scope

### In Scope
- Remove **all** Gentle AI references and dependencies from `/flow-commit`, including `planId`, persistent/delayed plans, lineage, review lifecycle/topology, automatic rounds, historical modes, silent branch-suffix retries, and filename-based semantic heuristics.
- Inspect the complete worktree; leave protected branches safely; accept one or more ordered semantic groups chosen explicitly by the skill/agent; validate non-empty, disjoint, complete path coverage; stage exact paths; commit; verify; and report leftovers/partial progress.
- Require a Conventional Commit title (`type(scope): outcome`); allow an optional body only when it adds non-redundant context.
- Preserve NUL-safe status, argv-safe execution, bounded index restoration, exact staging, post-commit verification, structured output, and clear failure semantics.

### Out of Scope / First-Slice Constraints
- No `/flow-pr` behavior change or analogous cleanup; its shared publication exports remain temporarily in `review-delivery-policy.mjs`.
- No LLM-only Git mutations, global rollback after earlier successful commits, or modification of the five unrelated dirty files.
- Single-PR delivery within the 800-line review budget; no unrelated redesign.

## Capabilities

### New Capabilities
- `flow-commit`: Git-only inspection and ordered atomic commit execution with explicit semantic input and deterministic safety checks.

### Modified Capabilities
- None; no base specifications exist.

## Approach

Move grouping, branch, and message choices into the skill/agent. Send one explicit request to a smaller runtime, which validates the current change set and executes groups in order. On failure, restore only the failing uncommitted index operation, preserve prior commits, and report completed and remaining groups.

## Affected Areas

| Area | Impact |
|---|---|
| `scripts/flow-commit.mjs`, skill/agent/command | Rewrite contracts and executor |
| commit/work-unit/review-policy libraries | Remove commit-only code; retain `/flow-pr` exports |
| commit, policy, asset, and agent tests | Replace authority tests with Git safety coverage |
| `flow-assets.json`, `.gitattributes`, `flow-assets.lock.json` | Reconcile mirrors without discarding unrelated lock edits |

Only `scripts/flow-commit.mjs` and `tests/flow-commit.test.mjs` overlap the seven-file dirty worktree; the other five edits remain untouched.

## Risks

| Risk | Mitigation |
|---|---|
| Later group fails after prior commits | Stop and report exact partial progress; fix forward |
| Shared-policy pruning breaks `/flow-pr` | Preserve and test publication-facing exports |
| Staging, hooks, or asset reconciliation drift | Validate exact paths before/after each commit; preserve unrelated lock changes |

## Rollback / Fix-Forward

Before release, revert this change as one PR. During execution, never promise global rollback: preserve successful commits, restore only bounded failing index state, and provide actionable remaining work.

## Success Criteria

- [ ] `/flow-commit` contains no Gentle AI dependency or removed lifecycle concepts.
- [ ] One-or-many groups produce ordered atomic Conventional Commits with exact complete coverage.
- [ ] Protected branches, partial failures, leftovers, and index recovery are deterministic and verified.
- [ ] `/flow-pr` is unchanged; all five unrelated dirty edits and their asset-lock content are preserved.
