# flow-skills

A versioned repository of `flow-*` AI skills for [OpenCode](https://opencode.ai). Share and install git workflow automation across machines and teams.

## What's included

| Skill            | Description                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `flow-audit`     | Code quality audit — lint, typecheck, tests, security, AI review                  |
| `flow-branch`    | Interactive branch switcher with pull prompt and cleanup                          |
| `flow-build`     | Universal documentation builder (15-17 docs across 11 phases)                     |
| `flow-commit`    | Git workflow automation — Conventional Commits, atomic commits, branch protection |
| `flow-docs-sync` | Incremental documentation sync — detects changes, updates affected docs           |
| `flow-finish`    | Generate professional PR description + Jira comment                               |
| `flow-release`   | Semantic versioning + CHANGELOG + git tag + push                                  |
| `flow-skills-sync` | Manage this repo — publish, update, or install skills conversationally          |

## Install

### Quick path

```bash
git clone https://github.com/victorvelazquez/flow-skills.git ~/Developer/Tools/flow-skills
cd ~/Developer/Tools/flow-skills
node install.mjs
```

The command is a read-only preview. Confirm that `configuration.ready` is `true`, then run the exact `applyCommand` printed by the preview. Restart OpenCode after apply.

The bootstrap installs only the committed Flow generation at repository `HEAD`. It preserves `opencode.json` byte-for-byte and uses a verified backup plus transactional apply.

### Update after pulling

```bash
cd ~/Developer/Tools/flow-skills
git pull
node install.mjs # preview the new HEAD, then run its exact applyCommand
```

### Or use the AI skill

After installing, use `/flow-skills-sync` for status, snapshots, and historical restores.

## Commands

```bash
node install.mjs             # preview HEAD without changes
node install.mjs --dry-run   # compatibility alias for preview
node install.mjs --destination <path>
node install.mjs --help
```

`--export`, `--update`, `--uninstall`, and historical `--ref` workflows are intentionally rejected. Use `/flow-skills-sync` for live-to-repository snapshots and historical restores.

## Requirements

- Node.js 18+ (ESM, zero external dependencies)
- OpenCode installed at `~/.config/opencode/`
