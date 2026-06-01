'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@tindivo/supabase'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseBrowser() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY')
    client = createBrowserClient<Database>(url, key)
  }
  return client
}
