import type { TypedSupabaseClient } from '@tindivo/supabase'

/** Claves de `app_settings` del celular. Los valores de arranque los siembra la migración 0293. */
export const PHONE_CODE_MAX_PER_24H_KEY = 'phone_code_max_per_24h'
export const PHONE_TRANSFER_ENABLED_KEY = 'phone_transfer_enabled'

/** El tope que regía antes de ser parámetro: no cambia de valor. */
export const PHONE_CODE_MAX_PER_24H_DEFAULT = 3
const PHONE_CODE_MAX_PER_24H_CEILING = 20

export type PhoneSettings = { maxCodesPer24h: number; transferEnabled: boolean }

/** Un entero de 1 en adelante: un valor sobre el techo se acota y se registra; cualquier otra cosa cae al tope de siempre. */
export function parsePhoneCodeMax(raw: unknown): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
    if (raw <= PHONE_CODE_MAX_PER_24H_CEILING) return raw
    console.warn(
      `[identity] ${PHONE_CODE_MAX_PER_24H_KEY}=${raw} pasa el techo de ${PHONE_CODE_MAX_PER_24H_CEILING}: se acota`,
    )
    return PHONE_CODE_MAX_PER_24H_CEILING
  }
  if (raw !== undefined) {
    console.warn(`[identity] ${PHONE_CODE_MAX_PER_24H_KEY} no es válido: rige el tope de siempre`)
  }
  return PHONE_CODE_MAX_PER_24H_DEFAULT
}

/** Apagado salvo el booleano `true`. */
export function parsePhoneTransferEnabled(raw: unknown): boolean {
  return raw === true
}

/** Si la lectura falla, rige lo más estricto: el tope de siempre y sin traslado. */
export async function loadPhoneSettings(db: TypedSupabaseClient): Promise<PhoneSettings> {
  const { data, error } = await db
    .from('app_settings')
    .select('key,value')
    .in('key', [PHONE_CODE_MAX_PER_24H_KEY, PHONE_TRANSFER_ENABLED_KEY])
  if (error || !data) {
    console.error(
      '[identity] no se pudo leer app_settings del celular: rige lo más estricto',
      error?.message,
    )
  }
  const rows = error || !data ? [] : data
  const value = (key: string) => rows.find((r) => r.key === key)?.value
  return {
    maxCodesPer24h: parsePhoneCodeMax(value(PHONE_CODE_MAX_PER_24H_KEY)),
    transferEnabled: parsePhoneTransferEnabled(value(PHONE_TRANSFER_ENABLED_KEY)),
  }
}
