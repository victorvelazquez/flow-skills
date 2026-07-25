---
description: Push branch + create GitHub PR automatically with AI-generated PR Description and Jira Comment.
agent: gentle-orchestrator
---

Read the skill file at ~/.config/opencode/skills/flow-pr/SKILL.md FIRST, then follow its workflow exactly.

CRITICAL OWNERSHIP REQUIREMENT:

- Delegate fetch, push, PR, managed-label, tag-publication, and release execution only to `flow-pr-agent`.
- The parent `gentle-orchestrator` owns reviewer task delegation, correction decisions, and the `nextAction` loop; `flow-pr-agent` never delegates another agent.
- Oversized candidates require a preconstructed, explicit validated `flow-chain-plan/v2`; v1 publication fails closed and requires regeneration.
- Chain plan `integrationRef.name` and `productionRef.name` use canonical branch names. Legacy `origin/<branch>` is normalized only in those declared fields and is rejected when a literal branch makes it ambiguous.
- Ordinary execution requires the exact dry-run `planId`; chain publication requires exact dry-run `chainPlanId`. Only this `/flow-pr` flow may invoke `finalize_chain_tracker`; external state is evidence only, and every invocation freshly validates current native `pre-pr` authority before readiness reconciliation. Keep chain parent branches until all descendants merge; delete them only afterward with exact retained PR base metadata. It may mark an authorized tracker ready but never merge or retarget it.
- Never create/search GitHub Issues, add issue linkage, invoke `/flow-audit`, or reinstall retired skills.

PROMOTION LOOP:

- Delegate runtime actions only to `flow-pr-agent`; delegate each `delegate_lens` to the named reviewer task with its exact `executionKey`. The external `--lens-results-file` is one JSON array whose entries are exactly `{ "lens": "<returned lens>", "executionKey": "<returned executionKey>", "result": <reviewer JSON object> }`; never append raw reviewer JSON.
- After each reviewer returns, read the complete array, append or update that lens wrapper without changing the ordered prefix, write the complete array to an adjacent temporary file, then atomically rename it over the external lens-result file before re-running `--promotion-review`.
- Re-read `--promotion-review` after every result or action. Execute `start_review`, `finalize_review`, or `validate_receipt` only with the exact `coordinatorFingerprint` and `executionKey` returned for that action.
- On `await_status`, re-read status without retrying the ambiguous action. On correction, recovery, maintainer action, scope change, malformed state, or `stop`, stop for the explicit decision; never guess or restart at a gate.
- Continue to preparation only from `receipt_validated` with `promotionPlanId`; pass that exact ID and the explicit external coordinator-state path to both preparation and publication. Publication remains delegated to `flow-pr-agent` after preparation succeeds.

CONTEXT:

- Working directory: !`echo -n "$(pwd)"`
- Current project: !`echo -n "$(basename $(pwd))"`
- OS: !`node -e "process.stdout.write(process.platform)"`
