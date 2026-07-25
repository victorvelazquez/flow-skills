# Reviewed Delivery Policy

Flow reads the repository-local Git setting `flow.reviewLifecycle`:

| Value | Behavior |
| --- | --- |
| `required` | Require the public Gentle AI CLI and coherent structured authority at every lifecycle gate. |
| `optional` | Default. Preserve grouping only when the CLI is absent or authoritative structured status proves the authority inventory is empty; otherwise fail closed. |
| `disabled` | Do not consult review authority; preserve normal Flow grouping. |

Configure it with `git config flow.reviewLifecycle required|optional|disabled`.

The `flow-review-delivery/v1` adapter uses only public CLI commands. It never reads `.git/gentle-ai`, receipt files, schemas, binaries, or English error text. For pre-commit planning it creates an isolated temporary Git index, stages all and only target paths there, and removes it after validation. The real index and worktree remain unchanged during dry-run.

Explicit structured `deliveryConstraints` take precedence. For Gentle AI 2.1.6 compatibility, an allowed structured validation whose lineage, revision, candidate tree, and paths match the exact candidate resolves conservatively to one physical reviewed-delivery commit. Work units remain metadata.

Flow fails closed on invalidated, escalated, correction-required, or ambiguous authority; missing required CLI/authority; denial; malformed structured output; path/tree mismatch; plan drift; partial staging; incompatible commit topology; or lifecycle drift. It never repairs incompatible commits automatically.

The native contract cannot distinguish target-specific absence from an outage when other lineages exist, so optional mode deliberately blocks failed validation in that case rather than risking unreviewed grouped delivery.

When native discovery reports more than one applicable review lineage, rerun planning with `--lineage <id>`. Flow appends that option only when it was explicitly supplied; it never selects or falls back to another lineage. The native validation response must name the requested lineage. The selected lineage is part of `planId`, must be repeated during execution, and remains bound through final staged validation.
