import type { DISTANCE_BANDS } from '@tindivo/contracts'

/** Soles -> céntimos enteros: la suma no arrastra error de coma flotante. */
export const cents = (soles: number): number => Math.round(soles * 100)

export type DeliveryBand = (typeof DISTANCE_BANDS)[number]

export interface NominalDeliveryFee {
  /** La tarifa nominal del envío, en céntimos, antes de promociones. */
  cents: number
  /**
   * `false` si la configuración de las tarifas está PRESENTE pero mal formada (la tarifa de
   * la banda no es un número, o `delivery_bands` no es un objeto). Entonces `cents` es un
   * respaldo de PINTADO: quien quiera RECHAZAR con él no debe, porque `create_customer_order`
   * convierte ese valor a `numeric` y falla antes de comparar nada.
   */
  reliable: boolean
}

const SQL_NUMERIC = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/

/**
 * ¿Es un número finito, o una cadena que `::numeric` de SQL convierte a un número finito?
 * (`NaN`, `Infinity`, texto, cadena vacía, hexadecimal y booleanos no lo son: en SQL fallan o
 * no se comportan como un número ordinario.) Lo usan la tarifa de banda y el umbral de prepago.
 */
export const isSqlNumeric = (v: unknown): boolean =>
  (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && SQL_NUMERIC.test(v))

/**
 * La tarifa nominal del envío. Mismo orden que `create_customer_order` (0283:233): la tarifa
 * de la banda en `app_settings.delivery_bands`, luego la tarifa del negocio y por último
 * S/ 2.00. Solo la clave AUSENTE o `null` cae al respaldo (en SQL, `(v_bands ->> banda)::numeric`
 * da null); un valor presente que no es un número (texto, cadena vacía, booleano) hace fallar
 * la conversión en SQL, así que aquí queda marcado como no fiable. Es la única copia en
 * TypeScript: la usan la cotización y la guardia del umbral de la creación (DES-5).
 */
export function nominalDeliveryFee(
  band: DeliveryBand,
  bandsSetting: unknown,
  businessDeliveryFee: number | string | null,
): NominalDeliveryFee {
  let reliable = true
  let fromBands = Number.NaN
  if (bandsSetting !== null && bandsSetting !== undefined) {
    if (typeof bandsSetting !== 'object' || Array.isArray(bandsSetting)) {
      reliable = false
    } else {
      const raw = (bandsSetting as Record<string, unknown>)[band]
      if (raw !== null && raw !== undefined) {
        if (isSqlNumeric(raw)) fromBands = Number(raw)
        else reliable = false
      }
    }
  }
  const fee = Number.isFinite(fromBands)
    ? fromBands
    : businessDeliveryFee != null
      ? Number(businessDeliveryFee)
      : 2
  return { cents: cents(fee), reliable }
}
