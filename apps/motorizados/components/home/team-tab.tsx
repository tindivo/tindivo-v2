'use client'

import { Badge, Button, Card, EmptyState, Icon } from '@tindivo/ui'
import { useState } from 'react'
import {
  RequestTransferSheet,
  type TransferTarget,
} from '@/components/transfers/request-transfer-sheet'
import { useNow } from '@/hooks/use-now'
import { getTransferRemaining, useTeam } from '@/hooks/use-team'
import { mmss } from '@/lib/format'
import type { CardOrder, TeamResponse } from '@/lib/types'
import { OrderCard } from './order-card'

/**
 * Adapta un pedido de equipo al tipo que consume `OrderCard`.
 *
 * Los nulos NO son descuido: son lo que el endpoint deliberadamente no manda de
 * un pedido ajeno. El cliente y su teléfono son datos de un tercero, y
 * `estimated_ready_at` permitiría quedarse solo con los pedidos ya listos.
 *
 * `delivery_fee: 0` con `order_amount: total` porque el payload trae el importe
 * ya sumado; la tarjeta muestra `order_amount + delivery_fee`, así que el total
 * sale correcto sin exponer el desglose.
 */
function teamOrderToCard(o: TeamResponse['teamOrders'][number]): CardOrder {
  return {
    id: o.orderId,
    short_id: o.shortId,
    status: o.status,
    source: o.source,
    customer_name: null,
    delivery_address: null,
    delivery_reference: o.deliveryReference,
    // OJO: el importe va ENTERO en `order_amount` y el envío a 0, a propósito.
    // El endpoint de equipo devuelve `total` ya sumado —no el desglose— y la
    // tarjeta pinta `order_amount + delivery_fee`, así que el número que se ve
    // es correcto. Quien lea `delivery_fee` aquí obtendrá 0 y NO significa
    // "envío gratis": significa que ese dato no viaja para pedidos ajenos.
    order_amount: o.total,
    delivery_fee: 0,
    payment_intent: null,
    change_to_give: null,
    // No viaja, como el resto del cobro: de un pedido ajeno no se expone con
    // qué billete paga el cliente. Sin él, `changeDue` devuelve null y la
    // tarjeta simplemente no habla de vuelto — que es lo correcto acá.
    client_pays_with: null,
    // Mismo criterio: el desglose de un pago ajeno no se expone.
    cash_amount: null,
    yape_amount: null,
    // Sí viaja, y aquí importa más que en las otras bandejas: antes de pedir un
    // traspaso conviene saber si ese pedido te va a comer dos huecos. La
    // cejilla de la tarjeta lo pinta cuando ocupa más de uno; sin eso, el
    // motorizado pedía el traspaso y se comía el `requester_no_capacity` de
    // 0130 sin haber podido preverlo.
    occupancy_slots: o.occupancySlots,
    estimated_ready_at: null,
    ready_early_used: null,
    urgent_since: o.urgentSince,
    delivered_at: null,
    business: {
      id: '',
      name: o.businessName ?? 'Restaurante',
      phone: null,
      address: null,
      accent_color: o.accentColor,
      coordinates_lat: null,
      coordinates_lng: null,
    },
  }
}

/**
 * Equipo: pedidos de los compañeros + solicitar traspaso (HU-D-033/034).
 *
 * Ya no trae sus propios datos. Tenía un `setInterval` de 15s y un
 * `CustomEvent('tindivo:transfer')` para hablar con `TransferWatcher`, que a su
 * vez pedía lo mismo por su cuenta; y devolvía el contador hacia arriba por un
 * `onCount` que solo disparaba estando montado —o sea, nunca cuando hacía
 * falta—. Todo eso vive ahora en `useTeam()`.
 */
export function TeamTab() {
  const team = useTeam()
  const [target, setTarget] = useState<TransferTarget | null>(null)
  const now = useNow()

  if (team.loading) return <div className="h-32 animate-pulse rounded-2xl bg-surface-low" />

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
        // Mismo helper que el banner: una sola forma de contar en toda la app.
        const { remainingSec: remaining } = getTransferRemaining(r, now)
        return (
          <Card key={r.id} className="mb-3 border-brand/15 bg-brand-light p-4 shadow-none">
            <span className="text-[13px] text-ink">
              Solicitud enviada{r.shortId ? ` · #${r.shortId}` : ''} ·{' '}
              <span className="font-mono font-bold tabular-nums text-brand-dark">
                {mmss(remaining)}
              </span>
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
              <div key={o.orderId} className="flex flex-col gap-1.5">
                {/* MISMA tarjeta que Disponibles y Míos. Antes esta pestaña
                    dibujaba sus propias `Card`: otra tipografía, sin franja del
                    local y sin la referencia de entrega, o sea sin el dato que
                    de verdad decide si pides el traspaso. */}
                <OrderCard
                  order={teamOrderToCard(o)}
                  now={now}
                  variant="team"
                  ownerName={group.name}
                />
                {/* El estado ya lo lleva la ranura de la tarjeta. Aquí se
                    pintaba por TERCERA vez (píldora + verbo + esta línea), y
                    una de las tres mentía: el verbo decía "Entregar a Juan"
                    con Juan siendo el dueño, no el cliente. */}
                <div className="flex items-center justify-end px-1">
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
                    <span className="text-caption text-ink-muted">Ya en reparto</span>
                  )}
                </div>
              </div>
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
            void team.refresh()
          }}
        />
      )}
    </div>
  )
}
