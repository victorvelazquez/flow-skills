---
name: flow-branch
description: Interactive branch switcher — lists local+remote branches sorted by date, switch with pull prompt, delete local branches. Zero-AI git branch manager.
trigger: /flow-branch command
---

# /flow-branch

> Zero-AI command. No analysis, no decisions. Follow the steps exactly.

---

## PROTECTED BRANCHES

Never allow deletion of: `main`, `master`, `dev`, `development`

---

## Step 1 — Fetch and build branch list

Run:

```
git fetch origin
git branch -a --sort=-committerdate --format=%(refname:short)|%(committerdate:relative)
```

Parse the output and build two sets:

- **locals**: all lines NOT starting with `origin/` (strip `*` prefix if present)
- **remotes**: all lines starting with `origin/`, strip the `origin/` prefix for comparison

Classify each unique branch name:

- **local+remote** = exists in both locals and remotes
- **local only** = exists in locals but NOT in remotes
- **remote only** = exists in remotes but NOT in locals

Build the final list:

1. `development` always first (if it exists), type `local+remote`
2. Then remaining branches sorted by most recent committerdate
3. Max 10 per type (local+remote, local only, remote only) — combined total max 30 entries
4. Assign sequential numbers starting at 1

Format each line as:

```
  N. <branch-name>        <type>        —  <relative-date>
```

Where `<type>` is one of: `local+remote`, `local only`, `remote only`

Append this line at the bottom:

```
Para eliminar una rama local escribe D<número> en el chat (ej: D3, D7)
```

Show the numbered list to the user as plain text, then immediately show a `question` picker with the same branches as selectable options (format: `N. <branch-name> — <type>`).

---

## Step 2a — User selects a branch from the picker

Identify the branch type from the list built in Step 1.

**If `local+remote`:**

```
git checkout <branch>
git rev-list HEAD..origin/<branch> --count
```

- If count > 0: ask with `question`:
  > "Hay `<count>` commits nuevos en origin/<branch>. ¿Qué hacemos?"
  > Options: "Descargar ahora (git pull)" | "Continuar sin actualizar"
  - If "Descargar ahora": run `git pull origin <branch>`, show output.
  - If "Continuar sin actualizar": continue, no pull.
- If count == 0: inform "Ya estás actualizado." Done.

**If `local only`:**

```
git checkout <branch>
```

Show output. Done.

**If `remote only`:**

```
git checkout --track origin/<branch>
```

Show output. Done.

---

## Step 2b — User types D<n> in the chat

Extract the number N from the input (e.g. `D4` → N=4).

Look up branch name and type from the list built in Step 1.

**Validations (in order):**

1. If N is out of range: inform "Número fuera de rango." → go to Step 1 (reload list).
2. If type is `remote only`: inform "Solo se pueden eliminar ramas locales." → go to Step 1.
3. If branch name is in protected list (`main`, `master`, `dev`, `development`): inform "La rama `<branch>` está protegida y no puede eliminarse." → go to Step 1.
4. If branch is the current active branch: inform "No puedes eliminar la rama en la que estás." → go to Step 1.

**If all validations pass**, ask with `question`:

> "¿Eliminar rama local `<branch>`? Esta acción no se puede deshacer."
> Options: "Sí, eliminar" | "Cancelar"

- If "Cancelar": go to Step 1 (reload list).
- If "Sí, eliminar":
  ```
  git branch -d <branch>
  ```

  - If command succeeds: inform "Rama `<branch>` eliminada." → go to Step 1 (reload list).
  - If command fails (not fully merged): ask with `question`:
    > "La rama `<branch>` no está mergeada. ¿Forzar eliminación?"
    > Options: "Sí, forzar (git branch -D)" | "Cancelar"
    - If "Sí, forzar": run `git branch -D <branch>`, inform result → go to Step 1 (reload list).
    - If "Cancelar": go to Step 1 (reload list).

---

## Step 1 — Reload list

Any time the instructions say "go to Step 1 (reload list)", re-run the full Step 1 from scratch (fetch + classify + show list + picker).
