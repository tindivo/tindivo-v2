'use client'

import type { DriverCourierOrderView } from '@tindivo/contracts'
import { EmptyState, SkeletonList } from '@tindivo/ui'
import { useCallback, useMemo, useState } from 'react'
import { useTeam } from '@/hooks/use-team'
import { quickPosition } from '@/lib/geo'
import { advanceOrder } from '@/lib/orders/advance'
import { fetchOrderDetail } from '@/lib/orders/detail-cache'
import { minePhase, prematureMinutes } from '@/lib/orders/phase'
import { interleaveByTime } from '@/lib/orders/sort'
import type { BoardOrder } from '@/lib/types'
import { CourierMineItem } from './courier-section'
import { type MineSheetIntent, MineSheets, type MineSheetTarget } from './mine-sheets'
import { OrderCard } from './order-card'
import { type LeftAction, type RightAction, SwipeCard } from './swipe-card'

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
  onChanged,
  courier,
  onCourierChanged,
}: {
  mine: BoardOrder[]
  /** Primera carga sin resolver: no se sabe si está vacío. */
  loading: boolean
  now: number
  /** Refresca el board tras una transición hecha desde una hoja. */
  onChanged: () => Promise<void>
  /** Mis entregas: en la MISMA lista, intercaladas por cuándo se pidieron. */
  courier: DriverCourierOrderView[]
  onCourierChanged: () => Promise<void> | void
}) {
  /** La hoja abierta sobre la bandeja (cobro, soltar, recogida adelantada). */
  const [sheetTarget, setSheetTarget] = useState<MineSheetTarget | null>(null)
  const closeSheet = useCallback(() => setSheetTarget(null), [])
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

  const rows = useMemo(
    () =>
      interleaveByTime(
        sorted,
        (o) => o.created_at,
        courier,
        (c) => c.createdAt,
      ),
    [sorted, courier],
  )

  /** Abre la hoja sobre la bandeja: el cobro, el motivo de soltar… */
  function openSheet(orderId: string, intent: MineSheetIntent) {
    setSheetTarget({ orderId, intent })
  }

  /**
   * QUÉ HACE EL GESTO EN CADA PASO. Los cuatro pasos, en el orden del viaje:
   *
   *   Voy al local  → «Llegué al local»     (`arrived`)
   *   En el local   → «Ya recogí»           (`pickup`)
   *   En reparto    → «Llegué a la puerta»  (`arrived_customer`)
   *   En la puerta  → «Cobrar»              (abre el cobro: `delivered` es
   *                                          terminal, no se cierra de un roce)
   *
   * Y a la izquierda, «Soltar», solo hasta recoger.
   */
  function actionsFor(o: BoardOrder): { right?: RightAction; left?: LeftAction } {
    const phase = minePhase(o)
    if (phase === null) return {}
    const stamp = () => new Date().toISOString()

    const left: LeftAction | undefined =
      phase === 'heading' || phase === 'waiting'
        ? {
            verb: 'Soltar pedido',
            icon: 'block',
            tone: 'danger',
            onCommit: () => openSheet(o.id, 'soltar'),
          }
        : undefined

    if (phase === 'heading') {
      return {
        left,
        right: {
          mode: 'optimistic',
          verb: 'Llegué al local',
          icon: 'store',
          tone: 'sky',
          commit: () =>
            advanceOrder(o.id, 'arrived', {
              status: 'waiting_at_restaurant',
              waiting_at_restaurant_at: stamp(),
            }),
        },
      }
    }

    if (phase === 'waiting') {
      // Recoger ANTES de tiempo y sin que la cocina lo haya marcado listo es el
      // único caso en que se pregunta: es cuando uno se lleva un pedido ajeno.
      if (prematureMinutes(o, now) > 0) {
        return {
          left,
          right: {
            mode: 'open',
            verb: 'Ya recogí',
            icon: 'shopping_bag',
            tone: 'orange',
            commit: () => openSheet(o.id, 'recoger'),
          },
        }
      }
      return {
        left,
        right: {
          mode: 'optimistic',
          verb: 'Ya recogí',
          icon: 'shopping_bag',
          tone: 'orange',
          commit: () =>
            advanceOrder(
              o.id,
              'pickup',
              { status: 'picked_up', picked_up_at: stamp() },
              { slots: 1 },
            ),
        },
      }
    }

    if (phase === 'carrying') {
      return {
        right: {
          mode: 'optimistic',
          verb: 'Llegué a la puerta',
          icon: 'location_on',
          tone: 'violet',
          // El fix se pide DESPUÉS de pintar el paso: la espera del GPS ya no
          // queda delante del dedo.
          commit: () =>
            advanceOrder(
              o.id,
              'arrived_customer',
              { arrived_at_customer_at: stamp() },
              quickPosition,
            ),
        },
      }
    }

    return {
      right: {
        mode: 'open',
        verb: 'Cobrar',
        icon: 'payments',
        tone: 'amber',
        commit: () => openSheet(o.id, 'cobrar'),
      },
    }
  }

  // Mismo criterio que en "En espera": "No tienes pedidos activos" es una
  // afirmación, y no se hace hasta saberla cierta.
  if (loading) return <SkeletonList count={2} />

  return (
    <div>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => {
          if (row.kind === 'courier') {
            return (
              <CourierMineItem
                key={row.item.id}
                order={row.item}
                hint={i === 0}
                onChanged={onCourierChanged}
              />
            )
          }
          const o = row.item
          const card = (
            <OrderCard
              order={o}
              now={now}
              variant="mine"
              incomingRequest={requestByOrder.get(o.id) ?? null}
            />
          )
          const { right, left } = actionsFor(o)
          if (!right && !left) return <div key={o.id}>{card}</div>
          // Los gestos que abren una hoja necesitan el detalle del pedido: se pide
          // en cuanto el dedo toca la tarjeta, no al soltar.
          const warm = right?.mode === 'open' || left !== undefined
          return (
            <SwipeCard
              key={o.id}
              right={right}
              left={left}
              onTouch={warm ? () => void fetchOrderDetail(o.id).catch(() => {}) : undefined}
              hint={i === 0}
              hintKey="tindivo.drv.swipehint.mine.v1"
            >
              {card}
            </SwipeCard>
          )
        })}
      </div>

      <MineSheets target={sheetTarget} now={now} onClose={closeSheet} onChanged={onChanged} />

      {rows.length === 0 && (
        <EmptyState
          icon="local_shipping"
          heading="No tienes pedidos activos"
          description="Toma uno de la bandeja Disponibles para empezar a repartir."
        />
      )}
    </div>
  )
}
