'use client'

import { serviceDate } from '@tindivo/contracts'
import { Badge, Button, Card, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/lib/format'
import { type CashBusinessGroup, type CashOrder, useCashSummary } from '../hooks/use-cash-summary'
import { useDeliverCash } from '../hooks/use-deliver-cash'

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})
const diaLima = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Lima',
})
/**
 * La hora del pedido, y el día SOLO cuando no es de esta noche.
 *
 * Un pedido cobrado ayer y todavía sin cerrar sigue en esta lista a propósito
 * (la confirmación es humana y nadie la fuerza a las 24h). Pero mezclado con los
 * de esta noche y mostrando solo «19:40», se lee como uno de hoy. El día lo
 * separa sin sacarlo de la lista.
 *
 * SE COMPARA POR JORNADA, NO POR FECHA DE CALENDARIO. El endpoint que alimenta
 * esta pantalla ya lleva escrito por qué no filtra por el día de Lima —"ese
 * dinero desaparecía de la pantalla a medianoche sin que nada hubiera pasado"—
 * y aquí quedaba la otra mitad: a las 00:00, con el motorizado todavía
 * repartiendo, todo lo de esa noche se rotulaba «ayer». `serviceDate` corta a
 * las 05:00, igual que `current_service_date` en la base.
 */
function cuando(iso: string | null): { hora: string; dia: string | null } | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const hoy = serviceDate()
  const suyo = serviceDate(new Date(t))
  if (suyo === hoy) return { hora: horaLima.format(t), dia: null }
  const ayer = serviceDate(new Date(Date.now() - 86_400_000))
  return { hora: horaLima.format(t), dia: suyo === ayer ? 'ayer' : diaLima.format(t) }
}

export function EfectivoList() {
  const { businesses, loading, error, reload } = useCashSummary()
  const { deliver, busyIds } = useDeliverCash()

  /**
   * Pedidos ya enviados cuya respuesta todavía no ha vuelto en un `reload`.
   *
   * Sin esto la línea vuelve un instante a «Entregar» entre que el POST termina
   * y la recarga llega, y ese parpadeo delante de la cajera invita al segundo
   * tap. (El segundo tap no cobra dos veces —la RPC es idempotente por
   * `orders.cash_settlement_id`— pero igual no hay que provocarlo.)
   */
  const [enviados, setEnviados] = useState<ReadonlySet<string>>(new Set())
  const [errorPorPedido, setErrorPorPedido] = useState<Record<string, string>>({})

  async function entregar(orderId: string) {
    setErrorPorPedido((e) => {
      const { [orderId]: _, ...resto } = e
      return resto
    })
    setEnviados((s) => new Set(s).add(orderId))
    try {
      await deliver(orderId)
      reload()
    } catch (err) {
      setEnviados((s) => {
        const next = new Set(s)
        next.delete(orderId)
        return next
      })
      setErrorPorPedido((e) => ({
        ...e,
        [orderId]: err instanceof Error ? err.message : 'Error',
      }))
    }
  }

  if (loading) return <SkeletonList count={2} />

  // Los totales se derivan de las MISMAS líneas que pinta la lista, descontando
  // lo recién enviado. Leerlos de `pendingTotal` —que viene del servidor— dejaba
  // el número grande diciendo S/ 100 mientras las dos líneas de abajo ya decían
  // «Entregando…», hasta que llegara la recarga. Un total que contradice a su
  // propio desglose es exactamente lo que no puede pasar en esta pantalla.
  const enBolsillo = businesses.flatMap((b) =>
    b.orders.filter((o) => o.state === 'pending' && !enviados.has(o.orderId)),
  )
  const totalPorEntregar = enBolsillo.reduce((s, o) => s + o.cashOwed, 0)
  const pedidosPorEntregar = enBolsillo.length
  const negociosConPendiente = businesses.filter((b) =>
    b.orders.some((o) => o.state === 'pending' && !enviados.has(o.orderId)),
  ).length
  const esperando = businesses.reduce(
    (s, b) => s + b.orders.filter((o) => o.state !== 'pending' || enviados.has(o.orderId)).length,
    0,
  )

  return (
    <>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

      {/* El número que tiene que cuadrar con el fajo de su bolsillo. Cuenta solo
          lo que TODAVÍA lleva encima: lo entregado ya no es suyo. */}
      {pedidosPorEntregar > 0 && (
        <Card className="mt-4 border-none bg-brand p-5 text-white shadow-none">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            Efectivo por entregar
          </p>
          <p className="font-display mt-1 text-[38px] font-bold leading-none tracking-tight tabular-nums">
            {soles(totalPorEntregar)}
          </p>
          <p className="mt-2 text-[12px] text-white/85">
            {pedidosPorEntregar} {pedidosPorEntregar === 1 ? 'pedido' : 'pedidos'} ·{' '}
            {negociosConPendiente} {negociosConPendiente === 1 ? 'restaurante' : 'restaurantes'}
          </p>
        </Card>
      )}

      {businesses.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="payments"
            heading="Sin efectivo por entregar"
            description="Cuando cobres en efectivo aparecerá aquí, cliente por cliente."
          />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {businesses.map((b) => (
            <NegocioCard
              key={b.businessId}
              group={b}
              onEntregar={entregar}
              busyIds={busyIds}
              enviados={enviados}
              errores={errorPorPedido}
            />
          ))}
        </div>
      )}

      {pedidosPorEntregar === 0 && esperando > 0 && (
        <p className="mt-4 text-center text-[13px] text-ink-muted">
          Ya entregaste todo. Falta que el local lo confirme.
        </p>
      )}
    </>
  )
}

/**
 * Un restaurante, con sus clientes debajo.
 *
 * La tarjeta ya no tiene un botón propio: la entrega es cliente por cliente,
 * porque así es como se dice en el local —«de Lucía 30, de Martha 30»— y porque
 * un botón de «entregar todo» vuelve a convertir en un bulto lo único que hace
 * que una diferencia se pueda atribuir a alguien.
 */
function NegocioCard({
  group,
  onEntregar,
  busyIds,
  enviados,
  errores,
}: {
  group: CashBusinessGroup
  onEntregar: (orderId: string) => void
  busyIds: ReadonlySet<string>
  enviados: ReadonlySet<string>
  errores: Record<string, string>
}) {
  const porEntregar = group.orders.filter((o) => o.state === 'pending' && !enviados.has(o.orderId))
  const enEspera = group.orders.filter((o) => o.state !== 'pending' || enviados.has(o.orderId))
  const adelanto = group.orders.reduce((s, o) => s + (o.breakdown?.advance ?? 0), 0)
  const accent = group.accentColor ? `#${group.accentColor}` : '#f97316'

  return (
    <Card className="relative overflow-hidden p-0">
      {/* Franja vertical de acento del restaurante (coherente con las tarjetas del board) */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-baseline justify-between gap-2 px-[18px] pt-[18px]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          <p className="min-w-0 truncate font-semibold text-[16px]">{group.businessName}</p>
        </div>
        {porEntregar.length > 0 ? (
          <p className="font-display shrink-0 text-[20px] font-bold tabular-nums tracking-tight">
            {soles(porEntregar.reduce((s, o) => s + o.cashOwed, 0))}
          </p>
        ) : (
          // Sin nada que entregar, el importe que importa es el que está en el
          // aire. Va apagado: no es dinero suyo ni exige que haga nada.
          <p className="font-mono shrink-0 text-[13px] font-semibold tabular-nums text-ink-muted">
            {soles(enEspera.reduce((s, o) => s + o.cashOwed, 0))} por confirmar
          </p>
        )}
      </div>

      {porEntregar.length > 0 && (
        <ul className="mt-2.5 flex flex-col">
          {porEntregar.map((o) => (
            <PedidoRow
              key={o.orderId}
              order={o}
              onEntregar={onEntregar}
              busy={busyIds.has(o.orderId)}
              error={errores[o.orderId]}
            />
          ))}
        </ul>
      )}

      {enEspera.length > 0 && (
        <>
          <p className="font-mono mt-2 border-t border-ink/[0.06] px-[18px] pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
            Esperando confirmación del local
          </p>
          <ul className="flex flex-col">
            {enEspera.map((o) => (
              <PedidoRow key={o.orderId} order={o} entregado />
            ))}
          </ul>
        </>
      )}

      {adelanto > 0 && (
        <div className="mx-[18px] mb-[18px] mt-2 flex items-start gap-2 rounded-[12px] bg-warning-soft px-3 py-2 text-[12px] text-amber-900">
          <Icon name="info" size={15} filled className="mt-px shrink-0" />
          <span>
            Incluye <strong className="font-semibold tabular-nums">{soles(adelanto)}</strong> de
            sencillo que te adelantó el local. Ese dinero es suyo, hayas cobrado en efectivo o no.
          </span>
        </div>
      )}
      {adelanto === 0 && <div className="h-[18px]" />}
    </Card>
  )
}

/**
 * Un cliente: nombre · cuándo · monto · acción.
 *
 * El monto va en su propia columna y no dentro del botón. El motorizado lee la
 * cifra en voz alta mientras la cajera cuenta («de Lucía, treinta»), así que
 * tiene que poder recorrer la columna de importes de arriba abajo sin leer
 * cuatro veces la palabra «Entregar».
 */
function PedidoRow({
  order,
  onEntregar,
  busy,
  error,
  entregado = false,
}: {
  order: CashOrder
  onEntregar?: (orderId: string) => void
  busy?: boolean
  error?: string
  entregado?: boolean
}) {
  const t = cuando(order.deliveredAt)
  const nombre = order.customerName?.trim()
  const enDisputa = order.state === 'disputed'

  return (
    <li className="border-t border-ink/[0.04] first:border-t-0">
      <div className="flex min-h-[52px] items-center gap-3 px-[18px] py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-ink">{nombre || `#${order.shortId}`}</p>
          {t && (
            <p className="font-mono text-[11px] text-ink-muted">
              {t.dia && <span className="font-semibold text-amber-700">{t.dia} </span>}
              {t.hora}
            </p>
          )}
        </div>

        <p
          className={`font-mono shrink-0 text-[15px] font-bold tabular-nums ${
            entregado ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          {soles(order.cashOwed)}
        </p>

        <div className="flex w-[104px] shrink-0 justify-end">
          {entregado ? (
            enDisputa ? (
              <Badge variant="danger" size="sm">
                Diferencia
              </Badge>
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                Entregando…
              </span>
            )
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onEntregar?.(order.orderId)}>
              {busy ? '…' : 'Entregar'}
            </Button>
          )}
        </div>
      </div>

      {enDisputa && (
        <p className="px-[18px] pb-2 text-[12px] text-ink-muted">
          El local reportó una diferencia en este pedido. Tindivo lo está revisando.
        </p>
      )}
      {error && <p className="px-[18px] pb-2 text-[12px] text-danger">{error}</p>}
    </li>
  )
}
