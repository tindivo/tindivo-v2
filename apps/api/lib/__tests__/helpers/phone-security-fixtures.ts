import type { TypedSupabaseClient } from '@tindivo/supabase'

/** Solo fixtures locales: la retención real de 0259 se mantiene intacta. */
export async function cleanupPhoneSecurityFixtures(db: TypedSupabaseClient, userIds: string[]) {
  if (!userIds.length) return
  const { data: notices } = await db
    .from('customer_security_notices')
    .select('id')
    .in('user_id', userIds)
    .throwOnError()
  for (const notice of notices ?? [])
    await db.from('domain_events').delete().eq('aggregate_id', notice.id).throwOnError()
  await db.from('customer_security_notices').delete().in('user_id', userIds).throwOnError()
  await db.from('phone_transfer_challenges').delete().in('user_id', userIds).throwOnError()
  await db.from('phone_restrictions').delete().in('source_user_id', userIds).throwOnError()
  await db.from('phone_assignments').delete().in('user_id', userIds).throwOnError()
}
