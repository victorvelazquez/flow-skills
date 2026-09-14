---
name: flow-debt
description: Host-neutral read-only contract for deferred technical-debt finding previews. Trigger: flow-debt list, show, or create-preview.
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-debt

Current availability: contract preparation pending runtime registration.

## Contract

`flow-debt` is a host-neutral, read-only contract for deferred findings. Its only allowed intents are `list`, `show`, and `create-preview`.

- `list` and `show` only describe the request; `create-preview` shows non-executable, caller-supplied `flow-debt-draft/v1` documents.
- Accept only explicit caller input. Do not infer findings, scrape conversation context, or claim access to prior requests.
- Apply, execute, done, and archive are unavailable; runtime registration is pending, so do not claim a path or command.
- Do not mutate source code, persist data, claim implementation authority, interact with the filesystem, or use hardcoded project profiles or routes.

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
