import { ApiError, createApiClient } from '@tindivo/api-client'
import { getSupabaseBrowser } from './supabase/client'

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  getAccessToken: async () => {
    const { data } = await getSupabaseBrowser().auth.getSession()
    return data.session?.access_token ?? null
  },
})

/** Extrae el mensaje legible de un error de API (o un genérico). */
export function errMsg(e: unknown): string {
  return e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error'
}
