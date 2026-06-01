import { createApiClient } from '@tindivo/api-client'
import { getSupabaseBrowser } from './supabase/client'

/** Cliente de la API REST de Tindivo. Adjunta el Bearer token de la sesión. */
export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  getAccessToken: async () => {
    const { data } = await getSupabaseBrowser().auth.getSession()
    return data.session?.access_token ?? null
  },
})
