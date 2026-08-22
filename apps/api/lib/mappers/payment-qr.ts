import type { PaymentQrView } from '@tindivo/contracts'
import type { Database } from '@tindivo/supabase'

type Row = Database['public']['Tables']['business_payment_qrs']['Row']

/** Las columnas que hay que pedirle a `business_payment_qrs`. */
export const PAYMENT_QR_COLUMNS = 'slot,wallet,account_number,account_name,qr_url'

type QrRow = Pick<Row, 'slot' | 'wallet' | 'account_number' | 'account_name' | 'qr_url'>

/**
 * Los métodos de cobro del negocio, con el principal primero.
 *
 * `defaultSlot` es un puntero (`businesses.default_payment_qr_slot`), no una
 * garantía: apunta a un slot que puede haberse borrado. Por eso el orden no lo
 * usa como filtro sino como criterio — si ese slot no está entre las filas, la
 * lista sigue saliendo completa y manda el slot más bajo. Un negocio que borró
 * su QR principal enseña el otro en vez de no enseñar nada, que es lo que hace
 * falta en la puerta del cliente.
 *
 * Vive aquí, y no dentro de cada endpoint, porque el motorizado y el cliente
 * TIENEN que ver el mismo QR primero: si divergen, la cajera concilia contra
 * una cuenta y el cliente pagó a la otra.
 */
export function toPaymentQrViews(rows: QrRow[] | null, defaultSlot: number): PaymentQrView[] {
  const ordered = [...(rows ?? [])].sort(
    (a, b) => Number(b.slot === defaultSlot) - Number(a.slot === defaultSlot) || a.slot - b.slot,
  )
  return ordered.map((r, i) => ({
    slot: r.slot,
    wallet: r.wallet,
    accountNumber: r.account_number,
    accountName: r.account_name,
    qrUrl: r.qr_url,
    isDefault: i === 0,
  }))
}
