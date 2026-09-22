---
description: Run the Flow Branch workflow through its supervised Pi subagent.
argument-hint: "[branch-or-alias]"
---

Use `subagent_run` to delegate the complete workflow to the `flow-branch` Pi/Gentle subagent with `mode: "task"`. Forward the user's complete arguments (`$ARGUMENTS`) and all relevant current conversation and working-directory context unchanged. Do not execute, restate, or supplement the workflow logic in this template.
