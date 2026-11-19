import type { TypedSupabaseClient } from '@tindivo/supabase'

type RpcResult = { data: unknown; error: { message: string; code?: string } | null }
type UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>

/** La cuenta se borró mientras tanto: lo dice el disparador `reject_deleted_account` al sellar el envío. */
export class AccountDeletedError extends Error {}

/**
 * Reserva, de forma atómica en la base, un envío de código SMS para `userId` ANTES de llamar a Twilio: bloquea por
 * usuario, cuenta los envíos de las últimas 24 horas y, si caben, apunta este (0293, `reserve_phone_code`).
 * Devuelve si se permite. Cualquier otro error lanza: quien llama RECHAZA, nunca deja pasar.
 *
 * El cupo reservado no se devuelve si Twilio falla después: ante la duda se manda menos (el SMS pudo salir).
 * La función no está en `database.types.ts` hasta que se aplique la 0293 en la base remota y se corra `pnpm db:types`.
 */
export async function reservePhoneCode(
  db: TypedSupabaseClient,
  userId: string,
  phone: string,
  max: number,
): Promise<boolean> {
  const rpc = (db.rpc as unknown as UntypedRpc).bind(db)
  const { data, error } = await rpc('reserve_phone_code', {
    p_user_id: userId,
    p_phone: phone,
    p_max: max,
  })
  if (error) {
    if (error.message.includes('account was deleted')) throw new AccountDeletedError()
    throw new Error('no se pudo reservar el envío del código')
  }
  if (typeof data !== 'boolean') throw new Error('respuesta inesperada de reserve_phone_code')
  return data
}

/** `+51987654321` → `+51*****321`: lo único del número que puede ir a un log. */
export function maskPhone(phone: string): string {
  return phone.length <= 6
    ? '***'
    : `${phone.slice(0, 3)}${'*'.repeat(phone.length - 6)}${phone.slice(-3)}`
}
