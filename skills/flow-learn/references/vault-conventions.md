# Vault conventions for flow-learn

Shared by every mode. Mode-specific detail lives in the other references.

## Config

Path: `~/.config/flow-skills/learn.json` (Windows `%USERPROFILE%\.config\flow-skills\learn.json`).

```json
{"vault": "<absolute path>", "language": "es"}
```

`language` defaults to `es`; accepted `es|en`. No environment variable.

Missing or invalid config:

1. Ask for the vault path in plain text and expand `~`.
2. Check it is an existing directory.
3. Show the exact config path and content; write only after confirmation.
4. Invalid JSON: report it and ask before replacing the file.

Every mode except `-h` needs a valid config. `-h` shows the command list, plus the pending count when the vault is configured.

## Vault layout

```
_pendientes.md
_index.md
<Category>/_index.md
<Category>/<slug>.md
Glosario/_index.md
Glosario/<Category>.md
```

Categories (fixed): Frontend, Backend, DevOps, Databases, Arquitectura, Redes, Lenguajes, Testing, Seguridad, Mobile. At most 2 folder levels; a subfolder only with 3+ sub-topics of one parent.

## Queue: `_pendientes.md`

Header `# 📌 Pendientes de estudiar`, one blockquote line, then one line per topic:

```
- [ ] <topic> — <context> · <YYYY-MM-DD>
```

- State: `[ ]` pending; `[~]` studied in a conversation but not saved.
- Context is optional, <= 80 chars: what it is, `desde [[slug]]`, or `mencionado en la conversación`.
- The number `-l` shows is the line position.

### Add (`/flow-learn topic[, topic]`)

1. Dedupe each topic by slug against the queue, existing notes (filename and aliases) and glossary headings. If already present, report where and add nothing for it.
2. Create the file when missing, then append the line.
3. Confirm in one line: `➕ <topic> agregado (#N). Total: M pendientes.`

### Drop (`-d <n|topic>`)

1. Resolve by current position or slug match; ask when several match.
2. Show the exact line and remove it only after confirmation.
3. Never touch notes.

## Indexes (maintained on save)

- Category `_index.md`: title, quote, `## Temas estudiados` with `- [[slug|Title]] — one line`, footer `← [[_index|Volver al índice general]]`. A legacy `## Temas investigados` heading is accepted and kept as is; a legacy `## 📌 Sugeridos para investigar` section is left untouched, never extended.
- Global `_index.md`: ONLY the `## 🗂️ Categorías` table (columns Categoría | Temas), plus links to `[[_pendientes|Pendientes]]` and `[[Glosario/_index|Glosario]]`. In table cells escape the wikilink pipe as `\|`; replace the `—` placeholder on the first topic, otherwise append `, [[Cat/slug\|Title]]`.
- No A-Z list and no "Sugeridos" sections.
- Per save, three places change: category index, global table cell, `_pendientes.md`.

## Backlinks

Add `- [[slug|Title]] — why` to the end of the existing `## 🔗 Relacionados` list of each related note. When that section holds a `### Ya investigados` or `### Ya estudiados` subsection, append to the end of that subsection, before any `### 📌 Sugeridos` subsection. When the note has no `## 🔗 Relacionados`, create it before the footer. Never edit any other line (H5).

## Links

- Notes link as `[[slug|Title]]`.
- Glossary entries link by path: `[[Glosario/Seguridad#OIDC|OIDC]]`.
- Link a known vault topic only at its first mention in a note.
