import { createServerClient } from '@supabase/ssr'
import type { Database } from '@tindivo/supabase'
import { cookies } from 'next/headers'

export interface ServerUser {
  id: string
  email?: string
  fullName?: string
}

/**
 * Lee la sesión actual desde las cookies en un Server Component / Server Action.
 * Devuelve null si no hay sesión o si ocurre un error.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {
        // Los Server Components no pueden modificar cookies.
      },
    },
    auth: { storageKey: 'tindivo-customer-auth' },
  })

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    const meta = data.user.user_metadata as { full_name?: string } | undefined
    return {
      id: data.user.id,
      email: data.user.email,
      fullName: meta?.full_name,
    }
  } catch {
    return null
  }
}
