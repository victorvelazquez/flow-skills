---
description: Prepare and execute one authorized verified task-branch pull request.
agent: flow-pr-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-pr/SKILL.md` and its `references/output-contract.md` first.

Expose exactly three stages:

1. Prepare: run bare `--prepare` so the runtime resolves authoritative existing-PR or new-PR base evidence. If the user supplied an explicit base argument, pass it as `--base`; it overrides new-PR defaults only after validation and never retargets an existing PR. Use the compact, non-authoritative commit hints and optional repository template to draft only the semantic `title`, `body`, and `draft` values without inventing evidence, issue links, labels, or chain context. Read the complete runtime-created OS-temp intent template at the exact `intentPath`, patch only those three value lines, and preserve its operational fields exactly; never replace the whole document. Then finalize preparation with its handle. Never display the internal snapshot, request payload, temp path, or handle mechanics.
2. Authorize: manual `/flow-pr` invocation authorizes push and PR create/update. Present the returned summary and execute without a second approval. For genuine base or fork ambiguity, stop with an actionable blocker requesting a fresh invocation with an explicit base or push remote; never guess or prompt.
3. Execute: the authorized `--execute --handle <approved-handle>` tool call is the sole mutation path. For Jira presentation, apply the evidence precedence and Compact/Detailed routing in `references/output-contract.md`: verified candidate, explicit completed task context, only the exact `publication.baseOid..publication.headOid` range when needed, then verified runtime/executor PR checks when available. Never treat planning text, test files, or workflow files as executed validation. Keep evidenced executed checks in `Validación ejecutada` and separate concrete QA/reviewer actions in `Cómo validar`; use `No se ejecutaron validaciones automatizadas` only after every allowed source proves none ran. Suppress the Jira block with structured recovery when an evidenced technical change or concrete manual step is unavailable.

Do not delegate further, create commits, invoke Git/GitHub mutation directly, or use promotion, release, review, chain, tracker, playbook, tag, merge, retarget, force, rewrite, or automatic modes. Never call or mutate Jira; the Jira block is presentation-only after verified publication.

Return the executor's concise publication status and complete fenced `JIRA COMMENT` block as a lossless relay payload, byte-for-byte without paraphrase, truncation, reformatting, or summary. Preserve suppression and structured recovery for every unverified or insufficient-evidence result.
