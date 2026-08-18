'use client'

import { createTindivoBrowserClient } from '@tindivo/supabase/client'

let client: ReturnType<typeof createTindivoBrowserClient> | null = null

/** Cliente Supabase del browser (sesión del panel del negocio). Singleton. */
export function getSupabaseBrowser() {
  // La clave aísla la sesión de negocios de las otras apps: en local solo
  // cambia el puerto, que para las cookies es el mismo dominio.
  if (!client)
    client = createTindivoBrowserClient({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      storageKey: 'tindivo-negocios-auth',
    })
  return client
}
