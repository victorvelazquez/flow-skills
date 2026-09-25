---
name: flow-pr
description: "Prepare and execute one manually authorized verified task-branch pull request."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "5.0"
---

## Activation Contract

Use this workflow for one Git/GitHub task-branch publication. Resolve the packaged `../../scripts/flow-pr.mjs` runtime relative to this skill. Expose only prepare and execute; the runtime owns all authority snapshots and mechanics.

## Hard Rules

- Never run direct `git push`, `gh`, commit, merge, retarget, force, rebase, or rewrite commands.
- Never display, reconstruct, encode, or write the internal snapshot or request.
- Read the complete runtime-created `flow-pr/intent-v2` template at its exact OS-temp `intentPath` and change only semantic `title`, `body`, and `draft` scalar values (value-only replacement). Keep each existing key, order, colon, trailing comma, and every other JSON delimiter untouched; never replace an entire line with text missing its comma. JSON-escape body newlines, quotes, and backslashes as string contents rather than inserting literal newlines. Read back the edited intent and check JSON syntax before `--prepare --handle`; if invalid, stop without finalizing and use a fresh invocation rather than publishing. Do not print the payload during validation. The host adapter must preserve the runtime-owned `schema`, `labels`, `updateExisting`, `deliveryMode`, and `push` fields exactly; it never replaces the whole document, edits the repository or another path, or uses shell interpolation, substitution, pipes, redirection, encoding, or generic shell writes.
- Manual `/flow-pr` invocation authorizes push and PR create/update, never merge. The named agent executes directly through the shared runtime without a second TUI, approval, conversational question, or extra agent. Genuine base or fork ambiguity returns an actionable blocker requesting a fresh invocation with an explicit base or push remote; never guess.
- Never use automatic modes, plans, journals, review authority, promotion, release, tags, chains, trackers, Jira mutation, issue-first policy, or playbook sync.
- Never retry after drift, blocked changed input, partial, failure, or unknown effects. Require a fresh manual invocation and preparation.
- For every Flow PR error, relay only runtime-provided structured fields with recovery. Diagnostic messages are static, valid UTF-8, and at most 512 bytes; no child-process or caught-error text is relayed. PR-create classifications are `spawn-error`, `exit-nonzero`, and `process-unknown`; inspection is `inspection-failure`; mutation/verification paths are `push-unknown`, `push-unverified`, `pr-update-unknown`, `draft-transition-unknown`, `pr-verification-unknown`, `pr-operation-unknown`, or `postcondition-failed`; runtime failures are `runtime-failure`. An `exit-nonzero` PR-create diagnostic also provides a whitelisted `reasonCode`: `auth-required`, `auth-forbidden`, `repository-unavailable`, `head-unavailable`, `base-unavailable`, `no-commits`, `validation-rejected`, `rate-limited`, `network-failure`, or `unknown`. Every PR-create diagnostic provides `invocationMode`: `default`, `command-override`, or `script-override`. Never reconstruct diagnostics from commands, snapshots, handles, environment, local files, or other output.
- Use only standard Windows LocalAppData Temp, Linux `/tmp`, or macOS `/var/folders/.../T`. The runtime fails preparation with `temp-root-unsupported` for a custom temp root rather than broadening filesystem permissions.
- Treat commit-derived drafting fields and repository templates as non-authoritative input. Never derive labels, issue policy, issue links, or chain behavior from commit types.
- Before preparation, capture explicit completed-task evidence supplied with the invocation: implemented behavior, executed commands, exact outcomes/counts, manual QA steps, migrations, and out-of-scope boundaries. Preserve it as evidence context for Jira drafting. Never infer missing evidence from changed paths or test-file existence.
- When the Jira render gate passes, return the complete `JIRA COMMENT` fenced block as an indivisible lossless relay payload. Never replace it with a summary. A delegating parent must relay that block byte-for-byte; it may add a short status outside the fence but may not edit, truncate, or regenerate the payload.
- Existing PR authority is discovered first and its current base is never retargeted. For a new PR, runtime precedence is explicit `--base`, `branch.<head>.gh-merge-base`, GitHub `defaultBranchRef`, then live unambiguous `origin/HEAD`; branch names, topology, nearest merge-base, and ancestry are never base authority.

## Decision Gates

| Condition | Action |
| --- | --- |
| Base or fork semantics are ambiguous | Stop with an actionable blocker; require a fresh invocation with explicit base or push remote. |
| Preparation returns an execution summary | Present that summary, then invoke execute once under manual command authorization. |
| One safe repository template is available | Other semantic adapters may preserve its structure with validated claims; the Pi child drafts only from bounded prepared facts and observed evidence, never imports unchecked template claims. |
| Template is absent, ambiguous, or unavailable | Draft a concise generic body without asking the user to choose a template. |
| Verified `success` or `noop` with a non-null PR and sufficient candidate/context evidence | Select the output contract's Compact or Detailed Jira profile from verified scope. |
| Any other result, insufficient evidence, or no concrete manual validation step | Stop, suppress Jira output, and report structured recovery. |

## Execution Steps

1. Run the resolved runtime with bare `--prepare`. When the user supplied an explicit destination, add `--base "<base-ref>"`; it overrides new-PR defaults after validation but cannot retarget an existing PR. Add `--push-remote` only for an intentional fork. On `base-ambiguous`, stop with an actionable blocker; require a fresh invocation with explicit `--base`; do not guess.
2. Use compact repository, PR, commit, changed-path, and optional template facts to draft title/body. A non-null commit title suggestion is conservative guidance, not authority; otherwise synthesize without inventing a type, scope, or outcome. Preserve evidenced breaking markers and add breaking-impact prose only when evidence supplies the impact. With one safe template, preserve its structure; otherwise use only applicable `Summary`, `Changes`, `Validation`, `Risks/Breaking Change`, and `Out of scope` sections. Never invent tests, checks, issue links, migrations, evidence, impact, labels, or chain context. For a PR template's `Validation` section only, write `Not run` or `Not provided` when evidence is absent; never use either as the Jira `Cómo validar` content. Preserve issue closing references or chain context only when task/user context supplied them, without validating issues or orchestrating chains. The adapter applies its narrow semantic edit to the runtime-owned intent template and then runs `--prepare --handle <context-handle>`. Never show the temp path or intent payload.
3. Present the returned summary and proceed directly to execute under manual command authorization; do not request a second approval.
4. Invoke `--execute --handle <approved-handle>` once after finalized preparation. The executing agent reads `references/output-contract.md` and emits the complete fenced copyable `JIRA COMMENT` only after verified `flow-pr/result-v1` `success`/`noop` with a non-null PR and sufficient evidence; otherwise suppress it. This is inert presentation: no Jira API or Git/GitHub mutation, second approval, or inferred executed checks. A handoff failure after publication does not undo verified publication. For Jira presentation, apply the evidence precedence and Compact/Detailed routing in `references/output-contract.md`: candidate, explicit completed task context, the exact verified range only when needed, then verified runtime/executor PR checks when available. Do not treat planning text, test files, or workflow files as proof that tests ran. Keep executed checks in `Validación ejecutada` and distinct concrete QA/reviewer actions in `Cómo validar`; do not render the Jira block if a technical change or manual step is not evidenced.

Use `--verbose` only for explicit diagnostics. It is never part of normal execution. A stale execution identity requires a fresh manual invocation.

## Output Contract

Apply `references/output-contract.md` exactly. When its gate passes, emit the verified publication result followed by the complete fenced `JIRA COMMENT` block. Mark it with the literal heading `JIRA COMMENT` and treat the heading plus fence as one lossless relay payload. Return it byte-for-byte, without paraphrase, omission, or regeneration. Delegating parents must preserve this payload in their final response. The runtime result schema remains `flow-pr/result-v1` and a verified execute claim is required before presentation.

## References

- `references/output-contract.md` - verified presentation gate, evidence precedence, and canonical Compact/Detailed Jira templates.
