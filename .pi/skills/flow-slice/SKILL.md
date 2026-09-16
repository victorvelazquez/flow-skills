---
name: flow-slice
description: "Trigger: implementá el próximo slice, implementá el slice T<ID>, implement the next slice, implement slice T<ID>. Safely execute one Flow roadmap slice."
license: Apache-2.0
metadata:
  author: "victorvelazquez"
  version: "1.0"
---

## Activation Contract

Use for one-line requests to implement the next Flow slice or an explicit `T<ID>` slice. Treat the request as sufficient; load the canonical workflow instead of asking the user to restate it.

## Hard Rules

- Resolve the repository root and read `docs/flow-modernization-roadmap.md` in full before acting.
- Require the roadmap/repository's actual base branch to be clean and updated; create or use exactly one isolated task branch. Never continue from stale or dirty state.
- Authorize exactly one task from the roadmap and repository evidence. An explicit ID must equal that task.
- Never commit, push, open a PR, merge, publish, install, deploy, reconcile live systems, or release.
- Honor the task scope, non-goals, and <=400 changed-line budget unless the roadmap already records `size:exception`; never run parallel writers.
- Treat predecessor reconciliation as successor-branch metadata after merge evidence: no predecessor implementation or separate roadmap-only PR.

## Decision Gates

| Check | Result if not satisfied |
| --- | --- |
| Clean, updated base; unambiguous dependency merge evidence | `BLOCKED` |
| Exactly one enabled next task; explicit ID matches | `BLOCKED` |
| Scope, non-goals, acceptance, and budget are clear | `BLOCKED` |
| Predecessor is `verified awaiting merge` | Reconcile it only in the successor branch with exact, unambiguous updated-base merge evidence; otherwise `BLOCKED` |

## Execution Steps

1. Inspect the base, roadmap, task card, dependencies, and repository evidence. Select only the authorized task.
2. Delegate broad exploration, implementation to one writer, command-running verification, and review to available Pi subagents under harness rules; keep exploration, verification, and review read-only and independent of the writer.
3. For behavior changes, record strict TDD evidence: RED, GREEN, TRIANGULATE/negative coverage, then REFACTOR. For docs-only or non-behavior work, run exact relevant checks and explain why RED does not apply.
4. After confirming merge evidence, reconcile predecessor metadata first when required. Implement and verify only the selected current slice. After independent `PASS`, leave the selected task's card as `verified awaiting merge`, recording exact evidence and naming the next task as conditional on merge. Never mark the selected task `complete` before merge.

## Output Contract

Return `PASS`, `BLOCKED`, or `FAILED`; task and branch; `Commit: none`; `PR: none`; changed files with line counts; exact tests, checks, skips, and TDD evidence; independent-verification evidence; roadmap state; and the conditional next task.

## References

- `../../../docs/flow-modernization-roadmap.md` — canonical task order, gates, reconciliation, and acceptance.
