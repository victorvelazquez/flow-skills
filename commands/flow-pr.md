---
description: Prepare, approve once, and execute one verified task-branch pull request.
agent: flow-pr-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-pr/SKILL.md` and its `references/output-contract.md` first.

Expose exactly three stages:

1. Prepare: run bare `--prepare` so the runtime resolves authoritative existing-PR or new-PR base evidence. If the user supplied an explicit base argument, pass it as `--base`; it overrides new-PR defaults only after validation and never retargets an existing PR. Use the compact, non-authoritative commit hints and optional repository template to draft only the semantic `title`, `body`, and `draft` values without inventing evidence, issue links, labels, or chain context. Read the complete runtime-created OS-temp intent template at the exact `intentPath`, patch only those three value lines, and preserve its operational fields exactly; never replace the whole document. Then finalize preparation with its handle. Never display the internal snapshot, request payload, temp path, or handle mechanics.
2. Approve: present only the returned `approval` summary, then invoke execute so its `ask` permission prompt is the one human mutation approval. Never ask for a separate conversational confirmation. For genuine base or fork ambiguity, invoke OpenCode's `question` tool, wait for the answer inside this same child invocation, and continue preparation; never return a plain-text clarification question to the parent.
3. Execute: the approved `--execute --handle <approved-handle>` tool call is the sole mutation permission boundary. For Jira presentation, use the verified `publication.candidate` and completed task context. If that evidence is insufficient, read only `publication.baseOid..publication.headOid`; never inspect another range or state. Separate executed checks into `Validación ejecutada` and concrete QA/reviewer manual steps into `Cómo validar`. Suppress the Jira block with structured recovery when an evidenced technical change or concrete manual step is unavailable.

Do not delegate further, create commits, invoke Git/GitHub mutation directly, or use promotion, release, review, chain, tracker, playbook, tag, merge, retarget, force, rewrite, or automatic modes. Never call or mutate Jira; the Jira block is presentation-only after verified publication.

Return the executor's concise publication status and complete fenced `JIRA COMMENT` block as a lossless relay payload, byte-for-byte without paraphrase, truncation, reformatting, or summary. Preserve suppression and structured recovery for every unverified or insufficient-evidence result.
