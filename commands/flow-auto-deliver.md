---
description: Prepare semantic work units and execute one sealed Flow Commit handle.
agent: flow-git-agent
subtask: true
---

Run the `/flow-commit` compact prepare, runtime-authored template edit, non-consuming validation, seal, and execute workflow for the current worktree only. For one unit, edit only the semantic title and protected branch name placeholders; for multiple units, deliberately replace the units block while preserving exact disjoint prepared coverage. Never reconstruct the whole intent document. Keep one specialized agent and one human mutation approval. Validation permits at most one correction of the same intent path for the explicit authoring allowlist, with no Git-fact reread or fresh prepare.

Do not audit, edit, push, publish, create a PR, delegate, or invoke direct Git mutation. The one bounded temp-intent correction is not a repository edit. Present the compact sealed summary without raw JSON, then let the `--execute --handle` permission prompt be the one approval. Stop on a second validation failure, nonrecoverable validation failure, noop, blocker, drift, partial, seal failure, or execute failure; never retry seal or execute without fresh user action.

`$ARGUMENTS` may constrain intended branch, titles, bodies, or semantic ownership. It never authorizes omitted changed paths, branch-name retries, or bypassing the runtime.
