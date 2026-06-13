'use client'

import { Icon } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { SourceChip } from '@/components/source-chip'
import {
  RequestTransferSheet,
  type TransferTarget,
} from '@/components/transfers/request-transfer-sheet'
import { useNow } from '@/hooks/use-now'
import { api } from '@/lib/api'
import { mmss, soles } from '@/lib/format'
import type { TeamResponse } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  heading_to_restaurant: 'Voy al local',
  waiting_at_restaurant: 'En el local',
  picked_up: 'En reparto',
}

/** Equipo: pedidos de los compañeros + solicitar traspaso (HU-D-033/034). */
export function TeamTab({ onCount }: { onCount: (n: number) => void }) {
  const [team, setTeam] = useState<TeamResponse | null>(null)
  const [target, setTarget] = useState<TransferTarget | null>(null)
  const now = useNow()

  const load = useCallback(() => {
    api
      .get<{ data: TeamResponse }>('/driver/team')
      .then((r) => {
        setTeam(r.data)
        onCount(r.data.receivedRequests.length)
      })
      .catch(() => {})
  }, [onCount])

  useEffect(() => {
    load()
    const onTransfer = () => load()
    window.addEventListener('tindivo:transfer', onTransfer)
    const t = setInterval(load, 15_000)
    return () => {
      window.removeEventListener('tindivo:transfer', onTransfer)
      clearInterval(t)
    }
  }, [load])

  if (!team) return <div className="h-32 animate-pulse rounded-[22px] bg-white" />

  // Agrupar por compañero.
  const byDriver = new Map<string, { name: string; orders: TeamResponse['teamOrders'] }>()
  for (const o of team.teamOrders) {
    const key = o.driver?.id ?? 'unknown'
    const entry = byDriver.get(key) ?? { name: o.driver?.fullName ?? 'Compañero', orders: [] }
    entry.orders.push(o)
    byDriver.set(key, entry)
  }

  return (
    <div>
      {team.sentRequests.map((r) => {
        const remaining = r.expiresAt ? Math.round((Date.parse(r.expiresAt) - now) / 1000) : 0
        return (
          <div
            key={r.id}
            className="mb-3 rounded-[18px] border px-4 py-3"
            style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.2)' }}
          >
            <span className="text-[13px]">
              Solicitud enviada{r.shortId ? ` · #${r.shortId}` : ''} ·{' '}
            </span>
            <span
              className="font-bold font-mono text-[14px] tabular-nums"
              style={{ color: '#C2410C' }}
            >
              {mmss(remaining)}
            </span>
            <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Si no responde, el pedido pasará a ti.
            </p>
          </div>
        )
      })}

      {[...byDriver.entries()].map(([driverId, group]) => (
        <div key={driverId} className="mb-4">
          <p className="flex items-center gap-2 font-semibold text-[15px]">
            <Icon.Person /> {group.name}
            <span className="t-muted font-normal text-[12px]">
              {group.orders.length} {group.orders.length === 1 ? 'activo' : 'activos'}
            </span>
          </p>
          <div className="mt-2 flex flex-col gap-2.5">
            {group.orders.map((o) => (
              <div key={o.orderId} className="t-card">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-[12px]">#{o.shortId}</span>
                  <SourceChip source={o.source} />
                </div>
                <p className="mt-1 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                  {o.businessName ?? 'Restaurante'} · {STATUS_LABEL[o.status] ?? o.status}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="t-display text-[16px] tabular-nums">{soles(o.total)}</span>
                  {o.transferable ? (
                    <button
                      type="button"
                      className="rounded-[14px] px-4 py-2.5 font-semibold text-[14px]"
                      style={{ background: 'rgba(26,22,20,0.06)' }}
                      onClick={() =>
                        setTarget({
                          orderId: o.orderId,
                          shortId: o.shortId,
                          businessName: o.businessName,
                          total: o.total,
                          driverName: group.name,
                        })
                      }
                    >
                      Solicitar pedido
                    </button>
                  ) : (
                    <span className="text-[12px] text-ink-subtle">Ya en reparto</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {team.teamOrders.length === 0 && (
        <div className="py-14 text-center">
          <span className="inline-block text-ink-subtle">
            <Icon.Person style={{ width: 28, height: 28 }} />
          </span>
          <p className="t-muted mt-2 text-[14px]">Tu equipo no tiene pedidos activos.</p>
        </div>
      )}

      {target && (
        <RequestTransferSheet
          target={target}
          onClose={() => setTarget(null)}
          onSent={() => {
            setTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}
