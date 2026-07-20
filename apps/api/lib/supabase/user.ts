import { createClient } from '@supabase/supabase-js'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { serverEnv } from '../env'

/**
 * Crea un cliente Supabase en el contexto de la sesión JWT del usuario cliente.
 * Preserva auth.uid() en PostgreSQL para RPCs RLS/SECURITY DEFINER sin persistencia ni refresco de sesión en servidor.
 */
export function createUserClient(token: string): TypedSupabaseClient {
  const env = serverEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as TypedSupabaseClient
}
