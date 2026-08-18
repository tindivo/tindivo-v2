'use client'

import { createTindivoBrowserClient } from '@tindivo/supabase/client'

let client: ReturnType<typeof createTindivoBrowserClient> | null = null

/** Cliente Supabase del browser (sesión del motorizado). Singleton. */
export function getSupabaseBrowser() {
  // La clave aísla la sesión del motorizado de las otras apps: en local solo
  // cambia el puerto, que para las cookies es el mismo dominio. El e2e la
  // comprueba por nombre (`motorizados.setup.ts`), así que no se renombra sola.
  if (!client)
    client = createTindivoBrowserClient({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      storageKey: 'tindivo-driver-auth',
    })
  return client
}
