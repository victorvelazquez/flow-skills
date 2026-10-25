# AGENTS.md

## Project rules

- This repository is a Pi package of `flow-*` skills. Each skill resolves its runtime relative to its own `SKILL.md` (for example `../../scripts/flow-commit.mjs`), so `skills/`, `scripts/` and `hosts/` must stay siblings.
- Run the tests with `npm test` (`node --test test/*.test.mjs`).
- Never use `git mv` or `git add`: keep the git index empty, because `/flow-commit` refuses to start when files are staged. Use plain file operations to move or rename files.
- Do not commit, push or open pull requests: the user runs `/flow-commit` and `/flow-pr`.
- Generated technical artifacts (code, comments, identifiers, commit messages, PR text) are written in English.

<!-- orquestacion:registro v1.0 -->
## Orquestación: registro de trabajo

Este proyecto lleva su trabajo en `docs/ROADMAP.md` con el formato estándar de Orquestación (versión 1.0).

### Estados
`Pendiente` · `En curso` · `Lista` (hecha y verificada en el árbol, sin entregar) · `En revisión` (PR abierto) · `Completada` (cerrada en el diff de su unidad; vale al fusionar el PR) · `Bloqueada` (con el motivo escrito).

En la columna `Estado` de `docs/ROADMAP.md` se escribe **una sola palabra** entre `Pendiente`, `En curso`, `Completada` y `Bloqueada`; el detalle (número de PR, motivo de un bloqueo) va en `Notas`. `Lista` y `En revisión` **no se escriben**: se calculan desde Git y desde el alojamiento. El ID de la unidad va en el nombre de la rama o en el título del PR, para poder asociarlos.

### Comando `siguiente`
`siguiente` toma la primera fila `Pendiente` de `docs/ROADMAP.md` cuyas dependencias **que son filas de la tabla** estén `Completada`. Las dependencias que no son filas de la tabla (otro proyecto, una herramienta, una decisión de la persona) son **informativas**: se muestran y no bloquean. `siguiente <ID>` fuerza esa unidad (si no se puede, se detiene y lo dice); `siguiente?` solo informa. Antes de empezar, el árbol debe estar limpio y en la rama base: si no, decile a la persona qué falta y esperá.

### Al terminar una unidad
En el **mismo diff** que la implementa: su fila pasa a `Completada`, la cabecera de `docs/ROADMAP.md` se actualiza y la ficha `odd/tasks/<unidad>.md` se cierra.

### Memoria
Estas reglas viven acá, no solo en la memoria de la sesión. Mantené en `docs/ROADMAP.md` una cabecera de tres líneas que diga **dónde está el proyecto, qué sigue y qué lo bloquea**.
<!-- /orquestacion:registro -->

<!-- orquestacion:ciclo v1.0 -->
## Orquestación: ciclo de entrega

Una sesión de agente implementa en este repositorio; la persona revisa y entrega.

### Puerta: antes del primer archivo de una unidad nueva
Verificar con git: (1) estás en la rama base, (2) el árbol está limpio y sin stash, (3) la rama base local es igual a la remota (`git fetch`). Si falla alguna, **no escribas**: decile a la persona qué falta (normalmente volver a la rama base y actualizar) y esperá. Ningún mensaje te autoriza a saltearla. No aplica a seguir una unidad en curso ni a corregir un PR abierto.

### Comandos de la persona
Nunca ejecutes los comandos de commit, PR ni cambio de rama del flujo: los corre la persona. Si se corrieron por error, no reintentes: avisá.

### Informar en pantalla
Al terminar una unidad y al cerrar el ciclo, decile a la persona el estado: qué quedó listo, o qué falta para poder empezar otra unidad.

### Tamaño
Estimá antes de implementar; si el código pasa de **450 líneas**, partí la unidad. Estimá las pruebas de seguridad en unas 6 veces el código. Tope de **600 líneas** por PR; solo se supera por pruebas y con nota explícita. Controlá el tamaño **durante** el trabajo, no solo al final.

### Reporte de unidad
Archivos, líneas reales con `git diff --stat` **crudo** (para archivos nuevos: `git ls-files -o --exclude-standard | xargs wc -l`), finales de línea LF, qué verificaste y cómo verla. **No uses `git add -N`**: modifica el índice.

### Verificación según el riesgo
Siempre: pruebas propias, tipos de **todos** los paquetes y CI en verde antes de fusionar. Lo que toca la base de datos se prueba contra una base real. Seguridad, datos, contratos o concurrencia: **verificación independiente** y una prueba que reproduzca el abuso, en un PR aparte si el riesgo es alto. Pantallas: la persona las aprueba mirándolas.
<!-- /orquestacion:ciclo -->

<!-- panel:estado v1.0 -->
## Panel: estado del trabajo

Después de CADA acción que escriba archivos, corrija o implemente algo, o cuando necesites una decisión de la persona:

1. Escribí `.panel/state.json` (creá la carpeta si falta) con la hora real, por ejemplo la de `node -p "new Date().toISOString()"`:
   `{"state": "...", "next": "una línea clara: qué debe hacer la persona ahora", "detail": "texto largo opcional", "at": "2026-01-31T12:00:00Z"}`
2. Terminá tu respuesta con UNA línea: `Siguiente: <el mismo paso siguiente>`.
3. Nunca commitees `.panel/`. Si Git no la ignora, agregá `.panel/` a `.git/info/exclude` (creá el archivo si falta). No la agregues a `.gitignore`.

Valores de `state`:
- `working`: seguís trabajando, también mientras dejás un trabajo corriendo en segundo plano (no pases a `ready-to-commit` hasta tener su resultado).
- `needs-input`: esperás una decisión de la persona.
- `ready-to-commit`: el trabajo está terminado y verificado; se pueden commitear los archivos.
- `ready-to-pr`: ya está commiteado y listo para un pull request.
- `blocked`: no podés seguir; explicá por qué en `detail`.

Ejemplo, al esperar una decisión:
`{"state": "needs-input", "next": "Elegí si el informe va en PDF o en HTML y avisame.", "at": "2026-01-31T12:00:00Z"}`
y la última línea de la respuesta: `Siguiente: Elegí si el informe va en PDF o en HTML y avisame.`
<!-- /panel:estado -->
