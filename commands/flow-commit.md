---
description: Prepare and execute approval-bound Conventional Commit units
agent: flow-git-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-commit/SKILL.md` first and follow it exactly.

Route directly to the single `flow-git-agent`. Prepare once, read Git facts once, and edit the runtime-authored invalid-until-semantic `flow-commit/intent-v2` template at the returned intent path: for one unit change only its title and protected branch name; for multiple units deliberately replace the units block while preserving exact disjoint coverage. Then run non-consuming `--validate-intent --handle <handle>`. Permit at most one correction of the same intent path for the explicit authoring allowlist, without rereading Git facts, creating another agent, or preparing again. Seal once, present the compact sealed summary, and invoke `--execute --handle <handle>` once so the OpenCode `ask` permission is the one human mutation approval. Never reconstruct the whole template or display raw JSON, snapshots, fingerprints, requests, handles, or temp internals. Never ask for separate conversational approval.

Stop on a second validation failure, any nonrecoverable validation failure, noop, drift, blocker, partial execution, seal failure, or execute failure. Never retry seal or execute without fresh user action.
