# Adopción de Orquestación

Este repositorio adopta el perfil de Orquestación (versión 1.0) para trabajar con repo-panel.

## Bloques en `AGENTS.md`

| Bloque | Versión | Uso |
| --- | --- | --- |
| `orquestacion:registro` | 1.0 | Registro del trabajo en `docs/ROADMAP.md` |
| `orquestacion:ciclo` | 1.0 | Ciclo de entrega, sin la región `SALA` |
| `panel:tareas` | 1.0 | Único mecanismo de tareas: filas de `docs/ROADMAP.md` |
| `panel:entrega` | 1.0 | Entrega por `/flow-base`, `/flow-commit` y `/flow-pr` |
| `panel:estado` | 1.0 | Estado del trabajo en `.panel/state.json` |

## Decisiones

- El repositorio **no** es miembro de una sala: el bloque `ciclo` no incluye la región `SALA`.
- El roadmap es `docs/ROADMAP.md`. Se inició con las unidades ya entregadas (FS1-FS4, PR #66, #68, #69 y #70); no tiene unidades pendientes.
- `.panel/` se ignora de forma local en `.git/info/exclude`, nunca en `.gitignore`.
- **Padrón del panel:** 1.0
