---
name: flow-docs-sync
description: Incremental documentation sync — detects codebase changes vs last snapshot and updates affected docs + Mermaid diagrams
trigger: /flow-docs-sync command
---

# flow-docs-sync

Trigger: user runs `/flow-docs-sync`

Script path:

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-docs-sync.mjs'))"
```

Store result as `$SCRIPT`. Use it in all commands below.

---

## Stage 1 — Snapshot & Diff (Script)

```
node "$SCRIPT" --diff
```

Parse JSON: `{ cacheExists, changed, unchanged, current }`.

- If `cacheExists: false` → no prior baseline; treat ALL docs as needing full sync.
  Do NOT run `--snapshot` separately — `--diff` already includes `current` in the JSON.
- `changed[].file` → doc paths that need updating; `changed[].changes` → what changed.
- `unchanged[]` → skip these docs.

---

## Stage 2 — Report & Confirm (LLM)

Present a structured change report to the user:

```
CHANGES DETECTED:

Docs requiring update:
- <file> (<reason>: <changes>)

No changes: <unchanged files>

Update all detected documents? (Y/N)
```

If no changes: `Documentation is already synchronized with the current codebase.`

Wait for user confirmation before proceeding.

---

## Stage 3 — Update Docs (LLM)

For each file in `changed[]`, read it then apply **incremental updates only**:

| File                       | What to update                                                            |
| -------------------------- | ------------------------------------------------------------------------- |
| `docs/components.md`       | Add/remove components; regenerate component hierarchy diagram             |
| `docs/state-management.md` | Add/remove stores and hooks; update state flow diagrams                   |
| `docs/styling.md`          | New/removed CSS files, theme changes, design token updates                |
| `ai-instructions.md`       | New/updated dependencies in tools section                                 |
| `docs/architecture.md`     | Route changes (added/removed paths); update routing/architecture diagrams |
| `specs/configuration.md`   | New environment variables                                                 |
| `docs/testing.md`          | New/removed test files, new test patterns detected                        |

Rules: preserve unchanged content · follow existing format · **create file from scratch if it doesn't exist**

---

## Stage 4 — Update Cache (Script)

After all docs are updated, run:

```
node "$SCRIPT" --update-cache
```

Confirm `ok: true` in the JSON output.

---

## Mermaid Diagram Rules

When regenerating diagrams in any doc:

- Code fence must be exactly ` ```mermaid ` (lowercase, no extra spaces)
- **Component hierarchy** (`graph TD`): Pages → Organisms → Molecules → Atoms; color by level
- **State management** (`graph LR` or `sequenceDiagram`): show all state types with their tool labels
- **Routing** (`graph TD`): full route tree, separate public/protected, show route params
- **Architecture** (`graph TB`): Frontend layers (UI / State / API) + External services

Color standards: Pages `#e1f5ff` · Organisms `#fff4e6` · Molecules `#e8f5e9` · Atoms `#fce4ec`

---

## Output Format

After completing all updates:

```
DOCUMENTATION UPDATED:

- <file>: <summary of changes>
- ...

docs-analysis.json updated (timestamp: <ISO>)
```

---

## Restrictions

- **Only modify sections that changed** — never rewrite entire documents
- Never run `--update-cache` before the user confirms (Stage 2)
- If `docs-analysis.json` is corrupted, run `--snapshot` to inspect current state, then proceed as if `cacheExists: false`
