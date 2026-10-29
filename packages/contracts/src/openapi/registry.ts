import { z } from 'zod'
import {
  CheckoutQuoteRequestSchema,
  CreateCustomerAddressRequestSchema,
  CreateOrderAppealRequestSchema,
  CreateReviewRequestSchema,
  PrepayProofRequestSchema,
  PushSubscriptionRequestSchema,
  PushUnsubscribeRequestSchema,
  SendPhoneCodeRequestSchema,
  TermsAcceptanceRequestSchema,
  UpdateCustomerAddressRequestSchema,
  UpdateCustomerProfileRequestSchema,
  VerifyPhoneCodeRequestSchema,
} from '../client-requests'
import { CreateCourierOrderRequestSchema } from '../courier'
import type { ApiErrorCode } from '../errors'
import {
  CustomerSecurityNoticeParamsSchema,
  CustomerSecurityNoticesSchema,
  TransferCustomerPhoneRequestSchema,
  TransferredCustomerPhoneSchema,
} from '../phone-security'
import {
  PushDeviceParamsSchema,
  PushDeviceRegistrationSchema,
  PushDeviceSchema,
} from '../push-devices'
import { CreateOrderRequestSchema } from '../requests'
import { storeEventSchema } from '../store'
import {
  AppealCreatedSchema,
  CancelledCourierOrderSchema,
  CancelledOrderSchema,
  CheckoutQuoteSchema,
  CreatedCourierOrderSchema,
  CreatedOrderSchema,
  CreatedReviewSchema,
  CustomerAddressListSchema,
  CustomerAddressSchema,
  CustomerAppealListSchema,
  CustomerAppealSchema,
  CustomerCourierOrderListSchema,
  CustomerOrderDetailSchema,
  CustomerOrderListSchema,
  CustomerPendingReviewSchema,
  CustomerProfileSchema,
  CustomerReorderSchema,
  OrderAttemptSchema,
  PaymentOptionsSchema,
  PhoneCodeSentSchema,
  PhoneVerifiedSchema,
  PrepayInfoSchema,
  PrepayProofAcceptedSchema,
  PushDeviceListSchema,
  PushSubscribedSchema,
  PushSubscriptionOwnershipSchema,
  PushUnsubscribedSchema,
  TermsAcceptedSchema,
} from './client-responses'
import {
  ClientConfigResponseSchema,
  CourierDirectoryListSchema,
  CourierServiceStatusSchema,
  CourierTrackingSchema,
  HealthResponseSchema,
  MapLandmarkListSchema,
  OrderTrackingSchema,
  PilotAccessResponseSchema,
  PublicBusinessDetailSchema,
  PublicBusinessListSchema,
  PublicConfigSchema,
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
 * `apps/api/app/api/v1/{customer,public,push,health,config}` y falla si una ruta o un
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

const pageQuery = z.object({
  limit: z.string().optional().meta({ description: 'Tamaño de página, 1 a 50 (20 por defecto)' }),
  cursor: z.string().optional().meta({
    description:
      '`nextCursor` de la página anterior. Opaco: no lo armes ni lo interpretes. Uno mal formado responde 422; el cursor no está firmado, pero solo ordena MIS filas (la lista siempre se filtra por la sesión)',
  }),
})

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

  {
    method: 'get',
    path: '/config',
    operationId: 'getClientConfig',
    summary:
      'Configuración pública para las apps: versión mínima por app y plataforma, y sistema mínimo',
    description:
      'Siempre accesible, sin sesión y sin evaluar la versión de la app. Las apps mandan `X-Tindivo-Platform` ' +
      '(ios|android|web), `X-Tindivo-App` (customer|negocios|motorizados), `X-Tindivo-App-Version` y ' +
      '`X-Tindivo-Build` en cada petición; si la versión está por debajo del mínimo de su app y plataforma, ' +
      'cualquier otra ruta responde 426 con `code: client_upgrade_required` (mostrar «actualiza la app»). ' +
      'Sin esas cabeceras no se bloquea nada.',
    tags: ['system'],
    auth: 'none',
    success: {
      200: {
        description: 'Configuración vigente',
        envelope: 'data',
        schema: ClientConfigResponseSchema,
      },
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
    method: 'get',
    path: '/customer/orders/attempts/{key}',
    operationId: 'getOrderAttempt',
    summary: 'Saber si una Idempotency-Key ya creó un pedido',
    tags: ['orders'],
    auth: 'customer',
    pathParams: { key: uuidParam },
    success: {
      200: {
        description: 'Estado del intento: creado, sin rastro o desconocido',
        envelope: 'data',
        schema: OrderAttemptSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
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

  {
    method: 'post',
    path: '/customer/phone/transfer',
    operationId: 'transferCustomerPhone',
    summary: 'Usar en esta cuenta el número comprobado por SMS',
    tags: ['account'],
    auth: 'customer',
    body: TransferCustomerPhoneRequestSchema,
    success: {
      200: {
        description: 'Número trasladado',
        envelope: 'data',
        schema: TransferredCustomerPhoneSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/security-notices',
    operationId: 'getCustomerSecurityNotices',
    summary: 'Leer los avisos de seguridad propios no vistos',
    tags: ['account'],
    auth: 'customer',
    success: {
      200: {
        description: 'Avisos no vistos',
        envelope: 'data',
        schema: CustomerSecurityNoticesSchema,
      },
    },
    errors: ['unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/security-notices/{id}/seen',
    operationId: 'seeCustomerSecurityNotice',
    summary: 'Marcar como visto un aviso propio',
    tags: ['account'],
    auth: 'customer',
    pathParams: CustomerSecurityNoticeParamsSchema.shape,
    success: { 204: { description: 'Aviso visto o ya ausente', envelope: 'none' } },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
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

  // ── MV7a: dispositivos nativos (APNs y FCM) ────────────────────────────────
  {
    method: 'put',
    path: '/push/devices/{installId}',
    operationId: 'registerPushDevice',
    summary: 'Registrar o actualizar el dispositivo nativo de esta instalación (APNs o FCM)',
    description:
      'Idempotente por `installId`: la app lo llama al abrirse, al rotar el token y al cambiar de usuario. ' +
      'Si el token ya estaba registrado en otra instalación, esa fila se borra (así cambia de usuario un aparato). ' +
      'Un `installId` que ya es de otra cuenta responde 409 `conflict`: la app debe regenerarlo al cerrar sesión. ' +
      'Si el registro choca con otro simultáneo del mismo aparato y no se resuelve tras reintentar, ' +
      'también responde 409 `conflict` sin haber cambiado nada: la app reintenta. ' +
      '`app` debe corresponder al rol de la sesión ' +
      '(customer, negocios→business, motorizados→driver); si no, 403. La respuesta nunca incluye el token.',
    tags: ['push'],
    auth: 'user',
    pathParams: { installId: PushDeviceParamsSchema.shape.installId },
    body: PushDeviceRegistrationSchema,
    success: {
      200: {
        description: 'Dispositivo registrado o actualizado',
        envelope: 'data',
        schema: PushDeviceSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'conflict'],
    documented: true,
  },
  {
    method: 'delete',
    path: '/push/devices/{installId}',
    operationId: 'unregisterPushDevice',
    summary: 'Dar de baja el dispositivo nativo de esta instalación',
    description:
      'Responde 204 también si la instalación no existe o es de otro usuario: no revela nada. ' +
      'Si la baja choca con otro registro simultáneo del mismo aparato y no se resuelve tras reintentar, ' +
      'responde 409 `conflict` sin haber dado de baja nada: la app reintenta.',
    tags: ['push'],
    auth: 'user',
    pathParams: { installId: PushDeviceParamsSchema.shape.installId },
    success: { 204: { description: 'Baja hecha; sin cuerpo', envelope: 'none' } },
    errors: ['validation_error', 'unauthorized', 'conflict'],
    documented: true,
  },

  {
    method: 'put',
    path: '/customer/profile',
    operationId: 'updateCustomerProfile',
    summary: 'Crea el perfil del cliente o actualiza solo su nombre',
    tags: ['customer'],
    auth: 'customer',
    body: UpdateCustomerProfileRequestSchema,
    success: {
      200: { description: 'Su perfil guardado', envelope: 'data', schema: CustomerProfileSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
    documented: true,
  },
  // ── MV4a: lo que la web leía directo de Supabase ───────────────────────────
  {
    method: 'get',
    path: '/customer/profile',
    operationId: 'getCustomerProfile',
    summary: 'Perfil del cliente: nombre, teléfono, verificación y bloqueo preventivo',
    description:
      'Siempre el de la sesión: no recibe ningún identificador. Si el cliente aún no completó su perfil ' +
      'responde 404 con `detail: customer_profile_not_found`.',
    tags: ['customer'],
    auth: 'customer',
    success: {
      200: { description: 'Su perfil', envelope: 'data', schema: CustomerProfileSchema },
    },
    errors: ['unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/payment-options',
    operationId: 'getPaymentOptions',
    summary: 'Si el cliente puede pagar contraentrega o debe pagar por adelantado',
    description:
      'La decisión la toma la base (antifraude); la ruta solo la expone. Sirve para pintar la pantalla de ' +
      'pago: quien decide de verdad es la creación del pedido. El umbral de monto para prepago está en ' +
      '`GET /public/config`.',
    tags: ['customer'],
    auth: 'customer',
    success: {
      200: { description: 'Opciones vigentes', envelope: 'data', schema: PaymentOptionsSchema },
    },
    errors: ['unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/checkout/quote',
    operationId: 'quoteCheckout',
    summary: 'Cotizar un carrito: total, envío, envío gratis, vuelto máximo y umbral de prepago',
    description:
      'Todo lo que el checkout pinta, decidido en el servidor con las mismas funciones que usa la creación del ' +
      'pedido: la app no replica ninguna regla. Es solo para pintar; `POST /customer/orders` vuelve a decidir. ' +
      'Un plato que ya no está disponible responde 422.',
    tags: ['customer'],
    auth: 'customer',
    body: CheckoutQuoteRequestSchema,
    success: {
      200: { description: 'La cotización', envelope: 'data', schema: CheckoutQuoteSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found', 'conflict'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/addresses',
    operationId: 'listCustomerAddresses',
    summary: 'Libreta de direcciones del cliente',
    tags: ['customer'],
    auth: 'customer',
    success: {
      200: {
        description: 'Sus direcciones, la predeterminada primero',
        envelope: 'data',
        schema: CustomerAddressListSchema,
      },
    },
    errors: ['unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/addresses',
    operationId: 'createCustomerAddress',
    summary: 'Guardar una dirección',
    description:
      'Nace predeterminada si el cliente no tenía ninguna (o si se pide `isDefault`); marcarla despeja a la ' +
      'anterior en la misma transacción: nunca quedan dos.',
    tags: ['customer'],
    auth: 'customer',
    body: CreateCustomerAddressRequestSchema,
    success: {
      201: { description: 'La dirección creada', envelope: 'data', schema: CustomerAddressSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'patch',
    path: '/customer/addresses/{id}',
    operationId: 'updateCustomerAddress',
    summary: 'Editar una dirección propia',
    tags: ['customer'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    body: UpdateCustomerAddressRequestSchema,
    success: {
      200: {
        description: 'La dirección actualizada',
        envelope: 'data',
        schema: CustomerAddressSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'delete',
    path: '/customer/addresses/{id}',
    operationId: 'deleteCustomerAddress',
    summary: 'Borrar una dirección propia',
    description: 'Si era la predeterminada, la más antigua de las que quedan hereda el puesto.',
    tags: ['customer'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 204: { description: 'Borrada; sin cuerpo', envelope: 'none' } },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/orders',
    operationId: 'listCustomerOrders',
    summary: 'Historial de pedidos de comida del cliente',
    tags: ['orders'],
    auth: 'customer',
    query: pageQuery,
    success: {
      200: {
        description: 'Una página de pedidos con sus platos',
        envelope: 'data',
        schema: CustomerOrderListSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/orders/{id}',
    operationId: 'getCustomerOrder',
    summary: 'Un pedido propio, con notas y motorizado',
    description:
      'A diferencia del seguimiento público: incluye `customerNotes`, la dirección y el motorizado asignado. ' +
      'El teléfono del motorizado llega solo cuando ya está en la puerta, como en el seguimiento. ' +
      'Un pedido ajeno responde 404, igual que uno que no existe.',
    tags: ['orders'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: {
      200: { description: 'El pedido', envelope: 'data', schema: CustomerOrderDetailSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/orders/{id}/reorder',
    operationId: 'getCustomerReorder',
    summary: 'Repetir un pedido propio: su bolsa con el menú de hoy y lo que cambió',
    description:
      'Solo lectura (D-51): no crea pedido ni toca nada. Las opciones se rearman por nombre, porque el ' +
      'pedido no guarda sus ids; lo que no se puede rearmar sin adivinar va a `changes` como ' +
      '`choose_again`. El total y el envío se piden a `POST /customer/checkout/quote`. Un pedido ajeno, ' +
      'inexistente o de Entregas responde 404.',
    tags: ['orders'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: {
      200: { description: 'La bolsa rearmada', envelope: 'data', schema: CustomerReorderSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/reviews/pending',
    operationId: 'getCustomerPendingReview',
    summary: 'El pedido por el que preguntar «¿cómo estuvo?», o null',
    description:
      'El pedido de restaurante entregado más reciente del cliente, dentro de la ventana ' +
      '(`app_settings.reviews.windowDays`), sin reseña ni descarte, con el catálogo de etiquetas. ' +
      'Uno solo, nunca una cola; `data` es `null` si no hay nada que preguntar. Las Entregas no ' +
      'tienen reseña.',
    tags: ['reviews'],
    auth: 'customer',
    success: {
      200: {
        description: 'El pendiente, o null',
        envelope: 'data',
        schema: CustomerPendingReviewSchema.nullable(),
      },
    },
    errors: ['unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/review',
    operationId: 'createCustomerReview',
    summary: 'Calificar un pedido entregado',
    description:
      'Una reseña por pedido, propio, entregado y dentro de la ventana. Las etiquetas fuera del ' +
      'catálogo se descartan y el comentario se recorta al máximo configurado. Un pedido ajeno, ' +
      'inexistente o de Entregas responde 404; uno ya calificado, no entregado o fuera de plazo, 409.',
    tags: ['reviews'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    body: CreateReviewRequestSchema,
    success: {
      200: { description: 'La reseña guardada', envelope: 'data', schema: CreatedReviewSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found', 'conflict'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/orders/{id}/review/dismiss',
    operationId: 'dismissCustomerReview',
    summary: 'Descartar la pregunta «¿cómo estuvo?» de un pedido',
    description:
      'Idempotente: repetirlo no falla. Solo apaga la pregunta; no impide calificar el pedido ' +
      'después.',
    tags: ['reviews'],
    auth: 'customer',
    pathParams: { id: uuidParam },
    success: { 204: { description: 'Descartada; sin cuerpo', envelope: 'none' } },
    errors: ['validation_error', 'unauthorized', 'forbidden', 'not_found'],
    documented: true,
  },
  {
    method: 'get',
    path: '/customer/courier-orders',
    operationId: 'listCustomerCourierOrders',
    summary: 'Historial de Entregas del cliente y contactos frecuentes',
    tags: ['courier'],
    auth: 'customer',
    query: pageQuery,
    success: {
      200: {
        description: 'Una página de solicitudes y sus contactos frecuentes',
        envelope: 'data',
        schema: CustomerCourierOrderListSchema,
      },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'post',
    path: '/customer/terms-acceptance',
    operationId: 'acceptTerms',
    summary: 'Registrar la aceptación de términos y privacidad',
    description:
      'Idempotente por versión: repetirla devuelve la fecha original con `alreadyAccepted: true`.',
    tags: ['customer'],
    auth: 'customer',
    body: TermsAcceptanceRequestSchema,
    success: {
      200: { description: 'Ya estaba aceptada', envelope: 'data', schema: TermsAcceptedSchema },
      201: { description: 'Aceptación registrada', envelope: 'data', schema: TermsAcceptedSchema },
    },
    errors: ['validation_error', 'unauthorized', 'forbidden'],
    documented: true,
  },
  {
    method: 'delete',
    path: '/customer/account',
    operationId: 'deleteCustomerAccount',
    summary: 'Borrar la cuenta propia',
    description:
      'Anonimiza los pedidos y sus registros, borra lo personal y la identidad, en una transacción. Repetirla con el mismo token responde 401: la identidad ya no existe, y eso significa «ya borrada». Responde 409 (con el motivo en `detail`) si hay un pedido en curso, una apelación o devolución sin resolver, o un rol que no es de cliente.',
    tags: ['customer'],
    auth: 'customer',
    success: { 204: { description: 'Cuenta borrada; sin cuerpo', envelope: 'none' } },
    errors: ['unauthorized', 'forbidden', 'conflict'],
    documented: true,
  },
  {
    method: 'get',
    path: '/public/config',
    operationId: 'getPublicConfig',
    summary: 'Cobertura, bandas de envío, umbral de prepago y topes de efectivo',
    description:
      'Solo claves públicas de `app_settings`. No es `GET /config`, que trata de la versión mínima de la app.',
    tags: ['public'],
    auth: 'none',
    success: {
      200: { description: 'Configuración pública', envelope: 'data', schema: PublicConfigSchema },
    },
    documented: true,
  },
  {
    method: 'get',
    path: '/public/landmarks',
    operationId: 'listMapLandmarks',
    summary: 'Puntos de referencia del mapa',
    tags: ['public', 'map'],
    auth: 'none',
    success: {
      200: { description: 'Referencias activas', envelope: 'data', schema: MapLandmarkListSchema },
    },
    documented: true,
  },
  {
    method: 'get',
    path: '/public/courier/directory',
    operationId: 'listCourierDirectory',
    summary: 'Directorio de comercios para el recojo de Entregas',
    description: 'Sin teléfonos ni WhatsApp de los comercios: no salen por la API pública.',
    tags: ['public', 'courier'],
    auth: 'none',
    success: {
      200: {
        description: 'Comercios visibles en el mapa, por nombre',
        envelope: 'data',
        schema: CourierDirectoryListSchema,
      },
    },
    documented: true,
  },
]
