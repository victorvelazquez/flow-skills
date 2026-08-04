---
description: Prepare semantic work units and execute one sealed Flow Commit handle.
agent: flow-git-agent
subtask: true
---

Run the `/flow-commit` `prepare -> structured author-intent -> seal -> execute` workflow for the current worktree only. Address prepared changes by ordered integer ordinals, use the runtime-owned encoder to construct one bounded canonical Base64URL token, author it once, and keep one specialized agent plus one human mutation approval. Authoring permits at most one structured correction for the recoverable allowlist, with no Git-fact reread or fresh prepare.

Do not audit, edit, push, publish, create a PR, delegate, invoke direct Git mutation, write transport files, or use shell encoding/substitution/redirection. Present the compact sealed summary without raw payloads, then let the `--execute --handle` permission prompt be the one approval. Stop on a second or nonrecoverable author failure, noop, blocker, drift, partial, seal failure, or execute failure; never retry seal or execute without fresh user action.

`$ARGUMENTS` may constrain intended branch, titles, bodies, or semantic ownership. It never authorizes omitted changed paths, branch-name retries, or bypassing the runtime.
