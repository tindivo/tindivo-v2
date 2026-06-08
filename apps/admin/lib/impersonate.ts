import type { ApiEnvelope } from '@tindivo/api-client'
import { api } from './api'
import { getSupabaseBrowser } from './supabase/client'

/** Resuelve el user_id del negocio/motorizado y abre su magic-link en otra pestaña. */
export function openImpersonation(userKind: 'businesses' | 'drivers', id: string) {
  return async () => {
    const { data } = await getSupabaseBrowser()
      .from(userKind)
      .select('user_id')
      .eq('id', id)
      .maybeSingle()
    if (!data?.user_id) return
    try {
      const r = await api.post<ApiEnvelope<{ actionLink: string }>>(
        `/admin/impersonate/${data.user_id}`,
        {},
      )
      window.open(r.data.actionLink, '_blank', 'noopener')
    } catch {
      // silencioso: el admin reintenta
    }
  }
}
