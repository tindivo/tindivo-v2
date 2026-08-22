import { z } from 'zod'
import { type PaymentWallet, PaymentWalletSchema } from './enums'
import { PhonePeSchema } from './primitives'

/**
 * Métodos de cobro digital del negocio (0184).
 *
 * Un QR de cobro no es una imagen: es billetera + número + titular + imagen.
 * El número existe para cuando el QR no escanea —el caso que justifica toda
 * esta feature— y el titular para que quien paga confirme, en la pantalla de
 * Yape o Plin, que le está pagando a quien debe.
 */

/**
 * Cuántos caben por negocio. Es el MISMO tope que el CHECK `bpq_slot_range` de
 * la migración 0184: si un día sube a tres, sube en los dos sitios o la API
 * empezará a aceptar filas que la base rechaza.
 */
export const MAX_PAYMENT_QRS = 2

export const PaymentQrSlotSchema = z.number().int().min(1).max(MAX_PAYMENT_QRS)

/** Coincide con `bpq_name_present`. */
export const PaymentQrHolderSchema = z.string().trim().min(2).max(80)

/** Lo que el negocio manda al guardar un método de cobro. */
export const PaymentQrInputSchema = z.object({
  slot: PaymentQrSlotSchema,
  wallet: PaymentWalletSchema,
  accountNumber: PhonePeSchema,
  accountName: PaymentQrHolderSchema,
  /** `null` borra la imagen y deja el método como "solo número". */
  qrUrl: z.url().max(500).nullable().optional(),
})
export type PaymentQrInput = z.infer<typeof PaymentQrInputSchema>

/** Lo que la API sirve al motorizado y al cliente, ya ordenado. */
export interface PaymentQrView {
  slot: number
  wallet: PaymentWallet
  accountNumber: string
  accountName: string
  qrUrl: string | null
  /** El que se enseña primero. Exactamente uno lo lleva. */
  isDefault: boolean
}

/** Rótulo de la billetera tal como el cliente la conoce. */
export function walletLabel(wallet: PaymentWallet): string {
  return wallet === 'plin' ? 'Plin' : 'Yape'
}
