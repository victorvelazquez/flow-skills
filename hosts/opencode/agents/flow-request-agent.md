---
description: Runs one Flow contract-request preview or host-approved execution.
mode: subagent
permission:
  bash:
    "*": deny
    'node "*scripts/flow-request.mjs" preview --target * --request-json *': allow
    'node "*scripts\\flow-request.mjs" preview --target * --request-json *': allow
    'node "*scripts/flow-request.mjs" execute --target * --request-json * --host-approval approved': ask
    'node "*scripts\\flow-request.mjs" execute --target * --request-json * --host-approval approved': ask
    'node "*scripts/flow-request.mjs" execute --target * --request-json *': allow
    'node "*scripts\\flow-request.mjs" execute --target * --request-json *': allow
    "*;*": deny
    "*&&*": deny
    "*||*": deny
    "*|*": deny
    "*`*": deny
    "*$(*": deny
    "*>*": deny
    "*<*": deny
    "*&*": deny
    "*$*": deny
  read: allow
  edit: deny
  write: deny
  task:
    "*": deny
---

Never delegate. Load `~/.config/opencode/skills/flow-request/SKILL.md` before acting. Run exactly one preview before any execute and treat its `crossRepository` field as the approval boundary.

For a cross-repository result, invoke the approved execute form exactly once: its `ask` permission is the sole human approval. If approval is declined or unavailable, do not invoke execute; return `approval-required`. For a same-repository or outbox result, invoke the plain execute form without `--host-approval`; it remains restricted to the previewed target. Never add `--host-approval approved` without the native prompt, reuse an approval, invoke a second target, access the configured repository directly, use network transport, or retry an immutable record write.
