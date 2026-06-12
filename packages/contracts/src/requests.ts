import { z } from 'zod'
import { DeliveryMethodSchema, PaymentIntentSchema } from './enums'
import { AddressReferenceSchema, CoordinatesSchema, PhonePeSchema, UuidSchema } from './primitives'

/** Línea del carrito al crear un pedido. */
export const CreateOrderItemSchema = z.object({
  menuItemId: UuidSchema,
  quantity: z.number().int().min(1).max(50),
  note: z.string().max(140).optional(),
  /** Ids de opciones de modificadores elegidas (el servidor revalida y precia). */
  modifiers: z.array(UuidSchema).max(20).optional(),
})
export type CreateOrderItem = z.infer<typeof CreateOrderItemSchema>

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
    /** Cash on delivery: bill the customer pays with (server validates >= total). */
    cashPayingWith: z.number().positive().max(1000).optional(),
    items: z.array(CreateOrderItemSchema).min(1).max(50),
  })
  .refine((d) => d.deliveryMethod === 'pickup' || (d.deliveryReference?.length ?? 0) >= 20, {
    message: 'La referencia de dirección es obligatoria para delivery (mínimo 20 caracteres)',
    path: ['deliveryReference'],
  })
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>
