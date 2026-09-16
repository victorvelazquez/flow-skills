---
name: flow-debt
description: Host-neutral prepared execution contract for deferred technical-debt findings. Trigger: flow-debt list, show, create-preview, prepare, execute, or recover.
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "2.0"
---

# flow-debt

## Contract

`flow-debt` provides host-neutral debt discovery plus prepared `create`, `done`, and `archive` transitions. Resolve `../../scripts/flow-debt.mjs` relative to this `SKILL.md`; invoke it with explicit caller arguments as data, never from a project-relative runtime path.

- `list`, `show`, and `create-preview` remain read-only.
- `prepare-create --draft-json <json>`, `prepare-done --id <id>`, and `prepare-archive --id <id>` return an opaque self-contained preparation handle without writing.
- `execute --handle <handle> --host-approval approved` applies only a current, integrity-protected preparation. A replay reports `already-applied`; a stale preparation reports `stale` without writing.
- `recover --handle <handle>` is read-only and returns exactly `already-applied`, `safely-retryable`, or `unknown`. It never retries automatically.
- A host adapter owns approval. The portable skill and runtime never prompt, infer consent, or treat conversation text as approval. The host must request one immediate native mutation approval before supplying `--host-approval approved`; on decline or unavailable approval, it must not invoke `execute`.
- Treat handles as opaque. Do not edit, decode, log, or reconstruct them. Do not retry a stale or unknown result; prepare again only through fresh explicit input.
- Do not mutate source code, claim implementation authority, use hardcoded project profiles or routes, install, deploy, reconcile, release, or invoke unrelated workflows.

## Neutral draft document

A create preparation accepts only a `flow-debt-draft/v1` document:

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

## Manual neutral draft

Manually author this exact neutral v1 document before any Flow lifecycle. It is
input data, not a command or approval.

```json
{
  "schema": "flow-debt-draft/v1",
  "title": "Document unclear retry behavior",
  "problem": "The current behavior is unclear when a retry is requested.",
  "priority": "p2",
  "severity": "medium",
  "scope": ["scripts/example.mjs"],
  "acceptanceCriteria": ["Document the retry outcome."],
  "verification": ["Read the documented retry outcome."],
  "producer": {
    "kind": "manual",
    "reference": "local-observation"
  },
  "evidence": [
    {
      "reference": "manual:local-observation",
      "summary": "Observed behavior needs documentation."
    }
  ]
}
```

Replace values only with observed local evidence. Pass the complete document as
JSON data to `create-preview --draft-json <json>`. Inspect the returned candidates
before any lifecycle.
