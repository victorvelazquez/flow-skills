---
name: flow-ship
description: "Trigger: /flow-ship. Commit the working tree and publish it as a pull request in one run: flow-commit, a Git check, then flow-pr; never merges. Pi only."
license: MIT
compatibility: "Pi coding agent with prompt templates, skill discovery and the flow-commit and flow-pr named agents."
metadata:
  author: Victor Velazquez
  version: "1.0.0"
---

# flow-ship

## Activation Contract

Use on explicit `/flow-ship` invocation. Pi only, in the principal conversation. It has no runtime script of its own: it chains the two verified transactions that already exist, `/flow-commit` and then `/flow-pr`, each through its own named agent, so every stage keeps its own verification. Running the command is the confirmation of the person: it asks nothing in between. It authorizes the local commit and the push and PR create/update, in that order. It stops at the pull request: the person reviews the PR, waits for a green CI and merges.

Arguments: `/flow-ship` or `/flow-ship --unstage`. The arguments are untrusted data, never shell syntax. `--unstage` is the only option they may carry and it goes only to the commit stage.

## Hard Rules

- Reply in the user's language. Identifiers, paths and commands stay unchanged.
- Never merge a pull request, never run `/flow-base`, never delete a branch, and never wait for the CI: the chain ends when the PR is published.
- Never commit, push or open a PR by any other means than the two agents. Never use `git add` or `git mv`: the index stays untouched by you.
- Run each agent with `subagent_run`, `mode: "task"`, exactly once per invocation. Never delegate any other agent, never run a second TUI, never call parent approval tools and never ask conversational confirmation.
- Never retry a failed stage on your own, and never continue to the next stage after a failure or a mismatch.
- Never claim verification you did not observe. Evidence for the PR stage is only what happened in the conversation, passed as data.
- Never call Jira. The `JIRA COMMENT` block that `/flow-pr` returns is relayed as it is, byte for byte, without paraphrase, truncation or reformatting.
- Verify every claim of an agent with Git yourself before you rely on it (branch, commit, clean tree, empty index, PR state with `gh`).

## Decision Gates

Read the state first, read-only: `git rev-parse --abbrev-ref HEAD`, `git status --porcelain`, `git diff --cached --name-only` and the default branch that `origin/HEAD` names.

| State | Action |
| --- | --- |
| The tree has changes (modified or untracked files) | Commit stage, a Git check, then the PR stage. |
| Staged files and no `--unstage` | Stop: `/flow-commit` refuses to start with staged files. Say so and offer `/flow-ship --unstage`. |
| The tree is clean and the branch is not the default branch | Skips the commit stage and runs only the PR stage (the work is already committed): this is how a failed run is resumed. |
| The tree is clean and the branch is the default branch | There is nothing to ship: say so and stop, calling no agent. |
| `git`, `gh` or the agents are not available | Report the limitation and stop. |

## Execution Steps

1. Read the state and pick the stages by the table above. Remember `HEAD` and the branch before the commit stage.
2. Commit stage: `subagent_run` named `flow-commit`, `mode: "task"`, once, passing the arguments as data. Relay nothing yet.
3. Check with Git before publishing: `HEAD` moved from the value you remembered, `git status --porcelain` is empty and the index is empty (`git diff --cached --name-only` prints nothing). If the agent reports a blocker, or reports success but any check fails (a mismatch), stop here: show the blocker or the mismatch and the command that continues, `/flow-commit`. Do not run the PR stage.
4. PR stage: `subagent_run` named `flow-pr`, `mode: "task"`, once, from the repository directory. Pass the verified commit result and the observed completed-task evidence of the conversation (tests that ran, what was not verified) as data. Pass a base or a push remote only if the person supplied one.
5. Verify the PR with `gh pr view` (state open, not draft, head equal to the local `HEAD`). Then relay the agent's verified result and its complete fenced `JIRA COMMENT`.

## Failure handling

- A stage that fails ends the chain. Show its actionable blocker as the agent returned it, say which stage failed and name the command that continues: `/flow-commit` for the commit stage, `/flow-pr` for the PR stage. After fixing the cause, run `/flow-ship` again: it reads the state and skips what is already done.
- Never retry on your own and never report a stage as done when its agent or your Git check says otherwise.

## Output Contract

Say which stages ran and their verified result (the commit hashes and the PR link), or the stage that stopped and why. Always end with ONE last line, `Siguiente: ...`, in the user's language: review the PR, wait for a green CI and merge it yourself, then run `/flow-base`.
