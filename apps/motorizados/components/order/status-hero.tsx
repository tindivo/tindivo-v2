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
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                background: i <= current ? '#F97316' : 'rgba(255,255,255,0.12)',
                boxShadow: i === current ? '0 0 0 5px rgba(249,115,22,0.25)' : undefined,
              }}
            >
              {i < current ? (
                <span className="text-white">
                  <Icon.Check />
                </span>
              ) : (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: i === current ? '#fff' : 'rgba(255,255,255,0.4)' }}
                />
              )}
            </span>
            {i < MOMENTS.length - 1 && (
              <span
                className="mx-1 h-0.5 flex-1"
                style={{ background: i < current ? '#F97316' : 'rgba(255,255,255,0.15)' }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {MOMENTS.map((label, i) => (
          <span
            key={label}
            className="font-mono text-[9px] uppercase"
            style={{
              letterSpacing: '0.08em',
              color: i === current ? '#FDBA74' : 'rgba(255,255,255,0.45)',
            }}
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
    <div
      className="relative overflow-hidden rounded-[22px] px-5 py-[22px] text-white"
      style={{ background: '#1A1614' }}
    >
      <div
        className="pointer-events-none absolute top-0 right-0 h-[140px] w-[140px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${
            moment === 2 ? 'rgba(22,163,74,0.45)' : 'rgba(249,115,22,0.4)'
          } 0%, transparent 70%)`,
          transform: 'translate(40px,-40px)',
        }}
      />
      <span
        className="relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] font-mono text-[10px] uppercase"
        style={{
          letterSpacing: '0.2em',
          background: moment === 2 ? 'rgba(22,163,74,0.25)' : 'rgba(249,115,22,0.2)',
          color: moment === 2 ? '#BBF7D0' : '#FED7AA',
        }}
      >
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full"
          style={{ background: moment === 2 ? '#4ADE80' : '#FDBA74' }}
        />
        Pedido #{order.shortId}
      </span>

      {moment === 2 ? (
        <div className="relative mt-3">
          <p
            className="font-mono text-[11px] uppercase"
            style={{ letterSpacing: '0.14em', color: 'rgba(255,255,255,0.6)' }}
          >
            {collecting ? 'Cobrar al entregar' : 'Pedido pagado'}
          </p>
          {collecting ? (
            <p className="t-display mt-1 text-[36px] tabular-nums">{soles(total)}</p>
          ) : (
            <p className="t-display mt-1 text-[28px]">Ya está pagado</p>
          )}
          <p className="mt-1 text-[14px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {sub}
          </p>
        </div>
      ) : (
        <div className="relative mt-3">
          <p className="t-display text-[28px]">{title}</p>
          <p className="mt-1 text-[14px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {sub}
          </p>
        </div>
      )}

      <div className="relative">
        <Stepper current={moment} />
      </div>
    </div>
  )
}
