'use client'

import { ACTIVE_ORDER_STATUSES } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import type { ActiveOrder } from '@/features/catalog/types'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export function useActiveOrders() {
  const [orders, setOrders] = useState<ActiveOrder[]>([])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let active = true

    const load = () => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session || !active) return
        supabase
          .from('orders')
          .select('short_id,status,business_id,created_at')
          .in('status', [...ACTIVE_ORDER_STATUSES])
          .eq('customer_user_id', data.session.user.id)
          .order('created_at', { ascending: false })
          .then(({ data: rows }) => {
            if (!active) return
            setOrders(
              (rows ?? []).map((o) => ({
                shortId: o.short_id,
                status: o.status,
                businessId: o.business_id,
                createdAt: o.created_at,
              })),
            )
          })
      })
    }

    load()
    return () => {
      active = false
    }
  }, [])

  return orders
}
