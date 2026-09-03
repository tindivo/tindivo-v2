import type { AppealStatus, RefundStatus } from '@tindivo/contracts'
import type { SavedAddress } from '@/lib/address-record'

/**
 * Una dirección guardada. El tipo vive en `lib/address-record.ts` porque lo
 * leen cuatro pantallas de dos features distintas; aquí solo se le pone el
 * nombre con el que esta feature lo llama.
 */
export type Address = SavedAddress

export interface OrderRow {
  id: string
  short_id: string
  status: string
  order_amount: number
  created_at: string
}

export interface Profile {
  name: string
  email: string
  phone: string
  phone_verified_at?: string | null
}

export interface ProfileStep {
  id: 'name' | 'phone' | 'address'
  title: string
  description: string
  isCompleted: boolean
  actionLabel: string
}

/**
 * Lo mínimo que /cuenta necesita de una apelación: los contadores de la tarjeta
 * «Apelaciones» y a qué pedido enlazar.
 *
 * No es `CustomerAppealListItemDto`. Ese DTO lleva `refundProofUrl`, una URL
 * firmada de Storage que solo puede emitir `service_role`, y por eso obliga a
 * pasar por la API. Aquí no se muestra ningún comprobante —eso vive en el
 * detalle del pedido—, así que el resumen se lee directo por PostgREST con la
 * policy `rep_participant_read` y se ahorra el salto cross-origin.
 */
export interface AppealSummary {
  appealStatus: AppealStatus
  refundStatus: RefundStatus | null
  orderShortId: string | null
}
