---
name: flow-skills-sync
description: "Preview and explicitly apply live OpenCode Flow snapshots to the local flow-skills mirror. Trigger: /flow-skills-sync."
trigger: /flow-skills-sync command
---

# flow-skills-sync

## Activation Contract

Use this skill when the user runs `/flow-skills-sync` or asks to inspect or snapshot live OpenCode Flow assets into the local repository mirror.

## Script Path

```bash
node ~/.config/opencode/scripts/flow-skills.mjs
```

## Workflow

1. Run read-only status when the user asks only for synchronization state:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs --status
```

2. Before every snapshot apply, run the read-only preview and present its counts, sorted operations, and `planId`:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs --snapshot --dry-run
```

3. Stop and request explicit user authorization for that exact preview. Do not infer authorization from an earlier request or from a previous preview.

4. Only after authorization, use the exact `planId` returned by that preview and provide all required metadata:

```bash
node ~/.config/opencode/scripts/flow-skills.mjs --snapshot --apply --expected-plan-id <planId> --captured-at <iso-timestamp> --opencode-version <version> --gentle-ai-version <version>
```

5. Report the engine result. If the plan ID is stale, preview again and request new authorization.

## Hard Rules

- Live OpenCode is the source; the flow-skills repository is the mirror.
- Preview is always the first snapshot step and is read-only.
- Apply only after explicit user authorization for the exact preview `planId`.
- Never use Git to publish, commit, push, pull, or fetch.
- Never run installation or mutate OpenCode configuration.
- Never infer modes or parse prose; trust the engine's structured result.
- Stop on missing paths, missing metadata, verification failure, or stale plan identity.

## Output Contract

Return the status or plan counts, sorted operations, `planId`, authorization state, and final verification result when an apply was authorized.
