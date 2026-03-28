# Engineering Playbook

Este proyecto sigue los estándares definidos en el playbook compartido ubicado en
`../../playbook/` (relativo a la raíz del proyecto).

## Fuente de verdad

Los documentos del playbook son la **fuente de verdad** para todas las decisiones
de arquitectura, stack, patrones y contratos. También están disponibles en engram
bajo el proyecto `developer-workspace` con topic keys `playbook/*`.

**El playbook gana** ante cualquier inconsistencia — salvo decisión explícita
documentada en el propio proyecto.

## Documentos disponibles

| Documento | Path | Cuándo consultarlo |
|---|---|---|
| API Contract | `../../playbook/api-contract.md` | Antes de definir cualquier endpoint |
| Backend Stack | `../../playbook/backend-stack.md` | Al inicializar backend o agregar dependencias |
| Frontend Stack | `../../playbook/frontend-stack.md` | Al inicializar frontend o agregar dependencias |
| Infra Stack | `../../playbook/infra-stack.md` | Al configurar CI/CD, Docker, AWS |
| Backend Patterns | `../../playbook/backend-patterns.md` | Al implementar repositorios, servicios, handlers |
| Frontend Patterns | `../../playbook/frontend-patterns.md` | Al implementar componentes, hooks, estado |
| Error Catalog | `../../playbook/error-catalog.md` | Al definir o manejar errores de la API |
| Testing Strategy | `../../playbook/testing-strategy.md` | Al escribir o configurar tests |

## Cómo usarlos (para agentes de IA)

1. **Al iniciar trabajo en este proyecto**: buscá en engram con `mem_search("playbook <topic>", project: "developer-workspace")` para obtener el estándar relevante
2. **Al implementar un módulo nuevo**: consultá los patterns docs antes de escribir código
3. **Si algo del playbook cambia**: el proyecto debe ser actualizado para alinearse, a menos que esté documentada una excepción

## Excepciones documentadas

<!-- Listá acá cualquier decisión que difiera del playbook y el motivo -->

_Ninguna excepción documentada aún._
