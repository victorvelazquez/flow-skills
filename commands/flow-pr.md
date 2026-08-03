---
description: Prepare, approve once, and execute one verified task-branch pull request.
agent: flow-pr-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-pr/SKILL.md` and its `references/output-contract.md` first.

Expose exactly three stages:

1. Prepare: run the runtime preparation commands. Use the compact, non-authoritative commit hints and optional repository template to draft the small semantic intent without inventing evidence, issue links, labels, or chain context. Write it only to the exact runtime-created OS-temp `intentPath`, then finalize preparation with its handle. Never display the internal snapshot, request payload, temp path, or handle mechanics.
2. Approve: present only the returned `approval` summary, then invoke execute so its `ask` permission prompt is the one human mutation approval. Never ask for a separate conversational confirmation. For genuine base or fork ambiguity, invoke OpenCode's `question` tool, wait for the answer inside this same child invocation, and continue preparation; never return a plain-text clarification question to the parent.
3. Execute: the approved `--execute --handle <approved-handle>` tool call is the sole mutation permission boundary.

Do not delegate further, create commits, invoke Git/GitHub mutation directly, or use promotion, release, review, chain, tracker, playbook, tag, merge, retarget, force, rewrite, or automatic modes. Never call or mutate Jira; the Jira block is presentation-only after verified publication.

Return the executor's concise publication status and complete fenced `JIRA COMMENT` block verbatim. Preserve suppression and structured recovery for every unverified result.
