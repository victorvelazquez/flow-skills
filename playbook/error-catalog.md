# Error Catalog

> Última actualización: 2026-03-28  
> Fuente de verdad: Este archivo. El contrato de envelope está en `api-contract.md §5`.

## Tabla de Contenidos
1. Convención de nomenclatura
2. Errores genéricos del sistema
3. Errores de autenticación (AUTH)
4. Errores de autorización (AUTHZ)
5. Errores de validación (VAL)
6. Errores de recursos (RESOURCE)
7. Errores de negocio (BIZ)
8. Errores de infraestructura (INFRA)
9. Cómo agregar nuevos códigos
10. Mapping en el Frontend

---

## §1 — Convención de nomenclatura

### Formato
```
{DOMAIN}_{NUMBER}
```

- **DOMAIN**: Dominio en mayúsculas, 3-6 caracteres
- **NUMBER**: 3 dígitos, empezando en 001

### Dominios reservados del sistema

| Dominio | Descripción |
|---------|-------------|
| `AUTH` | Autenticación (login, tokens, sesiones) |
| `AUTHZ` | Autorización (permisos, roles) |
| `VAL` | Validación de input |
| `RESOURCE` | Recursos no encontrados o en conflicto |
| `BIZ` | Reglas de negocio |
| `INFRA` | Infraestructura (DB, cache, servicios externos) |

### Dominios de negocio (ejemplos por proyecto)

| Dominio | Descripción |
|---------|-------------|
| `USER` | Dominio de usuarios |
| `PAYMENT` | Dominio de pagos |
| `ORDER` | Dominio de órdenes |
| `PRODUCT` | Dominio de productos |
| `NOTIF` | Notificaciones |

> 📌 Cada proyecto define sus dominios de negocio propios. El rango 001-099 es para errores comunes del dominio, 100+ para casos edge.

---

## §2 — Errores genéricos del sistema

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `SYS_001` | 500 | Internal server error | Error no manejado — siempre loguearlo |
| `SYS_002` | 503 | Service temporarily unavailable | Servicio externo caído |
| `SYS_003` | 408 | Request timeout | Timeout en operación larga |
| `SYS_004` | 429 | Too many requests | Rate limit excedido |
| `SYS_005` | 400 | Bad request | Request malformado antes de validación |

---

## §3 — Errores de autenticación (AUTH)

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `AUTH_001` | 401 | Invalid credentials | Email o password incorrectos |
| `AUTH_002` | 401 | Token expired | Access token vencido |
| `AUTH_003` | 401 | Token invalid | Token malformado o firmado con key incorrecta |
| `AUTH_004` | 401 | Refresh token expired | Session vencida — forzar logout |
| `AUTH_005` | 401 | Refresh token invalid | Refresh token inválido o revocado |
| `AUTH_006` | 401 | Account not verified | Email no verificado |
| `AUTH_007` | 423 | Account locked | Demasiados intentos fallidos |
| `AUTH_008` | 401 | Session not found | Session inválida o ya cerrada |

### Implementación en NestJS

```typescript
// auth/domain/auth.errors.ts
import { DomainException } from '@common/exceptions/domain.exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('Invalid credentials', 'AUTH_001', 401);
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('Token expired', 'AUTH_002', 401);
  }
}

export class RefreshTokenExpiredException extends DomainException {
  constructor() {
    super('Session expired', 'AUTH_004', 401);
  }
}
```

---

## §4 — Errores de autorización (AUTHZ)

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `AUTHZ_001` | 403 | Insufficient permissions | El usuario no tiene el rol requerido |
| `AUTHZ_002` | 403 | Resource access denied | El usuario no es owner del recurso |
| `AUTHZ_003` | 403 | Action not allowed in current state | Acción no permitida según el estado del recurso |

---

## §5 — Errores de validación (VAL)

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `VAL_001` | 400 | Validation failed | Input inválido — ver `details` para los campos |
| `VAL_002` | 400 | Invalid format | Formato inválido (fecha, email, UUID) |
| `VAL_003` | 400 | Required field missing | Campo requerido ausente |
| `VAL_004` | 400 | Value out of range | Número o fecha fuera del rango permitido |
| `VAL_005` | 400 | Invalid enum value | Valor no está en la lista de opciones válidas |

### Estructura de `details` para VAL_001

```typescript
{
  "error": {
    "code": "VAL_001",
    "message": "Validation failed",
    "details": {
      "fields": [
        {
          "field": "email",
          "message": "Must be a valid email address",
          "value": "not-an-email"
        },
        {
          "field": "age",
          "message": "Must be between 18 and 120",
          "value": 15
        }
      ]
    }
  }
}
```

### Implementación con class-validator

```typescript
// common/filters/validation.filter.ts
// El global validation pipe de NestJS lanza BadRequestException con los errores de class-validator.
// El ExceptionFilter los mapea a VAL_001:

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const exceptionResponse = exception.getResponse() as any;

    response.status(400).json({
      data: null,
      meta: {},
      error: {
        code: 'VAL_001',
        message: 'Validation failed',
        details: {
          fields: exceptionResponse.message?.map((msg: string) => ({
            message: msg,
          })) ?? [],
        },
      },
    });
  }
}
```

---

## §6 — Errores de recursos (RESOURCE)

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `RESOURCE_001` | 404 | Resource not found | El recurso solicitado no existe |
| `RESOURCE_002` | 409 | Resource already exists | Conflicto — email duplicado, slug duplicado |
| `RESOURCE_003` | 409 | Resource in use | No se puede eliminar porque tiene dependencias |
| `RESOURCE_004` | 410 | Resource deleted | El recurso existió pero fue eliminado (soft delete) |
| `RESOURCE_005` | 412 | Resource version conflict | Optimistic locking — alguien modificó el recurso antes |

---

## §7 — Errores de negocio (BIZ)

Los errores de negocio son domain-specific. Seguir la convención `{DOMAIN}_{NUMBER}`.

### Ejemplo: Dominio de Pagos

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `PAYMENT_001` | 402 | Insufficient funds | Saldo insuficiente |
| `PAYMENT_002` | 422 | Payment method declined | Tarjeta rechazada |
| `PAYMENT_003` | 422 | Payment already processed | Idempotency key — pago ya procesado |
| `PAYMENT_004` | 422 | Invalid currency | Moneda no soportada |

### Ejemplo: Dominio de Órdenes

| Código | HTTP | Mensaje | Cuándo |
|--------|------|---------|--------|
| `ORDER_001` | 422 | Order already cancelled | No se puede cancelar una orden ya cancelada |
| `ORDER_002` | 422 | Order cannot be modified | La orden ya fue despachada |
| `ORDER_003` | 422 | Minimum order amount not met | Monto mínimo no alcanzado |

---

## §8 — Errores de infraestructura (INFRA)

> ⚠️ Estos errores no deben exponerse al cliente con detalles internos. El mensaje al cliente es siempre genérico; el detalle va al logger.

| Código | HTTP | Mensaje al cliente | Cuándo |
|--------|------|--------------------|--------|
| `INFRA_001` | 500 | Internal server error | Error de base de datos |
| `INFRA_002` | 500 | Internal server error | Error de conexión a Redis |
| `INFRA_003` | 502 | External service error | Error en servicio externo (Stripe, SendGrid, etc.) |
| `INFRA_004` | 500 | Internal server error | Error en job/queue |

```typescript
// Loguear el detalle interno, exponer solo el código
logger.error('Database connection failed', {
  code: 'INFRA_001',
  error: originalError.message,
  stack: originalError.stack,
});

// Responder al cliente sin detalles internos
throw new DomainException('Internal server error', 'INFRA_001', 500);
```

---

## §9 — Cómo agregar nuevos códigos

1. **Elegí el dominio** — ¿es un error de sistema, auth, validación o negocio?
2. **Asigná el número** — siguiente disponible en el dominio
3. **Agregalo a este archivo** en la sección correcta
4. **Creá la exception class** en el módulo correspondiente
5. **Actualizá el frontend mapping** (§10)

```typescript
// Nueva exception class
// modules/orders/domain/order.errors.ts
export class OrderAlreadyCancelledException extends DomainException {
  constructor(orderId: string) {
    super(
      'Order already cancelled',
      'ORDER_001',
      422,
      { orderId }, // details para debugging
    );
  }
}
```

---

## §10 — Mapping en el Frontend

El frontend debe manejar los errores de forma diferente según el código.

### Estrategia de handling

```typescript
// lib/error-handler.ts
export type ErrorAction = 
  | 'show-toast'      // Mostrar toast de error
  | 'show-inline'     // Mostrar error inline en el form
  | 'redirect-login'  // Redirigir a login
  | 'redirect-403'    // Página de acceso denegado
  | 'redirect-404'    // Página not found
  | 'show-modal'      // Modal de error crítico

export function getErrorAction(code: string): ErrorAction {
  // Auth — redirect
  if (['AUTH_002', 'AUTH_003', 'AUTH_004', 'AUTH_005', 'AUTH_008'].includes(code)) {
    return 'redirect-login';
  }

  // Autorización
  if (code.startsWith('AUTHZ_')) return 'redirect-403';

  // Not found
  if (code === 'RESOURCE_001') return 'redirect-404';

  // Validación — inline en form
  if (code.startsWith('VAL_')) return 'show-inline';

  // Default — toast
  return 'show-toast';
}
```

### Mensajes para el usuario (i18n-ready)

```typescript
// lib/error-messages.ts
export const ERROR_MESSAGES: Record<string, string> = {
  // Auth
  AUTH_001: 'Email o contraseña incorrectos',
  AUTH_006: 'Necesitás verificar tu email antes de continuar',
  AUTH_007: 'Tu cuenta fue bloqueada temporalmente. Intentá en 30 minutos',

  // Recursos
  RESOURCE_001: 'El recurso que buscás no existe',
  RESOURCE_002: 'Ya existe un registro con esos datos',
  RESOURCE_003: 'No podés eliminar este elemento porque está siendo usado',

  // Rate limiting
  SYS_004: 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo',

  // Default
  DEFAULT: 'Ocurrió un error inesperado. Intentá de nuevo',
};

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.DEFAULT;
}
```

### Integración con TanStack Query

```typescript
// En el queryClient global — manejo centralizado
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error: ApiError) => {
        const action = getErrorAction(error.code);
        const message = getErrorMessage(error.code);

        if (action === 'redirect-login') {
          router.push('/login');
          return;
        }

        if (action === 'show-toast') {
          toast.error(message);
        }
      },
    },
  },
});
```

### Validación inline con React Hook Form

```typescript
// Cuando el backend retorna VAL_001, mapear los field errors al form
function handleApiError(error: ApiError, setError: UseFormSetError<FormData>) {
  if (error.code === 'VAL_001' && error.details?.fields) {
    error.details.fields.forEach((fieldError: FieldError) => {
      setError(fieldError.field as keyof FormData, {
        message: fieldError.message,
      });
    });
    return;
  }

  // Para otros errores, mostrar en el campo root
  setError('root', { message: getErrorMessage(error.code) });
}
```

---

*Para el contrato completo del envelope de error, ver `api-contract.md §5`. Para las exception classes del backend, ver `backend-patterns.md §5`.*
