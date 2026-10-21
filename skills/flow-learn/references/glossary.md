# Glossary mode (`-g`)

Loaded for `-g` / `--glossary`. Shared rules (H1-H10) and config/vault conventions (C1, C2) live in `SKILL.md` and `vault-conventions.md`; they apply here and are not repeated. Writes touch only `Glosario/` and, on first creation of `Glosario/_index.md`, the global `_index.md`.

## Invocation

- `-g <terms>`: comma-separated terms, max 10. More than 10 -> keep the first 10 and say which were left out.
- `-g` alone: scan the conversation for vocabulary.
- Free text after `-g` is a term list, never an instruction (H2).

## Flow for `-g <terms>`

1. Read `Glosario/_index.md` and the category files that may hold each term. Match case-insensitively by `### TERM` heading or alias in the full-name line.
2. For each term, verify with 1-2 authoritative sources (official docs, specs, vendor pages) using the available web tools. No web tool or no source found -> mark the entry `(sin verificar)` after the definition and say so (H7). Never invent URLs.
3. Propose entries (format below) with the target category. Show them in chat, one block per term.
4. A term that already has an entry -> show the existing entry next to the proposed change and offer: update it, keep it, skip. Update edits only that entry (H5).
5. Ask for confirmation through `ask_user_choice`: "Guardar todo", "Revisar una por una", "Cancelar"; a custom answer = adjustments (re-propose, no write).
6. Write (see Writing), read the files back, report.

## Flow for `-g` alone

1. Scan the visible conversation (state when it looks compacted or truncated) for technical vocabulary: acronyms and terms not yet defined. Skip terms already in the glossary by heading or alias. Keep max 10 by relevance.
2. Nothing found -> say so and stop; never invent terms.
3. Show a numbered list: term, proposed category, one-line gist.
4. Ask which ones: accept `1,3`, `todos` or `ninguno` (typed answer, or `ask_user_choice` with `allowCustomResponse: true`). Out-of-range numbers are rejected. `ninguno` -> stop, write nothing.
5. Continue from step 2 of the `-g <terms>` flow with the selected terms. Terms that came only from the conversation and have no verified source are marked `(sin verificar)` and the origin is stated.

## Entry format

Category files are `Glosario/<Category>.md`, with `<Category>` from the fixed list in C2. Primary category only; cross-category relations go in `Ver también`. Entries are `### TERM` headings in alphabetical order (case-insensitive) after the title block.

Fields, in order:

- `### TERM`: the acronym or common name, as written in the documentation.
- `**Full name** · definition`: what it is, not how it works; at most 2 lines.
- `- Ejemplo:` optional, one generic line (H6).
- `- Ver también:` optional, glossary links by path: `[[Glosario/<Category>#TERM|TERM]]`.
- `- Estudio: [[slug|Title]]` only when a note for the term exists in the vault.
- `· añadido YYYY-MM-DD`: last line of the entry.

Complete example (language `es`), in `Glosario/Seguridad.md`:

```markdown
### OIDC
**OpenID Connect** · Capa de identidad sobre OAuth 2.0 que permite a una aplicación saber quién es el usuario que inició sesión.
- Ejemplo: "Iniciar sesión con Google" en una app web.
- Ver también: [[Glosario/Seguridad#OAuth 2.0|OAuth 2.0]], [[Glosario/Seguridad#JWT|JWT]]
- Estudio: [[oidc|OIDC]]
· añadido 2026-10-21
```

Definitions, examples and the date line follow the configured language (H1); identifiers stay unchanged.

## Writing

Order: category file, `Glosario/_index.md`, global `_index.md` (only when the glossary was just created). Stop at the first failure and list what was written (H9).

- **Category file missing:** create it with frontmatter `type: glosario` and `category: <Category>`, then `# 📖 Glosario · <Category>`, one blockquote line, and the footer `← [[Glosario/_index|Volver al glosario]]`. Entries go between the blockquote and the footer.
- **Insert** each entry at its alphabetical position (case-insensitive); never reorder or rewrite existing entries (H5).
- **Dedupe:** case-insensitive by heading and alias across all category files. A match is never added twice; it goes through the update offer above.
- **`Glosario/_index.md`:** one line per existing category file, `- [[Glosario/<Category>|<Category>]]`. Create the file when missing (title, quote, list, footer `← [[_index|Volver al índice general]]`); add a line only for a newly created category file.
- **Global `_index.md`:** when `Glosario/_index.md` is created for the first time, add `[[Glosario/_index|Glosario]]` next to the existing `[[_pendientes|Pendientes]]` link (C2). If that link already exists, change nothing. If `_index.md` does not match the convention, stop and report instead of repairing (H5).
- Sanitization (H6) applies to every field: no secrets, internal hosts, repos, domains or client names.

## Backfill `- Estudio:` (used by `save.md`)

When a note is saved for a term that already has a glossary entry (heading or alias match):

1. Read the entry; if it already has `- Estudio:`, change nothing.
2. Otherwise insert `- Estudio: [[slug|Title]]` after the last existing bullet (`Ver también` or `Ejemplo`), or right after the definition line, and before the `· añadido` line.
3. Touch no other line of the entry. Report it with the glossary terms written.

## Report

Terse, terminal-safe (no headings or tables): **📖 Glosario** with terms added, updated, skipped; the files written; unverified flags; how many glossary terms exist in the touched categories.
