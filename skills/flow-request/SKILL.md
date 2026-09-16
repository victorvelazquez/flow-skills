---
name: flow-request
description: Preview and host-approved delivery of one contract request to one configured local repository. Trigger: /flow-request command.
trigger: /flow-request command
license: Apache-2.0
---

# flow-request

Use the runtime resource `../../scripts/flow-request.mjs`, resolved relative to this file as `$SCRIPT`.

## Configuration

The requester repository owns `.flow/contract-targets.json`:

```json
{
  "schema": "flow-contract-targets/v1",
  "targets": {
    "api": { "path": "../api" }
  }
}
```

The top-level object permits only `schema` and `targets`. Each target key is lowercase kebab-case and identifies exactly one local repository path; UNC and normalized `//` network paths are rejected. The runtime makes no network request. Invalid configuration fails closed.

## Preview

Run exactly one target and JSON-object request:

```bash
node "$SCRIPT" preview --target <target-key> --request-json '<json-object>'
```

Preview is read-only. Present its deterministic candidate, delivery (`target` or requester-local `outbox`), and whether the available target is cross-repository. Do not treat preview as approval.

## Execute

For a same-repository target or unavailable-target outbox fallback, run the same single-target command with `execute`. For a cross-repository target, the host adapter must obtain its native approval for that specific execution first. Only after it grants approval may the adapter invoke:

```bash
node "$SCRIPT" execute --target <target-key> --request-json '<json-object>' --host-approval approved
```

If approval is declined or unavailable, do not invoke execute and report `approval-required`. Never invent approval, reuse an approval for another target or request, or execute multiple targets.

A successful target delivery writes one immutable JSON record under the target's `.flow/inbox/`. An unavailable local target writes the same immutable record under requester-local `.flow/outbox/`. A repeated identical record is not overwritten.

## Restrictions

- Do not use network transport, remote APIs, or a non-local configured target.
- Do not write a target record during preview.
- Do not imply that an outbox record was delivered to the unavailable target.
- Do not invoke SDD, PR, delivery, or other workflow actions.
