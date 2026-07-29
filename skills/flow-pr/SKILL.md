---
name: flow-pr
description: "Trigger: /flow-pr. Inspect and publish one task-branch pull request through an explicit approved request."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "4.0"
---

## Activation Contract

`/flow-pr` is a two-phase Git/GitHub-only workflow. The skill owns semantic choices and user approval; the runtime owns deterministic argv-safe mechanics.

## Hard Rules

- Preserve the deterministic inspect, materialize, approve, and execute contract.
- Never run direct `git push`, `gh`, commit, merge, retarget, force, rebase, or rewrite commands.
- Never use `--auto`, plan IDs, journals, persistent state, promotion, release, version, tag, review authority, chains, trackers, Jira mutation, issue-first policy, or playbook sync.
- Treat the Jira block as inert presentation after verified publication, never as a Jira operation or publication dependency.

## Decision Gates

| Executor result | Action |
| --- | --- |
| Verified `success` or `noop` with a non-null PR | Render the output contract |
| `drift`, `blocked`, `partial`, `failure`, unknown, or unverified | Stop, suppress the Jira block, and report recovery |

## Execution Steps

### Inspect

Choose the target base from the task context, then run:

```bash
node "$HOME/.config/opencode/scripts/flow-pr.mjs" --inspect --base "<base-ref>"
```

Inspection has no Git or GitHub mutation. It returns the canonical repository/root identity, remote identities, task branch, base, upstream, remote relation, and matching PR facts. Stop on any nonzero result.

### Approve

Use the inspection facts to construct one strict `flow-pr/request-v1` JSON document. It must bind the full snapshot identity, target and push repositories, explicit `same-repo` or `fork` mode, head owner/ref, push/upstream intent, and requested title/body/draft/labels. Encode its unchanged UTF-8 bytes as unpadded base64url and materialize it only through:

```bash
node "$HOME/.config/opencode/scripts/flow-pr.mjs" --materialize-request --request-base64 "<base64url>"
```

This command writes only a new OS-temporary request file and returns its path plus the parsed request. Do not use shell redirection, generic writes, or edits.

Present the exact request returned by materialization to the user and ask for approval. Do not infer fork mode. Do not execute until the user approves that exact request.

### Execute

After approval, run only with the returned temporary path:

```bash
node "$HOME/.config/opencode/scripts/flow-pr.mjs" --execute --request "<returned-temp-path>"
```

The runtime re-inspects every authority, performs only an ordinary non-force branch push when needed, then creates, updates, or noops one exact PR and verifies its postconditions. On `drift`, `blocked`, `partial`, `failure`, or an unknown effect, stop. Recovery requires a fresh inspection and a new approved request.

## Output Contract

After execution, apply `references/output-contract.md` exactly. Return only concise publication status plus its complete fenced `JIRA COMMENT` block when the render gate passes. Preserve that block verbatim in every parent-facing handoff. Optional labels remain request data only; repository-specific issue/type-label policy is outside core success.

## References

- `references/output-contract.md` - verified presentation gate, evidence rules, and historical Jira template.
