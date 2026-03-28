# NestJS Backend Stack Reference

> Documento de referencia para implementar el stack recomendado en proyectos NestJS backend.
> **Audiencia**: IA y desarrolladores que inician un nuevo proyecto desde cero.
> Ver `backend-patterns.md` para implementaciones de código de cada patrón.
> Ver `api-contract.md` para el contrato de integración con el frontend.
> Ver `infra-stack.md` para Docker, CI/CD, Kubernetes y observabilidad.
> Última actualización: 2026-03-19

---

## Stack Recomendado

| Categoría            | Tecnología                                            | Versión         | Tier mínimo |
| -------------------- | ----------------------------------------------------- | --------------- | ----------- |
| Runtime              | Node.js LTS Alpine                                    | 22              | Base        |
| Framework            | NestJS + TypeScript strict                            | 11.x + 5.7      | Base        |
| HTTP Adapter         | `@nestjs/platform-fastify`                            | —               | Base        |
| Decoradores TS       | TC39 Stage 3 (sin `experimentalDecorators`)           | TS 5.x          | Base        |
| Module system        | ESM `nodenext`                                        | —               | Base        |
| ORM                  | Prisma + `@prisma/adapter-pg`                         | 7.x             | Base        |
| Base de datos        | PostgreSQL                                            | 17              | Base        |
| Validación           | `class-validator` + `class-transformer`               | 0.14 + 0.5      | Base        |
| Documentación API    | `@nestjs/swagger` v11                                 | 11.x            | Base        |
| Seguridad HTTP       | Helmet 8 + CORS + `@nestjs/throttler`                 | —               | Base        |
| Linting              | ESLint 9 flat config + `typescript-eslint` + Prettier | 9.x + 8.x + 3.x | Base        |
| Git hooks            | Husky + `lint-staged` + `commitlint`                  | 9.x + 15.x      | Base        |
| Config/Env           | `@nestjs/config` + Joi                                | 4.x + 17.x      | Base        |
| Containerización     | Docker multi-stage                                    | —               | Base        |
| Resiliencia básica   | `AllExceptionsFilter` + `DomainException`             | —               | Base        |
| Health checks        | `@nestjs/terminus`                                    | —               | Base        |
| Testing unit         | Jest 30 + `ts-jest` + `jest-mock-extended`            | 30.x            | Base        |
| Logging              | Pino + `pino-http` + AsyncLocalStorage                | 9.x             | Base        |
| Testing E2E básico   | `supertest` (sin Testcontainers)                      | 7.x             | Tier 1      |
| Autenticación        | `@nestjs/jwt` + `passport-jwt` + bcrypt               | —               | Base        |
| Caché                | Redis (DB1) + ioredis + `@nestjs/cache-manager`       | 7.x + 5.x       | Tier 2      |
| Colas                | BullMQ + `@nestjs/bullmq` (Redis DB0)                 | 5.x + 11.x      | Tier 2      |
| Error tracking       | `@sentry/nestjs`                                      | 8.x             | Tier 2      |
| Testing E2E completo | `supertest` + Testcontainers (PostgreSQL/Redis)       | 7.x             | Tier 2      |
| CI/CD                | GitHub Actions                                        | —               | Tier 2      |
| Versionado           | Semantic Release desde Conventional Commits           | —               | Tier 2      |
| Métricas             | `@willsoto/nestjs-prometheus` + `prom-client`         | 6.x             | Tier 3      |
| Tracing              | OpenTelemetry SDK → OTLP → Grafana Tempo              | —               | Tier 3      |
| Compresión           | Nginx gzip                                            | —               | Tier 3      |
| Circuit breaker      | Opossum                                               | 8.x             | Tier 3      |

---

## Tiers de Implementación

Elegí el tier según la naturaleza del proyecto. Cada tier incluye todo lo del tier anterior.

---

### 🟢 Base — Todo proyecto sin excepción

**Cuándo**: Cualquier proyecto NestJS, desde un script hasta un enterprise.
**Criterio**: Costo de setup mínimo, valor máximo desde el día 1. Omitir cualquiera de estas genera deuda técnica inmediata.

- NestJS + Fastify + TypeScript strict + ESM + TC39 decorators
- Prisma + PostgreSQL
- `class-validator` + `class-transformer` + `ValidationPipe` global

> 📌 **Alternativa moderna: `nestjs-zod`**
> Si el proyecto usa monorepo o quiere compartir schemas de validación entre backend y frontend,
> considerá `nestjs-zod` en lugar de `class-validator`. Permite usar Zod directamente en DTOs de NestJS
> con integración Swagger automática. Elimina la duplicación de schemas — el mismo `z.object()` 
> sirve para validar en backend y frontend.
>
> ```typescript
> import { createZodDto } from 'nestjs-zod';
> import { z } from 'zod';
>
> const CreateItemSchema = z.object({
>   name: z.string().min(1).max(100),
>   price: z.number().positive(),
> });
>
> export class CreateItemDto extends createZodDto(CreateItemSchema) {}
> // Funciona con @Body() CreateItemDto igual que class-validator
> ```
>
> **Cuándo usar nestjs-zod**: Monorepo con frontend que ya usa Zod, o proyectos nuevos donde se quiere un solo sistema de validación.
> **Cuándo mantener class-validator**: Proyectos existentes grandes donde la migración sería costosa.
- `ClassSerializerInterceptor` global (`@Exclude()` automático)
- `@nestjs/config` + Joi (fail-fast en startup si falta una variable)
- `AllExceptionsFilter` + `DomainException` + X-Request-ID
- Helmet + CORS + `ThrottlerModule` (seguridad HTTP mínima)

> ⚠️ **Multi-pod / K8s**: El throttler por defecto usa almacenamiento en memoria — cada pod tiene su propio
> contador, lo que hace que el rate limiting no funcione correctamente con múltiples instancias.
> Para deployments con más de 1 pod, usá `ThrottlerStorageRedisService`:
>
> ```typescript
> import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
>
> ThrottlerModule.forRootAsync({
>   inject: [ConfigService],
>   useFactory: (config: ConfigService) => ({
>     throttlers: [{ ttl: 60_000, limit: 10 }],
>     storage: new ThrottlerStorageRedisService(
>       new Redis({
>         host: config.get('app.redis.host'),
>         port: config.get('app.redis.port'),
>         db: 2, // DB separada para throttling
>       }),
>     ),
>   }),
> }),
> ```
>
> Package requerido: `@nest-lab/throttler-storage-redis`
- `@nestjs/swagger` (documentar desde el inicio cuesta poco; retro-documentar cuesta mucho)
- `@nestjs/terminus` en `GET /health`
- API URI versioning (`/v1/`)
- `@nestjs/jwt` + `passport-jwt` + bcrypt — auth estándar del ecosistema NestJS

> 📌 **Alternativa más segura: argon2**
> `argon2` es el ganador del Password Hashing Competition y la recomendación actual de OWASP (2023+).
> Para proyectos nuevos, preferir `argon2` sobre `bcrypt`.
>
> ```typescript
> import * as argon2 from 'argon2';
>
> // Hash
> const hash = await argon2.hash(password);
>
> // Verify
> const valid = await argon2.verify(hash, password);
> ```
>
> `bcrypt` sigue siendo válido en proyectos existentes — no es urgente migrar.
- Jest 30 unit + `jest-mock-extended`
- ESLint 9 + Prettier + Husky + `lint-staged` + `commitlint`
- Docker multi-stage (imagen sin devDependencies, non-root user)
- `app.enableShutdownHooks()`

---

### 🟡 Tier 1 — MVP / Side Project

**Cuándo**: Equipo 1-3 personas. Sin SLA formal. Iteración rápida. Tráfico bajo o impredecible.
**Criterio**: Lo mínimo para tener logs estructurados y tests E2E básicos sin overhead de infraestructura extra.

Agregar sobre Base:

- **Pino + `pino-http` + AsyncLocalStorage** — JSON estructurado desde el día 1, casi zero-config
- **`supertest`** para E2E (sin Testcontainers — fixtures o DB en memoria son suficientes en este tier)

❌ **No incluir en Tier 1**: Redis, BullMQ, Sentry, OpenTelemetry, Prometheus, Testcontainers, CI/CD complejo, Opossum.

---

### 🟠 Tier 2 — Producto en Crecimiento / Early SaaS

**Cuándo**: Equipo 3-10 personas. Usuarios reales con expectativas de disponibilidad. Jobs background necesarios. Primer on-call informal.
**Criterio**: La infraestructura extra (Redis, queues) ya se justifica porque los casos de uso lo demandan.

Agregar sobre Tier 1:

- **Redis** (DB0 queues + DB1 cache) — introducir cuando el primer caso de uso lo demande; una vez que pagás por Redis, usalo para ambos
- **BullMQ + `@nestjs/bullmq`** — emails, webhooks, procesos async aparecen naturalmente en este tier
- **`@sentry/nestjs`** — el primer usuario externo que reporta un error irreproducible justifica Sentry
- **Testcontainers** (E2E contra PostgreSQL/Redis real) — cuando el schema se complejiza, los mocks son frágiles
- **Semantic Release** — con equipo > 3, el versionado manual se rompe
- **GitHub Actions** pipeline: `lint → test:cov → audit → build → deploy`

### Email Transaccional [Tier 2]

| Package | Descripción |
|---------|-------------|
| `@nestjs-modules/mailer` | Módulo NestJS para envío de emails con templates |
| `nodemailer` | Transport SMTP — peer dependency de @nestjs-modules/mailer |
| `resend` | SDK de Resend (alternativa: usar SMTP directo) |
| `@react-email/render` | Render de templates React Email a HTML (opcional) |

Ver patrón completo en `backend-patterns.md §24` (sección Email Transaccional).

❌ **No incluir en Tier 2**: OpenTelemetry/Tempo, Prometheus/Grafana, Nginx gzip propio, Opossum (salvo integraciones externas críticas).

---

### 🔴 Tier 3 — SaaS Enterprise / Alta Disponibilidad

**Cuándo**: Equipo 10+ personas. SLA formal (99.9%+). Múltiples servicios o microservicios. Equipo de plataforma/SRE.
**Criterio**: Observabilidad completa, resiliencia ante fallas de dependencias, infraestructura propia controlada.

Agregar sobre Tier 2:

- **OpenTelemetry SDK → OTLP → Grafana Tempo** — distributed tracing es imprescindible con múltiples servicios o queues; en un monolito, Sentry cubre el 80%
- **`@willsoto/nestjs-prometheus` + `/metrics`** — SLOs requieren métricas propias, no solo logs
- **Nginx gzip** — en tiers menores lo absorbe el CDN/proxy del cloud; aquí se controla la infra
- **Opossum circuit breaker** — cuando hay múltiples dependencias externas con SLA distinto al propio
- **AWS Secrets Manager / HashiCorp Vault** — rotación automática, sin secretos en disco
- **Unleash (self-hosted)** — feature flags sin redeploy
- **Kubernetes** — HPA, rolling deploys, liveness/readiness probes, Init Containers para migraciones
- **Pact.io** — contract testing con clientes frontend/mobile
- **Spectral CLI** — linting OpenAPI spec contra OWASP en CI
- **Cursor-based pagination** — cuando las tablas superen 100k registros

---

### Resumen visual

```
BASE         NestJS · Prisma · PG · Validación · Config · Seguridad HTTP
             Docker · Swagger · JWT · Jest unit · Error handling · Health checks
             ESLint · Prettier · Husky · commitlint

TIER 1       + Pino logging
(MVP)        + supertest E2E básico
             ─ Redis · BullMQ · Sentry · OTel · Prometheus

TIER 2       + Redis (queues + cache) · BullMQ
(SaaS)       + Sentry · Testcontainers · Semantic Release · GitHub Actions
             ─ OTel/Tempo · Prometheus · Nginx propio · Opossum

TIER 3       + OpenTelemetry/Tempo · Prometheus/Grafana · Nginx gzip
(Enterprise) + Opossum · Secrets Manager · Unleash · Kubernetes · Pact.io
```

---

## Configuración Base (`main.ts`)

```typescript
// instrumentation.ts — DEBE importarse ANTES que cualquier módulo NestJS
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
const sdk = new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] });
sdk.start();
```

```typescript
// main.ts
import './instrumentation'; // OTel primero

async function bootstrap() {
  // Cargar secretos externos antes de NestJS (AWS Secrets Manager / Vault)
  if (process.env.AWS_SECRETS_MANAGER_ENABLED === 'true') {
    await loadSecretsFromAWS();
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }), // Pino maneja el logging — evita logs duplicados
  );

  // Seguridad — usar @fastify/helmet (no el package 'helmet' de Express)
  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Prefijo global de API (excluye raíz para health checks)
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: process.env.NODE_ENV === 'production',
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
        throw new DomainException('VAL_001', messages.join('; '), HttpStatus.UNPROCESSABLE_ENTITY, {
          fields: errors.map((e) => e.property),
        });
      },
    }),
  );

  // Serialización: @Exclude() automático en respuestas (campos sensibles como password)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Errores globales — HttpAdapterHost requerido para compatibilidad con Fastify
  const { httpAdapterHost } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  // Versioning: /v1/ en el path del controller (no global URI versioning)
  // Permite versiones mixtas por módulo. Ver backend-patterns.md §1.

  // Graceful shutdown
  app.enableShutdownHooks();

  // Swagger (solo fuera de producción)
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Application started on port ${port} [${process.env.NODE_ENV}]`);
}
bootstrap().catch((err: unknown) => {
  new Logger('Bootstrap').error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

---

## `tsconfig.json` base

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "paths": {
      "@core/*": ["src/core/*"],
      "@modules/*": ["src/modules/*"],
      "@common/*": ["src/common/*"]
    }
  }
}
```

> **Nota**: TC39 Stage 3 decorators — **no** usar `experimentalDecorators: true` en proyectos nuevos con NestJS 11 + TS 5.x.

---

## Validación de Variables de Entorno

```typescript
// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    DATABASE_URL: Joi.string().required(),
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.number().default(6379),
    JWT_PUBLIC_KEY: Joi.string().required(),
    CORS_ORIGINS: Joi.string().required(),
    LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    SENTRY_DSN: Joi.string().optional(),
  }),
  validationOptions: { abortEarly: true },
});
```

---

## Patrones Clave

### Autenticación y Autorización

```typescript
// Guards: global por defecto, @Public() para rutas abiertas, @Roles() para RBAC
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
```

JWT RS256 con `@nestjs/jwt` — el backend firma con clave privada y verifica con clave pública. Ver `api-contract.md §6` para el payload y TTL.
RBAC jerárquico: `SUPERADMIN > ADMIN > USER` suficiente para SaaS. ABAC (Casbin) cuando se necesitan permisos por recurso.

---

### DomainException + AllExceptionsFilter

```typescript
// Excepción tipada por dominio
export class DomainException extends HttpException {
  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Filter global — respuesta JSON consistente siempre
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Normaliza DomainException, HttpException y errores inesperados
    // Incluye X-Request-ID del AsyncLocalStorage en body y response header
    // warn para 4xx, error para 5xx
  }
}
```

---

### Request Context (X-Request-ID)

```typescript
// request-context.service.ts
const asyncLocalStorage = new AsyncLocalStorage<{ requestId: string }>();

// Middleware: genera UUID v4 y lo almacena en AsyncLocalStorage
// AllExceptionsFilter y LoggingInterceptor lo leen para correlación
// X-Request-ID se propaga en response headers para correlación client↔logs
```

---

### Redis: separar DBs por uso

```typescript
// BullMQ usa Redis DB 0 (queues) — fuente de verdad: Stack
BullModule.forRoot({ connection: { host, port, db: 0 } });

// Cache usa Redis DB 1 (evita colisiones de keys con queues)
CacheModule.registerAsync({
  useFactory: () => ({
    store: redisStore,
    host,
    port,
    db: 1,
    ttl: 60 * 5,
  }),
});
// IMPORTANTE: mantener esta asignación consistente con backend-patterns.md §19
```

---

### BullMQ: retry con exponential backoff

```typescript
@Processor('notifications')
export class NotificationsProcessor {
  @Process()
  async handle(job: Job) {
    /* ... */
  }
}

// Al encolar
await queue.add('send-email', payload, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500, // retención para análisis post-mortem
});
```

---

## Checklist de Setup

### 🟢 Base — Todo proyecto

- [ ] Node.js 22 LTS + `.nvmrc` + `engines` en `package.json`
- [ ] `nest new` con `@nestjs/platform-fastify`
- [ ] TypeScript strict + ESM `nodenext` + path aliases (`@core/*`, `@modules/*`, `@common/*`)
- [ ] ESLint 9 flat config + `typescript-eslint recommendedTypeChecked` + Prettier 3
- [ ] Husky + `lint-staged` (pre-commit) + `commitlint` (commit-msg) — ver `infra-stack.md §13` para snippets de config por tipo de repo (single repo vs monorepo)
- [ ] `@nestjs/config` + Joi — validación fail-fast de env vars en startup
- [ ] `ValidationPipe` global + `ClassSerializerInterceptor` global
- [ ] `AllExceptionsFilter` global + `DomainException` + X-Request-ID
- [ ] Helmet + CORS whitelist desde env var + `ThrottlerModule` global
- [ ] `@Throttle()` en endpoints sensibles (login, OTP, reset)
- [ ] `@nestjs/swagger` v11 con BearerAuth + versión dinámica desde `package.json`
- [ ] `@nestjs/terminus` en `GET /health` (público, sin auth)
- [ ] Versioning `/v1/` en el path del controller — NO `enableVersioning` global (permite versiones mixtas)
- [ ] `app.setGlobalPrefix('api', { exclude: ['/'] })`
- [ ] `app.enableShutdownHooks()`
- [ ] Prisma 7 + `@prisma/adapter-pg` + migraciones versionadas desde el primer commit
- [ ] Jest 30 unit + `jest-mock-extended`
- [ ] Docker multi-stage (non-root user) + Docker Compose local con PostgreSQL 17

### 🟡 Tier 1 — MVP / Side Project

- [ ] Pino + `pino-http` + AsyncLocalStorage para X-Request-ID en logs
- [ ] `supertest` E2E básico (sin Testcontainers)
- [ ] Auth: `@nestjs/jwt` + tabla de usuarios propia si no se necesita SSO/multi-tenant

### 🟠 Tier 2 — Early SaaS / Producto en crecimiento

- [ ] Redis DB0 (queues) + DB1 (cache) en Docker Compose
- [ ] BullMQ + `@nestjs/bullmq` + exponential backoff + DLQ
- [ ] Bull Board en ruta protegida (`/admin/queues`)
- [ ] `@nestjs/schedule` para cron jobs
- [ ] Guards `@Public()`, `@Roles()`, `@Auth()` en `common/guards/` y `common/decorators/`
- [ ] `@sentry/nestjs` + alertas por umbral de error rate
- [ ] Testcontainers (PostgreSQL + Redis real en E2E)
- [ ] Semantic Release + CHANGELOG automático
- [ ] GitHub Actions: `lint → test:cov → audit → build → deploy`

### 🔴 Tier 3 — Enterprise / Alta disponibilidad

- [ ] OpenTelemetry SDK inicializado ANTES de cualquier import NestJS (`instrumentation.ts`)
- [ ] `auto-instrumentations-node` — HTTP, Prisma, Redis, BullMQ sin código extra
- [ ] `@willsoto/nestjs-prometheus` + `/metrics` endpoint
- [ ] Nginx con gzip habilitado como reverse proxy
- [ ] Opossum circuit breaker en todas las integraciones con APIs externas
- [ ] AWS Secrets Manager / HashiCorp Vault (cargar en `main.ts` antes de `NestFactory.create()`)
- [ ] Unleash (self-hosted) para feature flags sin redeploy
- [ ] Kubernetes: HPA + liveness/readiness probes + Init Container para migraciones
- [ ] Spectral CLI en CI para linting OpenAPI spec contra OWASP
- [ ] Pact.io para contract testing con clientes frontend/mobile
- [ ] Cursor-based pagination cuando las tablas superen 100k registros

---

## Dockerfile Multi-Stage

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:22-alpine AS pruner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=pruner --chown=appuser:appgroup /app/dist ./dist
COPY --from=pruner --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
USER appuser
CMD ["node", "dist/main"]
```

---

## GitHub Actions Pipeline

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:cov # tests obligatorios antes del build
      - run: npm audit --audit-level=high
      - run: npm run build
      - name: Build & push Docker image
        # build y push al registry
```

---

## Anti-Patterns a Evitar

### ❌ 1. Pool DB con conexión única para multi-tenant

Con schema-per-tenant (`SET search_path = tenant_X`), usar una sola conexión "dedicada" por tenant destruye el throughput (~30 req/s máximo).

**Solución con Prisma**: `$executeRawUnsafe` por request dentro del interceptor de tenant — establece `search_path`, opera y la conexión vuelve al pool.

```typescript
// TenantService — ver backend-patterns.md §18
async setSearchPath(tenantId: string): Promise<void> {
  // Validar UUID para prevenir SQL injection ANTES de ejecutar raw SQL
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) throw new Error(`Invalid tenant ID: ${tenantId}`);
  const schema = `tenant_${tenantId.replace(/-/g, '_')}`;
  await this.prisma.$executeRawUnsafe(`SET search_path TO "${schema}", public`);
}
```

---

### ❌ 2. Validar seguridad sin bloquear

```typescript
// ❌ Loguea pero no protege — bug activo, no deuda técnica
if (!hasMfa) {
  this.logger.warn('Operation without MFA', { userId });
  // throw new ForbiddenException('MFA required'); // TODO: activar luego
}

// ✅ Siempre bloquear
if (!hasMfa) {
  throw new ForbiddenException('Multi-Factor Authentication is required');
}
```

**Regla**: Un `throw` comentado en código de seguridad es un bug activo.

---

### ❌ 3. Correr migraciones dentro de `onModuleInit` o al arrancar la app

Con Prisma, ejecutar `prisma migrate deploy` dentro del lifecycle de NestJS genera race conditions en K8s rolling updates — múltiples pods intentan migrar simultáneamente.

```typescript
// ❌ Nunca dentro del bootstrap o onModuleInit
async onModuleInit() {
  await exec('npx prisma migrate deploy'); // race condition en multi-pod
}

// ✅ Step separado antes del deploy (Init Container en K8s o step en CI)
// Ver infra-stack.md para el patrón completo con Init Container
```

---

### ❌ 4. Secrets en variables de entorno planas en producción

Variables de entorno son accesibles por cualquier proceso hijo. En caso de RCE, todos los secretos quedan expuestos sin posibilidad de auditoría ni rotación.

**Solución**: AWS Secrets Manager o HashiCorp Vault, cargados en `main.ts` **antes** de `NestFactory.create()`.

---

### ❌ 5. Swagger UI público en producción

Expone toda la superficie de ataque (endpoints, modelos, auth schemes, error codes).

```typescript
// ✅ Desactivar en producción o proteger con Basic Auth
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
}
```

---

_Actualizar este documento al adoptar nuevas tecnologías o identificar nuevos anti-patterns._

---

## Estándares de Proyecto por Tier

> Esta sección define los valores por defecto que aplica `/flow-build` al usar el playbook.
> No necesitás tomar estas decisiones en cada proyecto — ya están tomadas.

### JWT — Algoritmo y TTL por Defecto

> Fuente de verdad completa: `api-contract.md §6` (access token) y `§7` (refresh token).

| Aspecto | Valor por defecto |
|---------|-------------------|
| Algoritmo | **RS256** — clave privada para firmar, clave pública para verificar |
| Access token TTL | **15 minutos** — en body JSON de la respuesta |
| Refresh token TTL | **7 días** — en cookie httpOnly + SameSite=Strict |
| Variables de entorno | `JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY` (no `JWT_SECRET` — eso es HS256) |
| Rotación de refresh | En cada uso — el token viejo se invalida al emitir uno nuevo |

```typescript
// Ejemplo de configuración RS256 en NestJS
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    privateKey: config.get('JWT_PRIVATE_KEY'),
    publicKey: config.get('JWT_PUBLIC_KEY'),
    signOptions: { algorithm: 'RS256', expiresIn: '15m' },
  }),
}),
```

> ⚠️ Nunca usar `JWT_SECRET` (HS256 simétrico) en producción — si el secret se filtra, cualquiera puede firmar tokens válidos. RS256 separa la capacidad de firmar (privada, solo el backend) de la capacidad de verificar (pública, puede compartirse).

---

### Política de Contraseñas

| Tier | Mínimo | Complejidad | Hashing | Rounds |
|------|--------|-------------|---------|--------|
| Base | 8 chars | 1 mayúscula + 1 número | bcrypt | 10 |
| Tier 2 (Producto) | 10 chars | mayúscula + número + especial | argon2 (recomendado) / bcrypt 12 | 12 |
| Tier 3 (Enterprise) | 12 chars | mayúscula + número + especial, sin reutilizar últimas 5 | argon2 | — |

> Nunca fijar un máximo de caracteres. Nunca truncar passwords antes de hashear.

---

### Rate Limiting por Tipo de Endpoint

Configuración base con `@nestjs/throttler`. Ajustar según tráfico real.

| Endpoint | Límite | Ventana | Notas |
|----------|--------|---------|-------|
| Auth (login, register, reset) | 5 req | 15 min | Protección anti-brute force |
| Endpoints públicos (GET sin auth) | 100 req | 1 min | Ajustar si hay bots legítimos |
| Endpoints autenticados (write) | 30 req | 1 min | POST/PATCH/DELETE |
| Endpoints admin | 200 req | 1 min | Usuarios internos, más permisivo |
| Webhooks entrantes | 50 req | 1 min | Por IP de origen |

> Multi-pod: usar `ThrottlerStorageRedisService` (ver nota en §Base). Sin Redis, el límite es por instancia.

---

### CORS — Política por Defecto

```typescript
// main.ts
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',') ?? [],  // Lista blanca explícita
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,   // Necesario para cookies httpOnly (refresh token)
  maxAge: 86400,       // 24h — cachea preflight en el browser
});
```

> Nunca usar `origin: '*'` en producción con `credentials: true` — el browser lo rechaza y es un riesgo de seguridad.

---

### Graceful Shutdown

Estándar en todos los proyectos desde Base. Ya incluido en el scaffold:

```typescript
// main.ts
app.enableShutdownHooks(); // Maneja SIGTERM/SIGINT

// Sequencia automática de NestJS:
// 1. onApplicationShutdown() en cada módulo
// 2. Cierre de conexiones DB y Redis
// 3. Exit del proceso

// Timeout recomendado en K8s:
// terminationGracePeriodSeconds: 30
```

> En K8s, configurar `preStop: sleep 5` para dar tiempo al load balancer de drenar conexiones antes de SIGTERM.

---

### Seguridad HTTP — Headers Estándar

Helmet con configuración mínima segura (ya incluido en Base):

```typescript
// main.ts — adaptador Fastify
await app.register(helmet, {
  contentSecurityPolicy: false,  // Desactivar si el frontend no está en el mismo origen
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
});
```

> Swagger UI desactivado en producción siempre (`NODE_ENV !== 'production'`).

---

### Encriptación en Tránsito y en Reposo

| Aspecto | Estándar |
|---------|----------|
| TLS en tránsito | TLS 1.2+ obligatorio. Nunca HTTP en producción. cert-manager + Let's Encrypt en K8s. |
| Campos sensibles en DB | Encriptar a nivel aplicación con AES-256-GCM: tokens de terceros, secrets de integración, datos PII críticos. |
| Variables de entorno | Nunca commitear `.env`. Usar Secrets Manager en producción (AWS SSM / K8s Secrets / Vault). |
| Tokens en respuestas | Access token en body JSON. Refresh token en cookie httpOnly + SameSite=Strict. |

> La encriptación de campos específicos del dominio (ej: DNI, número de tarjeta) es decisión del proyecto, no del playbook.

---

### Referencia rápida de estándares por documento

| Decisión | Documento fuente |
|----------|-----------------|
| Stack completo (framework, ORM, libs) | `backend-stack.md` tiers Base/Tier1/Tier2/Tier3 |
| JWT algoritmo, TTL, variables | `backend-stack.md §JWT` + `api-contract.md §6-7` |
| Contraseñas (hashing, complejidad) | `backend-stack.md §Política de Contraseñas` |
| Rate limiting por endpoint | `backend-stack.md §Rate Limiting` |
| CORS, headers, Helmet | `backend-stack.md §CORS` + `§Seguridad HTTP` |
| Patrones de código (repos, guards, etc.) | `backend-patterns.md` |
| Contrato API (envelope, errores, paginación) | `api-contract.md` |
| Testing (cobertura targets, frameworks) | `testing-strategy.md §13-14` |
| CI/CD, Docker, K8s, environments | `infra-stack.md §16` |
