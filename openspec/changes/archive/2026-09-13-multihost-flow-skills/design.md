# Design: Repository-Authoritative Multihost Flow Skills

## Decision summary

Flow Skills will keep one portable workflow core in the existing `skills/`, `scripts/`, and `scripts/lib/` trees. Pi will consume that core directly as declared package skills. OpenCode will consume the same core through OpenCode-specific commands and agents under `hosts/opencode/`, deployed to its native directory by the verified asset engine.

The host boundary owns discovery, invocation, clarification, approval, permissions, and presentation. The core owns workflow meaning, deterministic preparation/execution contracts, safety invariants, and result semantics. No shared skill may name a host tool, permission rule, installation directory, or command macro.

Repository files are always the automatic deployment source. Live host content may enter the repository only through a separately named reconciliation command that is explicit, previewed, identity-bound, adapter-only by default, and human-approved.

## Goals and constraints

| Topic | Design decision |
| --- | --- |
| Primary product | Pi package resources are the primary installation and documentation path. |
| Shared behavior | Existing skills and deterministic Node.js runtimes become the host-neutral core; behavior is refactored in place rather than duplicated. |
| Host integration | Pi uses native package skill discovery. OpenCode uses commands and agents as adapters. |
| Interaction | Adapters obtain missing input and approval using verified host capabilities. The core never claims a universal permission mechanism. |
| Authority | A selected repository commit/tree and its verified locks are the only automatic source for distribution or deployment. |
| Integrity | Pi and OpenCode have separate manifests and locks, joined by one content-derived repository generation ID. |
| Mutation safety | Preview, immutable plan identity, exact argv, path containment, verified backups, recoverable transactions, and postcondition checks remain mandatory. |
| Dependencies | Node.js 18+ ESM and zero runtime dependencies remain the baseline. |
| Release | No package publication or live-host mutation is part of this change's implementation or verification. Both remain human-controlled operations. |

## Architecture

```text
reviewed repository commit/tree
  |
  +-- core/workflows.json ---------------- supported workflow registry
  +-- core/host-adapter-contract.md ------- shared host-port contract
  +-- skills/flow-*/SKILL.md -------------- portable workflow semantics
  +-- skills/ui-design-system/** ---------- portable support resource
  +-- scripts/flow-*.mjs ------------------ deterministic runtime entry points
  +-- scripts/lib/*.mjs ------------------- deterministic runtime internals
  |
  +-- package.json pi.skills -------------- Pi discovery adapter
  |     +-- hosts/pi/flow-assets.json ----- Pi package ownership/capabilities
  |     +-- hosts/pi/flow-assets.lock.json  Pi resource identity
  |
  +-- hosts/opencode/commands/*.md -------- OpenCode invocation adapter
  +-- hosts/opencode/agents/*.md ---------- OpenCode permission/interaction adapter
  |     +-- hosts/opencode/flow-assets.json
  |     +-- hosts/opencode/flow-assets.lock.json
  |
  +-- flow-generation.lock.json ----------- common generation identity
        |
        +-- Pi: package manager owns installation/update/removal
        +-- OpenCode: Flow asset engine owns exact mapped destination files
```

### Why the core stays in `skills/` and `scripts/`

Moving or copying the large skill corpus into separate Pi and OpenCode trees would create semantic duplication, a very large review diff, and a future drift source. Instead:

- `skills/` is the canonical semantic core and follows the Agent Skills format Pi already understands.
- Each core skill refers to packaged resources relative to its own `SKILL.md`, such as `../../scripts/flow-commit.mjs`; it never derives a path from the current working directory or a host home directory.
- OpenCode adapters add only OpenCode syntax, routing, agent selection, and permission behavior.
- Pi's adapter is intentionally declarative: `package.json` exposes the shared skills, and `hosts/pi/flow-assets.json` records Pi's interaction capabilities and package ownership. There is no copied Pi skill tree.

## Directory and package layout

```text
core/
  host-adapter-contract.md
  workflows.json
hosts/
  pi/
    flow-assets.json
    flow-assets.lock.json
  opencode/
    commands/flow-*.md
    agents/flow-*.md
    flow-assets.json
    flow-assets.lock.json
skills/
  flow-*/SKILL.md
  flow-*/references/**
  ui-design-system/**
scripts/
  flow-*.mjs
  lib/*.mjs
tools/
  flow-assets.mjs
  lib/
    asset-contracts.mjs
    asset-generation.mjs
    managed-deployment.mjs
    reconciliation.mjs
flow-generation.lock.json
install.mjs
package.json
```

The `tools/lib/` split is a code ownership boundary, not a requirement to rewrite working transaction code. Existing functions move only when needed to parameterize a host manifest; their current validation and recovery behavior remains authoritative during extraction.

### `package.json` boundary

The root package remains `flow-skills` and adds:

- `keywords: ["pi-package", "pi", "opencode", "skills", "git", "workflow"]`;
- `engines.node: ">=18"`;
- `pi.skills` with explicit positive entries for the v1 `flow-*` skill directories and `ui-design-system` support resource;
- an explicit `files` allowlist containing only Pi-consumable `skills/`, required `scripts/` and `scripts/lib/`, Pi provenance files, and user documentation.

The npm package does not include OpenCode commands, agents, installer code, tests, repository reconciliation tooling, or OpenSpec history. OpenCode remains installable from the repository generation. Publishing is a separate authorized release action.

Explicit `pi.skills` entries are preferred over implicit directory discovery so an accidental new skill cannot become part of the public Pi surface without a manifest, lock, matrix, and test update.

## Shared-core contract

`core/workflows.json` is the machine-readable product registry. Each entry contains:

```json
{
  "id": "flow-commit",
  "contract": "skills/flow-commit/SKILL.md",
  "resources": ["skills/flow-commit/**"],
  "runtime": "scripts/flow-commit.mjs",
  "outcome": "verified semantic commits",
  "mutation": "approval-required",
  "hosts": { "pi": "supported", "opencode": "supported" }
}
```

Paths and workflow IDs are sorted and unique. `runtime` may be `null` for instruction-only workflows. Unknown fields, missing resources, duplicate IDs, undeclared package skills, and host claims without adapter coverage fail validation.

Portable `SKILL.md` files may define:

- activation intent and workflow outcome;
- deterministic runtime inputs, outputs, handles, plan identities, and retry rules;
- inspection-versus-mutation boundaries;
- required clarification or approval conditions;
- safety invariants and failure behavior;
- host-neutral presentation requirements.

They must not contain:

- `$ARGUMENTS`, OpenCode command substitution/frontmatter, agent names, `question`, `apply_patch`, or OpenCode permission claims;
- `~/.config/opencode`, `.pi`, or another host installation path;
- Pi extension, subagent, harness, or permission assumptions;
- a statement that invoking a workflow itself grants mutation authority.

The existing deterministic runtime schemas and behavior remain unchanged unless a focused test proves a host assumption exists in executable code. Runtime path resolution changes are adapter/documentation concerns, not a reason to redesign Git, GitHub, audit, or documentation logic.

## Host adapter contract

`core/host-adapter-contract.md` defines a port contract rather than a universal JavaScript interface. Different workflows have different runtime schemas, so forcing all of them behind one code API would add indirection without safety.

Every host adapter must perform these stages:

1. **Discover** a workflow only when its registry and host manifest both claim support.
2. **Load** the exact shared skill and required references from the same host lock generation.
3. **Resolve** runtime/resource paths from the installed package or managed adapter root, never from cwd or an unrelated host.
4. **Collect** user intent as data and pass values as exact argv elements or validated files defined by the runtime.
5. **Clarify** missing or ambiguous intent through the host's verified interaction mechanism; if unavailable, return `unavailable` without mutation.
6. **Prepare/preview** through the shared runtime when one exists and present its bounded summary.
7. **Approve** through a host-native gate. Consent may not be inferred from discovery, invocation, a prior unrelated answer, or an adapter capability declaration.
8. **Execute** only the approved immutable plan/handle/request. Stale identity discards approval and returns to preview.
9. **Present** only verified results and explicit blockers; capability limitations are not reported as successful enforcement.

The adapter never passes a generic `approved: true` value into the shared core as proof of consent. Approval controls whether the adapter invokes the mutation entry point; the runtime independently revalidates immutable execution authority and postconditions.

### Pi adapter

Pi's adapter consists of the declared `pi.skills` resources plus the Pi host manifest:

- discovery: package skill scanning and `/skill:<name>`;
- invocation: natural skill matching or `/skill:flow-*`;
- clarification: normal Pi user conversation;
- approval: an active Pi tool permission prompt when one is available, otherwise an explicit in-session confirmation immediately before the exact mutation command;
- permissions: host/user settings remain authoritative and are never edited by Flow;
- presentation: normal Pi response rendering using the shared output contract.

A Pi adapter that cannot obtain required input or approval stops. `allowed-tools` is not used to imply permissions, and the package does not install an extension merely to emulate OpenCode.

### OpenCode adapter

OpenCode commands and agents move to `hosts/opencode/` in the repository but deploy to their existing native `commands/` and `agents/` destination paths. They own:

- slash-command syntax, `$ARGUMENTS`, command substitutions, and agent routing;
- OpenCode `question` use and same-child clarification where required;
- exact permission allow/ask/deny patterns;
- OpenCode-specific edit mechanisms and result relay;
- installed-path mapping and restart guidance.

OpenCode adapters must remain thin: they may select and present shared runtime operations but may not restate or fork the workflow's semantic rules.

## Compatibility matrices

### V1 workflow surface

`Supported` means outcome and safety parity, not identical prompts or tool dialogs.

| Workflow | Pi package | OpenCode | Shared outcome / notes |
| --- | --- | --- | --- |
| `flow-audit` | Supported | Supported | Deterministic detection/check evidence plus bounded LLM review; fixes remain separately approved. |
| `flow-branch` | Supported | Supported | Existing-branch selection/update/delete through the deterministic runtime; delete and force-delete gates remain distinct. |
| `flow-build` | Supported | Supported | Guided project documentation generation from the same phase resources. |
| `flow-commit` | Supported | Supported | Prepare, author, seal, approve once, execute, and verify the existing runtime contract. |
| `flow-debt` | Supported | Supported | Project-local debt lifecycle; risky or ambiguous apply stops for approval. |
| `flow-docs-sync` | Supported | Supported | Previewed incremental documentation updates and cache update after successful content changes. |
| `flow-playbook-sync` | Supported | Supported | Previewed project/playbook comparison; content changes require approval. The stale claim that Flow PR invokes it automatically is removed. |
| `flow-pr` | Supported | Supported | Prepare, bounded semantic intent edit, approve once, execute, and verify the existing PR runtime contract. |
| `flow-refactor` | Supported | Supported | Read-only scoped refactoring audit. |
| `flow-request` | Supported | Supported | Cross-project request create/resolve/check contract with explicit file-write boundaries. |
| `flow-ui` | Supported | Supported | Read-only UI compliance audit using the shared support resource. |
| `ui-design-system` | Support resource | Support resource | Non-invokable reference consumed by `flow-ui` and `flow-refactor`. |

### Host behavior

| Capability | Pi | OpenCode |
| --- | --- | --- |
| Distribution | Declared package resources | Verified repository-to-host managed deployment |
| User invocation | Natural discovery or `/skill:flow-*` | `/flow-*` commands |
| Clarification | Pi conversation | OpenCode `question` or adapter-defined same-invocation interaction |
| Mutation approval | Pi permission prompt when active, otherwise explicit conversational confirmation | Exact OpenCode permission `ask` boundary where supported |
| Runtime location | Package-relative resource | Manifest-mapped installed `scripts/` path |
| Permission ownership | User/project Pi settings | OpenCode configuration and adapter permission frontmatter |
| Configuration mutation by Flow | Never | Never |
| Unsupported capability | Clear `unavailable`; no simulation | Clear `unavailable`; no broadened permission |

### Legacy surface

| Legacy surface | V1 disposition | Migration guidance |
| --- | --- | --- |
| `/flow-auto-deliver` | Removed alias | Use `flow-commit`; no PR, push, or delivery behavior is implied. |
| `/flow-figma` | Removed orphan command | No equivalent v1 workflow; use `flow-ui` only for audit, not Figma-to-code generation. |
| `/flow-skills-sync` | Removed as an end-user workflow | Use repository-local deploy/status tooling; maintainers use the explicitly named reconciliation command only for exceptional import. |
| README `flow-finish` / `flow-release` claims | Removed stale documentation | Use only workflows present in the v1 matrix; no replacement is claimed. |
| Root `commands/` and `agents/` repository paths | Relocated | Live OpenCode destination paths remain unchanged; only repository maintainer paths move. |
| `node install.mjs` | Retained OpenCode compatibility entry point for one migration release | Pi users use `pi install`; OpenCode users may use the root preview/apply bootstrap. |
| Snapshot flags on `scripts/flow-skills.mjs` | Rejected | Use explicit `tools/flow-assets.mjs reconcile ...`; no automatic direction inference. |

Migration documentation must list every current command and skill, including retained entries, so absence cannot be mistaken for an oversight.

## Host manifests and provenance

### Manifest model

Both `hosts/pi/flow-assets.json` and `hosts/opencode/flow-assets.json` use `flow-host-assets/v2` and contain:

- exact `host` and `distribution.kind`;
- supported workflow IDs and adapter capabilities;
- sorted source selectors rooted in the repository;
- source-to-destination mappings where a mutable destination exists;
- explicit protected/excluded scopes;
- no absolute machine path, credential, timestamp, or live-host metadata.

Pi entries use package-relative targets and have no writable host destination. OpenCode entries map repository sources to destination-relative paths, for example:

```json
{
  "source": "hosts/opencode/commands/flow-commit.md",
  "destination": "commands/flow-commit.md",
  "role": "adapter"
}
```

Shared skills and runtimes are mapped similarly without duplicating their bytes. Source patterns may select files for lock generation, but apply/delete ownership is always the lock's exact expanded destination list. A wildcard never grants deletion authority.

### Lock and generation model

`flow-generation.lock.json` uses `flow-generation-lock/v2`. Its `generationId` is SHA-256 over canonical UTF-8 JSON containing:

1. a fixed schema/version;
2. the digest of the public package metadata projection (`name`, `version`, `engines`, `pi`, and `files`);
3. the two host manifest digests, sorted by host;
4. the sorted union of distributable source records `{path, sha256, bytes, mode}`.

Host lock files and `flow-generation.lock.json` itself are excluded from this payload, avoiding a self-referential digest. Timestamps are excluded so the same repository bytes reproduce the same generation.

Each host lock uses `flow-host-assets-lock/v2` and records:

- `host`, `distribution.kind`, shared `generationId`, and manifest digest;
- exact source and destination-relative path where applicable;
- SHA-256, byte length, mode, and executable bit;
- host-specific totals;
- `hostIdentity`, computed from the canonical host-lock payload before adding `hostIdentity`.

Therefore Pi and OpenCode identities are distinct while both point to the same canonical generation. Historical deployment additionally binds repository commit and tree OIDs in the immutable deployment plan; commit/tree are not embedded in checked-in locks because that would be self-referential.

For OpenCode, a successful apply writes `.flow-skills/hosts/opencode.json` transactionally. The marker records host, generation ID, host identity, target commit/tree, plan ID, and the exact owned destination paths. It is control evidence, not authority to widen ownership. Missing or malformed markers fail closed; migration from v1 uses only the exact paths verified by the selected v1 lock.

For Pi, the package itself contains the Pi manifest and lock. Pi/npm owns package placement. Flow verification checks packaged bytes and package metadata but does not write a second live ownership marker.

## Installer and asset-engine evolution

`tools/flow-assets.mjs` becomes a strict router over parameterized modules while preserving existing algorithms:

- `verify --host pi|opencode` verifies the selected host lock plus common generation lock;
- `deploy --host opencode --ref <ref> --dry-run` builds a read-only plan;
- `deploy --host opencode --ref <ref> --apply --expected-target-commit <sha> --expected-plan-id <id>` applies it;
- `reconcile --host pi|opencode --source <absolute-path> --dry-run` is the only live-to-repository preview;
- reconciliation apply requires the same explicit host/source plus expected repository commit and plan ID.

There is deliberately no `deploy --host pi`: `pi install`, `pi update`, and `pi remove` own Pi package state. There is no default reconciliation source or host, no direction inference, and no reconciliation call from install, deploy, status, verify, or package discovery.

`install.mjs` remains a small OpenCode compatibility adapter for one migration release. Its no-argument behavior remains a read-only OpenCode `HEAD` preview, and apply still requires target commit and plan ID. Help and JSON output state `host: "opencode"` and direct Pi users to package installation. `--host pi` fails with that guidance rather than copying package assets. A later major release may remove this compatibility entry point after documented notice.

Historical restore remains supported. The generation reader selects v2 when the target tree contains v2 manifests/locks and falls back to the existing v1 `flow-assets.json` and `flow-assets.lock.json` parser for older refs. Archived commits are never rewritten. V1 validation remains strict and read-only except when deploying that verified historical generation.

## Managed deployment data flow

```text
ref
 -> resolve immutable commit/tree with literal git argv
 -> read manifests/locks from that tree
 -> verify generation + host identity + every source blob
 -> read exact prior-owned destination state
 -> build sorted add/change/delete plan and postconditions
 -> hash complete plan identity
 -> adapter presents preview and obtains approval
 -> apply re-resolves and revalidates identity
 -> acquire host-scoped lock
 -> freeze source blobs
 -> create and verify persistent backup
 -> stage writes and journal transaction
 -> mutate exact mapped destinations only
 -> write installed provenance marker
 -> verify exact target state and protected-file preservation
 -> commit transaction or recover pre-state
```

The plan identity includes host, distribution kind, requested ref, commit/tree, common and host lock digests, generation and host IDs, destination root identity, current exact managed state, installed marker digest, sorted operations, backup schema, and expected postconditions. Any change requires a new preview and approval.

Host configuration, secrets, credentials, providers, caches, sessions, receipts, review state, unrelated scripts/skills, and paths outside the exact current/previous lock union are never read into a plan, backed up as Flow data, overwritten, deleted, or claimed. A collision at a new target path that is not proven previously Flow-owned blocks instead of replacing the file.

## Exceptional reconciliation

Reconciliation is intentionally less convenient than deployment:

- It is available only from the repository-local tool, not an installed end-user skill or command.
- `--host`, absolute `--source`, and `--dry-run` are mandatory for preview.
- Preview compares explicit host adapter mappings against the current repository commit and reports direction as `live host -> repository`.
- The plan classifies adapter-owned changes as importable. Differences in shared `skills/`, `scripts/`, manifests, locks, package metadata, or control files are report-only and must be authored normally in the repository; a host cannot redefine shared semantics or runtimes.
- Apply requires explicit host/source, the preview's exact repository commit and plan ID, and a fresh host-native human approval. It never commits, pushes, publishes, deploys, or modifies host state.
- Apply changes only the approved adapter paths, regenerates both host locks and the common generation lock from repository bytes, and verifies the complete integrity set.
- The repository worktree, source bytes, affected destination preimages, manifests, and lock preimages are all identity-bound. Unrelated dirty files are preserved. Drift makes the plan stale before writes.
- Repository writes use the existing lock, journal, freeze, atomic replacement, rollback, and postcondition patterns. Failed reconciliation restores every affected repository preimage and preserves recovery evidence if restoration cannot be proven.

This keeps reconciliation useful for a deliberate adapter correction without restoring the old live-host-as-authority model.

## Testing seams

The implementation keeps `node:test`, `node:assert/strict`, temporary filesystems/repositories, fake executables, and zero runtime dependencies.

| Seam | Required evidence |
| --- | --- |
| Portable core | Registry/resource completeness; forbidden host tokens and paths absent from shared skills; relative resources resolve inside the package; existing workflow outcome contracts still pass. |
| Pi package discovery | A packed-package fixture contains only the allowlisted files; a Pi-discovery fixture reads `package.json.pi.skills`, discovers every supported skill without an OpenCode directory, and rejects missing/malformed `SKILL.md` resources. |
| Pi isolation | Tests run with absent/poisoned OpenCode paths and prove package discovery/runtime resolution does not read them. No test mutates real Pi settings. |
| OpenCode adapter | Command/agent tests cover routing, `$ARGUMENTS`, clarification behavior, exact permission patterns, and thin references to shared contracts. Existing agent safety assertions move to adapter tests. |
| Compatibility matrix | Every registry workflow has both host claims, resources, documentation, and any runtime; legacy names are absent or explicitly rejected with migration guidance. |
| Integrity | Canonical generation reproducibility, distinct host identities, shared generation ID, complete sorted records, tamper rejection, package metadata binding, and no absolute/sensitive data. |
| Deployment | Parameterized versions of current preview, stale-plan, literal-argv, backup, transaction recovery, collision, unrelated-file, marker, historical-v1, and postcondition tests. |
| Reconciliation | No implicit entry path; preview is read-only; shared/runtime differences are non-importable; exact adapter import requires identities; stale/concurrent/failure cases preserve repository and host bytes. |
| Cross-platform | Existing CRLF/blob and mode tests remain; unsupported executable-bit/symlink checks report capability limitations and are not counted as passes. |
| Release candidate | `node --test tests/*.test.mjs` passes; skips are reported separately. Package publication and real-host deployment are not test side effects. |

Focused test files should align with boundaries, for example `multihost-core`, `pi-package`, `opencode-adapter`, `flow-assets-generation`, `flow-assets-deploy`, `flow-assets-reconcile`, and `legacy-migration`. Existing workflow runtime tests remain the regression suite and should not be rewritten merely to rename host adapters.

## Migration and rollout sequence

The repository may land the architecture incrementally, but no multihost release is publishable until the common generation, both host identities, package resources, adapters, migration guide, and full verification agree.

### Review slice 1: contracts without distribution change

Add the workflow registry, host-adapter contract, v2 schemas, and validation tests while current OpenCode layout and v1 deployment remain active. This creates enforceable boundaries without exposing an incomplete Pi package. Rollback removes only new contract files and tests.

### Review slice 2: portable core by workflow family

Remove host assumptions from shared skills in coherent families while updating the corresponding current OpenCode command/agent in the same slice so OpenCode remains functional. Suggested review families are read-only audits, content-writing workflows, and bounded Git/GitHub mutations. Preserve runtime behavior and tests. Do not add `package.json.pi` until every declared skill passes the host-neutral check.

### Review slice 3: Pi package boundary

Declare explicit Pi resources, add the Pi manifest/lock and package-discovery tests, and make Pi the leading documentation path. This slice is independently testable through a local packed package and does not publish it. Rollback removes the Pi declaration and files without touching OpenCode.

### Review slice 4: dual-host integrity and OpenCode mapping

Add common/host locks, parameterize the deployment engine, move repository command/agent sources under `hosts/opencode/`, and keep their live destination paths unchanged through mappings. Retain the v1 historical reader and root installer compatibility path. Rollback uses the still-supported v1 generation and prior source layout.

### Review slice 5: exceptional reconciliation and legacy cleanup

Replace snapshot authority with the explicit adapter-only reconciliation path; remove `flow-skills-sync`, orphan/alias surfaces, and stale documentation; add the complete migration matrix. This slice must prove ordinary deploy/verify paths cannot call reconciliation. Rollback restores only the previous adapter UX, never imports live state.

### Release gate

After all slices are integrated, regenerate all three locks from one clean repository state, run focused suites and the canonical full suite, inspect package contents, and produce release notes. Package publish and any live Pi/OpenCode change require separate human authorization.

These are architecture review boundaries, not an implementation task list or an approved chain strategy. The expected implementation spans multiple review areas and almost certainly exceeds the configured 400 changed-line budget. During task planning, `ask-on-risk` must pause for a delivery decision if the concrete forecast confirms that risk; no `size:exception` or chain strategy is inferred here.

## Rollback

| Failure point | Rollback |
| --- | --- |
| Before release | Revert the affected review slice; no host or package state has been changed. |
| Pi package regression | Pin/install the previous package version or git ref through Pi's package manager, then verify discovered resources. Flow does not copy over Pi settings or package directories. |
| OpenCode deployment failure | Transaction recovery restores exact pre-state; persistent verified backup and evidence remain. Re-preview before retrying. |
| Defective current OpenCode adapter | Deploy the previous verified repository ref through the v2 engine's v1 fallback, bound to a fresh preview. |
| One host unsupported after release | Withdraw that host/workflow support claim or fix forward. Do not change shared semantics to mimic a missing host capability. |
| Reconciliation failure | Restore affected repository preimages through its transaction journal; preserve evidence if exact recovery cannot be proven. Never deploy or publish the partial repository. |
| Full product rollback | Revert to one prior reviewed repository generation, regenerate no historical artifacts, and roll each host back through its own distribution mechanism. |

Rollback never deletes unrelated host files, edits host settings, rewrites Git history, imports live state, or claims successful recovery without postcondition verification.

## Security and safety invariants

- All external values remain individual argv elements with `shell: false`; refs beginning with option-like or control content fail safely.
- Every repository and destination path is absolute, canonicalized, contained, and checked for symlink/reparse traversal.
- Host manifests cannot name protected scopes; lock expansion cannot introduce paths absent from the manifest.
- Apply authority is exact, short-lived through state binding, and invalidated by any source, destination, manifest, lock, marker, or target-ref drift.
- Backups are outside managed mappings, private where the platform supports it, complete for prior owned files, and verified before mutation.
- Windows mode limitations never weaken byte/hash/path verification and remain explicit capability results.
- Host configuration and permission files are outside Flow ownership even if an adapter reads host capabilities.
- Package installation executes under Pi's security model; documentation must continue to tell users to review package source before installation.
- No automatic operation reads host state as repository input.

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Duplicate complete Pi and OpenCode skill trees | Creates semantic drift and a very large recurring review surface. |
| Copy package assets into `.pi` or global skill directories | Contradicts Pi package-resource distribution and would make Flow compete with host ownership. |
| Universal permission API in the core | Neither host guarantees the same interaction or enforcement mechanism. |
| One lock for both hosts | Conflates destinations, ownership, package content, and provenance. |
| Keep snapshot as ordinary sync | Preserves authority ambiguity and makes accidental live-to-repository import too easy. |
| Rewrite deterministic workflow runtimes | No evidence requires it; it would add risk without improving the host boundary. |
| Generate host adapters from the core | Generated prose would obscure review and could silently widen permissions; adapters remain small reviewed source files. |
| Put commit OIDs in checked-in generation locks | The lock contributes to the commit tree and would create a self-reference. Commit/tree binding belongs in runtime deployment plans. |

## Open questions

None block architecture. The public package source may be npm, git, or local path because Pi uses the same declared resources for all three. Choosing and authorizing an npm publication name/version remains a release decision, not a design or implementation assumption.
