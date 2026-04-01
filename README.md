# flow-skills

A versioned repository of `flow-*` AI skills for [OpenCode](https://opencode.ai). Git workflow automation, documentation generation, and code quality tools — shareable across machines and teams.

## What's included

| Skill | Trigger | Description |
| ----- | ------- | ----------- |
| `flow-audit` | `/flow-audit` | Stack-agnostic code quality audit — automated lint, typecheck, tests, security checks, and LLM review |
| `flow-branch` | `/flow-branch` | Interactive branch switcher — list, checkout, and delete branches with pull prompt |
| `flow-build` | `/flow-build` | Universal documentation builder — 15-17 docs across 11 phases for any project type |
| `flow-commit` | `/flow-commit` | Git workflow automation — Conventional Commits, atomic grouping, protected-branch handling |
| `flow-docs-sync` | `/flow-docs-sync` | Incremental documentation sync — detects what changed and updates only affected docs |
| `flow-playbook-sync` | `/flow-playbook-sync` | Bidirectional sync between a project's implementation state and the shared engineering playbook |
| `flow-pr` | `/flow-pr` | Push branch and create a GitHub PR — production guardrails, PR description generation |
| `flow-skills-sync` | `/flow-skills-sync` | Manage this repo — publish local changes, pull updates, or install on a new machine |

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

After installing, type `/flow-skills-sync` in OpenCode — it detects context and offers to publish, update, or install automatically.

## Publish local changes

```bash
node install.mjs --export   # copy opencode → repo, show what changed
git diff                     # review
git add <files>              # stage what you want
git commit -m "feat(...): ..."
git push
```

Or use `/flow-skills-sync` in OpenCode for a guided conversational flow.

## CLI reference

```bash
node install.mjs             # install repo → ~/.config/opencode/
node install.mjs --export    # export ~/.config/opencode/ → repo
node install.mjs --dry-run   # preview without making changes
node install.mjs --uninstall # remove all flow-* from opencode
node install.mjs --help      # show usage
```

## Requirements

- Node.js 18+ (ESM, zero external dependencies)
- OpenCode installed at `~/.config/opencode/`
