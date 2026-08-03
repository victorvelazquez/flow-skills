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
- Use the execute command's `ask` permission prompt as the one human mutation approval. Never ask for a separate conversational confirmation. For genuine base or fork ambiguity, invoke OpenCode's `question` tool, wait for the answer inside the same child invocation, and continue preparation; never return a plain-text clarification question to the parent.
- Never use automatic modes, plans, journals, Gentle AI, review authority, promotion, release, tags, chains, trackers, Jira mutation, issue-first policy, or playbook sync.
- Never retry after drift, blocked changed input, partial, failure, or unknown effects. Prepare and approve again.
- Use only standard Windows LocalAppData Temp, Linux `/tmp`, or macOS `/var/folders/.../T`. The runtime fails preparation with `temp-root-unsupported` for a custom temp root rather than broadening filesystem permissions.
- Treat commit-derived drafting fields and repository templates as non-authoritative input. Never derive labels, issue policy, issue links, or chain behavior from commit types.
- Existing PR authority is discovered first and its current base is never retargeted. For a new PR, runtime precedence is explicit `--base`, `branch.<head>.gh-merge-base`, GitHub `defaultBranchRef`, then live unambiguous `origin/HEAD`; branch names, topology, nearest merge-base, and ancestry are never base authority.

## Decision Gates

| Condition | Action |
| --- | --- |
| Base or fork semantics are ambiguous | Use OpenCode's `question` tool, wait in this child invocation, then continue preparation |
| Preparation returns an approval summary | Show only that summary, then invoke execute; its permission prompt is the one approval |
| One safe repository template is available | Preserve its structure, headings, and checklists while adding only evidenced content |
| Template is absent, ambiguous, or unavailable | Draft a concise generic body without asking the user to choose a template |
| Verified `success` or `noop` with a non-null PR | Apply the output contract |
| Any other result | Stop, suppress Jira output, and report recovery |

## Execution Steps

1. Run `node "$HOME/.config/opencode/scripts/flow-pr.mjs" --prepare`. When the user supplied an explicit destination, add `--base "<base-ref>"`; it overrides new-PR defaults after validation but cannot retarget an existing PR. Add `--push-remote` only for an intentional fork. On `base-ambiguous`, use the in-child `question` tool for an exact base and prepare again with `--base`; do not guess.
2. Use compact repository, PR, commit, changed-path, and optional template facts to draft title/body. A non-null commit title suggestion is conservative guidance, not authority; otherwise synthesize without inventing a type, scope, or outcome. Preserve evidenced breaking markers and add breaking-impact prose only when evidence supplies the impact. With one safe template, preserve its structure; otherwise use only applicable `Summary`, `Changes`, `Validation`, `Risks/Breaking Change`, and `Out of scope` sections. Never invent tests, checks, issue links, migrations, evidence, impact, labels, or chain context. Write `Not run` or `Not provided` when a present validation section lacks evidence. Preserve issue closing references or chain context only when task/user context supplied them, without validating issues or orchestrating chains. Write the small semantic intent only to the returned runtime-owned `intentPath`, then run `node "$HOME/.config/opencode/scripts/flow-pr.mjs" --prepare --handle "<context-handle>"`. Never show the temp path or intent payload.
3. Present the concise approval summary: repository, branch to base, frozen base authority source/evidence, verify/push plus create/update/noop expectation, title, body size/digest, draft, labels, authorized update fields, and delivery target.
4. Immediately invoke `node "$HOME/.config/opencode/scripts/flow-pr.mjs" --execute --handle "<approved-handle>"`. Its `ask` permission prompt is the only approval; do not ask separately.

Use `--verbose` only for explicit diagnostics. It is never part of normal approval.

## Output Contract

Apply `references/output-contract.md` exactly. Return concise status and the complete fenced `JIRA COMMENT` block verbatim only when its gate passes.

## References

- `references/output-contract.md` - verified presentation gate and historical Jira template.
