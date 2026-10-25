# flow-skills

Flow Skills is a collection of portable `flow-*` AI workflows for **Pi** (and Gentle Shell, which is built on Pi). Each skill is a `SKILL.md` that drives a deterministic Node runtime under `scripts/`, except `flow-avance` and `flow-learn`, which are instruction-only.

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
    "hosts/pi/prompts/flow-base.md",
    "hosts/pi/prompts/flow-commit.md",
    "hosts/pi/prompts/flow-learn.md",
    "hosts/pi/prompts/flow-pr.md"
  ],
  "skills": [
    "skills/flow-avance",
    "skills/flow-base",
    "skills/flow-commit",
    "skills/flow-learn",
    "skills/flow-pr"
  ]
}
```

The `prompts` and `skills` lists are filters: only what you list is loaded. Omit them to load everything `package.json` declares. A skill gets a `/flow-*` slash command only if it has a prompt in `hosts/pi/prompts/`; today that is `flow-avance`, `flow-base`, `flow-commit`, `flow-learn` and `flow-pr`.

### Agents (manual step)

`/flow-base`, `/flow-commit` and `/flow-pr` run through named agents, which Pi does not install from the package. Copy them into the local Pi agent directory (Gentle Shell: `~/.gentle-shell/agent/agents/`; plain Pi: `$PI_CODING_AGENT_DIR/agents/` or `~/.pi/agent/agents/`):

```bash
cp hosts/pi/agents/flow-base.md hosts/pi/agents/flow-commit.md hosts/pi/agents/flow-pr.md <pi-agent-dir>/agents/
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
| `flow-base` | Return to the updated, clean base branch to start a new cycle; also safe branch selection and guarded cleanup |
| `flow-build` | Guided project documentation generation |
| `flow-commit` | Prepared, sealed, and verified semantic commits |
| `flow-debt` | Project-local technical-debt lifecycle guidance |
| `flow-docs-sync` | Previewed incremental documentation updates |
| `flow-learn` | Study queue, concise lessons, Obsidian notes and glossary; slash command only |
| `flow-playbook-compare` | Read-only neutral playbook replacement candidates |
| `flow-playbook-sync` | Previewed project/playbook comparison |
| `flow-pr` | Prepared and verified pull-request workflow |
| `flow-refactor` | Read-only scoped refactoring audit |
| `flow-request` | Single-target local contract-request preview and host-approved execution |
| `flow-ui` | Read-only UI compliance audit |
| `ui-design-system` | Support resource used by `flow-ui` and `flow-refactor`; not an end-user workflow |

## flow-learn

Instruction-only: no runtime script, and it never runs unless you call `/flow-learn`. It keeps a single study queue in your Obsidian vault, teaches a topic in a short lesson, and saves distilled notes and glossary terms.

| Command | What it does |
| --- | --- |
| `/flow-learn keycloak, auth` | Add topics to the study queue |
| `/flow-learn -l [n]` | List pending topics, pick one and study it |
| `/flow-learn -n topic` | Study a topic now, without queueing it first |
| `/flow-learn -s [topic]` | Save what was studied as notes (split by topic and category) |
| `/flow-learn -g [terms]` | Add technical terms to the glossary |
| `/flow-learn -d n\|topic` | Remove a queue line (with confirmation) |
| `/flow-learn -f text` | Search notes, glossary and queue |
| `/flow-learn -u topic` | Update an existing note with what changed |
| `/flow-learn -r [topic]` | Quiz yourself on a note |
| `/flow-learn -p topic` | Draft a LinkedIn post, blog article or video script from a note |
| `/flow-learn -h` | Show help |

Config lives in `~/.config/flow-skills/learn.json` (no environment variable); the first run asks for the vault path and writes it after you confirm:

```json
{"vault": "<absolute path>", "language": "es"}
```

Vault layout:

```
_pendientes.md          single queue ([ ] pending, [~] studied, not saved)
_index.md               category table
<Category>/<slug>.md    notes, with a per-category _index.md
Glosario/<Category>.md  glossary, one file per category
```

## Requirements

- Node.js 18+ (ESM, zero external dependencies)
- Pi or Gentle Shell
