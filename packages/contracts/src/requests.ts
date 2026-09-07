import { z } from 'zod'
import { DeliveryMethodSchema, PaymentIntentSchema, PickupTimingSchema } from './enums'
import {
  ADDRESS_LINE_MIN,
  ADDRESS_REFERENCE_MIN,
  AddressLineSchema,
  AddressReferenceSchema,
  CoordinatesSchema,
  PhonePeSchema,
  UuidSchema,
} from './primitives'

/** Línea del carrito al crear un pedido. */
export const CreateOrderItemSchema = z.object({
  menuItemId: UuidSchema,
  quantity: z.number().int().min(1).max(50),
  note: z.string().max(140).optional(),
  /** Ids de opciones de modificadores elegidas (el servidor revalida y precia). */
  modifiers: z.array(UuidSchema).max(20).optional(),
})
export type CreateOrderItem = z.infer<typeof CreateOrderItemSchema>

export const CustomerGpsValidationMethodSchema = z.enum([
  'gps_high_accuracy',
  'gps_low_accuracy',
  'manual_skip_prepaid',
  'failed',
])
export type CustomerGpsValidationMethod = z.infer<typeof CustomerGpsValidationMethodSchema>

export const CustomerGpsValidationSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().nonnegative().max(100_000).optional(),
  distanceToCenterKm: z.number().nonnegative().max(50_000).optional(),
  method: CustomerGpsValidationMethodSchema,
})
export type CustomerGpsValidation = z.infer<typeof CustomerGpsValidationSchema>

/**
 * Cuerpo de POST /api/v1/customer/orders. El servidor recalcula montos desde los
 * precios snapshot del menú (no confía en el cliente) y valida el umbral de prepago.
 */
export const CreateOrderRequestSchema = z
  .object({
    businessId: UuidSchema,
    deliveryMethod: DeliveryMethodSchema,
    paymentIntent: PaymentIntentSchema,
    customerName: z.string().trim().min(1).max(120),
    customerPhone: PhonePeSchema,
    deliveryAddress: AddressLineSchema.optional(),
    deliveryReference: AddressReferenceSchema.optional(),
    coordinates: CoordinatesSchema.optional(),
    gpsValidation: CustomerGpsValidationSchema.optional(),
    /** Cash on delivery: bill the customer pays with (server validates >= total). */
    cashPayingWith: z.number().positive().max(1000).optional(),
    /**
     * Optional free-text note for the DRIVER — "ring the bell twice", "blue
     * gate", "there is a dog". Lands in `orders.customer_notes`, which the
     * driver app already renders on the assigned-order screen.
     *
     * The 200-char cap is mirrored by `create_customer_order` (0199): this one
     * gives the customer a clean 422 instead of a silent trim, but the function
     * has the last word — a caller could skip this schema, and the column is
     * unbounded `text`.
     */
    customerNotes: z.string().trim().max(200).optional(),
    /**
     * How good the DELIVERY point is, snapshotted onto the order (0207).
     *
     * NOT the same as `gpsValidation`. That one is the anti-fraud reading of
     * where the customer was STANDING when ordering; this describes the point
     * the driver is being sent to. A customer can order from work with a
     * perfect fix and send the order to a house whose pin was dropped by hand.
     *
     * Both meanings of absent are the ones from 0202, and the driver screen
     * shows them apart:
     *   · `confirmedAt` missing -> nobody ever chose that point; go by the
     *     written reference.
     *   · `confirmedAt` present, `accuracyM` missing -> a person placed it on
     *     the map. There is no measurement because there was no sensor.
     *
     * A bogus accuracy never blocks an order: `create_customer_order` turns 0,
     * negative or null into NULL before the column's CHECK can see it. Metadata
     * must not stop a sale.
     */
    deliveryPointAccuracyM: z.number().int().positive().max(100_000).optional(),
    deliveryPointConfirmedAt: z.string().datetime({ offset: true }).optional(),
    /**
     * CUÁNDO pasa el cliente por su recojo. Obligatorio en pickup (lo fuerza el
     * `.refine` de abajo), prohibido en delivery.
     *
     * Es una PREGUNTA, no una inferencia. Da lo mismo si llegó por el QR del
     * mostrador o buscando el restaurante en Google desde su casa: los dos
     * casos son indistinguibles por origen, y un enlace se fotografía y se
     * comparte. Solo la respuesta del cliente vale, y solo porque después la
     * comprueba una persona.
     *
     * Lo que cambia detrás:
     *   · 'now'   -> el cliente dice estar en el mostrador. La cajera lo
     *               verifica MIRÁNDOLO antes de aceptar, así que el pedido no
     *               pasa por `validando` (no se llama por teléfono a quien está
     *               delante) y no se le exige GPS. Nadie cocina hasta ese sí.
     *   · 'later' -> la comida se hace sin nadie delante. Mismo antifraude que
     *               un delivery: GPS, `customer_contraentrega_decision` y, si
     *               hace falta, `validando` con llamada.
     */
    pickupTiming: PickupTimingSchema.optional(),
    items: z.array(CreateOrderItemSchema).min(1).max(50),
  })
  .refine((d) => d.deliveryMethod === 'pickup' || d.pickupTiming === undefined, {
    message: 'pickupTiming solo aplica a pedidos de recojo',
    path: ['pickupTiming'],
  })
  .refine((d) => d.deliveryMethod !== 'pickup' || d.pickupTiming !== undefined, {
    // El servidor tiene su propio default ('later', el lado caro), pero el
    // canal del cliente NO se apoya en él: si el checkout deja de mandar la
    // respuesta, eso es un bug del checkout y conviene que estalle aquí con un
    // 422 legible, no que se convierta en silencio en el camino más estricto y
    // el cliente vea una llamada que nadie le prometió.
    message: 'Falta indicar cuándo recoges el pedido',
    path: ['pickupTiming'],
  })
  .refine(
    (d) =>
      d.deliveryMethod === 'pickup' || (d.deliveryAddress?.trim().length ?? 0) >= ADDRESS_LINE_MIN,
    {
      message: `La dirección es obligatoria para delivery (mínimo ${ADDRESS_LINE_MIN} caracteres)`,
      path: ['deliveryAddress'],
    },
  )
  .refine(
    (d) =>
      d.deliveryMethod === 'pickup' ||
      (d.deliveryReference?.trim().length ?? 0) >= ADDRESS_REFERENCE_MIN,
    {
      message: `La referencia es obligatoria para delivery (mínimo ${ADDRESS_REFERENCE_MIN} caracteres)`,
      path: ['deliveryReference'],
    },
  )
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>
