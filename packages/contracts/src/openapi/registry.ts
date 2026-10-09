import { z } from 'zod'
import type { ApiErrorCode } from '../errors'
import { CreateOrderRequestSchema } from '../requests'
import {
  CourierServiceStatusSchema,
  HealthResponseSchema,
  PilotAccessResponseSchema,
  ScheduleStatusSchema,
  SearchCatalogQuerySchema,
  SearchCatalogResponseSchema,
} from './public-responses'

/**
 * Registro de las operaciones de `/api/v1` que usan las apps del cliente.
 *
 * Es la fuente del OpenAPI (`buildOpenApiDocument`). Un test recorre
 * `apps/api/app/api/v1/{customer,public,push,health}` y falla si una ruta o un
 * método no está aquí: una ruta sin documentar no pasa el CI (estándar API-2).
 *
 * `documented: false` marca lo que aún no tiene esquema de respuesta (lote
 * MV2b): sale en el OpenAPI con `x-tindivo-pending` para que nadie genere un
 * cliente contra una forma inventada.
 */

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/**
 * Cómo viaja el cuerpo de éxito. `data` = `{ data: … }` (`ok()`); `raw` = el
 * objeto tal cual (`raw()`, rutas heredadas); `none` = sin cuerpo (`204`).
 */
export type Envelope = 'data' | 'raw' | 'none'

export interface SuccessResponse {
  description: string
  envelope: Envelope
  schema?: z.ZodType
}

export interface OperationSpec {
  method: HttpMethod
  /** Relativa a `/api/v1`, con parámetros como `{id}`. */
  path: string
  operationId: string
  summary: string
  description?: string
  tags: string[]
  /** `customer` = Bearer con rol de cliente; `user` = Bearer de cualquier rol. */
  auth: 'none' | 'customer' | 'user'
  pathParams?: Record<string, z.ZodType>
  query?: z.ZodObject
  body?: z.ZodType
  /** Acepta la cabecera `Idempotency-Key`. */
  idempotent?: boolean
  success: Record<number, SuccessResponse>
  /** Errores de negocio documentados, además de `internal_error`. */
  errors?: ApiErrorCode[]
  documented: boolean
}

const uuidParam = z.uuid()
const shortIdParam = z.string().meta({ description: 'Identificador corto público (8 caracteres)' })

/** Respuesta cuya forma aún no está descrita. La envoltura y el código sí están medidos en la ruta. */
const pending = (envelope: Envelope): SuccessResponse => ({
  description: 'Forma pendiente de documentar (lote MV2b)',
  envelope,
})

export const OPERATIONS: OperationSpec[] = [
  // ── Sistema ────────────────────────────────────────────────────────────────
  {
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    summary: 'Estado de la API',
    tags: ['system'],
    auth: 'none',
    success: {
      200: { description: 'La API responde', envelope: 'data', schema: HealthResponseSchema },
    },
    documented: true,
  },

  // ── Público: catálogo y horario ───────────────────────────────────────────
  {
    method: 'get',
    path: '/public/schedule',
    operationId: 'getOrderIntakeStatus',
    summary: 'Si la plataforma recibe pedidos ahora y en qué horario',
    tags: ['public'],
    auth: 'none',
    success: {
      200: {
        description: 'Estado de la recepción',
        envelope: 'data',
        schema: ScheduleStatusSchema,
      },
    },
    documented: true,
  },
  {
    method: 'get',
    path: '/public/search',
    operationId: 'searchCatalog',
    summary: 'Buscar negocios y platos',
    tags: ['public'],
    auth: 'none',
    query: SearchCatalogQuerySchema,
    success: {
      200: {
        description: 'Hasta 20 negocios y 20 platos, del más parecido al menos',
        envelope: 'data',
        schema: SearchCatalogResponseSchema,
      },
    },
    errors: ['validation_error'],
    documented: true,
  },
  {
    method: 'get',
    path: '/public/businesses',
    operationId: 'listBusinesses',
    summary: 'Negocios publicados',
    tags: ['public'],
    auth: 'none',
    success: { 200: pending('data') },
    documented: false,
  },
  {
    method: 'get',
    path: '/public/businesses/{id}',
    operationId: 'getBusiness',
    summary: 'Un negocio con su carta',
    tags: ['public'],
    auth: 'none',
    pathParams: { id: z.string().meta({ description: 'UUID o slug del negocio' }) },
    success: { 200: pending('data') },
    errors: ['not_found'],
    documented: false,
  },
  {
    method: 'post',
    path: '/public/pilot-access',
    operationId: 'checkPilotAccess',
    summary: 'Acceso al piloto cerrado (ya no restringe)',
    description:
      'El piloto cerrado terminó: hoy responde siempre `allowed: true, pilotActive: false`.',
    tags: ['public'],
    auth: 'none',
    success: {
      200: { description: 'Acceso permitido', envelope: 'data', schema: PilotAccessResponseSchema },
    },
    documented: true,
  },

  // ── Público: seguimiento ───────────────────────────────────────────────────
  {
    method: 'get',
    path: '/public/orders/{shortId}',
    operationId: 'getOrderTracking',
    summary: 'Seguimiento público de un pedido (24 h)',
    tags: ['public', 'orders'],
    auth: 'none',
    pathParams: { shortId: shortIdParam },
    success: { 200: pending('raw') },
    errors: ['not_found'],
    documented: false,
  },
  {
    method: 'get',
    path: '/public/courier/status',
    operationId: 'getCourierServiceStatus',
    summary: 'Si el servicio de Entregas está abierto, su horario y su precio base',
    tags: ['public', 'courier'],
    auth: 'none',
    success: {
      200: {
        description: 'Estado del servicio, sin envoltura',
        envelope: 'raw',
        schema: CourierServiceStatusSchema,
      },
    },
    documented: true,
  },
  {
    method: 'get',
    path: '/public/courier/{shortId}',
    operationId: 'getCourierTracking',
    summary: 'Seguimiento público de una entrega',
    tags: ['public', 'courier'],
    auth: 'none',
    pathParams: { shortId: shortIdParam },
    success: { 200: pending('raw') },
    errors: ['not_found'],
    documented: false,
  },

  // ── Público: Tindivo Store ─────────────────────────────────────────────────
  {
    method: 'get',
    path: '/public/store',
    operationId: 'listStoreProducts',
    summary: 'Productos de Tindivo Store',
    tags: ['public', 'store'],
    auth: 'none',
    success: { 200: pending('data') },
    documented: false,
  },
  {
    method: 'get',
    path: '/public/store/{slug}',
    operationId: 'getStoreProduct',
    summary: 'Un producto de Tindivo Store',
    tags: ['public', 'store'],
    auth: 'none',
    pathParams: { slug: z.string() },
    success: { 200: pending('data') },
    documented: false,
  },
  {
    method: 'post',
    path: '/public/store/events',
    operationId: 'trackStoreEvent',
    summary: 'Registrar un evento de Tindivo Store',
    tags: ['public', 'store'],
    auth: 'none',
    success: { 204: { description: 'Registrado; sin cuerpo', envelope: 'none' } },
    documented: false,
  },

  // ── Cliente: pedidos de restaurante ────────────────────────────────────────
  {
    method: 'post',
    path: '/customer/orders',
    operationId: 'createOrder',
    summary: 'Crear un pedido',
    tags: ['orders'],
    auth: 'customer',
    body: CreateOrderRequestSchema,
    idempotent: true,
    success: { 201: pending('data') },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict', 'idempotency_conflict'],
    documented: false,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/cancel',
    operationId: 'cancelOrder',
    summary: 'Cancelar un pedido propio',
    tags: ['orders'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },
  {
    method: 'get',
    path: '/customer/orders/{id}/prepay-info',
    operationId: 'getPrepayInfo',
    summary: 'Datos para pagar por adelantado (QR, monto, plazo)',
    tags: ['orders', 'payments'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/prepay-proof',
    operationId: 'confirmPrepayProof',
    summary: 'Confirmar el comprobante de pago subido',
    tags: ['orders', 'payments'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },
  {
    method: 'get',
    path: '/customer/orders/{id}/appeal',
    operationId: 'getOrderAppeal',
    summary: 'Estado de la apelación de un pedido',
    tags: ['orders', 'appeals'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/appeal',
    operationId: 'createOrderAppeal',
    summary: 'Apelar un pedido rechazado',
    tags: ['orders', 'appeals'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },
  {
    method: 'get',
    path: '/customer/appeals',
    operationId: 'listAppeals',
    summary: 'Apelaciones del cliente',
    tags: ['appeals'],
    auth: 'customer',
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },

  // ── Cliente: Entregas ──────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/customer/courier-orders',
    operationId: 'createCourierOrder',
    summary: 'Pedir una entrega',
    tags: ['courier'],
    auth: 'customer',
    idempotent: true,
    success: { 201: pending('data') },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict', 'idempotency_conflict'],
    documented: false,
  },
  {
    method: 'post',
    path: '/customer/courier-orders/{id}/cancel',
    operationId: 'cancelCourierOrder',
    summary: 'Cancelar una entrega propia',
    tags: ['courier'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden'],
    documented: false,
  },

  // ── Cliente: teléfono ──────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/customer/phone/send-code',
    operationId: 'sendPhoneCode',
    summary: 'Enviar el código de verificación por SMS',
    tags: ['account'],
    auth: 'customer',
    success: { 200: pending('data') },
    errors: ['unauthorized', 'forbidden', 'conflict', 'rate_limited'],
    documented: false,
  },
  {
    method: 'post',
    path: '/customer/phone/verify',
    operationId: 'verifyPhoneCode',
    summary: 'Verificar el código recibido por SMS',
    tags: ['account'],
    auth: 'customer',
    success: { 200: pending('data') },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict'],
    documented: false,
  },

  // ── Avisos ─────────────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/push/subscriptions',
    operationId: 'createPushSubscription',
    summary: 'Registrar una suscripción de avisos (Web Push)',
    tags: ['push'],
    auth: 'user',
    success: { 201: pending('data') },
    errors: ['validation_error', 'unauthorized'],
    documented: false,
  },
  {
    method: 'get',
    path: '/push/subscriptions',
    operationId: 'listPushSubscriptions',
    summary: 'Suscripciones de avisos del usuario',
    tags: ['push'],
    auth: 'user',
    success: { 200: pending('data') },
    errors: ['unauthorized'],
    documented: false,
  },
  {
    method: 'delete',
    path: '/push/subscriptions',
    operationId: 'deletePushSubscription',
    summary: 'Dar de baja una suscripción de avisos',
    tags: ['push'],
    auth: 'user',
    success: { 200: pending('data') },
    errors: ['unauthorized'],
    documented: false,
  },
  {
    method: 'get',
    path: '/push/subscriptions/me',
    operationId: 'getMyPushSubscription',
    summary: 'Si este aparato tiene una suscripción activa',
    tags: ['push'],
    auth: 'user',
    success: { 200: pending('data') },
    errors: ['unauthorized'],
    documented: false,
  },
]
