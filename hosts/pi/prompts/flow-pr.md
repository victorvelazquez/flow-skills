---
description: Run the Flow PR workflow through its supervised Pi subagent.
argument-hint: "[instructions]"
---

Use `subagent_run` to delegate the complete workflow to the `flow-pr` Pi/Gentle subagent with `mode: "task"`. Forward the user's complete arguments (`$ARGUMENTS`) and all relevant current conversation and working-directory context unchanged. Do not execute, restate, or supplement the workflow logic in this template.
