import type { DISTANCE_BANDS } from '@tindivo/contracts'

/** Soles -> céntimos enteros: la suma no arrastra error de coma flotante. */
export const cents = (soles: number): number => Math.round(soles * 100)

export type DeliveryBand = (typeof DISTANCE_BANDS)[number]

export interface NominalDeliveryFee {
  /** La tarifa nominal del envío, en céntimos, antes de promociones. Siempre finita. */
  cents: number
  /**
   * `true` solo si TODO lo que se leyó para calcularla es un número JSON finito ordinario o
   * está ausente / es `null` (el respaldo documentado). `false` si la configuración está
   * PRESENTE pero es otra cosa (cadena, aunque parezca un número; booleano; objeto; número
   * que desborda; `delivery_bands` que no es un objeto): entonces `cents` es un respaldo de
   * PINTADO y quien quiera RECHAZAR con él no debe; decide `create_customer_order`, que
   * convierte a su manera (`numeric`) y puede aceptar, rechazar o fallar donde JavaScript
   * no lo sabe.
   */
  reliable: boolean
}

/**
 * ¿Es un número JSON finito ordinario? Es la ÚNICA condición con la que la guardia HTTP del
 * umbral puede rechazar (403). Las cadenas no cuentan aunque parezcan números (`"80"`,
 * `"1e309"`): JavaScript y PostgreSQL las convierten distinto. `NaN` e `Infinity` tampoco
 * (un `1e309` escrito como número JSON llega aquí como `Infinity`).
 */
export const isPlainNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Un número ordinario que además SQL y JavaScript comparan igual: cabe en `numeric(10,2)`
 * (la columna donde se guarda la tarifa; más grande, el insert falla y la RPC responde 500) y
 * no trae fracción de céntimo (JavaScript compara en céntimos redondeados; SQL, el valor exacto).
 * Es lo que exige la guardia HTTP para rechazar con el umbral o con una tarifa.
 */
export const isMoneyNumber = (v: unknown): v is number =>
  isPlainNumber(v) && Math.abs(v) <= 99999999.99 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

const NUMERIC_TEXT = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/

/**
 * Solo para PINTAR (nunca para rechazar): el número que una cadena numérica ya daba en la
 * cotización antes de este cierre, o `NaN` si no es una cadena numérica de valor finito.
 */
const paintable = (v: unknown): number =>
  typeof v === 'string' && NUMERIC_TEXT.test(v) ? Number(v) : Number.NaN

/**
 * La tarifa nominal del envío. Mismo orden que `create_customer_order` (0283:233): la tarifa
 * de la banda en `app_settings.delivery_bands`, luego la tarifa del negocio y por último
 * S/ 2.00. Solo la clave AUSENTE o `null` cae al respaldo con `reliable: true`. Un valor
 * presente que no es un número ordinario se pinta como antes (una cadena numérica finita da
 * su valor; lo demás, el respaldo) pero queda `reliable: false`. Es la única copia en
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
        if (isMoneyNumber(raw)) fromBands = raw
        else {
          reliable = false
          fromBands = paintable(raw)
        }
      }
    }
  }
  let fee = fromBands
  if (!Number.isFinite(fee)) {
    if (businessDeliveryFee === null || businessDeliveryFee === undefined) fee = 2
    else if (isMoneyNumber(businessDeliveryFee)) fee = businessDeliveryFee
    else {
      reliable = false
      const text = paintable(businessDeliveryFee)
      fee = Number.isFinite(text) ? text : 2
    }
  }
  return { cents: cents(fee), reliable }
}
