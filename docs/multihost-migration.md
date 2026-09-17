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
| Clarification and approval | Pi conversation and its native permission/confirmation controls | Adapter-native `question` and exact permission boundaries |
| Installation | `pi install <package-source>` | Repository-local `node install.mjs` preview, then its exact approved apply command |
| Ownership | Pi/package manager owns placement; Flow writes no Pi settings | Flow deploys only lock-declared adapter paths; host configuration remains untouched |
| Reconciliation | Not an end-user workflow | Maintainer-only, explicit, repository-local read-only preview before any separately approved correction |

## Complete migration matrix

`Retained` means a legacy v1 workflow remains available through both declared Pi resources and the OpenCode adapter. `Added` means a new v1 workflow is available through both hosts but has no legacy surface. `Removed` means there is no hidden alias or automatic substitute.

| Flow surface | Status | Pi transition | OpenCode transition | Guidance |
| --- | --- | --- | --- | --- |
| `flow-audit` | Retained | Use `flow-audit` through package discovery | Use `/flow-audit` | Read-only advisory evidence and recommendations; it rejects `--fix`. |
| `flow-audit-fix` | Added | Use `flow-audit-fix` through package discovery | Use `/flow-audit-fix` | Preview first; each execution requires explicit host-native approval. |
| `flow-branch` | Retained | Use `flow-branch` | Use `/flow-branch` | Native host clarification retains guarded update/delete approval. |
| `flow-build` | Retained | Use `flow-build` | Use `/flow-build` | Guided documentation generation remains approval-bound for writes. |
| `flow-commit` | Retained | Use `flow-commit` | Use `/flow-commit` | Preserve prepare, seal, one approval, execute, and verify. |
| `flow-debt` | Retained | Use `flow-debt` | Use `/flow-debt` | Project-local debt changes stop for required approval. |
| `flow-docs-sync` | Retained | Use `flow-docs-sync` | Use `/flow-docs-sync` | Preview content changes before approval. |
| `flow-playbook-compare` | Added | Use `flow-playbook-compare` | Use `/flow-playbook-compare` | Read-only comparison returns neutral replacement candidates; it does not invoke `flow-pr` or apply changes. |
| `flow-playbook-sync` | Retained | Use `flow-playbook-sync` | Use `/flow-playbook-sync` | Compare project and playbook; no automatic PR invocation is implied. |
| `flow-pr` | Retained | Use `flow-pr` | Use `/flow-pr` | Preserve bounded authoring and one approved immutable execution. |
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
