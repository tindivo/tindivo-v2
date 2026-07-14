'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { pointInPolygon } from '@/lib/coverage'

type GateType = 'phone' | 'address'

type OrderReadiness = {
  ready: boolean
  currentGate: GateType | null
  missingSteps: GateType[]
  loading: boolean
  refetch: () => Promise<void>
}

export function useOrderReadiness(): OrderReadiness {
  const [profile, setProfile] = useState<{
    phone: string | null
    phone_verified_at: string | null
  } | null>(null)
  const [hasValidAddress, setHasValidAddress] = useState(false)
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

  return {
    ready: !loading && missingSteps.length === 0,
    currentGate: missingSteps[0] ?? null,
    missingSteps,
    loading,
    refetch: fetchReadiness,
  }
}
