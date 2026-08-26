import type { PaymentIntent } from '@tindivo/contracts'

// Vive en `lib/` porque los términos y condiciones prometen este mismo número y
// no pueden importar de una feature. Ver `lib/prepay.ts`.
export { DEFAULT_PREPAY_THRESHOLD } from '@/lib/prepay'

export const DEFAULT_MAX_CASH_BILL = 100
export const DEFAULT_MAX_CHANGE = 50
export const CASH_STEP = 0.5 // redondeo del input libre: múltiplos de S/0.50
export const NEAR_DELIVERY_FEE = 2.0

/**
 * Recojo en tienda, desactivado para el piloto (DECISIONS.md: "pickup inactivo;
 * post-piloto"). Mientras esta bandera sea `false`, `unified-checkout` no
 * renderiza el selector y `deliveryMethod` se queda en 'delivery'.
 *
 * NO activarla sin recorrer el flujo entero primero. El backend lo soporta
 * (`delivery_fee = 0`, comisión de pickup configurada en 1.00) pero nunca se ha
 * ejercitado de punta a punta, y tiene un modo de fallo identificado:
 *
 *   Todas las transiciones intermedias las escribe el MOTORIZADO — 'take',
 *   'arrived', 'pickup', 'deliver'. En un recojo en tienda no hay motorizado,
 *   así que no está claro quién lleva el pedido a 'delivered'. Un pickup que se
 *   quede atascado además bloquea al cliente para volver a pedir de ese mismo
 *   restaurante, por el guard de pedido activo de 0105.
 */
export const PICKUP_ENABLED = false as boolean

/**
 * Por qué el cliente tiene (o no tiene) el envío gratis de la promo (0187).
 *
 * Lo decide la DB, no el navegador: sale tal cual de
 * `current_customer_promo_free_delivery()`. Aquí solo se traduce a copy.
 */
export type PromoReason =
  | 'active'
  | 'exhausted'
  | 'already_redeemed'
  | 'outside_window'
  | 'inactive'

export interface PromoState {
  eligible: boolean
  reason: PromoReason
}

/**
 * Estado inicial y de fallo. `inactive` + `eligible: false` es el lado seguro,
 * y aquí es el CONTRARIO al del caso de contraentrega: enseñar S/2 y que el
 * servidor cobre S/0 es una sorpresa agradable; enseñar S/0 y que cobre S/2 es
 * una queja a soporte. Y `inactive` no pinta ningún cartel, así que un timeout
 * de red nunca anuncia "promoción agotada".
 */
export const PROMO_DESCONOCIDA: PromoState = { eligible: false, reason: 'inactive' }

/**
 * El aviso que ve el cliente para cada motivo.
 *
 * `outside_window` e `inactive` devuelven null A PROPÓSITO: cuando la promo no
 * está viva, el checkout debe verse exactamente como antes de que existiera. Un
 * "promoción agotada" en septiembre habla de algo que ya no existe, y hace
 * parecer que el cliente llegó tarde a algo que sigue en pie.
 */
export function promoAviso(reason: PromoReason): string | null {
  switch (reason) {
    case 'active':
      return 'Promo de lanzamiento: tu envío va por nuestra cuenta.'
    case 'exhausted':
      return 'La promo de envío gratis se agotó.'
    case 'already_redeemed':
      return 'Ya usaste tu envío gratis de lanzamiento.'
    default:
      return null
  }
}

export interface Address {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
  coordinates_lat: number | null
  coordinates_lng: number | null
}

export interface OrderResult {
  id: string
  shortId: string
  status: string
  total: number
}

export interface CustomerProfile {
  full_name: string | null
  phone: string | null
  phone_verified_at: string | null
  contraentrega_blocked?: boolean | null
  blocked_until?: string | null
}

export type GeoBlockKind = 'far' | 'unavailable' | 'low_accuracy'

export interface GpsValidationPayload {
  lat?: number
  lng?: number
  accuracyM?: number
  distanceToCenterKm?: number
  method: 'gps_high_accuracy' | 'gps_low_accuracy' | 'manual_skip_prepaid' | 'failed'
}

export type CashChoice = 'exact' | '20' | '50' | '100' | 'custom'

export const CASH_CHIPS: { value: CashChoice; label: string; amount: number | null }[] = [
  { value: 'exact', label: 'Exacto', amount: null },
  { value: '20', label: 'S/ 20', amount: 20 },
  { value: '50', label: 'S/ 50', amount: 50 },
  { value: '100', label: 'S/ 100', amount: 100 },
]

export interface PrepayInfo {
  businessName: string
  yapeNumber: string | null
  qrUrl: string | null
  total: number
  hasProof: boolean
}

export interface PaymentOption {
  value: PaymentIntent
  label: string
  desc: string
  logos: string[]
}

export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    value: 'pending_cash',
    label: 'Efectivo al recibir',
    desc: 'Paga en efectivo al motorizado',
    logos: ['cash'],
  },
  {
    value: 'pending_yape',
    label: 'Billetera digital al recibir',
    desc: 'Yape o Plin al recibir tu pedido',
    logos: ['yape', 'plin'],
  },
  {
    value: 'prepaid',
    label: 'Prepago con billetera digital',
    desc: 'Paga ahora con Yape/Plin y sube tu comprobante',
    logos: ['yape', 'plin'],
  },
]
