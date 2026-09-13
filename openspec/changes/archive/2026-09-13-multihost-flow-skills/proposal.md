# Proposal: Make Flow Skills Multihost with Pi as the Primary Platform

## Intent

Make the repository the canonical source for Flow skills that work across Pi and OpenCode, with Pi as the primary product experience. Users should receive the same core workflow semantics on either supported host while each host presents its own native discovery, clarification, confirmation, and permission experience.

## Business and Product Outcome

Flow skills currently distribute primarily through OpenCode-specific commands, agents, paths, and ownership metadata. This prevents Pi users from receiving a first-class, independently usable product and makes cross-host behavior difficult to explain or maintain.

After this change:

- Pi users can discover and use the supported Flow skills through package resources without depending on an OpenCode installation or copied live-host assets.
- OpenCode users retain a supported host-native experience.
- Maintainers define shared workflow behavior once in a host-neutral core and keep host syntax, routing, and permission UX at adapter boundaries.
- Repository history and reviewed assets remain authoritative; live installations are deployment evidence rather than an implicit source of truth.

## Scope

### In Scope

- Establish a shared host-neutral Flow skill core containing portable workflow semantics and deterministic runtime contracts.
- Provide distinct Pi and OpenCode adapters for host discovery, invocation, clarification, confirmation, permissions, and presentation.
- Distribute Pi assets through declared package resources, with Pi as the primary documented experience.
- Retain OpenCode as a supported platform without carrying OpenCode-only syntax or permission claims into the shared core.
- Give each host a distinct managed-asset and integrity/provenance identity while preserving one canonical repository generation.
- Preserve preview-first mutation, immutable plan identity, verified backups, recoverable transactions, path safety, and postcondition verification where host assets are managed.
- Keep live-host import only as an exceptional, explicit reconciliation workflow that previews and compares differences and requires human approval.
- Remove or rename legacy aliases and inconsistent commands when they do not fit the first multihost product contract, with migration guidance for affected users.
- Update user and maintainer documentation to identify supported workflows, host-specific differences, ownership boundaries, and migration paths.

### Non-goals

- Exact command-name, invocation, prompt, permission-dialog, or interaction parity between Pi and OpenCode.
- Treating project-local or global asset copying as Pi's distribution model.
- Automatically importing host state into the repository or choosing a live installation over committed source.
- Managing host-owned configuration, secrets, credentials, caches, sessions, or unrelated user assets.
- Creating a universal permission abstraction that overrides native host controls.
- Requiring Pi-specific harness behavior in portable core contracts or OpenCode semantics in Pi resources.
- Preserving every legacy alias, orphaned command, or inconsistent advertised behavior.
- Adding another supported host in the first multihost release.
- Publishing a package or mutating a live Pi/OpenCode installation as part of proposal approval.

## Compatibility Boundary

Compatibility is defined at the workflow-outcome level, not as byte-for-byte or UI parity.

| Boundary | Product commitment |
| --- | --- |
| Shared behavior | Supported workflows have one canonical meaning, safety posture, and outcome contract across hosts. |
| Host experience | Pi and OpenCode may use different invocation, clarification, confirmation, permission, and result-presentation mechanisms. |
| Distribution | Pi consumes declared package resources; OpenCode continues through its supported adapter and managed destination. |
| Authority | The repository is canonical. Host state cannot replace repository content without an explicit reconciliation decision. |
| Integrity | Each host has distinguishable ownership and provenance while deriving from the same reviewed repository generation. |
| User data | Host-owned configuration and sensitive or unrelated files remain outside Flow ownership. |
| Legacy surface | Compatibility does not guarantee retention of inconsistent commands or aliases removed in the documented v1 migration. |

A host adapter may claim support only for behavior that can be expressed through that host's verified capabilities. Unsupported host behavior must fail clearly or be documented as unavailable rather than simulated through hidden assumptions.

## Migration Impact

### Pi Users

- Pi becomes the primary installation and documentation path.
- Existing wrappers or setups that read from a live OpenCode installation are replaced by package-resource discovery.
- Pi use no longer depends on `~/.config/opencode`, OpenCode command files, or OpenCode permission semantics.

### OpenCode Users

- OpenCode remains supported through its own adapter.
- Some command names, aliases, or previously advertised behaviors may be removed or normalized.
- Migration documentation must map retained workflows and identify removals or replacements before users update.

### Maintainers

- Shared semantics must be changed in the canonical core rather than duplicated independently per host.
- Adapter assets, package metadata, managed-asset declarations, integrity records, documentation, and contract tests become one release-consistency boundary.
- Host drift is diagnosed by comparison. Importing host changes remains an exceptional reviewed reconciliation, not routine synchronization.

No migration may blindly replace a host tree. Existing unrelated files and host-owned data must remain untouched, and managed changes must remain previewable and recoverable.

## Affected Areas

| Area | Expected product impact |
| --- | --- |
| `skills/` | Separate portable workflow guidance from host-specific assumptions. |
| `commands/`, `agents/` | Retain and normalize the OpenCode adapter surface. |
| Pi package resources and package metadata | Add the primary Pi distribution surface. |
| `scripts/`, `scripts/lib/` | Preserve deterministic runtimes while removing host assumptions from shared contracts. |
| `install.mjs`, asset tooling, manifests, and locks | Represent repository authority and distinct host ownership/provenance safely. |
| `tests/` | Cover shared contracts, both adapters, package resources, integrity, migration, and reconciliation boundaries. |
| User and maintainer documentation | Lead with Pi, document OpenCode support, compatibility limits, and migration. |

## Risks and Tradeoffs

- **Scope breadth:** Core guidance, two adapters, distribution metadata, asset integrity, tests, and migration documentation can drift unless reviewed as one product boundary.
- **False parity:** Shared wording may imply host capabilities that one adapter cannot safely provide. Compatibility claims must remain outcome-based and capability-verified.
- **Migration disruption:** Cleaning legacy aliases or inconsistent commands can surprise existing OpenCode users without a clear mapping and release note.
- **Authority reversal:** A convenient live-host import path could accidentally become routine authority. It must remain exceptional, previewed, compared, and explicitly approved.
- **Ownership collision:** Incorrect host manifests or destinations could overwrite unrelated configuration or conflate Pi and OpenCode provenance.
- **Package usability:** Pi package resources may appear present but remain undiscoverable or dependent on undeclared harness behavior unless tested from the package boundary.
- **Maintenance cost:** Two adapters add release work; the shared-core boundary must materially prevent semantic duplication to justify that cost.
- **Platform variance:** Filesystem mode, path, and permission differences—especially on Windows—may require explicit capability handling without weakening integrity checks.

## Rollout and Rollback

Roll out as one versioned multihost product transition: publish the supported workflow matrix and migration notes with the canonical core, both host adapters, Pi package declaration, integrity metadata, and matching contract evidence. Do not publish or deploy from incomplete repository state.

Rollback means reverting the multihost release as a coherent repository generation and restoring the prior supported OpenCode generation through existing verified restore safeguards. Rollback must not import live host state, overwrite host-owned data, or erase unrelated assets. If only one adapter is defective, fix-forward or withdraw that adapter's support claim rather than allowing it to redefine the shared core.

## Acceptance Criteria

- [ ] Pi is documented as the primary platform and exposes every v1-supported Flow workflow through declared package resources without requiring OpenCode assets.
- [ ] OpenCode remains supported through a distinct adapter with its host-native invocation and permission behavior.
- [ ] Shared core assets contain no OpenCode command syntax, OpenCode path assumptions, OpenCode permission claims, or Pi-specific harness assumptions.
- [ ] The supported workflow matrix identifies shared outcomes, host-specific UX differences, and any intentionally unsupported behavior.
- [ ] Repository content is the default and automatic authority for distributed assets on both hosts.
- [ ] Pi and OpenCode ownership/integrity records are distinguishable and traceable to the same canonical repository generation.
- [ ] Preview, immutable identity binding, backup/recovery, path safety, unrelated-file preservation, and postcondition checks remain enforced for managed mutations.
- [ ] Live-host import cannot run implicitly and requires an explicit preview, repository comparison, and human approval before repository changes.
- [ ] Host-owned configuration, secrets, credentials, caches, sessions, and unrelated files are excluded from managed ownership and remain unchanged in integration coverage.
- [ ] Removed or renamed legacy aliases and inconsistent commands are listed with clear migration guidance.
- [ ] Contract and integration coverage verifies the shared semantics, each host adapter, Pi package discovery, OpenCode compatibility, integrity identities, and exceptional reconciliation boundary.
- [ ] The canonical full test command `node --test tests/*.test.mjs` passes, with any platform capability skips reported rather than counted as passes.

## Review-Budget Implications

**Preliminary risk indication: high.** The change spans multiple review areas—portable product contracts, Pi packaging, OpenCode adapters, deterministic runtimes, asset ownership/integrity, tests, and migration documentation—and may exceed the 400 changed-line budget even before generated integrity updates are considered.

This indication is not the Review Workload Forecast and does not trigger a delivery decision at the proposal gate. The next planning phases are `sdd-spec` and `sdd-design`; after those artifacts define the requirements and architecture, `sdd-tasks` must produce the Review Workload Forecast from concrete work units. Only then is the configured `ask-on-risk` policy evaluated. No chain strategy or `size:exception` is selected or inferred here, and tests or documentation must not be compressed or omitted to fit the budget.
