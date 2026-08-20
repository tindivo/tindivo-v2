'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/features/tracking/lib/format'
import type { Tracking } from '@/features/tracking/types'

interface TrackingItemsProps {
  data: Tracking
}

/**
 * El detalle del pedido, plegado.
 *
 * Mientras el cliente sigue su pedido, la lista de productos es material de
 * consulta, no la noticia: ya la revisó dos veces en el carrito y en el
 * checkout. Desplegada empujaba fuera de pantalla lo que sí cambia.
 *
 * Dos cosas se quedan SIEMPRE a la vista aunque esté plegado: el total y, si
 * paga en efectivo, con cuánto paga y su vuelto. Eso es lo que necesita tener
 * delante cuando toquen la puerta, y es justo el momento en que no va a estar
 * abriendo acordeones con una mano.
 */
export function TrackingItems({ data }: TrackingItemsProps) {
  const [abierto, setAbierto] = useState(false)
  const itemCount = data.items.length
  const enEfectivo = data.paymentIntent === 'pending_cash' && data.paysWith != null

  return (
    <div className="mt-3.5 rounded-[22px] border border-ink/[0.04] bg-card px-[18px] py-4 lg:mt-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Detalle
          </div>
          <div className="mt-0.5 text-[12px] text-ink-subtle">
            {data.deliveryMethod === 'delivery' ? 'Delivery' : 'Recojo'} · {itemCount}{' '}
            {itemCount === 1 ? 'producto' : 'productos'}
          </div>
        </div>
        <Icon
          name={abierto ? 'expand_less' : 'expand_more'}
          size={22}
          className="shrink-0 text-ink-subtle"
        />
      </button>

      {abierto && (
        <div className="mt-3 border-ink/[0.06] border-t pt-2">
          {data.items.map((it, idx) => (
            <div key={`item-${idx}-${it.name}`} className="py-1.5">
              <div className="flex justify-between text-[14px] text-ink-muted">
                <span>
                  {it.qty}× {it.name}
                </span>
                <span className="tabular-nums">{soles(it.lineTotal)}</span>
              </div>
              {(it.modifiers ?? []).map((m, mi) => (
                <div
                  key={`item-${idx}-mod-${mi}-${m.name}`}
                  className="mt-0.5 flex justify-between pl-5 text-[12px] text-ink-subtle"
                >
                  <span>{m.name}</span>
                  {Number(m.price) > 0 && (
                    <span className="tabular-nums">+{soles(Number(m.price))}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="mt-1.5 flex justify-between text-[13px] text-ink-subtle">
            <span>Delivery</span>
            <span className="tabular-nums">{soles(data.deliveryFee)}</span>
          </div>
        </div>
      )}

      <div className="my-2.5 h-px bg-ink/[0.08]" />

      {enEfectivo && (
        <div className="mb-1.5 flex items-start justify-between gap-3 rounded-[12px] bg-ink/[0.03] px-2.5 py-2 text-[13px]">
          <span className="text-ink-muted">Pagas con</span>
          <span className="text-right font-medium text-ink tabular-nums">
            {soles(Number(data.paysWith))}
            <span className="block text-[12px] text-ink-subtle">
              {Number(data.changeToGive ?? 0) > 0
                ? `vuelto ${soles(Number(data.changeToGive))}`
                : 'importe exacto'}
            </span>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[16px] font-semibold text-ink">
          {/* «Total pagado» solo cuando el dinero salió de verdad, que es cuando
              hay captura subida. Antes bastaba con que el pedido fuera prepago,
              así que en `awaiting_payment` —el estado cuyo mensaje es
              literalmente «paga ahora»— la misma pantalla daba el pago por
              hecho dos dedos más abajo. */}
          {data.paymentIntent === 'prepaid' && data.proofUrl ? 'Total pagado' : 'Total'}
        </span>
        <span className="font-display text-[18px] font-bold tracking-tight tabular-nums">
          {soles(data.total)}
        </span>
      </div>
    </div>
  )
}
