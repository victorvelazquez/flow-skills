---
name: flow-debt
description: Host-neutral read-only contract for deferred technical-debt finding previews. Trigger: flow-debt list, show, or create-preview.
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-debt

## Contract

`flow-debt` is a host-neutral, read-only contract for deferred findings. Its only allowed intents are `list`, `show`, and `create-preview`.

In Pi, resolve `../../scripts/flow-debt.mjs` relative to this `SKILL.md`, then invoke it with explicit caller arguments as data. Do not derive the runtime path from the project working directory.

- `list` and `show` read existing canonical debt records; `create-preview` validates caller-supplied `flow-debt-draft/v1` documents and returns a non-executable preview.
- Accept only explicit caller input. Do not infer findings, scrape conversation context, or claim access to prior requests.
- Apply, execute, done, and archive are unavailable.
- Do not mutate source code, persist data, claim implementation authority, or use hardcoded project profiles or routes.

## Neutral draft document

A deferred finding is represented only as a `flow-debt-draft/v1` document. The exact document fields are:

```json
{
  "schema": "flow-debt-draft/v1",
  "title": "<title>",
  "problem": "<problem>",
  "priority": "p2",
  "severity": "medium",
  "scope": ["<relative-path>"],
  "acceptanceCriteria": ["<observable-condition>"],
  "verification": ["<read-only-check>"],
  "producer": {
    "kind": "<producer-kind>",
    "reference": "<producer-reference>"
  },
  "evidence": [
    {
      "reference": "<evidence-reference>",
      "summary": "<evidence-summary>"
    }
  ]
}
```

The document is a preview artifact only.
