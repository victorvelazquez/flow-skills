# Frontend Patterns Reference — React

> **Propósito:** Referencia única de patrones de código para proyectos React admin/dashboard.
> Agnóstica al dominio — los ejemplos usan `Item`/`User` como placeholder.
> Cada patrón incluye implementación lista para copiar, justificación y gotchas.
> Stack: React 19 · Vite · TypeScript strict · **shadcn/ui + Radix UI** · Zustand · TanStack Query v5 · Axios · RHF v7 · Zod · React Router v6.
> Ver `frontend-stack.md` para decisiones de stack con justificaciones.
> Ver `api-contract.md` para el contrato de integración con el backend.
>
> **Fuentes verificadas** (fetched directo, 2026-03-19):
>
> - TkDodo blog #31 "Creating Query Abstractions" (Feb 2026) — `queryOptions` como abstracción preferida sobre custom hooks
> - TkDodo blog #30 "React Query Selectors, Supercharged" — `select` type-safe
> - TkDodo blog "Building Type-Safe Compound Components" (Jan 2026) — Component Factory Pattern
> - React 19 blog oficial — `ref` como prop, `useActionState`, `useOptimistic`, `use()`
> - react-hook-form v7 docs — `useForm` options, `values` prop, `disabled` prop
> - MSW v2 docs — setup con `setupServer` + Vitest
> - TanStack Query v5 docs — `queryOptions` API
>
> Última actualización: 2026-03-19

---

## Tabla de Contenidos

1. [Estructura de Proyecto](#1-estructura-de-proyecto)
2. [Componentes React](#2-componentes-react)
3. [Custom Hooks](#3-custom-hooks)
4. [TanStack Query — Server State](#4-tanstack-query--server-state)
5. [Zustand — Client State](#5-zustand--client-state)
6. [Formularios — react-hook-form + Zod](#6-formularios--react-hook-form--zod)
7. [Axios — HTTP Client](#7-axios--http-client)
8. [Routing — React Router v6](#8-routing--react-router-v6)
9. [Error Handling](#9-error-handling)
10. [TypeScript Patterns](#10-typescript-patterns)
11. [Performance](#11-performance)
12. [Tablas de Datos](#12-tablas-de-datos)
13. [Auth — ProtectedRoute y RBAC](#13-auth--protectedroute-y-rbac)
14. [Variables de Entorno](#14-variables-de-entorno)
15. [Testing Patterns](#15-testing-patterns)
16. [Accesibilidad](#16-accesibilidad)
17. [Bootstrap — main.tsx](#17-bootstrap--maintsx)
18. [Checklist de Setup Inicial](#18-checklist-de-setup-inicial)
19. [Real-time: SSE y WebSockets](#19-real-time-sse-y-websockets)
20. [RBAC en UI: Permisos granulares en componentes](#20-rbac-en-ui-permisos-granulares-en-componentes-tier-2)

---

## 1. Estructura de Proyecto

`[Base]`

### Estructura feature-based recomendada

```
src/
├── assets/                     # Imágenes, fuentes, íconos estáticos
├── components/                 # Componentes globales reutilizables (no de features)
│   ├── ui/                     # shadcn/ui components (Button, Input, Dialog, etc.)
│   └── layout/                 # AppShell, Sidebar, TopBar, ProtectedRoute
├── features/                   # Una carpeta por feature de negocio
│   └── items/
│       ├── api/                # Llamadas HTTP de este feature (no TanStack Query hooks)
│       │   └── items.api.ts
│       ├── components/         # Componentes propios del feature
│       │   ├── ItemsTable.tsx
│       │   ├── ItemForm.tsx
│       │   └── ItemCard.tsx
│       ├── hooks/              # Custom hooks de TanStack Query + lógica del feature
│       │   ├── useGetItems.ts
│       │   ├── useGetItem.ts
│       │   ├── useCreateItem.ts
│       │   └── useDeleteItem.ts
│       ├── schemas/            # Schemas Zod + tipos inferidos
│       │   └── item.schema.ts
│       ├── types/              # Tipos TS propios del feature
│       │   └── item.types.ts
│       └── index.ts            # Re-export público del feature (barrel selectivo)
├── hooks/                      # Hooks globales (useDebounce, useLocalStorage)
├── lib/                        # Configuración de librerías externas
│   ├── api-client.ts           # Instancia Axios + interceptors
│   ├── query-client.ts         # QueryClient + configuración global
│   └── sentry.ts               # Inicialización Sentry
├── pages/                      # Solo routing — delegan a features
│   ├── items/
│   │   ├── ItemsPage.tsx
│   │   └── ItemDetailPage.tsx
│   └── auth/
│       └── LoginPage.tsx
├── router/                     # Definición de rutas
│   ├── routes.tsx
│   └── guards.tsx
├── store/                      # Stores Zustand globales
│   ├── auth.store.ts
│   └── ui.store.ts
├── types/                      # Tipos globales compartidos
│   └── api.types.ts            # ApiEnvelope, PaginatedMeta, ApiError
├── utils/                      # Funciones puras reutilizables
│   └── format.utils.ts
├── env.ts                      # Variables de entorno tipadas con @t3-oss/env-core
├── main.tsx                    # Bootstrap
└── App.tsx                     # Providers + Router
```

### Path aliases (tsconfig + vite.config)

```json
// tsconfig.app.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@features/*": ["./src/features/*"],
      "@components/*": ["./src/components/*"],
      "@hooks/*": ["./src/hooks/*"],
      "@store/*": ["./src/store/*"],
      "@lib/*": ["./src/lib/*"],
      "@types/*": ["./src/types/*"]
    }
  }
}
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@features': path.resolve(__dirname, './src/features'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@lib': path.resolve(__dirname, './src/lib'),
    },
  },
});
```

### Barrel files — regla

```typescript
// ✅ Barrel en el feature — re-exporta solo la API pública
// src/features/items/index.ts
export { ItemsTable } from './components/ItemsTable';
export { ItemForm } from './components/ItemForm';
export { useGetItems } from './hooks/useGetItems';
export { useCreateItem } from './hooks/useCreateItem';
export type { Item, CreateItemDto } from './types/item.types';

// ❌ NUNCA barrel general en src/components/ o src/hooks/
// Causa circular dependencies y mata tree-shaking
// export * from './Button';
// export * from './Input';
// ← El bundler no puede optimizar esto
```

> **Gotchas**
>
> - Feature-based > Layer-based para proyectos > 3 features. Layer-based (components/services/hooks en paralelo) escala mal.
> - Barrel files solo en el límite del feature — no en carpetas internas.
> - `pages/` solo tiene componentes de routing que delegan al feature — sin lógica de negocio.

---

## 2. Componentes React

`[Base]`

### Composition Pattern — el patrón más importante

```tsx
// ✅ Composición — flexible, extensible sin props drilling
// src/components/ui/Card.tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

function Card({ children, className }: CardProps) {
  return <div className={cn('rounded-lg border bg-card p-4', className)}>{children}</div>;
}

function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      {action}
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

// Exportar como namespace compuesto
Card.Header = CardHeader;
Card.Body = CardBody;

// Uso:
// <Card>
//   <Card.Header title="Users" action={<Button>Add</Button>} />
//   <Card.Body><UserTable /></Card.Body>
// </Card>
```

### Compound Components con Context

```tsx
// Cuando los sub-componentes necesitan estado compartido
// src/components/ui/Tabs.tsx
interface TabsContext {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsCtx = React.createContext<TabsContext | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsCtx);
  if (!ctx) throw new Error('useTabs must be used within <Tabs>');
  return ctx;
}

function Tabs({ defaultTab, children }: { defaultTab: string; children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  return <TabsCtx.Provider value={{ activeTab, setActiveTab }}>{children}</TabsCtx.Provider>;
}

function Tab({ id, label }: { id: string; label: string }) {
  const { activeTab, setActiveTab } = useTabs();
  return (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={cn(
        'px-4 py-2 text-sm rounded-md transition-colors',
        activeTab === id
          ? 'bg-primary text-primary-foreground font-semibold'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

Tabs.Tab = Tab;
```

### Component Factory Pattern — Type-Safe Compound Components (TkDodo Jan 2026)

Cuando los sub-componentes necesitan compartir un tipo genérico con el padre (ej. `RadioGroup<T>` + `RadioGroupItem<T>`), el Compound Component estándar no puede propagar los type params a los children en JSX.

**Solución**: `createXxx()` factory que retorna los componentes con types vinculados.

```tsx
// src/components/ui/RadioGroup.tsx
type GroupValue = string | number;

type RadioGroupProps<T extends GroupValue> = {
  value: T;
  onChange: (value: T) => void;
  children?: React.ReactNode;
};

type RadioGroupItemProps<T extends GroupValue> = {
  value: T;
  children?: React.ReactNode;
};

// Implementaciones internas (no exportadas directamente)
function RadioGroupInternal<T extends GroupValue>({
  value,
  onChange,
  children,
}: RadioGroupProps<T>) {
  // ...implementación con Context para compartir value y onChange
}

function RadioGroupItemInternal<T extends GroupValue>({ value, children }: RadioGroupItemProps<T>) {
  // ...implementación que lee del Context
}

// Factory: vincula los type params entre padre e hijo
// default: never fuerza al usuario a proveer el tipo explícitamente
export const createRadioGroup = <T extends GroupValue = never>() => ({
  RadioGroup: RadioGroupInternal<T>,
  RadioGroupItem: RadioGroupItemInternal<T>,
});

// Uso: crear UNA VEZ por tipo de dominio
type ThemeValue = 'system' | 'light' | 'dark';
const Theme = createRadioGroup<ThemeValue>();

function ThemeSwitcher({
  value,
  onChange,
}: {
  value: ThemeValue;
  onChange: (v: ThemeValue) => void;
}) {
  return (
    <Theme.RadioGroup value={value} onChange={onChange}>
      <Theme.RadioGroupItem value="system">🤖</Theme.RadioGroupItem>
      <Theme.RadioGroupItem value="light">☀️</Theme.RadioGroupItem>
      <Theme.RadioGroupItem value="dark">🌑</Theme.RadioGroupItem>
      {/* ✅ TypeScript error: 'wrong' is not assignable to ThemeValue */}
      {/* <Theme.RadioGroupItem value="wrong">🚨</Theme.RadioGroupItem> */}
    </Theme.RadioGroup>
  );
}
```

> **Cuándo usar**: Compound Components con tipos genéricos compartidos entre padre e hijo.
> **No usar para**: Selects con opciones dinámicas (usar `options` prop), layouts fijos (usar slots/props).
> **Fuente**: TkDodo "Building Type-Safe Compound Components" (Jan 2026) — verificado.

### ref como prop — React 19 (forwardRef deprecado)

> **Fuente verificada**: React 19 blog oficial (dic 2024) — `ref` ahora es una prop regular en function components.

```tsx
// ✅ React 19 — ref como prop directa (ya no se necesita forwardRef)
import { Input as ShadcnInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface InputProps extends React.ComponentPropsWithoutRef<'input'> {
  label: string;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

function Input({ label, error, ref, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <ShadcnInput ref={ref} {...props} className={cn(error && 'border-destructive')} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ✅ Cleanup functions en ref callbacks (React 19)
<input
  ref={(node) => {
    // setup
    return () => {
      // cleanup cuando el elemento se desmonta
    };
  }}
/>;

// ⚠️ forwardRef todavía funciona en React 19 pero está DEPRECADO
// Un codemod oficial migrará automáticamente los componentes existentes
// En proyectos nuevos: usar ref como prop directa
```

### React 19 — Nuevas APIs verificadas

```tsx
// useActionState — manejo de estado en form Actions (reemplaza useFormState)
// Antes: isPending + error + handleSubmit manual con useState
// Ahora: todo en un hook
import { useActionState } from 'react';

function UpdateNameForm() {
  const [error, submitAction, isPending] = useActionState(
    async (previousState: string | null, formData: FormData) => {
      const error = await updateName(formData.get('name') as string);
      if (error) return error;
      redirect('/dashboard');
      return null;
    },
    null,
  );

  return (
    <form action={submitAction}>
      <input type="text" name="name" />
      <button type="submit" disabled={isPending}>
        Update
      </button>
      {error && <p>{error}</p>}
    </form>
  );
}

// useOptimistic — optimistic updates nativos
import { useOptimistic } from 'react';

function ItemList({ items }: { items: Item[] }) {
  const [optimisticItems, addOptimisticItem] = useOptimistic(
    items,
    (state: Item[], newItem: Item) => [...state, newItem],
  );

  const addItem = async (formData: FormData) => {
    const newItem = { id: 'temp', name: formData.get('name') as string };
    addOptimisticItem(newItem); // actualización inmediata
    await createItem(newItem); // request real
  };

  return (
    <ul>
      {optimisticItems.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
      <form action={addItem}>
        <input name="name" />
        <button type="submit">Add</button>
      </form>
    </ul>
  );
}

// use() — leer recursos en render (Context condicional)
import { use } from 'react';

function Heading({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  // ✅ use() puede llamarse condicionalmente (useContext no puede)
  const theme = use(ThemeContext);
  return <h1 style={{ color: theme.color }}>{children}</h1>;
}

// <Context> como provider (reemplaza <Context.Provider>)
const ThemeContext = React.createContext('light');
function App() {
  return (
    // ✅ React 19 — sin .Provider
    <ThemeContext value="dark">
      <AppContent />
    </ThemeContext>
  );
}
```

> **Nota importante**: `useActionState` + `useOptimistic` son nativos de React 19.
> Con TanStack Query ya tenemos `useMutation` + optimistic updates — en proyectos con TanStack Query, preferir los patrones de TQ sobre `useActionState`. Las APIs nativas son útiles en proyectos sin TanStack Query o en Server Components.

### memo, useMemo, useCallback — cuándo SÍ y cuándo NO

```tsx
// ✅ memo: componente puro que recibe props estables y es costoso de renderizar
const ItemRow = React.memo(function ItemRow({ item, onDelete }: ItemRowProps) {
  return (
    <TableRow>
      <TableCell>{item.name}</TableCell>
      <TableCell>
        <IconButton onClick={() => onDelete(item.id)}>
          <DeleteIcon />
        </IconButton>
      </TableCell>
    </TableRow>
  );
});

// ✅ useCallback: función que se pasa como prop a un componente memoizado
function ItemsPage() {
  const { mutate: deleteItem } = useDeleteItem();

  // Sin useCallback, ItemRow re-renderiza en cada render del padre aunque nada cambie
  const handleDelete = React.useCallback((id: string) => deleteItem(id), [deleteItem]);

  return <ItemRow item={item} onDelete={handleDelete} />;
}

// ✅ useMemo: cálculo costoso que no debe repetirse en cada render
const sortedItems = React.useMemo(
  () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  [items],
);

// ❌ useMemo/memo innecesarios — agregan complejidad sin beneficio
const name = React.useMemo(() => user.firstName + ' ' + user.lastName, [user]); // trivial
const Component = React.memo(SimpleText); // sin props o re-renders costosos
```

> **Regla**: memoizar solo cuando hay evidencia de problema de performance (Profiler). El compilador de React 19 memoiza automáticamente — en proyectos nuevos con RC/React Compiler, `memo` es menos necesario.

---

## 3. Custom Hooks

`[Base]`

### Separación de concerns — feature hooks vs infra hooks

```typescript
// ✅ Hook de feature — encapsula lógica de negocio de un feature específico
// src/features/items/hooks/useItemFilters.ts
// Ver implementación canónica en §8 — Routing

// ✅ Hook de infraestructura — reutilizable en cualquier feature
// src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// src/hooks/useLocalStorage.ts
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setStoredValue = (newValue: T | ((val: T) => T)) => {
    const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
    setValue(valueToStore);
    window.localStorage.setItem(key, JSON.stringify(valueToStore));
  };

  return [value, setStoredValue] as const;
}
```

### Convenciones de naming

```typescript
// ✅ Naming conventions
useGetItems(); // query de lista
useGetItem(id); // query de detalle
useCreateItem(); // mutation de creación
useUpdateItem(); // mutation de actualización
useDeleteItem(); // mutation de eliminación
useItemFilters(); // estado de filtros del feature
useItemForm(); // lógica de formulario del feature
useDebounce(); // hook de infraestructura
useLocalStorage(); // hook de infraestructura
useMediaQuery(); // hook de infraestructura
```

---

## 4. TanStack Query — Server State

`[Base]`

### queryOptions factory — patrón TkDodo #24/#31 (verificado Feb 2026)

**El patrón más importante de TanStack Query v5** — y va más allá de lo que se pensaba antes.

TkDodo #31 "Creating Query Abstractions" (Feb 2026) establece que **custom hooks ya NO son la abstracción correcta para queries**. Las razones:

1. Los custom hooks solo funcionan en componentes/hooks — no en route loaders, server-side, prefetch en event handlers.
2. Los custom hooks comparten lógica, pero aquí solo se comparte configuración (queryKey + queryFn).
3. Un custom hook te ata a `useQuery` — no podés reutilizar con `useSuspenseQuery` o `useQueries`.

**La abstracción correcta es `queryOptions`** — es una función regular que funciona en cualquier ambiente:

```typescript
// ✅ queryOptions — funciona en hooks, loaders, prefetch, server
// A runtime, queryOptions() solo retorna el mismo objeto — no hace nada
// A nivel de tipos, tipa el queryKey con dataTagSymbol para type-safe getQueryData()
```

```typescript
// src/features/items/api/items.api.ts
import { queryOptions } from '@tanstack/react-query';
import { apiClient } from '@lib/api-client';
import type { PaginatedMeta } from '@/types/api.types';

export interface Item {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface ItemFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// queryOptions factory — tipo-safe, reutilizable en hooks Y en loaders de React Router
export const itemQueries = {
  // Lista paginada
  list: (filters: ItemFilters = {}) =>
    queryOptions({
      queryKey: ['items', 'list', filters],
      queryFn: () =>
        apiClient
          .get<{ data: Item[]; meta: PaginatedMeta }>('/api/v1/items', { params: filters })
          .then((res) => res.data),
      staleTime: 5 * 60 * 1000, // 5 min — los listados cambian con moderación
    }),

  // Detalle por ID
  detail: (id: string) =>
    queryOptions({
      queryKey: ['items', 'detail', id],
      queryFn: () =>
        apiClient.get<{ data: Item }>(`/api/v1/items/${id}`).then((res) => res.data), // retorna el envelope completo
      staleTime: 10 * 60 * 1000, // 10 min — los detalles cambian menos
      enabled: !!id, // no ejecutar si no hay id
    }),
};
```

```typescript
// src/features/items/hooks/useGetItems.ts
import { useQuery } from '@tanstack/react-query';
import { itemQueries } from '../api/items.api';
import type { ItemFilters } from '../api/items.api';

export function useGetItems(filters: ItemFilters = {}) {
  return useQuery({
    ...itemQueries.list(filters),
    // select: unwrap y transformar para el componente
    select: (envelope) => ({
      items: envelope.data,
      meta: envelope.meta,
    }),
  });
}

// src/features/items/hooks/useGetItem.ts
export function useGetItem(id: string) {
  return useQuery({
    ...itemQueries.detail(id),
    // select: unwrap del envelope — preserva { data: Item } en caché, expone Item al componente
    select: (envelope) => envelope.data,
  });
}
```

### Mutations con invalidación

```typescript
// src/features/items/hooks/useCreateItem.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@lib/api-client';
import { itemQueries } from '../api/items.api';
import type { ApiError } from '@/types/api.types';

export interface CreateItemDto {
  name: string;
  email: string;
  status?: 'active' | 'inactive';
}

export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateItemDto) =>
      apiClient.post<{ data: Item }>('/api/v1/items', dto).then((res) => res.data.data),

    onSuccess: (newItem) => {
      // Invalidar la lista — el próximo useGetItems re-fetcha
      queryClient.invalidateQueries({ queryKey: ['items', 'list'] });

      // Seed del cache de detalle con el nuevo item (evita un fetch extra)
      queryClient.setQueryData(itemQueries.detail(newItem.id).queryKey, newItem);

      toast.success('Item creado exitosamente');
    },

    onError: (error: ApiError) => {
      toast.error(error.message, {
        description: error.requestId ? `Request ID: ${error.requestId}` : undefined,
      });
    },
  });
}

// src/features/items/hooks/useDeleteItem.ts
export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/items/${id}`),

    onSuccess: (_data, deletedId) => {
      // Remover del cache de detalle inmediatamente
      queryClient.removeQueries({ queryKey: itemQueries.detail(deletedId).queryKey });
      // Invalidar la lista
      queryClient.invalidateQueries({ queryKey: ['items', 'list'] });
      toast.success('Item eliminado');
    },

    onError: (error: ApiError) => toast.error(error.message),
  });
}
```

### Optimistic Updates

```typescript
// src/features/items/hooks/useUpdateItem.ts
export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<Item> }) =>
      apiClient.patch<{ data: Item }>(`/api/v1/items/${id}`, dto).then((res) => res.data.data),

    // Actualización optimista — UI responde antes de que el servidor confirme
    onMutate: async ({ id, dto }) => {
      // Cancelar queries en vuelo para evitar race conditions
      await queryClient.cancelQueries({ queryKey: itemQueries.detail(id).queryKey });

      // Snapshot del estado anterior (para rollback)
      const previousItem = queryClient.getQueryData<Item>(itemQueries.detail(id).queryKey);

      // Actualizar el cache optimistamente
      queryClient.setQueryData<Item>(itemQueries.detail(id).queryKey, (old) =>
        old ? { ...old, ...dto } : old,
      );

      return { previousItem }; // context para onError
    },

    onError: (_error, { id }, context) => {
      // Rollback si el servidor rechaza
      if (context?.previousItem) {
        queryClient.setQueryData(itemQueries.detail(id).queryKey, context.previousItem);
      }
      toast.error('No se pudo actualizar el item');
    },

    onSettled: (_data, _error, { id }) => {
      // Siempre re-sincronizar con el servidor al terminar
      queryClient.invalidateQueries({ queryKey: itemQueries.detail(id).queryKey });
    },
  });
}
```

### MutationCache global para invalidación automática — TkDodo #25

```typescript
// src/lib/query-client.ts
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ApiError } from '@/types/api.types';

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    // Error handler global — evita duplicar onError en cada mutation
    onError: (error: unknown) => {
      const apiError = error as ApiError;
      if (!apiError.code) return; // error no normalizado, ignorar
      toast.error(apiError.message ?? 'An error occurred', {
        description: apiError.requestId ? `ID: ${apiError.requestId}` : undefined,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error: unknown) => {
        const apiError = error as ApiError;
        if (apiError.statusCode >= 400 && apiError.statusCode < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

### Infinite scroll

```typescript
// src/features/items/hooks/useInfiniteItems.ts
import { useInfiniteQuery } from '@tanstack/react-query';

export function useInfiniteItems(filters: Omit<ItemFilters, 'page'> = {}) {
  return useInfiniteQuery({
    queryKey: ['items', 'infinite', filters],
    queryFn: ({ pageParam }) =>
      apiClient
        .get<{ data: Item[]; meta: PaginatedMeta }>('/api/v1/items', {
          params: { ...filters, page: pageParam, limit: 20 },
        })
        .then((res) => res.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
    select: (data) => ({
      items: data.pages.flatMap((page) => page.data),
      hasNextPage: data.pages.at(-1)?.meta.hasNextPage ?? false,
    }),
  });
}
```

```typescript
// Trigger de infinite scroll con Intersection Observer
import { useEffect, useRef } from 'react';

export function useInfiniteScrollTrigger(
  fetchNextPage: () => void,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
) {
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = triggerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return triggerRef;
}

// Uso en componente:
// const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteItems(filters);
// const triggerRef = useInfiniteScrollTrigger(fetchNextPage, hasNextPage, isFetchingNextPage);
// return <div><ItemList items={...} /><div ref={triggerRef} /></div>
```

### Composing queryOptions — pasar opciones extra sin romper el factory (TkDodo #31)

```typescript
// ✅ Correcto: queryOptions solo contiene lo que se comparte entre TODOS los usos
// Las opciones específicas (staleTime, throwOnError, select) van en el hook/loader

// Opción A: en un hook custom (todavía válido, construido sobre queryOptions)
export function useGetItem(id: string) {
  return useQuery({
    ...itemQueries.detail(id), // base compartida
    staleTime: 10 * 60 * 1000, // opción específica de este uso
    select: (item) => item.name, // transformación específica — type-safe!
    throwOnError: true, // comportamiento específico
  });
}

// Opción B: directo sin hook (TkDodo #31 lo promueve — más simple)
const { data } = useQuery({
  ...itemQueries.detail(itemId),
  select: (item) => item.email, // TypeScript infiere string — type-safe
});

// Opción C: useSuspenseQuery — mismos queryOptions, diferente hook
const { data } = useSuspenseQuery(itemQueries.detail(itemId));
// data es Item (nunca undefined) — Suspense garantiza el dato

// Opción D: en route loader (NO se puede usar hooks aquí — por eso queryOptions es superior a custom hooks)
loader: ({ params }) => {
  queryClient.ensureQueryData(itemQueries.detail(params.id!));
  return null;
};
```

### Prefetch en hover y en loaders de router

```typescript
// Prefetch en hover — respuesta instantánea al navegar
function ItemListRow({ item }: { item: Item }) {
  const queryClient = useQueryClient();

  const prefetchItem = () => {
    queryClient.prefetchQuery(itemQueries.detail(item.id));
  };

  return (
    <TableRow onMouseEnter={prefetchItem}>
      <TableCell>{item.name}</TableCell>
    </TableRow>
  );
}

// Prefetch en loader de React Router — datos listos cuando llega la ruta
// ✅ queryOptions funciona aquí — custom hooks NO pueden usarse fuera de componentes
{
  path: '/items/:id',
  loader: ({ params }) => {
    queryClient.ensureQueryData(itemQueries.detail(params.id!));
    return null; // no bloquear — datos se cargan en paralelo
  },
  element: <ItemDetailPage />,
}
```

### staleTime strategy por tipo de dato

```typescript
// src/lib/query-client.ts — guía de staleTime
const STALE_TIME = {
  NEVER: Infinity, // datos que no cambian (config, enums)
  VERY_LONG: 60 * 60 * 1000, // 1 hora — perfiles de usuario
  LONG: 10 * 60 * 1000, // 10 min — detalles de recursos
  MEDIUM: 5 * 60 * 1000, // 5 min  — listados (default)
  SHORT: 1 * 60 * 1000, // 1 min  — dashboards, contadores
  REAL_TIME: 0, // siempre fresh — datos críticos
} as const;
```

> **Gotchas verificados (TanStack Query v5 docs + TkDodo blog)**
>
> - TanStack Query v5 eliminó `onError` en `useQuery` — usar `QueryCache.onError` o el `MutationCache` global.
> - `queryOptions()` habilita `getQueryData<T>()` con tipo correcto via `dataTagSymbol` — usar siempre en lugar de key arrays sueltos.
> - `staleTime: Infinity` + invalidación manual es el patrón más predecible para datos controlados por mutations.
> - `enabled: !!id` en queries de detalle — evita requests con id vacío.
> - **queryOptions > custom hooks** (TkDodo #31, Feb 2026): custom hooks solo funcionan en React. `queryOptions` funciona en loaders, server-side, prefetch en event handlers, y con cualquier hook (`useQuery`, `useSuspenseQuery`, `useQueries`).
> - `queryOptions` a runtime es solo `function queryOptions(options) { return options }` — zero overhead.
> - Las mejores abstractions NO son configurables — `invoiceOptions(id)` sin parámetros extra. Si un uso necesita `staleTime` diferente, pásalo directamente en el hook, no al factory.

---

## 5. Zustand — Client State

`[Base]`

### Store tipado con devtools + persist + immer

```typescript
// src/store/auth.store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

interface AuthState {
  accessToken: string | null;
  user: { sub: string; email: string; roles: string[] } | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  setAuth: (token: string, payload: JwtPayload) => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
}

// devtools siempre como wrapper más externo — regla de Zustand
// Ver nota sobre orden de middlewares más abajo
export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    // persist solo para UI state sin datos sensibles
    // El accessToken NO se persiste en localStorage (seguridad)
    immer((set, get) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token, payload) =>
        set((state) => {
          state.accessToken = token;
          state.user = { sub: payload.sub, email: payload.email, roles: payload.roles ?? [] };
          state.isAuthenticated = true;
        }),

      logout: () =>
        set((state) => {
          state.accessToken = null;
          state.user = null;
          state.isAuthenticated = false;
        }),

      hasRole: (role: string) => get().user?.roles.includes(role) ?? false,
    })),
    { name: 'auth-store' },
  ),
);

// Acceso fuera de React (Axios interceptor, utils)
// useAuthStore.getState().accessToken
// useAuthStore.getState().logout()
```

### UI Store con persist

```typescript
// src/store/ui.store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface UiState {
  sidebarOpen: boolean;
  colorMode: 'light' | 'dark';
  tablePageSize: number;
}

interface UiActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleColorMode: () => void;
  setTablePageSize: (size: number) => void;
}

export const useUiStore = create<UiState & UiActions>()(
  devtools(
    persist(
      immer((set) => ({
        sidebarOpen: true,
        colorMode: 'light',
        tablePageSize: 10,

        toggleSidebar: () =>
          set((state) => {
            state.sidebarOpen = !state.sidebarOpen;
          }),

        setSidebarOpen: (open) =>
          set((state) => {
            state.sidebarOpen = open;
          }),

        toggleColorMode: () =>
          set((state) => {
            state.colorMode = state.colorMode === 'light' ? 'dark' : 'light';
          }),

        setTablePageSize: (size) =>
          set((state) => {
            state.tablePageSize = size;
          }),
      })),
      {
        name: 'ui-store',
        // Solo persistir preferencias del usuario, no estado de navegación
        partialize: (state) => ({
          colorMode: state.colorMode,
          tablePageSize: state.tablePageSize,
        }),
      },
    ),
    { name: 'ui-store' },
  ),
);
```

> 📌 **Orden de middlewares**: El orden importa.
> - `devtools` siempre va como wrapper más externo para capturar todos los cambios en DevTools
> - `persist` va antes que `immer` porque necesita serializar el estado resultante de immer
> - Invertir el orden puede causar que DevTools no capture correctamente las mutaciones de immer

### Selectores granulares — evitar re-renders innecesarios

```typescript
// ✅ Selector granular — el componente solo re-renderiza si cambia user.email
function UserEmail() {
  const email = useAuthStore((state) => state.user?.email);
  return <span>{email}</span>;
}

// ❌ Sin selector — re-renderiza en cualquier cambio del store
function UserEmail() {
  const { user } = useAuthStore(); // re-renderiza si cambia accessToken, isAuthenticated, etc.
  return <span>{user?.email}</span>;
}

// ✅ Selector estable con shallow para objetos
import { useShallow } from 'zustand/react/shallow';

function UserInfo() {
  const { sub, email } = useAuthStore(
    useShallow((state) => ({ sub: state.user?.sub, email: state.user?.email })),
  );
  return <span>{email}</span>;
}
```

### Reset pattern

```typescript
// Útil en logout o cuando se cambia de contexto (multi-tenant)
const initialState: AuthState = {
  accessToken: null,
  user: null,
  isAuthenticated: false,
};

// Agregar reset action al store
reset: () => set(initialState),

// O resetear todos los stores desde el interceptor de logout
export function resetAllStores() {
  useAuthStore.getState().logout();
  useUiStore.setState({ sidebarOpen: true }); // opciones específicas
}
```

> **Gotchas**
>
> - `devtools` siempre más externo que `persist` — si se invierte, el nombre en Redux DevTools no aparece correctamente.
> - Nunca persistir `accessToken` en localStorage — XSS puede leerlo. Solo en memoria.
> - `immer` permite mutaciones directas en los setters — más legible que spread operators anidados.
> - `useShallow` para seleccionar múltiples campos de un store — evita re-renders cuando el objeto reference cambia pero los valores no.

---

## 6. Formularios — react-hook-form + Zod

`[Base]`

### Schema-first con Zod + tipos inferidos

```typescript
// src/features/items/schemas/item.schema.ts
import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(2, 'Nombre mínimo 2 caracteres').max(120),
  email: z
    .string()
    .email('Email inválido')
    .transform((val) => val.toLowerCase().trim()),
  status: z.enum(['active', 'inactive']).default('active'),
  description: z.string().max(500).optional(),
});

export const updateItemSchema = createItemSchema.partial().omit({ email: true });

// Los tipos vienen del schema — single source of truth
export type CreateItemFormData = z.infer<typeof createItemSchema>;
export type UpdateItemFormData = z.infer<typeof updateItemSchema>;
```

### Formulario de creación

```tsx
// src/features/items/components/ItemForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createItemSchema, type CreateItemFormData } from '../schemas/item.schema';
import { useCreateItem } from '../hooks/useCreateItem';

interface ItemFormProps {
  onSuccess?: () => void;
}

export function ItemForm({ onSuccess }: ItemFormProps) {
  const { mutate: createItem, isPending } = useCreateItem();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateItemFormData>({
    resolver: zodResolver(createItemSchema),
    defaultValues: { status: 'active' },
  });

  const onSubmit = (data: CreateItemFormData) => {
    createItem(data, {
      onSuccess: () => {
        reset(); // limpiar formulario después del submit exitoso
        onSuccess?.();
      },
      // onError se maneja en el MutationCache global — no duplicar aquí
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Nombre</Label>
        <ShadcnInput
          id="name"
          {...register('name')}
          className={cn(errors.name && 'border-destructive')}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <ShadcnInput
          id="email"
          type="email"
          {...register('email')}
          className={cn(errors.email && 'border-destructive')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Creando...' : 'Crear Item'}
      </Button>
    </form>
  );
}
```

### useFormContext — formularios con sub-componentes

```tsx
// src/features/items/components/ItemFormFields.tsx
import { useFormContext, Controller } from 'react-hook-form';
import type { CreateItemFormData } from '../schemas/item.schema';

// Sub-componente que accede al form sin prop drilling
export function ItemStatusField() {
  const {
    control,
    formState: { errors },
  } = useFormContext<CreateItemFormData>();

  return (
    <Controller
      name="status"
      control={control}
      render={({ field }) => (
        <div className="space-y-1">
          <Label>Estado</Label>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <SelectTrigger className={cn(errors.status && 'border-destructive')}>
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
            </SelectContent>
          </Select>
          {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
        </div>
      )}
    />
  );
}

// Wrapper que provee el contexto
export function ItemFormWithContext() {
  const methods = useForm<CreateItemFormData>({ resolver: zodResolver(createItemSchema) });

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        <ItemStatusField />
        {/* más campos... */}
      </form>
    </FormProvider>
  );
}
```

### useFieldArray — listas dinámicas

```tsx
import { useFieldArray, useForm } from 'react-hook-form';

interface InvoiceFormData {
  items: Array<{ description: string; quantity: number; price: number }>;
}

export function InvoiceForm() {
  const { control, register } = useForm<InvoiceFormData>({
    defaultValues: { items: [{ description: '', quantity: 1, price: 0 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  return (
    <div>
      {fields.map((field, index) => (
        // ✅ key={field.id} NUNCA key={index} — genera bugs de identidad en react
        <div key={field.id} className="flex gap-2 items-center">
          <ShadcnInput {...register(`items.${index}.description`)} placeholder="Descripción" />
          <ShadcnInput
            {...register(`items.${index}.quantity`)}
            type="number"
            placeholder="Qty"
            className="w-20"
          />
          <ShadcnInput
            {...register(`items.${index}.price`)}
            type="number"
            placeholder="Precio"
            className="w-24"
          />
          <button
            type="button"
            onClick={() => remove(index)}
            className="text-destructive hover:text-destructive/80"
          >
            <DeleteIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button onClick={() => append({ description: '', quantity: 1, price: 0 })}>
        Agregar ítem
      </Button>
    </div>
  );
}
```

### Formulario multi-step (wizard)

```tsx
// src/features/onboarding/components/OnboardingWizard.tsx
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const step1Schema = z.object({ name: z.string().min(2) });
const step2Schema = z.object({ email: z.string().email() });
const fullSchema = step1Schema.merge(step2Schema);

type WizardData = z.infer<typeof fullSchema>;

const STEPS = [
  { schema: step1Schema, component: Step1Form },
  { schema: step2Schema, component: Step2Form },
];

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = React.useState(0);
  const methods = useForm<WizardData>({ resolver: zodResolver(fullSchema), mode: 'onTouched' });

  const isLastStep = currentStep === STEPS.length - 1;
  const StepComponent = STEPS[currentStep].component;

  const handleNext = methods.handleSubmit(async () => {
    // Validar solo los campos del step actual
    const stepFields = Object.keys(STEPS[currentStep].schema.shape);
    const isValid = await methods.trigger(stepFields as (keyof WizardData)[]);
    if (isValid) setCurrentStep((prev) => prev + 1);
  });

  const handleSubmit = methods.handleSubmit((data) => {
    console.log('Final data:', data);
  });

  return (
    <FormProvider {...methods}>
      <Stepper activeStep={currentStep}>
        {STEPS.map((_, i) => (
          <Step key={i}>
            <StepLabel>Paso {i + 1}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <StepComponent />

      <div className="flex gap-2 mt-4">
        {currentStep > 0 && (
          <Button variant="outline" onClick={() => setCurrentStep((prev) => prev - 1)}>
            Atrás
          </Button>
        )}
        <Button onClick={isLastStep ? handleSubmit : handleNext}>
          {isLastStep ? 'Finalizar' : 'Siguiente'}
        </Button>
      </div>
    </FormProvider>
  );
}
```

> **Gotchas verificados (RHF v7 docs)**
>
> - `zodResolver` + schema-first es la única fuente de verdad de tipos — no duplicar interfaces.
> - `noValidate` en el `<form>` — deshabilita validación nativa del browser (RHF la reemplaza).
> - `reset()` después de submit exitoso — sin esto el formulario mantiene el estado del último submit.
> - `mode: 'onTouched'` — mostrar errores cuando el usuario toca el campo, no en cada keystroke.
> - `key={field.id}` en useFieldArray — si se usa `key={index}`, React reutiliza el DOM node incorrecto al eliminar items del medio.
> - **`values` prop (no `defaultValues`)**: si el form debe reaccionar a datos externos del servidor, usar `values` en lugar de `defaultValues`. `defaultValues` se cachea; `values` reacciona a cambios externos. Verificado en docs RHF v7.
> - **`disabled` prop en `useForm`**: deshabilitar el formulario completo durante submit async con `disabled: isPending`. Verificado en docs RHF v7.
> - **Nunca poner `methods` de `useForm` entero en un `useEffect` dependency array** — causa infinite loops. Desestructurar solo los métodos necesarios: `const { reset } = useForm()` → `useEffect(() => { reset(...) }, [reset])`. Documentado en RHF v7 docs como warning explícito.

---

## 7. Axios — HTTP Client

`[Base]`

Ver `api-contract.md` §11 para la implementación completa del cliente con refresh token y mutex.

### Instancia con tipos

```typescript
// src/lib/api-client.ts — resumen del patrón completo
import axios from 'axios';
import { useAuthStore } from '@store/auth.store';
import { env } from '@/env';

export const apiClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  timeout: 30_000,
  withCredentials: true, // necesario para HttpOnly cookie del refresh token
});
```

### Request cancellation con AbortController

```typescript
// Útil en búsquedas con debounce — cancelar el request anterior
function useSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: (
      { signal }, // TanStack Query pasa signal automáticamente
    ) =>
      apiClient
        .get('/api/v1/items', {
          params: { search: debouncedQuery },
          signal, // AbortController signal — cancela si el componente se desmonta
        })
        .then((res) => res.data.data),
    enabled: debouncedQuery.length > 2,
  });
}
```

---

## 8. Routing — React Router v6

`[Base]`

### Definición de rutas con lazy loading

```tsx
// src/router/routes.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from '@components/layout/AppLayout';
import { AuthLayout } from '@components/layout/AuthLayout';
import { ProtectedRoute } from '@components/layout/ProtectedRoute';
import { queryClient } from '@lib/query-client';
import { itemQueries } from '@features/items/api/items.api';
import { Role } from '@/types/auth.types';

// Lazy loading — cada página es un chunk separado
const ItemsPage = lazy(() => import('@/pages/items/ItemsPage'));
const ItemDetailPage = lazy(() => import('@/pages/items/ItemDetailPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full mt-10">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

export const router = createBrowserRouter([
  // Layout de auth (sin sidebar)
  {
    element: <AuthLayout />,
    children: [
      {
        path: '/login',
        element: (
          <Suspense fallback={<PageLoader />}>
            <LoginPage />
          </Suspense>
        ),
      },
    ],
  },
  // Layout principal (con sidebar) — protegido
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: '/dashboard',
        element: (
          <Suspense fallback={<PageLoader />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: '/items',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ItemsPage />
          </Suspense>
        ),
      },
      {
        path: '/items/:id',
        // Loader: prefetch del detalle sin bloquear la navegación
        loader: ({ params }) => {
          queryClient.ensureQueryData(itemQueries.detail(params.id!));
          return null;
        },
        element: (
          <Suspense fallback={<PageLoader />}>
            <ItemDetailPage />
          </Suspense>
        ),
      },
      // Ruta protegida por rol
      {
        path: '/admin',
        element: (
          <ProtectedRoute requiredRole={Role.ROOT}>
            <Suspense fallback={<PageLoader />}>
              <AdminPage />
            </Suspense>
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
```

### URL como estado — search params

```typescript
// src/features/items/hooks/useItemFilters.ts
import { useSearchParams } from 'react-router-dom';

export function useItemFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = {
    search: searchParams.get('search') ?? '',
    status: searchParams.get('status') ?? '',
    page: parseInt(searchParams.get('page') ?? '1', 10),
    limit: parseInt(searchParams.get('limit') ?? '10', 10),
  };

  const setFilter = <K extends keyof typeof filters>(key: K, value: string | number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const isDefault =
          (key === 'page' && value === 1) || (key === 'limit' && value === 10) || value === '';
        if (isDefault) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
        return next;
      },
      { replace: true },
    ); // replace evita entradas de historial por cada keystroke
  };

  const resetFilters = () => setSearchParams({});

  return { filters, setFilter, resetFilters };
}

// Uso en componente:
// const { filters, setFilter } = useItemFilters();
// setFilter('search', 'john');   → URL: /items?search=john
// setFilter('page', 2);          → URL: /items?search=john&page=2
// URL sobrevive a F5 y se puede compartir como link
```

> **Gotchas**
>
> - `replace: true` en setSearchParams para filtros — evita que el botón "atrás" navegue por cada cambio de filtro.
> - `ensureQueryData` en loaders (no `prefetchQuery`) — retorna cache existente o fetcha, sin re-fetch si está fresco.
> - `<Suspense>` envolviendo cada lazy route — sin esto, React lanza un error si el chunk no cargó.

---

## 9. Error Handling

`[Base]`

### Error Boundaries por feature

```tsx
// src/components/ui/ErrorBoundary.tsx
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import * as Sentry from '@sentry/react';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div role="alert" className="p-6 text-center">
      <h3 className="text-lg font-semibold text-destructive mb-2">Algo salió mal</h3>
      <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
      <Button variant="outline" onClick={resetErrorBoundary}>
        Reintentar
      </Button>
    </div>
  );
}

// Wrapper que integra con Sentry
export function FeatureErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={ErrorFallback}
      onError={(error, componentStack) => {
        Sentry.captureException(error, { extra: { componentStack } });
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

// Uso por feature:
// <FeatureErrorBoundary>
//   <ItemsTable />
// </FeatureErrorBoundary>
```

### Error handling en mutations (sin duplicar con MutationCache)

```typescript
// Si necesitás acción específica en un error (ej: redirigir en 403)
const { mutate } = useDeleteItem({
  onError: (error: ApiError) => {
    if (error.statusCode === 403) {
      navigate('/forbidden');
    }
    // El MutationCache global ya mostró el toast — no duplicar
  },
});
```

---

## 10. TypeScript Patterns

`[Base]`

### Discriminated unions para estados de UI

```typescript
// src/types/async-state.types.ts
// Mejor que isLoading/isError/data separados — el tipo guía el uso correcto
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// En un componente:
function renderContent<T>(state: AsyncState<T>, render: (data: T) => React.ReactNode) {
  switch (state.status) {
    case 'idle': return null;
    case 'loading': return <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />;
    case 'error': return <div role="alert" className="text-sm text-destructive">{state.error.message}</div>;
    case 'success': return render(state.data);
  }
}
```

### Branded types para IDs

```typescript
// src/types/branded.types.ts
// Evita mezclar IDs de diferentes entidades
declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type ItemId = Brand<string, 'ItemId'>;
export type UserId = Brand<string, 'UserId'>;
export type OrgId = Brand<string, 'OrgId'>;

// Función de casteo seguro
export const asItemId = (id: string): ItemId => id as ItemId;
export const asUserId = (id: string): UserId => id as UserId;

// Uso:
// function deleteItem(id: ItemId): Promise<void>
// deleteItem(userId) → ✅ Error de TypeScript en compile time
```

### satisfies operator para validar sin perder tipo

```typescript
// satisfies valida la estructura sin widening del tipo
const ROUTES = {
  home: '/',
  items: '/items',
  itemDetail: (id: string) => `/items/${id}`,
  admin: '/admin',
} satisfies Record<string, string | ((id: string) => string)>;

// ROUTES.home es `'/'` (tipo literal) no `string`
// Si se agrega una propiedad inválida, TypeScript da error

// Useful para themes, config objects
const theme = {
  colors: { primary: '#1976d2', error: '#d32f2f' },
  spacing: { xs: 4, sm: 8, md: 16 },
} satisfies Record<string, Record<string, string | number>>;
```

### Type guards

```typescript
// src/types/api.types.ts
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  requestId?: string;
}

// Type guard — narrowing seguro
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'statusCode' in error
  );
}

// Uso en catch:
try {
  await apiClient.get('/items');
} catch (error) {
  if (isApiError(error)) {
    console.log(error.code); // tipado correctamente
  }
}
```

---

## 11. Performance

`[Tier 1]`

### Code splitting automático por ruta

Cubierto en §8 con `lazy()` por ruta. Cada ruta es un chunk separado de ~10-50KB.

### Lazy loading de componentes pesados

```tsx
// Chart libraries y otros componentes pesados
const LineChart = lazy(() => import('recharts').then((mod) => ({ default: mod.LineChart })));

// Usar con Suspense + shadcn Skeleton
import { Skeleton } from '@/components/ui/skeleton';

function ItemsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-md" />}>
      <LineChart data={chartData} />
    </Suspense>
  );
}
```

### Debounce en búsquedas

```tsx
function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [value, setValue] = React.useState('');
  const debouncedValue = useDebounce(value, 300);

  React.useEffect(() => {
    onSearch(debouncedValue);
  }, [debouncedValue, onSearch]);

  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <ShadcnInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar..."
        className="pl-9 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <ClearIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

### Virtualización con TanStack Virtual

```tsx
// src/features/items/components/VirtualItemList.tsx
// Usar cuando hay > 500 items en una lista
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualItemList({ items }: { items: Item[] }) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // altura estimada por ítem en px
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ItemRow item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

> **Gotchas**
>
> - Medir antes de optimizar — React DevTools Profiler primero.
> - Virtualizar cuando > 200-500 items en lista o tabla visible.
> - Debounce de 300ms es el estándar para búsqueda — menos molesta al usuario que 500ms.

---

## 12. Tablas de Datos

`[Tier 1]`

shadcn/ui + TanStack Table v8 es el enfoque recomendado para tablas en proyectos React admin. Ver `frontend-stack.md` §5 para la decisión completa.

### shadcn Table + TanStack Table v8 (server-side)

Para tablas server-side con sorting, filtering y paginación.

```tsx
// src/features/items/components/ItemsTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'; // shadcn table component
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGetItems } from '../hooks/useGetItems';
import { useItemFilters } from '../hooks/useItemFilters';

const columns: ColumnDef<Item>[] = [
  {
    accessorKey: 'name',
    header: 'Nombre',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ getValue }) => {
      const status = getValue<string>();
      return (
        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
          {status === 'active' ? 'Activo' : 'Inactivo'}
        </Badge>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <ItemActions item={row.original} />,
  },
];

export function ItemsTable() {
  const { filters, setFilter } = useItemFilters();
  const { data, isPending } = useGetItems(filters);

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Server-side — no usar getFilteredRowModel ni getSortedRowModel
    manualPagination: true,
    manualSorting: true,
    rowCount: data?.meta.total ?? 0,
    state: {
      pagination: { pageIndex: filters.page - 1, pageSize: filters.limit },
      sorting: filters.sortBy
        ? [{ id: filters.sortBy, desc: filters.sortDirection === 'desc' }]
        : [],
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: filters.page - 1, pageSize: filters.limit })
          : updater;
      setFilter('page', next.pageIndex + 1);
      setFilter('limit', next.pageSize);
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater([]) : updater;
      if (next[0]) {
        setFilter('sortBy', next[0].id);
        setFilter('sortDirection', next[0].desc ? 'desc' : 'asc');
      }
    },
  });

  if (isPending) return <TableSkeleton />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Paginación con shadcn */}
      <div className="flex items-center justify-between px-4 py-2 border-t">
        <span className="text-sm text-muted-foreground">{data?.meta.total ?? 0} registros</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.meta.hasPreviousPage}
            onClick={() => table.previousPage()}
          >
            Anterior
          </Button>
          <span className="text-sm py-1">
            {filters.page} / {data?.meta.totalPages ?? 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.meta.hasNextPage}
            onClick={() => table.nextPage()}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
```

> **Para virtualización de miles de filas**: usar `@tanstack/react-virtual`.

---

## 13. Auth — ProtectedRoute y RBAC

`[Base]`

### ProtectedRoute component

```tsx
// src/components/layout/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@store/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, hasRole } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    // Guardar la URL para redirigir después del login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
```

### RBAC — renderizado condicional por rol

```tsx
// src/components/ui/RoleGuard.tsx
interface RoleGuardProps {
  roles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ roles, children, fallback = null }: RoleGuardProps) {
  const hasRole = useAuthStore((state) => state.hasRole);
  const hasAccess = roles.some(hasRole);
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Hook para uso programático
export function useHasRole(role: string) {
  return useAuthStore((state) => state.hasRole(role));
}

// Uso:
// <RoleGuard roles={[Role.ADMIN, Role.ROOT]}>
//   <DeleteButton />
// </RoleGuard>
//
// const canDelete = useHasRole(Role.ADMIN);
```

### Redirect a la URL original después del login

```tsx
// src/pages/auth/LoginPage.tsx
import { useNavigate, useLocation } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard';

  const { mutate: login } = useLogin({
    onSuccess: () => navigate(from, { replace: true }),
  });

  // ...
}
```

---

## 14. Variables de Entorno

`[Base]`

```typescript
// src/env.ts
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  client: {
    VITE_API_BASE_URL: z.string().url('API base URL must be a valid URL'),
    VITE_SENTRY_DSN: z.string().optional(),
    VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  },
  clientPrefix: 'VITE_',
  runtimeEnv: import.meta.env,
  // emptyStringAsUndefined: true, // tratar strings vacíos como undefined
});

// Uso (tipado completo):
// import { env } from '@/env';
// env.VITE_API_BASE_URL  → string
// env.VITE_SENTRY_DSN    → string | undefined
// env.VITE_APP_ENV       → 'development' | 'staging' | 'production'
```

```
# .env.example
VITE_API_BASE_URL=http://localhost:3000
VITE_SENTRY_DSN=                  # opcional
VITE_APP_ENV=development
```

---

## 15. Testing Patterns

`[Base]`

### Setup de Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { statements: 70, branches: 50, functions: 70, lines: 70 },
      exclude: ['src/test/**', 'src/**/*.types.ts', 'src/env.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

```typescript
// src/test/setup.ts — setup verificado contra docs MSW v2 (nov 2025)
import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './msw/node'; // MSW node server

// Orden exacto según docs MSW v2: beforeAll → afterEach → afterAll
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers()); // resetear handlers entre tests
afterAll(() => server.close());
```

### Custom render con todos los providers

```tsx
// src/test/test-utils.tsx
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// QueryClient fresco por test — no comparte caché entre tests
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  queryClient?: QueryClient;
}

export function render(
  ui: React.ReactElement,
  { initialEntries = ['/'], queryClient, ...options }: CustomRenderOptions = {},
) {
  const testQueryClient = queryClient ?? createTestQueryClient();

  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={initialEntries}>
        <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    ),
    ...options,
  });
}

export * from '@testing-library/react';
export { userEvent } from '@testing-library/user-event';
```

### MSW v2 — setup verificado (docs nov 2025)

```typescript
// src/mocks/handlers.ts — handlers por feature
import { http, HttpResponse } from 'msw';

// ✅ Simular exactamente el envelope del backend { data, meta }
const mockItem = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Item',
  email: 'test@example.com',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const itemHandlers = [
  http.get('*/api/v1/items', () =>
    HttpResponse.json({
      data: [mockItem],
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }),
  ),

  http.get('*/api/v1/items/:id', ({ params }) =>
    HttpResponse.json({ data: { ...mockItem, id: params.id as string } }),
  ),

  http.post('*/api/v1/items', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ data: { ...mockItem, ...body } }, { status: 201 });
  }),

  http.delete('*/api/v1/items/:id', () => new HttpResponse(null, { status: 204 })),
];

export const handlers = [...itemHandlers];

// src/mocks/node.ts — integración para Node.js / Vitest
// (archivo separado del browser worker — permite reutilizar handlers)
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);

// src/mocks/browser.ts — integración para browser (si se necesita)
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
export const worker = setupWorker(...handlers);
```

> **Gotcha MSW v2**: Los archivos `node.ts` y `browser.ts` son separados pero usan los mismos `handlers`.
> El `server` de `msw/node` intercepta en Node (Vitest); el `worker` de `msw/browser` intercepta en el browser (dev tool).

### Test de componente con TanStack Query

```tsx
// src/features/items/__tests__/ItemsTable.test.tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/test-utils';
import { ItemsTable } from '../components/ItemsTable';

describe('ItemsTable', () => {
  it('muestra los items cuando la query carga', async () => {
    render(<ItemsTable />);

    // Esperar que el loading desaparezca y los datos aparezcan
    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('muestra un skeleton mientras carga', () => {
    render(<ItemsTable />);
    // El loading state es inmediato
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

### Test de formulario

```tsx
// src/features/items/__tests__/ItemForm.test.tsx
import { server } from '@/test/msw/server';
import { http, HttpResponse } from 'msw';

describe('ItemForm', () => {
  it('crea un item con datos válidos', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<ItemForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Nombre'), 'New Item');
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Crear Item' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it('muestra error de validación para email inválido', async () => {
    const user = userEvent.setup();
    render(<ItemForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.tab(); // triggear onBlur

    expect(await screen.findByText('Email inválido')).toBeInTheDocument();
  });

  it('maneja errores del servidor', async () => {
    server.use(
      http.post('*/api/v1/items', () =>
        HttpResponse.json(
          { error: { code: 'ITEM_002', message: 'Item already exists', statusCode: 409 } },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    render(<ItemForm />);

    await user.type(screen.getByLabelText('Nombre'), 'Existing Item');
    await user.type(screen.getByLabelText('Email'), 'existing@example.com');
    await user.click(screen.getByRole('button', { name: 'Crear Item' }));

    // El toast de error aparece (sonner)
    await waitFor(() => {
      expect(screen.getByText('Item already exists')).toBeInTheDocument();
    });
  });
});
```

### Factory de test data con faker

```typescript
// src/test/factories/item.factory.ts
import { faker } from '@faker-js/faker';
import type { Item } from '@features/items/types/item.types';

export function createMockItem(overrides: Partial<Item> = {}): Item {
  return {
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    email: faker.internet.email(),
    status: faker.helpers.arrayElement(['active', 'inactive'] as const),
    createdAt: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function createMockItems(count: number, overrides: Partial<Item> = {}): Item[] {
  return Array.from({ length: count }, () => createMockItem(overrides));
}

// Uso en tests:
// const items = createMockItems(5);
// const activeItem = createMockItem({ status: 'active' });
```

> **Gotchas**
>
> - `QueryClient` fresco por test — si se comparte, los tests se contaminan entre sí.
> - `onUnhandledRequest: 'error'` en MSW — hace fallar el test si hay un request no mockeado (detecta cambios de API).
> - `server.resetHandlers()` en `afterEach` — los overrides de un test no deben afectar al siguiente.
> - `waitFor()` para assertions asíncronas — sin esto los tests fallan antes de que TanStack Query resuelva.
> - MSW handlers deben replicar exactamente el envelope `{ data, meta }` del backend — si difieren, los tests pasan pero prod falla.

---

## 16. Accesibilidad

`[Base]`

### Focus management en dialogs

```tsx
// src/features/items/components/DeleteItemDialog.tsx
// shadcn Dialog usa Radix UI Dialog bajo el capó — el focus management es automático
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DeleteItemDialog({ open, onClose, onConfirm }: DeleteItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar eliminación</DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. ¿Confirmas la eliminación?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Radix UI mueve el focus automáticamente al primer elemento interactivo */}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Notificaciones accesibles con aria-live

```tsx
// sonner ya maneja aria-live internamente
// Para notificaciones custom:
function StatusMessage({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      role="status" // aria-live="polite" implícito
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
```

### Formularios accesibles

```tsx
// Siempre asociar label con input explícitamente
// shadcn Label + Input con htmlFor explícito
<div className="space-y-1">
  <Label htmlFor="email" aria-required="true">Email</Label>
  <ShadcnInput
    id="email"
    type="email"
    autoComplete="email"
    aria-required="true"
    aria-describedby={errors.email ? 'email-error' : undefined}
    className={cn(errors.email && 'border-destructive')}
  />
  {errors.email && (
    <p id="email-error" className="text-sm text-destructive" role="alert">
      {errors.email.message}
    </p>
  )}
</div>

// Para campos requeridos visibles
<Label required>Nombre</Label>
// El indicador de requerido debe tener aria-hidden="true" — shadcn Label lo gestiona via Radix
```

---

## 17. Bootstrap — main.tsx

`[Base]`

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import * as Sentry from '@sentry/react';
import { queryClient } from '@lib/query-client';
import { router } from '@/router/routes';

// Inicializar Sentry antes de todo
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_APP_ENV,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: import.meta.env.VITE_APP_ENV === 'production' ? 0.1 : 1.0,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
});

// Providers cascade — el orden importa
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors closeButton />
      {import.meta.env.DEV && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

---

## 18. Checklist de Setup Inicial

### Estructura y configuración

- [ ] Estructura feature-based: `src/features/`, `src/components/`, `src/store/`, `src/lib/`, `src/pages/`, `src/types/`
- [ ] Path aliases en `tsconfig.app.json` + `vite.config.ts` (`@/*`, `@features/*`, etc.)
- [ ] `src/env.ts` con `@t3-oss/env-core` + Zod — variables tipadas y validadas al startup
- [ ] `.env.example` completo con todas las variables

### HTTP y Server State

- [ ] `src/lib/api-client.ts` — instancia Axios con interceptors de auth + refresh token (mutex) + normalización de errores
- [ ] `src/lib/query-client.ts` — `QueryClient` con `MutationCache` global para errores + `defaultOptions`
- [ ] `src/types/api.types.ts` — `ApiEnvelope<T>`, `PaginatedMeta`, `ApiError`
- [ ] Pattern `queryOptions` factory en cada feature (`src/features/{name}/api/{name}.api.ts`)

### Client State

- [ ] `src/store/auth.store.ts` — Zustand con `devtools` + `immer` (NO persist para accessToken)
- [ ] `src/store/ui.store.ts` — Zustand con `devtools` + `persist` + `immer`

### Formularios

- [ ] `zodResolver` como resolver global para react-hook-form
- [ ] Schemas en `src/features/{name}/schemas/` con tipos inferidos via `z.infer<>`

### Routing y Auth

- [ ] `src/components/layout/ProtectedRoute.tsx` — redirect a `/login` si no autenticado
- [ ] `src/components/ui/RoleGuard.tsx` — renderizado condicional por rol
- [ ] Lazy loading en todas las rutas con `React.lazy()` + `<Suspense>`
- [ ] `useItemFilters` pattern — URL como estado para filtros de listados

### Error Handling

- [ ] `<FeatureErrorBoundary>` wrapeando secciones principales de la app
- [ ] Error pages: `/login?reason=session_expired`, `/forbidden`, `/404`

### Testing

- [ ] `vitest.config.ts` con coverage thresholds (70% lines)
- [ ] `src/test/test-utils.tsx` — `render` custom con todos los providers
- [ ] `src/test/msw/server.ts` + handlers por feature
- [ ] `src/test/setup.ts` — MSW server lifecycle + `@testing-library/jest-dom`
- [ ] Factories con `@faker-js/faker` por feature

### Bootstrap

- [ ] `src/main.tsx` con Sentry init + providers en orden correcto
- [ ] `<ReactQueryDevtools />` solo en `DEV`
- [ ] `<Toaster />` de sonner configurado
- [ ] `tailwind.css` importado en `main.tsx` (reset CSS via Tailwind preflight)

---

---

## 19. Real-time: SSE y WebSockets [Tier 2]

### Opción A: Server-Sent Events con hook personalizado

```typescript
// hooks/useSSE.ts
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';

interface SSEOptions<T> {
  url: string;
  onMessage: (data: T) => void;
  onError?: (error: Event) => void;
  enabled?: boolean;
}

export function useSSE<T>({ url, onMessage, onError, enabled = true }: SSEOptions<T>) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  const connect = useCallback(() => {
    if (!enabled || !accessToken) return;

    // Pasar el token como query param (SSE no soporta headers custom)
    const sseUrl = `${url}?token=${accessToken}`;
    const eventSource = new EventSource(sseUrl, { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        onMessage(data);
      } catch {
        console.error('SSE parse error', event.data);
      }
    };

    eventSource.onerror = (error) => {
      onError?.(error);
      // Reconectar automáticamente después de 5s si la conexión se cierra
      eventSource.close();
      setTimeout(connect, 5000);
    };

    eventSourceRef.current = eventSource;
  }, [url, accessToken, onMessage, onError, enabled]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);
}

// Uso:
// useSSE<Notification>({
//   url: '/api/v1/notifications/stream',
//   onMessage: (notification) => addNotification(notification),
// });
```

### Integración SSE con Zustand (notificaciones globales)

```typescript
// store/notifications.store.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsStore {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

export const useNotificationsStore = create<NotificationsStore>()(
  immer((set) => ({
    notifications: [],
    unreadCount: 0,

    addNotification: (notification) =>
      set((state) => {
        state.notifications.unshift(notification);
        if (!notification.read) state.unreadCount += 1;
      }),

    markAsRead: (id) =>
      set((state) => {
        const n = state.notifications.find((n) => n.id === id);
        if (n && !n.read) {
          n.read = true;
          state.unreadCount -= 1;
        }
      }),

    markAllAsRead: () =>
      set((state) => {
        state.notifications.forEach((n) => (n.read = true));
        state.unreadCount = 0;
      }),
  })),
);
```

```typescript
// Conectar SSE en el layout principal (una sola vez)
// app/dashboard/layout.tsx o similar
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const addNotification = useNotificationsStore((s) => s.addNotification);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useSSE<Notification>({
    url: '/api/v1/notifications/stream',
    onMessage: addNotification,
    enabled: isAuthenticated,
  });

  return <>{children}</>;
}
```

### Opción B: WebSockets con socket.io-client

```typescript
// lib/socket.ts — singleton de la conexión
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(`${process.env.NEXT_PUBLIC_API_URL}/ws`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
```

```typescript
// hooks/useSocket.ts
import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';

export function useSocket<T>(event: string, handler: (data: T) => void) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    socketRef.current = getSocket(accessToken);
    socketRef.current.on(event, handler);

    return () => {
      socketRef.current?.off(event, handler);
    };
  }, [event, handler, accessToken]);
}

// Uso:
// useSocket<Message>('message', (msg) => addMessage(msg));
```

> 📌 **SSE vs WebSockets en el cliente**: SSE usa `EventSource` nativo del browser — sin dependencias extra. WebSockets requiere `socket.io-client` (~45KB). Para notificaciones unidireccionales, preferir SSE siempre.

---

## 20. RBAC en UI: Permisos granulares en componentes [Tier 2]

> Complemento del RBAC del backend. El frontend debe ocultar/deshabilitar elementos según los permisos del usuario — no como seguridad (la seguridad real está en el backend), sino como UX.

### Hook usePermissions

```typescript
// hooks/usePermissions.ts
import { useAuthStore } from '@/store/auth.store';

type Role = 'ROOT' | 'ADMIN' | 'USER';
type Action = 'read' | 'create' | 'update' | 'delete' | 'manage';
type Resource = 'orders' | 'users' | 'products' | 'reports' | string;

// Matriz de permisos por rol
const PERMISSIONS: Record<Role, Record<Resource, Action[]>> = {
  ROOT: {
    orders: ['read', 'create', 'update', 'delete', 'manage'],
    users: ['read', 'create', 'update', 'delete', 'manage'],
    products: ['read', 'create', 'update', 'delete', 'manage'],
    reports: ['read', 'manage'],
  },
  ADMIN: {
    orders: ['read', 'create', 'update', 'delete'],
    users: ['read', 'create', 'update'],
    products: ['read', 'create', 'update'],
    reports: ['read'],
  },
  USER: {
    orders: ['read', 'create'],
    users: ['read'],
    products: ['read'],
    reports: [],
  },
};

export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role as Role);

  const can = (action: Action, resource: Resource): boolean => {
    if (!role) return false;
    const permissions = PERMISSIONS[role]?.[resource] ?? [];
    return permissions.includes(action) || permissions.includes('manage');
  };

  const cannot = (action: Action, resource: Resource): boolean => !can(action, resource);

  return { can, cannot, role };
}
```

### Componente Can

```typescript
// components/ui/can.tsx
import { usePermissions } from '@/hooks/usePermissions';

type Action = 'read' | 'create' | 'update' | 'delete' | 'manage';

interface CanProps {
  action: Action;
  resource: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Can({ action, resource, children, fallback = null }: CanProps) {
  const { can } = usePermissions();
  return can(action, resource) ? <>{children}</> : <>{fallback}</>;
}

// Uso:
// <Can action="delete" resource="orders">
//   <Button variant="destructive">Eliminar orden</Button>
// </Can>
//
// Con fallback:
// <Can action="create" resource="users" fallback={<Tooltip content="Sin permisos"><Button disabled>Agregar usuario</Button></Tooltip>}>
//   <Button>Agregar usuario</Button>
// </Can>
```

### Integración con rutas protegidas

```typescript
// components/protected-route.tsx — extender el existente con roles
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
  requiredPermission?: { action: Action; resource: string };
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredPermission,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuthStore();
  const { can } = usePermissions();

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (requiredRole && !hasRole(user?.role, requiredRole)) {
    return <Navigate to="/403" replace />;
  }

  if (requiredPermission && !can(requiredPermission.action, requiredPermission.resource)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}

// Uso en el router:
// <ProtectedRoute requiredPermission={{ action: 'manage', resource: 'users' }}>
//   <UsersManagementPage />
// </ProtectedRoute>
```

### Deshabilitar elementos vs ocultarlos

```typescript
// Preferir deshabilitar sobre ocultar cuando la acción es posible para otros roles
// — da contexto al usuario de que existe la funcionalidad pero no tiene acceso

const { can } = usePermissions();
const canDelete = can('delete', 'orders');

// ✅ Deshabilitar con tooltip explicativo
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="destructive"
        disabled={!canDelete}
        onClick={() => handleDelete(id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    {!canDelete && (
      <TooltipContent>No tenés permisos para eliminar órdenes</TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

> ⚠️ **Seguridad**: El RBAC en el frontend es SOLO UX — nunca seguridad. Un usuario con DevTools puede saltear cualquier check del frontend. La seguridad real está en los Guards y las Policy checks del backend.

---

_Mantener actualizado al establecer nuevos patrones en el proyecto._
_Última actualización: 2026-03-19_
