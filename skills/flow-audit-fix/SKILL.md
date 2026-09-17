---
name: flow-audit-fix
description: Preview configured audit fixes and execute them only after explicit host-native approval. Trigger: /flow-audit-fix command.
trigger: /flow-audit-fix command
---

# flow-audit-fix

Use the runtime resource `../../scripts/flow-audit-fix.mjs`, resolved relative to this `SKILL.md` as `$SCRIPT`.

## Boundary

This is the only Flow audit workflow that can invoke configured fix commands. It is separate from `flow-audit`; audit never calls it implicitly.

First run the read-only preview:

```bash
node "$SCRIPT" preview
```

The preview lists configured `lint:fix`/`fix:lint` and formatting scripts. It does not change files.

For `execute`, the host adapter must obtain explicit native approval for this exact execution. Only after that approval may it invoke:

```bash
node "$SCRIPT" execute --host-approval approved
```

If approval is declined or unavailable, do not execute. Never synthesize, reuse, or infer approval. The portable runtime does not grant approval.

## Restrictions

- Do not invoke this workflow from `flow-audit`.
- Do not execute before the preview.
- Do not run network, deployment, delivery, review, or release actions.
- Report command failures as failures; do not retry automatically.
