import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** Cliente Supabase tipado con el esquema de la base de datos. */
export type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Cliente con la SERVICE ROLE key — BYPASSA RLS. Úsalo SOLO en server-side
 * (apps/api, Edge Functions, jobs). NUNCA lo expongas al browser: una fuga de
 * esta key anula toda la RLS. Sin persistencia de sesión (es stateless).
 */
export function createServiceRoleClient(url: string, serviceRoleKey: string): TypedSupabaseClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
