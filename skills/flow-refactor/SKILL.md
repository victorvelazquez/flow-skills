---
name: flow-refactor
description: Deterministic, read-only code-smell detection and neutral Flow Debt drafts. Trigger: /flow-refactor command.
trigger: /flow-refactor command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "3.0"
---

# flow-refactor

`flow-refactor` is a bounded source inspection. It produces deterministic JSON findings and output-only neutral drafts. It never edits a file or starts another workflow.

## Safety boundary

- Read source files only. Do not write, format, test, lint, build, install, apply, or auto-fix.
- Do not invoke an external review, delivery, approval, debt lifecycle, or agent handoff.
- Do not synthesize approval or report a finding as accepted, resolved, or applied.
- Treat every draft as advisory output. A separate, explicitly requested workflow may evaluate it later.

## Run the runtime

Resolve `$SCRIPT` from `../../scripts/flow-refactor.mjs`, relative to this `SKILL.md`.

| Invocation | Script call |
| --- | --- |
| `/flow-refactor` | `node "$SCRIPT" --scope` |
| `/flow-refactor --since` | `node "$SCRIPT" --since` |
| `/flow-refactor --since <branch>` | `node "$SCRIPT" --since <branch>` |
| `/flow-refactor --module <path>` | `node "$SCRIPT" --module <path>` |
| `/flow-refactor --scope <path>` | `node "$SCRIPT" --scope <path>` |

Pass arguments as data; never interpolate them into shell syntax. The runtime resolves scope locally and emits JSON only.

## Supported deterministic rules

The rule set is intentionally small. A finding is emitted only when its literal source evidence is present:

| Rule | Evidence |
| --- | --- |
| `debug-output` | `console.log(...)`, `console.debug(...)`, or `debugger` |
| `todo-marker` | `TODO` or `FIXME` marker |

Findings are sorted by path, line, and rule. The runtime reads only portable working-directory-relative paths so every generated draft has a valid Flow Debt `scope`.

## JSON output

The runtime returns exactly one `flow-refactor-report/v1` object with:

- `mode: "read-only"`;
- resolved, sorted `scope`;
- `status: "findings"` plus sorted `findings` and one draft per finding, or `status: "clean"`, `findings: []`, `drafts: []`, and `message: "No supported smells detected."`;
- normalized `flow-debt-draft/v1` drafts whose producer is `flow-refactor`.

Emit exactly one neutral `flow-debt-draft/v1` document per finding. `flow-refactor` does not invoke flow-debt, persist the document, or mutate storage. A draft is not previewed, approved, executed, delivered, or auto-applied. Report the JSON faithfully; do not add claims that the scope is approved or ready for delivery.
