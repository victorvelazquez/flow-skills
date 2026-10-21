# Save mode (`-s [topic]`)

Prepares what was studied for the Obsidian vault. Shared rules H1-H10, config and vault layout, indexes and queue format (C2) live in `SKILL.md` and `vault-conventions.md`; note format lives in `note-structure.md` and `assets/topic-template.md`; glossary entries follow `glossary.md`. Do not restate them here. Everything shown or written is in the configured language (H1).

## Modes

- `-s`: the whole conversation is the source.
- `-s <free text>`: only the part of the conversation about that text (matched by meaning, not exact words). Nothing discussed about it -> say so and stop; never invent content, never research to fill the gap.
- Both cover studied lessons, follow-up Q&A and spontaneous learnings from a session that never called `/flow-learn` (S8): reconstruct what was understood from the conversation itself.
- If the visible conversation looks compacted or truncated, say so before the plan and ask whether to continue with what is visible.
- Writes happen only after the gate below (H4).

## Steps

1. Read the vault inventory: global and category `_index.md`, note file names and aliases, `_pendientes.md`, glossary headings. Missing vault files are created only by the write order below; a structure that does not match the convention stops the mode (H5).
2. Extract candidates: concepts, tools and protocols explained, corrections found in Q&A, vocabulary, newly surfaced topics.
3. Split (rule below), then classify each note.
4. Show the plan, run the gate, draft, write, read back, report.

## Split rule

- Own note: a technology or concept understandable alone AND with enough content for TL;DR + what/why/how.
- Intersection (e.g. "Keycloak on Docker"): a section of the primary note that links the other note; not a third note.
- Thin item: glossary candidate, not a note.
- Project-specific or private details: excluded, generalized or omitted (H6).
- Candidate matching an existing note (file name or alias): an UPDATE of that note (add or change sections, merge `sources`, bump `updated`, keep user edits), never a duplicate (H5).
- Past ~1200 words for one topic: hub note + sub-notes per `note-structure.md`.

## Classify

For each note: category (fixed list), type, slug (H3), aliases, related existing notes, `depth: standard`, `origen` (`investigación` when backed by sources gathered in the session, otherwise `conversación`, unverified, H7). Notes are DISTILLED: shorter than the conversation, keep corrections found in Q&A, follow `note-structure.md`.

## Plan (chat)

Terminal-safe output, no headings or tables. Show:

- **📝 Notas:** per note `NEW|UPDATE`, path, origin and verification state, then the FULL text exactly as it will be written (frontmatter and Mermaid included: this is a preview of a file, so the chat formatting rule does not apply to it) so the user can re-read everything. With more than 2 notes, show the first two in full and the rest as TL;DR + outline; the user types `ver <slug>` to see another in full.
- **📖 Glosario:** proposed terms by name with their category (included by default).
- **📌 Cola:** lines to remove (resolved topics, `[~]` lines resolved), concepts to add as `desde [[slug]]`.
- **📂 Archivos a tocar:** exact paths (notes, backlink targets, indexes, glossary files, `_pendientes.md`).

## Gate

The plan is the FINAL message of its turn (H11); no selector follows it. End with: `Respondé: guardar · verificar (solo si hay contenido de conversación) · ajustar <qué> · saltar <slug> · ver <slug> · cancelar`. `ajustar` re-plans and shows the plan again; nothing is written until a typed `guardar` (or `verificar`).

- Verificar: research sources per H7 (official docs first, URL + access date), update `origen`/`sources`, show the changed plan lines, then write without a second gate unless the plan changed beyond verification. No web tool -> say so; continue only if the user accepts unverified content.
- Saltar `<slug>`: that note is not written and its glossary and queue changes are dropped; show the updated plan.
- Cancelar: write nothing.

## Write order

1. New and updated notes.
2. Backlinks: a bullet in `## 🔗 Relacionados` of each related existing note (read first, add only the bullet, H5).
3. Indexes: category `_index.md` and the global categories table (C2).
4. Glossary entries per `glossary.md`; add the `- Estudio: [[slug]]` line to existing entries of saved topics.
5. Queue: remove resolved lines, resolve `[~]` lines, add new `desde [[slug]]` lines (dedupe per C2).

Stop at the first failure and list what was already done and what was not (H9). Read every written file back before claiming success.

## Report

Terminal-safe, concise. Bold labels: **✅ Notas** (created/updated), **🔗 Backlinks**, **🗂️ Índices**, **📌 Cola** (removed/added), **📖 Glosario** (terms), **⚠️ Sin verificar** (conversation-origin notes, with the offer to verify via `-u`), **📊 Pendientes** (remaining count and the `/flow-learn -l` hint).
