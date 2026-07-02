'use client'

import type { ScheduleDayRow } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Modo de pedido del negocio, derivado de sus capacidades:
 * - 'whatsapp': solo catálogo (sin pedidos web) → CTAs de WhatsApp/llamada.
 * - 'delivery': acepta pedidos web → checkout normal.
 */
export interface BusinessOrderingInfo {
  mode: 'delivery' | 'whatsapp'
  whatsappNumber: string | null
  /** Horario semanal; vacío = sin horario configurado (siempre abierto). */
  schedule: ScheduleDayRow[]
}

interface DetailEnvelope {
  data: {
    business: {
      accepts_web_pickup?: boolean
      accepts_web_delivery?: boolean
      whatsapp_number?: string | null
    }
    schedule?: ScheduleDayRow[]
  }
}

// Cache con TTL corto: evita re-fetch al abrir la bolsa varias veces, pero un
// cambio de modo hecho por el admin se refleja sin recargar la página.
// Nunca se snapshotea en localStorage (el carrito persistido podría quedar stale).
const TTL_MS = 60_000
const cache = new Map<string, { info: BusinessOrderingInfo; at: number }>()
const inflight = new Map<string, Promise<BusinessOrderingInfo | null>>()

async function fetchInfo(businessId: string): Promise<BusinessOrderingInfo | null> {
  try {
    const res = await api.get<DetailEnvelope>(`/public/businesses/${businessId}`)
    const b = res.data.business
    const info: BusinessOrderingInfo = {
      mode: !b.accepts_web_delivery && !b.accepts_web_pickup ? 'whatsapp' : 'delivery',
      whatsappNumber: b.whatsapp_number ?? null,
      schedule: res.data.schedule ?? [],
    }
    cache.set(businessId, { info, at: Date.now() })
    return info
  } catch {
    // Sin dato (red/404): la UI cae al CTA de checkout; el guard 409 del API
    // es la red de seguridad si el negocio realmente no acepta pedidos web.
    return null
  }
}

/** Resuelve el modo de pedido de un negocio con fetch fresco (cache 60s). */
export function useBusinessOrdering(businessId: string | null): {
  loading: boolean
  info: BusinessOrderingInfo | null
} {
  const fresh = businessId ? cache.get(businessId) : undefined
  const cached = fresh && Date.now() - fresh.at < TTL_MS ? fresh.info : null
  const [info, setInfo] = useState<BusinessOrderingInfo | null>(cached)
  const [loading, setLoading] = useState(businessId != null && !cached)

  useEffect(() => {
    if (!businessId) {
      setInfo(null)
      setLoading(false)
      return
    }
    const hit = cache.get(businessId)
    if (hit && Date.now() - hit.at < TTL_MS) {
      setInfo(hit.info)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    let p = inflight.get(businessId)
    if (!p) {
      p = fetchInfo(businessId).finally(() => inflight.delete(businessId))
      inflight.set(businessId, p)
    }
    p.then((next) => {
      if (cancelled) return
      setInfo(next)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [businessId])

  return { loading, info }
}
