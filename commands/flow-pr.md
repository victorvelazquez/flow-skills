---
description: Inspect a task branch and publish one explicitly approved pull request.
agent: flow-pr-agent
subtask: true
---

Read `~/.config/opencode/skills/flow-pr/SKILL.md` and its `references/output-contract.md` first.

`/flow-pr` has two explicit phases:

1. Run `--inspect --base <selected-base>` without changing Git or GitHub.
2. Construct the exact request, encode its unchanged UTF-8 bytes as unpadded base64url, and run `--materialize-request --request-base64 <base64url>`. This runtime-owned command writes only a new OS-temporary request file and returns both its path and parsed request.
3. Present the returned exact request for user approval. Only after approval, run `--execute --request <returned-temp-path>` through `flow-pr-agent`.

Do not delegate, create commits, invoke Git/GitHub mutation directly, or use promotion, release, review, chain, tracker, playbook, tag, merge, retarget, force, rewrite, or automatic modes. Never call or mutate Jira; the Jira block is presentation-only after verified publication.

Return the executor's concise publication status and complete fenced `JIRA COMMENT` block verbatim. Do not paraphrase, truncate, reformat, or replace it with a separate PR description. If the executor suppresses the block, preserve that suppression and structured recovery response.

CONTEXT:

- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
