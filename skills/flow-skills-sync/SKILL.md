---
name: flow-skills-sync
description: "Trigger: /flow-skills-sync. Guide or run preview-first snapshots and confirmation-bound restores."
trigger: /flow-skills-sync command
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.2"
---

# flow-skills-sync

## Activation Contract

Use for `/flow-skills-sync`, live-to-repository snapshots, synchronization status, or restoring a historical Flow generation.

## Hard Rules

- Live OpenCode is the snapshot source; `flow-skills` is the versioned mirror and restore authority.
- Preview before every apply. Apply only after explicit confirmation bound to the preview's immutable target commit and exact `planId`.
- Never infer direction from drift and never auto-apply.
- Never fetch, pull, checkout, reset, install, publish with Git, or mutate `opencode.json`.
- Forward structured arguments; never parse prose or infer authority IDs.
- On stale target/plan errors, discard confirmation and preview again.

## Argument Routing

- Treat empty and whitespace-only `$ARGUMENTS` as a guided invocation. Follow **Guided No-Argument Workflow** instead of invoking the wrapper without arguments.
- For non-empty `$ARGUMENTS`, forward the original value unchanged:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs $ARGUMENTS
```

The wrapper's zero-argument usage error remains intentional for direct automation. Do not weaken or bypass it.

## Guided No-Argument Workflow

1. Run this read-only comparison preview as the first and only initial command:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs --snapshot --dry-run
```

2. If preview counts are `add: 0`, `change: 0`, and `delete: 0`, report that live OpenCode and the Git mirror are synchronized, then stop.
3. If any drift exists, do not infer its direction. Use the OpenCode `question` tool once to ask for exactly one action choice:
   - **Snapshot**: Snapshot live OpenCode into the repository, live OpenCode -> Git mirror.
   - **Restore HEAD**: Restore repository HEAD into live OpenCode, repository `HEAD` -> live OpenCode.
   - **Cancel**: make no changes.
4. The selected action never authorizes apply.

### Snapshot Choice

Reuse the already-generated exact snapshot preview and `planId`; do not invoke a second preview:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs --snapshot --dry-run
```

Present counts, operations sorted by path, and the exact `planId`. State clearly that this direction is live OpenCode -> Git mirror. Then request explicit confirmation bound to that exact `planId`.

Apply only after that confirmation, using the same exact `planId` and the required snapshot metadata:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs --snapshot --apply --expected-plan-id <planId> --captured-at <timestamp> --opencode-version <version> --gentle-ai-version <version>
```

### Restore HEAD Choice

Run only:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs restore HEAD
```

Present the immutable target commit and tree, counts, operations sorted by path, exact `planId`, blockers, and the persistent pre-restore backup policy. State clearly that this direction is repository `HEAD` -> live OpenCode and that repository freshness is user-controlled; do not claim that restore updates from remote main. Then request explicit confirmation bound to both the exact target commit and exact `planId`.

Apply only after that confirmation:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs restore HEAD --apply --expected-target-commit <sha> --expected-plan-id <planId>
```

### Cancel Choice

Run no additional command. Report that the operation was cancelled and no mutation occurred.

## Decision Gates

| Request | Action |
| --- | --- |
| Empty or whitespace-only arguments | Run the guided snapshot comparison workflow. |
| Status | Run `--status`; report `0/0/0` when synchronized. |
| Snapshot | Preview with `--snapshot --dry-run`; require explicit authorization before its existing apply contract. |
| `restore <ref>` | Initial call only previews; it NEVER implies apply. |
| Confirmed restore | Apply the same ref with the preview's exact target commit and `planId`. |

## Execution Steps

1. Route arguments before execution. Preserve every non-empty argument unchanged.
2. Run status or snapshot through `node ~/.config/opencode/scripts/flow-skills.mjs` using the existing arguments.
3. For restore, run only:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs restore <ref>
```

4. Present the requested ref, immutable target commit/tree, counts, sorted operations, `planId`, persistent backup policy, and any legacy-ref blocker.
5. Ask for explicit confirmation binding that target commit and `planId`.
6. After confirmation, run the same ref and exact IDs:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs restore <ref> --apply --expected-target-commit <sha> --expected-plan-id <planId>
```

7. If authority is stale, return to preview and request new confirmation. On success, report verification/recovery, persistent backup ID/path, and that an OpenCode restart is mandatory.

## Output Contract

Return mode, ref, target commit/tree, counts/operations, `planId`, confirmation state, blockers, and apply backup/recovery/verification details when present.
