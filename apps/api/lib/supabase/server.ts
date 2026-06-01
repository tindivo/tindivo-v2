import { createServerClient } from '@supabase/ssr'
import type { TypedSupabaseClient } from '@tindivo/supabase'
import { cookies } from 'next/headers'
import { serverEnv } from '../env'

/**
 * Cliente Supabase con la sesión del usuario (cookies). Respeta RLS como el
 * usuario autenticado. Úsalo para lecturas scoped al usuario; las mutaciones
 * sensibles van por el service client.
 */
export async function createServerSupabase(): Promise<TypedSupabaseClient> {
  const env = serverEnv()
  const cookieStore = await cookies()
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll falla en contextos de solo-lectura (Server Components); seguro ignorar.
        }
      },
    },
  }) as TypedSupabaseClient
}
