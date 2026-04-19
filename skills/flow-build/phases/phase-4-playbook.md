## PHASE 4 (Playbook Mode): Security Decisions (5-8 min)

> **Modo**: Playbook activo — las políticas de seguridad técnicas ya están definidas.
> El playbook cubre: JWT + refresh token, bcrypt/argon2, Helmet, CORS, ThrottlerModule, rate limits por defecto.
> Esta fase captura solo las decisiones de seguridad que dependen del NEGOCIO y el DOMINIO.
>
> **Referencia de playbook resuelta:** usar `PLAYBOOK_REFERENCE_LABEL` cuando la documentación generada deba citar el playbook.
> Si `PLAYBOOK_SOURCE=shared`, no asumir `playbook/` local ni escribir paths absolutos del sistema.

> **Asumido por defecto del playbook:**
> - Autenticación: JWT **RS256** — access token 15min (body JSON) + refresh token 7 días (httpOnly cookie) → `api-contract.md §6-7` + `backend-stack.md §JWT`
> - Hashing: argon2 (Tier 2+) / bcrypt 10 rounds (Base/Tier 1) → `backend-stack.md §Política de Contraseñas`
> - Rate limiting: 5/15min auth, 100/min público, 30/min writes → `backend-stack.md §Rate Limiting por Tipo de Endpoint`
> - CORS: lista blanca explícita, credentials: true → `backend-stack.md §CORS — Política por Defecto`
> - Headers: Helmet con HSTS, frameguard: deny, noSniff → `backend-stack.md §Seguridad HTTP — Headers Estándar`
> - TLS: obligatorio en producción con cert-manager → `infra-stack.md §Tier 2`

---

### 4.1 Modelo de Autorización

```
¿Cómo se manejan los permisos en este proyecto?

A) ⭐ RBAC — Roles fijos (admin, user, etc.)
   Recomendado para la mayoría de proyectos
   
B) RBAC multi-tenant — Organización → Roles dentro de la org
   Para SaaS con múltiples organizaciones/workspaces
   
C) Ownership — El usuario solo accede a sus propios recursos
   Para apps personales simples
   
D) ABAC — Permisos por atributos (complejo, enterprise)

Tu elección: __

Lista los roles de ESTE proyecto (los del dominio del negocio):
Ej: admin, manager, operator, viewer, guest
Roles: __
```

---

### 4.2 Compliance y Regulaciones

```
¿Este proyecto debe cumplir alguna regulación? (seleccioná las que apliquen)

A) GDPR — Usuarios en la Unión Europea
   Impacto: derecho al olvido, exportación de datos, consent management
   
B) HIPAA — Datos de salud (healthcare)
   Impacto: PHI encryption, audit logs estrictos, BAA con proveedores
   
C) PCI-DSS — Procesamiento directo de tarjetas de crédito
   Impacto: nunca almacenar CVV, tokenización, transmisión encriptada
   (Si usás Stripe/MercadoPago como intermediario → generalmente no aplica PCI-DSS directo)
   
D) SOC 2 — SaaS vendiendo a enterprise
   Impacto: controles de seguridad documentados, audit trails
   
E) Ninguna regulación específica por ahora

Selección: __

[Si seleccionó alguna → preguntar:]
Para cada regulación: ¿cuáles son los requerimientos concretos que impactan el código?
Ej: "GDPR → endpoint DELETE /me que borra todos los datos del usuario"
```

---

### 4.3 Campos Sensibles del Dominio

```
¿Este proyecto almacena campos que requieren encriptación a nivel aplicación?
(Más allá de passwords que ya maneja bcrypt/argon2)

Ejemplos comunes:
- DNI / número de documento de identidad
- Número de tarjeta (si no usás un payment provider)
- Tokens de integración de terceros (API keys de clientes)
- Datos médicos / diagnósticos
- Números de cuenta bancaria

¿Qué campos de ESTE dominio necesitan encriptación en DB?
(Si ninguno → "ninguno por ahora")

Campos: __
```

---

### 4.4 Reglas de Acceso Específicas del Dominio

```
¿Hay reglas de acceso especiales que no son solo "rol tiene permiso"?

Ejemplos:
- "Un manager solo puede ver usuarios de su sucursal"
- "Los reportes financieros requieren 2FA siempre, sin excepción"
- "Los datos de X entidad no se pueden exportar bajo ningún concepto"
- "El endpoint de auditoría es solo lectura, ni siquiera admin puede modificar"

Reglas especiales: __ (o "ninguna por ahora")
```

---

### Phase 4 Output

```
📋 SEGURIDAD DEL PROYECTO:

Autorización: [modelo elegido + roles del dominio]
Compliance: [regulaciones + impactos concretos / ninguna]
Campos encriptados: [lista / ninguno]
Reglas especiales: [lista / ninguna]

Asumido del playbook:
✅ JWT RS256 — access 15min + refresh 7 días httpOnly (ver api-contract.md §6-7 + backend-stack.md §JWT)
✅ Password hashing: [bcrypt/argon2 según tier] (ver backend-stack.md §Política de Contraseñas)
✅ Rate limiting (ver backend-stack.md §Rate Limiting por Tipo de Endpoint)
✅ CORS + Helmet (ver backend-stack.md §CORS — Política por Defecto + §Seguridad HTTP — Headers Estándar)
```

**Generar automáticamente:**

1. `specs/security.md`
    - Modelo de autorización + roles
    - Compliance requerida con impactos
    - Campos sensibles + estrategia de encriptación
    - Reglas de acceso especiales
    - Referencia al playbook para el resto de las políticas usando `PLAYBOOK_REFERENCE_LABEL`

2. Actualizar `ai-instructions.md`
   - Agregar sección de reglas de seguridad del proyecto

```
✅ Generado: specs/security.md
✅ Actualizado: ai-instructions.md

¿Alguna corrección antes de continuar? (S/N)
```

---

**Next Phase:** Phase 5 (Playbook) — Project Rules & Exceptions

Next: read phase-5-playbook.md from this phases/ directory

---

_Version: 1.0 (Playbook Mode)_
_Last Updated: 2026-03-28_
