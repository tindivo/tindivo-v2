'use client'

import type { PaymentQrView, PaymentWallet } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface DriverBusiness {
  id: string
  name: string
  phone: string | null
  address: string | null
  accentColor: string | null
  coordinates: {
    lat: number | null
    lng: number | null
  }
  paymentQrs: PaymentQrView[]
}

interface QrRow {
  business_id: string
  slot: number
  wallet: string
  account_number: string
  account_name: string
  qr_url: string | null
}

export function useDriverBusinesses() {
  const [businesses, setBusinesses] = useState<DriverBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const supabase = getSupabaseBrowser()

        // 1. Obtener locales asignados al motorizado
        const { data: rawBiz, error: bizErr } = await supabase.rpc('driver_businesses')
        if (bizErr) throw new Error(bizErr.message)
        if (!active) return

        const bizList = rawBiz ?? []
        if (bizList.length === 0) {
          setBusinesses([])
          setLoading(false)
          return
        }

        const bizIds = bizList.map((b) => b.id)

        // 2. Obtener QRs de los locales asignados
        const { data: rawQrs, error: qrErr } = await supabase
          .from('business_payment_qrs')
          .select('business_id, slot, wallet, account_number, account_name, qr_url')
          .in('business_id', bizIds)

        if (qrErr) {
          console.warn('[useDriverBusinesses] no se pudieron cargar QRs:', qrErr.message)
        }

        const qrRows = (rawQrs ?? []) as unknown as QrRow[]

        // Mapear QRs por business_id
        const qrsByBiz = new Map<string, PaymentQrView[]>()
        for (const r of qrRows) {
          const views = qrsByBiz.get(r.business_id) ?? []
          views.push({
            slot: r.slot,
            wallet: r.wallet as PaymentWallet,
            accountNumber: r.account_number,
            accountName: r.account_name,
            qrUrl: r.qr_url,
            isDefault: r.slot === 1,
          })
          qrsByBiz.set(r.business_id, views)
        }

        // Ordenar QRs por slot (slot 1 primero)
        for (const views of qrsByBiz.values()) {
          views.sort((a, b) => a.slot - b.slot)
          const first = views[0]
          if (first && !views.some((v) => v.isDefault)) {
            first.isDefault = true
          }
        }

        const combined: DriverBusiness[] = bizList.map((b) => ({
          id: b.id,
          name: b.name,
          phone: b.phone,
          address: b.address,
          accentColor: b.accent_color,
          coordinates: {
            lat: b.coordinates_lat ? Number(b.coordinates_lat) : null,
            lng: b.coordinates_lng ? Number(b.coordinates_lng) : null,
          },
          paymentQrs: qrsByBiz.get(b.id) ?? [],
        }))

        if (active) {
          setBusinesses(combined)
          setLoading(false)
        }
      } catch (err) {
        if (!active) return
        console.error('[useDriverBusinesses] error al cargar restaurantes:', err)
        setError(err instanceof Error ? err.message : 'Error al cargar restaurantes')
        setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [])

  return { businesses, loading, error }
}
