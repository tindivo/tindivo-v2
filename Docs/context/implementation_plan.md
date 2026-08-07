# Plan Corregido v4 — Parte 3: Capa API del Sistema de Apelaciones v2

## Contexto y Estado Actual

Las migraciones 0067 y 0068 están aplicadas en `psjigdoinfpgrnedxeyf`. La Parte 3 conecta el motor PostgreSQL con la capa HTTP de `apps/api` y actualiza los consumidores afectados.

### Auditoría de Consumidores de `/resolve`

El consumidor del endpoint `POST /admin/reports/[id]/resolve` es:

- **[apps/admin/app/reportes/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/app/reportes/page.tsx)** — envía `{ status: 'resolved' | 'dismissed', resolutionAction: 'refund_customer' | 'none' }`.

**Hallazgo clave:** el frontend ya distingue dos ramas por `r.type`:
- `rejected_proof_disputed` → botones "Reembolsar cliente" / "Descartar"
- **otros tipos** (antifraude, prepago, etc.) → botones "Resolver" / "Descartar"

Esto significa que **no podemos reemplazar la lógica de `/resolve` con la RPC `resolve_appeal`** sin más, porque los reportes no-apelación también usan ese endpoint.

**Estrategia:** crear endpoints dedicados para apelaciones y conservar el endpoint genérico intacto para los demás tipos de reporte.

### Estado Actual de Archivos

| Archivo | Estado |
|---------|--------|
| `apps/api/lib/mappers/appeal.ts` | ✅ Ya existe — función `mapReportRowToDto` |
| `packages/contracts/src/appeal.ts` | ⚠️ `AppealReportDto` sin DTOs separados admin/cliente, `appealDeadline` no admite `null`, `RegisterRefundSchema` sin validación real de ruta Storage, sin schemas Zod para DTOs |
| `POST /customer/orders/[id]/appeal` | ✅ Funciona |
| `GET /customer/orders/[id]/appeal` | ❌ No existe |
| `GET /admin/reports` | ⚠️ Existe sin filtros de tipo/appeal_status, sin DTO completo |
| `GET /admin/appeals` | ❌ No existe |
| `POST /admin/reports/[id]/resolve` | ⚠️ Usa UPDATE directo + `create_contingency_advance`. Debe conservarse intacto para reportes no-apelación |
| `POST /admin/appeals/[id]/resolve` | ❌ No existe (nuevo endpoint dedicado) |
| `POST /admin/appeals/[id]/review` | ❌ No existe (nuevo endpoint dedicado) |
| `POST /admin/appeals/[id]/refund` | ❌ No existe (nuevo endpoint dedicado) |
| `apps/api/lib/http/rpc-error.ts` | ❌ No existe |

---

## Cambios Propuestos

---

### 1. `@tindivo/contracts` — Correcciones de Contratos

#### [MODIFY] `packages/contracts/src/appeal.ts`

##### 1a. Validación real de `refundProofPath`

Reemplazar la validación mínima actual por una que rechace URLs, `..`, backslashes y garantice formato `carpeta/archivo.ext`:

```ts
export const RegisterRefundSchema = z.object({
  refundProofPath: z
    .string()
    .trim()
    .min(3, 'La ruta del comprobante es requerida')
    .max(500, 'La ruta es demasiado larga')
    .refine((value) => !/^https?:\/\//i.test(value), {
      message: 'Debe enviarse una ruta de Storage, no una URL',
    })
    .refine((value) => !value.startsWith('/'), {
      message: 'La ruta no debe comenzar con /',
    })
    .refine((value) => !value.includes('..') && !value.includes('\\'), {
      message: 'La ruta contiene segmentos inválidos',
    })
    .refine((value) => /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(value), {
      message: 'Ruta de Storage inválida — use formato carpeta/archivo.ext',
    }),
  amount: z
    .number()
    .finite('El monto debe ser un número finito')
    .positive('El monto debe ser positivo')
    .multipleOf(0.01, 'El monto debe tener precisión monetaria (máximo 2 decimales)'),
})
```

##### 1b. DTOs separados: `CustomerAppealDto` + `AdminAppealDto`

El DTO del cliente **nunca debe exponer** UUIDs internos de admin, `createdBy`, `refundProofPath` ni campos operativos:

```ts
/** DTO que recibe el cliente dueño de la apelación — solo info relevante para su caso */
export interface CustomerAppealDto {
  id: string
  orderId: string
  appealStatus: AppealStatus
  refundStatus: RefundStatus | null
  refundAmount: number | null
  refundCompletedAt: string | null
  appealDeadline: string | null
  description: string | null
  status: string
  createdAt: string
  updatedAt: string
}

/** DTO completo para el panel admin — incluye auditoría, ownership y campos operativos */
export interface AdminAppealDto {
  id: string
  orderId: string
  orderShortId: string | null       // del join orders(short_id)
  businessId: string
  customerUserId: string
  customerPhone: string | null
  description: string | null
  evidenceUrl: string | null
  appealStatus: AppealStatus
  refundStatus: RefundStatus | null
  refundProofPath: string | null
  refundAmount: number | null
  refundCompletedAt: string | null
  appealDeadline: string | null     // null si el registro es anterior a 0067
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionNote: string | null       // explicación de la resolución para consulta futura
  createdBy: string | null
  type: string
  status: string
  createdAt: string
  updatedAt: string
}
```

##### 1c. Schemas Zod para ambos DTOs (derivar tipos)

```ts
export const CustomerAppealDtoSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  appealStatus: AppealStatusSchema,
  refundStatus: RefundStatusSchema.nullable(),
  refundAmount: z.number().positive().nullable(),
  refundCompletedAt: z.string().datetime().nullable(),
  appealDeadline: z.string().datetime().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()
export type CustomerAppealDto = z.infer<typeof CustomerAppealDtoSchema>

export const AdminAppealDtoSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderShortId: z.string().nullable(),
  businessId: z.string().uuid(),
  customerUserId: z.string().uuid(),
  customerPhone: z.string().nullable(),
  description: z.string().nullable(),
  evidenceUrl: z.string().nullable(),
  appealStatus: AppealStatusSchema,
  refundStatus: RefundStatusSchema.nullable(),
  refundProofPath: z.string().nullable(),
  refundAmount: z.number().positive().nullable(),
  refundCompletedAt: z.string().datetime().nullable(),
  appealDeadline: z.string().datetime().nullable(),
  resolvedBy: z.string().uuid().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  type: z.string(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()
export type AdminAppealDto = z.infer<typeof AdminAppealDtoSchema>
```

##### 1d. `.strict()` en todos los schemas de entrada

Para que los payloads y query params rechacen propiedades desconocidas (no solo las ignoren), todos los schemas de entrada deben usar `.strict()`:

```ts
export const CreateAppealSchema = z.object({
  description: z.string().trim().max(500).optional(),
}).strict()

export const ResolveAppealSchema = z.object({
  resolution: z.enum(['favor_cliente', 'favor_restaurante']),
  note: z.string().trim().max(1000).optional(),
}).strict()

export const RegisterRefundSchema = z.object({
  refundProofPath: /* ... validaciones ... */,
  amount: /* ... validaciones ... */,
}).strict()
```

Esto garantiza que los tests 34 (rechazo de campos extra) y 35 (sin campos admin en respuesta del cliente) sean verificables.

##### 1e. Query params Zod para `GET /admin/appeals`

```ts
export const AppealListQuerySchema = z.object({
  appeal_status: z.enum(['pending', 'in_review', 'approved', 'rejected']).optional(),
  refund_status: z.enum(['pending', 'completed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
})

export const AppealListResponseSchema = z.object({
  items: z.array(AdminAppealDtoSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  perPage: z.number().int().min(1).max(100),
})
export type AppealListResponse = z.infer<typeof AppealListResponseSchema>
```

#### [MODIFY] `packages/contracts/src/__tests__/appeal.test.ts`

Ampliar tests de contratos:

- `RegisterRefundSchema`:
  - Rechaza `https://dominio.com/comprobante.png` (URL completa)
  - Rechaza `/refunds/proof.png` (comienza con `/`)
  - Rechaza `../escape/proof.png` (path traversal)
  - Rechaza `refunds\\proof.png` (backslash)
  - Rechaza `file` (sin separador `/`)
  - Rechaza string vacío
  - Rechaza monto negativo
  - Acepta `refunds/2024/proof.png`
  - Acepta `comprobantes/refund_01.webp`
- `ResolveAppealSchema`: caso de `note` con más de 1000 chars → rechazado
- `CustomerAppealDtoSchema`: parse válido, rechaza campos extra (admin fields)
- `AdminAppealDtoSchema`: parse completo con `orderShortId`
- `AppealListQuerySchema`: `page=0` rechazado, `per_page=101` rechazado

---

### 2. `apps/api/lib/mappers/appeal.ts` — Mapper (ampliar)

#### [MODIFY] `apps/api/lib/mappers/appeal.ts`

- Renombrar `mapReportRowToDto` → `toCustomerAppealDto` y crear `toAdminAppealDto`.
- El mapper de admin recibe la fila con el join anidado (`orders(short_id)`) correctamente tipado.
- `appealDeadline`: devolver `null` cuando `row.appeal_deadline` sea `null` (registros anteriores a 0067), sin fallback a `created_at`.

```ts
import {
  AppealStatusSchema,
  RefundStatusSchema,
  type AdminAppealDto,
  type CustomerAppealDto,
} from '@tindivo/contracts'
import type { Tables } from '@tindivo/supabase'

// ── Tipos de fila según el select de cada endpoint ──────────────────────────
// Cada tipo refleja exactamente los campos que devuelve el .select() del handler.
// No se usa Tables<'reports'> completo porque ningún endpoint hace select('*').

type CustomerAppealRow = Pick<
  Tables<'reports'>,
  | 'id'
  | 'order_id'
  | 'appeal_status'
  | 'refund_status'
  | 'refund_amount'
  | 'refund_completed_at'
  | 'appeal_deadline'
  | 'description'
  | 'status'
  | 'created_at'
  | 'updated_at'
>

type AdminAppealRow = Pick<
  Tables<'reports'>,
  | 'id'
  | 'order_id'
  | 'business_id'
  | 'customer_user_id'
  | 'customer_phone'
  | 'description'
  | 'evidence_url'
  | 'appeal_status'
  | 'refund_status'
  | 'refund_proof_path'
  | 'refund_amount'
  | 'refund_completed_at'
  | 'appeal_deadline'
  | 'resolved_by'
  | 'resolved_at'
  | 'resolution_note'
  | 'created_by'
  | 'type'
  | 'status'
  | 'created_at'
  | 'updated_at'
> & { orders: { short_id: string } | null }

// ── Validaciones separadas según el contexto ────────────────────────────────

function assertCustomerAppealFields(row: CustomerAppealRow): void {
  const missing = []
  if (!row.order_id) missing.push('order_id')
  if (!row.appeal_status) missing.push('appeal_status')
  if (missing.length) {
    throw new Error(`Apelación de cliente incompleta ${row.id}: faltan ${missing.join(', ')}`)
  }
}

function assertAdminAppealFields(row: AdminAppealRow): void {
  const missing = []
  if (!row.order_id) missing.push('order_id')
  if (!row.business_id) missing.push('business_id')
  if (!row.customer_user_id) missing.push('customer_user_id')
  if (!row.appeal_status) missing.push('appeal_status')
  if (missing.length) {
    throw new Error(`Apelación administrativa incompleta ${row.id}: faltan ${missing.join(', ')}`)
  }
}

// ── Mappers ─────────────────────────────────────────────────────────────────

export function toCustomerAppealDto(row: CustomerAppealRow): CustomerAppealDto {
  assertCustomerAppealFields(row)
  return {
    id: row.id,
    orderId: row.order_id!,
    appealStatus: AppealStatusSchema.parse(row.appeal_status),
    refundStatus: row.refund_status ? RefundStatusSchema.parse(row.refund_status) : null,
    refundAmount: row.refund_amount !== null && row.refund_amount !== undefined ? Number(row.refund_amount) : null,
    refundCompletedAt: row.refund_completed_at ?? null,
    appealDeadline: row.appeal_deadline ?? null,
    description: row.description ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toAdminAppealDto(row: AdminAppealRow): AdminAppealDto {
  assertAdminAppealFields(row)
  return {
    id: row.id,
    orderId: row.order_id!,
    orderShortId: row.orders?.short_id ?? null,
    businessId: row.business_id!,
    customerUserId: row.customer_user_id!,
    customerPhone: row.customer_phone ?? null,
    description: row.description ?? null,
    evidenceUrl: row.evidence_url ?? null,
    appealStatus: AppealStatusSchema.parse(row.appeal_status),
    refundStatus: row.refund_status ? RefundStatusSchema.parse(row.refund_status) : null,
    refundProofPath: row.refund_proof_path ?? null,
    refundAmount: row.refund_amount !== null && row.refund_amount !== undefined ? Number(row.refund_amount) : null,
    refundCompletedAt: row.refund_completed_at ?? null,
    appealDeadline: row.appeal_deadline ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
    resolutionNote: row.resolution_note ?? null,
    createdBy: row.created_by ?? null,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

---

### 3. `apps/api/lib/http/rpc-error.ts` — Helper de Errores RPC (nuevo)

#### [NEW] `apps/api/lib/http/rpc-error.ts`

Mapper centralizado con **clasificación por mensaje conocido** para `P0001`, ya que las RPC actuales comparten ese SQLSTATE para distintas situaciones:

```ts
import { DomainError } from '@tindivo/core'

/** Mensajes conocidos de P0001 que mapean a 409 Conflict (estado incompatible) */
const CONFLICT_PATTERNS = [
  /ya (ha sido|fue) (resuelta|devuelto|revisada)/i,
  /already (resolved|refunded|reviewed)/i,
  /not in .* status/i,
  /cannot \w+ because/i,
]

/** Mensajes conocidos de P0001 que mapean a 422 (validación) */
const VALIDATION_PATTERNS = [
  /amount.*(exceeds|incorrecto|superior)/i,
  /monto/i,
  /deadline.*expired/i,
  /plazo.*vencido/i,
  /invalid/i,
]

export function throwRpcError(error: { code: string; message: string }): never {
  // P0002: recurso no encontrado → 404
  if (error.code === 'P0002') {
    throw new DomainError(error.message, 'not_found')
  }

  // P0001: clasificar según mensaje conocido
  if (error.code === 'P0001') {
    if (CONFLICT_PATTERNS.some((p) => p.test(error.message))) {
      throw new DomainError(error.message, 'conflict')
    }
    if (VALIDATION_PATTERNS.some((p) => p.test(error.message))) {
      throw new DomainError(error.message, 'validation_error')
    }
    // Fallback seguro: 422 para P0001 desconocidos
    throw new DomainError(error.message, 'validation_error')
  }

  // 42501: permisos insuficientes → 403
  if (error.code === '42501') {
    throw new DomainError(error.message, 'forbidden')
  }

  // Cualquier otro código: 500
  throw new Error(error.message)
}
```

> [!NOTE]
> El plan a futuro (migración nueva) debería asignar SQLSTATEs diferenciados a cada RPC para eliminar la clasificación por regex. Esto se documenta como deuda técnica aceptada para la Parte 3.

---

### 4. `POST /admin/reports/[id]/resolve` — Bloquear apelaciones, conservar lo demás

#### [MODIFY] `apps/api/app/api/v1/admin/reports/[id]/resolve/route.ts`

Este endpoint **conserva su lógica actual** para reportes no-apelación (antifraude, revisión de prepago, etc.), pero se le añade una **protección explícita** para rechazar reportes de tipo `rejected_proof_disputed`:

```ts
// Antes del UPDATE, tras obtener el reporte:
if (rep?.type === 'rejected_proof_disputed') {
  throw new DomainError(
    'Las apelaciones deben resolverse desde el endpoint dedicado: POST /admin/appeals/[id]/resolve',
    'conflict',
  )
}
```

Esto impide que alguien llame directamente a este endpoint y resuelva una apelación mediante el `UPDATE` antiguo, saltándose las RPC y la máquina de estados.

Los reportes de tipo `rejected_proof_disputed` se resolverán exclusivamente desde los nuevos endpoints dedicados (§5, §6, §7).

---

### 5. Nuevos Endpoints Dedicados de Apelaciones (`/admin/appeals/[id]/...`)

**Rutas nuevas que reemplazan a `/admin/reports/[id]/resolve` solo para apelaciones:**

```
POST /api/v1/admin/appeals/[id]/resolve   ← llama a resolve_appeal RPC
POST /api/v1/admin/appeals/[id]/review    ← llama a mark_appeal_in_review RPC
POST /api/v1/admin/appeals/[id]/refund    ← llama a register_appeal_refund RPC
```

Todos usan `createUserClient(token)` (el JWT del admin = `auth.uid()` en la RPC) y `throwRpcError`.

**Validación de `[id]`:** todos los endpoints validan el parámetro de ruta con `z.string().uuid()` antes de pasarlo a Supabase:

```ts
const ReportIdSchema = z.string().uuid()
const reportId = ReportIdSchema.parse(id)
// ... usar siempre reportId, no id
```

Lo mismo aplica al `[id]` del pedido en `GET /customer/orders/[id]/appeal` y en el `POST` existente.

#### [NEW] `apps/api/app/api/v1/admin/appeals/[id]/resolve/route.ts`

```ts
import { ResolveAppealSchema } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { throwRpcError } from '@/lib/http/rpc-error'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'admin')
    const { id } = await params
    const reportId = ReportIdSchema.parse(id)  // ← validar antes de usar
    const body = ResolveAppealSchema.parse(await req.json())

    const client = createUserClient(token)
    const { data, error } = await client.rpc('resolve_appeal', {
      p_report_id: reportId,                   // ← usar el valor validado
      p_resolution: body.resolution,
      p_note: body.note ?? null,
    })

    if (error) throwRpcError(error)
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
```

#### [NEW] `apps/api/app/api/v1/admin/appeals/[id]/review/route.ts`

```ts
// Requiere rol admin. Llama a mark_appeal_in_review(p_report_id).
// Retorna { ok: true, appealStatus: 'in_review' }.
// Usa throwRpcError para mapear errores.
```

#### [NEW] `apps/api/app/api/v1/admin/appeals/[id]/refund/route.ts`

```ts
// Requiere rol admin. Body validado con RegisterRefundSchema.
// Llama a register_appeal_refund(p_report_id, p_refund_proof_path, p_amount).
// Usa throwRpcError para mapear errores.
// Retorna { ok: true, refundCompleted: true }.
```

---

### 6. `GET /admin/appeals` — Bandeja Dedicada de Apelaciones

#### [NEW] `apps/api/app/api/v1/admin/appeals/route.ts`

Endpoint dedicado para la bandeja de apelaciones (no mezcla con reportes de fraude/antifraude):

**Query params validados con `AppealListQuerySchema`:**
```ts
appeal_status?: 'pending' | 'in_review' | 'approved' | 'rejected'
refund_status?: 'pending' | 'completed'
page: número ≥ 1 (default 1)
per_page: número 1–100 (default 50)
```

**Cliente:** `createUserClient(token)` (no `createServiceClient()`).

> [!CAUTION]
> **Precondición para implementar:** antes de codificar este endpoint, debe auditarse que un admin autenticado pueda leer `reports` y el join `orders(short_id)` vía RLS. Ejecutar en el SQL Editor de `psjigdoinfpgrnedxeyf`:
> ```sql
> SELECT schemaname, tablename, policyname, roles, cmd, qual
> FROM pg_policies
> WHERE schemaname = 'public'
>   AND tablename IN ('reports', 'orders');
> ```
> Si no existe una política que permita a `authenticated` con rol `admin` leer `reports` y `orders`, debe crearse una **migración nueva** (ej. `0069_admin_appeals_read_policy.sql`) con la política correspondiente, o una RPC de lectura estrecha (`SECURITY DEFINER` que verifique `is_admin()`). **No debe sustituirse por `service_role`.**

**Select completo con join y conteo:**
```ts
.select(`
  id, type, status, order_id, business_id, customer_user_id, customer_phone,
  description, evidence_url, appeal_status, refund_status, refund_amount,
  refund_proof_path, refund_completed_at, appeal_deadline,
  resolved_by, resolved_at, resolution_note, created_by, created_at, updated_at,
  orders(short_id)
`, { count: 'exact' })
.eq('type', 'rejected_proof_disputed')
```

**Orden estable antes de paginar:**
```ts
.order('created_at', { ascending: false })
.order('id', { ascending: false })
```

Sin el segundo criterio (`id`), una apelación podría aparecer en dos páginas distintas cuando se insertan nuevos registros con el mismo `created_at`.

**Paginación:** `.range(offset, offset + per_page - 1)`.

**Respuesta (wrapper, no header personalizado):**
```json
{
  "items": [/* AdminAppealDto[] */],
  "total": 42,
  "page": 1,
  "perPage": 50
}
```

Esto evita depender de `Access-Control-Expose-Headers: X-Total-Count` y funciona sin configuración adicional de CORS.

---

### 7. `GET /admin/reports` — Sin cambios de interfaz

Se conserva **intacto** para no romper `alerts-bell.tsx` y el flujo de reportes antifraude que también lo usa con `?status=open`. La página de apelaciones usará el nuevo `GET /admin/appeals`.

---

### 8. `GET /customer/orders/[id]/appeal` — Nuevo método en route existente

#### [MODIFY] `apps/api/app/api/v1/customer/orders/[id]/appeal/route.ts`

Añadir método `GET` al archivo existente:

- Requiere rol `customer`.
- Usa `createUserClient(token)` — **NO `createServiceClient()`** — para que la RLS basada en `auth.uid()` sea la primera barrera.
- Filtro explícito redundante: `.eq('customer_user_id', user.id)` como segunda barrera (defense in depth).
- `.eq('type', 'rejected_proof_disputed')`.
- Si no existe: `404 not_found`.
- Si existe: retorna `CustomerAppealDto` mapeado con `toCustomerAppealDto`.

```ts
// GET /customer/orders/[id]/appeal
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token, user } = await requireRole(req, 'customer')
    const { id } = await params

    const client = createUserClient(token)  // ← RLS activa con auth.uid()
    const { data, error } = await client
      .from('reports')
      .select('id, order_id, appeal_status, refund_status, refund_amount, refund_completed_at, appeal_deadline, description, status, created_at, updated_at')
      .eq('order_id', id)
      .eq('type', 'rejected_proof_disputed')
      .eq('customer_user_id', user.id)      // ← segunda barrera de ownership
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Apelación no encontrada', 'not_found')

    return ok(toCustomerAppealDto(data), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
```

---

### 9. `apps/admin/app/reportes/page.tsx` — Actualizar Frontend

#### [MODIFY] `apps/admin/app/reportes/page.tsx`

Actualizar en la misma PR. La rama de apelaciones (`rejected_proof_disputed`) ahora llama a los nuevos endpoints dedicados:

```tsx
{r.type === 'rejected_proof_disputed' ? (
  <>
    <Button
      size="sm"
      disabled={busyId === r.id}
      onClick={() => resolveAppeal(r.id, 'favor_cliente')}
    >
      Aprobar apelación
    </Button>
    <Button
      size="sm"
      variant="ghost"
      disabled={busyId === r.id}
      onClick={() => resolveAppeal(r.id, 'favor_restaurante')}
    >
      Descartar
    </Button>
  </>
) : (
  // ... lógica existente sin cambios para otros tipos de reporte
)}
```

> [!IMPORTANT]
> "Aprobar apelación" (`resolve_appeal` → `favor_cliente`) solo cambia `appeal_status = approved`. El `refund_status` queda `pending`. **No se registra la devolución ni el comprobante en este paso.**
>
> La acción de devolución es un paso separado que requiere `POST /admin/appeals/[id]/refund` con monto y comprobante. El panel debe reflejar esta distinción: una apelación aprobada con `refund_status = pending` aún necesita que se registre la devolución.

Y la nueva función:

```ts
async function resolveAppeal(id: string, resolution: 'favor_cliente' | 'favor_restaurante') {
  setBusyId(id)
  try {
    await api.post(`/admin/appeals/${id}/resolve`, { resolution })
    load()
  } catch (e) {
    setError(errMsg(e))
  } finally {
    setBusyId(null)
  }
}
```

La rama de **otros tipos de reporte** sigue usando `POST /admin/reports/[id]/resolve` con la interfaz legacy intacta.

---

### 10. Tests Ampliados

#### [MODIFY] `packages/contracts/src/__tests__/appeal.test.ts`

Ver §1 para los casos nuevos de `RegisterRefundSchema`, `ResolveAppealSchema`, `CustomerAppealDtoSchema`, `AdminAppealDtoSchema`, `AppealListQuerySchema`.

#### [MODIFY] `apps/api/lib/inngest/__tests__/appeal-fallback.test.ts`

Verificar que el test existente no dependa de imports de runtime de Inngest.

#### [NEW] `apps/api/app/api/v1/admin/appeals/__tests__/appeal-routes.test.ts`

**Enfoque:** los tests no dependen de un servidor real ni de `fetch` mockeado global. Se importan los handlers directamente y se mockean sus dependencias (`requireRole`, `createUserClient`, `createServiceClient`). Se recomienda además un **smoke test manual** contra el entorno de desarrollo para confirmar que el JWT del admin llega efectivamente a `auth.uid()` en las RPC.

**Lista completa:**

| # | Test | Esperado |
|---|------|----------|
| 1 | `POST /appeals/[id]/resolve` sin `Authorization` | 401 |
| 2 | `POST /appeals/[id]/resolve` con rol `customer` | 403 |
| 3 | `POST /appeals/[id]/resolve` con `favor_cliente` → RPC OK | 200 |
| 4 | `POST /appeals/[id]/resolve` con `favor_restaurante` → RPC OK | 200 |
| 5 | `POST /appeals/[id]/resolve` apelación ya resuelta | 409 |
| 6 | `POST /appeals/[id]/resolve` reporte no existe (P0002) | 404 |
| 7 | `POST /appeals/[id]/resolve` sin permisos RLS (42501) | 403 |
| 8 | `POST /appeals/[id]/review` sin `Authorization` | 401 |
| 9 | `POST /appeals/[id]/review` con rol `customer` | 403 |
| 10 | `POST /appeals/[id]/review` idempotente (ya `in_review`) | 200 `alreadyInReviewOrResolved: true` |
| 11 | `POST /appeals/[id]/review` → RPC OK | 200 |
| 12 | `POST /appeals/[id]/refund` sin `Authorization` | 401 |
| 13 | `POST /appeals/[id]/refund` con rol `customer` | 403 |
| 14 | `POST /appeals/[id]/refund` sin `refundProofPath` | 422 |
| 15 | `POST /appeals/[id]/refund` con `refundProofPath` como URL | 422 |
| 16 | `POST /appeals/[id]/refund` con `refundProofPath` con `../` | 422 |
| 17 | `POST /appeals/[id]/refund` monto negativo | 422 |
| 18 | `POST /appeals/[id]/refund` monto no múltiplo de 0.01 | 422 |
| 19 | `POST /appeals/[id]/refund` monto excede orden | 422 |
| 20 | `POST /appeals/[id]/refund` OK | 200 |
| 21 | `GET /admin/appeals` sin token | 401 |
| 22 | `GET /admin/appeals` con rol `customer` | 403 |
| 23 | `GET /admin/appeals?appeal_status=in_review` | 200, solo `in_review` |
| 24 | `GET /admin/appeals?page=0` | 422 |
| 25 | `GET /admin/appeals?per_page=101` | 422 |
| 26 | `GET /admin/appeals` conteo total correcto | 200, `total` coincide |
| 27 | `GET /customer/orders/:id/appeal` sin token | 401 |
| 28 | `GET /customer/orders/:id/appeal` otro cliente (RLS + filtro) | 404 |
| 29 | `GET /customer/orders/:id/appeal` sin apelación | 404 |
| 30 | `GET /customer/orders/:id/appeal` OK — verifica `CustomerAppealDtoSchema` sin campos admin | 200 |
| 31 | `POST /admin/reports/[id]/resolve` con reporte NO apelación | 200 (legado intacto) |
| 32 | `POST /admin/reports/[id]/resolve` con reporte tipo `rejected_proof_disputed` | 409 (bloqueado) |
| 33 | `POST /admin/appeals/[id]/resolve` con `[id]` no UUID | 422 |
| 34 | `POST /admin/appeals/[id]/refund` con payload con campos extra (`.strict()`) | 422 |
| 35 | `GET /customer/orders/:id/appeal` — DTO no expone `resolvedBy` ni `refundProofPath` | 200, sin campos admin |
| 36 | Smoke test: JWT admin → `auth.uid()` en RPC (manual contra dev) | 200, sin error RLS |

---

## Plan de Verificación

### Automatizado
```bash
pnpm --filter @tindivo/contracts test         # contratos actualizados
pnpm --filter @tindivo/contracts type-check
pnpm --filter @tindivo/api test               # tests de rutas + outbox
pnpm --filter @tindivo/api type-check
pnpm --filter @tindivo/admin type-check       # sin rotura en reportes/page.tsx
```

### Manual (SQL Editor `psjigdoinfpgrnedxeyf`)

**Paso 1 — Auditoría RLS (obligatorio antes de implementar):**
```sql
-- Verificar políticas RLS existentes sobre reports y orders
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reports', 'orders');

-- Si no existe política que permita a authenticated (admin) leer reports + orders(short_id),
-- crear migración 0069_admin_appeals_read_policy.sql ANTES de codificar GET /admin/appeals.
```

**Paso 2 — Verificar RPCs:**
```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('resolve_appeal','mark_appeal_in_review','register_appeal_refund');

-- Verificar privilegios de ejecución
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'resolve_appeal',
    'mark_appeal_in_review',
    'register_appeal_refund'
  );

-- Confirmar que:
--   authenticated tenga EXECUTE
--   anon NO tenga acceso
--   service_role NO tenga EXECUTE (según lo definido en 0067)
```

**Paso 3 — Smoke tests contra desarrollo (post-implementación):**
1. `GET /admin/appeals` con JWT de admin — verificar join `orders(short_id)`.
2. `GET /customer/orders/[id]/appeal` con propietario y con otro cliente — verificar RLS + filtro.

---

## Resumen de Correcciones (v3 → v4)

| # | Feedback (ronda 2) | Corrección |
|---|--------------------|------------|
| 1 | Legacy endpoint no bloquea apelaciones | Guard explícito: `if (rep?.type === 'rejected_proof_disputed')` → 409 |
| 2 | Mappers inventan UUIDs vacíos y estados | `assertRequiredFields()` lanza si faltan datos; `AppealStatusSchema.parse()` en vez de `as` |
| 3 | Schemas sin `.strict()` | `.strict()` en `CustomerAppealDtoSchema` y `AdminAppealDtoSchema` |
| 4 | Botón "Reembolsar cliente" engañoso | "Aprobar apelación" + nota explicando que la devolución es paso separado |
| 5 | Monto sin precisión monetaria, `[id]` sin validar | `.finite().multipleOf(0.01)` + `z.string().uuid()` en todos los `[id]` |
| 6 | `GET /admin/appeals` sin definir cliente | `createUserClient(token)` explícito; si falta política RLS → documentar deuda, no usar `service_role` |
| 7 | Paginación sin orden estable | `.order('created_at').order('id')` — doble criterio |
| 8 | `select('*')` en GET del cliente | Select con solo campos de `CustomerAppealDto` |
| — | `resolutionNote` ausente en DTO admin | Campo `resolutionNote` en interfaz y schema |
| — | Join type manual frágil | Nota sobre verificar contra `QueryData<>` o tipos generados |
| — | Tests solo con "fetch mockeado" | Enfoque: importar handlers + mockear dependencias + smoke test manual JWT |

---

## Evaluación Final (v4 — aprobada para implementación)

El plan cubre las 3 rondas de feedback. **Aprobado con 4 condiciones que se incorporan directamente durante la implementación** (no requieren nueva versión del plan):

| # | Condición | Dónde se aplica |
|---|-----------|-----------------|
| 1 | Tipos de fila exactos según cada `select` (`CustomerAppealRow`, `AdminAppealRow`) + asserts separados | §2 — Mapper |
| 2 | `.strict()` en `CreateAppealSchema`, `ResolveAppealSchema`, `RegisterRefundSchema` | §1d — Contratos |
| 3 | Auditoría RLS con `pg_policies` **antes** de codificar; crear migración 0069 si falta política | §6 + Plan de Verificación |
| 4 | Usar `reportId` (validado) en vez de `id` (raw) en todas las llamadas RPC | §5 — Endpoints |

**No se modifican las migraciones 0067 ni 0068.** Cualquier ajuste de políticas va en una migración nueva (0069+).

**Lo que quedó resuelto:** endpoints dedicados, bloqueo legacy, JWT admin en RPC, doble barrera cliente (RLS + filtro), DTOs separados, `.strict()` en DTOs y payloads, validación real de rutas Storage, mappers sin inventar datos, validación runtime con Zod, paginación con conteo y orden estable, flujo resolve/refund en dos pasos, precisión monetaria, UUID validation, 36 casos de prueba, smoke tests manuales.
