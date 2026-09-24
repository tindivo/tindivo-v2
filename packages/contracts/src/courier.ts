import { z } from 'zod'
import { CourierPayerSchema, type DirectoryBusinessCategorySchema } from './enums'
import { AddressReferenceSchema, CoordinatesSchema, PhonePeSchema, UuidSchema } from './primitives'

/**
 * Tindivo Entregas: «recogemos lo que ya pagaste y lo llevamos». Contratos de
 * `courier_orders` (la solicitud) y `directory_businesses` (el catálogo que la
 * alimenta). Ver Docs/Encargos/`Tindivo — Catálogo de negocios y Encargos (spec v1).md`.
 */

// --- Límites (fuente única; los usan UI y backend) ---
export const COURIER_ITEM_DESCRIPTION_MAX = 120
export const COURIER_MAX_WEIGHT_KG = 5
export const COURIER_DRIVER_HINT_MAX = 140

/** Un extremo de la ruta (punto A o punto B): quién, dónde, y cómo reconocerlo. */
export const CourierEndpointSchema = z.object({
  contactName: z.string().trim().min(1).max(120),
  contactPhone: PhonePeSchema.optional(),
  coordinates: CoordinatesSchema,
  referenceText: AddressReferenceSchema,
})
export type CourierEndpoint = z.infer<typeof CourierEndpointSchema>

/**
 * Cuerpo de POST /api/v1/customer/courier-orders.
 *
 * `directoryBusinessId` presente = el punto A es un negocio del directorio
 * (autocompleta nombre/teléfono, spec v1 §5.2); ausente = «otro lugar o
 * persona» (spec v1 §10, snapshot sin FK obligatoria — el servidor copia
 * `origin`/`destination` tal cual y ya no dependen de que el negocio exista
 * después).
 *
 * `weightConfirmed` y `prepaidConfirmed` son checkboxes obligatorios de la UI
 * (`Lo que envío está permitido` / `Ya pagué mi pedido`): `z.literal(true)`
 * los hace un 422 legible si el checkout los omite, igual que `pickupTiming`
 * en `CreateOrderRequestSchema`.
 */
export const CreateCourierOrderRequestSchema = z.object({
  directoryBusinessId: UuidSchema.optional(),
  origin: CourierEndpointSchema,
  destination: CourierEndpointSchema,
  requesterName: z.string().trim().min(1).max(120),
  requesterPhone: PhonePeSchema,
  itemDescription: z.string().trim().min(1).max(COURIER_ITEM_DESCRIPTION_MAX),
  isFragile: z.boolean(),
  /** Minutos hasta que está listo para recoger. 0 = "Ya". */
  readyInMin: z.number().int().min(0).max(180),
  payer: CourierPayerSchema,
  weightConfirmed: z.literal(true),
  prepaidConfirmed: z.literal(true),
  /** De `?src=` en la URL de entrada (spec v1 §9: medir el embudo). */
  utmSource: z.string().trim().max(60).optional(),
})
export type CreateCourierOrderRequest = z.infer<typeof CreateCourierOrderRequestSchema>

/** Lo que sirve `public/courier/status` — para pintar el estado del servicio sin sesión. */
export interface CourierServiceStatus {
  enabled: boolean
  openNow: boolean
  opensAt: string | null
  price: string
  hoursLabel: string
}

// --- Directorio de negocios ---

/**
 * Estado visual de la tarjeta/pin (spec v1 §3.1): tres estados excluyentes
 * entre sí (`partner` gana sobre `courierEnabled`), más `hasMenuInTindivo`
 * independiente, que suma un botón extra sin cambiar el estado.
 */
export const DIRECTORY_CARD_STATES = ['partner', 'courier_enabled', 'visible_only'] as const
export type DirectoryCardState = (typeof DIRECTORY_CARD_STATES)[number]

export function directoryCardStateOf(biz: {
  isPartner: boolean
  courierEnabled: boolean
}): DirectoryCardState {
  if (biz.isPartner) return 'partner'
  if (biz.courierEnabled) return 'courier_enabled'
  return 'visible_only'
}

/** Fila del directorio tal como la sirve `public/directory-businesses`. */
export interface DirectoryBusinessView {
  id: string
  name: string
  category: z.infer<typeof DirectoryBusinessCategorySchema>
  coordinates: { lat: number; lng: number }
  referenceText: string
  phone: string | null
  whatsapp: string | null
  opensAt: string | null
  closesAt: string | null
  coverPhotoUrl: string | null
  isPartner: boolean
  partnerBusinessId: string | null
  courierEnabled: boolean
  hasMenuInTindivo: boolean
}
