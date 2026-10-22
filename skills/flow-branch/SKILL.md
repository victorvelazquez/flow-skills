---
name: flow-branch
description: "Run deterministic interactive or direct branch workflows without direct Git mutation."
license: MIT
metadata:
  author: gentleman-programming
  version: "2.0"
---

## Activation Contract

Use this workflow to select, update, or delete an existing branch. Resolve the packaged `../../scripts/flow-branch.mjs` runtime relative to this skill; it is the only branch-policy and mutation authority.

## Hard Rules

- Never run mutating Git commands directly or reimplement runtime resolution, inventory, update, or deletion policy.
- Treat input as data. Accept one token (or the reserved word `list`) matching `^[A-Za-z0-9][A-Za-z0-9._/-]*$`; never interpolate unvalidated input as shell syntax.
- Never delete without a separate explicit confirmation, including when deletion was requested initially.
- Never delete `main`, `master`, `develop`, `development`, `dev`, `staging`, `production`, the current branch, a remote-only branch, or any entry with `protected: true`.
- Never force-delete without explicit approval for that specific branch. Do not bulk-approve force deletion.
- Never discard changes, stash, reset, force checkout, merge non-fast-forward, or report success after a runtime failure. The only stash allowed is the runtime's own `--stash` mode, and only when the user passed `--stash` explicitly; never add it on your own after a dirty-worktree failure.
- This runtime selects existing local or remote branch identities. Remote-only checkout may materialize a local tracking ref, but it never creates a new branch identity from the current source, so it records no base provenance; Flow Commit owns that boundary.

## Decision Gates

| Input or result | Action |
| --- | --- |
| No input | Run the runtime with `--default`. It infers the first existing branch in the order `dev`, `develop`, `development`, `main`, `master` (local or remote) and switches with the same safe direct route. If the result has `mode: "auto-list"` (no candidate exists), present `display` and `instructions` verbatim, then request a selection through the host. |
| `--stash` alone, or `--stash` plus one valid branch token | Run the runtime with `--stash` (and that token). It stashes local changes including untracked files, switches, fast-forwards, then restores them. It only proceeds when the current branch's cycle is finished (no commits of its own, already merged into the target, or its remote branch deleted); otherwise it refuses with `stashRefused` and changes nothing. Never bypass a refusal. Treat `--stash` as a reserved flag, never as a branch name. Report `stashed`/`stashRestored`. On `nextAction: "stash-conflict"` report that the switch happened, the changes remain in the stash (`stashRef`) and the conflicted files need manual resolution; do not drop, reset or retry. |
| Single token `list` | Run the runtime with `--auto-list`; present `display` and `instructions` verbatim, then request a selection through the host. |
| One valid branch token | Run the runtime with that single argument and present its structured result. |
| Number selected from bare listing | Map the number only through the current listing's displayed `branches` entry with matching `index` to its exact `name`. `allBranches` may validate name membership, not translate displayed numbers. Reject missing, stale, or ambiguous choices; validate the name as data, then invoke `--exact-branch <name>` once. The runtime fetches fresh inventory and rejects an absent exact identity without alias or prefix fallback. Never treat a number as a branch name. |
| Legacy interactive checkout | If already in `--checkout --branch <name>` compatibility mode, on `ask-pull` collect approval, then run the same command with `--pull`. Do not enter this mode for explicit selection. |
| Numeric delete request (`2 eliminar`, ranges or comma-separated numbers) | Map every number through the same displayed `branches` entry by `index` to its exact `name`. Reject missing, stale, duplicated or forbidden entries (protected, current, remote-only or forbidden names); `allBranches` may validate name membership, not translate displayed numbers. Present the exact candidate names and stop for separate confirmation explicitly naming those exact names before any `--delete --branch <name>`. |
| `ask-force-delete` | Stop and collect approval only for the named unmerged branch; run `--force` only after that approval. |
| Dirty-worktree error (`dirty: true`) | Present the runtime error including its `--stash` tip and stop. Do not run `--stash` unless the user asks for it. |
| Any other error | Present the runtime error and stop without alternate mutation. |

## Execution Steps

1. Load this skill before invoking the runtime.
2. For a manual branch token, pass exactly one validated argument through the one-token direct route. For a number resolved by `index` from the current displayed `branches` listing, validate its exact name and pass it with `--exact-branch <name>`; never route numbered names through direct aliases. Do not ask again to pull: explicit selection authorizes this safe checkout/update only. The runtime re-resolves and stale-checks the branch and owns fetch, resolution, clean-worktree checks, checkout/tracking, and fast-forward-only update. Never infer deletion authorization from invocation or number selection; deletion requires separate explicit confirmation.
3. For interactive mode, follow `nextAction`; never infer success.
4. Execute confirmed deletions sequentially with `--delete --branch <name>` and preserve per-branch force confirmation.

## Output Contract

Return the runtime status, resolved branch when present, update strategy/result, and required next action. For bare listing, preserve runtime-formatted output verbatim.
