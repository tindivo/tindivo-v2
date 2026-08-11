'use client'

import { EmptyState, SkeletonList } from '@tindivo/ui'
import { useMemo } from 'react'
import { useTeam } from '@/hooks/use-team'
import type { BoardOrder } from '@/lib/types'
import { OrderCard } from './order-card'

/**
 * Orden por estado: arriba donde PUEDES actuar.
 *
 * Estás parado en el local esperando la comida → eso es lo accionable. Después
 * lo que va de camino al local, y al final lo que ya rueda con la comida
 * encima. Antes no había orden ninguno: la lista salía como viniera del board
 * (`created_at desc`), así que con tres pedidos el que te tenía esperando en la
 * puerta podía quedar el último.
 */
const STATUS_RANK: Record<string, number> = {
  waiting_at_restaurant: 0,
  heading_to_restaurant: 1,
  picked_up: 2,
}

/** Mis pedidos activos (HU-D-037). */
export function MineTab({
  mine,
  loading,
  now,
}: {
  mine: BoardOrder[]
  /** Primera carga sin resolver: no se sabe si está vacío. */
  loading: boolean
  now: number
}) {
  // Del store compartido de T1: no cuesta una petición extra.
  const { receivedRequests } = useTeam()

  // Cruce en cliente por `orderId`. El endpoint ya devuelve ese campo, así que
  // no hace falta tocar la API para saber cuál de MIS pedidos te están pidiendo.
  const requestByOrder = useMemo(() => {
    const map = new Map<string, (typeof receivedRequests)[number]>()
    for (const r of receivedRequests) map.set(r.orderId, r)
    return map
  }, [receivedRequests])

  const sorted = useMemo(() => {
    return [...mine].sort((a, b) => {
      // Un pedido con solicitud entrante va POR ENCIMA del rango de estado: es
      // el único con un reloj que te lo quita si no contestas. Cuando la
      // solicitud se resuelve o caduca, `receivedRequests` cambia y la tarjeta
      // vuelve sola a su sitio — sin recargar nada.
      const ra = requestByOrder.has(a.id) ? 0 : 1
      const rb = requestByOrder.has(b.id) ? 0 : 1
      if (ra !== rb) return ra - rb

      const sa = STATUS_RANK[a.status] ?? 99
      const sb = STATUS_RANK[b.status] ?? 99
      if (sa !== sb) return sa - sb

      return Date.parse(a.created_at) - Date.parse(b.created_at)
    })
  }, [mine, requestByOrder])

  // Mismo criterio que en "En espera": "No tienes pedidos activos" es una
  // afirmación, y no se hace hasta saberla cierta.
  if (loading) return <SkeletonList count={2} />

  return (
    <div>
      <div className="flex flex-col gap-3">
        {sorted.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            now={now}
            variant="mine"
            incomingRequest={requestByOrder.get(o.id) ?? null}
          />
        ))}
      </div>

      {mine.length === 0 && (
        <EmptyState
          icon="local_shipping"
          heading="No tienes pedidos activos"
          description="Toma uno de la bandeja Disponibles para empezar a repartir."
        />
      )}
    </div>
  )
}
