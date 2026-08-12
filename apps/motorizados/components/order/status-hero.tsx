'use client'

import { cn, Icon } from '@tindivo/ui'
import { MOMENTS, momentOf, moneyLine, orderStateBadge } from '@/lib/orders/presentation'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Hero del pedido activo: dónde estás del recorrido y qué toca ahora.
 *
 * EL PASO A PASO ES EL ANCLA. Es lo único de esta pantalla que responde "¿por
 * dónde voy?" de un vistazo, y por eso se queda arriba del todo, siempre igual,
 * en los cuatro momentos.
 *
 * SALE DEL `status`, NO DE UN ÍNDICE ESCRITO A MANO. `page.tsx` pasaba
 * `moment={0|1|2}` literal en tres sitios: un número mágico que no podía estar
 * de acuerdo con la máquina de estados porque no la miraba, y que además no
 * llegaba nunca a 3 — el cuarto paso ("Listo") jamás se marcaba como actual.
 *
 * Y LO QUE DICE EL COBRO SALE DE `presentation.ts`, el mismo módulo que la
 * tarjeta del board. Aquí se construían las frases a mano con ramas de
 * `paymentIntent`, y una estaba mal de una forma que costaba dinero: leía
 * `changeToGive` de la columna, que llega SIEMPRE NULL en los pedidos manuales
 * —el 100% del piloto—, así que enseñaba «vuelto S/ 0.00». La tarjeta ya lo
 * derivaba bien desde hacía tiempo con `changeDue()`.
 */

function Stepper({ current }: { current: number }) {
  return (
    <div className="mt-[18px]">
      <div className="flex items-center">
        {MOMENTS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
                i <= current ? 'bg-brand ring-2 ring-brand/25' : 'bg-white/[0.12]',
              )}
            >
              {i < current ? (
                <span className="text-white">
                  <Icon name="check" size={20} />
                </span>
              ) : (
                <span
                  className={cn('h-2 w-2 rounded-full', i === current ? 'bg-white' : 'bg-white/40')}
                />
              )}
            </span>
            {i < MOMENTS.length - 1 && (
              <span
                className={cn(
                  'mx-1 h-0.5 flex-1 rounded-full',
                  i < current ? 'bg-brand' : 'bg-white/15',
                )}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {MOMENTS.map((label, i) => (
          <span
            key={label}
            className={cn(
              'font-mono text-micro uppercase tracking-widest',
              i === current ? 'text-brand-light' : 'text-white/45',
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function StatusHero({ detail }: { detail: OrderDetailResponse }) {
  const { order, business } = detail
  const step = momentOf(order.status) ?? 0
  const state = orderStateBadge(order.status)

  // Con la comida encima, lo que manda es el cobro: es el momento en que se
  // decide la plata, y es donde el motorizado necesita el número grande.
  const collecting = order.status === 'picked_up'
  const money = moneyLine({
    paymentIntent: order.paymentIntent,
    total: order.orderAmount + order.deliveryFee,
    cashAmount: order.cashAmount,
    yapeAmount: order.yapeAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  const prepaid = order.paymentIntent === 'prepaid'
  const heading = collecting ? money.headline : (state?.text ?? 'Pedido')
  const sub = collecting
    ? money.detail
    : order.status === 'heading_to_restaurant'
      ? (business?.name ?? 'Restaurante')
      : 'Esperando que el pedido salga de cocina'

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-ink via-ink to-brand-dark px-5 py-[22px] text-white shadow-elev-3">
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0 right-0 h-[160px] w-[160px] translate-x-10 -translate-y-10 rounded-full opacity-40 blur-3xl',
          collecting && prepaid ? 'bg-success/40' : 'bg-brand/40',
        )}
      />

      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/[0.14] px-2.5 py-[5px] font-mono text-micro uppercase tracking-[0.2em] text-white/90">
        {/* El punto ya no parpadea. En esta pantalla el único movimiento debe
            ser el que informa; un latido decorativo compite con los avisos que
            sí significan algo. */}
        <span className="h-1.5 w-1.5 rounded-full bg-brand-light" />
        Pedido #{order.shortId}
      </span>

      <div className="relative mt-3">
        {collecting && (
          <p className="font-mono text-meta uppercase tracking-[0.14em] text-white/60">
            {prepaid ? 'No tienes que cobrar' : 'Cobrar al entregar'}
          </p>
        )}
        <p
          className={cn(
            'font-display font-bold tracking-tight',
            // La cifra pide más cuerpo que una palabra de estado, y en mono los
            // dígitos ya corren más de lo que dice su talla.
            collecting && !prepaid ? 'mt-1 font-mono text-display tabular-nums' : 'text-display',
            collecting && prepaid && 'text-success-soft',
          )}
        >
          {heading}
        </p>
        {sub && <p className="mt-1 text-body text-white/70">{sub}</p>}
      </div>

      <div className="relative">
        <Stepper current={step} />
      </div>
    </div>
  )
}
