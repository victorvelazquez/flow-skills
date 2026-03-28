## PHASE 8 (Playbook Mode): Final Documentation & Project Setup (10-15 min)

> **Modo**: Playbook activo.
> Esta phase es idéntica a la standalone en pasos 8.1 y 8.2 (detección + inicialización del framework).
> Difiere en 8.3 (re-lectura de docs existentes) y en el summary final.

---

## 8.1: Project State Detection

Igual que la phase-8 standalone — seguir exactamente el mismo proceso.

Lee `phase-8.md §8.1` y ejecutalo sin cambios.

---

## 8.2: Framework Initialization (Optional)

Igual que la phase-8 standalone — seguir exactamente el mismo proceso.

Lee `phase-8.md §8.2` y ejecutalo sin cambios.

---

## 8.3: Re-lectura de Documentos (Playbook Mode)

En Playbook Mode los documentos generados son diferentes a Standalone. Leer solo los que existen:

```
📖 Re-leyendo documentos generados en Playbook Mode...

✅ Re-reading project-brief.md           ← Phase 1
✅ Re-reading docs/data-model.md         ← Phase 2
✅ Re-reading docs/architecture.md       ← Phase 3-playbook
✅ Re-reading ai-instructions.md         ← Phase 3-playbook + 4-playbook + 5-playbook
✅ Re-reading specs/security.md          ← Phase 4-playbook
✅ Re-reading docs/operations.md         ← Phase 6-playbook
✅ Re-reading .env.example               ← Phase 6-playbook

📋 Del playbook (no generados por el proyecto — referenciar, no duplicar):
   → backend-stack.md / frontend-stack.md  (stack tecnológico)
   → api-contract.md                        (convenciones de API)
   → testing-strategy.md §13-14            (coverage targets y config)
   → infra-stack.md §16                    (deployment standards)

ℹ️  En Playbook Mode NO existen:
   - docs/code-standards.md  (cubierto por el playbook)
   - docs/testing.md         (cubierto por testing-strategy.md del playbook)
   - specs/configuration.md  (variables en .env.example)

✅ Contexto cargado. Generando documentos finales...
```

---

## 8.3.1: Generate docs/business-flows.md

Igual que la phase-8 standalone — seguir el mismo proceso.

Lee `phase-8.md §8.3.1` y ejecutalo sin cambios.

---

## 8.3.2: Generate docs/api.md

Igual que la phase-8 standalone — seguir el mismo proceso.

> **Nota Playbook Mode**: Las convenciones de API (envelope, errores, paginación) vienen de `api-contract.md` del playbook, no de Phase 3.5 standalone. Referenciar `api-contract.md` como fuente de las convenciones.

Lee `phase-8.md §8.3.2` y ejecutalo, usando `api-contract.md` como fuente de convenciones.

---

## 8.3.3: Generate docs/contributing.md

Igual que la phase-8 standalone — seguir el mismo proceso.

> **Nota Playbook Mode**: El git workflow, commit format, y code standards vienen del playbook (Conventional Commits en `backend-stack.md §Base`, patterns en `backend-patterns.md`). No referenciar "Phase 5" — referenciar el playbook directamente.

**Adaptar el template de contributing.md para Playbook Mode:**

```markdown
## Getting Started

1. Clonar el repositorio
2. Instalar dependencias: `pnpm install`
3. Copiar `.env.example` a `.env` y configurar variables
4. Levantar servicios locales: `docker compose up -d`
5. Correr migraciones: `npx prisma migrate dev`
6. Iniciar servidor de desarrollo: `pnpm dev`

## Estándares de Código

Este proyecto sigue el **playbook de ingeniería compartido**.
Ver `playbook/backend-stack.md` y `playbook/backend-patterns.md` para:
- Naming conventions
- Estructura de archivos
- Patrones de código (Repository, Guards, Interceptors)

## Git Workflow

Seguimos **Conventional Commits**:
- `feat(scope): descripción` — nueva funcionalidad
- `fix(scope): descripción` — corrección de bug
- `docs(scope): descripción` — documentación
- `refactor(scope): descripción` — refactoring sin cambio de comportamiento

Ver `playbook/backend-stack.md §Base` para el setup completo de Husky + commitlint.

## Testing

Ver `playbook/testing-strategy.md §13` para los targets de cobertura según el tier del proyecto.
Ver `playbook/testing-strategy.md §14` para la configuración de Jest/Vitest.

## Excepciones al Playbook

[Si las hay — listar las decisiones documentadas en ai-instructions.md que difieren del playbook]
```

---

## 8.4: Generate AGENT.md (Master Index)

Igual que la phase-8 standalone en estructura, pero adaptado para Playbook Mode.

**Estructura para Playbook Mode:**

```markdown
# 🤖 AGENT.md — Configuración AI del Proyecto

## 📚 Documentos del Proyecto

### Core
1. **project-brief.md** — Contexto de negocio, usuarios, objetivos, alcance
2. **ai-instructions.md** — Stack técnico, reglas NEVER/ALWAYS, excepciones al playbook

### Dominio
3. **docs/data-model.md** — Entidades, relaciones, reglas de negocio del dominio
4. **docs/architecture.md** — Patrón arquitectónico, integraciones externas, diagrama del sistema

### Seguridad
5. **specs/security.md** — Roles del dominio, compliance, campos sensibles, reglas de acceso

### Operaciones
6. **docs/operations.md** — Plataforma de deploy, environments, variables de entorno
7. **.env.example** — Template de variables de entorno

### API y Flujos
8. **docs/api.md** — Endpoints CRUD del proyecto
9. **docs/business-flows.md** — Flujos de negocio con diagramas Mermaid

### Contribución
10. **docs/contributing.md** — Setup, git workflow, testing

## 📖 Playbook de Ingeniería (compartido)

Este proyecto sigue el playbook de ingeniería compartido:

| Decisión | Documento |
|----------|-----------|
| Stack backend (NestJS, Prisma, etc.) | `playbook/backend-stack.md` |
| Patrones de código | `playbook/backend-patterns.md` |
| Contrato de API (envelope, errores) | `playbook/api-contract.md` |
| Stack frontend (React, Zustand, etc.) | `playbook/frontend-stack.md` |
| Patrones frontend | `playbook/frontend-patterns.md` |
| Testing (frameworks, coverage targets) | `playbook/testing-strategy.md` |
| CI/CD, Docker, K8s | `playbook/infra-stack.md` |

## 🎯 Quick Reference

### Tech Stack
[Stack del proyecto — del playbook + excepciones si las hay]

### Excepciones al Playbook
[Lista de decisiones que difieren del estándar — o "Ninguna"]

### Reglas Críticas
[NEVER y ALWAYS rules de ai-instructions.md]

### Comandos Comunes
[Del .env.example y docs/contributing.md]
```

---

## 8.5: Generate README.md

Igual que la phase-8 standalone — seguir el mismo proceso.

Lee `phase-8.md §8.5` y ejecutalo sin cambios.

---

## 8.6 - 8.7: Tool Configs (.clauderules, .cursorrules, etc.)

Igual que la phase-8 standalone — seguir el mismo proceso.

Lee `phase-8.md §8.6-8.7` y ejecutalo sin cambios.

---

## 8.8: Final Validation & Success Message

```
🔍 Validating all generated files...

✅ Checking for placeholder text...
✅ Validating file references...
✅ Verifying playbook references are correct...

All validations passed!
```

**Show complete summary (Playbook Mode):**

```
🎉 Flow-Build Complete! (Playbook Mode)

Documentos del proyecto generados:

Phase 1:  ✅ project-brief.md
Phase 2:  ✅ docs/data-model.md
Phase 3:  ✅ docs/architecture.md
          ✅ ai-instructions.md
Phase 4:  ✅ specs/security.md
Phase 6:  ✅ docs/operations.md
          ✅ .env.example
Phase 8:  ✅ docs/business-flows.md
          ✅ docs/api.md
          ✅ docs/contributing.md
          ✅ README.md
          ✅ AGENT.md
          ✅ .gitignore

[Si framework inicializado:]
✅ [FRAMEWORK_NAME] project initialized

[Si README mergeado:]
✅ README.md merged with framework's setup instructions

Tool-specific configs:
✅ [List generated configs]

Estándares cubiertos por el playbook (sin duplicar):
📖 Stack tecnológico  → playbook/backend-stack.md
📖 Patrones de código → playbook/backend-patterns.md
📖 Contrato de API    → playbook/api-contract.md
📖 Testing strategy   → playbook/testing-strategy.md
📖 CI/CD e Infra      → playbook/infra-stack.md
```

**Paso final — inicializar el seguimiento del playbook:**

```
🔄 Inicializando seguimiento de adopción del playbook...

/flow-playbook-sync --init

Esto genera .flow-skills/playbook-status.md con el estado inicial
de adopción de los estándares del playbook en este proyecto.
Después de cada PR, corré /flow-playbook-sync para mantenerlo actualizado.
```

---

**Next steps para el desarrollador:**

```
1. ⭐ Leer AGENT.md — índice de toda la documentación del proyecto
2. 📖 Revisar los documentos generados — ajustar si es necesario
3. 🔧 Configurar el entorno — copiar .env.example a .env
4. 🚀 Iniciar el desarrollo — el AI assistant ya tiene contexto completo
5. 🔄 Después de cada PR — correr /flow-playbook-sync
```

---

_Version: 1.0 (Playbook Mode)_
_Last Updated: 2026-03-28_
