---
name: flow-commit
description: "Trigger: /flow-commit. Plan and create isolated Conventional Commit groups while honoring reviewed-delivery authority."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "4.0"
---

# flow-commit

## Activation Contract

Load for `/flow-commit` or a request to commit current local changes through Flow.

## Hard Rules

- Treat `scripts/flow-commit.mjs` as the execution source of truth.
- Run `--auto --dry-run` before `--auto`; pass the exact returned `planId` as `--expected-plan-id`.
- Never push. This skill alone owns ordinary branch creation, staging, and commits.
- Never rewrite existing commits with squash, reset, rebase, or amend to satisfy reviewed topology.
- Keep work units as reporting metadata. When `deliveryPolicy.topology` is `single`, the one physical `reviewed-delivery` group is authoritative.
- Stop on authority, plan, candidate-tree, path, partial-staging, or index-isolation drift.

## Decision Gates

| State | Action |
| --- | --- |
| Clean tree | Return noop; create no branch or commit |
| Protected branch with changes | Use one semantic task branch |
| `single` reviewed delivery | Commit all and only reviewed paths once |
| Grouped/no authority | Preserve planned work-unit groups |
| Required lifecycle unavailable or denied | Stop with zero commits |

## Execution Steps

1. Run `node ~/.config/opencode/scripts/flow-commit.mjs --auto --dry-run`. When native review discovery is ambiguous, rerun planning with the explicitly chosen `--lineage <id>`; never infer or auto-select one.
2. Compare `plannedCommitGroups[].files` with `git status --short`; retain `planId`.
3. Choose one branch name and messages supported by the plan. Use `reviewed-delivery` as the override key for a single physical group.
4. Run `--auto --expected-plan-id <planId>` with unchanged scope, selected overrides, and the same explicit `--lineage <id>` used for planning.
5. Report commits, work units, skipped groups, leftovers, and the next `/flow-pr` action.

## Output Contract

Return the branch decision, immutable plan ID, delivery policy/source, each physical commit and files, preserved work-unit metadata, skipped groups, leftovers, and next action.

## References

- `../../scripts/flow-commit.mjs` - runtime implementation.
- `../../scripts/lib/review-delivery-policy.mjs` - versioned lifecycle compatibility adapter.
- `references/review-delivery.md` - configuration, lineage selection, precedence, and failure semantics.
