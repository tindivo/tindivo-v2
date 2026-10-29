import { PhoneTransferSchema } from '@tindivo/contracts'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { z } from 'zod'

const ClaimResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.enum([
      'verified',
      'transferred',
      'profile_missing',
      'wait_active',
      'challenge_invalid',
      'conflict',
    ]),
  }),
  PhoneTransferSchema.extend({ status: z.literal('transfer_required') }),
])
export type PhoneClaimResult = z.infer<typeof ClaimResultSchema>

/** Solo después del SMS aprobado. La transacción de Postgres decide la asignación. */
export async function claimCustomerPhone(
  db: TypedSupabaseClient,
  userId: string,
  phone: string,
  challengeId?: string,
): Promise<PhoneClaimResult> {
  const { data, error } = await db.rpc('claim_customer_phone', {
    p_user_id: userId,
    p_phone: phone,
    ...(challengeId === undefined ? {} : { p_challenge_id: challengeId }),
  })
  // La unicidad queda como red de seguridad, sin exponer datos de otra cuenta.
  if (error?.code === '23505') return { status: 'conflict' }
  if (error) throw new Error(error.message)
  return ClaimResultSchema.parse(data)
}

/** El número sale del desafío propio: el cliente nunca elige otro al confirmar. */
export async function transferCustomerPhone(
  db: TypedSupabaseClient,
  userId: string,
  challengeId: string,
) {
  const { data, error } = await db
    .from('phone_transfer_challenges')
    .select('phone')
    .eq('id', challengeId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { phone: null, result: { status: 'challenge_invalid' } as PhoneClaimResult }
  return {
    phone: data.phone,
    result: await claimCustomerPhone(db, userId, data.phone, challengeId),
  }
}

export async function listCustomerSecurityNotices(db: TypedSupabaseClient, userId: string) {
  const { data, error } = await db
    .from('customer_security_notices')
    .select('id,kind,phone_last3,created_at')
    .eq('user_id', userId)
    .is('seen_at', null)
    .order('created_at', { ascending: false })
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []).map((notice) => ({
    id: notice.id,
    kind: notice.kind,
    phoneLast3: notice.phone_last3,
    createdAt: notice.created_at,
  }))
}

export async function seeCustomerSecurityNotice(
  db: TypedSupabaseClient,
  userId: string,
  id: string,
  now: string,
) {
  const { error } = await db
    .from('customer_security_notices')
    .update({ seen_at: now })
    .eq('id', id)
    .eq('user_id', userId)
    .is('seen_at', null)
  if (error) throw new Error(error.message)
}
