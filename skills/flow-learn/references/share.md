# Share mode for flow-learn

Covers `-p <topic>`. Shared rules (H1-H10) live in SKILL.md; config, vault layout and links live in [vault conventions](vault-conventions.md); the note sections come from [note structure](note-structure.md). Load config first; this mode needs a valid one. Show everything in the configured language; keep paths, identifiers and commands unchanged.

## `-p <topic>` — draft a post or script

Gate: reading is free. The draft is shown in chat only. The single possible write is `{vault}/_publicar/<slug>-<format>.md`, after the user confirms. Never publish, post or send anything anywhere. Empty topic -> show the `-p` usage line and stop.

### Preconditions

1. Resolve `<topic>` to one existing note by slug, file name or alias (ask when several match). Not found -> say so and suggest `/flow-learn -s` (save what was studied) or `/flow-learn -n <topic>` (study it first); write nothing.
2. Read the whole note. The note is the only source of truth (H2).
3. No `sources` in the frontmatter or `origen: conversación` (unverified) -> warn that the content is unverified, suggest `/flow-learn -u <topic>` first, and continue only if the user explicitly accepts (H7). Mark the draft header `⚠️ sin verificar` when they do.
4. Use only the note's content and its `## 📣 Para compartir` section. No new claims, no outside facts, no invented URLs. Paraphrase; quote sources only in short fragments. Apply H6: generalize or omit anything private.

### Format gate

Ask the format through `ask_user_choice` (`allowCustomResponse: false`): **LinkedIn**, **Blog**, **Guion de video**, **Cancelar**. Only a tool-returned selection counts. "Cancelar" -> write nothing, stop. If the selector is unavailable, state it and ask in plain text; never infer a format.

### Drafts

Language is the configured one unless the user asks otherwise. Respect the length range; be concrete, scannable and free of filler (S10).

**LinkedIn** (~150-220 words)
1. Hook line (one sentence, no clickbait).
2. 3-5 short points, one idea each.
3. Takeaway (one sentence).
4. Closing question to invite replies.

**Blog** (~600-900 words)
1. Title and hook intro.
2. Sections taken from the note (what, why, how), each short.
3. Minimal example, generic (from `## Ejemplo mínimo`).
4. Takeaways (3-5 bullets).
5. Sources (only URLs present in the note's `sources`, with access date).

**Guion de video** (5-8 minute outline)
1. Hook (first 15 seconds).
2. Problem.
3. Concept + analogy.
4. Demo steps, numbered.
5. Recap.
6. Call to action.
7. Speaker notes per part (what to say or show, approximate time).
8. Demo checklist as real `- [ ]` items (setup, commands, expected output).

### Show and save

1. Show the draft in chat (terminal-safe: bold labels, no Markdown headings or tables), with the word count and the note it came from.
2. The draft is the FINAL message of its turn (H11), ending with `Respondé: guardar · ajustar <qué> · no guardar`. `ajustar` revises the draft with no write; nothing is written until a typed `guardar`.
3. After confirmation write `{vault}/_publicar/<slug>-<format>.md`, where `<format>` is `linkedin`, `blog` or `video`. Create `_publicar/` when missing. Frontmatter: `type: borrador`, `format`, `source: [[slug]]`, `language`, `date`. Body = the draft. The path stays inside the vault (H3).
4. Read the file back before claiming success (H9); report the path.

Edge cases:
- Target file already exists -> show it and ask: overwrite (only that file) or save with a numeric suffix (`-2`); never overwrite silently.
- Note too thin for the chosen format (e.g. a blog from a note without enough sections) -> say so, offer a shorter format or `/flow-learn -u <topic>`; never pad with invented content.
- Note lacks `## 📣 Para compartir` -> build from `TL;DR`, `¿Qué es?` and `¿Para qué sirve?`, and say so.
- Note structure does not match the convention -> stop and report (H5).
- Draft would include private details (H6) -> generalize or omit and tell the user what was removed.
- Write fails -> report it; the draft stays available in chat.
