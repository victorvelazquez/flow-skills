---
description: Prepare and execute approval-bound Conventional Commit units
agent: flow-git-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-commit/SKILL.md` first and follow it exactly.

Route directly to the single `flow-git-agent`. Run `--prepare` once, read Git facts once, group exact ordered prepared ordinals into semantic units, and use only the runtime-owned `--encode-author-intent` helper to construct the bounded canonical Base64URL token. Author with `--author-intent --handle <prepare-handle> --payload-b64url <token>`, seal with `--seal --handle <authored-handle>`, present the compact sealed summary, and invoke `--execute --handle <sealed-handle>` once so its OpenCode `ask` permission is the one human mutation approval. Never use file authoring, generic encoding, shell substitution/redirection, raw JSON, or temp paths. Never ask for separate conversational approval.

Permit at most one structured author correction for the explicit recoverable allowlist without rereading Git facts or preparing again. Stop on a second or nonrecoverable author failure, noop, drift, blocker, partial execution, seal failure, or execute failure. Never retry seal or execute without fresh user action.
