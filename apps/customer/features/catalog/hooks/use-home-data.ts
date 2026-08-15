'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { ACTIVE_ORDER_STATUSES } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import type { ActiveOrder, CatalogUser, PublicBusiness } from '@/features/catalog/types'
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
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])

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

  useEffect(() => {
    const uid = user.userId
    if (!uid) {
      setActiveOrders([])
      return
    }
    let active = true
    const supabase = getSupabaseBrowser()
    const loadActive = () => {
      supabase
        .from('orders')
        .select('short_id,status,business_id,created_at')
        .in('status', [...ACTIVE_ORDER_STATUSES])
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!active) return
          setActiveOrders(
            (data ?? []).map((o) => ({
              shortId: o.short_id,
              status: o.status,
              businessId: o.business_id,
              createdAt: o.created_at,
            })),
          )
        })
    }
    loadActive()
    const channel = supabase
      .channel(`home-orders-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_user_id=eq.${uid}` },
        () => loadActive(),
      )
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user.userId])

  return { items, error, user, activeOrders }
}
