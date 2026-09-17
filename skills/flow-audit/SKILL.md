---
name: flow-audit
description: Read-only, stack-agnostic code-quality audit that produces advisory evidence and separate recommendations. Trigger: /flow-audit command.
trigger: /flow-audit command
---

# flow-audit

Use the runtime resource `../../scripts/flow-audit.mjs`, resolved relative to this `SKILL.md` as `$SCRIPT`.

## Safety boundary

`flow-audit` is read-only. It collects toolchain, scope, and automated-check evidence, then presents recommendations separately. It never edits files, invokes a fix workflow, requests approval, starts native review, or makes delivery decisions.

A local evidence cache may be used by `--checks-only`. It is optional, advisory, and never authoritative. Rerun checks when current evidence is needed.

## Commands

```bash
node "$SCRIPT" --auto
node "$SCRIPT" --auto --dry-run
node "$SCRIPT" --auto --scope src/features/users
node "$SCRIPT" --auto --since main
node "$SCRIPT" --checks-only
node "$SCRIPT" --detect
node "$SCRIPT" --scope --since main
node "$SCRIPT" --run-all
node "$SCRIPT" --run lint
node "$SCRIPT" --report --file <results.json>
```

`--fix` is rejected. To change files, the user must separately invoke `flow-audit-fix`; that workflow previews configured fix commands and requires the host adapter's explicit native approval for its specific execution.

## Output

Audit output uses `flow-audit-advisory-evidence/v1` where applicable. Treat `evidence` as observed data and `recommendations` as non-binding next steps. Do not report a recommendation as accepted, applied, or approved.

Present results concisely for humans:

1. overall automated status and the evidence that supports it;
2. real blocking failures;
3. non-blocking warnings or unavailable checks;
4. recommendations, clearly labeled as advisory.

Do not dump raw logs unless requested, and do not claim that checks ran when a dry run, cache, or unavailable tool was returned.
