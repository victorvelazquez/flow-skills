# flow-skills project context

`flow-skills` is a versioned distribution of OpenCode workflow skills. It combines human-readable command, agent, and skill contracts with deterministic Node.js executors for Git workflows, audits, documentation, asset synchronization, and installation.

## Quick reference

| Topic | Current repository evidence |
| --- | --- |
| Runtime | Node.js 18+; ECMAScript modules (`"type": "module"`) |
| Dependencies | No runtime dependencies declared in `package.json` |
| Test runner | Built-in `node:test` with `node:assert/strict` |
| Strict TDD command | `node --test tests/*.test.mjs` |
| Focused TDD command | `node --test tests/<affected>.test.mjs` |
| Full-suite scope | 11 files matching `tests/*.test.mjs` |
| Artifact store | OpenSpec under `openspec/` |
| Delivery policy | `ask-on-risk`, with a 400 changed-line review budget |
| Default branch | `main` |

## Product boundaries

### What this repository owns

- `commands/`: user-facing OpenCode command entry points.
- `agents/`: specialized agent contracts used by commands.
- `skills/`: reusable `flow-*` skill instructions and phase references.
- `scripts/`: executable JavaScript CLIs and orchestration logic.
- `scripts/lib/`: shared detection, safety, process, cache, and Flow PR modules.
- `install.mjs`: preview-first, verified installation of the committed asset generation.
- `flow-assets.json`: the managed asset inventory.
- `flow-assets.lock.json`: integrity and generation metadata for managed assets.
- `tools/flow-assets.mjs`: asset-manifest and lock maintenance tooling.
- `tests/`: behavioral, integration-style, and contract tests.

### What is supporting guidance

`playbook/` contains shared, cross-project engineering guidance. Its NestJS, React, Jest, Vitest, and Playwright examples describe possible consumer stacks; they are not evidence that `flow-skills` itself uses those frameworks.

### What SDD may change

OpenSpec phases may create and update artifacts under `openspec/`. Product source changes require an approved change scope and must follow the strict TDD workflow in `openspec/config.yaml`.

## Architecture

```text
OpenCode user
  -> commands/flow-*.md
  -> agents/*.md and skills/flow-*/SKILL.md
  -> scripts/flow-*.mjs
  -> scripts/lib/*.mjs
  -> Git, GitHub CLI, filesystem, or managed OpenCode destination

install.mjs / tools/flow-assets.mjs
  -> flow-assets.json
  -> flow-assets.lock.json
  -> verified installed asset tree
```

The command, agent, and skill Markdown files define interaction and permission contracts. JavaScript executors own deterministic inspection and effects. Asset metadata connects committed source to installed copies and must be reconciled when managed assets change.

## Implementation conventions

- Use native ECMAScript modules and Node.js standard-library APIs.
- Prefer zero additional runtime dependencies unless a proposal explicitly justifies one.
- Keep filesystem, Git, and process operations deterministic, bounded, and cross-platform.
- Pass hostile or user-controlled values as exact argv elements rather than shell-interpolated text.
- Preserve preview/inspect before mutation and verify postconditions after effects.
- Use structured JSON for machine-facing CLI results where an existing command establishes that contract.
- Keep tests behavioral; temporary directories, local/bare Git repositories, and fake external executables are established integration-test patterns.
- Treat Windows permission, symlink, and executable-bit limitations explicitly with capability-based skips.
- Technical OpenSpec artifacts are written in English.

## Testing

### Commands

```bash
# Focused RED/GREEN/REFACTOR loop
node --test tests/<affected>.test.mjs

# Canonical strict TDD and final verification command
node --test tests/*.test.mjs

# Available built-in coverage reporting (no threshold is configured)
node --experimental-test-coverage --test tests/*.test.mjs
```

There is no `npm test` script, lint script, typecheck script, committed CI workflow, or configured coverage threshold. Do not report those checks as available. The full suite has historically taken several minutes because some tests create repositories and exercise process-level workflows, so use focused tests during implementation and reserve the full command for verification.

A representative current smoke check was run during initialization:

- `node --test tests/flow-pr-drafting.test.mjs`
- Result: exit 0; 10 passed, 0 failed, 2 capability-based skips.

## SDD operating rules

1. Inspect current repository evidence and existing OpenSpec artifacts before planning.
2. Define observable acceptance scenarios before product implementation.
3. Apply strict TDD: RED, GREEN, TRIANGULATE when needed, REFACTOR, then full VERIFY.
4. Keep focused test evidence in task/apply artifacts; skipped or aborted checks are not passes.
5. Forecast changed lines and review areas before implementation.
6. With `ask-on-risk`, pause if the forecast exceeds 400 changed lines or requires multiple review areas. Never infer `size:exception`.
7. Preserve human gates for consent, authorization, security-sensitive actions, destructive actions, publishing, and ambiguous scope.
8. Preserve existing historical change artifacts rather than rewriting them to match a new change.

## Existing project metadata

- `.atl/skill-registry.md` exists and indexes project and user skills.
- `.codegraph/` exists and was current at initialization (34 indexed JavaScript files).
- Existing OpenSpec change histories are present under `openspec/changes/simplify-flow-commit/` and `openspec/changes/simplify-flow-pr/`.
- `package.json` currently declares version `0.3.1` and an empty `scripts` object.

## Known risks

- Asset-bearing source changes can drift from `flow-assets.json` or `flow-assets.lock.json`; verify all affected mirror records together.
- Generic playbook documentation can be mistaken for repository-local tooling; use executable files, package metadata, and tests as authoritative stack evidence.
- The full test suite may be slow; avoiding it entirely weakens verification, while running it on every TDD step wastes time.
- Platform-specific filesystem behavior can produce legitimate skips; review skip reasons rather than treating every skip as a defect.
