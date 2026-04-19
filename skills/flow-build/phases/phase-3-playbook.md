## PHASE 3 (Playbook Mode): Architecture Decisions (5-10 min)

> **Modo**: Playbook activo — el stack tecnológico ya está definido.
> El objetivo de esta fase es capturar las decisiones de arquitectura ÚNICAS de este proyecto
> que el playbook no puede asumir por adelantado.

> **Stack asumido por defecto según PROJECT_TYPE:**
> - `backend` / `fullstack` → NestJS 11 + Fastify + Prisma + PostgreSQL + TypeScript strict (ver `backend-stack.md`)
> - `frontend` → React 19 + Vite + TypeScript strict + Zustand + TanStack Query (ver `frontend-stack.md`)
>
> **Referencia de playbook resuelta:** usar `PLAYBOOK_REFERENCE_LABEL` en todos los documentos generados.
> Si `PLAYBOOK_SOURCE=shared`, no asumir `playbook/` local ni escribir paths absolutos del sistema.

> ⚠️ **Proyectos mobile**: El playbook no tiene un `mobile-stack.md` todavía. Si el proyecto es mobile, usá **Modo Standalone** para que puedas definir el stack completo (React Native, Flutter, etc.) sin restricciones.

> Si el proyecto usa un stack diferente al del playbook (backend o frontend), documentarlo como excepción aquí y evaluar si tiene más sentido continuar en Modo Standalone.

---

### 3.1 Confirmación de Stack

```
Stack detectado para este proyecto: [PROJECT_TYPE]

El playbook define:
✅ Framework: [NestJS/React/React Native según PROJECT_TYPE]
✅ Base de datos: PostgreSQL 17
✅ ORM: Prisma 7
✅ Autenticación: JWT Bearer + Refresh Token httpOnly
✅ API: REST + envelope { data, meta } + versionado /v1/
✅ Testing: Jest (backend) / Vitest + RTL (frontend) / Playwright (E2E)
✅ CI/CD: GitHub Actions
✅ Contenedorización: Docker multi-stage

¿Alguna de estas decisiones difiere en este proyecto? (Y/N)

Si Y → especificá cuál/cuáles y el motivo. Se documentarán como excepciones.
Si N → continuamos con el stack del playbook sin más preguntas de stack.
```

---

### 3.2 Patrón Arquitectónico

```
¿Qué patrón de arquitectura interna usará este proyecto?

A) ⭐ Layered / Modular (NestJS modules por feature) — Recomendado para la mayoría
   src/modules/users/, src/modules/orders/, src/common/
   
B) Clean / Hexagonal — Para dominio complejo, reglas de negocio críticas
   Separa domain de infrastructure explícitamente
   
C) MVC tradicional — Para proyectos simples o migraciones legacy

Tu elección: __
¿Por qué este patrón para este proyecto?
```

---

### 3.3 Integraciones Externas del Proyecto

```
¿Este proyecto integra servicios externos? (seleccioná los que apliquen)

💳 Pagos:      Stripe / MercadoPago / PayPal / Otro: __
📧 Email:      Resend / AWS SES / SendGrid / Otro: __
📱 SMS/Push:   Twilio / OneSignal / Expo Push / Otro: __
☁️  Storage:   AWS S3 / Cloudflare R2 / Otro: __
🔐 Auth ext:   Keycloak / Auth0 / Clerk / Ninguno
🗺️  Mapas:     Google Maps / Mapbox / Ninguno
🤖 AI/ML:      OpenAI / Google Gemini / Otro: __
🔄 Otros:      [CRM, ERP, webhooks, APIs de terceros]

Para cada uno seleccionado, describí brevemente el caso de uso:
Ej: "Stripe → pagos de suscripciones mensuales"
```

---

### 3.4 Excepciones al Playbook (si las hay)

```
[Mostrar solo si el usuario indicó diferencias en 3.1]

Para cada diferencia identificada:
- ¿Qué decisión del playbook se cambia?
- ¿Por qué? (constraint técnico, legacy, requerimiento del cliente, etc.)
- ¿Cómo se reemplaza?

Estas excepciones se documentarán en .agent/rules/playbook.md del proyecto.
```

---

### Phase 3 Output

Confirmar y generar:

```
📋 ARQUITECTURA DEL PROYECTO:

Stack: [del playbook / con excepciones: lista]
Patrón: [Layered/Clean/MVC]
Integraciones externas: [lista]
Excepciones documentadas: [lista o "ninguna"]
```

**Generar automáticamente:**

1. `docs/architecture.md`
   - Diagrama Mermaid del sistema (capas + integraciones externas)
   - Stack confirmado (con referencia al playbook + excepciones si las hay)
   - Patrón arquitectónico elegido con justificación

2. `ai-instructions.md`
   - Stack técnico del proyecto
   - Referencia al playbook según el origen resuelto:
     - Si `PLAYBOOK_SOURCE=local` → `Ver playbook/ para estándares de código, API, testing y CI/CD`
     - Si `PLAYBOOK_SOURCE=shared` → `Ver ${PLAYBOOK_REFERENCE_LABEL} para estándares de código, API, testing y CI/CD`
   - Excepciones documentadas
   - Integraciones externas con sus casos de uso

```
✅ Generado: docs/architecture.md
✅ Generado: ai-instructions.md

¿Alguna corrección antes de continuar? (S/N)
```

---

**Next Phase:** Phase 4 (Playbook) — Security Decisions

Next: read phase-4-playbook.md from this phases/ directory

---

_Version: 1.0 (Playbook Mode)_
_Last Updated: 2026-03-28_
