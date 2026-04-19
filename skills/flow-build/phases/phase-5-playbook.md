## PHASE 5 (Playbook Mode): Project Rules & Exceptions (3-5 min)

> **Modo**: Playbook activo — los estándares de código, naming, formatting, git workflow,
> logging y error handling ya están definidos en el playbook.
> Esta fase captura solo lo que es ESPECÍFICO de este proyecto.
>
> **Referencia de playbook resuelta:** usar `PLAYBOOK_REFERENCE_LABEL` en cualquier documento generado que cite el playbook.
> Si `PLAYBOOK_SOURCE=shared`, no asumir `playbook/` local ni escribir paths absolutos del sistema.

> **Asumido por defecto del playbook:**
> - Formatting: Prettier + ESLint 9 flat config + TypeScript strict
> - Naming: kebab-case files, PascalCase classes, camelCase functions/variables, UPPER_SNAKE_CASE constants
> - Git: Conventional Commits + Husky + lint-staged + commitlint
> - Logging: Pino + structured JSON + AsyncLocalStorage
> - Error handling: AllExceptionsFilter + DomainException + X-Request-ID
> - Coverage: ver `testing-strategy.md §13` según tier del proyecto

---

### 5.1 Reglas NEVER de este Proyecto

```
¿Hay cosas que en este proyecto NUNCA se deben hacer?
(Más allá de lo que ya define el playbook)

Ejemplos concretos:
- "Nunca modificar archivos en /legacy — es código de terceros"
- "Nunca exponer el campo 'internalScore' en ningún endpoint"
- "Nunca hacer deploy los viernes después de las 18hs"
- "Nunca usar floating point para cálculos de dinero — usar Decimal"
- "Nunca commitear IDs de tenant hardcodeados"

Reglas NEVER de este proyecto:
1. __
2. __
3. __
(Dejar en blanco si no hay por ahora)
```

---

### 5.2 Reglas ALWAYS de este Proyecto

```
¿Hay cosas que en este proyecto SIEMPRE se deben hacer?
(Más allá de lo que ya define el playbook)

Ejemplos concretos:
- "Siempre incluir tenantId en todas las queries de DB"
- "Siempre validar que el usuario pertenece a la org antes de cualquier operación"
- "Siempre usar el wrapper de precio del dominio, nunca manipular numbers crudos"
- "Siempre loguear el ID de la transacción en operaciones de pago"
- "Siempre invalidar el cache de X cuando se modifica Y"

Reglas ALWAYS de este proyecto:
1. __
2. __
3. __
(Dejar en blanco si no hay por ahora)
```

---

### 5.3 Excepciones al Estándar del Playbook

```
¿Hay algún estándar del playbook que este proyecto NO puede seguir?
(Constraint técnico, legacy, decisión explícita)

Ejemplos:
- "Usamos TypeORM en lugar de Prisma — proyecto legacy"
- "El coverage target es 50% en lugar de 70% — acuerdo con el cliente"
- "Usamos yarn en lugar de pnpm — el cliente lo requiere"

Excepciones: __ (o "ninguna")

Para cada excepción → documentar motivo explícito.
```

---

### Phase 5 Output

```
📋 REGLAS DEL PROYECTO:

NEVER: [lista / ninguna]
ALWAYS: [lista / ninguna]
Excepciones al playbook: [lista / ninguna]

Asumido del playbook:
✅ Code style: Prettier + ESLint + TypeScript strict
✅ Git: Conventional Commits + Husky + lint-staged
✅ Logging: Pino structured JSON + AsyncLocalStorage (ver `backend-stack.md §Tier 1` + `backend-patterns.md §12`)
✅ Error handling: AllExceptionsFilter + DomainException (ver `backend-patterns.md §1`)
✅ Coverage target: [según tier del proyecto] — ver `testing-strategy.md §13` para targets + `testing-strategy.md §14` para config jest.config/vitest.config
```

**Actualizar automáticamente:**

1. `ai-instructions.md`
    - Agregar sección NEVER rules
    - Agregar sección ALWAYS rules
    - Agregar sección Excepciones al playbook
    - Referenciar el playbook mediante `PLAYBOOK_REFERENCE_LABEL` cuando corresponda

```
✅ Actualizado: ai-instructions.md

¿Alguna corrección antes de continuar? (S/N)
```

---

**Next Phase:** Phase 6 (Playbook) — Deployment & Environments

Next: read phase-6-playbook.md from this phases/ directory

---

_Version: 1.0 (Playbook Mode)_
_Last Updated: 2026-03-28_
