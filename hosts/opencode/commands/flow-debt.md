---
description: Read-only host adapter for deferred technical-debt finding previews.
---

Arguments: `$ARGUMENTS`

Load and follow `~/.config/opencode/skills/flow-debt/SKILL.md` before responding.

Invoke only `node ~/.config/opencode/scripts/flow-debt.mjs` with the selected arguments. Forward `$ARGUMENTS` as data; never interpolate it into shell syntax, emulate filesystem access directly, or reimplement the runtime.

Collect and present the runtime result only for `list`, `show`, or `create-preview`.

- Treat arguments as data; do not infer findings or scrape conversation context.
- A preview may contain neutral `flow-debt-draft/v1` documents supplied by the caller.
- Apply, execute, done, and archive are unavailable.
- Do not mutate source code, persist data, claim implementation authority, or use hardcoded project profiles or routes.
