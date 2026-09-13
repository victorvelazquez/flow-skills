# Explore: Multihost Flow Skills

## Current state

The repository is the canonical evidence base. Historical OpenCode drift was audited in Engram #10282, reconciled in #10314, committed as five atomic changes recorded by #10313, and merged through PR #29. Current `HEAD`, `main`, and `origin/main` are `350268e`, with ahead/behind `0/0`. Live host installations are deployment evidence, never automatic authority.

## Structural map

| Surface | Current role | Host coupling |
| --- | --- | --- |
| `skills/` | Core Flow instructions | Mostly reusable, but several skills hardcode OpenCode paths and tools |
| `commands/` | OpenCode slash-command adapters | OpenCode-specific macros, frontmatter, paths, and routing |
| `agents/` | OpenCode subagent and permission contracts | OpenCode-specific permissions and tool semantics |
| `scripts/flow-*.mjs`, `scripts/lib/` | Deterministic workflow runtimes | Largely host-neutral; `flow-skills.mjs` remains OpenCode-specific |
| `install.mjs` | Repository HEAD to OpenCode restore | OpenCode destination and restart guidance |
| `tools/flow-assets.mjs` | Manifest, lock, snapshot, restore, verification | Generic safety mechanics with OpenCode-specific ownership semantics |
| `flow-assets.json`, `flow-assets.lock.json` | Installed-generation ownership and integrity | Records OpenCode user configuration and provenance |
| `tests/` | `node:test` contract and integration coverage | Asset, install, sync, and agent tests encode OpenCode behavior |

## Host-specific assumptions

- Managed command files use OpenCode syntax such as `$ARGUMENTS`, command substitution, `agent`/`subtask` frontmatter, and `~/.config/opencode` paths.
- Agent contracts depend on OpenCode subagents, permission patterns, mutation gates, `question`, and `apply_patch` semantics.
- `skills/flow-pr/SKILL.md` has limited Pi-aware editing behavior but invokes its runtime from the OpenCode installation.
- Flow Branch, Flow Commit, and Flow Skills Sync retain OpenCode path and approval assumptions.
- `scripts/flow-skills.mjs` and `install.mjs` default to the OpenCode destination.
- Asset lock provenance identifies OpenCode and Gentle AI versions rather than a host-neutral generation.

## Pi evidence

Pi discovers skills from project or global skill roots, packages, settings, and explicit skill paths. Project-local resources require trust. Pi package distribution can be declared through `package.json`.

Pi does not share OpenCode's command adapters or permission model:

- Skills are exposed through Pi skill discovery rather than OpenCode command files.
- Subagent, permission, and question behavior depends on the installed Pi harness/extensions and must not be assumed by portable core assets.
- The repository currently has no canonical Pi distribution layout or package manifest.

The historical Pi wrappers that depended on live OpenCode assets must be treated as reconciliation evidence, not as an acceptable target architecture.

## Asset and runtime boundaries

The current asset engine already provides valuable host-neutral safety properties:

- preview before mutation;
- immutable preview identity binding;
- persistent verified backups and recoverable transactions;
- declared managed ownership;
- exclusion of host-owned configuration, secrets, credentials, caches, and sessions;
- exact hash, size, and mode verification;
- Windows byte stability through `.gitattributes`.

Its authority model is still OpenCode-directional: snapshot imports live OpenCode into the repository, restore deploys repository `HEAD` to OpenCode, and lock provenance describes one host. A repository-as-source-of-truth architecture must explicitly constrain or redesign live-to-repository import.

## Existing test coverage

- `tests/install.test.mjs`: immutable previews, OpenCode configuration preservation, backups, and destination precedence.
- `tests/flow-assets-manifest.test.mjs`: manifest validation, byte stability, path safety, transactional snapshots, and unrelated-file preservation.
- `tests/flow-assets-restore.test.mjs`: historical generations, recovery, backup integrity, and unowned-file protection.
- `tests/flow-skills-sync.test.mjs`: OpenCode wrapper forwarding and confirmation-bound synchronization.
- `tests/flow-agent-contract.test.mjs`: OpenCode permissions, intent boundaries, Windows patterns, and command/skill/agent alignment.

Recovered reconciliation evidence reports 220 passing tests, zero failures, and six Windows capability skips. This exploration did not rerun tests.

## Migration risks

1. Copying OpenCode commands or agents directly into Pi would carry invalid host syntax and permission claims.
2. Treating incidental Pi project discovery as package distribution would create an undeclared harness dependency.
3. Reusing one OpenCode lock identity for Pi would conflate host ownership, provenance, and restore targets.
4. Keeping unconstrained snapshot-to-repository authority would violate repository source-of-truth semantics.
5. Blind host-tree replacement could overwrite host-owned configuration or unrelated assets.
6. OpenCode mutation approval semantics cannot be claimed for Pi without verified harness support.
7. Existing orphaned or legacy command/documentation inconsistencies must not be propagated automatically.
8. Manifest, lock, installer, host adapters, documentation, and contract tests form one integrity unit.

## Open product and architecture questions

- Which Pi distribution mode is primary: project-local skills, global installation, or a Pi package?
- Which explicit host destinations are supported, and which files remain host-owned?
- How should interactive clarification and mutation approval be represented without assuming OpenCode semantics?
- Should OpenCode live-to-repository import remain as an explicit reconciliation workflow or be retired?
- How should each host receive a distinct integrity identity while sharing one repository source?
- Does compatibility include legacy aliases and currently inconsistent advertised commands?

## Non-goals for exploration

- No final architecture selection.
- No product-source changes.
- No live Pi or OpenCode mutation.
- No synchronization apply, publication, or Git mutation.
