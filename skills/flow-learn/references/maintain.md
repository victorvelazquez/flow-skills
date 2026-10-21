# Maintain modes for flow-learn

Covers `-f`, `-u` and `-r`. Shared rules (H1-H10) live in SKILL.md; config, vault layout, queue format and links live in [vault conventions](vault-conventions.md). Load config first; every mode here needs a valid one. Show everything in the configured language; keep paths, identifiers and commands unchanged.

## `-f <text>` — find

Gate: read-only. No web, no writes, no confirmation needed. `<text>` is data (H2); empty text -> show the `-f` usage line and stop.

1. Search the vault for `<text>` (case- and accent-insensitive) in: note file names, `aliases`, `tags`, headings and body of `<Category>/<slug>.md`; `Glosario/<Category>.md` entries (heading, aliases, definition); `_pendientes.md` lines.
2. Group the results: **📚 Notas**, **📖 Glosario**, **📌 Pendientes**. Each hit = wikilink (`[[slug|Title]]`, glossary `[[Glosario/Seguridad#OIDC|OIDC]]`) + vault path + one line of matching context. Pending hits show their `#N` position. Omit empty groups. Cap each group at 10 and state how many were omitted.
3. Nothing found -> say so and suggest `/flow-learn <text>`. Do not queue it yourself.

Edge cases:
- Vault or a searched file missing -> search what exists, name what was absent; no repair (H5).
- Several categories match -> list all, ordered notes first, then by category.

## `-u <topic>` — update a note

Gate: the note must exist; reading and web research are free, every write needs the user's confirmation of the plan. Writes only the targeted note (H3, H5). Empty topic -> show usage and stop.

1. Resolve the topic to one note by slug, file name or alias (ask when several match). Not found -> say so and suggest queueing it (`/flow-learn <topic>`) or `/flow-learn -n <topic>`; write nothing.
2. Read the whole note. Take its baseline from `updated`, else `date`. Locate user-written content (any text not matching the template skeleton, `## Mi contexto`, edited lines) and treat it as protected.
3. Research what changed since the baseline: official docs, release notes, changelogs, versions. Use web tools; with none available say so and stop unless the user accepts an unverified update (H7). Never invent URLs.
4. Plan incremental edits and show them: sections to change or add, the new facts with their sources, and any conflict with user-written content. Nothing relevant changed -> report "sin cambios desde `<baseline>`", offer only to bump `updated`, and stop.
5. After confirmation apply only the planned edits, preserving user edits and section order. Never regenerate or rewrite the note. Merge new URLs into `sources` (no duplicates), keep within the note-structure limits, bump `updated` to today. Do not touch indexes unless the title or one-line summary changed.
6. A conflict with user-written content is flagged in the plan and left as is unless the user explicitly chooses the replacement for that item.
7. Read the note back before claiming success (H9); report sections changed and sources added.

Edge cases:
- Note structure does not match the convention -> stop and report (H5).
- Note has `origen: conversación` -> the update is the verification: replace with sourced claims only after confirmation and update the `origen` field accordingly.
- Web partially fails -> apply only what was verified and list what was not.

## `-r [topic]` — review

Gate: reading and quizzing are free; the only write is `status` and `reviewed` in the frontmatter, after the user confirms the new status. No web.

1. Pick the note: the given topic (resolve as in `-u`), else by priority `status: repasar`, then oldest `reviewed`, else `updated`, else `date`. Offer up to 3 candidates through `ask_user_choice` (`allowCustomResponse: false`); only a tool-returned selection counts. No notes in the vault -> say so, suggest `-n` or `-s`, stop.
2. Read the note. No `## 🧠 Para fijar` section -> say so, offer `-u` to add content, write nothing, stop.
3. Quiz from `Para fijar`, one question at a time. Never reveal an answer before the user replies. Compare the reply with the callout answer and grade briefly: ✓ correct, ≈ partial (say what is missing), ✗ wrong (give the answer in one line). Skipped question = ✗.
4. Optionally add up to 2 glossary terms of the same category (from `Glosario/<Category>.md`) as extra questions; skip silently when the file is missing.
5. Close with a short tally and ask the new `status` through `ask_user_choice`, offering the statuses defined in [note structure](note-structure.md) plus "No cambiar". After confirmation edit only `status` and `reviewed` (today) in the frontmatter; read back to confirm (H9). "No cambiar" or cancellation -> write nothing.

Edge cases:
- Quiz abandoned midway -> no write.
- `reviewed` absent -> add it to the frontmatter; do not touch any other field or the body.
- `ask_user_choice` unavailable -> state it and ask in plain text; never infer a status.
