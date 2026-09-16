---
name: flow-playbook-compare
description: Read-only playbook comparison that reports neutral, deterministic replacement candidates. Trigger: /flow-playbook-compare command.
trigger: /flow-playbook-compare command
---

# flow-playbook-compare

Trigger: user runs `/flow-playbook-compare [--playbook-path <path>]`.

Runtime resource: `../../scripts/flow-playbook-compare.mjs`, resolved relative to this `SKILL.md` by the active host adapter. Store the resolved path as `$SCRIPT`.

## Command

```bash
node "$SCRIPT" --playbook-path <path>
```

Without `--playbook-path`, the runtime resolves exactly one playbook directory:

1. CLI `--playbook-path`
2. `.flow/playbook.json` with `{ "playbookPath": "<path>" }`
3. `FLOW_PLAYBOOK_PATH`

An invalid selected source fails closed; it never falls through to a lower-priority source. Missing configuration returns a neutral `unavailable` report with zero candidates.

## Output and restrictions

- The JSON report is deterministic: candidates are sorted by path and are neutral advisory `playbook-document` entries.
- Present candidates as optional guidance; do not imply approval, authority, or required replacement.
- The workflow only reads configuration and playbook documents.
- NEVER invoke `flow-pr`, apply, delivery, approval, or mutation actions.
- `flow-playbook-sync` remains a separate workflow.
