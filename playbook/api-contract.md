# API Contract — Backend ↔ Frontend

> **Propósito:** Fuente de verdad del contrato de comunicación entre el backend NestJS y el frontend React.
> Define envelopes de respuesta, estructura de errores, autenticación, paginación y headers requeridos.
> Cualquier cambio en el backend que afecte este contrato debe reflejarse aquí primero.
> Ver `backend-patterns.md` para implementaciones server-side. Ver `frontend-stack.md` para implementaciones client-side.
> Última actualización: 2026-03-19

---

## Tabla de Contenidos

1. [Base URL y Versionado](#1-base-url-y-versionado)
2. [Envelope de Respuesta Exitosa](#2-envelope-de-respuesta-exitosa)
3. [Paginación](#3-paginación)
4. [Estructura de Errores](#4-estructura-de-errores)
5. [Códigos de Error](#5-códigos-de-error)
6. [Autenticación — JWT Bearer](#6-autenticación--jwt-bearer)
7. [Refresh Token — HttpOnly Cookie](#7-refresh-token--httponly-cookie)
8. [Headers](#8-headers)
9. [HTTP Status Codes usados](#9-http-status-codes-usados)
10. [Flujo de Auth Completo](#10-flujo-de-auth-completo)
11. [Configuración del cliente Axios](#11-configuración-del-cliente-axios)
12. [Configuración de TanStack Query](#12-configuración-de-tanstack-query)
13. [Auth Endpoints](#13-auth-endpoints)

---

## 1. Base URL y Versionado

```
Base URL:    https://api.example.com
Prefijo:     /api
Versión:     /v1  (en el path del controller — no URI versioning global de NestJS)

URL final:   https://api.example.com/api/v1/{recurso}

Ejemplos:
  GET  /api/v1/items
  POST /api/v1/items
  GET  /api/v1/items/:id
  GET  /api/health          ← sin /api en health por exclusión explícita
  GET  /api/docs            ← Swagger UI (solo non-production)
```

> Nunca hardcodear la base URL en el cliente. Usar `VITE_API_BASE_URL` como variable de entorno.

---

## 2. Envelope de Respuesta Exitosa

Todas las respuestas exitosas (2xx con body) siguen el mismo envelope `{ data, meta }`.

### Recurso único (GET /:id, POST, PATCH)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Item",
    "email": "user@example.com",
    "status": "active",
    "createdAt": "2026-01-01T12:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-01T12:00:00.123Z",
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

### Colección sin paginación (GET / sin query params de página)

```json
{
  "data": [ { "id": "...", "name": "..." }, { "..." } ],
  "meta": {
    "total": 5,
    "timestamp": "2026-01-01T12:00:00.123Z",
    "requestId": "f47ac10b-..."
  }
}
```

### Colección paginada (GET / con ?page=&limit=)

```json
{
  "data": [{ "id": "...", "name": "..." }],
  "meta": {
    "total": 142,
    "page": 2,
    "limit": 10,
    "totalPages": 15,
    "hasNextPage": true,
    "hasPreviousPage": true,
    "timestamp": "2026-01-01T12:00:00.123Z",
    "requestId": "f47ac10b-..."
  }
}
```

### DELETE exitoso

```
HTTP 204 No Content — sin body
```

> **Regla de oro para el frontend**: nunca acceder directamente a `response.data` de Axios.
> La respuesta de Axios tiene `response.data.data` (el recurso) y `response.data.meta` (metadatos).
> Usar `select` en TanStack Query para hacer el unwrap. Ver §12.

---

## 3. Paginación

### Query params del request

| Param           | Tipo            | Default     | Máximo | Descripción               |
| --------------- | --------------- | ----------- | ------ | ------------------------- |
| `page`          | integer         | 1           | —      | Número de página (base 1) |
| `limit`         | integer         | 10          | 100    | Items por página          |
| `sortBy`        | string          | `createdAt` | —      | Campo de ordenamiento     |
| `sortDirection` | `asc` \| `desc` | `desc`      | —      | Dirección de ordenamiento |

```
GET /api/v1/items?page=2&limit=20&sortBy=name&sortDirection=asc
```

### Campos de meta de paginación

| Campo             | Tipo    | Descripción                                |
| ----------------- | ------- | ------------------------------------------ |
| `total`           | integer | Total de registros que cumplen los filtros |
| `page`            | integer | Página actual                              |
| `limit`           | integer | Items por página solicitados               |
| `totalPages`      | integer | `Math.ceil(total / limit)`                 |
| `hasNextPage`     | boolean | `page < totalPages`                        |
| `hasPreviousPage` | boolean | `page > 1`                                 |

> `hasNextPage` y `hasPreviousPage` ya están calculados por el backend — no recalcular en el frontend.

---

## 4. Estructura de Errores

Todos los errores siguen el mismo envelope `{ error: { ... } }`:

```json
{
  "error": {
    "code": "ITEM_001",
    "message": "Item not found",
    "statusCode": 404,
    "details": null,
    "timestamp": "2026-01-01T12:00:00.123Z",
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "path": "/api/v1/items/invalid-id"
  }
}
```

### Error de validación (422)

```json
{
  "error": {
    "code": "VAL_001",
    "message": "name must not be empty; email must be a valid email",
    "statusCode": 422,
    "details": {
      "fields": ["name", "email"]
    },
    "timestamp": "2026-01-01T12:00:00.123Z",
    "requestId": "f47ac10b-...",
    "path": "/api/v1/items"
  }
}
```

### Error interno (500)

```json
{
  "error": {
    "code": "SYS_001",
    "message": "Internal server error",
    "statusCode": 500,
    "details": null,
    "timestamp": "2026-01-01T12:00:00.123Z",
    "requestId": "f47ac10b-...",
    "path": "/api/v1/items"
  }
}
```

> En producción, los errores 500 **nunca** exponen el stack trace ni el mensaje interno.
> El `details` de errores 500 siempre es `null` en producción.

### Acceso al error en el cliente Axios

```typescript
// El interceptor de Axios normaliza el error para que el cliente lo consuma directamente
// error.response.data.error.code     → 'ITEM_001'
// error.response.data.error.message  → 'Item not found'
// error.response.data.error.requestId → para correlación con logs del backend

// ❌ Incorrecto — patrón Express genérico
const message = error.response.data.message; // undefined

// ✅ Correcto — patrón de este backend
const { code, message, requestId } = error.response.data.error;
```

---

## 5. Códigos de Error

Formato: `{DOMINIO}_{NNN}` — permite al frontend identificar el dominio sin inspeccionar el mensaje.

| Código     | Status HTTP | Descripción              | Acción recomendada en frontend                   |
| ---------- | ----------- | ------------------------ | ------------------------------------------------ |
| `VAL_001`  | 422         | Error de validación      | Mostrar mensajes de campo desde `details.fields` |
| `AUTH_001` | 401         | Credenciales inválidas   | Mostrar error en form de login                   |
| `AUTH_002` | 401         | No autenticado           | Redirigir a `/login`                             |
| `AUTH_003` | 403         | Cuenta suspendida        | Mostrar mensaje y logout                         |
| `AUTH_004` | 401         | Token expirado           | Intentar refresh automático                      |
| `AUTH_005` | 401         | Firma de token inválida  | Logout + redirigir a `/login`                    |
| `RATE_001` | 429         | Rate limit excedido      | Mostrar "Too many requests" + backoff            |
| `SYS_001`  | 500         | Error interno            | Toast genérico + log en Sentry con `requestId`   |
| `HTTP_403` | 403         | Forbidden (sin permisos) | Mostrar página 403                               |
| `HTTP_404` | 404         | Not found genérico       | Mostrar página 404                               |

> Los códigos de dominio específicos (`ITEM_001`, `USER_001`, etc.) se definen por proyecto
> en `src/common/constants/error-codes.ts` del backend.

---

## 6. Autenticación — JWT Bearer

### Algoritmo

RS256 — el backend verifica con la clave pública. La clave privada (para firmar) vive en el auth server o en el backend según la arquitectura.

### Envío del token

```
Authorization: Bearer <access_token>
```

### Payload del JWT

```typescript
interface JwtPayload {
  sub: string; // userId — usar como identificador
  email: string;
  roles?: string[]; // ['ADMIN', 'ROOT', etc.] — usados por RolesGuard del backend
  iss: string; // issuer
  aud: string; // audience
  exp: number; // Unix timestamp de expiración
  iat: number; // Unix timestamp de emisión
}
```

### TTL

- **Access token**: 15 minutos (configurable via `JWT_ACCESS_TTL`)
- **Refresh token**: 7 días en HttpOnly cookie

### Store de auth recomendado (Zustand)

```typescript
// src/store/auth.store.ts
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: {
    sub: string;
    email: string;
    roles: string[];
  } | null;
  setAuth: (token: string, payload: JwtPayload) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  setAuth: (token, payload) =>
    set({
      accessToken: token,
      user: { sub: payload.sub, email: payload.email, roles: payload.roles ?? [] },
    }),
  logout: () => set({ accessToken: null, user: null }),
}));
// En memoria — no persistir el access token en localStorage
```

---

## 7. Refresh Token — HttpOnly Cookie

El refresh token viaja en una cookie HttpOnly, configurada por el backend:

```
Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800
```

### Flujo de refresh

```
1. Request falla con 401
2. Axios interceptor detecta 401 + flag _retry=false
3. POST /api/v1/auth/refresh  ← la cookie se envía automáticamente (withCredentials: true)
4. Backend valida refresh token, retorna nuevo access token en body
5. Interceptor actualiza el store de auth con el nuevo token
6. Reintentar el request original
7. Si el refresh también falla → logout + redirect /login
```

### Prevención de race condition (múltiples 401 simultáneos)

```typescript
// src/lib/api-client.ts
let refreshPromise: Promise<void> | null = null;

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  if (error.response?.status !== 401 || error.config?._retry) {
    return Promise.reject(normalizeError(error));
  }
  error.config._retry = true;

  // Serializar: si ya hay un refresh en curso, esperar al mismo promise
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/api/v1/auth/refresh')
      .then((res) => {
        useAuthStore.getState().setAuth(res.data.data.accessToken, res.data.data.user);
      })
      .catch(() => {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  await refreshPromise;
  return apiClient(error.config);
});
```

---

## 8. Headers

### Headers que el frontend debe enviar

| Header            | Valor                           | Cuándo                                        |
| ----------------- | ------------------------------- | --------------------------------------------- |
| `Authorization`   | `Bearer <access_token>`         | Todos los requests autenticados               |
| `Content-Type`    | `application/json`              | Requests con body (POST, PATCH)               |
| `x-request-id`    | UUID v4 generado por el cliente | Opcional — mejora correlación de logs         |
| `withCredentials` | `true` (opción Axios)           | Siempre — necesario para la cookie de refresh |

### Headers que el backend retorna

| Header         | Valor                             | Significado                                                |
| -------------- | --------------------------------- | ---------------------------------------------------------- |
| `x-request-id` | UUID v4                           | ID único de este request — incluirlo en reportes de Sentry |
| `Content-Type` | `application/json; charset=utf-8` | —                                                          |

### Propagación de X-Request-ID a Sentry

```typescript
apiClient.interceptors.response.use(undefined, (error: AxiosError) => {
  const requestId = (error.response?.data as any)?.error?.requestId;
  if (requestId) {
    Sentry.setTag('backend.requestId', requestId);
    // Ahora el error de Sentry está correlacionado con el log del backend
  }
  return Promise.reject(normalizeError(error));
});
```

---

## 9. HTTP Status Codes usados

| Status                      | Cuándo                                        |
| --------------------------- | --------------------------------------------- |
| `200 OK`                    | GET, PATCH exitosos                           |
| `201 Created`               | POST exitoso que crea un recurso              |
| `204 No Content`            | DELETE exitoso — sin body                     |
| `400 Bad Request`           | Error genérico de request malformado          |
| `401 Unauthorized`          | Token ausente, expirado o inválido            |
| `403 Forbidden`             | Token válido pero sin permisos para la acción |
| `404 Not Found`             | Recurso no encontrado                         |
| `422 Unprocessable Entity`  | Error de validación (`VAL_001`)               |
| `429 Too Many Requests`     | Rate limit excedido (`RATE_001`)              |
| `500 Internal Server Error` | Error inesperado del servidor                 |
| `503 Service Unavailable`   | App en shutdown (graceful shutdown activo)    |

---

## 10. Flujo de Auth Completo

```
┌─────────────────────────────────────────────────────────────────┐
│ Login                                                           │
│                                                                 │
│  1. POST /api/v1/auth/login  { email, password }               │
│     ← 200 { data: { accessToken, user } }                      │
│        + Set-Cookie: refresh_token=... (HttpOnly)              │
│  2. Store: setAuth(accessToken, user)                          │
│  3. Redirigir a /dashboard                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Request autenticado                                             │
│                                                                 │
│  1. Axios interceptor agrega Bearer token                      │
│  2. GET /api/v1/items → 200 { data: [...], meta: {...} }       │
│  3. TanStack Query hace select: unwrap data + meta             │
│  4. Componente recibe { items, meta }                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Token expirado (silencioso)                                     │
│                                                                 │
│  1. Request → 401 AUTH_004 (token expired)                     │
│  2. Interceptor: POST /api/v1/auth/refresh (cookie auto)       │
│     ← 200 { data: { accessToken } }                            │
│  3. Store: setAuth(newToken)                                    │
│  4. Reintentar request original → éxito                        │
│  5. Usuario no nota nada                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Refresh fallido (sesión caducada)                               │
│                                                                 │
│  1. POST /api/v1/auth/refresh → 401                            │
│  2. store.logout()                                              │
│  3. Redirigir a /login con ?reason=session_expired             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Logout                                                          │
│                                                                 │
│  1. POST /api/v1/auth/logout                                   │
│     Backend invalida refresh token + limpia cookie             │
│  2. store.logout()                                              │
│  3. Redirigir a /login                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Configuración del cliente Axios

```typescript
// src/lib/api-client.ts
import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import * as Sentry from '@sentry/react';

// Type augmentation para Axios — _retry no existe en el tipo base
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

// Tipo normalizado de error — lo que el frontend siempre recibe
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  requestId?: string;
  details?: Record<string, unknown>;
}

function normalizeError(error: AxiosError): ApiError {
  const backendError = (error.response?.data as any)?.error;
  return {
    code: backendError?.code ?? 'NETWORK_ERROR',
    message: backendError?.message ?? error.message ?? 'Unknown error',
    statusCode: error.response?.status ?? 0,
    requestId: backendError?.requestId,
    details: backendError?.details,
  };
}

let refreshPromise: Promise<void> | null = null;

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30_000,
  withCredentials: true,
});

// Request: inyectar Bearer token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: refresh + normalización de errores
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const apiError = normalizeError(error);

    // Correlacionar errores con logs del backend en Sentry
    if (apiError.requestId) {
      Sentry.setTag('backend.requestId', apiError.requestId);
    }

    // Refresh automático en 401
    if (error.response?.status === 401 && !error.config?._retry) {
      error.config._retry = true;

      if (!refreshPromise) {
        refreshPromise = apiClient
          .post<{ data: { accessToken: string; user: JwtPayload } }>('/api/v1/auth/refresh') // import type { JwtPayload } from '@/types/auth'; // ← definir en el proyecto
          .then((res) => {
            useAuthStore.getState().setAuth(res.data.data.accessToken, res.data.data.user);
          })
          .catch(() => {
            useAuthStore.getState().logout();
            window.location.href = '/login?reason=session_expired';
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      await refreshPromise;
      return apiClient(error.config);
    }

    return Promise.reject(apiError);
  },
);
```

> ⚠️ **CORS y withCredentials**: El uso de `withCredentials: true` requiere que el backend tenga configurado:
> - `Access-Control-Allow-Origin`: debe ser el origen exacto (no `*`) cuando se envían credenciales
> - `Access-Control-Allow-Credentials: true`
> - El preflight (OPTIONS) debe responder con los headers correctos
>
> En desarrollo, el proxy de Next.js/Vite evita el CORS. En producción, el backend debe tener el origen del frontend en la whitelist de CORS.

---

## 12. Configuración de TanStack Query

```typescript
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiError } from '@/lib/api-client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: (failureCount, error: ApiError) => {
        // No reintentar en errores de cliente (4xx)
        if (error.statusCode >= 400 && error.statusCode < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0, // Las mutaciones nunca se reintentan automáticamente
    },
  },
});
```

### Patrón de hook con unwrap

```typescript
// features/<name>/hooks/useGet<Resource>s.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { PaginatedMeta } from '@/types/api';

export function useGetItems(params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () =>
      apiClient
        .get<{ data: Item[]; meta: PaginatedMeta }>('/api/v1/items', { params })
        .then((res) => res.data), // res.data = { data: Item[], meta: PaginatedMeta }
    select: (envelope) => ({
      items: envelope.data, // Item[]
      meta: envelope.meta, // PaginatedMeta con hasNextPage, etc.
    }),
  });
}

// En el componente:
// const { data, isPending, isError, error } = useGetItems({ page: 1, limit: 20 });
// data.items         → Item[]
// data.meta.hasNextPage → boolean
// error.message      → string (normalizado por el interceptor)
// error.code         → 'ITEM_001' | 'VAL_001' | etc.
```

### Tipos compartidos de API

```typescript
// src/types/api.ts
export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  timestamp: string;
  requestId?: string;
}

// Envelope para respuestas de un solo recurso
export interface SingleEnvelope<T> {
  data: T;
  meta: Record<string, unknown>;
  error: null;
}

// Envelope para respuestas paginadas
export interface PaginatedEnvelope<T> {
  data: T[];
  meta: PaginatedMeta;
  error: null;
}

// Envelope de error
export interface ErrorEnvelope {
  data: null;
  meta: Record<string, unknown>;
  error: ApiError;
}

// Union type para compatibilidad
export type ApiEnvelope<T> = SingleEnvelope<T> | PaginatedEnvelope<T> | ErrorEnvelope;

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details: Record<string, unknown> | null;
    timestamp: string;
    requestId?: string;
    path: string;
  };
}
```

---

## 13. Auth Endpoints

### POST /auth/login

**Request:**
```typescript
{
  email: string;
  password: string;
}
```

**Response exitoso (200):**
```typescript
{
  data: {
    accessToken: string;  // JWT, expira en 15min
    user: {
      id: string;
      email: string;
      role: string;
    };
  };
  meta: {};
  error: null;
}
```
> El `refreshToken` se setea como httpOnly cookie — no aparece en el body.

---

### POST /auth/refresh

**Request:** No body — usa el refreshToken de la cookie httpOnly automáticamente.

**Response exitoso (200):**
```typescript
{
  data: {
    accessToken: string;  // Nuevo JWT
  };
  meta: {};
  error: null;
}
```

**Error (401):** Session expirada — el cliente debe redirigir a login.

---

### POST /auth/logout

**Request:** No body.

**Response exitoso (200):**
```typescript
{
  data: null;
  meta: {};
  error: null;
}
```
> Invalida el refreshToken en el servidor y limpia la cookie.

---

_Mantener actualizado cuando el backend cambie el formato de respuestas, códigos de error o flujo de auth._
_Última actualización: 2026-03-19_
