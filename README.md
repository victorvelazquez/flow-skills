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
| `flow-skills`    | Manage this repo — publish, update, or install skills conversationally            |

## Install

### First time on a new machine

```bash
git clone https://github.com/victorvelazquez/flow-skills.git ~/Developer/Tools/flow-skills
cd ~/Developer/Tools/flow-skills
node install.mjs
```

Restart OpenCode. All `/flow-*` commands are now available.

### Update after pulling

```bash
cd ~/Developer/Tools/flow-skills
git pull
node install.mjs
```

### Or use the AI skill

After installing, just type `/flow-skills` in OpenCode — it will detect context and offer to publish, update, or install for you.

## Publish local changes

```bash
node install.mjs --export   # copies opencode → repo, shows what changed
git diff                     # review
git add <files>              # stage what you want
git commit -m "feat(...): ..."
git push
```

Or use `/flow-skills` in OpenCode for a guided conversational flow.

## Other commands

```bash
node install.mjs             # install repo → ~/.config/opencode/
node install.mjs --export    # export ~/.config/opencode/ → repo
node install.mjs --dry-run   # preview without changes
node install.mjs --uninstall # remove all flow-* from opencode
node install.mjs --help      # show usage
```

## Requirements

- Node.js 18+ (ESM, zero external dependencies)
- OpenCode installed at `~/.config/opencode/`
