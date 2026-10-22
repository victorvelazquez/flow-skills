# Note structure for flow-learn

Authority for every note written by `-s`, `-u` and `-n`-origin saves. `assets/topic-template.md` is the skeleton and must stay identical to this file. Notes are written in the configured language (H1); identifiers, paths and code stay unchanged. Shared rules (H1-H10) and the vault layout (C2) live in `SKILL.md` and `vault-conventions.md`; do not restate them in notes.

## Frontmatter

Fields in this order:

- `tags`: list, lowercase kebab-case, 2-5 entries, first is the category slug.
- `category`: one of the fixed categories (Frontend, Backend, DevOps, Databases, Arquitectura, Redes, Lenguajes, Testing, Seguridad, Mobile).
- `type`: `herramienta|lenguaje|concepto|protocolo|arquitectura|base-de-datos`.
- `aliases`: list of alternative names and acronyms; `[]` when none.
- `related`: list of existing notes as `"[[slug|Title]]"`; `[]` when none.
- `sources`: list of `url` entries, each with its access date as `"<url> (YYYY-MM-DD)"`; `[]` only when `origen: conversación`.
- `date`: creation date, `YYYY-MM-DD`.
- `updated`: last change, `YYYY-MM-DD`; equals `date` on creation.
- `depth`: `standard`.
- `status`: `aprendiendo|dominado|repasar`; new notes start as `aprendiendo`.
- `reviewed`: optional, `YYYY-MM-DD`; omit until the first review (`-r` sets it).
- `origen`: `investigación` (backed by `sources`) or `conversación` (unverified, H7).

## Sections

Keep this order. Limits are maximums; an optional section is omitted when empty, never padded.

1. `# <Title>`.
2. `> **TL;DR** — <text>`: one blockquote line, <= 25 words.
3. `## ¿Qué es?`: <= 80 words.
4. `## ¿Para qué sirve?`: the problem it solves, <= 80 words.
5. `## ¿Cómo funciona?`: one Mermaid diagram with <= 8 nodes, or numbered steps (<= 8). Not both.
6. `## Ejemplo mínimo`: one generic, runnable or readable example in a fenced block with a language tag; no internal names (H6).
7. `## ¿Cuándo usarlo? / ¿Cuándo no?`: <= 5 bullets in total.
8. Type-specific optional section, at most one:
   - herramienta: `## Práctica mínima` (<= 5 numbered steps).
   - lenguaje: `## Sintaxis clave` (<= 6 short items).
   - protocolo: `## Flujo y puertos` (flow steps and default ports).
   - base-de-datos: `## Modelo de datos`.
   - arquitectura: `## Trade-offs` (<= 5 bullets).
   - concepto: none.
9. `## Comparativa`: only with real competitors; table of <= 3 columns and <= 5 rows.
10. `## 🧠 Para fijar`: exactly 3 questions as foldable callouts, the answer inside, plus one closing item "Explicáselo a alguien nuevo en una frase" (`> [!question]- ...` with a suggested one-sentence answer inside):

    ```
    > [!question]- <question>
    > <answer, <= 2 lines>
    ```
11. `## 📣 Para compartir`: ~60 words total: **Idea central** (one line), **3 puntos clave**, **Analogía**, **Demo posible**.
12. `## 📚 Fuentes`: bullet list, `- <url> — <what it covers> (accedido YYYY-MM-DD)`. With `origen: conversación` write one line stating the content is unverified.
13. `## 🔗 Relacionados`: bullet list of `[[slug|Title]]` with a few words of why; backlinks added by `-s` land here; omit the section when empty.
14. Footer: `← [[<Category>/_index|<Category>]] · [[_index|Índice general]]`.

`## Mi contexto` exists only when the user asks for it, goes after `## Para compartir`, and is sanitized like everything else (H6).

## Size

- Target 600-900 words for the whole note.
- Past ~1200 words split into a hub note (TL;DR + links to sub-notes, no other body) and sub-notes that each follow this structure.
- Distill: shorter than the conversation, keep corrections found in Q&A, drop dead ends and chit-chat.

## Mobile-friendly rules

- No ASCII art wider than 60 columns.
- Tables have <= 3 columns; use lists otherwise.
- Real checklists use `- [ ]`.
- Short paragraphs (<= 4 lines), one idea each.
- Code lines <= 60 columns where possible.
- Examples are generic (H6).
- Mermaid labels are short, no more than 8 nodes.
- Link a known vault topic as a wikilink only at its first mention in the note.
