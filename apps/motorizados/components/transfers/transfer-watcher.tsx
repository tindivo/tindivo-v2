'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, cn } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { useNow } from '@/hooks/use-now'
import { api } from '@/lib/api'
import { soles } from '@/lib/format'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { TeamResponse, TransferRequestRow } from '@/lib/types'

interface IncomingBanner {
  id: string
  shortId: string | null
  total: number | null
  requesterName: string
  expiresAt: string | null
}

/**
 * Banner sticky de solicitud de traspaso entrante (HU-D-035/036): countdown
 * 30→0 con timeout-as-accept (lo resuelve el backend; aquí solo se refleja).
 * Realtime sobre order_transfer_requests + fetch del detalle vía /driver/team.
 */
export function TransferWatcher() {
  const [banner, setBanner] = useState<IncomingBanner | null>(null)
  const now = useNow()

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: TeamResponse }>('/driver/team')
      const incoming = data.receivedRequests[0] ?? null
      setBanner(
        incoming
          ? {
              id: incoming.id,
              shortId: incoming.shortId,
              total: incoming.total,
              requesterName: incoming.requesterName,
              expiresAt: incoming.expiresAt,
            }
          : null,
      )
      window.dispatchEvent(new CustomEvent('tindivo:transfer'))
    } catch {
      // Sin sesión de driver todavía o sin red: no romper la app.
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let mounted = true

    // Solo si hay sesión (la página de login también monta el layout).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted || !data.session) return
      void refresh()
    })

    const channel = supabase
      .channel('drv-transfers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_transfer_requests' },
        (payload) => {
          const row = payload.new as TransferRequestRow | null
          if (row?.status === 'pending' && 'vibrate' in navigator) {
            navigator.vibrate?.([200, 100, 200])
          }
          void refresh()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [refresh])

  if (!banner) return null

  const remaining = banner.expiresAt
    ? Math.max(0, Math.round((Date.parse(banner.expiresAt) - now) / 1000))
    : 0
  const danger = remaining <= 10
  const pct = Math.min(100, (remaining / 60) * 100)

  async function respond(accept: boolean) {
    if (!banner) return
    try {
      await api.post(`/driver/transfers/${banner.id}/respond`, { accept })
    } catch (err) {
      // Resuelta/expirada justo antes: el refresh la quitará.
      if (!(err instanceof ApiError)) return
    }
    void refresh()
  }

  return (
    <div className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-[85] mx-auto max-w-[480px] p-3">
      <Card className="rounded-[22px] bg-ink p-4 text-white shadow-elev-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-light">
            Solicitud de traspaso
          </span>
          <span
            className={cn(
              'font-mono text-[22px] font-bold tabular-nums',
              danger ? 'text-danger' : 'text-warning',
            )}
          >
            {`0:${String(remaining).padStart(2, '0')}`}
          </span>
        </div>
        <p className="mt-1 text-[14px]">
          {banner.requesterName} te pide el pedido
          {banner.shortId ? ` #${banner.shortId}` : ''}
          {banner.total != null ? ` · ${soles(banner.total)}` : ''}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-white/10">
          <div
            className={cn(
              'h-1.5 rounded-full transition-[width] duration-1000 ease-linear',
              danger ? 'bg-danger' : 'bg-brand',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {remaining > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button className="w-full" onClick={() => respond(true)}>
              Aceptar
            </Button>
            <Button
              variant="ghost"
              className="w-full bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={() => respond(false)}
            >
              Rechazar
            </Button>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-2 font-semibold text-[14px] text-warning">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-warning border-t-transparent" />
            Solicitud caducada
          </p>
        )}
      </Card>
    </div>
  )
}
