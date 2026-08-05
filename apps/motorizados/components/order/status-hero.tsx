'use client'

import { Icon } from '@tindivo/ui'
import { soles } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

const MOMENTS = ['Voy', 'Local', 'Camino', 'Listo'] as const

function Stepper({ current }: { current: number }) {
  return (
    <div className="mt-[18px]">
      <div className="flex items-center">
        {MOMENTS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all ${
                i <= current
                  ? 'bg-brand shadow-[0_0_0_5px_rgba(249,115,22,0.25)]'
                  : 'bg-white/[0.12]'
              }`}
            >
              {i < current ? (
                <span className="text-white">
                  <Icon name="check" size={20} />
                </span>
              ) : (
                <span
                  className={`h-2 w-2 rounded-full ${i === current ? 'bg-white' : 'bg-white/40'}`}
                />
              )}
            </span>
            {i < MOMENTS.length - 1 && (
              <span
                className={`mx-1 h-0.5 flex-1 rounded-full ${
                  i < current ? 'bg-brand' : 'bg-white/15'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {MOMENTS.map((label, i) => (
          <span
            key={label}
            className={`font-mono text-[9px] uppercase tracking-widest ${
              i === current ? 'text-brand-light' : 'text-white/45'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Hero oscuro del pedido activo (espejo del tracking del cliente). */
export function StatusHero({ detail, moment }: { detail: OrderDetailResponse; moment: 0 | 1 | 2 }) {
  const { order, business } = detail
  const total = order.orderAmount + order.deliveryFee
  const collecting = moment === 2 && order.paymentIntent !== 'prepaid'

  const title = moment === 0 ? 'Voy al local' : moment === 1 ? 'En el local' : null
  const sub =
    moment === 0
      ? (business?.name ?? 'Restaurante')
      : moment === 1
        ? 'Esperando que el pedido salga de cocina'
        : order.paymentIntent === 'pending_cash'
          ? `Efectivo · paga con ${soles(order.clientPaysWith)} · vuelto ${soles(order.changeToGive ?? 0)}`
          : order.paymentIntent === 'pending_mixed'
            ? `Mixto · ${soles(order.yapeAmount)} Yape + ${soles(order.cashAmount)} efectivo`
            : order.paymentIntent === 'pending_yape'
              ? 'Yape al Yape del restaurante'
              : 'No cobres nada al cliente'

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-ink via-ink to-brand-dark px-5 py-[22px] text-white shadow-elev-3">
      <div
        className={`pointer-events-none absolute top-0 right-0 h-[160px] w-[160px] translate-x-10 -translate-y-10 rounded-full opacity-60 blur-3xl ${
          moment === 2 ? 'bg-success/40' : 'bg-brand/40'
        }`}
      />
      <span
        className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] font-mono text-[10px] uppercase tracking-[0.2em] ${
          moment === 2 ? 'bg-success/25 text-success-soft' : 'bg-brand/20 text-brand-light'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 animate-pulse rounded-full ${
            moment === 2 ? 'bg-success-soft' : 'bg-brand-light'
          }`}
        />
        Pedido #{order.shortId}
      </span>

      {moment === 2 ? (
        <div className="relative mt-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/60">
            {collecting ? 'Cobrar al entregar' : 'Pedido pagado'}
          </p>
          {collecting ? (
            <p className="mt-1 font-display text-[36px] font-bold tracking-tight tabular-nums">
              {soles(total)}
            </p>
          ) : (
            <p className="mt-1 font-display text-[28px] font-bold tracking-tight">Ya está pagado</p>
          )}
          <p className="mt-1 text-[14px] text-white/70">{sub}</p>
        </div>
      ) : (
        <div className="relative mt-3">
          <p className="font-display text-[28px] font-bold tracking-tight">{title}</p>
          <p className="mt-1 text-[14px] text-white/70">{sub}</p>
        </div>
      )}

      <div className="relative">
        <Stepper current={moment} />
      </div>
    </div>
  )
}
