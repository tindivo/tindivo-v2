'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { canalUnico } from '@/lib/realtime'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/** En qué punto del camino está el efectivo de un pedido. */
export type CashState = 'pending' | 'delivering' | 'disputed'

/** Un pedido de la pantalla de efectivo. La unidad de entrega desde 0157. */
export interface CashOrder {
  orderId: string
  shortId: string
  /** Puede faltar: la pantalla cae al `#shortId`. */
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  /** Solo cuando hubo adelanto de vuelto, para poder explicar el importe. */
  breakdown?: { collected: number; advance: number }
  state: CashState
  /** Null mientras no lo haya entregado. */
  settlementId: string | null
}

export interface CashBusinessGroup {
  businessId: string
  businessName: string
  accentColor?: string | null
  pendingTotal: number
  pendingCount: number
  deliveringTotal: number
  deliveringCount: number
  orders: CashOrder[]
}

export function useCashSummary() {
  const [businesses, setBusinesses] = useState<CashBusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ businesses: CashBusinessGroup[] }>>('/driver/cash-settlements')
      .then((r) => {
        setBusinesses(r.data.businesses)
        setError(null)
      })
      .catch((e) => {
        setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /**
   * La confirmación de la cajera llega sola.
   *
   * Antes esta pantalla solo se recargaba al montarse: el motorizado entregaba,
   * la cajera confirmaba delante de él, y su teléfono seguía diciendo
   * "Entregando…" hasta que saliera y volviera a entrar. Con la entrega pedido a
   * pedido eso se nota mucho más —son varias líneas esperando a la vez— y es
   * justo el momento en que los dos están mirando la pantalla.
   *
   * Sin filtro por `driver_id`: la policy `cs_driver_read` ya acota lo que este
   * usuario puede ver, y el canal solo dispara una recarga.
   */
  useEffect(() => {
    const supabase = getSupabaseBrowser()
    // Nombre único POR SUSCRIPCIÓN, no fijo: con `'drv-cash'` a secas, un
    // remontaje dentro de la ventana asíncrona de `removeChannel` recibía el
    // canal anterior todavía conectado y el `.on()` lanzaba
    // «cannot add postgres_changes callbacks ... after subscribe()». Ver
    // `lib/realtime.ts`.
    const channel = supabase
      .channel(canalUnico('drv-cash'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
        load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  return { businesses, loading, error, reload: load }
}
