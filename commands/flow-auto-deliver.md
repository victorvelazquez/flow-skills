---
description: Prepare semantic work units and execute one sealed Flow Commit handle.
agent: flow-git-agent
subtask: true
---

Run the `/flow-commit` compact prepare, semantic intent, seal, and execute workflow for the current worktree only.

Do not audit, edit, push, publish, create a PR, delegate, or invoke direct Git mutation. Present the compact sealed summary without raw JSON, then let the `--execute --handle` permission prompt be the one approval. Stop once on noop, blocker, drift, partial, or failure; never retry without fresh user action.

`$ARGUMENTS` may constrain intended branch, titles, bodies, or semantic ownership. It never authorizes omitted changed paths, branch-name retries, or bypassing the runtime.
