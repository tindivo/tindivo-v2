import { createServiceRoleClient } from '@tindivo/supabase'
import { serverEnv } from '../env'

/**
 * Cliente service-role (BYPASSA RLS). Único camino para mutaciones financieras /
 * de estado de pedido. Server-side exclusivamente.
 */
export function createServiceClient() {
  const env = serverEnv()
  return createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}
