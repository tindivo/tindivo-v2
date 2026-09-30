'use client'

import type { CourierStatus } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useActiveCourierOrders } from '@/lib/active-courier-orders'
import { useCourierStatus } from '../hooks/use-courier-status'
import { formatCourierPrice } from '../lib/format'
import { openCourierFlow } from '../lib/open-flow'
import { useCourierStore } from '../lib/store'

function statusLine(status: CourierStatus, originName: string, driverName: string | null): string {
  if (status === 'requested') return 'Buscando un motorizado…'
  if (!driverName) return `Confirmado — recogiendo en ${originName}`
  if (status === 'accepted' || status === 'heading_to_pickup') {
    return `${driverName} va a recoger en ${originName}`
  }
  if (status === 'at_pickup') return `${driverName} está en ${originName}`
  if (status === 'picked_up' || status === 'heading_to_dropoff') {
    return `${driverName} va en camino`
  }
  return 'Entrega en curso'
}

/**
 * Tarjeta de entrada a Tindivo Entregas en el home del cliente — inserción
 * puntual (patrón `active-order-banner.tsx`), sin tocar el resto de
 * `home-shell.tsx`. Se oculta si el servicio está apagado por completo
 * (`app_settings.courier.enabled = false`): mientras Jesús no lo encienda
 * para el piloto, no hay nada que anunciar.
 *
 * Con una entrega activa cambia de "promo" a "en curso" (patrón
 * `Home.dc.html` del diseño, tarjeta "Entrega en curso"): no es rediseñar el
 * home, es la misma inserción puntual reflejando el estado real.
 */
export function CourierEntryBanner() {
  const { status, loading } = useCourierStatus()
  const openTracking = useCourierStore((s) => s.openTracking)
  const activeCourierOrders = useActiveCourierOrders()
  const active = activeCourierOrders[0]

  if (loading || (!status.enabled && !active)) return null

  /*
   * Encendido pero cerrado ahora mismo (fuera de horario, pausado a mano, o
   * sin motorizado — el status público no distingue cuál, a propósito: son
   * detalles operativos, no algo que el cliente necesite saber). Antes esta
   * tarjeta se mostraba igual de "activa" que con el servicio abierto, y el
   * único aviso llegaba al final del formulario completo (`courierErrorDetail`
   * en la API). Esto lo dice ANTES de que alguien lo llene.
   */
  if (!active && status.enabled && !status.openNow) {
    return (
      <div className="relative flex h-[124px] w-full flex-col justify-between overflow-hidden rounded-[24px] bg-[#F4F4F2] p-4 text-left">
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-[#E8E9EB]" />
        <div className="pointer-events-none absolute right-1.5 bottom-1.5">
          <Icon name="two_wheeler" size={64} filled className="text-[#9AA0A6]" />
        </div>
        <div className="relative">
          <div className="text-[19px] font-extrabold tracking-[-0.02em] text-[#5C6368]">
            Tindivo Entregas
          </div>
          <div className="mt-1 text-[13px] font-medium leading-tight text-[#5C6368]">
            {status.pausedMessage ?? 'Atendemos de 6 a 11 pm, todos los días.'}
          </div>
        </div>
      </div>
    )
  }

  if (active) {
    return (
      <button
        type="button"
        onClick={() => openTracking(active.shortId)}
        className="flex w-full items-center gap-3 rounded-[20px] bg-white p-2.5 pr-4 shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-brand shadow-[inset_0_1px_0_rgba(255,255,255,.22)]">
          <Icon name="two_wheeler" size={25} filled className="text-white" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[16px] font-extrabold tracking-[-0.01em] text-[#2E3236]">
            Entrega en curso
          </div>
          <div className="mt-0.5 truncate text-[13px] font-medium text-[#5C6368]">
            {statusLine(active.status, active.originName, active.driverName)}
          </div>
        </div>
        <Icon name="chevron_right" size={24} className="text-brand-dark" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void openCourierFlow()}
      className="relative flex h-[124px] w-full flex-col justify-between overflow-hidden rounded-[24px] bg-[#FFF7ED] p-4 text-left shadow-[inset_0_0_0_1.5px_#FED7AA]"
    >
      <div className="pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-[#FFEDD5]" />
      <div className="pointer-events-none absolute right-1.5 bottom-1.5">
        <Icon name="two_wheeler" size={64} filled className="text-brand" />
      </div>
      <div className="relative">
        <div className="text-[19px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
          Tindivo Entregas
        </div>
        <div className="mt-1 text-[13px] font-medium leading-tight text-[#5C6368]">
          Recogemos lo que ya pagaste y lo llevamos
        </div>
      </div>
      <div className="relative self-start rounded-full bg-brand-dark px-3.5 py-1.5 text-[13px] font-extrabold text-white">
        Desde {formatCourierPrice(status.price)}
      </div>
    </button>
  )
}
