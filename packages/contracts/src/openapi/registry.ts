import { z } from 'zod'
import {
  CreateOrderAppealRequestSchema,
  PrepayProofRequestSchema,
  PushSubscriptionRequestSchema,
  PushUnsubscribeRequestSchema,
  SendPhoneCodeRequestSchema,
  VerifyPhoneCodeRequestSchema,
} from '../client-requests'
import { CreateCourierOrderRequestSchema } from '../courier'
import type { ApiErrorCode } from '../errors'
import { CreateOrderRequestSchema } from '../requests'
import { storeEventSchema } from '../store'
import {
  AppealCreatedSchema,
  CancelledCourierOrderSchema,
  CancelledOrderSchema,
  CreatedCourierOrderSchema,
  CreatedOrderSchema,
  CustomerAppealListSchema,
  CustomerAppealSchema,
  PhoneCodeSentSchema,
  PhoneVerifiedSchema,
  PrepayInfoSchema,
  PrepayProofAcceptedSchema,
  PushDeviceListSchema,
  PushSubscribedSchema,
  PushSubscriptionOwnershipSchema,
  PushUnsubscribedSchema,
} from './client-responses'
import {
  CourierServiceStatusSchema,
  CourierTrackingSchema,
  HealthResponseSchema,
  OrderTrackingSchema,
  PilotAccessResponseSchema,
  PublicBusinessDetailSchema,
  PublicBusinessListSchema,
  ScheduleStatusSchema,
  SearchCatalogQuerySchema,
  SearchCatalogResponseSchema,
  StoreDetailResponseSchema,
  StoreListResponseSchema,
} from './public-responses'

/**
 * Registro de las operaciones de `/api/v1` que usan las apps del cliente.
 *
 * Es la fuente del OpenAPI (`buildOpenApiDocument`). Un test recorre
 * `apps/api/app/api/v1/{customer,public,push,health}` y falla si una ruta o un
 * método no está aquí: una ruta sin documentar no pasa el CI (estándar API-2).
 *
 * `documented: false` marca lo que aún no tiene esquema de respuesta: sale en
 * el OpenAPI con `x-tindivo-pending` para que nadie genere un cliente contra
 * una forma inventada. Desde el lote MV2b no queda ninguna así; el marcador se
 * conserva para la próxima ruta que se registre antes de describirla.
 *
 * Cada esquema de respuesta se valida contra la respuesta REAL de su ruta en
 * `apps/api/lib/__tests__/openapi-conformance.integration.test.ts`.
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
  /** La ruta acepta la petición sin cuerpo (lo trata como `{}`). */
  bodyOptional?: boolean
  /** Acepta la cabecera `Idempotency-Key`. */
  idempotent?: boolean
  success: Record<number, SuccessResponse>
  /** Errores de negocio documentados, además de `internal_error`. */
  errors?: ApiErrorCode[]
  documented: boolean
}

const uuidParam = z.uuid()
const shortIdParam = z.string().meta({ description: 'Identificador corto público (8 caracteres)' })

const endpointQuery = (description: string) =>
  z.string().meta({ description: `${description}. URL del endpoint de Web Push` })

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
    success: {
      200: {
        description: 'Negocios publicados, por nombre',
        envelope: 'data',
        schema: PublicBusinessListSchema,
      },
    },
    documented: true,
  },
  {
    method: 'get',
    path: '/public/businesses/{id}',
    operationId: 'getBusiness',
    summary: 'Un negocio con su carta',
    tags: ['public'],
    auth: 'none',
    pathParams: { id: z.string().meta({ description: 'UUID o slug del negocio' }) },
    success: {
      200: {
        description: 'El negocio, su carta y su horario',
        envelope: 'data',
        schema: PublicBusinessDetailSchema,
      },
    },
    errors: ['not_found'],
    documented: true,
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
    success: {
      200: {
        description: 'Estado del pedido, sin envoltura',
        envelope: 'raw',
        schema: OrderTrackingSchema,
      },
    },
    errors: ['not_found'],
    documented: true,
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
    success: {
      200: {
        description: 'Estado de la entrega, sin envoltura',
        envelope: 'raw',
        schema: CourierTrackingSchema,
      },
    },
    errors: ['not_found'],
    documented: true,
  },

  // ── Público: Tindivo Store ─────────────────────────────────────────────────
  {
    method: 'get',
    path: '/public/store',
    operationId: 'listStoreProducts',
    summary: 'Productos de Tindivo Store',
    tags: ['public', 'store'],
    auth: 'none',
    query: z.object({
      q: z.string().optional().meta({ description: 'Texto a buscar (se recorta a 80)' }),
      categoria: z.string().optional().meta({ description: 'Slug de la categoría' }),
      condicion: z
        .string()
        .optional()
        .meta({ description: '`nuevo`, `segunda` o `todo`. Otro valor = todo' }),
      orden: z
        .string()
        .optional()
        .meta({ description: '`precio_asc` o `precio_desc`. Otro valor = recientes' }),
    }),
    success: {
      200: {
        description: 'La grilla, los vendidos, las categorías y los ajustes',
        envelope: 'data',
        schema: StoreListResponseSchema,
      },
    },
    documented: true,
  },
  {
    method: 'get',
    path: '/public/store/{slug}',
    operationId: 'getStoreProduct',
    summary: 'Un producto de Tindivo Store',
    tags: ['public', 'store'],
    auth: 'none',
    pathParams: { slug: z.string() },
    success: {
      200: {
        description: 'El artículo, sus relacionados y los ajustes',
        envelope: 'data',
        schema: StoreDetailResponseSchema,
      },
    },
    errors: ['not_found'],
    documented: true,
  },
  {
    method: 'post',
    path: '/public/store/events',
    operationId: 'trackStoreEvent',
    summary: 'Registrar un evento de Tindivo Store',
    tags: ['public', 'store'],
    auth: 'none',
    body: storeEventSchema,
    success: { 204: { description: 'Registrado; sin cuerpo', envelope: 'none' } },
    errors: ['validation_error', 'rate_limited'],
    documented: true,
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
    success: {
      201: { description: 'Pedido creado', envelope: 'data', schema: CreatedOrderSchema },
    },
    errors: [
      'validation_error',
      'unauthorized',
      'forbidden',
      'not_found',
      'conflict',
      'idempotency_conflict',
    ],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/cancel',
    operationId: 'cancelOrder',
    summary: 'Cancelar un pedido propio',
    tags: ['orders'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: {
      200: { description: 'Pedido cancelado', envelope: 'data', schema: CancelledOrderSchema },
    },
    errors: ['unauthorized', 'forbidden', 'not_found', 'order_not_cancellable'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/orders/{id}/prepay-info',
    operationId: 'getPrepayInfo',
    summary: 'Datos para pagar por adelantado (QR, monto, plazo)',
    tags: ['orders', 'payments'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: {
      200: { description: 'Cómo y cuánto pagar', envelope: 'data', schema: PrepayInfoSchema },
    },
    errors: ['unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/prepay-proof',
    operationId: 'confirmPrepayProof',
    summary: 'Confirmar el comprobante de pago subido',
    tags: ['orders', 'payments'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    body: PrepayProofRequestSchema,
    success: {
      200: {
        description: 'Comprobante registrado: el pedido pasa a `validando`',
        envelope: 'data',
        schema: PrepayProofAcceptedSchema,
      },
    },
    errors: [
      'validation_error',
      'unauthorized',
      'forbidden',
      'not_found',
      'invalid_state_transition',
    ],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/orders/{id}/appeal',
    operationId: 'getOrderAppeal',
    summary: 'Estado de la apelación de un pedido',
    tags: ['orders', 'appeals'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: {
      200: { description: 'La apelación', envelope: 'data', schema: CustomerAppealSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/appeal',
    operationId: 'createOrderAppeal',
    summary: 'Apelar un pedido rechazado',
    tags: ['orders', 'appeals'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    body: CreateOrderAppealRequestSchema,
    bodyOptional: true,
    success: {
      200: {
        description: 'Apelación creada, o la que ya existía',
        envelope: 'data',
        schema: AppealCreatedSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/appeals',
    operationId: 'listAppeals',
    summary: 'Apelaciones del cliente',
    tags: ['appeals'],
    auth: 'customer',
    success: {
      200: {
        description: 'Sus apelaciones, de la más reciente',
        envelope: 'data',
        schema: CustomerAppealListSchema,
      },
    },
    errors: ['unauthorized', 'forbidden'],
    documented: true,
  },

  // ── Cliente: Entregas ──────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/customer/courier-orders',
    operationId: 'createCourierOrder',
    summary: 'Pedir una entrega',
    tags: ['courier'],
    auth: 'customer',
    body: CreateCourierOrderRequestSchema,
    idempotent: true,
    success: {
      201: {
        description: 'Entrega solicitada',
        envelope: 'data',
        schema: CreatedCourierOrderSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict', 'idempotency_conflict'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/courier-orders/{id}/cancel',
    operationId: 'cancelCourierOrder',
    summary: 'Cancelar una entrega propia',
    tags: ['courier'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: {
      200: {
        description: 'Entrega cancelada',
        envelope: 'data',
        schema: CancelledCourierOrderSchema,
      },
    },
    errors: ['unauthorized', 'forbidden', 'not_found', 'conflict'],
    documented: true,
  },

  // ── Cliente: teléfono ──────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/customer/phone/send-code',
    operationId: 'sendPhoneCode',
    summary: 'Enviar el código de verificación por SMS',
    tags: ['account'],
    auth: 'customer',
    body: SendPhoneCodeRequestSchema,
    success: {
      200: { description: 'Código enviado', envelope: 'data', schema: PhoneCodeSentSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict', 'rate_limited'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/phone/verify',
    operationId: 'verifyPhoneCode',
    summary: 'Verificar el código recibido por SMS',
    tags: ['account'],
    auth: 'customer',
    body: VerifyPhoneCodeRequestSchema,
    success: {
      200: { description: 'Teléfono verificado', envelope: 'data', schema: PhoneVerifiedSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict'],
    documented: true,
  },

  // ── Avisos ─────────────────────────────────────────────────────────────────
  {
    method: 'post',
    path: '/push/subscriptions',
    operationId: 'createPushSubscription',
    summary: 'Registrar una suscripción de avisos (Web Push)',
    tags: ['push'],
    auth: 'user',
    body: PushSubscriptionRequestSchema,
    success: {
      201: {
        description: 'Suscripción registrada o reactivada',
        envelope: 'data',
        schema: PushSubscribedSchema,
      },
    },
    errors: ['validation_error', 'unauthorized'],
    documented: true,
  },
  {
    method: 'get',
    path: '/push/subscriptions',
    operationId: 'listPushSubscriptions',
    summary: 'Suscripciones de avisos del usuario',
    tags: ['push'],
    auth: 'user',
    query: z.object({
      endpoint: endpointQuery(
        'Opcional: marca con `current` el dispositivo que pregunta',
      ).optional(),
    }),
    success: {
      200: {
        description: 'Sus dispositivos, del más reciente',
        envelope: 'data',
        schema: PushDeviceListSchema,
      },
    },
    errors: ['unauthorized'],
    documented: true,
  },
  {
    method: 'delete',
    path: '/push/subscriptions',
    operationId: 'deletePushSubscription',
    summary: 'Dar de baja una suscripción de avisos',
    tags: ['push'],
    auth: 'user',
    body: PushUnsubscribeRequestSchema,
    success: {
      200: {
        description: 'Baja hecha; `removed` dice cuántas filas',
        envelope: 'data',
        schema: PushUnsubscribedSchema,
      },
    },
    errors: ['validation_error', 'unauthorized'],
    documented: true,
  },
  {
    method: 'get',
    path: '/push/subscriptions/me',
    operationId: 'getMyPushSubscription',
    summary: 'Si este aparato tiene una suscripción activa',
    tags: ['push'],
    auth: 'user',
    query: z.object({ endpoint: endpointQuery('El de este navegador') }),
    success: {
      200: {
        description: 'Si existe y de quién es',
        envelope: 'data',
        schema: PushSubscriptionOwnershipSchema,
      },
    },
    errors: ['validation_error', 'unauthorized'],
    documented: true,
  },
]
