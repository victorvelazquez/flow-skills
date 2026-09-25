# Migrate Flow Skills to Pi-first multihost support

Pi package resources are the primary Flow Skills experience. OpenCode remains supported through native adapters, but both hosts use the same v1 workflow outcomes and safety posture.

## Quick path

1. **Pi:** install the reviewed package with `pi install <package-source>`; Pi discovers only the declared package skills.
2. **OpenCode:** work from the repository, run `node install.mjs` for a read-only preview, and run only its exact identity-bound `applyCommand` after review.
3. Read the matrix below before replacing a legacy invocation. It is the complete disposition for every prior Flow command and skill.

Do not blindly replace an OpenCode host tree. Flow manages only exact declared adapter destinations; OpenCode configuration, secrets, providers, sessions, caches, plugins, and unrelated files remain host-owned. Pi package installation, update, and removal remain under Pi's package/security model.

## Host transition

| Topic | Pi | OpenCode |
| --- | --- | --- |
| Discovery | Declared package skills; natural matching or `/skill:flow-*` | Native `/flow-*` command adapters |
| Clarification and approval | Native controls for workflows that require them; manual `/flow-commit` and `/flow-pr` authorize their own execution | Native controls for other workflows; manual `/flow-commit` and `/flow-pr` execute directly and PR ambiguity blocks |
| Installation | `pi install <package-source>` | Repository-local `node install.mjs` preview, then its exact approved apply command |
| Ownership | Pi/package manager owns placement; Flow writes no Pi settings | Flow deploys only lock-declared adapter paths; host configuration remains untouched |
| Reconciliation | Not an end-user workflow | Maintainer-only, explicit, repository-local read-only preview before any separately approved correction |

## Pi-native Flow agents and Gentle Pi

### Ownership and architecture

The Flow package is the source for three separate Pi-facing resource types:

- `skills/flow-{commit,pr,branch}/` contain the workflow contracts and package-relative runtimes.
- `hosts/pi/prompts/` is declared in `package.json`, so `pi install` provides the native `/flow-commit`, `/flow-pr`, and `/flow-branch` entrypoints.
- `hosts/pi/agents/` contains the canonical `flow-commit`, `flow-pr`, and `flow-branch` agent definitions. Gentle Pi discovers these definitions from the local Pi agent directory so its supervised prompts can route to real agents.

The package manifest and Pi provenance lock cover both canonical agent and prompt directories. The global agent copies are an installation target, not an editable source: update the repository checkout, reinstall from its canonical files, and regenerate repository locks through the deterministic generator. Do not copy workflow behavior into an agent or prompt.

`gentle-pi` remains an external, unmodified package. Flow neither vendors nor patches it, and it does not edit its package files, extensions, or profile implementation. Pi package installation owns package placement; Gentle Pi owns global-agent discovery and its own profile state.

### Install locally, then install the repository-backed agents

Choose and retain a reviewed repository revision. Install the Flow package through Pi from that source (pin a Git tag or commit for a reproducible installation):

```bash
pi install <package-source>
```

Then install exactly the three repository-backed definitions into the local Pi agent directory. On POSIX shells, use the configured Pi home when present, otherwise its default:

```bash
PI_HOME="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
mkdir -p "$PI_HOME/agents"
cp hosts/pi/agents/flow-{branch,commit,pr}.md "$PI_HOME/agents/"
```

On PowerShell, use the equivalent copy from the same checkout:

```powershell
$piHome = if ($env:PI_CODING_AGENT_DIR) { $env:PI_CODING_AGENT_DIR } else { Join-Path $HOME ".pi/agent" }
New-Item -ItemType Directory -Force (Join-Path $piHome "agents")
Copy-Item hosts/pi/agents/flow-branch.md, hosts/pi/agents/flow-commit.md, hosts/pi/agents/flow-pr.md (Join-Path $piHome "agents")
```

This procedure is intentionally explicit: it writes only those agent files and never changes Pi settings or Gentle Pi configuration. This repository task documents the procedure only; it does not perform the global installation.

### Restart and discovery verification

Close and restart Pi after package or global-agent changes. In the fresh session, verify all of the following before relying on routing:

1. `pi list` reports the selected Flow package source.
2. `/flow-commit`, `/flow-pr`, and `/flow-branch` are offered as prompt templates from the package.
3. Gentle Pi discovers `flow-commit`, `flow-pr`, and `flow-branch` as agents; each definition loads its matching packaged skill and inherits its configured model routing.
4. The local agent files byte-match `hosts/pi/agents/` at the reviewed repository revision. If they do not, replace only those three files from that revision and restart again.

Do not add OpenCode compatibility fields, permissions, paths, or adapter syntax to Pi agent or prompt files. Their small Pi-native definitions load the packaged skills; the skills remain the sole workflow authority.

### Gentle Pi Snapshot and recovery on another machine

A Gentle Pi Snapshot rebuilds a profile from its effective discovered-agent routing. If the three Flow agents are absent when Snapshot runs, manual routing entries for their names can be lost because Snapshot has no discoverable agent to retain. Install and verify the global definitions **before** using Snapshot; then confirm the effective routing contains all three Flow names before accepting the profile update. Do not hand-edit a Snapshot result to compensate for absent agents.

For backup and recovery, retain the Flow repository checkout (or its immutable commit/tag), the package source used by `pi install`, and any user-owned Gentle Pi profile backup separately. On another machine:

1. Check out the same reviewed Flow revision and verify its committed provenance locks with `node tools/flow-assets.mjs --verify --host pi`.
2. Run `pi install <package-source>` pinned to that same revision.
3. Copy only `hosts/pi/agents/flow-branch.md`, `flow-commit.md`, and `flow-pr.md` into that machine's Pi agent directory using the procedure above.
4. Restart Pi, repeat discovery verification, and only then use the user-owned Gentle Pi Snapshot/profile recovery flow.

This order restores canonical Flow resources without copying, modifying, or backing up `gentle-pi` itself. It also makes the repository, not a machine-local agent edit, the recoverable source of truth.

## Complete migration matrix

`Retained` means a legacy v1 workflow remains available through both declared Pi resources and the OpenCode adapter. `Added` means a new v1 workflow is available through both hosts but has no legacy surface. `Removed` means there is no hidden alias or automatic substitute.

| Flow surface | Status | Pi transition | OpenCode transition | Guidance |
| --- | --- | --- | --- | --- |
| `flow-audit` | Retained | Use `flow-audit` through package discovery | Use `/flow-audit` | Read-only advisory evidence and recommendations; it rejects `--fix`. |
| `flow-audit-fix` | Added | Use `flow-audit-fix` through package discovery | Use `/flow-audit-fix` | Preview first; each execution requires explicit host-native approval. |
| `flow-branch` | Retained | Use `flow-branch` | Use `/flow-branch` | Native host clarification retains guarded update/delete approval. |
| `flow-build` | Retained | Use `flow-build` | Use `/flow-build` | Guided documentation generation remains approval-bound for writes. |
| `flow-commit` | Retained | Use `/flow-commit` | Use `/flow-commit` | Manual invocation authorizes prepare, seal, execute, and verify without a second approval. |
| `flow-debt` | Retained | Use `flow-debt` | Use `/flow-debt` | Project-local debt changes stop for required approval. |
| `flow-docs-sync` | Retained | Use `flow-docs-sync` | Use `/flow-docs-sync` | Preview content changes before approval. |
| `flow-playbook-compare` | Added | Use `flow-playbook-compare` | Use `/flow-playbook-compare` | Read-only comparison returns neutral replacement candidates; it does not invoke `flow-pr` or apply changes. |
| `flow-playbook-sync` | Retained | Use `flow-playbook-sync` | Use `/flow-playbook-sync` | Compare project and playbook; no automatic PR invocation is implied. |
| `flow-pr` | Retained | Use `/flow-pr` | Use `/flow-pr` | Manual invocation authorizes bounded authoring and immutable execution without a second question or approval; ambiguity blocks for fresh explicit invocation. |
| `flow-refactor` | Retained | Use `flow-refactor` | Use `/flow-refactor` | This is a read-only scoped audit. |
| `flow-request` | Retained | Use `flow-request` | Use `/flow-request` | Preview one configured local target; each cross-repository execute requires host-native approval and unavailable targets use requester-local outbox records. |
| `flow-ui` | Retained | Use `flow-ui` | Use `/flow-ui` | This is a read-only UI compliance audit. |
| `ui-design-system` | Retained | Installed as a support resource | Available to supporting adapters | It is not an end-user command. |
| `flow-auto-deliver` | Removed | Use `flow-commit` when its verified commit outcome is needed | Use `/flow-commit` | The replacement does not create PRs or push; no delivery behavior is implied. |
| `flow-figma` | Removed | No v1 replacement | No v1 replacement | `flow-ui` remains an audit only; it does not generate Figma-to-code output. |
| `flow-skills-sync` | Removed | No end-user replacement | No end-user replacement | Maintainers may start an exceptional read-only preview with `node tools/flow-assets.mjs --reconcile --host opencode --source <absolute-path> --dry-run`. |

## Legacy Flow Debt stores

Flow performs no automatic migration of a legacy Flow Debt store. Preserve
legacy-store data unchanged; do not modify, delete, or reconcile it.

1. Begin with external legacy-layout resolution under repository policy. The Flow
   package does not decide whether a legacy layout is safe or complete.
2. Manually author neutral v1 drafts from observed legacy data; do not copy a legacy
   store or infer missing values.
3. Pass each draft to `create-preview`. Inspect the returned candidates. The preview
   remains read-only and does not migrate or store the draft.
4. A separately authorized lifecycle is considered only after external legacy-layout
   resolution under repository policy. It remains subject to the repository's
   approval policy and the host-owned approval boundary.

## Exceptional reconciliation

Reconciliation is not deployment, synchronization, or installation. A maintainer must explicitly select a host and an absolute source, preview differences against the repository, and obtain separate approval for any identity-bound repository correction. Shared skills, runtimes, manifests, locks, package metadata, and control files remain repository-authored and report-only. Reconciliation never commits, pushes, publishes, deploys, installs, or mutates the host.
