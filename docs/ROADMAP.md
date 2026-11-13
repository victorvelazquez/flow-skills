# Roadmap

**Dónde está:** las skills `flow-learn`, `flow-base`, `flow-commit --unstage`, la corrección de `flow-pr` la skill `flow-next` (FS5) y la skill `flow-ship` (FS6, pendiente de entrega: commit y PR en una sola corrida, sin fusionar) están hechas; no hay otras unidades pendientes registradas.
**Qué sigue:** nada planificado todavía; la persona define la próxima unidad y se agrega como fila `Pendiente`.
**Qué lo bloquea:** nada.

| ID | Entrega | Depende de | Estado | Notas |
| --- | --- | --- | --- | --- |
| FS1 | Skill `flow-learn`: cola de estudio, lecciones y notas en Obsidian | — | Completada | PR #66 |
| FS2 | Renombrar `flow-branch` a `flow-base` y aceptar PR fusionado en `--stash` | — | Completada | PR #68 |
| FS3 | Opción explícita `--unstage` en `flow-commit` | FS2 | Completada | PR #69 |
| FS4 | `flow-pr`: no cortar con `post-push-authority-drift` al actualizar un PR existente | — | Completada | PR #70 |
| FS5 | Skill `flow-next`: tomar la siguiente tarea de `docs/ROADMAP.md`, empezarla si está lista o mostrar un resumen y esperar confirmación | FS4 | Completada | Sin script; la prueba fija el contrato; el botón del panel es RP45 |
| FS6 | Skill `flow-ship`: commit y PR encadenados en una sola corrida (`flow-commit`, una verificación con Git y `flow-pr`), sin esperar el CI ni fusionar; si una etapa falla, muestra el error y el comando para seguir | FS5 | Completada | Sin script propio; la prueba fija el contrato; pedida por la persona el 12 de noviembre: la fusión sigue siendo suya, después de revisar el PR; el botón del panel queda para una fila de repo-panel; sin verificar con una corrida real |
