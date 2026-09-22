---
description: Run the Flow Commit workflow through its supervised Pi subagent.
argument-hint: "[instructions]"
---

Use `subagent_run` to delegate the complete workflow to the `flow-commit` Pi/Gentle subagent with `mode: "task"`. Forward the user's complete arguments (`$ARGUMENTS`) and all relevant current conversation and working-directory context unchanged. Do not execute, restate, or supplement the workflow logic in this template.
