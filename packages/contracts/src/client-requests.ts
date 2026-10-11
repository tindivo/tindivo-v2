import { z } from 'zod'
import { DeliveryMethodSchema } from './enums'
import {
  AddressLineSchema,
  AddressReferenceSchema,
  CoordinatesSchema,
  PhonePeSchema,
  UuidSchema,
} from './primitives'

/**
 * Cuerpos de las rutas del cliente que vivían escritos dentro de su `route.ts`.
 * Suben aquí para que el OpenAPI y la ruta lean EL MISMO esquema: si una cambia,
 * cambia la otra (lote MV2b). Son los de siempre, sin una regla de más ni de
 * menos.
 */

/** POST /customer/phone/send-code */
export const SendPhoneCodeRequestSchema = z.object({
  phone: PhonePeSchema,
})

/** POST /customer/phone/verify */
export const VerifyPhoneCodeRequestSchema = z.object({
  phone: PhonePeSchema,
  code: z.string().length(6, 'El código debe tener 6 dígitos'),
})

/** POST /customer/orders/{id}/prepay-proof — la ruta del archivo YA subido a Storage. */
export const PrepayProofRequestSchema = z.object({
  path: z.string().trim().min(1).max(500).meta({
    description: 'Ruta dentro del bucket `payment-proofs`; empieza por `<id del usuario>/`',
  }),
})

/**
 * POST /customer/orders/{id}/appeal. No es `CreateAppealSchema`: aquel es
 * `.strict()` y esta ruta siempre ha aceptado propiedades de más.
 */
export const CreateOrderAppealRequestSchema = z.object({
  description: z.string().trim().max(500).optional(),
})

/** POST /push/subscriptions */
export const PushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) }),
  userAgent: z.string().max(400).optional(),
  /**
   * UUID por instalación de PWA, generado y guardado por el cliente. Es la
   * identidad REAL del dispositivo; `userAgent` no lo es. Opcional porque un
   * cliente sin actualizar no lo manda todavía.
   */
  installId: z.string().min(8).max(64).optional(),
})

/**
 * DELETE /push/subscriptions. Tres formas excluyentes: `{ endpoint }` (este
 * dispositivo, al cerrar sesión aquí), `{ id }` (una fila de la lista de
 * dispositivos) o `{ all: true }` (todos).
 *
 * `all` existe para acompañar a `signOutEverywhere`. Revocar las sesiones sin
 * borrar las suscripciones dejaría al dispositivo perdido sin poder abrir nada
 * pero AÚN recibiendo notificaciones, que llevan nombre y dirección del cliente
 * en la vista previa: el acceso se corta y la fuga de datos sigue.
 */
export const PushUnsubscribeRequestSchema = z.union([
  z.object({ endpoint: z.string().url().max(1000) }),
  z.object({ id: z.string().uuid() }),
  z.object({ all: z.literal(true) }),
])

// ── Lote MV4b: lo que la app nativa del cliente hacía directo contra Supabase ──

/**
 * POST /customer/checkout/quote. Las líneas son las del carrito; el servidor
 * pone los precios (nunca confía en uno que venga del cliente).
 */
export const CheckoutQuoteRequestSchema = z.object({
  businessId: UuidSchema,
  deliveryMethod: DeliveryMethodSchema,
  /** Punto de entrega. Sin él, un delivery se cotiza en la banda cercana. */
  coordinates: CoordinatesSchema.optional(),
  items: z
    .array(
      z.object({
        menuItemId: UuidSchema,
        quantity: z.number().int().min(1).max(50),
        modifiers: z.array(UuidSchema).max(20).optional(),
      }),
    )
    .min(1)
    .max(50),
})

const AddressLabelSchema = z.string().trim().min(1).max(30)
const AccuracySchema = z.number().positive().max(100_000)

/** POST /customer/addresses */
export const CreateCustomerAddressRequestSchema = z.object({
  label: AddressLabelSchema.default('Casa'),
  line: AddressLineSchema.optional(),
  reference: AddressReferenceSchema,
  coordinates: CoordinatesSchema.optional(),
  accuracyM: AccuracySchema.optional().meta({
    description: 'Precisión del GPS en metros; solo cuenta junto con `coordinates`',
  }),
  isDefault: z.literal(true).optional().meta({
    description:
      'Hacerla la predeterminada. Si se omite, lo es solo cuando el cliente aún no tiene ninguna',
  }),
})

/** PATCH /customer/addresses/{id}. Lo que no se manda no se toca. */
export const UpdateCustomerAddressRequestSchema = z
  .object({
    label: AddressLabelSchema,
    line: AddressLineSchema,
    reference: AddressReferenceSchema,
    coordinates: CoordinatesSchema.nullable().meta({
      description:
        '`null` borra el punto. El mismo punto de antes conserva su sello de confirmación',
    }),
    accuracyM: AccuracySchema,
    isDefault: z.literal(true).meta({
      description: 'Solo se puede marcar; la predeterminada deja de serlo al marcar otra',
    }),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que actualizar' })

/** POST /customer/terms-acceptance */
export const TermsAcceptanceRequestSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,32}$/, 'Versión de términos inválida')
    .meta({ description: 'La versión del texto que la persona vio, p. ej. `2026-05`' }),
})

/** Paginación por cursor de las listas del cliente. */
export const CUSTOMER_PAGE_MAX = 50
export const CUSTOMER_PAGE_DEFAULT = 20
export const CustomerPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(CUSTOMER_PAGE_MAX).default(CUSTOMER_PAGE_DEFAULT),
  cursor: z.string().min(1).max(300).optional(),
})
