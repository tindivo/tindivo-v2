import { z } from 'zod'
import {
  BUSINESS_PRIMARY_CAPABILITIES,
  CANCEL_REASONS,
  COURIER_CANCEL_REASONS,
  COURIER_PAYERS,
  COURIER_STATUSES,
  DELIVERY_METHODS,
  ORDER_STATUSES,
  PAYMENT_INTENTS,
} from '../enums'
import { STORE_AUDIENCES, STORE_CONDITIONS, STORE_STATUSES } from '../store'
import { legacyMoney, legacyMoneyNullable, openEnum, timestampOut, uuidOut } from './schema-helpers'

/**
 * Respuestas de las rutas públicas, descritas TAL COMO SON HOY (lotes MV2a y
 * MV2b). Cada forma sale de la ruta y de la definición viva de su función SQL
 * en tindivo-prod (leídas el 2026-10-09 y el 2026-10-10), y la nulabilidad, de
 * `information_schema.columns` de esa misma base. Si una ruta cambia su
 * respuesta, este esquema cambia en el mismo commit y el diff del OpenAPI lo
 * enseña; la prueba de conformidad de `apps/api` lo comprueba contra la
 * respuesta real.
 */

/** GET /health */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('tindivo-api'),
  version: z.literal('v1'),
  time: z.string().meta({ description: 'ISO 8601, UTC' }),
})

/**
 * GET /public/schedule — `get_order_intake_status()`.
 *
 * La ruta tiene un respaldo para cuando la función falla, y ese respaldo NO
 * tiene la misma forma: no trae `startTime` y manda `serverTimeLima` como ISO en
 * UTC, mientras que la función lo manda como «YYYY-MM-DD HH:MM:SS» en hora de
 * Lima. Se documenta la unión de los dos; corregirlo es un cambio aparte.
 */
export const ScheduleStatusSchema = z.object({
  isOpen: z.boolean(),
  cutoff: z.string().meta({ description: 'Hora de cierre de la recepción, HH:MM en Lima' }),
  startTime: z.string().optional().meta({
    description: 'Hora de apertura, HH:MM en Lima. Falta cuando responde el respaldo de la ruta',
  }),
  serverTimeLima: z.string().meta({
    description:
      'Hora del servidor. Normalmente «YYYY-MM-DD HH:MM:SS» en Lima; en el respaldo, ISO 8601 en UTC',
  }),
  message: z.string().nullable(),
})

/** GET /public/courier/status — `courier_service_status()`, sin envoltura. */
export const CourierServiceStatusSchema = z.object({
  enabled: z.boolean(),
  openNow: z.boolean(),
  hours: z
    .object({
      start: z.string().meta({ description: 'HH:MM en Lima' }),
      end: z.string().meta({ description: 'HH:MM en Lima' }),
      days: z.array(z.number().int()).optional().meta({
        description:
          'Días ISO: 1 = lunes … 7 = domingo. Sin `days`, todos los días: es lo que hace `is_within_courier_schedule()`',
      }),
    })
    .nullable()
    .meta({ description: 'Tal cual `app_settings.courier.hours`. Null en el respaldo de la ruta' }),
  price: legacyMoney,
  pausedMessage: z.string().nullable(),
})

/** GET /public/search — `search_catalog()`. */
export const SearchCatalogResponseSchema = z.object({
  businesses: z.array(
    z.object({
      id: uuidOut,
      slug: z.string(),
      name: z.string(),
      tagline: z.string().nullable(),
      accent_color: z.string(),
      logo_url: z.string().nullable(),
      primary_capability: openEnum(BUSINESS_PRIMARY_CAPABILITIES).nullable(),
      estimated_eta_min: z.number().int(),
      estimated_eta_max: z.number().int(),
    }),
  ),
  items: z.array(
    z.object({
      id: uuidOut,
      business_id: uuidOut,
      business_slug: z.string(),
      business_name: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      base_price: legacyMoney,
      image_url: z.string().nullable(),
      image_hue: z.number().int().nullable(),
    }),
  ),
})

export const SearchCatalogQuerySchema = z.object({
  q: z.string().trim().min(2).max(60).meta({ description: 'Texto a buscar en negocios y platos' }),
})

/** POST /public/pilot-access — hoy responde siempre lo mismo (el piloto cerrado terminó). */
export const PilotAccessResponseSchema = z.object({
  allowed: z.boolean(),
  pilotActive: z.boolean(),
})

// ── Catálogo ─────────────────────────────────────────────────────────────────

/** Día de `business_schedule`. Las horas son texto `HH:MM` en Lima, tal cual las guarda el editor. */
export const ScheduleDaySchema = z.object({
  day_of_week: z
    .number()
    .int()
    .meta({ description: '0 = lunes … 6 = domingo (no es `Date.getDay()`)' }),
  is_open: z.boolean(),
  shift1_start: z.string().nullable(),
  shift1_end: z.string().nullable(),
  shift2_start: z.string().nullable(),
  shift2_end: z.string().nullable(),
})

/** Columnas públicas de `businesses` (nunca Yape, saldo ni comisiones). */
const publicBusinessFields = {
  id: uuidOut,
  slug: z.string(),
  name: z.string(),
  accent_color: z.string().meta({ description: 'Hex sin `#`' }),
  logo_url: z.string().nullable(),
  banner_url: z.string().nullable(),
  tagline: z.string().nullable(),
  categoria: z.array(z.string()).nullable(),
  primary_capability: openEnum(BUSINESS_PRIMARY_CAPABILITIES).nullable(),
  estimated_eta_min: z.number().int(),
  estimated_eta_max: z.number().int(),
  coordinates_lat: z.number().nullable(),
  coordinates_lng: z.number().nullable(),
  address: z.string().nullable(),
  accepts_web_pickup: z.boolean(),
  accepts_web_delivery: z.boolean(),
  whatsapp_number: z.string().nullable().meta({
    description: 'Contacto público opt-in para pedir por WhatsApp en modo catálogo',
  }),
}

/** GET /public/businesses — negocios publicados, activos y sin bloquear, por nombre. */
export const PublicBusinessListSchema = z.array(
  z.object({
    ...publicBusinessFields,
    publishes_catalog: z.boolean(),
    is_open_now: z.boolean().nullable().meta({
      description:
        'Según su horario y la apertura confirmada del día. Null = sin horario configurado: no se muestra insignia',
    }),
  }),
)

const ModifierOptionSchema = z.object({
  id: uuidOut,
  name: z.string(),
  description: z.string().nullable(),
  additional_price: legacyMoney,
})

const ModifierGroupSchema = z.object({
  id: uuidOut,
  name: z.string(),
  selection_type: openEnum(['single', 'multi']),
  is_required: z.boolean(),
  min_selections: z.number().int(),
  max_selections: z.number().int().nullable(),
  price_display: openEnum(
    ['delta', 'total'],
    '`total` enseña el precio final del plato en vez de «+ S/ x». Solo cambia cómo se muestra',
  ),
  options: z.array(ModifierOptionSchema).meta({ description: 'Solo las disponibles' }),
})

const MenuItemSchema = z.object({
  id: uuidOut,
  category_id: uuidOut,
  name: z.string(),
  description: z.string().nullable(),
  base_price: legacyMoney,
  image_url: z.string().nullable(),
  image_hue: z.number().int().nullable(),
  is_available: z.boolean(),
  is_compact: z.boolean().meta({ description: '«Destacado» (nombre histórico). Van primero' }),
  badges: z.array(z.string()),
  display_order: z.number().int(),
  available_days: z
    .array(z.number().int())
    .nullable()
    .meta({
      description:
        'Franja horaria del plato (0226): 0 = lunes … 6 = domingo, como `schedule`. Null = todos. ' +
        'La franja se resuelve en el cliente contra su reloj, en hora de Lima',
    }),
  available_from: z
    .string()
    .nullable()
    .meta({ description: '`HH:MM:SS` en Lima. Null = sin franja' }),
  available_to: z
    .string()
    .nullable()
    .meta({ description: '`HH:MM:SS` en Lima. Null = sin franja' }),
  modifier_groups: z.array(ModifierGroupSchema),
})

/** GET /public/businesses/{id} — el negocio con su carta. Solo categorías activas con platos. */
export const PublicBusinessDetailSchema = z.object({
  business: z.object(publicBusinessFields),
  categories: z.array(
    z.object({
      id: uuidOut,
      name: z.string(),
      blurb: z.string().nullable(),
      display_order: z.number().int(),
      items: z.array(MenuItemSchema),
    }),
  ),
  schedule: z.array(ScheduleDaySchema),
  opening_confirmed: z.boolean().nullable().meta({
    description:
      'Si alguien del negocio confirmó que hoy atiende. Null = no se pudo consultar (manda el horario)',
  }),
})

// ── Seguimiento ──────────────────────────────────────────────────────────────

/** GET /public/orders/{shortId} — `get_tracking()`, sin envoltura. Visible hasta 24 h después de entregado. */
export const OrderTrackingSchema = z.object({
  shortId: z.string(),
  orderNumber: z.number().int(),
  businessName: z.string(),
  businessAccentColor: z.string(),
  status: openEnum(ORDER_STATUSES),
  deliveryMethod: openEnum(DELIVERY_METHODS),
  paymentIntent: openEnum(PAYMENT_INTENTS),
  cancelReason: openEnum(CANCEL_REASONS).nullable(),
  paysWith: legacyMoneyNullable,
  changeToGive: legacyMoneyNullable,
  estimatedReadyAt: timestampOut.nullable(),
  deliveredAt: timestampOut.nullable(),
  driverName: z.string().nullable(),
  arrivedAtCustomerAt: timestampOut.nullable(),
  readyEarlyUsed: z.boolean(),
  readyEarlyAt: timestampOut.nullable(),
  travelMinutes: z.object({ min: z.number().int(), max: z.number().int() }),
  prepayVerificationMinutes: z.number().int(),
  acceptanceMinutes: z.number().int(),
  paymentMinutes: z.number().int(),
  driverPhone: z.string().nullable().meta({
    description: 'Solo cuando el motorizado ya llegó a la puerta del cliente',
  }),
  amount: legacyMoney,
  deliveryFee: legacyMoney,
  total: legacyMoney,
  createdAt: timestampOut,
  pendingAcceptanceAt: timestampOut.nullable(),
  awaitingPaymentAt: timestampOut.nullable(),
  validatingAt: timestampOut.nullable(),
  proofAttempt: z.number().int(),
  proofUrl: z
    .string()
    .nullable()
    .meta({ description: 'Ruta del comprobante en Storage, no una URL' }),
  paymentVerifiedAt: timestampOut.nullable(),
  hasAppeal: z.boolean(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.number().int(),
      lineTotal: legacyMoney,
      modifiers: z.array(z.object({ group: z.string(), name: z.string(), price: legacyMoney })),
    }),
  ),
})

/** GET /public/courier/{shortId} — `get_courier_tracking()`, sin envoltura y sin teléfonos. */
export const CourierTrackingSchema = z.object({
  shortId: z.string(),
  orderNumber: z.number().int(),
  status: openEnum(COURIER_STATUSES),
  originName: z.string(),
  destinationName: z.string(),
  originCoordinates: z.object({ lat: z.number(), lng: z.number() }),
  destinationCoordinates: z.object({ lat: z.number(), lng: z.number() }),
  itemDescription: z.string(),
  feeAmount: legacyMoney,
  payer: openEnum(COURIER_PAYERS),
  readyAt: timestampOut,
  driverName: z.string().nullable(),
  createdAt: timestampOut,
  acceptedAt: timestampOut.nullable(),
  pickedUpAt: timestampOut.nullable(),
  deliveredAt: timestampOut.nullable(),
  cancelledAt: timestampOut.nullable(),
  cancelReason: openEnum(COURIER_CANCEL_REASONS).nullable(),
  acceptMinutes: z.number().int(),
  acceptDeadline: timestampOut.nullable().meta({
    description: 'Solo mientras nadie la toma (`requested`); si vence, se cancela sola',
  }),
})

// ── Tindivo Store ────────────────────────────────────────────────────────────

/** `app_settings.store` ya normalizado. Si la fila falta o está corrupta, los valores iniciales. */
export const StoreSettingsResponseSchema = z.object({
  whatsappNumber: z.string().meta({ description: 'Solo dígitos, con código de país' }),
  deliveryMin: legacyMoney,
  deliveryMax: legacyMoney,
  deliveryText: z.string().nullable(),
})

/** Tarjeta de la grilla, de «Vendidos recientemente» y de «Relacionados». */
export const StoreCardSchema = z.object({
  id: uuidOut,
  code: z.string(),
  slug: z.string().nullable(),
  title: z.string().nullable(),
  price: legacyMoneyNullable,
  originalPrice: legacyMoneyNullable,
  isClearance: z.boolean(),
  condition: openEnum(STORE_CONDITIONS).nullable(),
  conditionScore: z.number().int().nullable(),
  sizeLabel: z.string().nullable(),
  status: openEnum(STORE_STATUSES),
  categorySlug: z.string().nullable(),
  categoryName: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  coverFocusX: z.number(),
  coverFocusY: z.number(),
  soldAt: timestampOut.nullable(),
})

/** GET /public/store */
export const StoreListResponseSchema = z.object({
  products: z
    .array(StoreCardSchema)
    .meta({ description: 'Disponibles y reservados que coinciden con el filtro' }),
  sold: z.array(StoreCardSchema).meta({ description: 'Hasta 6 vendidos, del más reciente' }),
  categories: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        icon: z.string(),
        count: z.number().int().meta({ description: 'Sobre el catálogo sin filtrar' }),
      }),
    )
    .meta({ description: 'Solo las que tienen algún artículo público' }),
  totalAvailable: z.number().int(),
  settings: StoreSettingsResponseSchema,
})

/** GET /public/store/{slug} */
export const StoreDetailResponseSchema = z.object({
  product: StoreCardSchema.extend({
    description: z.string().nullable(),
    negotiable: z.boolean(),
    audience: openEnum(STORE_AUDIENCES).nullable(),
    createdAt: timestampOut,
    images: z.array(
      z.object({
        id: uuidOut,
        url: z.string(),
        thumbUrl: z.string(),
        position: z.number().int(),
      }),
    ),
  }),
  related: z
    .array(StoreCardSchema)
    .meta({ description: '2 a 4 disponibles, de la misma categoría primero' }),
  settings: StoreSettingsResponseSchema,
})
