'use client'

import { Badge, Card, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { useMemo } from 'react'
import { useOverdueFeedback } from '@/hooks/use-overdue-feedback'
import { byReadyClock } from '@/lib/orders/sort'
import type { BoardOrder } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'
import { OrderCard } from './order-card'
import { OverdueBanner } from './overdue-banner'
import { SwipeToTake } from './swipe-to-take'
import { UpcomingOrdersSection } from './upcoming-orders-section'

/** Bandeja de disponibles: prioriza vencidos (HU-D-013), capa de capacidad
 *  (HU-D-014) y sección colapsable de "Próximos" en cola fría (HU-D-012). */
export function AvailableTab({
  available,
  upcoming,
  mySlots,
  hasOverdueAvailable: _hasOverdueAvailable,
  lastSyncOk,
  loading,
  now,
  onTaken,
}: {
  available: BoardOrder[]
  upcoming: BoardOrder[]
  mySlots: number
  hasOverdueAvailable: boolean
  lastSyncOk: boolean
  /** Primera carga sin resolver: no se sabe si está vacío. */
  loading: boolean
  now: number
  /** Refresca el board tras un gesto: el pedido ya no vive en esta bandeja. */
  onTaken: () => void
}) {
  const full = mySlots >= 3

  const overdueSet = useMemo(() => {
    const set = new Set<string>()
    for (const o of available) {
      if (orderUrgency(o, now) === 'overdue') set.add(o.id)
    }
    return set
  }, [available, now])

  const overdueCount = overdueSet.size
  const hasOverdue = overdueCount > 0

  // Feedback háptico + audible cuando se detectan pedidos vencidos nuevos
  useOverdueFeedback(overdueSet)

  // Por el reloj, que es lo que la tarjeta enseña. La regla y su porqué viven
  // en `lib/orders/sort`, con tests: ya se rompió una vez y el síntoma no fue
  // un fallo sino una lista que "no se entendía".
  const sorted = useMemo(() => byReadyClock(available), [available])

  // UN VACÍO SOLO SE AFIRMA CUANDO SE SABE VACÍO.
  //
  // El board arranca con `orders: []`, así que el primer render decía "Sin
  // pedidos disponibles" y un instante después aparecían las tarjetas: la
  // pantalla afirmaba lo contrario de la verdad justo cuando el motorizado la
  // mira para decidir si tiene trabajo.
  if (loading) return <SkeletonList count={3} />

  return (
    <div>
      {!lastSyncOk && (
        <Badge variant="default" size="sm" className="mb-3 font-mono uppercase tracking-widest">
          Datos sin conexión
        </Badge>
      )}

      {full && (
        <Card className="mb-3 flex items-start gap-3 border border-ink/[0.06] bg-ink/[0.03] p-4 shadow-none">
          <Icon name="shopping_basket" size={20} className="shrink-0 text-ink" />
          <p className="font-semibold text-[14px]">
            Mochila llena {mySlots}/3. Entrega un pedido para tomar otro.
          </p>
        </Card>
      )}

      <OverdueBanner count={overdueCount} />

      <div className="flex flex-col gap-3">
        {sorted.map((o, i) => {
          const esUrgente = orderUrgency(o, now) === 'overdue'
          // DOS razones distintas para no poder tomar un pedido, y cada una dice
          // la suya. La mochila manda sobre la prioridad: si no te cabe, da
          // igual cuál sea el urgente.
          //
          // La prioridad era hasta ahora SOLO atenuación: la tarjeta seguía
          // navegando, así que la regla era una sugerencia visual. Ahora
          // bloquea de verdad, como el legacy.
          //
          // NO DICE "VENCIDO", igual que el banner: `orderUrgency` marca por
          // `urgent_since` —nadie lo ha tomado en 5 min, reloj de la ASIGNACIÓN—
          // o por ETA pasada —reloj de la COCINA—, y el primero salta con la
          // comida aún en el horno. "Vencido" prometía un plazo agotado junto a
          // un contador corriendo tan tranquilo.
          const porMochila = full
          const porPrioridad = !full && hasOverdue && !esUrgente
          const motivo = porMochila
            ? `Mochila llena ${mySlots}/3`
            : porPrioridad
              ? 'Primero el que lleva esperando'
              : undefined

          const bloqueada = porMochila || porPrioridad

          const card = (
            <OrderCard
              order={o}
              now={now}
              variant="available"
              // La razón viaja CON la tarjeta: el cartel de arriba se pierde en
              // cuanto la lista scrollea, y una tarjeta apagada sin explicación
              // es indistinguible de un fallo de render.
              blocked={bloqueada}
              blockedReason={motivo}
            />
          )

          // Una tarjeta bloqueada NO CEDE NI UN PÍXEL. Ya dice por qué con el
          // candado; una que se deja arrastrar y luego rebota promete algo que
          // no va a pasar.
          if (bloqueada) return <div key={o.id}>{card}</div>

          return (
            <SwipeToTake key={o.id} orderId={o.id} onTaken={onTaken} hint={i === 0}>
              {card}
            </SwipeToTake>
          )
        })}
      </div>

      {sorted.length === 0 && upcoming.length === 0 && (
        <EmptyState
          icon="local_shipping"
          heading="Sin pedidos disponibles"
          description="Vuelve en unos minutos, pronto llegarán nuevas entregas."
        />
      )}

      <UpcomingOrdersSection items={upcoming} now={now} />
    </div>
  )
}
