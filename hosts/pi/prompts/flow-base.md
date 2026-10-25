---
description: Run the Flow Base workflow through its supervised Pi subagent.
argument-hint: "[branch-or-alias | list] [--stash]"
---

Use `subagent_run` to delegate the complete workflow to the `flow-base` Pi/Gentle subagent with `mode: "task"`. Forward the user's complete arguments (`$ARGUMENTS`) and all relevant current conversation and working-directory context unchanged. Do not execute, restate, or supplement the workflow logic in this template.
