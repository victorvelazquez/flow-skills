---
name: flow-commit
description: "Trigger: /flow-commit. Inspect changes, choose explicit work units, and execute verified Conventional Commits."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "5.0"
---

# flow-commit

## Activation Contract

Load for `/flow-commit` or a request to commit current local changes through Flow.

## Hard Rules

- Treat `scripts/flow-commit.mjs` as the Git execution source of truth.
- Inspect first with `node ~/.config/opencode/scripts/flow-commit.mjs --inspect`; inspection is read-only and ephemeral.
- The agent chooses the branch and ordered semantic units. The runtime never groups files, generates messages, retries branch names, or retains an inspection token.
- Each unit must have a Conventional title in `type(scope): outcome` form. Include a body only when it adds useful context; preserve it exactly.
- Every inspected path belongs to exactly one explicit unit. Paths must be literal, relative, non-empty, and disjoint.
- Never push, open a PR, run an audit, or invoke direct `git add` / `git commit`. The execute request is the only mutation path.
- Stop on staged changes, inspection drift, merge state, hook drift, or a branch collision. Do not retry a different branch name.

## Execution Steps

1. Run `--inspect` and read the JSON document. A `noop` result ends the workflow.
2. Compare every `changes[].path` with the intended work units. Choose `branch: {"action":"create","name":"type/slug"}` on a protected branch; otherwise use `{"action":"keep"}` unless an explicit new branch is wanted.
3. Present the exact request JSON and obtain approval for mutation.
4. Write the approved `flow-commit/request-v1` document to a temporary file (or pass it on stdin), then run:

   ```bash
   node ~/.config/opencode/scripts/flow-commit.mjs --execute --request <request.json>
   ```

5. Report the structured result. `success` has no leftovers; `partial` retains earlier verified commits and reports remaining units; all other outcomes require a new inspection.

## Output Contract

Report the inspected branch and HEAD, requested branch action, each ordered unit and exact paths, completed commit OIDs, failed/remaining units, leftovers, recovery guidance, and the next user-approved action.
