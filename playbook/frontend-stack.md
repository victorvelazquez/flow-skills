# React Admin Stack — Referencia de Decisiones Técnicas

> Referencia para proyectos React de tipo admin/dashboard.
> Basado en análisis de State of JS 2024, npm trends, datos de GitHub stars verificados, y TkDodo Design Systems series (2025-2026).
> Ver `api-contract.md` para el contrato de integración con el backend (envelopes, errores, auth flow).
> Última actualización: 2026-03-19

---

## Indice

1. [Stack recomendado — tabla rápida](#1-stack-recomendado--tabla-rápida)
2. [Framework UI](#2-framework-ui)
3. [Build Tool](#3-build-tool)
4. [Lenguaje](#4-lenguaje)
5. [UI Component Library](#5-ui-component-library)
6. [Iconos](#6-iconos)
7. [Charts y Visualización](#7-charts-y-visualización)
8. [Tablas de Datos](#8-tablas-de-datos)
9. [Estado Global (Client State)](#9-estado-global-client-state)
10. [Server State / Data Fetching](#10-server-state--data-fetching)
11. [HTTP Client](#11-http-client)
12. [Formularios](#12-formularios)
13. [Validación / Schema](#13-validación--schema)
14. [Routing](#14-routing)
15. [Testing Unitario / Integración](#15-testing-unitario--integración)
16. [Testing Library (componentes)](#16-testing-library-componentes)
17. [API Mocking en Tests](#17-api-mocking-en-tests)
18. [E2E Testing](#18-e2e-testing)
19. [Linter](#19-linter)
20. [Formatter](#20-formatter)
21. [Git Hooks](#21-git-hooks)
22. [Notificaciones / Toast](#22-notificaciones--toast)
23. [Fechas](#23-fechas)
24. [Integración con el Backend NestJS](#24-integración-con-el-backend-nestjs)
25. [Gaps recomendados — agregar en proyectos nuevos](#25-gaps-recomendados--agregar-en-proyectos-nuevos)

---

## 1. Stack recomendado — tabla rápida

| Categoría                | Recomendado            | Versión   | Alternativa válida                |
| ------------------------ | ---------------------- | --------- | --------------------------------- |
| Framework                | React 19               | 19        | —                                 |
| Build                    | Vite                   | —         | —                                 |
| Lenguaje                 | TypeScript strict      | 5+        | —                                 |
| UI Library               | shadcn/ui + Radix UI   | latest    | —                                 |
| Tablas de datos          | TanStack Table v8      | v8        | —                                 |
| Client State             | Zustand                | v5        | Redux Toolkit (enterprise legacy) |
| Server State             | TanStack Query v5      | v5        | SWR (proyectos simples)           |
| HTTP Client              | Axios                  | —         | fetch nativo (sin auth compleja)  |
| Forms                    | react-hook-form v7     | v7        | TanStack Form (monitorear)        |
| Validación               | Zod                    | v3        | —                                 |
| Routing                  | React Router v6        | —         | TanStack Router (monitorear)      |
| Test runner              | Vitest                 | v2        | —                                 |
| Test components          | @testing-library/react | —         | —                                 |
| API Mocking              | MSW v2                 | —         | —                                 |
| E2E                      | Playwright             | v1.4x     | —                                 |
| Linter                   | ESLint v9 flat config  | —         | Biome (monitorear)                |
| Formatter                | Prettier               | —         | —                                 |
| Git Hooks                | Husky + lint-staged    | —         | —                                 |
| Toasts                   | sonner                 | —         | react-hot-toast                   |
| Fechas                   | date-fns               | —         | dayjs                             |
| **GAP** Error monitoring | @sentry/react          | —         | —                                 |
| **GAP** Error boundaries | react-error-boundary   | —         | —                                 |
| **GAP** Package manager  | pnpm                   | —         | —                                 |
| **GAP** Commits          | commitlint             | —         | —                                 |
| **GAP** Env vars         | @t3-oss/env-core       | —         | Zod manual                        |

---

## 2. Framework UI

| #   | Herramienta  | Adopción / Notas                                               |
| --- | ------------ | -------------------------------------------------------------- |
| 1   | **React** ⭐ | 81% uso State of JS 2024. Ecosistema admin más grande.         |
| 2   | Vue.js       | 51% uso, 87% retention. Excelente, pero menos librerías admin. |
| 3   | Angular      | 50% uso, 54% retention. Enterprise pero opiniones divididas.   |

**Recomendación: React**
Ecosistema de librerías admin más grande. La mayoría de las librerías de esta referencia son React-first. Mayor disponibilidad de talento en el mercado.

---

## 3. Build Tool

| #   | Herramienta | Adopción / Notas                                                  |
| --- | ----------- | ----------------------------------------------------------------- |
| 1   | **Vite** ⭐ | Tier S State of JS 2024 (98% retention). #1 más amado. 78% uso.   |
| 2   | Webpack     | 85% uso pero Tier C (35% retention). Legacy dominante.            |
| 3   | esbuild     | Tier S (91% retention) pero primitivo — Vite lo usa internamente. |

**Recomendación: Vite**
El estándar indiscutido para proyectos nuevos. Webpack pierde aceptación cada año. La combinación Vite + esbuild internamente es la más rápida disponible.

**Cuándo considerar alternativa:** nunca para proyectos nuevos. Solo Webpack si heredás un proyecto existente.

---

## 4. Lenguaje

| #   | Herramienta              | Adopción / Notas                                                      |
| --- | ------------------------ | --------------------------------------------------------------------- |
| 1   | **TypeScript strict** ⭐ | Estándar de industria. Reduce bugs 15-38% según estudios.             |
| 2   | TypeScript loose         | Misma herramienta sin strictness. No aporta suficiente valor.         |
| 3   | JavaScript               | Sin tipos. Inviable en proyectos medianos/grandes con múltiples devs. |

**Recomendación: TypeScript con `strict: true`**

Config mínima recomendada en `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

---

## 5. UI Component Library

> **Decisión confirmada 2026-03-19** — shadcn/ui es la librería de componentes recomendada para proyectos nuevos. Análisis basado en datos verificados: GitHub stars, npm trends, adopción del ecosistema, y TkDodo Design Systems series (dic 2025 – ene 2026).

### La distinción fundamental: librería vs código propio

La diferencia clave entre librerías npm tradicionales y shadcn/ui es de arquitectura:

```
npm package (modelo tradicional):
        npm install <ui-library>
        → código vive en node_modules
        → customizar = override de estilos (battle contra la librería)
        → atado a sus breaking changes y roadmap

shadcn: npx shadcn add button
        → código vive en src/components/ui/button.tsx (TU proyecto)
        → customizar = editar directamente el archivo
        → actualizás cuando querés, nadie te fuerza
        → los LLMs leen y modifican el código directamente (AI-ready)
```

Esto no es una preferencia estética — es una diferencia de arquitectura.

### Datos verificados (2026-03-19)

| Métrica              | shadcn/ui (`shadcn` CLI)                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| GitHub stars         | **110.049 ⭐** (2 años — la curva de adopción más rápida del ecosistema React) |
| Versión actual       | CLI v4.0.8                                                                     |
| Última actualización | hace 5 días                                                                    |
| Modelo               | CLI que copia código al proyecto                                               |
| Base técnica         | Radix UI (headless) + Tailwind + CVA                                           |
| Usuarios notables    | OpenAI, Sonos, Adobe (en shadcn/ui docs)                                       |

### Comparativa por caso de uso

| Caso de uso                  | Ganador                        | Razón                                                  |
| ---------------------------- | ------------------------------ | ------------------------------------------------------ |
| Diseño custom / brand propio | **shadcn**                     | Código propio = control total. Sin override wars.      |
| AI-assisted development      | **shadcn**                     | Código en el repo — LLMs lo leen, entienden y generan  |
| Long-term maintainability    | **shadcn**                     | Sin dependencia externa que puede cambiar su API       |
| Design system propio         | **shadcn**                     | Es exactamente el caso de uso para el que fue diseñado |
| Accesibilidad out-of-the-box | **shadcn**                     | Via Radix UI (ARIA nativo)                             |
| Bundle size                  | **shadcn**                     | Solo traés lo que agregás; Tailwind purga lo no usado  |
| Tablas de datos              | **TanStack Table v8**          | Headless, composable, zero opinión de estilos          |
| DatePickers                  | **shadcn Calendar + date-fns** | Control total sobre el UI, sin dependencia externa     |

### Señales del ecosistema (verificadas)

**TkDodo** (maintainer de TanStack Query, ahora en Design Engineering de Sentry) publicó sus principios de design systems en dic 2025:

- _"Headless is good if possible"_ → shadcn está construido sobre Radix UI (headless)
- _"Design tokens first, components second"_ → Tailwind design tokens
- _"Build for the future of React"_ → shadcn alineado con React 19
- Señala componentes de bajo nivel tipo `<Tooltip>` como anti-pattern en librerías npm tradicionales (ver "Tooltip Components Should Not Exist")

### Recomendación 2026

**shadcn/ui es la elección para proyectos nuevos. Sin excepciones.**

Los casos de uso de un panel admin (CRUDs, tablas paginadas, formularios, dashboards) están cubiertos completamente por shadcn/ui + TanStack Table v8 + shadcn Calendar + date-fns. No hay necesidad de DataGrid enterprise ni de DatePickers de terceros.

```
src/components/ui/          ← componentes shadcn (Button, Input, Dialog, etc.)
src/components/data-table/  ← tablas con TanStack Table v8 + shadcn Table primitives
```

**Usar shadcn/ui:**

- Siempre en proyectos nuevos
- AI-assisted development efectivo — los LLMs leen el código directamente en el repo
- Long-term maintainability — sin dependencia externa que puede romper la API
- Control total sobre el diseño: sin override wars, sin ThemeProvider, sin CSS-in-JS

### Setup de shadcn/ui

```bash
# Inicializar en proyecto Vite + React
npx shadcn@latest init

# Agregar componentes (se copian a src/components/ui/)
npx shadcn@latest add button input dialog select table card badge
```

```typescript
// components.json — generado por shadcn init
{
  "style": "new-york",   // "default" o "new-york" — diferencia visual sutil
  "rsc": false,          // false para Vite (true solo para Next.js)
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

```typescript
// src/lib/utils.ts — generado automáticamente
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// cn() — merge de clases Tailwind sin conflictos
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Uso:
// <Button className={cn('w-full', isLoading && 'opacity-50')} />
```

> 📌 **Tailwind v4 (2025)**: Cambios breaking significativos:
> - Nuevo motor de parsing (Oxide, en Rust) — hasta 5x más rápido
> - `tailwind.config.js` reemplazado por `@theme` en el CSS principal
> - Detección automática de clases sin necesidad de configurar `content`
> - Compatibilidad con shadcn/ui: usar `shadcn@canary` para soporte de v4
>
> ```css
> /* Antes (v3): tailwind.config.js */
> /* Ahora (v4): globals.css */
> @import "tailwindcss";
> @theme {
>   --color-primary: oklch(0.7 0.15 200);
> }
> ```
>
> Para proyectos nuevos en 2026, Tailwind v4 es la elección. Para proyectos existentes en v3, la migración tiene fricción con shadcn/ui — esperar a que la integración se estabilice.

---

## 6. Iconos

### Decisión: Lucide React

| Librería | Stars | Bundle | Tree-shakeable | Usado por |
|----------|-------|--------|----------------|-----------|
| **Lucide React** | 11k+ | ~1KB/icon | ✅ | shadcn/ui |
| Heroicons | 21k+ | ~1KB/icon | ✅ | Tailwind team |
| Phosphor Icons | 4k+ | ~1KB/icon | ✅ | Independiente |
| React Icons | 11k+ | Variable | ⚠️ Parcial | General |

**Decisión: Lucide React**

shadcn/ui ya lo usa internamente — usar la misma librería evita tener dos sets de iconos en el bundle. Tree-shakeable por defecto.

```typescript
import { Search, Plus, Trash2, ChevronDown } from 'lucide-react';

// Uso con tamaño y color custom
<Search className="h-4 w-4 text-muted-foreground" />
```

> ⚠️ No importar desde `lucide-react` de forma masiva — siempre importar solo los iconos que se usan para aprovechar el tree-shaking.

---

## 7. Charts y Visualización

### Decisión: Recharts

| Librería | Stars | Tamaño | React 19 | Composable | Mejor para |
|----------|-------|--------|----------|------------|------------|
| **Recharts** | 24k+ | ~500KB | ✅ | ✅ | Dashboards, composición |
| Chart.js + react-chartjs-2 | 64k+ | ~200KB | ✅ | ❌ | Simplicidad, canvas |
| Visx (Airbnb) | 18k+ | Modular | ✅ | ✅ | Control total, D3 |
| Tremor | 15k+ | ~300KB | ⚠️ | ✅ | Admin apps con shadcn |

**Decisión: Recharts**

Composable, basado en SVG, excelente integración con React. Curva de aprendizaje baja para el tipo de dashboards admin. `shadcn/ui` tiene componentes de charts basados en Recharts en su documentación oficial.

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function RevenueChart({ data }: { data: ChartData[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

> 📌 shadcn/ui tiene componentes `<AreaChart>`, `<BarChart>`, etc. pre-estilizados con Recharts como base. Revisá su documentación antes de crear charts desde cero.

---

## 8. Tablas de Datos

### Decisión: TanStack Table v8

Headless table library — no trae UI, solo lógica. Se integra perfecto con shadcn/ui para el rendering.

Features clave para admin apps:
- Sorting, filtering, pagination del lado del cliente
- Virtualización para datasets grandes
- Column visibility toggle
- Row selection con checkboxes

```typescript
// Uso básico con shadcn/ui Table
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';

const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
});
```

> 📌 shadcn/ui tiene un componente `DataTable` pre-construido con TanStack Table. Usalo como base.

---

## 9. Estado Global (Client State)

| #   | Herramienta    | Adopción / Notas                                                               |
| --- | -------------- | ------------------------------------------------------------------------------ |
| 1   | **Zustand** ⭐ | 57k stars, **4 issues abiertos** (!). Actualizado hace días. Zero boilerplate. |
| 2   | Jotai          | 21k stars. Atómico, mismo ecosistema (pmndrs). Más nicho.                      |
| 3   | Redux Toolkit  | 61k stars. Estándar enterprise pero verboso.                                   |

**Recomendación: Zustand**
El ratio 57k stars / 4 issues es excepcional. Zero boilerplate, zero providers. Funciona fuera de React (ideal para interceptors de Axios con `useStore.getState()`).

> 📌 **Zustand v5 (2024)**: Cambios relevantes al migrar desde v4:
> - `useShallow` ahora importa desde `zustand/react/shallow` (antes `zustand/shallow`)
> - Mejor inferencia de tipos en TypeScript strict
> - Fix de bugs con StrictMode (doble render)
> - La API de `create` y los middlewares (`immer`, `persist`, `devtools`) son compatibles sin cambios

**Regla de oro:** si el estado tiene menos de 5 slices, Zustand. Si el equipo ya conoce Redux, RTK.

**Patron de stores:**

```
store/
├── auth.store.ts     # En memoria, no persistido
└── ui.store.ts       # Persistido con zustand/middleware persist
```

---

## 10. Server State / Data Fetching

| #   | Herramienta              | Adopción / Notas                                                      |
| --- | ------------------------ | --------------------------------------------------------------------- |
| 1   | **TanStack Query v5** ⭐ | 48k stars. Cache, stale-while-revalidate, mutations, devtools.        |
| 2   | SWR                      | 32k stars, de Vercel. Más liviano pero menos features para mutations. |
| 3   | Apollo Client            | 19k stars. Solo si el backend usa GraphQL.                            |

**Recomendación: TanStack Query v5**
Elimina el 90% del `useEffect + useState` para fetching. TanStack Query supera a SWR en downloads y sigue creciendo.

**Config recomendada:**

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});
```

**Patron de hooks:**

```
features/<name>/hooks/
├── useGetUsers.ts      # useQuery wrapper
└── useCreateUser.ts    # useMutation wrapper
```

Los componentes nunca llaman TanStack Query directamente.

---

## 11. HTTP Client

| #   | Herramienta  | Adopción / Notas                                                    |
| --- | ------------ | ------------------------------------------------------------------- |
| 1   | **Axios** ⭐ | 108k stars. Interceptors nativos, 12 años de estabilidad.           |
| 2   | ky           | 16k stars. fetch-wrapper moderno. Interceptors más limitados.       |
| 3   | fetch nativo | Sin dependencias. Sin interceptors, más verboso para auth compleja. |

**Recomendación: Axios**
Para apps admin con auth JWT + refresh token, Axios es insustituible. Su sistema de interceptors para manejar retry de 401 no tiene equivalente tan maduro en fetch o ky.

**Cuándo usar fetch nativo:** proyectos sin auth compleja, o si se usa TanStack Query con su propio fetching simple.

**Patrón de instancia única:**

```ts
// src/lib/api-client.ts
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30_000,
  withCredentials: true, // si usás cookies HttpOnly
});
// + request interceptor (inject Bearer token)
// + response interceptor (401 refresh + error normalization)
```

---

## 12. Formularios

| #   | Herramienta               | Adopción / Notas                                                             |
| --- | ------------------------- | ---------------------------------------------------------------------------- |
| 1   | **react-hook-form v7** ⭐ | 44k stars, 125 issues. Uncontrolled por defecto — mejor performance.         |
| 2   | Formik                    | 34k stars, 836 issues. Prácticamente abandonado (último release hace meses). |
| 3   | TanStack Form             | Nuevo, del mismo autor de TanStack Query. Prometedor pero joven.             |

**Recomendación: react-hook-form v7**
Formik está en declive claro. RHF es el estándar actual por amplia diferencia.

**Cuándo monitorear TanStack Form:** cuando madure lo suficiente — 2025-2026.

---

## 13. Validación / Schema

| #   | Herramienta | Adopción / Notas                                            |
| --- | ----------- | ----------------------------------------------------------- |
| 1   | **Zod** ⭐  | 42k stars, 289 issues. TypeScript-first, inferencia nativa. |
| 2   | Yup         | 23k stars. Precursor, TypeScript support menos ergonómico.  |
| 3   | Valibot     | 8k stars. Bundle size mínimo, ecosistema pequeño.           |

**Recomendación: Zod**
El patrón `z.infer<typeof schema>` es uno de los más poderosos en TypeScript — single source of truth para tipos + validación.

**Patrón recomendado:**

```ts
// features/<name>/schemas/createUser.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;
// Este tipo se usa como genérico en useForm<CreateUserFormData>
```

> 📌 **Zod v4 (2025)**: ~3x más rápido en parsing. Cambios de API relevantes:
> - `z.record(keySchema, valueSchema)` ahora requiere dos argumentos explícitos
> - Nueva `z.interface()` para tipos con métodos
> - `z.email()`, `z.url()` etc. ahora son string refinements directos
> - Migración desde v3: mayormente compatible, revisar `z.record()` y string validations

**Cuándo usar Valibot:** si el bundle size es crítico (apps públicas). En admin apps no aplica.

---

## 14. Routing

| #   | Herramienta            | Adopción / Notas                                                |
| --- | ---------------------- | --------------------------------------------------------------- |
| 1   | **React Router v6** ⭐ | Estándar absoluto para SPAs React.                              |
| 2   | TanStack Router        | Type-safe routing nativo. Ganando tracción rápido en 2024-2025. |
| 3   | Wouter                 | Minimalista — 1.5kb. Sin features avanzadas.                    |

**Recomendación: React Router v6**
Estándar indiscutido hoy. Con future flags `v7_startTransition` habilitados para preparar migración a v7.

> 📌 **TanStack Router (2026): production-ready**
> TanStack Router ya no es experimental. Ofrece type-safety nativa en params y search params
> que React Router v6/v7 no tiene:
>
> ```typescript
> // Search params completamente tipados — el compilador detecta errores
> const { page, limit, search } = Route.useSearch();
> //      ^number  ^number  ^string — sin casteos manuales
> ```
>
> **Cuándo preferir TanStack Router**: Proyectos nuevos Vite SPA donde la type-safety es prioritaria.
> **Cuándo mantener React Router**: Proyectos con Next.js (App Router reemplaza al router), o proyectos existentes donde la migración sería costosa.
> **React Router v7**: Evolución de v6 con merge de Remix (loaders, actions, SSR). Para apps que necesitan SSR sin Next.js.

**Patrón de route guards:**

```tsx
// components/layout/AuthGuard.tsx
<ProtectedRoute allowedRoles={[Role.ROOT]}>
  <AdminPage />
</ProtectedRoute>
```

---

## 15. Testing Unitario / Integración

| #   | Herramienta   | Adopción / Notas                                                           |
| --- | ------------- | -------------------------------------------------------------------------- |
| 1   | **Vitest** ⭐ | **Tier S** State of JS 2024 (98% retention!). Compatible 1:1 con Jest API. |
| 2   | Jest          | Tier B (73% retention). #1 en uso pero perdiendo aceptación.               |
| 3   | Mocha         | Tier C. Opiniones muy negativas en 2024. Legacy.                           |

**Recomendación: Vitest**
El ganador absoluto de State of JS 2024. 10x más rápido que Jest, misma API, integración nativa con Vite. Todo proyecto nuevo debería usar Vitest.

**Config mínima:**

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { statements: 70, branches: 50, functions: 70, lines: 70 },
    },
  },
});
```

---

## 16. Testing Library (componentes)

| #   | Herramienta                   | Adopción / Notas                                                |
| --- | ----------------------------- | --------------------------------------------------------------- |
| 1   | **@testing-library/react** ⭐ | **Tier S** State of JS 2024 (91% retention). Estándar absoluto. |
| 2   | Enzyme                        | Obsoleto. No soporta React 18+.                                 |
| 3   | React Test Renderer           | Oficial React pero verbose, menos ergonómico.                   |

**Recomendación: @testing-library/react**
Sin discusión. El ecosistema completo: `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`.

**Custom render con providers:**

```tsx
// src/test/test-utils.tsx
export function render(ui: ReactElement, options?) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter>
        <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    ),
    ...options,
  });
}
```

---

## 17. API Mocking en Tests

| #   | Herramienta        | Adopción / Notas                                                    |
| --- | ------------------ | ------------------------------------------------------------------- |
| 1   | **MSW v2** ⭐      | Tier A State of JS 2024 (88% retention). Intercepta a nivel de red. |
| 2   | axios-mock-adapter | Mock a nivel de instancia. Más frágil, acoplado a Axios.            |
| 3   | nock               | Solo Node. No funciona en browser/jsdom.                            |

**Recomendación: MSW v2**
Intercepta a nivel service worker / `msw/node` — los tests son realistas porque el código no sabe que está siendo mockeado. Tier A con 88% retention.

---

## 18. E2E Testing

| #   | Herramienta       | Adopción / Notas                                                          |
| --- | ----------------- | ------------------------------------------------------------------------- |
| 1   | **Playwright** ⭐ | **Tier S** State of JS 2024 (94% retention). Multi-browser, de Microsoft. |
| 2   | Cypress           | Tier B (64% retention). Fue el rey pero perdió terreno vs Playwright.     |
| 3   | Selenium          | Tier C (25% retention). Legacy.                                           |

**Recomendación: Playwright**
El salto de Cypress a Playwright en los últimos 2 años es dramático en State of JS. Mejor soporte multi-browser, más rápido, mejor API.

---

## 19. Linter

| #   | Herramienta      | Adopción / Notas                                                         |
| --- | ---------------- | ------------------------------------------------------------------------ |
| 1   | **ESLint v9** ⭐ | Estándar absoluto. Flat config desde v9. Mayor ecosistema de plugins.    |
| 2   | Biome            | Tier A (State of JS 2024). Muy rápido (Rust). Linter + formatter en uno. |
| 3   | oxlint           | Alternativa Rust nueva. Aún no madura.                                   |

**Recomendación: ESLint v9 con flat config**
Insustituible hoy por su ecosistema de plugins (`typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-simple-import-sort`).

**Monitorear Biome:** muy prometedor como reemplazo unificado linter + formatter en 2026. Aún no tiene paridad de plugins.

**Stack de plugins recomendado:**

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import prettierConfig from 'eslint-config-prettier';
```

---

## 20. Formatter

| #   | Herramienta     | Adopción / Notas                                       |
| --- | --------------- | ------------------------------------------------------ |
| 1   | **Prettier** ⭐ | Estándar de facto. Integrado con todos los IDEs y CI.  |
| 2   | Biome format    | Más rápido (Rust), configuración limitada vs Prettier. |
| 3   | dprint          | Rápido, plugin-based, ecosistema pequeño.              |

**Recomendación: Prettier**
Config recomendada:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "endOfLine": "lf"
}
```

---

## 21. Git Hooks

| #   | Herramienta                | Adopción / Notas                                       |
| --- | -------------------------- | ------------------------------------------------------ |
| 1   | **Husky + lint-staged** ⭐ | Estándar absoluto. Simple, integrado con cualquier CI. |
| 2   | lefthook                   | Más rápido (Go), YAML config, menos adoptado.          |
| 3   | simple-git-hooks           | Minimalista. Sin lint-staged integration nativa.       |

**Recomendación: Husky v9 + lint-staged**

```json
// package.json — single repo
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

> **Monorepo (pnpm workspaces)**: ver `infra-stack.md §13 — lint-staged configuración por tipo de repo` para el patrón con `--filter` por workspace. La separación por workspace es necesaria porque cada app tiene su propio `tsconfig` y reglas ESLint.

---

## 22. Notificaciones / Toast

| #   | Herramienta     | Adopción / Notas                                             |
| --- | --------------- | ------------------------------------------------------------ |
| 1   | **sonner** ⭐   | Minimalista, del creador de shadcn/ui. Bajo bundle size.     |
| 2   | react-hot-toast | Similar a sonner, también muy popular.                       |
| 3   | react-toastify  | El más antiguo y usado pero más pesado y menos customizable. |

**Recomendación: sonner**
Es el componente `<Sonner>` que viene incluido en shadcn/ui por defecto. Del mismo creador que shadcn. La dirección del ecosistema apunta a sonner.

---

## 23. Fechas

| #   | Herramienta     | Adopción / Notas                                        |
| --- | --------------- | ------------------------------------------------------- |
| 1   | **date-fns** ⭐ | Tree-shakeable, funcional (no muta), TypeScript nativo. |
| 2   | dayjs           | API Moment.js-compatible, muy liviano, 46k stars.       |
| 3   | Moment.js       | Legacy. El propio equipo recomienda migrar.             |

**Recomendación: date-fns**
Tree-shakeable (solo pagas lo que importás), no muta objetos, mejor soporte TypeScript.

**Cuándo usar dayjs:** si se necesita compatibilidad con Moment.js o el tamaño mínimo es crítico.

---

## 24. Integración con el Backend NestJS

El backend retorna todas las respuestas en un envelope `{ data, meta }`. El frontend **debe** configurar Axios y TanStack Query para manejar esta estructura. Ver `api-contract.md` para el contrato completo.

### Axios — instancia con unwrap de envelope y manejo de errores

> 📌 El interceptor completo de Axios (incluyendo refresh token rotation) está documentado en
> [`api-contract.md §11`](./api-contract.md). No se duplica aquí para mantener una única fuente de verdad.

### TanStack Query — unwrap de envelope con `select`

```ts
// features/items/hooks/useGetItems.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
// import type { Item } from '../types/item'; // ← tipo de dominio del proyecto

interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  timestamp: string;
  requestId?: string;
}

export function useGetItems(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['items', { page, limit }],
    queryFn: () =>
      apiClient
        .get<{ data: Item[]; meta: PaginatedMeta }>('/api/v1/items', {
          params: { page, limit },
        })
        .then((res) => res.data),
    // select: unwrap del envelope — el componente recibe { items, meta } directamente
    select: (envelope) => ({
      items: envelope.data,
      meta: envelope.meta,
    }),
    staleTime: 5 * 60 * 1000,
  });
}

// Uso en componente:
// const { data, isPending } = useGetItems();
// data.items → Item[]
// data.meta.hasNextPage → boolean
```

### Toasts con código de error del backend

```ts
// features/items/hooks/useCreateItem.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
// import type { CreateItemDto } from '../schemas/createItem.schema'; // ← tipo de dominio del proyecto

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateItemDto) =>
      apiClient.post('/api/v1/items', dto).then((res) => res.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Item creado exitosamente');
    },
    onError: (err: { code: string; message: string; requestId?: string }) => {
      toast.error(err.message, {
        description: err.requestId ? `ID: ${err.requestId}` : undefined,
      });
    },
  });
}
```

### X-Request-ID para correlación de logs

```ts
// Leer el requestId de errores del backend y enviarlo a Sentry
import * as Sentry from '@sentry/react';

apiClient.interceptors.response.use(undefined, (error) => {
  const requestId = error.response?.data?.error?.requestId;
  if (requestId) {
    Sentry.setTag('requestId', requestId); // correlaciona error frontend ↔ log backend
  }
  return Promise.reject(error);
});
```

---

## 25. Gaps recomendados — agregar en proyectos nuevos

Estas categorías son recomendadas para un setup completo de producción.

---

### GAP 1: Error Monitoring

**Para qué sirve:** captura excepciones en producción con stack trace, contexto de usuario y breadcrumbs. Sin esto, te enterás de los bugs por los usuarios, no por alertas.

| #   | Herramienta          | Adopción / Notas                                                            |
| --- | -------------------- | --------------------------------------------------------------------------- |
| 1   | **@sentry/react** ⭐ | 8.6k stars. Actualizado continuamente. Plan free generoso (5k errores/mes). |
| 2   | Datadog RUM          | Enterprise, caro. Ideal si ya usás Datadog en infraestructura.              |
| 3   | Highlight.io         | Open source, session replay incluido. Más nuevo.                            |

**Recomendación: Sentry**
Estándar de industria. Plan free alcanza para la mayoría de proyectos internos. Integración con React en 3 líneas + `ErrorBoundary` incluido.

```ts
// main.tsx
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
});
```

---

### GAP 2: Error Boundaries

**Para qué sirve:** sin `ErrorBoundary`, un error en un componente rompe **toda la app** sin mensaje. Con boundaries podés aislar el error, mostrar un fallback y reportarlo a Sentry.

| #   | Herramienta                 | Adopción / Notas                                                 |
| --- | --------------------------- | ---------------------------------------------------------------- |
| 1   | **react-error-boundary** ⭐ | 6k stars. Wrapper declarativo. `useErrorBoundary` hook incluido. |
| 2   | Implementación propia       | Class component manual. Funciona pero más verbose.               |
| 3   | Sentry ErrorBoundary        | El propio Sentry incluye uno. Válido si ya usás Sentry.          |

**Recomendación: react-error-boundary**
Librería del ecosistema de Kent C. Dodds. Pequeña, bien testeada, API limpia. Costo cero.

```tsx
// App.tsx
<ErrorBoundary fallback={<ErrorPage />}>
  <AppRoutes />
</ErrorBoundary>
```

---

### GAP 3: Package Manager moderno

**Para qué sirve:** pnpm es 3x más rápido que npm, usa hard links (no duplica `node_modules`), tiene workspace support nativo.

| #   | Herramienta | Adopción / Notas                                                         |
| --- | ----------- | ------------------------------------------------------------------------ |
| 1   | **pnpm** ⭐ | **Tier S** State of JS 2024 (93% retention). 3x más rápido.              |
| 2   | npm         | Default, simple, más lento. Válido para equipos sin necesidad de cambio. |
| 3   | yarn berry  | PnP mode complejo. Adopción cayendo vs pnpm.                             |

**Recomendación: pnpm**
Uno de los cambios con mayor ROI y costo casi cero. El único cambio es `npm install` → `pnpm install`. CI se configura en 1 línea.

---

### GAP 4: Conventional Commits

**Para qué sirve:** estandariza el formato de commits (`feat:`, `fix:`, `chore:`) y permite generar CHANGELOG automático y hacer releases semánticos.

| #   | Herramienta                                         | Adopción / Notas                                                  |
| --- | --------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | **commitlint + @commitlint/config-conventional** ⭐ | Valida commits en hook `commit-msg`.                              |
| 2   | commitizen                                          | CLI interactivo para escribir commits. Complemento de commitlint. |
| 3   | git-cliff / standard-version                        | Generadores de CHANGELOG. Entran después de commitlint.           |

**Recomendación: commitlint**
Si ya usás Husky, agregar commitlint es solo un hook más. El beneficio es historial de git legible y base para automatizar releases.

```json
// commitlint.config.js
export default { extends: ['@commitlint/config-conventional'] };
```

```sh
# .husky/commit-msg
npx --no -- commitlint --edit $1
```

---

### GAP 5: Variables de entorno tipadas y validadas

**Para qué sirve:** sin validación, si una env var falta el error aparece en runtime. Con validación al startup, el build falla temprano con mensaje claro.

| #   | Herramienta             | Adopción / Notas                                                         |
| --- | ----------------------- | ------------------------------------------------------------------------ |
| 1   | **@t3-oss/env-core** ⭐ | Integración nativa con Vite. Usa Zod internamente.                       |
| 2   | Zod manual en `env.ts`  | Usa Zod (ya instalado) para parsear `import.meta.env`. Cero deps nuevas. |
| 3   | envalid                 | Más antigua, menos TypeScript-first.                                     |

**Recomendación: @t3-oss/env-core**
Si ya usás Zod, la curva de adopción es cero.

```ts
// src/env.ts
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  client: {
    VITE_API_BASE_URL: z.string().url(),
    VITE_SENTRY_DSN: z.string().optional(),
  },
  clientPrefix: 'VITE_',
  runtimeEnv: import.meta.env,
});
```

---

## Notas de compatibilidad React 19

- **shadcn/ui** es compatible con React 19 — Radix UI tiene soporte completo.
- **TanStack Query v5** es compatible con React 19.
- **Zustand v5** es compatible con React 19.
- **react-hook-form v7** es compatible con React 19.
- **Zod v3** es compatible. Zod v4 (2025) mantiene la misma API.
- **React Router v6/v7** es compatible con React 19.
- **Vitest + @testing-library/react** son compatibles con React 19.
- **MSW v2** es compatible con React 19.
- **Playwright** es agnóstico al framework — siempre compatible.
- **Tailwind v4** (2025) es compatible con shadcn/ui — revisar changelog de shadcn para migración.

---

## Fuentes

- [State of JavaScript 2024 — Libraries](https://2024.stateofjs.com/en-US/libraries/) — verificado
- [npm trends — UI Libraries](https://npmtrends.com/shadcn) — verificado 2026-03-19
- [shadcn/ui docs — Introduction](https://ui.shadcn.com/docs) — verificado 2026-03-19
- [TkDodo — Designing Design Systems](https://tkdodo.eu/blog/designing-design-systems) — dic 2025
- [TkDodo — Tooltip Components Should Not Exist](https://tkdodo.eu/blog/tooltip-components-should-not-exist) — nov 2025
- [TkDodo — Building Type-Safe Compound Components](https://tkdodo.eu/blog/building-type-safe-compound-components) — ene 2026
- [npm trends — State management](https://npmtrends.com/zustand-vs-jotai-vs-redux-vs-recoil-vs-mobx)
- [npm trends — Data fetching](https://npmtrends.com/react-query-vs-swr-vs-apollo-client)
- [npm trends — Forms](https://npmtrends.com/react-hook-form-vs-formik)
- [npm trends — Validation](https://npmtrends.com/zod-vs-yup-vs-valibot-vs-joi)
