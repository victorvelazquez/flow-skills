---
description: Inspect the current worktree and prepare an explicit Flow commit request.
agent: flow-git-agent
subtask: true
---

Run the `/flow-commit` inspect-to-request workflow for the current worktree only.

1. Inspect with the Flow runtime. Do not audit, edit, push, publish, create a PR, or invoke direct Git mutation.
2. If inspection is `noop`, report it and stop.
3. Group the inspection snapshot into ordered, independently described work units. Every inspected path must appear exactly once. Choose a precise Conventional title and optional exact body for each unit.
4. Present the complete request JSON, including explicit branch action, and ask for mutation approval. Do not execute before approval.
5. After approval, execute only the approved request and report its structured result. A partial result preserves prior commits and requires a new inspection for remaining work.

`$ARGUMENTS` may constrain intended files, branch name, titles, or bodies. It never authorizes omitted paths, automatic grouping, branch-name retries, auditing, pushing, or publication.
