import { z } from 'zod'
import { AppealStatusSchema, RefundStatusSchema } from '../appeal'
import {
  CANCEL_REASONS,
  COURIER_STATUSES,
  ORDER_STATUSES,
  PAYMENT_WALLETS,
  PICKUP_TIMINGS,
  REPORT_STATUSES,
} from '../enums'
import { legacyMoney, legacyMoneyNullable, openEnum, timestampOut, uuidOut } from './schema-helpers'

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
