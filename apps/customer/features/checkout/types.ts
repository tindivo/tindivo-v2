import type { PaymentIntent } from '@tindivo/contracts'

export const DEFAULT_PREPAY_THRESHOLD = 80
export const NEAR_DELIVERY_FEE = 2.0

// Pickup disabled for the pilot (DECISIONS.md: "pickup inactivo; post-piloto").
export const PICKUP_ENABLED = false as boolean

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
