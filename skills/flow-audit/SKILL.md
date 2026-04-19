---
name: flow-audit
description: Stack-agnostic code quality audit — uses the runtime script as the source of truth for tool detection, scope resolution, automated checks, and dry-run previews, while the agent performs the final LLM review. Trigger: /flow-audit command.
trigger: /flow-audit command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-audit

Trigger: user runs `/flow-audit`

Script path:

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-audit.mjs'))"
```

Store result as `$SCRIPT`.

## Default Behavior

This skill is **hybrid**.

- The script is the source of truth for detection, scope, and automated checks
- The agent still performs the final code-review judgment and summary
- Happy path: `--auto`
- Safe preview: `--auto --dry-run`

## Primary Commands

### Full automated context + checks

```bash
node "$SCRIPT" --auto
```

### Safe preview without running tools

```bash
node "$SCRIPT" --auto --dry-run
```

### Optional scoping

```bash
node "$SCRIPT" --auto --scope src/features/users
node "$SCRIPT" --auto --since main
```

## What the script handles

- toolchain detection
- scope detection
- monorepo warnings
- running lint/typecheck/test/format/coverage/security
- aggregated pass/fail/error/skipped reporting
- auto-fix commands when explicitly requested later

## What the agent still does

- read the in-scope files
- perform the LLM review (correctness, security, performance, maintainability, test gaps)
- synthesize automated findings + review findings into a concise audit result
- decide whether to propose `/flow-audit --fix` style follow-up actions

## Response Rules

- If `--auto` succeeds, summarize automated results first, then do the code review
- If `--auto --dry-run` was used, do not pretend tools ran; treat it as planning/context only
- If automated checks fail, include that in the report but still perform the LLM review when useful
- Ask the user only if the script errors in a blocking way or if they need to choose whether to apply fixes
- Present the final answer for humans, not as raw machine output
- Default to Spanish for all explanatory text when the user speaks Spanish
- Keep code, commands, variable names, function names, rule names, file paths, and literal tool output in their original language
- NEVER dump raw JSON unless the user explicitly asks for it
- NEVER lead with full raw tool logs; summarize first
- Separate clearly: blocking errors, non-blocking warnings, acceptable noise, and recommended next steps
- Explicitly explain the real impact of each relevant finding in plain language

## Human Presentation Rules

When responding after running the script, transform the automated results into a concise, human-readable report.

### Language

- Spanish user → respond in Spanish
- English user → respond in English
- Preserve identifiers/code exactly as written

### Prioritization

Always distinguish these categories:

1. **Errores reales / blocking issues**
2. **Warnings importantes pero no bloqueantes**
3. **Ruido técnico / warnings tolerables** (for example, `any` in tests when not a production risk)
4. **Siguiente paso recomendado**

### Required Output Format

Use this structure by default after every successful or failed `flow-audit` run:

```md
## Estado general

- PASS / FAIL / SKIP
- Qué significa en una oración

## Qué falló de verdad

- Lista corta de errores reales con:
  - archivo
  - impacto
  - si bloquea o no

## Warnings importantes

- Solo warnings con impacto real o riesgo razonable

## Qué podés ignorar por ahora

- Ruido técnico o warnings no bloqueantes

## Revisión LLM

- Hallazgos de correctness / security / performance / maintainability / test gaps

## Próximo paso recomendado

- Acción concreta y priorizada
```

### Interpretation Rules

- If automated checks are `PASS` but warnings remain, explain that the project is passing and that the warnings are follow-up work, not blockers
- If only test warnings remain, say so explicitly
- If a finding is uncertain, say that it is uncertain instead of presenting it as fact
- If there are no real issues, explicitly say: "No encontré problemas reales bloqueantes"
- Reduce repetition: do not restate the same issue in both automated and LLM sections unless new context is added
- Prefer short explanations of impact over long copied logs
- Quote only the minimal raw output needed to support a claim

### Anti-Patterns

- Do NOT paste large raw stdout/stderr blocks into the main answer
- Do NOT mix warnings and errors in the same bullet list
- Do NOT describe lint/test/typecheck output as if it were equally important to architectural findings
- Do NOT make the user infer whether something blocks release; state it explicitly

## Fallback / Debug Commands

Use these only for debugging or narrower recovery flows:

```bash
node "$SCRIPT" --detect
node "$SCRIPT" --scope --since main
node "$SCRIPT" --run-all
node "$SCRIPT" --run lint
node "$SCRIPT" --fix --auto-only
```

## Restrictions

- NEVER manually recreate detection/scope logic when `--auto` can do it
- NEVER claim tests/lint/typecheck passed unless the script actually ran them
- NEVER skip the LLM review entirely; this skill is intentionally hybrid
