import { z } from 'zod'
import { DeliveryMethodSchema, PaymentIntentSchema } from './enums'
import {
  ADDRESS_REFERENCE_MIN,
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
    deliveryAddress: z.string().max(200).optional(),
    deliveryReference: AddressReferenceSchema.optional(),
    coordinates: CoordinatesSchema.optional(),
    gpsValidation: CustomerGpsValidationSchema.optional(),
    /** Cash on delivery: bill the customer pays with (server validates >= total). */
    cashPayingWith: z.number().positive().max(1000).optional(),
    items: z.array(CreateOrderItemSchema).min(1).max(50),
  })
  .refine(
    (d) =>
      d.deliveryMethod === 'pickup' || (d.deliveryReference?.length ?? 0) >= ADDRESS_REFERENCE_MIN,
    {
      message: `La referencia de dirección es obligatoria para delivery (mínimo ${ADDRESS_REFERENCE_MIN} caracteres)`,
      path: ['deliveryReference'],
    },
  )
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>
