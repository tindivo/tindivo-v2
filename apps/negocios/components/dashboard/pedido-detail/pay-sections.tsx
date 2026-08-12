'use client'

import { Icon } from '@tindivo/ui'
import type { OrderVM } from '@/lib/orders/view-model'
import { soles } from '../primitives'
import { DetailRow } from './detail-row'

/**
 * EL TOTAL NO SE REPITE AQUÍ.
 *
 * Justo encima está la tarjeta «Cobro», que ya lleva el total en su cabecera y
 * el desglose dentro. Estas secciones repetían «Total a cobrar» con la misma
 * cifra, así que en un pedido en efectivo el mismo número salía TRES veces en
 * media pantalla: en la cabecera de Cobro, en su desglose y aquí. Repetir una
 * cifra no la refuerza, la vuelve ruido — y en una columna donde la cajera
 * busca de un vistazo cuánto vuelto preparar, el ruido cuesta.
 *
 * Cada sección de pago dice SOLO lo que es propio de su método: el billete y
 * el vuelto en efectivo, el QR en billetera, el reparto en el combinado.
 *
 * La excepción es un efectivo sin billete declarado: ahí no queda nada
 * específico que decir, y una tarjeta con solo un título no informa. En ese
 * caso —y solo en ese— vuelve el total.
 */
export function PaySectionCash({ order }: { order: OrderVM }) {
  return (
    <div className="shrink-0 rounded-xl border border-success/30 bg-success/10 p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon weight={500} name="payments" size={18} filled className="text-success" />
        <div className="text-[13px] font-bold text-success">Pago en efectivo</div>
      </div>
      <div className="flex flex-col gap-1">
        {order.paysWith != null ? (
          <DetailRow label="Cliente paga con" value={soles(order.paysWith)} mono />
        ) : (
          <DetailRow label="Total a cobrar" value={soles(order.total)} mono bold />
        )}
        {order.cashChange != null && order.cashChange > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-lg bg-success-soft px-2.5 py-1.5">
            <span className="text-xs font-bold text-success">Vuelto a preparar</span>
            <span className="font-mono text-base font-bold text-success">
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sin `order`: al salir el total, lo único que queda propio de este método es
 *  el QR del local, que no depende del pedido. */
export function PaySectionWallet({ qrUrl }: { qrUrl: string | null }) {
  return (
    <div className="shrink-0 rounded-xl border border-info/30 bg-info/10 p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon weight={500} name="qr_code_2" size={18} filled className="text-info" />
        <div className="text-[13px] font-bold text-info">Cobrar con billetera digital</div>
      </div>
      {/* Sin «Total a cobrar»: está en la cabecera de «Cobro», aquí arriba. Lo
          propio de este método es el QR, y es lo que se enseña. */}
      <div className="rounded-[10px] bg-white p-2.5 text-center">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
          QR del restaurante
        </div>
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrUrl}
            alt="QR del restaurante"
            className="mx-auto mb-2 h-[90px] w-[90px] rounded-[10px] object-contain"
          />
        ) : (
          <div className="relative mx-auto mb-2 h-[90px] w-[90px] overflow-hidden rounded-[10px] bg-surface-low">
            <span className="absolute inset-0 flex items-center justify-center px-1.5 text-center text-[10px] uppercase tracking-wide text-ink/50">
              QR Yape/Plin
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function PaySectionMixed({ order, qrUrl }: { order: OrderVM; qrUrl: string | null }) {
  return (
    <div className="shrink-0 rounded-xl border border-warning/40 bg-warning-soft p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon weight={500} name="shuffle" size={18} filled className="text-warning" />
        <div className="text-[13px] font-bold text-warning">Pago combinado</div>
      </div>
      <div className="flex flex-col gap-1">
        {/* El reparto ES lo propio del combinado; el total ya está en «Cobro». */}
        <DetailRow label="Billetera digital" value={soles(order.walletPart ?? 0)} mono />
        <DetailRow label="Efectivo" value={soles(order.cashPart ?? 0)} mono />
        {order.paysWith != null && (
          <DetailRow label="Cliente paga efectivo con" value={soles(order.paysWith)} mono />
        )}
        {order.cashChange != null && order.cashChange > 0 && (
          <div className="mt-1 flex items-center justify-between rounded-lg bg-success-soft px-2.5 py-1.5">
            <span className="text-xs font-bold text-success">Vuelto (efectivo)</span>
            <span className="font-mono text-[15px] font-bold text-success">
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
      {qrUrl && (
        <div className="mt-2.5 rounded-[10px] bg-white p-2.5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="QR del restaurante"
            className="mx-auto h-20 w-20 rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  )
}
