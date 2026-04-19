# Backend Patterns Reference — NestJS

> **Propósito:** Referencia única de patrones arquitectónicos para proyectos NestJS profesionales.
> Agnóstica al dominio — los ejemplos usan `Item`/`Entity` como placeholder.
> Cada patrón incluye implementación lista para copiar, justificación y gotchas.
> Stack decidido: Fastify · Prisma · Pino · `@nestjs/jwt` + `passport-jwt` · bcrypt.
> Ver `backend-stack.md` para el stack completo con tiers.
> Ver `api-contract.md` para el contrato de API entre frontend y backend.

---

## Tabla de Contenidos

1. [Estructura de Módulos](#1-estructura-de-módulos)
2. [DTOs y Validación](#2-dtos-y-validación)
3. [Respuestas HTTP — Envelope Pattern](#3-respuestas-http--envelope-pattern)
4. [Paginación](#4-paginación)
5. [Manejo de Errores y Excepciones](#5-manejo-de-errores-y-excepciones)
6. [Autenticación y Guards](#6-autenticación-y-guards)
7. [Interceptors](#7-interceptors)
8. [Decoradores Personalizados](#8-decoradores-personalizados)
9. [Servicios — Patrones Comunes](#9-servicios--patrones-comunes)
10. [Repository Pattern](#10-repository-pattern)
11. [PrismaService — Patrón Wrapper](#11-prismaservice--patrón-wrapper)
12. [Logging y Request Tracing](#12-logging-y-request-tracing)
13. [Configuración — registerAs](#13-configuración--registeras)
14. [Caché](#14-caché)
15. [Seguridad](#15-seguridad)
16. [Health Checks](#16-health-checks)
17. [File Upload y Storage](#17-file-upload-y-storage)
18. [Multi-tenant](#18-multi-tenant)
19. [BullMQ — Jobs y Workers](#19-bullmq--jobs-y-workers)
20. [Testing Patterns](#20-testing-patterns)
21. [Bootstrap — main.ts](#21-bootstrap--maints)
22. [OpenAPI / Swagger](#22-openapi--swagger)
23. [Checklist de Setup Inicial](#23-checklist-de-setup-inicial)
24. [Email Transaccional](#24-email-transaccional)
25. [WebSockets y Server-Sent Events (SSE)](#25-websockets-y-server-sent-events-sse)
26. [RBAC Granular: Autorización a nivel de recurso](#26-rbac-granular-autorización-a-nivel-de-recurso-tier-2)
27. [Database Seeding](#27--database-seeding-base)
28. [Optimistic Locking con Prisma](#28--optimistic-locking-tier-2)
29. [Bull Board: Monitoreo de Queues](#29--bull-board-monitoreo-de-queues-tier-2)

---

## 1. Estructura de Módulos

`[Base]` — Aplicar en todo proyecto.

### Estructura de directorios

```
src/
├── common/
│   ├── constants/         # error-codes.ts, roles.enum.ts
│   ├── decorators/        # @Public, @Roles, @CurrentUser, @Auth, @AuditAction, @SkipResponseTransform
│   ├── dto/               # pagination.dto.ts, api-response.dto.ts
│   ├── exceptions/        # domain.exception.ts
│   ├── filters/           # all-exceptions.filter.ts
│   ├── guards/            # jwt-auth.guard.ts, roles.guard.ts, throttler.guard.ts
│   ├── interceptors/      # response.interceptor.ts, request-logging.interceptor.ts, audit-log.interceptor.ts
│   ├── middleware/        # request-id.middleware.ts
│   ├── pipes/             # parse-boolean.pipe.ts
│   ├── services/          # pino-logger.service.ts, request-context.service.ts
│   └── utils/             # sanitize.utils.ts, security.utils.ts
├── config/                # app.config.ts, env.validation.ts
├── health/                # health.controller.ts, prisma-health.indicator.ts
├── prisma/                # prisma.service.ts, prisma.module.ts
└── modules/
    └── items/
        ├── __tests__/
        │   ├── items.controller.spec.ts
        │   └── items.service.spec.ts
        ├── dto/
        │   ├── create-item.dto.ts
        │   ├── update-item.dto.ts
        │   ├── item-filters.dto.ts
        │   └── item-response.dto.ts
        ├── interfaces/
        │   └── item.types.ts
        ├── items.controller.ts
        ├── items.service.ts
        └── items.module.ts
```

### Convenciones de nomenclatura

| Elemento          | Convención               | Ejemplo                 |
| ----------------- | ------------------------ | ----------------------- |
| Módulo            | `{name}.module.ts`       | `items.module.ts`       |
| Controller        | `{name}.controller.ts`   | `items.controller.ts`   |
| Service           | `{name}.service.ts`      | `items.service.ts`      |
| Repository        | `{name}.repository.ts`   | `items.repository.ts`   |
| DTO creación      | `create-{name}.dto.ts`   | `create-item.dto.ts`    |
| DTO actualización | `update-{name}.dto.ts`   | `update-item.dto.ts`    |
| DTO filtros       | `{name}-filters.dto.ts`  | `item-filters.dto.ts`   |
| DTO respuesta     | `{name}-response.dto.ts` | `item-response.dto.ts`  |
| Interfaces/types  | `{name}.types.ts`        | `item.types.ts`         |
| Tests             | `{name}.spec.ts`         | `items.service.spec.ts` |
| Clases            | PascalCase               | `ItemsService`          |
| Métodos/variables | camelCase                | `findById`              |
| Constantes        | UPPER_SNAKE_CASE         | `MAX_PAGE_SIZE`         |
| Enums             | PascalCase               | `ItemStatus`            |

### Template de módulo

```typescript
// items.module.ts
import { Module } from "@nestjs/common";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";

@Module({
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService], // solo si otros módulos lo necesitan
})
export class ItemsModule {}
```

### Template de controller

```typescript
// items.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { ItemsService } from "./items.service";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { ItemFiltersDto } from "./dto/item-filters.dto";
import { Auth } from "@/common/decorators/auth.decorator";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import { Role } from "@/common/constants/roles.enum";

@ApiTags("Items")
@Controller("v1/items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @Auth(Role.ADMIN)
  @AuditAction("ITEM_CREATE")
  @ApiOperation({ summary: "Create a new item" })
  async create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get()
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: "List items with pagination" })
  async findAll(@Query() filters: ItemFiltersDto) {
    return this.itemsService.findAll(filters);
  }

  @Get(":id")
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: "Get item by ID" })
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.itemsService.findById(id);
  }

  @Patch(":id")
  @Auth(Role.ADMIN)
  @AuditAction("ITEM_UPDATE")
  @ApiOperation({ summary: "Update item" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.itemsService.update(id, dto);
  }

  @Delete(":id")
  @Auth(Role.ADMIN)
  @AuditAction("ITEM_DELETE")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete item" })
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.itemsService.remove(id);
  }
}
```

### Módulo con forwardRef (dependencias circulares)

```typescript
// cats.module.ts
import { Module, forwardRef } from "@nestjs/common";
import { DogsModule } from "../dogs/dogs.module";

@Module({
  imports: [forwardRef(() => DogsModule)],
  exports: [CatsService],
})
export class CatsModule {}

// En el service que usa la dependencia circular:
// constructor(@Inject(forwardRef(() => DogsService)) private dogsService: DogsService) {}
```

> **Gotchas**
>
> - `ParseUUIDPipe` en todos los `:id` params — valida antes de llegar al service.
> - Versioning `/v1/` en el path del controller, no en el global prefix, para permitir versiones mixtas.
> - `@HttpCode(HttpStatus.NO_CONTENT)` en endpoints DELETE sin body.
> - `forwardRef` es último recurso — suele indicar módulos que deberían refactorizarse.

---

## 2. DTOs y Validación

`[Base]` — Aplicar en todo proyecto.

### ValidationPipe global

```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // strip campos no declarados
    forbidNonWhitelisted: true, // error si llegan campos extra
    transform: true, // convierte tipos automáticamente
    transformOptions: { enableImplicitConversion: true },
    disableErrorMessages: process.env.NODE_ENV === "production",
    exceptionFactory: (errors) => {
      const messages = errors.flatMap((err) =>
        Object.values(err.constraints ?? {}),
      );
      throw new DomainException(
        ErrorCodes.VAL_001,
        messages.join("; "),
        HttpStatus.UNPROCESSABLE_ENTITY,
        { fields: errors.map((e) => e.property) },
      );
    },
  }),
);
```

### DTO de creación

```typescript
// create-item.dto.ts
import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateItemDto {
  @ApiProperty({ example: "My Item" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  email: string;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus = ItemStatus.ACTIVE;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: "Password must contain uppercase, lowercase and numbers",
  })
  password?: string;
}
```

### DTO de actualización con PartialType

```typescript
// update-item.dto.ts
import { PartialType, OmitType } from "@nestjs/swagger";
import { CreateItemDto } from "./create-item.dto";

// PartialType hace todos los campos opcionales
// OmitType excluye campos que no deben actualizarse
export class UpdateItemDto extends PartialType(
  OmitType(CreateItemDto, ["email"] as const),
) {}
```

### DTO de respuesta

```typescript
// item-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ItemStatus }) status: ItemStatus;
  @ApiProperty() createdAt: Date;
  // NUNCA incluir: password, tokens, datos sensibles
}
```

### Validaciones condicionales y anidadas

```typescript
// create-order.dto.ts
import {
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class CardDetailsDto {
  @IsString() cardNumber: string;
  @IsString() expiryDate: string;
}

export class CreateOrderDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // Solo requerido cuando paymentMethod === 'card'
  @ValidateIf((o: CreateOrderDto) => o.paymentMethod === PaymentMethod.CARD)
  @ValidateNested()
  @Type(() => CardDetailsDto)
  cardDetails?: CardDetailsDto;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

### Tipos mapeados avanzados

```typescript
import {
  IntersectionType,
  OmitType,
  PartialType,
  PickType,
} from "@nestjs/swagger";

// Solo campos específicos
export class ItemSummaryDto extends PickType(CreateItemDto, [
  "name",
  "email",
] as const) {}

// Todos excepto algunos
export class PublicItemDto extends OmitType(CreateItemDto, [
  "email",
] as const) {}

// Combinación de dos DTOs
export class FilterItemsDto extends IntersectionType(
  PartialType(CreateItemDto),
  PaginationDto,
) {}
```

### Validador personalizado — IsSafeString

```typescript
// src/common/decorators/is-safe-string.decorator.ts
import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from "class-validator";

const SAFE_STRING_PATTERN = /^[a-zA-Z0-9\s\-_.@]+$/;

@ValidatorConstraint({ name: "isSafeString", async: false })
export class IsSafeStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && SAFE_STRING_PATTERN.test(value);
  }
  defaultMessage(args: ValidationArguments): string {
    return `${args.property} contains invalid characters`;
  }
}

export function IsSafeString(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsSafeStringConstraint,
    });
  };
}
```

### Validador personalizado — IsValidPhoneNumber (E.164)

```typescript
// src/common/decorators/is-valid-phone.decorator.ts
@ValidatorConstraint({ name: "isValidPhoneNumber", async: false })
class IsValidPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
  }
  defaultMessage(): string {
    return "Phone must be in E.164 format (e.g. +5491112345678)";
  }
}

export function IsValidPhoneNumber(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsValidPhoneConstraint,
    });
  };
}
```

### ParseBoolean para query params

```typescript
// src/common/decorators/parse-boolean.decorator.ts
// Workaround: enableImplicitConversion tiene bug con booleans en query params
import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";

export function ParseBoolean() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (value === "true" || value === true) return true;
      if (value === "false" || value === false) return false;
      return value;
    }),
  );
}
```

> **Gotchas**
>
> - `PartialType` de `@nestjs/swagger` (no `@nestjs/mapped-types`) — mantiene decoradores Swagger.
> - `@ValidateNested()` + `@Type()` son ambos requeridos para validar objetos anidados.
> - `@Transform` en email es obligatorio — normaliza antes de guardar en DB.
> - `disableErrorMessages: true` en prod — no exponer nombres de campos al cliente.

---

## 3. Respuestas HTTP — Envelope Pattern

`[Base]` — Aplicar en todo proyecto.

Todas las respuestas se envuelven en `{ data, meta }` mediante `ResponseInterceptor` global. El campo `meta` lleva `timestamp`, `requestId` y — en respuestas paginadas — campos de navegación.

```
// Recurso único
{ "data": { "id": "uuid", "name": "..." }, "meta": { "timestamp": "...", "requestId": "..." } }

// Colección paginada
{ "data": [...], "meta": { "total": 100, "page": 1, "limit": 10, "totalPages": 10, "hasNextPage": true, "hasPreviousPage": false, "timestamp": "...", "requestId": "..." } }

// DELETE → HTTP 204, sin body
```

### DTOs de respuesta

```typescript
// src/common/dto/api-response.dto.ts
export class BaseMetaDto {
  timestamp: string;
  requestId?: string;
}

export class CollectionMetaDto extends BaseMetaDto {
  total: number;
}

export class PaginationMetaDto extends CollectionMetaDto {
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class ApiResponseDto<T> {
  data: T;
  meta: BaseMetaDto | CollectionMetaDto | PaginationMetaDto;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    timestamp: string;
    requestId?: string;
  };
}
```

### PaginatedResponseDto con factory estático

```typescript
// src/common/dto/paginated-response.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  @Type(() => PaginationMetaDto)
  meta: PaginationMetaDto;

  constructor(data: T[], meta: PaginationMetaDto) {
    this.data = data;
    this.meta = meta;
  }

  static create<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
  ): PaginatedResponseDto<T> {
    const totalPages = Math.ceil(total / limit);
    return new PaginatedResponseDto(data, {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      timestamp: new Date().toISOString(),
    } as PaginationMetaDto);
  }

  static empty<T>(page: number, limit: number): PaginatedResponseDto<T> {
    return PaginatedResponseDto.create<T>([], page, limit, 0);
  }

  map<U>(mapper: (item: T) => U): PaginatedResponseDto<U> {
    return new PaginatedResponseDto(this.data.map(mapper), this.meta);
  }
}
```

### ResponseInterceptor

```typescript
// src/common/interceptors/response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Reflector } from "@nestjs/core";
import { SKIP_RESPONSE_TRANSFORM_KEY } from "@/common/decorators/skip-response-transform.decorator";
import { RequestContextService } from "@/common/services/request-context.service";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return next.handle();

    const requestId = this.requestContext.getRequestId();

    return next.handle().pipe(
      map((data: unknown) => {
        if (this.isEnvelopedResponse(data)) {
          const enveloped = data as {
            data: unknown;
            meta: Record<string, unknown>;
          };
          return {
            data: enveloped.data,
            meta: {
              ...enveloped.meta,
              timestamp: new Date().toISOString(),
              requestId,
            },
          };
        }
        return {
          data,
          meta: { timestamp: new Date().toISOString(), requestId },
        };
      }),
    );
  }

  private isEnvelopedResponse(data: unknown): boolean {
    return (
      typeof data === "object" &&
      data !== null &&
      "data" in data &&
      "meta" in data
    );
  }
}
```

### Registro global y decorator de bypass

```typescript
// app.module.ts
providers: [
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
],

// src/common/decorators/skip-response-transform.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const SKIP_RESPONSE_TRANSFORM_KEY = 'skipResponseTransform';
export const SkipResponseTransform = () => SetMetadata(SKIP_RESPONSE_TRANSFORM_KEY, true);

// Uso en endpoints OAuth2 o de formato fijo:
@SkipResponseTransform()
@Post('auth/token')
async token() { ... }
```

> **Gotchas**
>
> - El interceptor detecta `{ data, meta }` existente para no doble-envolver.
> - HTTP 204 (DELETE): usar `@HttpCode(HttpStatus.NO_CONTENT)` — el interceptor no se aplica.
> - Endpoints OAuth2/login deben usar `@SkipResponseTransform()`.

---

## 4. Paginación

`[Base]`

### PaginationDto base

```typescript
// src/common/dto/pagination.dto.ts
import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  sortDirection: SortDirection = SortDirection.DESC;
}
```

### PaginationHelper

```typescript
// src/common/dto/pagination.dto.ts (continuación)
export class PaginationHelper {
  static getSkipTake(
    page: number,
    limit: number,
  ): { skip: number; take: number } {
    return { skip: (page - 1) * limit, take: limit };
  }
}
```

### DTO de filtros extendido

```typescript
// src/modules/items/dto/item-filters.dto.ts
import { IsOptional, IsString, IsEnum } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { PaginationDto } from "@/common/dto/pagination.dto";

export class ItemFiltersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ItemStatus })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}
```

### Service con paginación (Prisma)

```typescript
async findAll(filters: ItemFiltersDto): Promise<PaginatedResponse<ItemResponseDto>> {
  const { page, limit, sortBy = 'createdAt', sortDirection = 'desc', search, status } = filters;
  const { skip } = PaginationHelper.getSkipTake(page, limit);

  const where = {
    deletedAt: null,
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  // count y findMany en paralelo — nunca en secuencia
  const [total, items] = await Promise.all([
    this.prisma.item.count({ where }),
    this.prisma.item.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortDirection } }),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    data: items.map(this.mapToResponseDto),
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
```

### Cursor-based pagination `[Tier 2]`

El offset pagination tiene problemas de consistencia en listas que cambian frecuentemente (items duplicados o saltados en la siguiente página). Recomendado desde que la tabla supere los 10k registros o cuando los datos se actualizan frecuentemente.

```typescript
// Cursor-based pagination con Prisma [Tier 2]
// Usar cuando: tabla > 10k registros O datos se actualizan frecuentemente

// DTO
export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string; // ID del último item visto (base64 encoded)

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// Repository
async findAllWithCursor(dto: CursorPaginationDto) {
  const { cursor, limit = 20 } = dto;

  const items = await this.prisma.item.findMany({
    take: limit + 1, // traer uno extra para saber si hay nextPage
    ...(cursor && {
      cursor: { id: Buffer.from(cursor, 'base64').toString('utf-8') },
      skip: 1, // skip el cursor item
    }),
    orderBy: { createdAt: 'desc' },
  });

  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, -1) : items;
  const nextCursor = hasNextPage
    ? Buffer.from(data[data.length - 1].id).toString('base64')
    : null;

  return {
    data,
    meta: {
      nextCursor,
      hasNextPage,
      limit,
    },
  };
}
```

> ⚠️ **Offset vs Cursor**: Con offset pagination, si se inserta un item mientras el usuario pagina, verá items duplicados o saltará items. Con cursor pagination esto no ocurre. Desventaja: no se puede saltar a una página arbitraria (no hay "ir a página 5").

> **Gotchas**
>
> - `Promise.all([count, findMany])` — ejecutarlos en secuencia duplica la latencia.
> - `skip = (page - 1) * limit`, nunca `page * limit`.
> - `@Max(100)` en `limit` — evita queries que traigan miles de registros.
> - Validar `sortBy` contra campos permitidos si se expone al usuario.

---

## 5. Manejo de Errores y Excepciones

`[Base]`

### DomainException

```typescript
// src/common/exceptions/domain.exception.ts
import { HttpException, HttpStatus } from "@nestjs/common";

export class DomainException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, statusCode: status, details }, status);
  }
}
```

### Error codes

```typescript
// src/common/constants/error-codes.ts
export const ErrorCodes = {
  // Auth
  AUTH_001: "AUTH_001", // Invalid credentials
  AUTH_002: "AUTH_002", // Token expired
  AUTH_003: "AUTH_003", // Token invalid
  AUTH_004: "AUTH_004", // Refresh token expired
  AUTH_005: "AUTH_005", // Refresh token invalid
  // Item (reemplazar por dominio real)
  ITEM_001: "ITEM_001", // Not found
  ITEM_002: "ITEM_002", // Already exists
  // Generic
  VAL_001: "VAL_001", // Validation error
  SYS_004: "SYS_004", // Too many requests
  SYS_001: "SYS_001", // Internal server error
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
```

### AllExceptionsFilter — con HttpAdapterHost (Fastify-safe)

```typescript
// src/common/filters/all-exceptions.filter.ts
import { randomUUID } from "node:crypto";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { DomainException } from "@/common/exceptions/domain.exception";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ requestId?: string }>();
    const requestId = request.requestId ?? randomUUID();
    const isProd = process.env.NODE_ENV === "production";

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let code = "SYS_001";
    let details: unknown = null;

    if (exception instanceof DomainException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse() as {
        message: string;
        code: string;
        details?: unknown;
      };
      message = res.message;
      code = res.code;
      details = res.details ?? null;
      if (statusCode >= 500) {
        this.logger.error({ message, code, requestId });
      } else {
        this.logger.warn({ message, code, requestId });
      }
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse() as Record<string, unknown>;
      message = (res.message as string) ?? "Exception";
      code = `HTTP_${statusCode}`;
    } else {
      this.logger.error(
        `[${requestId}] Unexpected error`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      if (!isProd) message = String(exception);
    }

    const body = {
      error: {
        code,
        message,
        statusCode,
        details: isProd && statusCode >= 500 ? null : details,
        timestamp: new Date().toISOString(),
        requestId,
        path: String(httpAdapter.getRequestUrl(ctx.getRequest())),
      },
    };

    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }
}
```

### Registro

```typescript
// main.ts — registrar con HttpAdapterHost (Fastify-safe)
const httpAdapterHost = app.get(HttpAdapterHost);
app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));
```

### Patrón de uso en services

```typescript
async findById(id: string): Promise<ItemResponseDto> {
  const item = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
  if (!item) {
    throw new DomainException(ErrorCodes.ITEM_001, 'Item not found', HttpStatus.NOT_FOUND);
  }
  return this.mapToResponseDto(item);
}

// Siempre re-throw DomainException antes de envolver
async someOperation(id: string): Promise<void> {
  try {
    // ...
  } catch (error) {
    if (error instanceof DomainException) throw error;
    this.logger.error('Unexpected error', { error, id });
    throw new DomainException(ErrorCodes.SYS_001, 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
```

> **Gotchas**
>
> - `HttpAdapterHost` hace el filter agnóstico al HTTP adapter (Express/Fastify).
> - Registrar con `useGlobalFilters` en `main.ts` — no como `APP_FILTER` si usa `HttpAdapterHost`.
> - En prod, los errores 500 nunca exponen el stack ni el mensaje interno.
> - Re-throw `DomainException` siempre — evita perder el código original.

---

## 6. Autenticación y Guards

`[Base]`

### JwtAuthGuard con diferenciación de errores

```typescript
// src/common/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext, HttpStatus } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "@/common/decorators/public.decorator";
import { DomainException } from "@/common/exceptions/domain.exception";
import { ErrorCodes } from "@/common/constants/error-codes";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<T>(err: Error | null, user: T): T {
    if (err || !user) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("jwt expired")) {
        throw new DomainException(
          ErrorCodes.AUTH_004,
          "Token expired",
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (msg.includes("invalid signature")) {
        throw new DomainException(
          ErrorCodes.AUTH_005,
          "Invalid token signature",
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw new DomainException(
        ErrorCodes.AUTH_002,
        "Authentication required",
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}
```

### RolesGuard con jerarquía numérica

```typescript
// src/common/guards/roles.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "@/common/decorators/roles.decorator";
import { Role } from "@/common/constants/roles.enum";

@Injectable()
export class RolesGuard implements CanActivate {
  // Valores numéricos explícitos — más claro y menos frágil que indexOf
  private readonly hierarchy: Record<string, number> = {
    [Role.ROOT]: 3,
    [Role.OWNER]: 2,
    [Role.ADMIN]: 1,
  };

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: { roles: string[] } }>();
    if (!user) throw new ForbiddenException("User not authenticated");

    const userLevel = Math.max(
      ...user.roles.map((r) => this.hierarchy[r] ?? 0),
    );
    const requiredLevel = Math.min(
      ...required.map((r) => this.hierarchy[r] ?? Infinity),
    );

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(`Required roles: ${required.join(", ")}`);
    }
    return true;
  }
}
```

### Registro global de guards

```typescript
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },  // primero — autenticación
  { provide: APP_GUARD, useClass: RolesGuard },     // segundo — autorización
],
```

### JWT Strategy

```typescript
// src/common/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, StrategyOptions } from "passport-jwt";

export interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService) {
    const rawKey = configService.getOrThrow<string>("app.jwt.publicKey");

    // Formatear como PEM si viene como base64 sin headers
    const publicKey = rawKey.includes("BEGIN PUBLIC KEY")
      ? rawKey
      : `-----BEGIN PUBLIC KEY-----\n${(rawKey.replace(/\s+/g, "").match(/.{1,64}/g) ?? []).join("\n")}\n-----END PUBLIC KEY-----`;

    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: publicKey,
      algorithms: ["RS256"],
      issuer: configService.getOrThrow<string>("app.jwt.issuer"),
      audience: configService.getOrThrow<string>("app.jwt.audience"),
      ignoreExpiration: false,
    };
    super(options);
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException("Invalid JWT payload");
    }
    return payload;
  }
}
```

> 📌 **Alternativa sin Passport: Guards propios**
> `passport-jwt` agrega boilerplate significativo (`PassportStrategy`, `ExtractJwt`, módulo de registro).
> En NestJS moderno, podés implementar JWT auth directamente con un Guard:
>
> ```typescript
> // auth/guards/jwt-auth.guard.ts
> import {
>   CanActivate,
>   ExecutionContext,
>   Injectable,
>   UnauthorizedException,
> } from "@nestjs/common";
> import { JwtService } from "@nestjs/jwt";
> import { FastifyRequest } from "fastify";
>
> @Injectable()
> export class JwtAuthGuard implements CanActivate {
>   constructor(private readonly jwtService: JwtService) {}
>
>   async canActivate(context: ExecutionContext): Promise<boolean> {
>     const request = context.switchToHttp().getRequest<FastifyRequest>();
>     const token = this.extractToken(request);
>
>     if (!token) throw new UnauthorizedException();
>
>     try {
>       const payload = await this.jwtService.verifyAsync(token);
>       request["user"] = payload;
>       return true;
>     } catch {
>       throw new UnauthorizedException();
>     }
>   }
>
>   private extractToken(request: FastifyRequest): string | null {
>     const [type, token] = request.headers.authorization?.split(" ") ?? [];
>     return type === "Bearer" ? token : null;
>   }
> }
> ```
>
> Más simple, más testeable, sin dependencia en Passport. Usar `@UseGuards(JwtAuthGuard)` igual que antes.
> **Cuándo mantener Passport**: Si el proyecto necesita múltiples estrategias de auth (OAuth, SAML, local) — Passport unifica la interfaz.

### CustomThrottlerGuard

```typescript
// src/common/guards/throttler.guard.ts
import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { DomainException } from "@/common/exceptions/domain.exception";
import { ErrorCodes } from "@/common/constants/error-codes";
import { HttpStatus } from "@nestjs/common";

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): never {
    throw new DomainException(
      ErrorCodes.SYS_004,
      "Too many requests. Please try again later.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
```

> **Gotchas**
>
> - Guards globales se ejecutan en orden: JWT primero, luego Roles. Si JWT falla, Roles no corre.
> - `@Public()` bypassea `JwtAuthGuard`, pero si la ruta tiene `@Roles()`, el guard de roles igual corre (con `user = undefined`).
> - `Math.min` en `requiredLevel` es correcto cuando se pasan múltiples roles — pide el nivel mínimo necesario.
> - `@SkipThrottle()` en health checks y endpoints internos.

---

## 7. Interceptors

`[Base]`

### RequestLoggingInterceptor — con slow-request detection y sanitización

```typescript
// src/common/interceptors/request-logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

const SLOW_REQUEST_THRESHOLD_MS = 1000;
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "authorization",
  "apiKey",
  "privateKey",
];

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body: Record<string, unknown>;
      user?: { sub?: string };
      requestId?: string;
    }>();
    const { method, url, body, requestId } = req;
    const userId = req.user?.sub ?? "anonymous";
    const start = Date.now();

    this.logger.log({
      message: "HTTP Request",
      method,
      url,
      userId,
      requestId,
      body: this.sanitize(body),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const statusCode = context
            .switchToHttp()
            .getResponse<{ statusCode: number }>().statusCode;
          const logData = { method, url, statusCode, duration, requestId };

          if (duration > SLOW_REQUEST_THRESHOLD_MS) {
            this.logger.warn({ ...logData, slow: true });
          } else {
            this.logger.log({ message: "HTTP Response", ...logData });
          }
        },
        error: (err: { message?: string; status?: number }) => {
          this.logger.error({
            message: "HTTP Error",
            method,
            url,
            requestId,
            error: err.message ?? "Unknown",
            statusCode: err.status ?? 500,
            duration: Date.now() - start,
          });
        },
      }),
    );
  }

  private sanitize(
    body: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!body || Object.keys(body).length === 0) return null;
    const copy = { ...body };
    for (const field of SENSITIVE_FIELDS) {
      if (field in copy) copy[field] = "[REDACTED]";
    }
    return copy;
  }
}
```

### AuditLogInterceptor

```typescript
// src/common/interceptors/audit-log.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { AUDIT_ACTION_KEY } from "@/common/decorators/audit-action.decorator";

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap({
        next: () => {
          // Fire-and-forget — nunca lanzar excepciones
          this.auditLogsService
            .create({
              action,
              userId: user?.id,
              ipAddress: request.ip,
              userAgent: request.headers["user-agent"],
            })
            .catch((err: unknown) =>
              this.logger.error("Audit log failed", err),
            );
        },
      }),
    );
  }
}
```

> **Gotchas**
>
> - Orden de interceptors en `app.module.ts` importa (onion model).
> - Audit log nunca debe lanzar excepciones — un fallo de auditoría no interrumpe la operación.
> - Para operaciones muy costosas, mover el audit log a una queue.

---

## 8. Decoradores Personalizados

`[Base]`

```typescript
// src/common/decorators/public.decorator.ts
import { SetMetadata } from "@nestjs/common";
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// src/common/decorators/roles.decorator.ts
import { SetMetadata } from "@nestjs/common";
import { Role } from "@/common/constants/roles.enum";
export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// src/common/decorators/audit-action.decorator.ts
import { SetMetadata } from "@nestjs/common";
export const AUDIT_ACTION_KEY = "audit_action";
export const AuditAction = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);

// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { JwtPayload } from "@/common/strategies/jwt.strategy";

export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as JwtPayload;
    return field ? user?.[field] : user;
  },
);
// @CurrentUser() user: JwtPayload
// @CurrentUser('sub') userId: string

// src/common/decorators/auth-user.decorator.ts (alias)
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ user: unknown }>().user,
);

// src/common/decorators/tenant-id.decorator.ts
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ tenantId?: string }>();
    if (!request.tenantId) throw new Error("tenantId not found in request");
    return request.tenantId;
  },
);
// @TenantId() tenantId: string
```

### @Auth() — Decorador compuesto

Combina JWT guard, roles guard, Swagger bearer auth y ApiUnauthorizedResponse en uno.

```typescript
// src/common/decorators/auth.decorator.ts
import { UseGuards, applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { Roles } from "./roles.decorator";
import { Role } from "@/common/constants/roles.enum";

export function Auth(...roles: Role[]) {
  return applyDecorators(
    Roles(...roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth("JWT"),
    ApiUnauthorizedResponse({ description: "Unauthorized" }),
  );
}

// Uso: @Auth(Role.ADMIN) en lugar de 4 decoradores separados
```

> **Gotchas**
>
> - `@CurrentUser()` requiere que `JwtAuthGuard` ya haya populado `request.user`.
> - `@Public()` + `@CurrentUser()` en la misma ruta: el usuario puede ser `undefined`.

---

## 9. Servicios — Patrones Comunes

`[Base]`

### Patrón 1: mapToResponseDto

```typescript
@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ItemResponseDto> {
    const item = await this.prisma.item.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) {
      throw new DomainException(
        ErrorCodes.ITEM_001,
        "Item not found",
        HttpStatus.NOT_FOUND,
      );
    }
    return this.mapToResponseDto(item);
  }

  private mapToResponseDto(item: PrismaItem): ItemResponseDto {
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      status: item.status as ItemStatus,
      createdAt: item.createdAt,
    };
  }
}
```

### Patrón 2: Operación externa primero + rollback manual

```typescript
async create(dto: CreateItemDto): Promise<ItemResponseDto> {
  // 1. Crear en sistema externo primero
  const externalId = await this.externalService.create(dto.email);

  try {
    const item = await this.prisma.item.create({ data: { ...dto, externalId } });
    return this.mapToResponseDto(item);
  } catch (error) {
    // 3. Rollback si la DB falla
    await this.externalService.delete(externalId).catch((e) =>
      this.logger.error('Failed to rollback external resource', e),
    );
    throw new DomainException(ErrorCodes.SYS_001, 'Failed to create item', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
```

### Patrón 3: Side effects no bloqueantes

```typescript
async login(credentials: LoginDto): Promise<TokensDto> {
  const tokens = await this.authService.authenticate(credentials);

  // Fire-and-forget — fallo silencioso con log
  this.prisma.user
    .update({ where: { email: credentials.email }, data: { lastLoginAt: new Date() } })
    .catch((err) => this.logger.warn('Failed to update lastLoginAt', err));

  return tokens;
}
```

### Patrón 4: Verificar existencia antes de actualizar

```typescript
async update(id: string, dto: UpdateItemDto): Promise<ItemResponseDto> {
  const existing = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw new DomainException(ErrorCodes.ITEM_001, 'Item not found', HttpStatus.NOT_FOUND);
  }
  const updated = await this.prisma.item.update({ where: { id }, data: dto });
  return this.mapToResponseDto(updated);
}
```

### Patrón 5: Soft delete

```typescript
async remove(id: string): Promise<void> {
  const existing = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    throw new DomainException(ErrorCodes.ITEM_001, 'Item not found', HttpStatus.NOT_FOUND);
  }
  await this.prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
}
```

### Patrón 6: Transacción Prisma

```typescript
async transferOwnership(fromId: string, toId: string): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    await tx.item.update({ where: { id: fromId }, data: { ownerId: toId } });
    await tx.auditLog.create({ data: { action: 'TRANSFER', fromId, toId } });
  });
}
```

> **Gotchas**
>
> - Incluir siempre `deletedAt: null` en queries — soft delete no aplica automáticamente.
> - `Promise.all()` para operaciones independientes.
> - Side effects no bloqueantes siempre loggeados en `warn`/`error`.

---

## 10. Repository Pattern

`[Tier 1]` — Usar en módulos con queries complejas o queries reutilizadas entre services.

```typescript
// src/modules/items/items.repository.ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { ItemFiltersDto } from "./dto/item-filters.dto";
import { PaginationHelper } from "@/common/dto/pagination.dto";

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filters: ItemFiltersDto) {
    const where = this.buildWhere(filters);
    const { skip, take } = PaginationHelper.getSkipTake(
      filters.page,
      filters.limit,
    );
    const orderBy = {
      [filters.sortBy ?? "createdAt"]: filters.sortDirection ?? "desc",
    };

    return Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { category: true },
      }),
    ]);
  }

  async findById(id: string) {
    return this.prisma.item.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
  }

  private buildWhere(filters: ItemFiltersDto): Prisma.ItemWhereInput {
    return {
      deletedAt: null,
      ...(filters.status && { status: filters.status }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { email: { contains: filters.search, mode: "insensitive" } },
        ],
      }),
    };
  }
}
```

```typescript
// items.module.ts
@Module({
  controllers: [ItemsController],
  providers: [ItemsService, ItemsRepository],
})
export class ItemsModule {}
```

---

## 11. PrismaService — Patrón Wrapper

`[Base]`

No extiende `PrismaClient`. Usa composición con `@prisma/adapter-pg` para connection pooling y SSL condicional.

```typescript
// src/prisma/prisma.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly prisma: PrismaClient;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl =
      this.configService.getOrThrow<string>("app.database.url");
    const sslEnabled =
      this.configService.get<boolean>("app.database.sslEnabled") ?? false;

    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
    });

    this.prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$connect();
      this.logger.log("Database connection established");
    } catch (error) {
      this.logger.error("Failed to connect to database", error);
      process.exit(1); // Fail fast
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // Exponer cada modelo como getter tipado
  get item() {
    return this.prisma.item;
  }
  get user() {
    return this.prisma.user;
  }
  // ... un getter por modelo del schema

  get $transaction() {
    return this.prisma.$transaction.bind(this.prisma);
  }

  get $executeRawUnsafe() {
    return this.prisma.$executeRawUnsafe.bind(this.prisma);
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

> **Gotchas**
>
> - No usar `extends PrismaClient` — composición es más testeable.
> - `process.exit(1)` en `onModuleInit` es intencional — sin DB no tiene sentido iniciar.
> - Agregar un getter por cada modelo del schema. Si se omite, el modelo es inaccesible.
> - `$transaction` debe exponerse con `.bind(this.prisma)` para mantener el contexto.
> - **Scripts standalone** (fuera del contexto NestJS, e.g. `prisma/scripts/*.ts`): NO usar `new PrismaClient()` sin argumentos — Prisma 7.x requiere el driver adapter. Usar el mismo patrón `PrismaPg + Pool`, y llamar `pool.end()` en el `finally`.

---

## 12. Logging y Request Tracing

`[Base]` — Pino es Base (no Tier 1). Sin logs estructurados desde el día 1, los bugs de producción son indiagnosticables. X-Request-ID (también Base) requiere AsyncLocalStorage.

### RequestIdMiddleware

```typescript
// src/common/middleware/request-id.middleware.ts
import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { RequestContextService } from "@/common/services/request-context.service";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: any, res: any, next: () => void): void {
    const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    this.requestContext.run({ requestId }, next);
  }
}
```

### RequestContextService — AsyncLocalStorage

```typescript
// src/common/services/request-context.service.ts
import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run(context: RequestContext, callback: () => void): void {
    this.storage.run(context, callback);
  }

  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  setUserId(userId: string): void {
    const store = this.storage.getStore();
    if (store) store.userId = userId;
  }
}
```

### PinoLoggerService

Reemplaza Winston. Pino nativo + pino-pretty en dev + JSON en prod + child loggers para workers.

```typescript
// src/common/services/pino-logger.service.ts
import { Injectable, LoggerService } from "@nestjs/common";
import pino, { Logger } from "pino";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor(private readonly requestContext: RequestContextService) {
    const isDev = process.env.NODE_ENV !== "production";

    this.logger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      ...(isDev && {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
    });
  }

  private withContext(meta: Record<string, unknown>): Record<string, unknown> {
    const ctx = this.requestContext.getContext();
    return {
      ...meta,
      ...(ctx?.requestId && { requestId: ctx.requestId }),
      ...(ctx?.userId && { userId: ctx.userId }),
    };
  }

  log(
    message: string | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): void {
    const payload = typeof message === "object" ? message : { message };
    this.logger.info(this.withContext({ ...payload, ...meta }));
  }

  error(
    message: string | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): void {
    const payload = typeof message === "object" ? message : { message };
    this.logger.error(this.withContext({ ...payload, ...meta }));
  }

  warn(
    message: string | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): void {
    const payload = typeof message === "object" ? message : { message };
    this.logger.warn(this.withContext({ ...payload, ...meta }));
  }

  debug(
    message: string | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): void {
    const payload = typeof message === "object" ? message : { message };
    this.logger.debug(this.withContext({ ...payload, ...meta }));
  }

  /** Child logger para workers / BullMQ — incluye metadata fija en todos los logs */
  createChildLogger(metadata: Record<string, unknown>): Logger {
    return this.logger.child(metadata);
  }
}
```

### Registro del middleware

```typescript
// app.module.ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
```

### PII Obfuscation

```typescript
// src/common/utils/security.utils.ts
export function obfuscateEmail(email: string): string {
  return email.replace(/(.{2})(.*)(@.*)/, "$1***$3");
}
export function obfuscatePhone(phone: string): string {
  return phone.replace(/(\+\d{2})(\d+)(\d{4})/, "$1***$3");
}
export function obfuscateToken(token: string): string {
  return `${token.substring(0, 8)}...${token.substring(token.length - 4)}`;
}
```

> **Gotchas**
>
> - `RequestIdMiddleware` debe registrarse **antes** de guards e interceptors.
> - `AsyncLocalStorage` funciona correctamente con `async/await` — no hay que pasar contexto manualmente.
> - `createChildLogger()` en workers: `logger.child({ context: 'OrderWorker', jobId: job.id })`.
> - Nunca loggear contraseñas, tokens, ni datos personales — usar funciones de obfuscation.

---

## 13. Configuración — registerAs

`[Base]`

### appConfig con registerAs

```typescript
// src/config/app.config.ts
import { registerAs } from "@nestjs/config";

export const appConfig = registerAs("app", () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  logLevel: process.env.LOG_LEVEL ?? "info",

  database: {
    url: process.env.DATABASE_URL,
    sslEnabled: process.env.DB_SSL_ENABLED === "true",
  },

  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    publicKey: process.env.JWT_PUBLIC_KEY,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    accessTokenTtl: parseInt(process.env.JWT_ACCESS_TTL ?? "900", 10),
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ?? [
      "http://localhost:3000",
    ],
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER ?? "local",
    s3Bucket: process.env.AWS_S3_BUCKET,
    s3Region: process.env.AWS_REGION,
  },
}));

export type AppConfig = ReturnType<typeof appConfig>;
```

### Validación con Joi

```typescript
// src/config/env.validation.ts
import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "staging", "production", "test")
    .required(),
  PORT: Joi.number().default(3000),
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "debug")
    .default("info"),
  DATABASE_URL: Joi.string().required(),
  DB_SSL_ENABLED: Joi.boolean().default(false),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ISSUER: Joi.string().uri().required(),
  JWT_AUDIENCE: Joi.string().required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  CORS_ORIGINS: Joi.string().optional(),
  STORAGE_PROVIDER: Joi.string().valid("local", "s3").default("local"),
  AWS_S3_BUCKET: Joi.string().when("STORAGE_PROVIDER", {
    is: "s3",
    then: Joi.required(),
  }),
  AWS_REGION: Joi.string().when("STORAGE_PROVIDER", {
    is: "s3",
    then: Joi.required(),
  }),
});
```

### Registro en AppModule

```typescript
// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  load: [appConfig],
  validationSchema: envValidationSchema,
  validationOptions: { abortEarly: true },
}),
```

### Inyección tipada

```typescript
// En un service — totalmente tipado
constructor(private readonly configService: ConfigService<AppConfig>) {}

// Por path de punto
const dbUrl = this.configService.get<string>('app.database.url');

// getOrThrow para valores requeridos en runtime
const jwtKey = this.configService.getOrThrow<string>('app.jwt.publicKey');

// Por namespace con infer
const redis = this.configService.get('app.redis', { infer: true })!;
// redis.host, redis.port → tipado completo
```

> **Gotchas**
>
> - `abortEarly: true` — falla en el primer error de validación al startup, más fácil de diagnosticar.
> - `getOrThrow` para valores sin los cuales la app no puede funcionar.
> - `isGlobal: true` evita importar `ConfigModule` en cada feature module.

---

## 14. Caché

`[Tier 2]` — Requiere Redis. Introducir cuando el primer caso de uso de caché distribuida lo justifique.

```typescript
// app.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async (configService: ConfigService) => ({
    store: await redisStore({
      socket: {
        host: configService.get('app.redis.host'),
        port: configService.get('app.redis.port'),
      },
      password: configService.get('app.redis.password'),
      ttl: 60 * 1000, // TTL default: 60s
    }),
  }),
  inject: [ConfigService],
}),
```

```typescript
// Uso en un service
import { Inject } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";

@Injectable()
export class ItemsService {
  private readonly TTL = 5 * 60 * 1000; // 5 min
  private readonly PREFIX = "items";

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private cacheKey(orgId: string): string {
    return `${this.PREFIX}:org:${orgId}`;
  }

  async findAll(orgId: string): Promise<ItemResponseDto[]> {
    const key = this.cacheKey(orgId);
    const cached = await this.cache.get<ItemResponseDto[]>(key);
    if (cached) return cached;

    const items = await this.prisma.item.findMany({
      where: { orgId, deletedAt: null },
    });
    const response = items.map(this.mapToResponseDto);
    await this.cache.set(key, response, this.TTL);
    return response;
  }

  async create(dto: CreateItemDto): Promise<ItemResponseDto> {
    const item = await this.prisma.item.create({ data: dto });
    await this.cache.del(this.cacheKey(dto.orgId)); // invalidar
    return this.mapToResponseDto(item);
  }
}
```

**Convención de cache keys:** `{entidad}:{scope}:{id}` — ej. `items:org:{orgId}`, `profile:user:{userId}`

> **Gotchas**
>
> - Invalidar en create/update/delete — caché stale es peor que sin caché.
> - TTL como constante nombrada — evita magic numbers.
> - La key debe incluir todos los parámetros que afectan el resultado.

---

## 15. Seguridad

`[Base]`

```typescript
// src/common/utils/sanitize.utils.ts
const SENSITIVE_KEYS = [
  "password",
  "token",
  "refreshToken",
  "accessToken",
  "secret",
  "apiKey",
  "privateKey",
];

export function sanitizeData(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  if (Array.isArray(data)) return data.map(sanitizeData);
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => {
      const isSensitive = SENSITIVE_KEYS.some((k) =>
        key.toLowerCase().includes(k.toLowerCase()),
      );
      return [key, isSensitive ? "[REDACTED]" : sanitizeData(value)];
    }),
  );
}
```

```typescript
// src/common/utils/cookie.utils.ts — HttpOnly cookies para refresh tokens (web)
import { CookieOptions } from "express";

export const REFRESH_TOKEN_COOKIE = "refresh_token";

export function getRefreshTokenCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    path: "/api/v1/auth", // limitar scope
  };
}
```

> **Gotchas**
>
> - Helmet antes de otros middlewares de aplicación; `compression()` antes de Helmet (ver §21).
> - CSP bloquea Swagger UI — agregar `'unsafe-inline'` solo en development.
> - `sanitizeData()` antes de persistir en audit logs o enviar a sistemas externos.
> - Refresh tokens web → HttpOnly cookie. Mobile → body (apps nativas no tienen cookies).

---

## 16. Health Checks

`[Base]`

```typescript
// src/health/health.controller.ts
import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "@/common/decorators/public.decorator";
import { SkipResponseTransform } from "@/common/decorators/skip-response-transform.decorator";
import { PrismaHealthIndicator } from "./prisma-health.indicator";

@Controller("health")
@SkipThrottle()
@Public()
@SkipResponseTransform()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  liveness() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.prismaHealth.pingCheck("database"),
      () => this.memory.checkHeap("memory_heap", 150 * 1024 * 1024),
    ]);
  }
}
```

```typescript
// src/health/prisma-health.indicator.ts
import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$transaction([]);
      return this.getStatus(key, true);
    } catch {
      throw new HealthCheckError(
        "Database check failed",
        this.getStatus(key, false),
      );
    }
  }
}
```

> **Gotchas**
>
> - Liveness NO chequea dependencias externas — si la DB está caída, el proceso puede seguir.
> - Readiness SÍ chequea dependencias — si DB o Redis están caídos, el pod no recibe tráfico.
> - `@SkipThrottle()` obligatorio — K8s hace checks cada pocos segundos.
> - Health checks deben ser rápidos (<100ms) — `pingCheck` simple, no queries costosas.

---

## 17. File Upload y Storage

`[Tier 1]`

> ⚠️ **Fastify Incompatibility**: `multer` es middleware de Express y NO funciona con Fastify puro.
> Si usás Fastify (stack base de este proyecto), usá `@fastify/multipart` en su lugar.
> El ejemplo de abajo aplica solo si el proyecto usa Express como HTTP adapter.

```typescript
// src/common/interfaces/storage.interface.ts
export interface IStorageService {
  upload(file: Express.Multer.File, key: string): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
export const STORAGE_SERVICE = "STORAGE_SERVICE";

// src/storage/storage.module.ts
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>("app.storage.provider");
        return provider === "s3"
          ? new S3StorageService(configService)
          : new LocalStorageService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
```

```typescript
// Uso en controller
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
        new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
      ],
    }),
  )
  file: Express.Multer.File,
) {
  const url = await this.storageService.upload(file, `uploads/${Date.now()}-${file.originalname}`);
  return { url };
}
```

### Patrón correcto con Fastify: @fastify/multipart

```typescript
// main.ts — registrar el plugin de Fastify
import multipart from "@fastify/multipart";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
  });

  await app.listen(3000, "0.0.0.0");
}
```

```typescript
// upload.controller.ts — leer el archivo con FastifyRequest
import { Controller, Post, Req, BadRequestException } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { MultipartFile } from "@fastify/multipart";

@Controller("upload")
export class UploadController {
  @Post()
  async uploadFile(@Req() req: FastifyRequest) {
    const data = await req.file();

    if (!data) {
      throw new BadRequestException("No file uploaded");
    }

    const file: MultipartFile = data;
    const buffer = await file.toBuffer();

    // Validar tipo y tamaño
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException("File type not allowed");
    }

    // Procesar el buffer (subir a S3, guardar en disco, etc.)
    return { filename: file.filename, size: buffer.length };
  }
}
```

```typescript
// Para múltiples archivos:
@Post('multiple')
async uploadMultiple(@Req() req: FastifyRequest) {
  const files: MultipartFile[] = [];

  for await (const part of req.files()) {
    files.push(part);
  }

  const buffers = await Promise.all(files.map(f => f.toBuffer()));
  return { count: files.length };
}
```

> Package requerido: `@fastify/multipart`
>
> ```bash
> pnpm add @fastify/multipart
> pnpm add -D @types/node
> ```

---

## 18. Multi-tenant

`[Tier 2]` — Solo si la arquitectura requiere aislamiento por schema de DB.

### TenantService con Prisma

```typescript
// src/tenant/tenant.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async setSearchPath(tenantId: string): Promise<void> {
    // Validar UUID para prevenir SQL injection
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new Error(`Invalid tenant ID format: ${tenantId}`);
    }
    const schema = `tenant_${tenantId.replace(/-/g, "_")}`;
    await this.prisma.$executeRawUnsafe(
      `SET search_path TO "${schema}", public`,
    );
  }

  async resetSearchPath(): Promise<void> {
    await this.prisma.$executeRawUnsafe("SET search_path TO public");
  }
}
```

### TenantInterceptor

```typescript
// src/tenant/tenant.interceptor.ts
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { TenantService } from "./tenant.service";

export const NO_TENANT_KEY = "noTenant";
export const NoTenant = () => SetMetadata(NO_TENANT_KEY, true);

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantService: TenantService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const noTenant = this.reflector.getAllAndOverride<boolean>(NO_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (noTenant) return next.handle();

    const request = context.switchToHttp().getRequest<{ tenantId?: string }>();
    if (!request.tenantId)
      throw new BadRequestException("tenantId is required");

    await this.tenantService.setSearchPath(request.tenantId);
    return next.handle();
  }
}
```

### TenantGuard

```typescript
// src/tenant/tenant.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "@/prisma/prisma.service";
import { NO_TENANT_KEY } from "./tenant.interceptor";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const noTenant = this.reflector.getAllAndOverride<boolean>(NO_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (noTenant) return true;

    const request = context.switchToHttp().getRequest<{ tenantId?: string }>();
    if (!request.tenantId) throw new ForbiddenException("tenantId is required");

    const org = await this.prisma.organization.findFirst({
      where: { id: request.tenantId },
    });
    if (!org) throw new NotFoundException("Tenant not found");
    if (!org.isActive) throw new ForbiddenException("Tenant is inactive");

    return true;
  }
}
```

> **Gotchas**
>
> - `TenantGuard` debe ejecutarse DESPUÉS del JWT guard (que inyecta `tenantId` en `request`).
> - Siempre restablecer `search_path` a `public` — el pool comparte conexiones entre requests.
> - Validar UUID antes de `$executeRawUnsafe` — previene SQL injection.

---

## 19. BullMQ — Jobs y Workers

`[Tier 2]` — Requiere Redis. Introducir cuando aparezca el primer job asíncrono (emails, webhooks, reportes).

### Módulo de cola

> 📌 **Referencia**: La asignación de Redis databases está centralizada en `infra-stack.md §8`. Consultá ese archivo como fuente de verdad.

```typescript
// src/workers/workers.module.ts
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        connection: {
          host: cs.get<string>("app.redis.host", "localhost"),
          port: cs.get<number>("app.redis.port", 6379),
          password: cs.get<string>("app.redis.password"),
          db: 0, // DB 0 para queues (DB 1 para caché — ver backend-stack.md)
          connectTimeout: 2000,
          maxRetriesPerRequest: 0,
          enableOfflineQueue: false,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400 },
        },
      }),
    }),
    BullModule.registerQueue({ name: "my-queue" }),
  ],
  providers: [ItemDeliveryWorker],
  exports: [BullModule],
})
export class WorkersModule {}
```

### Worker

```typescript
// src/workers/item-delivery.worker.ts
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";

export interface MyJobData {
  itemId: string;
  userId: string;
}

@Processor("my-queue")
@Injectable()
export class ItemDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(ItemDeliveryWorker.name);

  async process(job: Job<MyJobData>): Promise<{ success: boolean }> {
    const childLogger = this.logger; // en proyectos reales: pinoLogger.createChildLogger({ jobId: job.id })
    childLogger.log(`Processing job ${job.id}`);

    try {
      await this.doWork(job.data.itemId, job.data.userId);
      return { success: true };
    } catch (error) {
      childLogger.error(
        `Job ${job.id} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // Re-throw para que BullMQ aplique el retry
    }
  }

  private async doWork(itemId: string, userId: string): Promise<void> {
    // implementación
  }
}
```

### Enqueue desde service

```typescript
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

@Injectable()
export class ItemsService {
  constructor(
    @InjectQueue("my-queue") private readonly queue: Queue<MyJobData>,
  ) {}

  async processAsync(itemId: string, userId: string): Promise<void> {
    await this.queue.add(
      "process-item",
      { itemId, userId },
      {
        jobId: `item-${itemId}`, // deduplicación — BullMQ no encola si ya existe
      },
    );
  }
}
```

> **Gotchas**
>
> - `BullModule.forRootAsync` antes de los módulos que usan `@InjectQueue`.
> - `enableOfflineQueue: false` — falla inmediatamente si Redis no está disponible.
> - Re-throw en el worker para que BullMQ aplique la política de reintentos.
> - `jobId` para deduplicación — usar con cuidado en reintentos.
> - Redis DB separada de caché (ej. `db: 0` para queues, `db: 1` para caché).

---

## 20. Testing Patterns

`[Base]`

### Mock de PrismaService

```typescript
// src/common/test/mock-prisma.ts
import { PrismaService } from "@/prisma/prisma.service";

export type MockPrismaService = {
  [K in keyof PrismaService]: jest.Mocked<PrismaService[K]>;
};

export const createMockPrismaService = (): MockPrismaService =>
  ({
    item: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(createMockPrismaService())),
  }) as unknown as MockPrismaService;
```

### Mock de ConfigService

```typescript
export const createMockConfigService = () => ({
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const config: Record<string, unknown> = {
      "app.database.url": "postgresql://localhost/test",
      "app.jwt.issuer": "https://auth.example.com",
      "app.redis.host": "localhost",
    };
    return config[key] ?? defaultValue;
  }),
  getOrThrow: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      "app.jwt.publicKey": "test-public-key",
    };
    if (!(key in config)) throw new Error(`Config key ${key} not found`);
    return config[key];
  }),
});
```

### Factory de datos de test

```typescript
// src/modules/items/__tests__/items.factory.ts
import { faker } from "@faker-js/faker";
import { CreateItemDto } from "../dto/create-item.dto";

export function createItemDto(
  overrides: Partial<CreateItemDto> = {},
): CreateItemDto {
  return {
    name: faker.commerce.productName(),
    email: faker.internet.email(),
    status: ItemStatus.ACTIVE,
    ...overrides,
  };
}

export function itemEntity(overrides: Partial<PrismaItem> = {}): PrismaItem {
  return {
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    email: faker.internet.email(),
    status: ItemStatus.ACTIVE,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

### Unit test de service

```typescript
// src/modules/items/__tests__/items.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { HttpStatus } from "@nestjs/common";
import { ItemsService } from "../items.service";
import { PrismaService } from "@/prisma/prisma.service";
import { createMockPrismaService } from "@/common/test/mock-prisma";
import { ErrorCodes } from "@/common/constants/error-codes";
import { itemEntity, createItemDto } from "./items.factory";

describe("ItemsService", () => {
  let service: ItemsService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ItemsService>(ItemsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("findById", () => {
    it("should return item DTO when found", async () => {
      const item = itemEntity();
      mockPrisma.item.findFirst.mockResolvedValue(item);

      const result = await service.findById(item.id);

      expect(result.id).toBe(item.id);
      expect(result.email).toBe(item.email);
      expect(mockPrisma.item.findFirst).toHaveBeenCalledWith({
        where: { id: item.id, deletedAt: null },
      });
    });

    it("should throw ITEM_001 when not found", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(null);

      await expect(service.findById("non-existent")).rejects.toMatchObject({
        code: ErrorCodes.ITEM_001,
      });
    });
  });
});
```

### E2E test con Supertest

```typescript
// test/items.e2e-spec.ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "@/app.module";

describe("ItemsController (e2e)", () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    authToken = await getTestAuthToken(app);
  });

  afterAll(() => app.close());

  it("GET /v1/items → 200 + paginación", async () => {
    const { body } = await request(app.getHttpServer())
      .get("/v1/items")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta).toMatchObject({
      total: expect.any(Number),
      page: 1,
      totalPages: expect.any(Number),
      hasNextPage: expect.any(Boolean),
    });
  });

  it("POST /v1/items → 400 si body inválido", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/v1/items")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "" })
      .expect(422);

    expect(body.error.code).toBe(ErrorCodes.VAL_001);
  });
});
```

### Tests de tiempo determinístico

```typescript
describe("token expiration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("should detect expired token after TTL", () => {
    jest.advanceTimersByTime(901 * 1000); // 15 min + 1 seg
    expect(service.isTokenExpired(token)).toBe(true);
  });
});
```

> **Gotchas**
>
> - `$transaction` mock: `jest.fn((cb) => cb(mockPrisma))` — simula que el callback recibe el mismo mock.
> - `expect.objectContaining({ code: 'ITEM_001' })` para testear `DomainException`.
> - Factories con `overrides` — evita hardcodear valores.
> - E2E tests deben limpiar la DB entre suites para ser determinísticos.
> - `jest.useFakeTimers()` en `beforeEach` + `jest.useRealTimers()` en `afterEach` — nunca dejar fake timers activos.

---

## 21. Bootstrap — main.ts

`[Base]`

```typescript
// src/main.ts
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { HttpAdapterHost } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";
import { DomainException } from "./common/exceptions/domain.exception";
import { ErrorCodes } from "./common/constants/error-codes";
import { HttpStatus } from "@nestjs/common";

let isShuttingDown = false;

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }), // Pino maneja el logging
  );

  // CRÍTICO para K8s/Docker: cierra limpiamente DB, Redis, BullMQ workers
  app.enableShutdownHooks();

  // Middleware de shutdown: rechazar nuevos requests durante el cierre
  app.use((_req: unknown, res: any, next: () => void) => {
    if (isShuttingDown) {
      res
        .status(503)
        .json({
          message: "Service is shutting down",
          code: "SERVICE_UNAVAILABLE",
        });
      return;
    }
    next();
  });

  process.on("SIGTERM", () => {
    isShuttingDown = true;
  });

  // 1. CORS
  const corsOrigins = process.env.CORS_ORIGINS?.split(",").map((o) =>
    o.trim(),
  ) ?? ["http://localhost:3000"];
  app.enableCors({
    origin: corsOrigins,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-request-id",
      "x-idempotency-key",
    ],
  });

  // 2. Helmet
  await app.register(import("@fastify/helmet"), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // 3. Global prefix (excluye raíz para health checks sin prefijo)
  app.setGlobalPrefix("api", { exclude: ["/"] });

  // 4. Swagger (solo fuera de producción)
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("My API")
      .setVersion(process.env.npm_package_version ?? "1.0.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "JWT",
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: "alpha" },
    });
  }

  // 5. ValidationPipe global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: process.env.NODE_ENV === "production",
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((err) =>
          Object.values(err.constraints ?? {}),
        );
        throw new DomainException(
          ErrorCodes.VAL_001,
          messages.join("; "),
          HttpStatus.UNPROCESSABLE_ENTITY,
          { fields: errors.map((e) => e.property) },
        );
      },
    }),
  );

  // 6. Interceptors globales SIN DI (los que tienen DI van en app.module.ts con APP_INTERCEPTOR)
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  // 7. Exception filter global (con HttpAdapterHost — Fastify-safe)
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  // 8. Iniciar servidor
  const port = parseInt(process.env.PORT ?? "3000", 10);
  await app.listen(port, "0.0.0.0");

  new Logger("Bootstrap").log(
    `Application started on port ${port} [${process.env.NODE_ENV}]`,
  );
}

bootstrap().catch((err: unknown) => {
  new Logger("Bootstrap").error(
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
```

> **Gotchas**
>
> - `enableShutdownHooks()` — obligatorio para deployments en contenedores.
> - Guards, filters e interceptors con DI → `APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR` en `AppModule`, no en `main.ts`.
> - Con Fastify: usar `@fastify/helmet` en lugar de `helmet` npm package.
> - Orden importa: CORS → Helmet → prefix → Swagger → ValidationPipe → interceptors → filter.
> - `0.0.0.0` como host — obligatorio en contenedores (no solo `localhost`).

---

## 22. OpenAPI / Swagger

`[Base]`

### Controller con decoradores completos

```typescript
@ApiTags('items')
@Controller('v1/items')
export class ItemsController {

  @ApiOperation({ summary: 'List all items', description: 'Returns paginated list' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  @Get()
  findAll(@Query() pagination: PaginationDto) { ... }

  @ApiOperation({ summary: 'Get item by ID' })
  @ApiOkResponse({ type: ItemResponseDto })
  @ApiNotFoundResponse({ description: 'Item not found' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { ... }

  @ApiOperation({ summary: 'Create item' })
  @ApiCreatedResponse({ type: ItemResponseDto })
  @Post()
  create(@Body() dto: CreateItemDto) { ... }

  @ApiOperation({ summary: 'Update item' })
  @ApiOkResponse({ type: ItemResponseDto })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) { ... }

  @ApiOperation({ summary: 'Delete item' })
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) { ... }
}
```

### @ApiResponse con ejemplos inline de error

```typescript
@ApiResponse({
  status: 422,
  description: 'Validation error',
  schema: {
    example: {
      error: {
        code: 'VAL_001',
        message: 'name must not be empty; email must be an email',
        statusCode: 422,
        details: { fields: ['name', 'email'] },
        timestamp: '2026-01-01T00:00:00.000Z',
        requestId: '550e8400-...',
        path: '/api/v1/items',
      },
    },
  },
})
@ApiResponse({
  status: 404,
  description: 'Item not found',
  schema: {
    example: {
      error: { code: 'ITEM_001', message: 'Item not found', statusCode: 404, details: null,
        timestamp: '2026-01-01T00:00:00.000Z', requestId: '...', path: '/api/v1/items/id' },
    },
  },
})
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) { ... }
```

---

## 23. Checklist de Setup Inicial

### Estructura base

- [ ] `src/common/` con guards, filters, interceptors, decorators, exceptions, utils, services, dto
- [ ] `src/prisma/` con `PrismaService` wrapper (`@Global`, no `extends PrismaClient`)
- [ ] `src/config/` con `registerAs` + Joi validation schema
- [ ] `src/health/` con liveness + readiness + `PrismaHealthIndicator`
- [ ] `CommonModule` marcado `@Global()`, exporta `PinoLoggerService` y `RequestContextService`

### Respuestas y errores

- [ ] `ResponseInterceptor` registrado como `APP_INTERCEPTOR`
- [ ] `@SkipResponseTransform()` decorator
- [ ] `DomainException` con code + message + status + details
- [ ] `AllExceptionsFilter` con `HttpAdapterHost` registrado en `main.ts`
- [ ] `ErrorCodes` con patrón `DOMINIO_NNN`
- [ ] `PaginationMetaDto` con `hasNextPage` / `hasPreviousPage`
- [ ] `PaginatedResponseDto.create()` + `.empty()` + `.map()`

### Autenticación

- [ ] `JwtAuthGuard` registrado como `APP_GUARD` (con diferenciación de errores)
- [ ] `RolesGuard` registrado como `APP_GUARD` (jerarquía numérica)
- [ ] `@Public()` para rutas sin auth
- [ ] `@Roles()` decorator
- [ ] `@Auth()` decorador compuesto
- [ ] `@CurrentUser()` con field projection
- [ ] `JwtStrategy` con soporte RS256

### Validación

- [ ] `ValidationPipe` con `whitelist`, `forbidNonWhitelisted`, `transform`, `disableErrorMessages` en prod
- [ ] `exceptionFactory` que lanza `DomainException` con `VAL_001`
- [ ] `ParseUUIDPipe` en todos los `:id` params
- [ ] `@ParseBoolean()` para booleans en query params
- [ ] `IsSafeString` validator disponible

### Observabilidad

- [ ] `RequestIdMiddleware` en `AppModule.configure()`
- [ ] `RequestContextService` con `AsyncLocalStorage`
- [ ] `PinoLoggerService` con `createChildLogger()` para workers
- [ ] `RequestLoggingInterceptor` con slow-request detection + body sanitization
- [ ] `AuditLogInterceptor` + `@AuditAction()` decorator
- [ ] PII obfuscation utils

### Seguridad

- [ ] Helmet (con `@fastify/helmet` si Fastify)
- [ ] CORS con origins desde env var
- [ ] `ThrottlerModule` con Redis store
- [ ] `CustomThrottlerGuard` que lanza `DomainException`
- [ ] `@SkipThrottle()` en health controller
- [ ] `sanitizeData()` utility
- [ ] HttpOnly cookie utils para refresh tokens

### Configuración

- [ ] `registerAs('app', ...)` con `AppConfig` type exportado
- [ ] Joi validation schema con todos los campos requeridos
- [ ] `abortEarly: true` en `validationOptions`
- [ ] `.env.example` con todas las variables

### Testing

- [ ] `createMockPrismaService()` helper
- [ ] `createMockConfigService()` helper
- [ ] Factories con `@faker-js/faker` + `overrides` pattern
- [ ] `coverageThreshold: { global: { lines: 70 } }` en jest.config
- [ ] Estructura `describe > describe > it` con AAA comments

### Bootstrap

- [ ] `enableShutdownHooks()`
- [ ] Graceful shutdown con `isShuttingDown` flag + SIGTERM handler
- [ ] Swagger deshabilitado en producción
- [ ] `disableErrorMessages: NODE_ENV === 'production'`
- [ ] Host `0.0.0.0` en `app.listen()`

---

## 24. Email Transaccional

`[Tier 2]`

> Usar cuando el proyecto necesite enviar emails (verificación, notificaciones, facturas, etc.)

### Stack recomendado

| Servicio     | Mejor para                                       | Free tier         |
| ------------ | ------------------------------------------------ | ----------------- |
| **Resend**   | Proyectos nuevos — API moderna, TypeScript-first | 3k emails/mes     |
| **SendGrid** | Proyectos enterprise con volumen alto            | 100/día           |
| **AWS SES**  | Ya en AWS ecosystem, costo muy bajo a escala     | 62k/mes desde EC2 |

**Decisión**: Resend para proyectos nuevos. AWS SES si ya estás en AWS.

### Setup con @nestjs-modules/mailer + Resend

```bash
pnpm add @nestjs-modules/mailer nodemailer resend
pnpm add -D @types/nodemailer
```

```typescript
// mail/mail.module.ts
import { MailerModule } from "@nestjs-modules/mailer";
import { HandlebarsAdapter } from "@nestjs-modules/mailer/dist/adapters/handlebars.adapter";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { join } from "path";

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: "smtp.resend.com",
          port: 465,
          secure: true,
          auth: {
            user: "resend",
            pass: config.get("app.resend.apiKey"),
          },
        },
        defaults: {
          from: `"${config.get("app.name")}" <noreply@${config.get("app.domain")}>`,
        },
        template: {
          dir: join(__dirname, "templates"),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
  exports: [MailerModule],
})
export class MailModule {}
```

```typescript
// mail/mail.service.ts
import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";

export interface WelcomeEmailContext {
  name: string;
  verificationUrl: string;
}

@Injectable()
export class MailService {
  constructor(private readonly mailer: MailerService) {}

  async sendWelcome(to: string, context: WelcomeEmailContext): Promise<void> {
    await this.mailer.sendMail({
      to,
      subject: "Verificá tu cuenta",
      template: "welcome", // templates/welcome.hbs
      context,
    });
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.mailer.sendMail({
      to,
      subject: "Recuperá tu contraseña",
      template: "password-reset",
      context: { resetUrl, expiresIn: "1 hora" },
    });
  }
}
```

### Envío async con BullMQ (recomendado para producción)

No envíes emails síncronamente en el request — si el servicio de email falla, el request falla. Usá una queue:

```typescript
// mail/mail.processor.ts
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { MailService } from "./mail.service";

export const MAIL_QUEUE = "mail";

export type MailJob =
  | { type: "welcome"; to: string; name: string; verificationUrl: string }
  | { type: "password-reset"; to: string; resetUrl: string };

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<MailJob>): Promise<void> {
    switch (job.data.type) {
      case "welcome":
        await this.mailService.sendWelcome(job.data.to, {
          name: job.data.name,
          verificationUrl: job.data.verificationUrl,
        });
        break;
      case "password-reset":
        await this.mailService.sendPasswordReset(
          job.data.to,
          job.data.resetUrl,
        );
        break;
    }
  }
}
```

```typescript
// Encolar desde el service (no enviar directo)
@InjectQueue(MAIL_QUEUE)
private readonly mailQueue: Queue<MailJob>;

await this.mailQueue.add(
  'send',
  { type: 'welcome', to: user.email, name: user.name, verificationUrl },
  { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
);
```

### Alternativa: React Email para templates

En lugar de Handlebars, podés usar [React Email](https://react.email) para crear templates con componentes React y renderizarlos a HTML:

```typescript
// Render a HTML y pasar a mailer
import { render } from "@react-email/render";
import { WelcomeEmail } from "./templates/welcome-email";

const html = await render(WelcomeEmail({ name, verificationUrl }));
await this.mailer.sendMail({ to, subject: "...", html });
```

> 📌 **Gotcha**: Los templates de React Email se renderizan en el servidor. Si usás monorepo, ponelos en un package compartido `@repo/emails`.

---

---

## 25. WebSockets y Server-Sent Events (SSE) [Tier 2]

> Usar cuando el proyecto necesite datos en tiempo real: métricas live, notificaciones push, actualizaciones de estado sin polling.

### Cuándo usar qué

| Tecnología     | Cuándo                                  | Casos de uso                              |
| -------------- | --------------------------------------- | ----------------------------------------- |
| **SSE**        | Flujo unidireccional servidor → cliente | Notificaciones, feeds, progreso de jobs   |
| **WebSockets** | Comunicación bidireccional              | Chat, colaboración en tiempo real, juegos |

> 📌 Para dashboards admin, **SSE es suficiente en el 80% de los casos** y es mucho más simple (HTTP nativo, sin upgrade de protocolo, funciona con proxies/load balancers sin config extra).

---

### Opción A: Server-Sent Events (SSE) con NestJS

```typescript
// notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Sse,
  MessageEvent,
  Param,
  UseGuards,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "@/auth/guards/jwt-auth.guard";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("stream")
  @Sse()
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    return this.notificationsService.getStream(user.sub);
  }
}
```

```typescript
// notifications/notifications.service.ts
import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

interface Notification {
  userId: string;
  type: string;
  payload: unknown;
}

@Injectable()
export class NotificationsService {
  private readonly events$ = new Subject<Notification>();

  // Llamar desde cualquier parte del sistema para emitir notificaciones
  emit(notification: Notification): void {
    this.events$.next(notification);
  }

  getStream(userId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((event) => event.userId === userId),
      map((event) => ({
        data: { type: event.type, payload: event.payload },
        id: Date.now().toString(),
      })),
    );
  }
}
```

```typescript
// Emitir desde cualquier servicio
@Injectable()
export class OrdersService {
  constructor(private readonly notifications: NotificationsService) {}

  async updateOrderStatus(orderId: string, status: string, userId: string) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    // Notificar al usuario en tiempo real
    this.notifications.emit({
      userId,
      type: "order.status_changed",
      payload: { orderId, status },
    });
  }
}
```

> ⚠️ **SSE y múltiples pods**: Con K8s y varios pods, el Subject de RxJS es local a cada pod. Si el usuario está conectado al pod A pero el evento se emite en el pod B, no llega. Solución: usar Redis Pub/Sub como bus de eventos entre pods:

```typescript
// Con Redis Pub/Sub para multi-pod
import { Redis } from "ioredis";

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly events$ = new Subject<Notification>();
  private subscriber: Redis;

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe("notifications");
    this.subscriber.on("message", (_, message) => {
      this.events$.next(JSON.parse(message));
    });
  }

  async onModuleDestroy() {
    await this.subscriber.quit();
  }

  async emit(notification: Notification): Promise<void> {
    await this.redis.publish("notifications", JSON.stringify(notification));
  }

  getStream(userId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((e) => e.userId === userId),
      map((e) => ({ data: e })),
    );
  }
}
```

---

### Opción B: WebSockets con @nestjs/websockets

```typescript
// chat/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards } from "@nestjs/common";
import { WsJwtGuard } from "@/auth/guards/ws-jwt.guard";

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: "/ws",
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    // Validar JWT y asociar usuario al socket
    try {
      const payload = await this.jwtService.verifyAsync(token);
      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`); // Room personal
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("message")
  @UseGuards(WsJwtGuard)
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; content: string },
  ) {
    const message = await this.chatService.save({
      userId: client.data.userId,
      ...data,
    });

    // Emitir a todos en la sala
    this.server.to(`room:${data.roomId}`).emit("message", message);
  }

  // Emitir desde otros servicios
  sendToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
```

```typescript
// Instalar dependencias para WebSockets
// pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
```

> 📌 **NestJS + Fastify + WebSockets**: `@nestjs/platform-socket.io` usa su propio servidor HTTP interno — es compatible con Fastify sin conflictos. Socket.io corre en paralelo al servidor Fastify.

---

## 26. RBAC Granular: Autorización a nivel de recurso [Tier 2]

> El RBAC jerárquico (ROOT > OWNER > ADMIN > USER) controla el acceso a rutas.
> La autorización a nivel de recurso controla si un usuario puede operar sobre un recurso específico.
> Corresponde al error `AUTHZ_002` del error catalog.

### El problema

```typescript
// ❌ MAL: cualquier usuario autenticado puede ver/editar órdenes de otros usuarios
@Get(':id')
async getOrder(@Param('id') id: string) {
  return this.ordersService.findById(id); // ¿Quién verifica que es la orden DEL usuario?
}
```

### Patrón: Policy Guard + Ownership Service

```typescript
// common/policies/policies.types.ts
export type PolicyAction = "read" | "create" | "update" | "delete" | "manage";

export interface PolicyAbility {
  can(action: PolicyAction, subject: unknown): boolean;
}

export interface PolicyHandler {
  handle(ability: PolicyAbility): boolean;
}
```

```typescript
// common/guards/policies.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AbilityFactory } from "../abilities/ability.factory";

export const CHECK_POLICIES_KEY = "check_policies";
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers = this.reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      context.getHandler(),
    );

    if (!handlers || handlers.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const ability = await this.abilityFactory.createForUser(request.user);

    const allowed = handlers.every((handler) => handler.handle(ability));
    if (!allowed) throw new ForbiddenException("AUTHZ_002");

    return true;
  }
}
```

```typescript
// modules/orders/policies/order.policies.ts
import { PolicyHandler, PolicyAbility } from "@common/policies/policies.types";
import { Order } from "../domain/order.entity";

// Política: solo el owner o un admin puede ver la orden
export class ReadOrderPolicy implements PolicyHandler {
  constructor(
    private readonly order: Order,
    private readonly userId: string,
  ) {}

  handle(ability: PolicyAbility): boolean {
    return this.order.userId === this.userId || ability.can("manage", "Order");
  }
}

export class UpdateOrderPolicy implements PolicyHandler {
  constructor(
    private readonly order: Order,
    private readonly userId: string,
  ) {}

  handle(ability: PolicyAbility): boolean {
    return this.order.userId === this.userId && ability.can("update", "Order");
  }
}
```

```typescript
// modules/orders/orders.controller.ts
@Get(':id')
@UseGuards(JwtAuthGuard)
async getOrder(
  @Param('id') id: string,
  @CurrentUser() user: JwtPayload,
) {
  const order = await this.ordersService.findById(id);

  // Verificar ownership manualmente en el service/controller
  if (order.userId !== user.sub && user.role !== 'ADMIN') {
    throw new ForbiddenException('AUTHZ_002');
  }

  return order;
}
```

### Patrón simple: Ownership Checks en Service (recomendado para la mayoría de los casos)

Para proyectos sin CASL/Casbin, el ownership check directo en el service es más simple y suficiente:

```typescript
// modules/orders/orders.service.ts
@Injectable()
export class OrdersService {
  async findByIdForUser(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException("RESOURCE_001");
    }

    // Solo el owner o admins pueden ver la orden
    const isOwner = order.userId === userId;
    const isAdmin = ["ADMIN", "ROOT"].includes(userRole);

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException("AUTHZ_002");
    }

    return order;
  }

  async updateForUser(
    id: string,
    dto: UpdateOrderDto,
    userId: string,
  ): Promise<Order> {
    // Primero verificar ownership
    await this.findByIdForUser(id, userId, "USER"); // fuerza verificación de ownership

    return this.prisma.order.update({
      where: { id },
      data: dto,
    });
  }
}
```

```typescript
// Controller limpio — la lógica de auth está en el service
@Get(':id')
@UseGuards(JwtAuthGuard)
async getOrder(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.ordersService.findByIdForUser(id, user.sub, user.role);
}
```

> 📌 **Cuándo usar CASL/Casbin**: Si las reglas de autorización son complejas (más de 5-6 combinaciones de rol+acción+recurso), CASL es la solución estructurada. Para la mayoría de admin/SaaS con 2-3 roles simples, el ownership check directo es más mantenible.

---

---

## §27 — Database Seeding [Base]

> El seeding provee datos de desarrollo reproducibles. Sin seeders, cada dev arranca con una base vacía y tiene que crear datos a mano — lento y no reproducible.

### Setup con Prisma

```typescript
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Limpiar en orden correcto (respetar foreign keys)
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // Crear usuarios
  const passwordHash = await argon2.hash("password123");

  const adminUser = await prisma.user.create({
    data: {
      email: "admin@example.com",
      name: "Admin User",
      password: passwordHash,
      role: "ADMIN",
    },
  });

  const regularUsers = await Promise.all(
    Array.from({ length: 10 }, () =>
      prisma.user.create({
        data: {
          email: faker.internet.email(),
          name: faker.person.fullName(),
          password: passwordHash,
          role: "USER",
        },
      }),
    ),
  );

  console.log(`✅ Created ${regularUsers.length + 1} users`);

  // Crear productos
  const products = await Promise.all(
    Array.from({ length: 20 }, () =>
      prisma.product.create({
        data: {
          name: faker.commerce.productName(),
          description: faker.commerce.productDescription(),
          price: parseFloat(faker.commerce.price({ min: 10, max: 500 })),
          stock: faker.number.int({ min: 0, max: 100 }),
          status: faker.helpers.arrayElement(["active", "inactive"]),
        },
      }),
    ),
  );

  console.log(`✅ Created ${products.length} products`);

  // Crear órdenes con relaciones
  const allUsers = [adminUser, ...regularUsers];
  const orders = await Promise.all(
    Array.from({ length: 30 }, () => {
      const user = faker.helpers.arrayElement(allUsers);
      const product = faker.helpers.arrayElement(products);
      const quantity = faker.number.int({ min: 1, max: 5 });

      return prisma.order.create({
        data: {
          userId: user.id,
          status: faker.helpers.arrayElement([
            "pending",
            "processing",
            "completed",
            "cancelled",
          ]),
          items: {
            create: [
              {
                productId: product.id,
                quantity,
                unitPrice: product.price,
              },
            ],
          },
          total: product.price * quantity,
        },
      });
    }),
  );

  console.log(`✅ Created ${orders.length} orders`);
  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Configuración en package.json

```json
// apps/backend/package.json (o package.json raíz si no es monorepo)
{
  "prisma": {
    "seed": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' prisma/seed.ts"
  }
}
```

### Comandos

```bash
# Seed inicial (después de migrate)
pnpm prisma db seed

# Reset completo: eliminar DB, migrar y seedear
pnpm prisma migrate reset

# Solo seedear (sin resetear)
pnpm prisma db seed
```

### Seed por entorno

```typescript
// prisma/seed.ts — detectar entorno
const isCI = process.env.CI === "true";
const isStagingReset = process.env.SEED_STAGING === "true";

async function main() {
  if (isCI) {
    // En CI: solo datos mínimos para tests
    await seedMinimal();
  } else if (isStagingReset) {
    // En staging: datos más realistas
    await seedStaging();
  } else {
    // En desarrollo local: datos ricos para explorar
    await seedDevelopment();
  }
}
```

> 📌 **Instalación**: `pnpm add -D @faker-js/faker ts-node`
>
> ⚠️ **Gotcha**: `prisma migrate reset` **elimina todos los datos** y corre los seeders. Nunca configurar en producción. Usar solo en desarrollo y CI.
>
> ⚠️ **Gotcha con ESM**: Si el proyecto usa `"type": "module"` en package.json, el comando de seed necesita `--esm`: `ts-node --esm prisma/seed.ts`

---

## §28 — Optimistic Locking [Tier 2]

> Previene conflictos cuando dos usuarios intentan modificar el mismo recurso simultáneamente.
> Corresponde al error `RESOURCE_005` del error catalog.
> Alternativa a los locks pesimistas (SELECT FOR UPDATE) — más performante para la mayoría de los casos.

### El problema sin optimistic locking

```
Usuario A lee orden v1  ──┐
Usuario B lee orden v1  ──┼──── ambos leen la misma versión
Usuario A actualiza v1 → v2
Usuario B actualiza v1 → v2  ← sobrescribe los cambios de A sin saberlo ❌
```

### Implementación con campo `version`

```prisma
// prisma/schema.prisma
model Order {
  id        String   @id @default(cuid())
  status    String
  total     Decimal
  version   Int      @default(1)  // ← campo de versión
  updatedAt DateTime @updatedAt
  // ... otros campos
}
```

```typescript
// modules/orders/orders.repository.ts
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async updateWithVersion(
    id: string,
    data: Partial<Order>,
    expectedVersion: number,
  ): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verificar que la versión actual coincide con la esperada
      const current = await tx.order.findUnique({
        where: { id },
        select: { version: true },
      });

      if (!current) {
        throw new NotFoundException("RESOURCE_001");
      }

      if (current.version !== expectedVersion) {
        throw new ConflictException("RESOURCE_005");
      }

      // 2. Actualizar incrementando la versión
      return tx.order.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
        },
      });
    });
  }
}
```

```typescript
// modules/orders/orders.service.ts
async update(id: string, dto: UpdateOrderDto, userId: string): Promise<Order> {
  // Verificar ownership primero
  await this.findByIdForUser(id, userId, 'USER');

  return this.ordersRepository.updateWithVersion(id, dto, dto.version);
}
```

### DTO con version

```typescript
// modules/orders/dto/update-order.dto.ts
export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsInt()
  @Min(1)
  version: number; // ← requerido para detectar conflictos
}
```

### Manejo del error en el frontend

```typescript
// Cuando el backend retorna RESOURCE_005, notificar al usuario
// y recargar los datos más recientes

const updateOrder = useMutation({
  mutationFn: (data: UpdateOrderDto) => api.patch(`/orders/${orderId}`, data),
  onError: (error: ApiError) => {
    if (error.code === "RESOURCE_005") {
      // Invalida el cache para forzar un refetch con la versión actualizada
      queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
      toast.error(
        "Alguien más modificó esta orden. Los datos se actualizaron.",
      );
      return;
    }
    toast.error(getErrorMessage(error.code));
  },
});
```

### Alternativa: Optimistic Updates en el frontend con rollback

```typescript
// Para UX más fluida: actualizar la UI antes de la respuesta del servidor
const updateOrder = useMutation({
  mutationFn: (data: UpdateOrderDto) => api.patch(`/orders/${orderId}`, data),

  onMutate: async (newData) => {
    // Cancelar queries en vuelo para evitar sobreescrituras
    await queryClient.cancelQueries({ queryKey: ["orders", orderId] });

    // Guardar snapshot del valor anterior
    const previousOrder = queryClient.getQueryData(["orders", orderId]);

    // Actualizar optimisticamente
    queryClient.setQueryData(["orders", orderId], (old: Order) => ({
      ...old,
      ...newData,
    }));

    return { previousOrder };
  },

  onError: (error, _, context) => {
    // Rollback en caso de error
    queryClient.setQueryData(["orders", orderId], context?.previousOrder);

    if (error.code === "RESOURCE_005") {
      toast.error("Conflicto de versión — datos actualizados");
    }
  },

  onSettled: () => {
    // Siempre refetch para sincronizar con el servidor
    queryClient.invalidateQueries({ queryKey: ["orders", orderId] });
  },
});
```

> 📌 **Cuándo usar optimistic locking**: Recursos que múltiples usuarios pueden editar simultáneamente (documentos, órdenes en proceso, configs compartidas).
>
> 📌 **Cuándo usar locks pesimistas** (`SELECT FOR UPDATE`): Operaciones financieras donde la consistencia es crítica y el tiempo de lock es muy corto (débito de saldo, reserva de stock).
>
> ⚠️ **Gotcha**: Si un proceso batch actualiza registros sin incluir el `version`, va a romper el mecanismo de locking para esos registros. Siempre usar `updateWithVersion` para recursos con optimistic locking habilitado.

---

## §29 — Bull Board: Monitoreo de Queues [Tier 2]

> Bull Board es la UI oficial para visualizar y gestionar jobs de BullMQ. Indispensable para debuggear jobs fallidos en producción.

### Setup en NestJS + Fastify

```typescript
// queue/bull-board.setup.ts
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { BullBoardModule } from "@bull-board/nestjs";
import { FastifyAdapter } from "@bull-board/fastify";

// En AppModule o QueueModule
@Module({
  imports: [
    BullBoardModule.forRoot({
      route: "/admin/queues",
      adapter: FastifyAdapter,
    }),
    BullBoardModule.forFeature({
      name: MAIL_QUEUE,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: "reports",
      adapter: BullMQAdapter,
    }),
    // Agregar todas las queues del proyecto
  ],
})
export class QueueModule {}
```

### Proteger la ruta con Basic Auth

```typescript
// main.ts — proteger /admin/queues con Basic Auth en producción
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import fastifyBasicAuth from "@fastify/basic-auth";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const fastify = app.getHttpAdapter().getInstance();

  // Registrar Basic Auth solo para la ruta de queues
  await fastify.register(fastifyBasicAuth, {
    validate: async (username, password) => {
      const validUser = process.env.BULL_BOARD_USER;
      const validPass = process.env.BULL_BOARD_PASSWORD;
      if (username !== validUser || password !== validPass) {
        throw new Error("Unauthorized");
      }
    },
    authenticate: true,
  });

  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/admin/queues")) {
      await (fastify as any).basicAuth(request, reply);
    }
  });

  await app.listen(3000, "0.0.0.0");
}
```

### Variables de entorno requeridas

```bash
# .env
BULL_BOARD_USER=admin
BULL_BOARD_PASSWORD=supersecret_change_in_production
```

### Packages requeridos

```bash
pnpm add @bull-board/api @bull-board/nestjs @bull-board/fastify
pnpm add @fastify/basic-auth
```

### Acceso

- **Desarrollo**: `http://localhost:3000/admin/queues`
- **Producción**: `https://api.yourdomain.com/admin/queues` (protegido con Basic Auth)

> ⚠️ **Seguridad**: Nunca exponer `/admin/queues` sin autenticación en producción. Basic Auth es suficiente para acceso interno — si necesitás acceso más robusto, ponerlo detrás de una VPN o IP whitelist.
>
> 📌 **En K8s**: Si la ruta `/admin/queues` no debe ser pública, configurar el Ingress para que solo sea accesible internamente (sin exposición al Ingress público). Ver `infra-stack.md §6` para configuración de Ingress.

_Mantener actualizado al establecer nuevos patrones._
_Última actualización: 2026-03-19_
