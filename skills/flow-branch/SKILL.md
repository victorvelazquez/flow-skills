---
name: flow-branch
description: "Trigger: /flow-branch command. Run deterministic interactive or direct branch workflows without direct Git mutation."
license: MIT
metadata:
  author: gentleman-programming
  version: "2.0"
---

## Activation Contract

Load this skill for `/flow-branch` with or without one branch argument. Use `~/.config/opencode/scripts/flow-branch.mjs` as the only branch-policy and mutation authority.

## Hard Rules

- Never run mutating Git commands directly or reimplement runtime resolution, inventory, update, or deletion policy.
- Treat arguments as data. Accept one token matching `^[A-Za-z0-9][A-Za-z0-9._/-]*$`; never interpolate unvalidated input as shell syntax.
- Never delete without a separate explicit confirmation, including when deletion was requested initially.
- Never delete `main`, `master`, `develop`, `development`, `dev`, `staging`, `production`, the current branch, a remote-only branch, or any entry with `protected: true`.
- Never force-delete without explicit approval for that specific branch. Do not bulk-approve force deletion.
- Never discard changes, stash, reset, force checkout, merge non-fast-forward, or report success after a runtime failure.

## Decision Gates

| Input or result | Action |
| --- | --- |
| No argument | Run `node "$HOME/.config/opencode/scripts/flow-branch.mjs" --auto-list`; print `display` and `instructions` verbatim, then ask for a selection. |
| One valid branch token | Run the runtime with that single quoted token and report the structured result. |
| Interactive checkout | Run `--checkout --branch <name>`. On `ask-pull`, ask once, then run the same command with `--pull` only after approval. |
| Delete request | Build candidates from `allBranches`, filter forbidden entries, show the exact local list, and stop for confirmation. |
| `ask-force-delete` | Stop and ask only for the named unmerged branch; run `--force` only after approval. |
| Any other error | Show the runtime error and stop without alternate mutation. |

## Execution Steps

1. Load this skill before invoking the runtime.
2. For direct mode, pass exactly one validated argument. The runtime owns fetch, resolution, clean-worktree checks, checkout/tracking, and fast-forward-only update.
3. For interactive mode, follow `nextAction`; never infer success.
4. Execute confirmed deletions sequentially with `--delete --branch <name>` and preserve per-branch force confirmation.

## Output Contract

Return the runtime status, resolved branch when present, update strategy/result, and required next action. For bare listing, preserve runtime-formatted output verbatim.
