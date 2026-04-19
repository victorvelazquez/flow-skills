## PHASE 6 (Playbook Mode): Deployment & Environments (5-8 min)

> **Modo**: Playbook activo — la estrategia de CI/CD, Docker, testing y observabilidad
> ya está definida en el playbook.
> Esta fase captura las decisiones CONCRETAS de deployment de este proyecto específico.
>
> **Referencia de playbook resuelta:** usar `PLAYBOOK_REFERENCE_LABEL` cuando la documentación generada deba citar el playbook.
> Si `PLAYBOOK_SOURCE=shared`, no asumir `playbook/` local ni escribir paths absolutos del sistema.

> **Asumido por defecto del playbook** (ver `infra-stack.md §16`):
> - CI/CD: GitHub Actions (lint → test → audit → build → push → deploy)
> - Containerización: Docker multi-stage, non-root user
> - Migrations: step separado antes del deploy (nunca en onModuleInit)
> - Testing en CI: cobertura mínima según tier, bloquea merge si baja
> - Secrets: GitHub Actions Secrets (Tier 1) / K8s Secrets o Vault (Tier 2+)

---

### 6.1 Plataforma de Deploy

```
¿Dónde se despliega este proyecto en producción?

A) ⭐ AWS — ECS Fargate / EKS / EC2
B) Google Cloud — Cloud Run / GKE
C) Azure — App Service / AKS
D) DigitalOcean — App Platform / Kubernetes
E) Railway — PaaS, zero-config deploy
F) Render — PaaS, similar a Railway
G) Fly.io — PaaS con soporte a containers
H) VPS propio / servidor dedicado
I) On-premise / infraestructura del cliente
J) Otro: __

Tu elección: __
¿Hay algún constraint que determinó esta elección? (contrato con cliente, costos, etc.)
```

---

### 6.2 Environments del Proyecto

```
El playbook define por defecto según el tier:
[Mostrar según TIER seleccionado en Stage 2]

MVP:     dev (local) + production
Product: dev (local) + staging + production  
Enterprise: dev (local) + staging + production + [canary opcional]

¿Estos environments aplican para este proyecto? (S/N)

Si N → ¿cuáles environments necesitás? ¿Por qué difiere?
```

---

### 6.3 Estrategia de Deploy

```
El playbook define por defecto según el tier:
MVP:        Recreate (acepta downtime mínimo en deploy)
Product:    Rolling update (zero-downtime)
Enterprise: Blue-Green o Canary

¿Esta estrategia aplica para este proyecto? (S/N)

Si N → ¿qué estrategia y por qué?

Tiempo máximo de rollback aceptable: __ minutos
¿Quién puede hacer deploy a producción? [cualquier dev / tech lead / devops]
```

---

### 6.4 Variables de Entorno Conocidas

```
Lista las variables de entorno que este proyecto necesita.
(No los valores — solo los nombres y para qué sirven)

El playbook ya asume (ver `backend-stack.md §JWT` + `api-contract.md §6-7`):
- DATABASE_URL
- JWT_PRIVATE_KEY   ← RS256: clave privada para firmar tokens
- JWT_PUBLIC_KEY    ← RS256: clave pública para verificar tokens
- REDIS_URL (Tier 2+)
- CORS_ORIGINS
- NODE_ENV
- PORT

Variables adicionales específicas de este proyecto:
Ej:
- STRIPE_SECRET_KEY → pagos
- AWS_S3_BUCKET → storage de archivos
- OPENAI_API_KEY → generación de contenido
- SENDGRID_API_KEY → emails transaccionales

Variables: __
```

---

### 6.5 Alertas y On-Call (Tier 2+)

```
[Mostrar solo si TIER = product o enterprise]

¿Qué canal de alertas usa el equipo?
A) Slack
B) PagerDuty / Opsgenie (on-call rotation)
C) Email
D) Otro: __

¿Hay on-call rotation? (S/N)
Si S → ¿herramienta? __

Umbrales críticos para este proyecto (ajustar defaults del playbook si es necesario):
- Error rate threshold: __% (default: 1%)
- Latencia p95 threshold: __ ms (default: 1000ms)
- ¿Alguna métrica de negocio a monitorear? (ej: "pagos fallidos > 5/min")
```

---

### Phase 6 Output

```
📋 DEPLOYMENT DEL PROYECTO:

Plataforma: [elegida + constraint si hay]
Environments: [lista según tier / custom]
Estrategia deploy: [rolling/recreate/blue-green + rollback time]
Variables de entorno: [lista de nombres con propósito]
Alertas: [canal + on-call si aplica / no aplica en MVP]

Asumido del playbook:
✅ CI/CD: GitHub Actions
✅ Docker: multi-stage, non-root
✅ Migrations: step separado pre-deploy
✅ Secrets: [según tier]
✅ Coverage gate en CI: [según tier — ver testing-strategy.md §13]
```

**Generar automáticamente:**

1. `docs/operations.md`
    - Plataforma de deploy + environments
    - Estrategia de deploy + rollback
    - Variables de entorno del proyecto
    - Alertas y on-call (si aplica)
    - Referencia al playbook para el resto de decisiones de infra usando `PLAYBOOK_REFERENCE_LABEL`

2. `.env.example`
   - Variables del playbook + variables del proyecto
   - Comentario en cada variable explicando su propósito

```
✅ Generado: docs/operations.md
✅ Generado: .env.example

¿Alguna corrección antes de continuar? (S/N)
```

---

> **Nota**: En Playbook Mode no hay Phase 7 — las decisiones de DevOps e infra (Docker, K8s, CI/CD pipelines, monitoring, alertas, scaling) ya están definidas en el playbook (`infra-stack.md §16` si es local, o la sección equivalente en `PLAYBOOK_REFERENCE_LABEL` si es shared). El flujo va directo a Phase 8 (versión playbook).

**Next Phase:** Phase 8 (Playbook) — Final Documentation & Project Setup

Next: read phase-8-playbook.md from this phases/ directory

---

_Version: 1.0 (Playbook Mode)_
_Last Updated: 2026-03-28_
