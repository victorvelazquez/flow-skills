---
name: flow-skills-sync
description: "Trigger: /flow-skills-sync. Preview and apply snapshots or confirmation-bound historical restores."
trigger: /flow-skills-sync command
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.1"
---

# flow-skills-sync

## Activation Contract

Use for `/flow-skills-sync`, live-to-repository snapshots, synchronization status, or restoring a historical Flow generation.

## Hard Rules

- Live OpenCode is the snapshot source; `flow-skills` is the versioned mirror and restore authority.
- Preview before every apply. Apply only after explicit confirmation bound to the preview's immutable target commit and exact `planId`.
- Never checkout, reset, pull, install, publish with Git, or mutate OpenCode configuration.
- Forward structured arguments; never parse prose or infer authority IDs.
- On stale target/plan errors, discard confirmation and preview again.

## Decision Gates

| Request | Action |
| --- | --- |
| Status | Run `--status`; report `0/0/0` when synchronized. |
| Snapshot | Preview with `--snapshot --dry-run`; require explicit authorization before its existing apply contract. |
| `restore <ref>` | Initial call only previews; it NEVER implies apply. |
| Confirmed restore | Apply the same ref with the preview's exact target commit and `planId`. |

## Execution Steps

1. Run status or snapshot through `node ~/.config/opencode/scripts/flow-skills.mjs` using the existing arguments.
2. For restore, run only:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs restore <ref>
```

3. Present the requested ref, immutable target commit/tree, counts, sorted operations, `planId`, persistent backup policy, and any legacy-ref blocker.
4. Ask for explicit confirmation binding that target commit and `planId`.
5. After confirmation, run the same ref and exact IDs:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs restore <ref> --apply --expected-target-commit <sha> --expected-plan-id <planId>
```

6. If authority is stale, return to preview and request new confirmation. On success, report verification/recovery, persistent backup ID/path, and that an OpenCode restart is mandatory.

## Output Contract

Return mode, ref, target commit/tree, counts/operations, `planId`, confirmation state, blockers, and apply backup/recovery/verification details when present.
