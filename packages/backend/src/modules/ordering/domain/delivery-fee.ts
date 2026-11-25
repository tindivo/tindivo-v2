import type { DISTANCE_BANDS } from '@tindivo/contracts'

/** Soles -> céntimos enteros: la suma no arrastra error de coma flotante. */
export const cents = (soles: number): number => Math.round(soles * 100)

export type DeliveryBand = (typeof DISTANCE_BANDS)[number]

/**
 * La tarifa nominal del envío, en céntimos, antes de promociones. Mismo orden que
 * `create_customer_order` (0283): la tarifa de la banda en `app_settings.delivery_bands`,
 * luego la tarifa del negocio y por último S/ 2.00. Es la única copia en TypeScript:
 * la usan la cotización y la guardia del umbral de la creación (DES-5).
 */
export function nominalDeliveryFeeCents(
  band: DeliveryBand,
  bandsSetting: unknown,
  businessDeliveryFee: number | string | null,
): number {
  const bands = (bandsSetting ?? {}) as Record<string, unknown>
  // `null` o vacío = clave ausente, como en SQL (`(v_bands ->> banda)::numeric` da null).
  const raw = bands[band]
  const fromBands = raw === null || raw === '' ? Number.NaN : Number(raw)
  const fee = Number.isFinite(fromBands)
    ? fromBands
    : businessDeliveryFee != null
      ? Number(businessDeliveryFee)
      : 2
  return cents(fee)
}
