---
description: Prepare and execute approval-bound Conventional Commit units
agent: flow-git-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-commit/SKILL.md` first and follow it exactly.

Route directly to the single `flow-git-agent`. Prepare and seal are read-only. Present the compact sealed summary, then invoke `--execute --handle <handle>` so the OpenCode `ask` permission is the one human mutation approval. Never ask for separate conversational approval or display raw JSON, snapshots, fingerprints, requests, handles, or temp internals.

Stop once on noop, drift, blockers, partial execution, or failure. Never retry without fresh user action.
