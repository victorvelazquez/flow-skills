# flow-skills

Flow Skills is a versioned collection of portable `flow-*` AI workflows. **Pi is the primary platform**: its package resources provide native skill discovery without an OpenCode installation, command tree, or permission model.

## Install

### Pi (primary)

Install the reviewed Flow package through Pi's package workflow:

```bash
pi install <package-source>
```

Pi discovers only the explicitly declared `flow-*` resources in `package.json`. The portable `core/workflows.json` registry and reproducible provenance locks are packaged with those resources. The package does not copy files into Pi settings or require OpenCode assets. Review the package source before installation; package installation, updates, and removal remain under Pi's security model.

The package supplies the native `/flow-commit`, `/flow-pr`, and `/flow-branch` prompt entrypoints. Their canonical supervised-agent definitions remain repository-owned in `hosts/pi/agents/` and are installed separately into the local Pi agent directory; this keeps package resources, agent discovery, and model-routing snapshots distinct. See [Pi agent installation and recovery](docs/multihost-migration.md) before installing or restoring those definitions.

### Pi-only progress report

Use `/flow-avance` with no parameters to report the **whole current project's approved scope**, even in a clean session. It summarizes achieved results, counts distinct remaining delivery tasks (including current work), keeps undefined fronts uncounted, and shows a compact route in approved order. Only exceptions need notes: in progress, blocked with a cause, paused or not yet broken down. An unfinished decomposition means the total remaining is indeterminate. The prompt loads the packaged skill in the principal conversation, without delegating the report or adding an agent/extension.

The report reads existing project roadmaps and linked task authorities, relevant conversation and scoped Engram memory when available—not all code or other repositories. A delivery task is not each technical subactivity: in an agreed branch/PR workflow it remains unfinished until verification, confirmed integration and an updated clean `develop`; other projects retain their documented closure workflow. Bold standalone labels, visible icons and blank lines keep the report readable. Its reporting phase covers preparation before implementation and does not create progress files, initialize tracking, update Todo or memory records, run checks, or start work. Missing or ambiguous context is reported, not fabricated; it is not an automatic monitor. Host-owned memory capture remains independent.

After displaying the full Spanish report, it can offer **¿Avanzamos con el próximo paso?** through the existing `ask_user_choice` tool (Gentle's selector using Pi's native UI), with **Sí** and **No**. It only offers a concrete, unblocked step within agreed scope that the principal can execute. **Sí** ends reporting and starts only that step through its ordinary workflow, with delegation allowed and safety gates preserved. **No**, cancellation, an unavailable selector, or an error starts no work. Completed/paused objectives, user-only actions, and missing decisions or special authorizations produce no continuation prompt. The choice is not a manual `/flow-commit` or `/flow-pr` invocation or blanket permission to deliver or perform destructive operations. No automatic backlog traversal occurs. Install/update through Pi and verify prompt discovery before use; this repository change does not install globally.

### OpenCode (supported compatibility path)

OpenCode continues to use the repository-local preview-first installer:

```bash
git clone https://github.com/victorvelazquez/flow-skills.git ~/Developer/Tools/flow-skills
cd ~/Developer/Tools/flow-skills
node install.mjs
```

The command is a read-only preview whose JSON identifies `host: "opencode"`. Run only the exact `applyCommand` printed by that preview; it binds the committed `HEAD` target commit and plan ID. Restart OpenCode after apply. The bootstrap installs only the committed Flow generation at repository `HEAD`, preserves `opencode.json` byte-for-byte, and uses a verified backup plus transactional apply. `--host pi` intentionally fails with Pi package-install guidance; it never copies Pi resources.

## What's included

| Skill | Description |
| --- | --- |
| `flow-audit` | Read-only code-quality evidence with separate advisory recommendations |
| `flow-audit-fix` | Separately invoked, host-approved configured audit fixes |
| `flow-avance` | Pi-only progress report with optional confirmed next-step handoff; no parameters |
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
| `ui-design-system` | Support resource used by relevant Flow skills; not an end-user workflow |

## OpenCode commands

```bash
node install.mjs             # preview HEAD without changes
node install.mjs --dry-run   # compatibility alias for preview
node install.mjs --host opencode --destination <path>
node install.mjs --help
```

This one-release compatibility adapter supports OpenCode only. `--host pi`, `--export`, `--update`, `--uninstall`, and historical `--ref` workflows are intentionally rejected. See the [multihost migration matrix](docs/multihost-migration.md) for supported workflow transitions and the exceptional maintainer-only reconciliation path.

## Migration

Pi package resources are the primary path, while OpenCode retains native adapters with the same supported workflow outcomes. The [multihost migration matrix](docs/multihost-migration.md) records every Flow surface as retained, added, or removed, including the no-blind-replacement rule.

## Requirements

- Node.js 18+ (ESM, zero external dependencies)
- Pi package installation for the primary experience
- OpenCode installed at `~/.config/opencode/` only when using the supported OpenCode compatibility path
