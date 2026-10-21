# flow-skills

Flow Skills is a collection of portable `flow-*` AI workflows for **Pi** (and Gentle Shell, which is built on Pi). Each skill is a `SKILL.md` that drives a deterministic Node runtime under `scripts/`.

## Layout

The skills locate their runtimes with paths relative to their own `SKILL.md` (for example `../../scripts/flow-commit.mjs`), so these folders must stay siblings:

```
skills/          one folder per skill (SKILL.md + references/phases)
scripts/         flow-*.mjs runtimes, with shared code in scripts/lib/
core/            debt contract and backlog modules used by flow-debt and flow-refactor
playbook/        shared engineering playbook used by flow-playbook-sync and flow-playbook-compare
hosts/pi/        prompts (the /flow-* slash commands) and agent definitions
package.json     Pi package manifest (declares skills and prompts)
```

## Install in Pi

Pi reads the package in place; nothing is copied. Register this folder as a package source in the Pi settings file (Gentle Shell: `~/.gentle-shell/agent/settings.json`):

```json
{
  "source": "<absolute path to this folder>",
  "prompts": [
    "hosts/pi/prompts/flow-avance.md",
    "hosts/pi/prompts/flow-branch.md",
    "hosts/pi/prompts/flow-commit.md",
    "hosts/pi/prompts/flow-pr.md"
  ],
  "skills": [
    "skills/flow-avance",
    "skills/flow-branch",
    "skills/flow-commit",
    "skills/flow-pr"
  ]
}
```

The `prompts` and `skills` lists are filters: only what you list is loaded. Omit them to load everything `package.json` declares. A skill gets a `/flow-*` slash command only if it has a prompt in `hosts/pi/prompts/`; today that is `flow-avance`, `flow-branch`, `flow-commit` and `flow-pr`.

### Agents (manual step)

`/flow-branch`, `/flow-commit` and `/flow-pr` run through named agents, which Pi does not install from the package. Copy them into the local Pi agent directory (Gentle Shell: `~/.gentle-shell/agent/agents/`; plain Pi: `$PI_CODING_AGENT_DIR/agents/` or `~/.pi/agent/agents/`):

```bash
cp hosts/pi/agents/flow-branch.md hosts/pi/agents/flow-commit.md hosts/pi/agents/flow-pr.md <pi-agent-dir>/agents/
```

Model routing (`model:` and `thinking:` lines) is local configuration added to the installed copies; it is not part of the repository definitions.

### Playbook location

`flow-playbook-sync` finds the playbook through `FLOW_PLAYBOOK_PATH`, then `--playbook-path`, then by walking up from the working directory looking for `Tools/flow-skills/playbook/`. On another machine, keep that folder layout or set `FLOW_PLAYBOOK_PATH`.

## Skills

| Skill | Description |
| --- | --- |
| `flow-audit` | Read-only code-quality evidence with separate advisory recommendations |
| `flow-audit-fix` | Separately invoked, host-approved configured audit fixes |
| `flow-avance` | Progress report for the whole project with an optional confirmed next step; no parameters |
| `flow-branch` | Safe existing-branch selection, updates, and guarded cleanup |
| `flow-build` | Guided project documentation generation |
| `flow-commit` | Prepared, sealed, and verified semantic commits |
| `flow-debt` | Project-local technical-debt lifecycle guidance |
| `flow-docs-sync` | Previewed incremental documentation updates |
| `flow-playbook-compare` | Read-only neutral playbook replacement candidates |
| `flow-playbook-sync` | Previewed project/playbook comparison |
| `flow-pr` | Prepared and verified pull-request workflow |
| `flow-refactor` | Read-only scoped refactoring audit |
| `flow-request` | Single-target local contract-request preview and host-approved execution |
| `flow-ui` | Read-only UI compliance audit |
| `ui-design-system` | Support resource used by `flow-ui` and `flow-refactor`; not an end-user workflow |

## Requirements

- Node.js 18+ (ESM, zero external dependencies)
- Pi or Gentle Shell
