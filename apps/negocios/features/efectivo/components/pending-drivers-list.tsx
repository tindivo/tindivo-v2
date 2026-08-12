'use client'

import { Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { PendingByDriver } from '../hooks/use-cash-settlements'

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})
const horaDe = (iso: string | null) => (iso ? horaLima.format(Date.parse(iso)) : null)

/**
 * Efectivo del negocio que los motorizados llevan encima y aún no han rendido.
 *
 * Es lo MISMO que el motorizado ve en su pantalla, pedido por pedido: si los dos
 * miran números distintos, la conversación empieza discutiendo cuál pantalla
 * miente. Aquí va colapsado —la cajera consulta esto de pasada, no mientras
 * cuenta— y en la del motorizado va abierto, que es cuando se usa de verdad.
 */
export function PendingDriversList({ drivers }: { drivers: PendingByDriver[] }) {
  const total = drivers.reduce((s, d) => s + d.total, 0)

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2.5">
        <Icon name="two_wheeler" size={20} className="text-ink-muted" />
        <div className="text-base font-bold">Pendiente del motorizado</div>
        <div className="flex-1" />
        <div className="font-mono text-[15px] font-bold">{soles(total)}</div>
      </div>
      <div className="flex flex-col gap-2.5">
        {drivers.map((d) => (
          <DriverCard key={d.driverId} driver={d} />
        ))}
      </div>
      <p className="mt-2.5 text-xs text-ink-muted">
        Todavía no te lo ha entregado. Cuando lo haga, aparecerá abajo en “Por confirmar” para que
        cuentes el dinero.
      </p>
    </div>
  )
}

function DriverCard({ driver }: { driver: PendingByDriver }) {
  const [open, setOpen] = useState(false)
  const adelanto = driver.detail.reduce((s, o) => s + o.advance, 0)

  return (
    <div className="rounded-2xl border border-ink/[0.04] bg-card shadow-elev-1">
      <div className="flex items-center gap-3 p-3">
        <div className="h-full w-1 shrink-0 self-stretch rounded-l-2xl bg-ink-subtle" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{driver.name}</div>
          <div className="text-xs text-ink-muted">
            {driver.orders} {driver.orders === 1 ? 'pedido cobrado' : 'pedidos cobrados'} · aún no
            entregado
          </div>
        </div>
        <div className="font-mono text-base font-bold tabular-nums">{soles(driver.total)}</div>
        {driver.phone && (
          <Button
            as="a"
            variant="outline"
            size="sm"
            href={`tel:+51${driver.phone.replace(/\D/g, '')}`}
          >
            <Icon name="call" size={15} /> Llamar
          </Button>
        )}
      </div>

      {driver.detail.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 border-t border-ink/[0.04] px-3.5 py-2 text-left text-xs font-semibold text-ink-muted"
          >
            <Icon name="receipt_long" size={15} />
            {open ? 'Ocultar pedidos' : `Ver los ${driver.detail.length} pedidos`}
            <div className="flex-1" />
            <Icon name={open ? 'expand_less' : 'expand_more'} size={16} />
          </button>

          {open && (
            <ul className="flex flex-col gap-1.5 border-t border-ink/[0.04] px-3.5 py-2.5">
              {driver.detail.map((o) => {
                const hora = horaDe(o.deliveredAt)
                const nombre = o.customerName?.trim()
                return (
                  <li key={o.orderId} className="flex items-baseline gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-ink">{nombre || `#${o.shortId}`}</span>
                      {hora && (
                        <span className="ml-1.5 font-mono text-[11px] text-ink-muted">{hora}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono font-semibold tabular-nums">
                      {soles(o.cashOwed)}
                    </span>
                  </li>
                )
              })}
              {adelanto > 0 && (
                <li className="mt-1 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[12px] text-amber-900">
                  <Icon name="info" size={15} filled className="mt-px shrink-0" />
                  <span>
                    Incluye{' '}
                    <strong className="font-semibold tabular-nums">{soles(adelanto)}</strong> de
                    sencillo que le adelantaste. Vuelve aunque el cliente no haya pagado en
                    efectivo.
                  </span>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
