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
