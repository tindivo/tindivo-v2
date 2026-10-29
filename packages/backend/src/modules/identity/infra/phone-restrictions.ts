import type { TypedSupabaseClient } from '@tindivo/supabase'
import { z } from 'zod'

const LiftResultSchema = z.object({ status: z.enum(['lifted', 'already_lifted', 'not_found']) })
export type LiftPhoneRestrictionResult = z.infer<typeof LiftResultSchema>['status']

/** Las vigentes: sin levantar y sin plazo vencido. Las más nuevas primero. */
export async function listOpenPhoneRestrictions(
  db: TypedSupabaseClient,
  now: string,
  phone?: string,
) {
  let query = db
    .from('phone_restrictions')
    .select('id,phone,kind,until,source,created_at')
    .is('lifted_at', null)
    .or(`until.is.null,until.gt.${now}`)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(200)
  if (phone !== undefined) query = query.eq('phone', phone)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id,
    phone: r.phone,
    kind: r.kind,
    until: r.until,
    source: r.source,
    createdAt: r.created_at,
  }))
}

export async function liftPhoneRestriction(
  db: TypedSupabaseClient,
  restrictionId: string,
  adminUserId: string,
  reason: string,
): Promise<LiftPhoneRestrictionResult> {
  const { data, error } = await db.rpc('lift_phone_restriction', {
    p_restriction_id: restrictionId,
    p_admin_user_id: adminUserId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return LiftResultSchema.parse(data).status
}
