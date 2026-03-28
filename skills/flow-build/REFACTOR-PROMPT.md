# Phase Refactor Prompt — flow-build

> Prompt maestro para refactorizar phases del skill /flow-build.
> Usar fase por fase. Revisar resultado antes de avanzar a la siguiente.
> Última actualización: 2026-03-28

---

## Contexto del proyecto

El skill `/flow-build` guía al desarrollador a través de fases para documentar un proyecto
antes de escribir código. El objetivo del refactoring es mejorar la experiencia del
desarrollador (DX) sin perder funcionalidad ni efectividad.

**Stack y playbook**: El playbook de ingeniería compartido ya define el stack tecnológico,
patrones de código, convenciones de API, testing y CI/CD. Las phases del modo Standalone
son para proyectos fuera de ese ecosistema.

---

## Los 5 Principios — APLICAR EN TODA REFACTORIZACIÓN

### P1 — IA propone, dev aprueba
Si la IA puede inferir una respuesta del contexto anterior (phases ya ejecutadas),
debe proponerla directamente. El dev solo dice "ok" o ajusta.
**NUNCA preguntar lo que ya se puede inferir.**

Contexto disponible por phase:
- Desde Phase 1: nombre, descripción, tipo de sistema, features, flujos, scope, constraints, integraciones externas
- Desde Phase 2: entidades del dominio, relaciones, patrones de datos
- Desde Phase 3+: stack, arquitectura, patrones elegidos

### P2 — Cero preguntas técnicas a principiantes
Eliminar o convertir a default cualquier pregunta que un desarrollador junior/indie
no pueda responder sin investigar primero. Ejemplos de lo que NO debe preguntarse:
- Transaction isolation level
- Eventual vs strong consistency
- Circuit breaker configuration
- Chaos engineering strategy
- Connection pool settings

Estas decisiones tienen defaults razonables del playbook o de las mejores prácticas.
Mostrar el default elegido, no preguntar.

### P3 — Un mensaje, todos los cambios
El dev nunca debe responder múltiples rondas de preguntas para el mismo tema.
Si hay varias cosas que personalizar, se muestran juntas y el dev responde una sola vez.
Formato de respuesta masiva: comandos cortos en un mensaje.

### P4 — Sin solapamiento entre phases
Cada piece of information se captura UNA SOLA VEZ en la phase que le corresponde.
Verificar contra las phases anteriores y eliminar preguntas duplicadas.
Si algo ya fue capturado → referenciar, no re-preguntar.

### P5 — Defaults inteligentes visibles
Cuando la IA asume un valor por defecto, lo muestra explícitamente con el símbolo ✅.
El dev puede cambiarlo si quiere, pero no es obligatorio responder.
Los defaults se basan en: contexto de phases anteriores, tipo de sistema, tier/scope elegido.

---

## Lo que NO se debe tocar

- Lógica de diagramas Mermaid (formatos, ejemplos, best practices) — dejar intacta
- Pre-Flight Check (smart-skip script) — dejar intacto
- Nombres de archivos de output (`docs/data-model.md`, etc.) — no cambiar
- Instrucciones de generación de documentos — ajustar referencias si cambia la estructura, no la lógica
- Next Phase reference al final — actualizar si corresponde

---

## Criterios de evaluación por pregunta

Para cada pregunta de la phase actual, evaluar:

| Criterio | Acción |
|----------|--------|
| ¿La IA puede inferirlo del contexto anterior? | → Convertir a propuesta con ✅, eliminar la pregunta |
| ¿Es una decisión técnica que un principiante no sabe? | → Asignar default del playbook/best practice, mostrar como ✅ |
| ¿Ya se preguntó en una phase anterior? | → Eliminar completamente |
| ¿Tiene opciones múltiples pero siempre se elige la misma? | → Hacer default ⭐ visible, mantener como opcional |
| ¿Es crítica y única por proyecto? | → Mantener, pero simplificar al mínimo |
| ¿Es crítica para que phases posteriores funcionen bien? | → Mantener obligatoria |

---

## Formato de output esperado

### Para cada pregunta analizada, indicar:

```
[PREGUNTA ORIGINAL]: [texto de la pregunta]
[DECISIÓN]: MANTENER / SIMPLIFICAR / CONVERTIR A DEFAULT / ELIMINAR / FUSIONAR CON [X]
[RAZÓN]: [por qué]
[NUEVA VERSIÓN]: [cómo queda si se mantiene o simplifica]
```

### Luego el archivo refactorizado completo:

El agente debe entregar el archivo `.md` completo y listo para reemplazar el original.
No entregar solo el diff — entregar el archivo entero.

---

## Estructura ideal de una phase refactorizada

```markdown
## PHASE N: [Nombre] ([tiempo estimado])

> Scope-based behavior si aplica (solo si hay diferencia real entre tiers)

---

### N.1 — [Subtema]

> 🧠 AI: [instrucción interna de qué inferir/proponer automáticamente]

[Propuesta o pregunta mínima]

---

### N.2 — [Subtema]
...

---

### Phase N Output

[Summary compacto de lo capturado]

**Generar automáticamente [documento]:**
[instrucciones de generación]

---

**Next Phase:** Phase N+1 — [Nombre]
Next: read phase-N+1.md from this phases/ directory
```

---

## Instrucciones de ejecución para el agente

1. **Leer** la phase a refactorizar completa
2. **Leer** las phases anteriores (resumen de qué información ya fue capturada)
3. **Evaluar** cada pregunta contra los 5 principios
4. **Producir** el análisis por pregunta
5. **Producir** el archivo refactorizado completo
6. **Verificar** que el archivo refactorizado:
   - No pierde ningún dato que phases posteriores necesiten
   - No pregunta nada que ya fue capturado antes
   - No tiene preguntas técnicas que un principiante no pueda responder
   - El tiempo estimado es realista para el nuevo flujo

---

## Información de phases por responsabilidad

| Phase | Responsabilidad exclusiva | Output |
|-------|--------------------------|--------|
| Phase 0 | Detección de proyecto existente (automático) | cache/audit-data.json |
| Phase 1 | Negocio: nombre, descripción, usuarios, features, scope, flows, constraints, integraciones externas | project-brief.md |
| Phase 2 | Dominio: entidades, atributos, relaciones, patrones de datos | docs/data-model.md |
| Phase 3 | Arquitectura técnica: stack, patrón arquitectónico, API design, dependencias clave | docs/architecture.md + ai-instructions.md |
| Phase 4 | Seguridad: auth, autorización, compliance, encriptación | specs/security.md |
| Phase 5 | Estándares de código: naming, formatting, git workflow, reglas del proyecto | docs/code-standards.md |
| Phase 6 | Testing: framework, tipos de test, cobertura, CI/CD | docs/testing.md |
| Phase 7 | Operaciones: deployment, environments, monitoring, alertas | docs/operations.md + .env.example |
| Phase 8 | Documentación final: README, AGENT.md, business flows, API docs, contributing | README.md + AGENT.md + docs/* |
| Phase 9 | Roadmap: epics, features, milestones | planning/roadmap.md |
| Phase 10 | User stories + criterios de aceptación + test cases | planning/user-stories/ |

---

## Qué necesita Phase 2 de Phase 1 (referencia crítica)

Phase 2 necesita de Phase 1:
- Tipo de sistema (e-commerce, SaaS, CRM...) → para inferir entidades
- Features confirmados → para inferir qué tablas son necesarias
- Integraciones externas → para inferir tablas de integración (Payment tokens, Media/Files)
- Scope v1 vs v2 → para saber qué entidades son necesarias ahora vs después
- Compliance (GDPR, HIPAA) → para inferir campos de audit trail, retención
- Multi-tenancy → para inferir campo organizationId en todas las tablas

**Si Phase 1 no captura alguno de estos puntos, Phase 2 tendrá que preguntar.**
Asegurarse de que Phase 1 los capture todos.

---

_Este prompt se aplica fase por fase. Revisar resultado con el usuario antes de avanzar._
_No ejecutar múltiples phases en paralelo — cada una puede afectar la siguiente._
