'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { pointInPolygon } from '@/lib/coverage'
import {
  checkPaymentBlock,
  type AppealData,
  type CancelledOrder,
} from '@/lib/payment-block'

type GateType = 'phone' | 'address' | 'pending_payment_resolution'

type OrderReadiness = {
  ready: boolean
  currentGate: GateType | null
  missingSteps: GateType[]
  loading: boolean
  refetch: () => Promise<void>
  blockedOrderShortId: string | null
}

export function useOrderReadiness(): OrderReadiness {
  const [profile, setProfile] = useState<{
    phone: string | null
    phone_verified_at: string | null
  } | null>(null)
  const [hasValidAddress, setHasValidAddress] = useState(false)
  const [isPaymentBlocked, setIsPaymentBlocked] = useState(false)
  const [blockedOrderShortId, setBlockedOrderShortId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = getSupabaseBrowser()

  async function fetchReadiness() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) {
        setProfile(null)
        setHasValidAddress(false)
        setIsPaymentBlocked(false)
        setBlockedOrderShortId(null)
        return
      }

      // 1. Verificar teléfono
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('phone, phone_verified_at')
        .eq('user_id', user.id)
        .maybeSingle()

      setProfile(prof)

      // 2. Verificar dirección en zona
      const { data: addresses } = await supabase
        .from('customer_addresses')
        .select('coordinates_lat, coordinates_lng')
        .eq('user_id', user.id)

      if (addresses && addresses.length > 0) {
        const { getCoveragePolygon } = await import('@/lib/coverage')
        const polygon = await getCoveragePolygon()

        if (polygon) {
          const anyInZone = addresses.some(
            (addr) =>
              addr.coordinates_lat != null &&
              addr.coordinates_lng != null &&
              pointInPolygon(
                {
                  lat: Number(addr.coordinates_lat),
                  lng: Number(addr.coordinates_lng),
                },
                polygon.polygon,
              ),
          )
          setHasValidAddress(anyInZone)
        } else {
          setHasValidAddress(true)
        }
      } else {
        setHasValidAddress(false)
      }

      // 3. Verificar pedidos con proof_rejected_final sin resolver
      const { data: cancelledOrders } = await supabase
        .from('orders')
        .select('id, short_id, cancelled_at')
        .eq('customer_user_id', user.id)
        .eq('status', 'cancelled')
        .eq('cancel_reason', 'proof_rejected_final')

      // Precargar todas las apelaciones en una sola query
      const orderIds = (cancelledOrders ?? []).map((o) => o.id)
      let appealsMap: Record<string, AppealData> = {}

      if (orderIds.length > 0) {
        const { data: appeals } = await supabase
          .from('reports')
          .select('order_id, appeal_status, refund_status')
          .in('order_id', orderIds)
          .eq('type', 'rejected_proof_disputed')

        if (appeals) {
          for (const a of appeals) {
            if (a.order_id) appealsMap[a.order_id] = a
          }
        }
      }

      const blockResult = checkPaymentBlock(
        (cancelledOrders ?? []) as CancelledOrder[],
        (orderId) => appealsMap[orderId] ?? null,
      )

      setIsPaymentBlocked(blockResult.blocked)
      setBlockedOrderShortId(blockResult.blockedOrderShortId)
    } catch (err) {
      console.error('[useOrderReadiness] Error fetching readiness:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReadiness()
  }, [])

  const missingSteps: GateType[] = []

  if (!profile?.phone_verified_at) {
    missingSteps.push('phone')
  }

  if (!hasValidAddress) {
    missingSteps.push('address')
  }

  if (isPaymentBlocked) {
    missingSteps.push('pending_payment_resolution')
  }

  return {
    ready: !loading && missingSteps.length === 0,
    currentGate: missingSteps[0] ?? null,
    missingSteps,
    loading,
    refetch: fetchReadiness,
    blockedOrderShortId,
  }
}
