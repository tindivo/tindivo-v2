'use client'

import { Badge, Button, Card, EmptyState, Icon } from '@tindivo/ui'
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

  if (!team) return <div className="h-32 animate-pulse rounded-2xl bg-surface-low" />

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
          <Card key={r.id} className="mb-3 border-brand/15 bg-brand-light p-4 shadow-none">
            <span className="text-[13px] text-ink">
              Solicitud enviada{r.shortId ? ` · #${r.shortId}` : ''} ·{' '}
            </span>
            <span className="font-mono text-[14px] font-bold tabular-nums text-brand-dark">
              {mmss(remaining)}
            </span>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              Si no responde, la solicitud caducará.
            </p>
          </Card>
        )
      })}

      {[...byDriver.entries()].map(([driverId, group]) => (
        <div key={driverId} className="mb-4">
          <p className="flex items-center gap-2 font-semibold text-[15px]">
            <Icon name="person" size={20} />
            {group.name}
            <Badge variant="default" size="sm">
              {group.orders.length} {group.orders.length === 1 ? 'activo' : 'activos'}
            </Badge>
          </p>
          <div className="mt-2 flex flex-col gap-2.5">
            {group.orders.map((o) => (
              <Card key={o.orderId} className="p-4 shadow-elev-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-semibold text-ink">#{o.shortId}</span>
                  <SourceChip source={o.source} />
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {o.businessName ?? 'Restaurante'} · {STATUS_LABEL[o.status] ?? o.status}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-display text-[16px] font-bold tracking-tight tabular-nums">
                    {soles(o.total)}
                  </span>
                  {o.transferable ? (
                    <Button
                      variant="secondary"
                      size="sm"
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
                    </Button>
                  ) : (
                    <span className="text-[12px] text-ink-subtle">Ya en reparto</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {team.teamOrders.length === 0 && (
        <EmptyState
          icon="person"
          heading="Tu equipo no tiene pedidos"
          description="Cuando un compañero tenga una entrega activa aparecerá aquí."
        />
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
