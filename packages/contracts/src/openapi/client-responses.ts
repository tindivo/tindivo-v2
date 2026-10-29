import { z } from 'zod'
import { AppealStatusSchema, RefundStatusSchema } from '../appeal'
import {
  CANCEL_REASONS,
  COURIER_CANCEL_REASONS,
  COURIER_PAYERS,
  COURIER_STATUSES,
  DELIVERY_METHODS,
  DISTANCE_BANDS,
  ORDER_STATUSES,
  PAYMENT_INTENTS,
  PAYMENT_WALLETS,
  PICKUP_TIMINGS,
  REORDER_CHANGE_KINDS,
  REPORT_STATUSES,
} from '../enums'
import {
  legacyMoney,
  legacyMoneyNullable,
  moneyText,
  openEnum,
  timestampOut,
  uuidOut,
} from './schema-helpers'

/**
 * Respuestas de las rutas con sesión (`customer` y `push`), descritas TAL COMO
 * SON HOY (lote MV2b). Mismo criterio que `public-responses.ts`: cada forma
 * sale de la ruta, de la definición viva de su función SQL en tindivo-prod
 * (leída el 2026-10-10) y de la nulabilidad de sus columnas.
 */

// ── Pedidos de restaurante ───────────────────────────────────────────────────

/**
 * POST /customer/orders (201) — `create_customer_order()`. Un reintento con la
 * misma `Idempotency-Key` devuelve este mismo cuerpo, con la cabecera
 * `idempotency-replayed: true`.
 */
export const CreatedOrderSchema = z.object({
  id: uuidOut,
  shortId: z.string(),
  orderNumber: z.number().int(),
  status: openEnum(
    ORDER_STATUSES,
    '`pending_acceptance`, o `validando` si la cajera tiene que llamar antes',
  ),
  orderAmount: legacyMoney,
  deliveryFee: legacyMoney,
  total: legacyMoney,
  promoApplied: z.boolean(),
  pickupTiming: openEnum(PICKUP_TIMINGS, 'Null en un delivery').nullable(),
})

/** Estados posibles de GET /customer/orders/attempts/{key}. */
export const ORDER_ATTEMPT_STATES = ['created', 'not_found', 'unknown'] as const

/**
 * GET /customer/orders/attempts/{key} — ¿esta `Idempotency-Key` ya creó un pedido
 * de este cliente? Para reconciliar cuando se perdió la respuesta del POST.
 */
export const OrderAttemptSchema = z.object({
  state: openEnum(
    ORDER_ATTEMPT_STATES,
    '`created`: la clave creó el pedido de `order`. `not_found`: la clave NO ha creado nada TODAVÍA; solo prueba el presente, porque una petición en vuelo puede crearlo después y, pasada la retención (7 días), se pierde el rastro. `unknown`: no se sabe si el pedido existe, porque solo hay una reserva de la API anterior o no se pudo leer el registro; reintenta la consulta más tarde',
  ),
  order: z.object({ id: uuidOut, shortId: z.string() }).nullable().meta({
    description:
      'El pedido que creó la clave. Null salvo en `created`. Un `created` con `order` null puede pasar: el pedido existe pero no se pudo leer su código (`id`/`shortId`)',
  }),
})

/** POST /customer/orders/{id}/cancel — `cancel_customer_order()`. */
export const CancelledOrderSchema = z.object({
  id: uuidOut,
  status: openEnum(ORDER_STATUSES),
  cancelReason: openEnum(CANCEL_REASONS),
})

/** Un método de cobro del negocio (`business_payment_qrs`), el principal primero. */
export const PaymentQrViewSchema = z.object({
  slot: z.number().int(),
  wallet: openEnum(PAYMENT_WALLETS),
  accountNumber: z.string(),
  accountName: z.string(),
  qrUrl: z.string().nullable(),
  isDefault: z.boolean(),
})

/** GET /customer/orders/{id}/prepay-info */
export const PrepayInfoSchema = z.object({
  businessName: z.string(),
  yapeNumber: z.string().nullable().meta({
    description: 'Número del método principal (compatibilidad: usa `paymentQr`)',
  }),
  qrUrl: z.string().nullable(),
  paymentQr: PaymentQrViewSchema.nullable().meta({
    description: 'Solo el método principal: al cliente que prepaga no se le enseña el repuesto',
  }),
  total: legacyMoney,
  status: openEnum(ORDER_STATUSES),
  hasProof: z.boolean(),
  proofAttempt: z.number().int(),
  comprobantePrepagoUrl: z.string().nullable().meta({ description: 'Ruta en Storage, no una URL' }),
  awaitingPaymentAt: timestampOut.nullable().meta({
    description: 'Hoy es `orders.updated_at`, no el reloj de `awaiting_payment`',
  }),
})

/** POST /customer/orders/{id}/prepay-proof */
export const PrepayProofAcceptedSchema = z.object({ ok: z.literal(true) })

/** POST /customer/orders/{id}/prepay-proof/upload-url */
export const PrepayProofUploadUrlSchema = z.object({
  path: z.string().meta({
    description:
      'Ruta del archivo en el bucket `payment-proofs`. Es la que se manda después a `prepay-proof`',
  }),
  uploadUrl: z.string().meta({
    description: 'URL firmada: se sube la foto con un PUT. Un solo uso; no sobrescribe',
  }),
  token: z.string().meta({ description: 'Token de la URL firmada, por si el cliente lo prefiere' }),
  expiresAt: timestampOut.meta({ description: 'Caducidad de la URL firmada (UTC)' }),
})

// ── Apelaciones ──────────────────────────────────────────────────────────────

/** Apelación vista por su cliente (`CustomerAppealDto`). */
export const CustomerAppealSchema = z.object({
  id: uuidOut,
  orderId: uuidOut,
  appealStatus: openEnum(AppealStatusSchema.options),
  refundStatus: openEnum(RefundStatusSchema.options).nullable(),
  refundAmount: legacyMoneyNullable,
  refundCompletedAt: timestampOut.nullable(),
  appealDeadline: timestampOut.nullable(),
  description: z.string().nullable(),
  status: openEnum(REPORT_STATUSES),
  createdAt: timestampOut,
  updatedAt: timestampOut,
  refundProofUrl: z
    .string()
    .nullable()
    .meta({ description: 'URL firmada del comprobante de devolución, válida una hora' }),
})

/** POST /customer/orders/{id}/appeal — `create_appeal_report()`. Repetirla no crea otra. */
export const AppealCreatedSchema = z.object({
  ok: z.literal(true),
  alreadyExisted: z.boolean(),
  reportId: uuidOut,
})

/** GET /customer/appeals — de la más reciente a la más antigua. */
export const CustomerAppealListSchema = z.object({
  items: z.array(CustomerAppealSchema.extend({ orderShortId: z.string().nullable() })),
  total: z.number().int(),
})

// ── Entregas ─────────────────────────────────────────────────────────────────

/** POST /customer/courier-orders (201) — `create_courier_order()`. */
export const CreatedCourierOrderSchema = z.object({
  id: uuidOut,
  shortId: z.string(),
  orderNumber: z.number().int(),
  status: openEnum(COURIER_STATUSES),
  feeAmount: legacyMoney,
  distanceM: z.number().meta({ description: 'Distancia en línea recta de A a B, en metros' }),
})

/** POST /customer/courier-orders/{id}/cancel — `advance_courier_order('cancel')`. */
export const CancelledCourierOrderSchema = z.object({
  id: uuidOut,
  status: openEnum(COURIER_STATUSES),
})

// ── Teléfono ─────────────────────────────────────────────────────────────────

/** POST /customer/phone/send-code */
export const PhoneCodeSentSchema = z.object({
  sent: z.literal(true),
  channel: z.string().meta({
    description: 'El que usó Twilio (`sms`). `dev` = simulacro local, sin envío',
  }),
  verified: z.literal(true).optional().meta({
    description:
      'Solo en el simulacro local: el teléfono ya quedó verificado y no hay código que pedir',
  }),
})

/** POST /customer/phone/verify */
export const PhoneVerifiedSchema = z.object({
  verified: z.literal(true),
  phone: z.string().meta({ description: 'E.164 (`+519XXXXXXXX`)' }),
})

// ── Avisos ───────────────────────────────────────────────────────────────────

/** POST /push/subscriptions (201) */
export const PushSubscribedSchema = z.object({ subscribed: z.literal(true) })

/** GET /push/subscriptions — sin el `endpoint` de ninguna fila: es una credencial. */
export const PushDeviceListSchema = z.object({
  devices: z.array(
    z.object({
      id: uuidOut,
      platform: openEnum(
        ['apple', 'android', 'windows', 'otro'],
        'Deducida del proveedor del endpoint, no del user agent',
      ),
      label: z.string().nullable().meta({ description: 'User agent crudo: no identifica nada' }),
      createdAt: timestampOut,
      lastNotifiedAt: timestampOut.nullable(),
      current: z.boolean().meta({ description: 'Es el `endpoint` que mandaste en la consulta' }),
    }),
  ),
})

/** DELETE /push/subscriptions */
export const PushUnsubscribedSchema = z.object({
  unsubscribed: z.literal(true),
  removed: z.number().int().meta({ description: 'Filas borradas de verdad (0 si no había)' }),
})

/** GET /push/subscriptions/me */
export const PushSubscriptionOwnershipSchema = z.object({
  owned: z.boolean().meta({ description: 'La suscripción existe y es de este usuario' }),
  exists: z.boolean(),
})

// ── Perfil y opciones de pago (MV4a) ─────────────────────────────────────────

/** GET /customer/profile — fila propia de `customer_profiles`, leída con la sesión del cliente. */
export const CustomerProfileSchema = z.object({
  fullName: z.string(),
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  phoneVerifiedAt: timestampOut.nullable(),
  contraentregaBlocked: z.boolean().meta({
    description: 'Bloqueo preventivo: solo puede pagar por adelantado',
  }),
  blockedUntil: timestampOut.nullable(),
  blocked: z.boolean().meta({
    description: '`true` mientras `blockedUntil` esté en el futuro: no puede pedir',
  }),
})

export const CONTRAENTREGA_REASONS = ['trusted', 'prepay_required'] as const

/**
 * GET /customer/payment-options. La decisión es de la base
 * (`current_customer_trusted_for_contraentrega`);
 * la ruta solo la expone. El umbral de monto para prepago está en `GET /public/config`.
 */
export const PaymentOptionsSchema = z.object({
  contraentregaAllowed: z.boolean(),
  prepayRequired: z.boolean().meta({
    description: 'Prepago obligatorio sea cual sea el monto (equivale a `!contraentregaAllowed`)',
  }),
  reason: openEnum(
    CONTRAENTREGA_REASONS,
    '`trusted` o `prepay_required`. No distingue la causa (antifraude)',
  ),
})

// ── Lote MV4b ────────────────────────────────────────────────────────────────

const coordinatesOut = z.object({ lat: z.number(), lng: z.number() })

export const FREE_DELIVERY_REASONS = ['launch_promo', 'dish'] as const
export const QUOTE_PAYMENT_INTENTS = ['pending_cash', 'pending_yape', 'prepaid'] as const
export const QUOTE_PAYMENT_UNAVAILABLE_REASONS = [
  'prepay_required',
  'exceeds_threshold',
  'pickup_later',
] as const

/**
 * POST /customer/checkout/quote. Todo lo que el checkout pinta, decidido en el
 * servidor: la app no calcula banda, envío gratis, vuelto ni umbral. Es solo
 * para pintar; la creación del pedido vuelve a decidir. Dinero como texto (D-39).
 */
export const CheckoutQuoteSchema = z.object({
  businessId: uuidOut,
  deliveryMethod: openEnum(DELIVERY_METHODS),
  items: z.array(
    z.object({
      menuItemId: uuidOut,
      name: z.string(),
      quantity: z.number().int(),
      unitPrice: moneyText.meta({ description: 'Precio del plato más sus modificadores' }),
      lineTotal: moneyText,
    }),
  ),
  subtotal: moneyText,
  deliveryBand: openEnum(DISTANCE_BANDS, 'Null en un recojo').nullable(),
  nominalDeliveryFee: moneyText.meta({
    description: 'Lo que costaría el envío sin promoción (para el tachado). `"0.00"` en un recojo',
  }),
  deliveryFee: moneyText.meta({ description: 'Lo que se cobra: `"0.00"` si hay envío gratis' }),
  freeDelivery: z.object({
    applies: z.boolean(),
    reason: openEnum(FREE_DELIVERY_REASONS).nullable(),
  }),
  total: moneyText,
  maxChange: moneyText.meta({
    description: 'Vuelto máximo que el negocio puede dar esta noche; `"0.00"` = solo pago exacto',
  }),
  prepayThreshold: moneyText,
  exceedsPrepayThreshold: z.boolean().meta({
    description: 'El total pasa del umbral: el pago debe ser adelantado',
  }),
  payment: z
    .object({
      options: z
        .array(
          z.object({
            intent: openEnum(QUOTE_PAYMENT_INTENTS),
            available: z.boolean(),
            unavailableReason: openEnum(QUOTE_PAYMENT_UNAVAILABLE_REASONS).nullable().meta({
              description:
                '`prepay_required` no distingue riesgo de falta de historial (antifraude)',
            }),
          }),
        )
        .meta({
          description:
            'En este orden. El recojo no trae `pending_yape` (no hay motorizado a quien transferirle)',
        }),
      cash: z
        .object({
          maxBill: moneyText.meta({
            description: 'Billete máximo con el que se puede declarar el pago',
          }),
          maxChange: moneyText,
          step: moneyText.meta({ description: 'Múltiplo en que se declara el billete' }),
        })
        .nullable()
        .meta({
          description:
            'Null si el efectivo no está disponible o es un recojo (en caja no se declara billete)',
        }),
    })
    .meta({
      description:
        'Qué métodos de pago puede usar el cliente en este pedido, decididos en el servidor (H-7). Solo para pintar: la creación del pedido vuelve a decidir',
    }),
})

/** Una dirección de la libreta del cliente. */
export const CustomerAddressSchema = z.object({
  id: uuidOut,
  label: z.string(),
  line: z.string().nullable(),
  reference: z.string(),
  coordinates: coordinatesOut.nullable(),
  isDefault: z.boolean(),
  locationConfirmedAt: timestampOut.nullable().meta({
    description: 'Null = el punto nunca lo eligió una persona (no te fíes del pin)',
  }),
  locationAccuracyM: z.number().nullable(),
  createdAt: timestampOut,
  updatedAt: timestampOut,
})

/** GET /customer/addresses — la predeterminada primero. Una libreta es corta: sin cursor. */
export const CustomerAddressListSchema = z.object({ items: z.array(CustomerAddressSchema) })

const customerOrderItem = z.object({
  name: z.string(),
  quantity: z.number().int(),
  lineTotal: moneyText,
  note: z.string().nullable(),
  modifiers: z.array(z.object({ group: z.string(), name: z.string(), price: moneyText })),
})

const customerOrderBase = {
  id: uuidOut,
  shortId: z.string(),
  orderNumber: z.number().int(),
  status: openEnum(ORDER_STATUSES),
  deliveryMethod: openEnum(DELIVERY_METHODS),
  paymentIntent: openEnum(PAYMENT_INTENTS),
  cancelReason: openEnum(CANCEL_REASONS).nullable(),
  businessId: uuidOut,
  businessName: z.string().nullable().meta({ description: 'Null si el negocio ya no existe' }),
  amount: moneyText,
  deliveryFee: moneyText,
  total: moneyText,
  createdAt: timestampOut,
  deliveredAt: timestampOut.nullable(),
}

/** Un pedido en el historial. */
export const CustomerOrderSummarySchema = z.object({
  ...customerOrderBase,
  items: z.array(customerOrderItem.pick({ name: true, quantity: true, lineTotal: true })),
})

/** GET /customer/orders — del más reciente al más antiguo. */
export const CustomerOrderListSchema = z.object({
  items: z.array(CustomerOrderSummarySchema),
  nextCursor: z.string().nullable().meta({
    description: 'Pásalo como `cursor` para la página siguiente; null = no hay más',
  }),
})

/** GET /customer/orders/{id} — un pedido propio, con lo que el seguimiento público oculta. */
export const CustomerOrderDetailSchema = z.object({
  ...customerOrderBase,
  items: z.array(customerOrderItem),
  customerNotes: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  deliveryReference: z.string().nullable(),
  deliveryCoordinates: coordinatesOut.nullable(),
  paysWith: moneyText.nullable(),
  changeToGive: moneyText.nullable(),
  estimatedReadyAt: timestampOut.nullable(),
  arrivedAtCustomerAt: timestampOut.nullable(),
  proofAttempt: z.number().int(),
  paymentVerifiedAt: timestampOut.nullable(),
  driver: z
    .object({
      name: z.string(),
      phone: z.string().nullable().meta({
        description: 'Solo cuando el motorizado ya llegó a la puerta del cliente',
      }),
    })
    .nullable(),
})

/**
 * GET /customer/orders/{id}/reorder (D-51): la bolsa de un pedido propio, rearmada con
 * el menú de HOY. Solo para pintar: el total y el envío salen de `/checkout/quote`, y
 * `POST /customer/orders` vuelve a decidir. Dinero como texto (D-39).
 */
export const CustomerReorderSchema = z.object({
  orderId: uuidOut,
  businessId: uuidOut,
  businessName: z.string(),
  items: z
    .array(
      z.object({
        menuItemId: uuidOut,
        name: z.string().meta({ description: 'Nombre ACTUAL del plato' }),
        quantity: z.number().int(),
        note: z.string().nullable(),
        basePrice: moneyText.meta({ description: 'Precio actual del plato, sin opciones' }),
        modifiers: z.array(
          z.object({
            id: uuidOut,
            groupName: z.string(),
            optionName: z.string(),
            price: moneyText.meta({ description: 'Precio adicional actual de la opción' }),
          }),
        ),
        unitPrice: moneyText.meta({ description: 'basePrice más el precio de sus opciones' }),
        imageUrl: z.string().nullable(),
        thumbnailUrl: z.string().nullable(),
      }),
    )
    .meta({
      description:
        'Solo lo que se puede volver a pedir tal cual. El pedido no guarda el orden en que se agregaron ' +
        'los platos: llegan en un orden fijo, no necesariamente el original',
    }),
  changes: z.array(
    z.object({
      kind: openEnum(REORDER_CHANGE_KINDS),
      itemName: z.string().meta({ description: 'Nombre del plato en el pedido original' }),
      menuItemId: uuidOut
        .nullable()
        .meta({ description: 'Null si el plato ya no existe; con id para abrir su ficha' }),
      before: moneyText
        .nullable()
        .meta({ description: 'Precio unitario anterior; solo en price_changed' }),
      after: moneyText
        .nullable()
        .meta({ description: 'Precio unitario actual; solo en price_changed' }),
    }),
  ),
})

const courierPoint = z.object({
  name: z.string(),
  phone: z.string().nullable(),
  coordinates: coordinatesOut,
  referenceText: z.string(),
})

/** Una solicitud de Entregas en el historial. */
export const CustomerCourierOrderSchema = z.object({
  id: uuidOut,
  shortId: z.string(),
  orderNumber: z.number().int(),
  status: openEnum(COURIER_STATUSES),
  cancelReason: openEnum(COURIER_CANCEL_REASONS).nullable(),
  origin: courierPoint,
  destination: courierPoint,
  itemDescription: z.string(),
  isFragile: z.boolean(),
  payer: openEnum(COURIER_PAYERS),
  driverName: z.string().nullable().meta({
    description: 'Nombre del motorizado de ESTA solicitud; null mientras nadie la acepta',
  }),
  feeAmount: moneyText,
  createdAt: timestampOut,
  deliveredAt: timestampOut.nullable(),
})

/** Un contacto de las últimas entregas, para sugerirlo al pedir otra. */
export const CourierFrequentContactSchema = z.object({
  name: z.string(),
  phone: z.string().nullable(),
  coordinates: coordinatesOut,
  referenceText: z.string(),
  timesUsed: z.number().int(),
  lastUsedAt: timestampOut,
})

/** GET /customer/courier-orders */
export const CustomerCourierOrderListSchema = z.object({
  items: z.array(CustomerCourierOrderSchema),
  nextCursor: z.string().nullable(),
  frequentContacts: z.array(CourierFrequentContactSchema).meta({
    description:
      'De sus últimas 50 solicitudes, los más usados primero (máximo 6). Solo en la primera página (sin cursor); vacío en las siguientes',
  }),
})

/** POST /customer/terms-acceptance */
export const TermsAcceptedSchema = z.object({
  version: z.string(),
  acceptedAt: timestampOut,
  alreadyAccepted: z.boolean().meta({
    description: 'Repetirla no crea otra fila: devuelve la fecha original',
  }),
})

// ── Reseñas (0215, 0280) ─────────────────────────────────────────────────────

/**
 * GET /customer/reviews/pending: el pedido entregado más reciente del cliente sin calificar ni
 * descartar, dentro de la ventana, con el catálogo de etiquetas. `null` si no hay nada que
 * preguntar: nunca una cola. Las Entregas no tienen reseña.
 */
export const CustomerPendingReviewSchema = z.object({
  orderId: uuidOut,
  shortId: z.string(),
  businessId: uuidOut,
  businessName: z.string(),
  businessLogoUrl: z.string().nullable(),
  deliveredAt: timestampOut,
  closesAt: timestampOut.meta({ description: 'Hasta cuándo se puede calificar este pedido' }),
  tags: z.array(z.object({ id: z.string(), label: z.string() })).meta({
    description: 'Las etiquetas que se pueden marcar; `id` es lo que se envía al calificar',
  }),
})

/** POST /customer/orders/{id}/review: la reseña creada. */
export const CreatedReviewSchema = z.object({
  id: uuidOut,
  orderId: uuidOut,
  rating: z.number().int().min(1).max(5),
})
