'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import type { CatalogUser, PublicBusiness } from '@/features/catalog/types'
import { useActiveOrders } from '@/lib/active-orders'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface UseHomeDataOptions {
  initialBusinesses?: PublicBusiness[] | null
  initialUser?: CatalogUser | null
}

function buildCatalogUser(
  session: { user: { id: string; user_metadata: unknown; email?: string } } | null,
): CatalogUser {
  if (!session) return { signedIn: false, name: '', userId: null }
  const meta = session.user.user_metadata as { full_name?: string } | undefined
  return {
    signedIn: true,
    name: meta?.full_name ?? session.user.email ?? '',
    userId: session.user.id,
  }
}

export function useHomeData(options: UseHomeDataOptions = {}) {
  const [items, setItems] = useState<PublicBusiness[] | null>(options.initialBusinesses ?? null)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<CatalogUser>(
    options.initialUser ?? {
      signedIn: false,
      name: '',
      userId: null,
    },
  )
  /**
   * Los pedidos activos ya no se piden aquí. Los tenía este hook con su propia
   * consulta y su propio canal de Realtime, pero la `BottomNav` del layout —que
   * está montada en esta misma pantalla— pedía exactamente lo mismo para su
   * badge: dos consultas a `orders` por cada visita a la portada. Ahora las dos
   * leen del store compartido, que conserva el Realtime para todos.
   */
  const activeOrders = useActiveOrders()

  useEffect(() => {
    let active = true
    api
      .get<ApiEnvelope<PublicBusiness[]>>('/public/businesses')
      .then((res) => active && setItems(res.data))
      .catch(
        (e) =>
          active &&
          setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar'),
      )

    const supabase = getSupabaseBrowser()
    const applySession = (
      session: { user: { id: string; user_metadata: unknown; email?: string } } | null,
    ) => {
      if (!active) return
      setUser(buildCatalogUser(session))
    }
    supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      applySession(session),
    )
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { items, error, user, activeOrders }
}
