# Testing Strategy

> Última actualización: 2026-03-28

## Tabla de Contenidos
1. Filosofía de Testing
2. Pirámide de Testing
3. Backend — Jest
4. Frontend — Vitest + RTL
5. E2E — Playwright
6. Contract Testing
7. Estrategia por capa
8. Coverage Targets
9. CI/CD Integration
10. Factories y Fixtures
11. Monorepo vs Repos Separados
12. Anti-patterns

---

## §1 — Filosofía de Testing

**Testeamos comportamiento, no implementación.**

El objetivo no es tener cobertura del 100% — es tener confianza para desplegar. Un test que rompe cuando refactoreás el nombre de una variable interna es un test mal escrito. Un test que rompe cuando cambia el comportamiento observable es un test útil.

Principios:
- Tests deben ser **deterministas** — mismo input, mismo output, siempre
- Tests deben ser **independientes** — ningún test depende del orden de ejecución
- Tests deben ser **rápidos** — unit tests < 100ms, integration < 1s
- Tests deben ser **legibles** — otro dev entiende qué falla sin leer el código fuente

---

## §2 — Pirámide de Testing

```
         /\
        /E2E\          ~10% — Playwright — flujos críticos de usuario
       /------\
      / Integr. \      ~30% — Jest/Vitest — módulos integrados, APIs, DB
     /------------\
    /   Unit Tests  \  ~60% — Jest/Vitest — servicios, utils, hooks, transformaciones
   /----------------\
```

**Regla de oro**: Si podés testear algo como unit test, no uses integration. Si podés testear como integration, no uses E2E.

---

## §3 — Backend: Jest (NestJS)

### Setup

```typescript
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/core/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
  },
};

export default config;
```

### Unit Tests — Services

```typescript
// items.service.spec.ts
describe('ItemsService', () => {
  let service: ItemsService;
  let repository: jest.Mocked<ItemsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ItemsService,
        {
          provide: ItemsRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    repository = module.get(ItemsRepository);
  });

  it('should return paginated items', async () => {
    const mockItems = [createItemFactory(), createItemFactory()];
    repository.findAll.mockResolvedValue({ items: mockItems, total: 2 });

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(2);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPreviousPage).toBe(false);
  });
});
```

### Integration Tests — Repositories (con base de datos real)

```typescript
// items.repository.spec.ts — usa Testcontainers o base de datos de test
describe('ItemsRepository (integration)', () => {
  let repository: ItemsRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Usar la DB de test definida en .env.test
    const module = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [ItemsRepository],
    }).compile();

    repository = module.get<ItemsRepository>(ItemsRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(async () => {
    // Limpiar datos entre tests
    await prisma.item.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create and find an item', async () => {
    const created = await repository.create(createItemFactory());
    const found = await repository.findById(created.id);
    expect(found).toMatchObject({ id: created.id });
  });
});
```

### E2E Tests — Controllers (con Supertest)

```typescript
// items.controller.e2e.spec.ts
describe('ItemsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /items returns 200 with envelope', async () => {
    return request(app.getHttpServer())
      .get('/v1/items')
      .set('Authorization', `Bearer ${getTestToken()}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.meta).toHaveProperty('total');
        expect(res.body.error).toBeNull();
      });
  });
});
```

---

## §4 — Frontend: Vitest + React Testing Library

### Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'src/test'],
    },
  },
});
```

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import { server } from './msw/node';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Unit Tests — Custom Hooks

```typescript
// useItemFilters.spec.ts
import { renderHook, act } from '@testing-library/react';
import { useItemFilters } from '@/hooks/useItemFilters';

describe('useItemFilters', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useItemFilters());
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.limit).toBe(10);
  });

  it('should reset page to 1 when filter changes', () => {
    const { result } = renderHook(() => useItemFilters());
    act(() => {
      result.current.setFilter('search', 'test');
    });
    expect(result.current.filters.page).toBe(1);
  });
});
```

### Integration Tests — Componentes con MSW

```typescript
// ItemList.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/node';
import { ItemList } from './ItemList';
import { createWrapper } from '@/test/utils';

describe('ItemList', () => {
  it('should render items from API', async () => {
    server.use(
      http.get('/api/v1/items', () =>
        HttpResponse.json({
          data: [{ id: '1', name: 'Test Item' }],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
          error: null,
        }),
      ),
    );

    render(<ItemList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });
  });
});
```

### MSW Setup

```typescript
// src/test/msw/node.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

```typescript
// src/test/msw/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/v1/items', () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      error: null,
    }),
  ),
];
```

---

## §5 — E2E: Playwright

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },
});
```

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="submit"]');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'wrong@example.com');
    await page.fill('[data-testid="password"]', 'wrongpassword');
    await page.click('[data-testid="submit"]');
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });
});
```

> **Regla Playwright**: Usá `data-testid` para selectores en E2E — no selecciones por clases CSS ni texto visible (cambian). Solo para flujos críticos: login, checkout, creación de recursos principales.

---

## §6 — Contract Testing

Para garantizar que frontend y backend cumplen el mismo contrato definido en `api-contract.md`:

### Estrategia: Shared Types + Integration Tests

La forma más pragmática (sin Pact) es:

1. **Tipos compartidos**: Si es monorepo, crear un package `@repo/types` con los tipos de `ApiEnvelope`, `PaginatedMeta`, etc.
2. **Integration tests de contrato**: En el backend E2E, verificar que el response shape matchea exactamente el contrato.
3. **MSW handlers tipados**: En el frontend, los handlers de MSW usan los mismos tipos — si el contrato cambia, los handlers y los tests del frontend fallan.

```typescript
// Backend — verifica el contrato en E2E
it('GET /items matches API contract', async () => {
  const res = await request(app.getHttpServer())
    .get('/v1/items')
    .expect(200);

  // Verifica estructura del envelope
  expect(res.body).toMatchObject({
    data: expect.any(Array),
    meta: expect.objectContaining({
      total: expect.any(Number),
      page: expect.any(Number),
      limit: expect.any(Number),
      totalPages: expect.any(Number),
      hasNextPage: expect.any(Boolean),
      hasPreviousPage: expect.any(Boolean),
    }),
    error: null,
  });
});
```

---

## §7 — Estrategia por capa

| Capa | Tipo de test | Tool | Qué testear |
|------|-------------|------|-------------|
| Domain / Entities | Unit | Jest | Validaciones, transformaciones, reglas de negocio |
| Services | Unit | Jest | Lógica de negocio con mocks de repositories |
| Repositories | Integration | Jest + DB real | Queries, transacciones, índices |
| Controllers | E2E | Jest + Supertest | Request/response, auth, validación |
| Custom Hooks | Unit | Vitest + renderHook | Lógica del hook aislada |
| Componentes | Integration | Vitest + RTL + MSW | Comportamiento UI con API mockeada |
| Flujos completos | E2E | Playwright | Rutas críticas de usuario |

---

## §8 — Coverage Targets

| Capa | Target mínimo | Target ideal |
|------|--------------|--------------|
| Services (backend) | 80% | 90% |
| Repositories (backend) | 70% | 80% |
| Custom Hooks (frontend) | 80% | 90% |
| Componentes críticos | 70% | 80% |
| Utils / helpers | 90% | 100% |

> **No perseguir el 100%**: Los getters simples, los módulos de configuración y los archivos de barrel (`index.ts`) no necesitan tests. Configurá el coverage para excluirlos.

---

## §9 — CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on:
  pull_request:
    branches: [main, develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
      - run: npm run test:cov
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run test:cov

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

---

## §10 — Factories y Fixtures

### Backend — Object Factories

```typescript
// src/test/factories/item.factory.ts
import { Item } from '@/modules/items/domain/item.entity';

export function createItemFactory(overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    name: 'Test Item',
    description: 'Test description',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

### Frontend — Test Utilities

```typescript
// src/test/utils.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

export function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}
```

---

## §11 — Monorepo vs Repos Separados

### Monorepo (pnpm workspaces + Turborepo)

```
apps/
  backend/         ← NestJS
  frontend/        ← Next.js
packages/
  types/           ← Tipos compartidos (ApiEnvelope, etc.)
  test-utils/      ← Factories, helpers compartidos
```

**Ventajas:**
- Tipos compartidos entre backend y frontend — un cambio de contrato rompe los dos en el mismo PR
- Un solo CI pipeline con cache de Turborepo
- `pnpm run test --filter=*` corre todos los tests

```yaml
# turbo.json
{
  "pipeline": {
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

### Repos Separados

**Estrategia de contrato**: Los tipos de `api-contract.md` se duplican en ambos repos. Para detectar drift:
- El backend tiene tests E2E que verifican el shape del response
- El frontend tiene MSW handlers con los mismos tipos
- Si el backend cambia el contrato, el E2E del backend falla primero → el dev actualiza ambos repos

> **Riesgo en repos separados**: El drift de contrato puede no detectarse hasta runtime si los tests E2E del backend no verifican el shape completo. Siempre testear el envelope completo, no solo el status code.

---

## §12 — Anti-patterns

**No testear implementación interna**
```typescript
// MAL — testea el nombre del método privado
expect(service['_buildQuery']).toHaveBeenCalled();

// BIEN — testea el resultado observable
expect(result.data).toHaveLength(3);
```

**No usar `any` en mocks**
```typescript
// MAL
const mockRepo = {} as any;

// BIEN — mock tipado
const mockRepo: jest.Mocked<ItemsRepository> = { findAll: jest.fn(), ... };
```

**No compartir estado entre tests**
```typescript
// MAL — estado compartido
let items = [];
beforeEach(() => items.push(createItemFactory()));

// BIEN — estado fresco por test
it('test', () => {
  const items = [createItemFactory()];
});
```

**No hacer assertions sin await en async tests**
```typescript
// MAL
it('test', () => {
  service.findAll(); // Promise ignorada
  expect(result).toBeDefined(); // Puede ser undefined todavía
});

// BIEN
it('test', async () => {
  const result = await service.findAll();
  expect(result).toBeDefined();
});
```

**No testear todo con E2E**
E2E es lento y frágil. Si podés testear el comportamiento con RTL + MSW, es mejor. Playwright solo para flujos críticos que requieren un browser real.

---

*Estrategia diseñada para proyectos full-stack NestJS + React. Para dudas sobre patrones específicos, ver `backend-patterns.md §20` (backend) y `frontend-patterns.md §15` (frontend).*

---

## §13 — Coverage Targets por Tier

> Valores por defecto que usa `/flow-build` al modo playbook. El porcentaje es mínimo exigido en CI — no un techo.

| Tier | Coverage mínimo | Qué se mide | Gate en CI |
|------|----------------|-------------|-----------|
| Base | 30% | Líneas en `src/` | Warning, no bloquea |
| Tier 1 (MVP / Side Project) | 50% | Líneas en `src/` | Bloquea merge si baja del umbral |
| Tier 2 (Producto en Crecimiento) | 70% | Líneas + branches en `src/` | Bloquea merge |
| Tier 3 (Enterprise) | 85% | Líneas + branches + funciones | Bloquea merge + reporte por PR |

**Distribución esperada por tier:**

| Tier | Unit | Integration | E2E |
|------|------|-------------|-----|
| Base | — | Smoke tests en paths críticos | — |
| Tier 1 (MVP / Side Project) | 60% del total | 30% del total | 10% flujos críticos |
| Tier 2 (Producto en Crecimiento) | 60% del total | 30% del total | 10% flujos críticos |
| Tier 3 (Enterprise) | 60% del total | 25% del total | 15% + contract tests |

> **Regla práctica**: Para MVP, preferir 3-5 tests de integración en el happy path de los flujos críticos (login, operación principal, flujo de pago si aplica) antes que 50 unit tests de utilidades.

---

## §14 — Configuración de Coverage en Jest/Vitest

```typescript
// jest.config.ts — Backend NestJS
const config: Config = {
  // ...setup base (ver §3)
  coverageThreshold: {
    global: {
      lines: 70,      // Ajustar según tier del proyecto
      branches: 70,
      functions: 70,
      statements: 70,
    },
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '\\.module\\.ts$',    // Módulos NestJS — solo wiring
    '\\.dto\\.ts$',       // DTOs — cubiertos por integration tests
    '\\.entity\\.ts$',    // Entidades Prisma — no testear el ORM
    'main\\.ts$',         // Bootstrap
  ],
};
```

```typescript
// vitest.config.ts — Frontend React
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 70,       // Ajustar según tier del proyecto
        branches: 70,
      },
      exclude: [
        'src/main.tsx',
        'src/**/*.stories.*',
        'src/**/*.d.ts',
        'src/mocks/**',
      ],
    },
  },
});
```
