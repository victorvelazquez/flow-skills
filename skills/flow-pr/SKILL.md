---
name: flow-pr
description: "Trigger: /flow-pr. Prepare, approve once, and execute one verified task-branch pull request."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "5.0"
---

## Activation Contract

Use `/flow-pr` for one Git/GitHub task-branch publication. Expose only prepare, one approval, and execute; the runtime owns all authority snapshots and mechanics.

## Hard Rules

- Never run direct `git push`, `gh`, commit, merge, retarget, force, rebase, or rewrite commands.
- Never display, reconstruct, encode, or write the internal snapshot or request.
- Write only `flow-pr/intent-v2` to the exact runtime-created OS-temp `intentPath`. Never edit the repository or another path, or use shell interpolation, substitution, pipes, redirection, encoding, or generic shell writes.
- Use the execute command's `ask` permission prompt as the one human mutation approval. Never ask for a separate conversational confirmation; ask another question only for genuine base or fork ambiguity.
- Never use automatic modes, plans, journals, Gentle AI, review authority, promotion, release, tags, chains, trackers, Jira mutation, issue-first policy, or playbook sync.
- Never retry after drift, blocked changed input, partial, failure, or unknown effects. Prepare and approve again.
- Use only standard Windows LocalAppData Temp, Linux `/tmp`, or macOS `/var/folders/.../T`. The runtime fails preparation with `temp-root-unsupported` for a custom temp root rather than broadening filesystem permissions.

## Decision Gates

| Condition | Action |
| --- | --- |
| Base or fork semantics are ambiguous | Ask one focused semantic question before preparation |
| Preparation returns an approval summary | Show only that summary, then invoke execute; its permission prompt is the one approval |
| Verified `success` or `noop` with a non-null PR | Apply the output contract |
| Any other result | Stop, suppress Jira output, and report recovery |

## Execution Steps

1. Select the base from task context and run `node "$HOME/.config/opencode/scripts/flow-pr.mjs" --prepare --base "<base-ref>"`. Add `--push-remote` only for an intentional fork.
2. Use compact repository, PR, commit-subject, and changed-path facts to draft title/body. Write the small semantic intent only to the returned runtime-owned `intentPath`, then run `node "$HOME/.config/opencode/scripts/flow-pr.mjs" --prepare --handle "<context-handle>"`. Never show the temp path or intent payload.
3. Present the concise approval summary: repository, branch to base, verify/push plus create/update/noop expectation, title, body size/digest, draft, labels, authorized update fields, and delivery target.
4. Immediately invoke `node "$HOME/.config/opencode/scripts/flow-pr.mjs" --execute --handle "<approved-handle>"`. Its `ask` permission prompt is the only approval; do not ask separately.

Use `--verbose` only for explicit diagnostics. It is never part of normal approval.

## Output Contract

Apply `references/output-contract.md` exactly. Return concise status and the complete fenced `JIRA COMMENT` block verbatim only when its gate passes.

## References

- `references/output-contract.md` - verified presentation gate and historical Jira template.
