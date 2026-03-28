# Infra Stack Reference

> Referencia de infraestructura, DevOps y despliegue para proyectos backend NestJS.
> Tecnologías seleccionadas por adopción en mercado 2025-2026, costo-beneficio y compatibilidad con el stack.
> Ver `backend-stack.md` para el stack de aplicación. Ver `backend-patterns.md` para patrones de código.
> Última actualización: 2026-03-28

---

## Tabla de Contenidos

1. [Stack de Infraestructura](#1-stack-de-infraestructura)
2. [Tiers de Infraestructura](#2-tiers-de-infraestructura)
3. [Docker — Contenedorización](#3-docker--contenedorización)
4. [Docker Compose — Desarrollo Local](#4-docker-compose--desarrollo-local)
5. [CI/CD — GitHub Actions](#5-cicd--github-actions)
6. [Kubernetes — Producción](#6-kubernetes--producción)
7. [Bases de Datos — PostgreSQL](#7-bases-de-datos--postgresql)
8. [Redis — Cache y Queues](#8-redis--cache-y-queues)
9. [Secrets Management](#9-secrets-management)
10. [Observabilidad](#10-observabilidad)
11. [Networking y Seguridad](#11-networking-y-seguridad)
12. [Anti-Patterns de Infraestructura](#12-anti-patterns-de-infraestructura)
13. [Checklist de Setup](#13-checklist-de-setup)
14. [Frontend Deployment](#14-frontend-deployment)
15. [Monorepo Setup (pnpm workspaces + Turborepo)](#15-monorepo-setup-pnpm-workspaces--turborepo)

---

## 1. Stack de Infraestructura

| Categoría          | Tecnología                                     | Versión | Tier   |
| ------------------ | ---------------------------------------------- | ------- | ------ |
| Containerización   | Docker multi-stage                             | 27.x    | Base   |
| Orquestación local | Docker Compose v2                              | 2.x     | Base   |
| Registry           | GitHub Container Registry (GHCR)               | —       | Base   |
| CI/CD              | GitHub Actions                                 | —       | Tier 1 |
| Secrets en CI      | GitHub Actions Secrets + Environments          | —       | Tier 1 |
| Migraciones        | Prisma migrate deploy (step separado)          | —       | Base   |
| DB en prod         | PostgreSQL 17 (managed: RDS / Supabase / Neon) | 17      | Base   |
| Redis en prod      | Redis 7 (managed: Upstash / ElastiCache)       | 7.x     | Tier 2 |
| Orquestación prod  | Kubernetes (EKS / GKE / DigitalOcean)          | 1.30+   | Tier 2 |
| Ingress            | Nginx Ingress Controller                       | —       | Tier 2 |
| TLS                | cert-manager + Let's Encrypt                   | —       | Tier 2 |
| Secrets en prod    | Kubernetes Secrets (base) / Vault / AWS SSM    | —       | Tier 2 |
| Monitoring         | Grafana + Loki (logs) + Prometheus (métricas)  | —       | Tier 3 |
| Tracing            | Grafana Tempo + OpenTelemetry                  | —       | Tier 3 |
| Alerting           | Grafana Alerting / PagerDuty                   | —       | Tier 3 |
| CDN / WAF          | Cloudflare                                     | —       | Tier 2 |
| Feature flags      | Unleash self-hosted                            | —       | Tier 3 |

---

## 2. Tiers de Infraestructura

### 🟢 Base — Todo proyecto desde el día 1

- Docker multi-stage (imagen de producción sin devDependencies, non-root user)
- Docker Compose local con PostgreSQL 17 + pgAdmin (o Adminer)
- `.env.example` completo y documentado
- GitHub Container Registry para imágenes
- Migraciones como step explícito, nunca dentro de la app

### 🟡 Tier 1 — CI/CD básico

- GitHub Actions: lint → test → audit → build → push image
- GitHub Environments (staging / production) con secrets separados
- Deploy automático a staging en cada merge a `main`
- Deploy a producción manual o con tag semántico

### 🟠 Tier 2 — Producción real

- Kubernetes con Deployments, Services, Ingress, HPA
- cert-manager + Let's Encrypt para TLS automático
- Redis managed (Upstash serverless o ElastiCache)
- PostgreSQL managed (RDS, Supabase o Neon)
- Cloudflare como CDN + WAF básico
- Health checks configurados en K8s (liveness + readiness)
- Init Container para migraciones antes del rolling update
- Horizontal Pod Autoscaler según CPU/RPS

### 🔴 Tier 3 — Alta disponibilidad y observabilidad completa

- Grafana Stack: Loki (logs) + Prometheus (métricas) + Tempo (tracing)
- OpenTelemetry SDK en la app → OTLP → Grafana
- Alerting con umbrales de SLO (error rate, latencia p99)
- Vault o AWS Secrets Manager para rotación de secrets
- Multi-region o multi-AZ para disponibilidad 99.9%+
- Unleash para feature flags sin redeploy

---

## 3. Docker — Contenedorización

### Dockerfile multi-stage (producción)

> 📌 **Fuente de verdad**: Este es el Dockerfile canónico del proyecto. `backend-stack.md` referencia esta sección.

```dockerfile
# Stage 1: instalar dependencias
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Stage 2: compilar TypeScript
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Generar Prisma client en el builder
RUN npx prisma generate

# Stage 3: podar devDependencies
FROM node:22-alpine AS pruner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
RUN npm ci --omit=dev --frozen-lockfile

# Stage 4: runtime mínimo — non-root user
FROM node:22-alpine AS runtime
WORKDIR /app

# Non-root user para seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=pruner --chown=appuser:appgroup /app/dist ./dist
COPY --from=pruner --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=pruner --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=pruner --chown=appuser:appgroup /app/package.json ./package.json

USER appuser

# Health check interno (K8s también tiene su propio probe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/main"]
```

### .dockerignore

```
node_modules
dist
.env*
!.env.example
*.log
.git
.github
coverage
**/*.spec.ts
**/*.test.ts
README.md
docker-compose*.yml
```

> **Gotchas**
>
> - Siempre usar `--frozen-lockfile` — garantiza reproducibilidad entre builds.
> - Copiar `prisma/` al runtime — Prisma Client necesita el schema en producción.
> - `EXPOSE` es documentación, no abre puertos — el puerto real lo controla Docker/K8s.
> - Sin `--chown`, los archivos son de root aunque el proceso corra como `appuser`.
> - **`APP_VERSION` como `ARG` en el Dockerfile, no como `ENV`** — el valor viene del CI/CD en build time. Inyectarlo como `ARG` evita que quede hardcodeado en la imagen. Ejemplo: `ARG APP_VERSION` → `ENV APP_VERSION=$APP_VERSION`. En el workflow usar `docker/build-push-action` con `build-args: "APP_VERSION=${{ steps.version.outputs.version }}"` (comillas obligatorias — semver con `+` rompe sin ellas).

---

## 4. Docker Compose — Desarrollo Local

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: .
      target: builder # usar el stage de build, no el runtime mínimo
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
    env_file:
      - .env
    volumes:
      - ./src:/app/src # hot reload
      - ./prisma:/app/prisma
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: npm run start:dev

  postgres:
    image: postgres:17-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: ${DB_NAME:-appdb}
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER:-postgres}']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  # Opcional: UI para PostgreSQL
  adminer:
    image: adminer:latest
    ports:
      - '8080:8080'
    depends_on:
      - postgres

volumes:
  postgres_data:
  redis_data:
```

> **Gotchas**
>
> - `condition: service_healthy` — espera que la DB esté lista antes de iniciar la API.
> - `target: builder` en dev para tener TypeScript disponible para hot reload.
> - Redis con `--appendonly yes` — persistencia en disco para no perder jobs al reiniciar.
> - Nunca commitear el `.env` con credenciales reales — solo `.env.example`.

---

## 5. CI/CD — GitHub Actions

### Pipeline principal

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  ci:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --frozen-lockfile

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Unit tests + coverage
        run: npm run test:cov
        # Falla si coverage < threshold configurado en jest.config

      - name: Security audit
        run: npm audit --audit-level=high

      - name: Build
        run: npm run build

      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: ci
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging

    steps:
      - name: Run migrations
        run: |
          npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Deploy to staging
        run: |
          # kubectl set image deployment/api api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          echo "Deploy to staging"
```

### Release a producción

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Run migrations (production)
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}

      - name: Deploy to production
        run: echo "Deploy tag ${{ github.ref_name }} to production"
```

> **Reglas de CI**
>
> - Tests y audit **antes** del build — si fallan, no se gasta tiempo buildeando.
> - Coverage threshold en `jest.config` — no en el pipeline (falla desde la herramienta).
> - `--frozen-lockfile` en CI — garantiza que nadie instaló una versión diferente localmente.
> - Migraciones como step explícito **antes** del deploy, nunca dentro de la app.
> - Usar `cache-from/cache-to: type=gha` en Docker build — reduce tiempo de build un 50-70%.

> **Gotchas de workflows de GitHub Actions**
>
> - **Siempre usar `actions/checkout@v4`** — v3 usa Node 16 (EOL desde sept 2023). v4 usa Node 20 LTS. Aplica a TODOS los jobs del workflow, no solo al primero.
> - **`BUILD_ARGS` siempre entre comillas** — si el valor contiene `+`, `-` u otros caracteres especiales (ej. versiones semver con metadata `1.3.2-dev+abc123`), el parser de GitHub Actions puede romper el argumento silenciosamente. Siempre: `BUILD_ARGS: "APP_VERSION=${{ steps.version.outputs.version }}"`.
> - **No excluir `.github/workflows/**`en`paths-ignore`** — es el error más común y peligroso: los cambios al workflow mergean a `main`sin disparar el pipeline, van "ciegos" a producción sin ninguna validación. Solo tiene sentido excluir workflows si el workflow hace`git push`de vuelta al branch disparador (loop). En el 99% de los casos no lo hace — no uses`paths-ignore` para workflows.
>
> ```yaml
> # ❌ Los cambios al workflow van a producción sin validación
> paths-ignore:
>   - '.github/workflows/**'
>   - '*.md'
>
> # ✅ Solo excluir lo que realmente no afecta el deploy
> paths-ignore:
>   - 'README.md'
>   - 'readme.md'
>   - 'docs/**'
>   - '*.md'
> ```

---

## 6. Kubernetes — Producción

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      # Init Container: migraciones antes del rolling update
      initContainers:
        - name: run-migrations
          image: ghcr.io/org/api:latest
          command: ['npx', 'prisma', 'migrate', 'deploy']
          envFrom:
            - secretRef:
                name: api-secrets

      containers:
        - name: api
          image: ghcr.io/org/api:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: api-secrets
            - configMapRef:
                name: api-config

          # Liveness: ¿está corriendo el proceso? K8s restarta si falla
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
            failureThreshold: 3

          # Readiness: ¿puede recibir tráfico? K8s saca del LB si falla
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3

          # Recursos: siempre definir para que el scheduler funcione correctamente
          resources:
            requests:
              memory: '256Mi'
              cpu: '100m'
            limits:
              memory: '512Mi'
              cpu: '500m'

          # Graceful shutdown: esperar que los requests en vuelo terminen
          lifecycle:
            preStop:
              exec:
                command: ['/bin/sh', '-c', 'sleep 5']
          terminationGracePeriodSeconds: 30
```

### Service e Ingress

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: production
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: '100' # req/s por IP
    nginx.ingress.kubernetes.io/proxy-body-size: '10m'
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.tu-dominio.com  # ← reemplazar con tu dominio real
      secretName: api-tls
  rules:
    - host: api.tu-dominio.com  # ← reemplazar con tu dominio real
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

### HorizontalPodAutoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

> **Gotchas de K8s**
>
> - **Init Container para migraciones**: en rolling update, múltiples pods corren las migraciones simultáneamente si se hace dentro de la app. El Init Container corre **antes** de que el pod arranque y Prisma tiene lock distribuido.
> - **`preStop` sleep**: da tiempo al load balancer para deregistrar el pod antes de que empiece el shutdown. Sin esto, algunos requests llegan a un pod que ya está cerrando.
> - **`terminationGracePeriodSeconds: 30`**: debe ser mayor que el timeout del request más largo. NestJS `enableShutdownHooks()` escucha SIGTERM.
> - **Liveness ≠ Readiness**: liveness solo chequea si el proceso está vivo; readiness chequea si puede recibir tráfico (DB conectada, etc.).
> - Sin `resources.requests`, el scheduler puede ubicar muchos pods en un nodo que luego se queda sin memoria (OOM).

---

## 7. Bases de Datos — PostgreSQL

### Opciones managed recomendadas

| Opción                      | Cuándo usar                             | Precio aprox. | Notas                                      |
| --------------------------- | --------------------------------------- | ------------- | ------------------------------------------ |
| **Neon** (serverless)       | Side projects, staging                  | $0–19/mes     | Branching por PR, serverless scale-to-zero |
| **Supabase**                | Proyectos con auth integrada o realtime | $0–25/mes     | PostgreSQL + extras, buen DX               |
| **RDS PostgreSQL**          | Producción AWS, compliance              | $25–200+/mes  | Más control, más caro                      |
| **DigitalOcean Managed PG** | Proyectos medianos, costo predecible    | $15–50/mes    | Simple, bien documentado                   |
| **Self-hosted en K8s**      | Control total o costo ultra-bajo        | Solo infra    | Requiere expertise en backup y failover    |

### Configuración de conexión con Prisma (producción)

```typescript
// PrismaService — ver backend-patterns.md §11
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL_ENABLED === 'true' ? { rejectUnauthorized: false } : false,
  max: 10, // máximo de conexiones en el pool
  idleTimeoutMillis: 30_000, // liberar conexiones idle después de 30s
  connectionTimeoutMillis: 5_000, // fallar rápido si no hay conexiones disponibles
});
```

### Migraciones — flujo correcto

```bash
# Desarrollo: crear y aplicar migración
npx prisma migrate dev --name add_item_status

# CI/CD y producción: solo aplicar migraciones existentes (no crea nuevas)
npx prisma migrate deploy

# Verificar estado de migraciones
npx prisma migrate status

# Nunca en producción:
# npx prisma db push      ← bypasea el historial de migraciones
# npx prisma migrate reset ← DESTRUCTIVO
```

### Backup automático

```bash
# Script de backup a S3 (correr como CronJob en K8s)
#!/bin/sh
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://TU-BUCKET-DE-BACKUPS/postgres/${TIMESTAMP}.sql.gz  # ← reemplazar con nombre real del bucket
# Retención: 30 días de backups diarios, 12 meses de backups mensuales
```

---

## 8. Redis — Cache y Queues

### Opciones managed recomendadas

| Opción                         | Cuándo usar                          | Notas                                |
| ------------------------------ | ------------------------------------ | ------------------------------------ |
| **Upstash** (serverless)       | Side projects, staging, bajo tráfico | Pay-per-request, gratis en tier bajo |
| **ElastiCache**                | Producción AWS, alto tráfico         | Multi-AZ, clustering nativo          |
| **DigitalOcean Managed Redis** | Proyectos medianos                   | Simple, predecible                   |
| **Redis Cloud**                | Multi-cloud o sin AWS                | Buena opción cross-provider          |

### Separación de DBs (fuente de verdad)

```
Redis DB 0 → BullMQ queues (jobs, workers)
Redis DB 1 → Cache de aplicación (TanStack Query backend, session data)
```

> 📌 **Fuente de verdad**: La asignación de Redis databases está centralizada aquí.
> `backend-stack.md` y `backend-patterns.md` referencian esta sección.

### Configuración de conexión

```typescript
// BullMQ connection
{
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,                         // DB 0 para queues
  connectTimeout: 2000,
  maxRetriesPerRequest: 0,       // falla inmediato si Redis no está disponible
  enableOfflineQueue: false,     // no encolar comandos si está desconectado
}

// Cache connection
{
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 1,                         // DB 1 para cache
}
```

---

## 9. Secrets Management

### Por tier

| Tier                | Solución                              | Cómo                             |
| ------------------- | ------------------------------------- | -------------------------------- |
| Base / local        | `.env` (nunca commitear)              | `.env.example` documentado       |
| Tier 1 (CI)         | GitHub Actions Secrets + Environments | Secrets separados por ambiente   |
| Tier 2 (K8s)        | Kubernetes Secrets (base64)           | `kubectl create secret generic`  |
| Tier 3 (enterprise) | AWS Secrets Manager / HashiCorp Vault | Rotación automática, audit trail |

### Kubernetes Secrets

```bash
# Crear secret desde env file (nunca commitear el secret al repo)
kubectl create secret generic api-secrets \
  --from-env-file=.env.production \
  --namespace=production

# Verificar (sin mostrar valores)
kubectl describe secret api-secrets -n production
```

### AWS Secrets Manager (Tier 3)

```typescript
// src/main.ts — cargar ANTES de NestFactory.create()
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function loadSecretsFromAWS(): Promise<void> {
  if (process.env.AWS_SECRET_ID) {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const { SecretString } = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.AWS_SECRET_ID }),
    );
    const secrets = JSON.parse(SecretString ?? '{}');
    Object.assign(process.env, secrets);
  }
}

async function bootstrap() {
  await loadSecretsFromAWS(); // PRIMERO — antes que NestJS lea process.env
  const app = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }));
  // ...
}
```

---

## 10. Observabilidad

### Tier 1 — Logging estructurado (Pino)

Ya configurado en la app. Ver `backend-patterns.md` §12.

Output en producción (JSON por línea, parseable por Loki/CloudWatch):

```json
{
  "level": 30,
  "time": 1706745600000,
  "requestId": "f47ac10b",
  "method": "GET",
  "url": "/api/v1/items",
  "statusCode": 200,
  "duration": 45
}
```

### Tier 2 — Error tracking (Sentry)

```typescript
// src/main.ts
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0.1,
});
```

### Tier 3 — OpenTelemetry (tracing distribuido)

```typescript
// src/instrumentation.ts — importar ANTES que cualquier otro módulo
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://tempo:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // muy verboso
    }),
  ],
});

sdk.start();
```

```typescript
// src/main.ts
import './instrumentation'; // PRIMERO — antes que NestJS
```

### Stack de observabilidad self-hosted (Tier 3)

```yaml
# docker-compose.observability.yml — para staging/producción self-hosted
services:
  loki:
    image: grafana/loki:latest
    ports: ['3100:3100']
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log
      - ./promtail-config.yaml:/etc/promtail/config.yaml

  prometheus:
    image: prom/prometheus:latest
    ports: ['9090:9090']
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  tempo:
    image: grafana/tempo:latest
    ports: ['3200:3200', '4318:4318']

  grafana:
    image: grafana/grafana:latest
    ports: ['3001:3000']
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
```

---

## 11. Networking y Seguridad

### Cloudflare (Tier 2)

- **Proxy**: toda la tráfico pasa por Cloudflare → oculta IP del servidor
- **WAF**: reglas OWASP para bloquear ataques comunes (SQLi, XSS)
- **Rate limiting**: a nivel de Cloudflare antes de llegar al servidor
- **DDoS protection**: absorbe ataques volumétricos sin costo adicional

```
DNS → Cloudflare (proxy) → Load Balancer / Nginx Ingress → K8s Service → Pod
```

### Network Policies en K8s

```yaml
# Solo el ingress puede hablar con la API; la API solo puede hablar con la DB
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx-ingress
      ports:
        - port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - port: 6379
```

### HTTPS / TLS

```bash
# cert-manager con Let's Encrypt (en K8s)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: devops@tu-dominio.com  # ← reemplazar con email real del equipo
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

---

## 12. Anti-Patterns de Infraestructura

### ❌ 1. Migraciones dentro de la app al arrancar

```typescript
// ❌ Race condition en rolling updates — múltiples pods migran simultáneamente
async onModuleInit() {
  await exec('npx prisma migrate deploy');
}

// ✅ Init Container en K8s (corre antes del pod, una sola vez por deploy)
// Ver k8s/deployment.yaml §6
```

### ❌ 2. Secrets en variables de entorno del Dockerfile

```dockerfile
# ❌ El secreto queda en las capas de la imagen — visible con docker history
ENV DATABASE_URL=postgresql://user:password@host/db

# ✅ Inyectar en runtime via Kubernetes Secrets o entorno del proceso
# El Dockerfile nunca debe tener valores reales de credenciales
```

### ❌ 3. Sin límites de recursos en K8s

```yaml
# ❌ Sin limits → un pod puede consumir todos los recursos del nodo
containers:
  - name: api
    image: api:latest
    # Sin resources → OOM del nodo entero

# ✅ Siempre definir requests y limits
resources:
  requests:
    memory: '256Mi'
    cpu: '100m'
  limits:
    memory: '512Mi'
    cpu: '500m'
```

### ❌ 4. Un solo pod en producción

```yaml
# ❌ replica: 1 → zero downtime deployments imposibles
replicas: 1

# ✅ Mínimo 2 réplicas para rolling updates sin downtime
replicas: 2
# + PodDisruptionBudget para garantizar que siempre hay al menos 1 up
```

### ❌ 5. Swagger UI público en producción

```typescript
// ❌ Expone toda la superficie de ataque
SwaggerModule.setup('api/docs', app, document); // sin condición

// ✅ Solo en non-production
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
}
// O proteger con Basic Auth si se necesita en staging
```

### ❌ 6. Liveness probe que chequea dependencias externas

```yaml
# ❌ Si la DB está caída, K8s reinicia el pod en loop (CrashLoopBackOff)
livenessProbe:
  httpGet:
    path: /health/ready  # chequea DB + Redis

# ✅ Liveness: solo que el proceso está vivo
livenessProbe:
  httpGet:
    path: /health        # retorna { status: 'ok' } siempre

# ✅ Readiness: chequea dependencias (saca del LB, no reinicia)
readinessProbe:
  httpGet:
    path: /health/ready  # chequea DB + Redis
```

### ❌ 7. Excluir `.github/workflows/**` en `paths-ignore`

```yaml
# ❌ Los cambios al workflow van a producción sin ninguna validación
# Un merge con solo cambios de workflow NO dispara el pipeline
on:
  push:
    branches: [main]
    paths-ignore:
      - '.github/workflows/**'   # ← silencia el propio workflow
      - '*.md'

# ✅ Solo excluir lo que genuinamente no afecta el deploy
on:
  push:
    branches: [main]
    paths-ignore:
      - 'README.md'
      - 'docs/**'
      - '*.md'
```

> **Por qué es peligroso**: si el único cambio en un PR es el workflow (ej. actualizar `checkout@v3 → v4` o agregar un step de audit), el pipeline **no se ejecuta** al mergear. El cambio llega a producción sin lint, sin tests, sin validación. La mayoría de los pipelines no hacen `git push` de vuelta al branch disparador, por lo que no existe riesgo de loop — no hay razón para excluir los propios workflows.

---

## 13. Checklist de Setup

### 🟢 Base — Todo proyecto

- [ ] `.gitattributes` con normalización de line endings (LF en todos los archivos de texto, CRLF solo en `.bat`/`.cmd`)
- [ ] `pnpm.overrides` (o `npm overrides` / `yarn resolutions`) para parchear vulnerabilidades en dependencias transitivas — revisar al iniciar y cada vez que `pnpm audit` reporte issues
- [ ] Dockerfile multi-stage con non-root user y `HEALTHCHECK`
- [ ] `.dockerignore` configurado (excluye `node_modules`, `.env*`, `dist`)
- [ ] `.env.example` completo con todas las variables y valores de ejemplo
- [ ] Docker Compose local con PostgreSQL 17 + Redis 7 + health checks
- [ ] `npm run docker:up` alias en `package.json`
- [ ] Migraciones como comando explícito (`npx prisma migrate deploy`) — NUNCA en la app
- [ ] GHCR configurado como registry

#### `.gitattributes` recomendado

```gitattributes
# Normalize line endings to LF on commit for all text files
* text=auto eol=lf

# Windows-only scripts keep CRLF
*.bat text eol=crlf
*.cmd text eol=crlf
```

> **Por qué importa**: Sin esto, los desarrolladores en Windows pueden commitear archivos con CRLF y romper scripts de shell, diffs de CI, y herramientas que asumen LF. `text=auto eol=lf` normaliza al hacer commit, sin importar el OS del dev.

#### `pnpm.overrides` — parchear dependencias transitivas

```json
// package.json
{
  "pnpm": {
    "overrides": {
      "nombre-del-paquete": ">=version-segura"
    }
  }
}
```

Equivalentes en otros package managers:

- **npm**: campo `"overrides"` en `package.json` (npm 8.3+)
- **yarn**: campo `"resolutions"` en `package.json`

> **Cuándo usarlo**: cuando `pnpm audit` reporta una vulnerabilidad en una dependencia transitiva que el owner directo no ha actualizado aún. Documentar siempre el motivo en un comentario o en el PR. Revisar periódicamente si ya no es necesario (el owner pudo haber actualizado).

#### `lint-staged` — configuración por tipo de repo

**Single repo** (backend solo, frontend solo, o fullstack sin workspaces):

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,yml,yaml}": ["prettier --write"]
  }
}
```

**Monorepo con pnpm workspaces** (backend + frontend en el mismo repo):

Separar los patrones por workspace para que cada app use su propia config de ESLint y su propio `tsconfig`:

```json
// package.json (raíz del monorepo)
{
  "lint-staged": {
    "apps/api/**/*.ts": ["pnpm --filter @tu-org/api exec eslint --max-warnings 0"],
    "apps/admin/**/*.{ts,tsx}": ["pnpm --filter @tu-org/admin exec eslint --max-warnings 0"],
    "*.{ts,tsx,js,mjs,cjs,json,md,css,yml,yaml}": ["pnpm exec prettier --write"]
  }
}
```

> **Por qué separar por workspace**: cada app puede tener reglas ESLint distintas (e.g. el backend tiene `@typescript-eslint/recommended-type-checked` con `parserOptions.project` apuntando a su `tsconfig`). Si se corre un solo `eslint` desde la raíz, la resolución de `tsconfig` falla. Usar `--filter` garantiza que cada app corre ESLint con su propio contexto.
>
> El mismo principio aplica con **npm workspaces** (`npm --workspace=apps/api run lint`) y **yarn workspaces** (`yarn workspace @tu-org/api lint`).

### 🟡 Tier 1 — CI/CD básico

- [ ] GitHub Actions: `lint → typecheck → test:cov → audit → build → push`
- [ ] **`actions/checkout@v4`** en TODOS los jobs — v3 usa Node 16 (EOL); v4 usa Node 20 LTS
- [ ] Coverage threshold configurado en `jest.config` (mínimo 70% lines)
- [ ] `npm audit --audit-level=high` — falla el pipeline si hay vulnerabilidades altas
- [ ] GitHub Environments: `staging` + `production` con secrets separados
- [ ] Secrets: `DATABASE_URL`, `REDIS_URL`, `JWT_PUBLIC_KEY`, `SENTRY_DSN`
- [ ] Deploy a staging automático en merge a `main`
- [ ] Docker layer caching en CI (`cache-from/cache-to: type=gha`)
- [ ] **`BUILD_ARGS` entre comillas** en workflows — versiones semver con `+` o `-` rompen silenciosamente si no están citadas: `BUILD_ARGS: "APP_VERSION=${{ steps.version.outputs.version }}"`
- [ ] **`paths-ignore` no incluye `.github/workflows/**`\*\* — ver anti-pattern ❌ 7

### 🟠 Tier 2 — Producción K8s

- [ ] Kubernetes Deployment con Init Container para migraciones
- [ ] Liveness probe: `GET /health` (sin dependencias externas)
- [ ] Readiness probe: `GET /health/ready` (con DB + Redis)
- [ ] Resources `requests` y `limits` definidos para todos los containers
- [ ] `terminationGracePeriodSeconds: 30` + `preStop: sleep 5`
- [ ] HorizontalPodAutoscaler (min: 2, max: 10, CPU target: 70%)
- [ ] PodDisruptionBudget: `minAvailable: 1`
- [ ] Nginx Ingress + cert-manager + Let's Encrypt TLS automático
- [ ] Kubernetes Secrets para todas las credenciales de producción
- [ ] Cloudflare con proxy habilitado (no DNS only)
- [ ] Redis managed (Upstash / ElastiCache) con TLS
- [ ] PostgreSQL managed con backups automáticos habilitados
- [ ] `@sentry/nestjs` configurado con DSN de producción

### 🔴 Tier 3 — Observabilidad completa

- [ ] OpenTelemetry SDK en `instrumentation.ts` (importado antes que NestJS)
- [ ] Grafana + Loki + Prometheus + Tempo stack
- [ ] Alertas en Grafana: error rate > 1%, latencia p99 > 500ms, pod restarts
- [ ] AWS Secrets Manager o Vault para rotación automática de credenciales
- [ ] Network Policies en K8s (zero-trust entre pods)
- [ ] Spectral CLI en CI para linting OpenAPI spec contra OWASP
- [ ] Unleash para feature flags sin redeploy
- [ ] Multi-AZ en DB y Redis (RDS Multi-AZ, ElastiCache con replica)

---

## 14. Frontend Deployment

El frontend React/Next.js se puede desplegar en dos plataformas según el contexto del proyecto.

---

### Opción A: Cloudflare Pages (proyectos personales / startups / MVPs)

**Cuándo usarlo:** Proyectos propios, startups tempranas, MVPs, cuando se prioriza velocidad de setup y costo cero.

**Ventajas:**
- Free tier muy generoso (500 deploys/mes, bandwidth ilimitado)
- CDN global automático (300+ edge locations)
- Preview deployments por rama automáticos
- Zero config con Next.js (static export) o Vite

**Limitaciones:**
- Runtime edge limitado (no Node.js completo) — no soporta Next.js SSR sin adaptadores
- Para Next.js con SSR usar `@cloudflare/next-on-pages`

**Setup básico:**
```yaml
# .github/workflows/deploy-frontend.yml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: my-project
          directory: out  # o .next para Next.js
```

**Variables de entorno:**
Configuradas en el dashboard de Cloudflare Pages → Settings → Environment Variables.
Prefijo `NEXT_PUBLIC_` para variables expuestas al cliente.

---

### Opción B: AWS S3 + CloudFront (proyectos enterprise / trabajo)

**Cuándo usarlo:** Proyectos enterprise, cuando el backend ya está en AWS, cuando se necesita control total sobre caché, headers y dominios.

**Ventajas:**
- Misma cuenta AWS que el backend (IAM, secrets, billing unificado)
- CloudFront es uno de los CDNs más rápidos del mundo
- Control total sobre cache headers, invalidaciones, geo-restrictions
- Costos muy bajos a escala

**Setup básico:**
```yaml
# .github/workflows/deploy-frontend-aws.yml
name: Deploy Frontend (AWS)

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run build
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Deploy to S3
        run: aws s3 sync ./out s3://${{ secrets.S3_BUCKET }} --delete
        
      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

**Variables de entorno:**
- Build time: configuradas como secrets en GitHub Actions
- Prefijo `NEXT_PUBLIC_` o `VITE_` para variables expuestas al cliente
- Las variables se hornean en el bundle en build time — un cambio requiere rebuild

> ⚠️ **Next.js en AWS S3**: S3 no soporta SSR. Para Next.js con SSR en AWS usar **AWS Amplify** o desplegar el servidor Next.js en **EC2/ECS/Railway**.
> Para apps puramente estáticas (Vite, Next.js con `output: 'export'`), S3 + CloudFront es la opción ideal.

---

### Comparativa rápida

| | Cloudflare Pages | AWS S3 + CloudFront |
|---|---|---|
| Setup | ~5 minutos | ~30 minutos |
| Costo | Free tier generoso | Pay per use (~$1-5/mes típico) |
| SSR Next.js | ⚠️ Requiere adaptador | ❌ No nativo (usar Amplify) |
| Control | Medio | Alto |
| Integración AWS | ❌ | ✅ |
| Mejor para | MVPs, proyectos propios | Enterprise, ya en AWS |

---

## 15. Monorepo Setup (pnpm workspaces + Turborepo)

> Usar cuando el proyecto tiene backend y frontend en el mismo repositorio.
> Ventajas: tipos compartidos, CI unificado, refactors atómicos, cache de builds.

### Estructura de directorios

```
my-project/
├── apps/
│   ├── backend/          ← NestJS + Fastify
│   └── frontend/         ← Next.js o Vite + React
├── packages/
│   ├── types/            ← Tipos compartidos (ApiEnvelope, DTOs, etc.)
│   ├── zod-schemas/      ← Schemas Zod compartidos (backend + frontend)
│   └── test-utils/       ← Factories y helpers de testing compartidos
├── package.json          ← Root workspace
├── pnpm-workspace.yaml
├── turbo.json
└── .github/
    └── workflows/
        └── ci.yml
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Root package.json

```json
{
  "name": "my-project",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Package compartido: @repo/types

```json
// packages/types/package.json
{
  "name": "@repo/types",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

```typescript
// packages/types/src/index.ts
export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SingleEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
  error: null;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  meta: PaginatedMeta;
  error: null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  data: null;
  meta: Record<string, unknown>;
  error: ApiError;
}

export type ApiEnvelope<T> = SingleEnvelope<T> | PaginatedEnvelope<T> | ErrorEnvelope;
```

```json
// tsconfig.json en apps/backend y apps/frontend
{
  "compilerOptions": {
    "paths": {
      "@repo/types": ["../../packages/types/src/index.ts"],
      "@repo/zod-schemas": ["../../packages/zod-schemas/src/index.ts"],
      "@repo/test-utils": ["../../packages/test-utils/src/index.ts"]
    }
  }
}
```

### Package compartido: @repo/zod-schemas

```typescript
// packages/zod-schemas/src/index.ts
// Schemas Zod compartidos entre backend y frontend — un solo lugar para validación
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;

// Backend: export class CreateUserDto extends createZodDto(CreateUserSchema) {}
// Frontend: useForm<CreateUserDto>({ resolver: zodResolver(CreateUserSchema) })
```

### Consumo entre apps

```typescript
// apps/backend — instalar el package
// pnpm add @repo/types --filter=backend

// apps/backend/src/modules/items/items.controller.ts
import type { PaginatedEnvelope } from '@repo/types';
import type { Item } from './domain/item.entity';

// El tipo del response ahora es compartido con el frontend
async findAll(): Promise<PaginatedEnvelope<Item>> { ... }
```

```typescript
// apps/frontend — instalar el package
// pnpm add @repo/types --filter=frontend

// apps/frontend/src/api/items.ts
import type { PaginatedEnvelope } from '@repo/types';
import type { Item } from '@repo/types';

// Si el backend cambia la forma del envelope, el frontend falla en TypeScript inmediatamente
const response: PaginatedEnvelope<Item> = await api.get('/items');
```

### CI/CD con Turborepo (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      # Cache de Turborepo
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm turbo typecheck

      - name: Lint
        run: pnpm turbo lint

      - name: Test
        run: pnpm turbo test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

      - name: Build
        run: pnpm turbo build
```

### Comandos útiles

```bash
# Correr solo el backend en dev
pnpm turbo dev --filter=backend

# Correr frontend y backend en paralelo
pnpm turbo dev --filter=backend --filter=frontend

# Agregar dependencia a un package específico
pnpm add @nestjs/core --filter=backend

# Agregar dependencia compartida
pnpm add zod --filter=@repo/zod-schemas

# Correr tests solo en packages afectados por cambios (desde main)
pnpm turbo test --filter=...[origin/main]

# Ver el grafo de dependencias
pnpm turbo build --graph
```

> 📌 **Turborepo cache**: Turborepo cachea los outputs de cada tarea. Si el código no cambió, reutiliza el cache — los builds subsiguientes son 10x más rápidos. En CI, configurar `TURBO_TOKEN` y `TURBO_TEAM` para cache remoto en Vercel.

> ⚠️ **Path aliases en monorepo**: Los paths `@repo/*` deben estar configurados en el `tsconfig.json` de cada app. Si usás Jest en el backend, también en `jest.config.ts` via `moduleNameMapper`. Si usás Vitest, en `vite.config.ts` via `resolve.alias`.

---

---

## §16 — Estándares de Deployment por Tier

> Esta sección define las decisiones de infraestructura por defecto para `/flow-build` modo playbook.
> El proyecto puede documentar excepciones en su `.agent/rules/playbook.md`.

### Environments por Tier

| Tier | Environments | Estrategia de promote |
|------|-------------|----------------------|
| Base | `dev` (local) + `production` | Deploy manual a producción con tag |
| Tier 1 (MVP / Side Project) | `dev` + `staging` + `production` | Auto-deploy a staging, manual a production |
| Tier 2 (Producto en Crecimiento) | `dev` + `staging` + `production` | Auto staging, gate de aprobación para production |
| Tier 3 (Enterprise) | `dev` + `staging` + `production` + `canary` (opcional) | Auto staging, gate de aprobación + canary gradual |

### Estrategia de Deploy por Tier

| Tier | Estrategia | Rollback |
|------|-----------|---------|
| Base | Recreate (acepta downtime breve) | Redeploy de imagen anterior |
| Tier 1 (MVP / Side Project) | Rolling update (zero-downtime) | `kubectl rollout undo` |
| Tier 2 (Producto en Crecimiento) | Rolling update o Blue-Green | Switch de tráfico inmediato |
| Tier 3 (Enterprise) | Blue-Green o Canary (según criticidad) | Switch de tráfico inmediato |

### Migrations — Siempre Step Separado

```yaml
# K8s: Init Container antes del rolling update
initContainers:
  - name: migrate
    image: ghcr.io/org/api:${{ IMAGE_TAG }}
    command: ['npx', 'prisma', 'migrate', 'deploy']
    envFrom:
      - secretRef:
          name: app-secrets

# CI/CD: Step explícito antes del deploy
- name: Run migrations
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

> Nunca correr `migrate deploy` dentro de `onModuleInit` o al arrancar la app. Ver `backend-stack.md §anti-patterns`.

### Zero-Downtime Migrations — Patrón Expand/Contract

Para cambios breaking en el schema sin downtime:

1. **Expand**: Agregar columna nueva nullable, deployar app que escribe en ambas
2. **Migrate**: Backfill de datos existentes (job separado o migration idempotente)
3. **Contract**: Eliminar columna vieja en siguiente release, cuando la app ya no la usa

> Nunca hacer `DROP COLUMN` o `NOT NULL` sin pasar por Expand/Contract en producción.

### Checklist de Go-Live por Tier

**Base (MVP):**
- [ ] `.env.example` completo y documentado
- [ ] Docker image build sin errores
- [ ] Health check `/health` responde 200
- [ ] Variables de entorno configuradas en destino
- [ ] Migrations aplicadas antes del primer deploy

**Tier 1 (Producto):**
- Todo lo de Base +
- [ ] Pipeline CI: lint → test → audit → build → push
- [ ] GitHub Environments configurados (staging / production)
- [ ] Deploy automático a staging en merge a `main`
- [ ] Swagger desactivado en producción
- [ ] Logs estructurados con Pino fluyendo a destino

**Tier 2+ (Producción real):**
- Todo lo anterior +
- [ ] K8s Deployment con liveness + readiness probes
- [ ] HPA configurado (min 2 replicas en producción)
- [ ] terminationGracePeriodSeconds: 30 + preStop sleep 5
- [ ] Init Container para migrations
- [ ] Secrets en K8s Secrets o Vault (no en env planas)
- [ ] TLS con cert-manager + Let's Encrypt
- [ ] Alertas configuradas (error rate, latencia p95, pod crash)
- [ ] Runbook de incidentes documentado

_Actualizar este documento al cambiar herramientas de infraestructura o establecer nuevos patrones de despliegue._
_Última actualización: 2026-03-28_
