'use client'

import { Button, Icon } from '@tindivo/ui'
import type { Tracking } from '@/features/tracking/types'

interface TrackingDriverProps {
  data: Tracking
  /** `true` desde que el pedido sale del local. Antes el motorizado no es asunto del cliente. */
  enRuta: boolean
}

function inicial(nombre: string): string {
  return nombre.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Quién trae el pedido. **Solo el nombre.**
 *
 * Antes era una fila más dentro de la tarjeta de "Detalle", encajada entre el
 * vuelto y el total: la única información sobre una persona, formateada igual
 * que un importe. Aquí tiene su propio sitio y aparece cuando empieza a
 * importar, que es cuando el pedido ya salió.
 *
 * No se enseña placa, ni foto, ni teléfono. El teléfono lo decide `get_tracking`,
 * que solo lo publica cuando `arrived_at_customer_at` está puesto — el motorizado
 * en la puerta sin encontrar al cliente es el único caso en que hace falta, y
 * mantenerlo cerrado el resto del tiempo evita que un enlace de seguimiento
 * reenviado por WhatsApp reparta el número de un trabajador.
 */
export function TrackingDriver({ data, enRuta }: TrackingDriverProps) {
  const llego = Boolean(data.arrivedAtCustomerAt) && data.status !== 'delivered'
  if (!data.driverName || (!enRuta && !llego)) return null

  const whatsapp = data.driverPhone
    ? `https://wa.me/${data.driverPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hola, te escribo por mi pedido de ${data.businessName} (#${data.shortId}). Estás en mi domicilio.`,
      )}`
    : null

  return (
    <div
      className={`mt-3.5 rounded-[22px] border px-[18px] py-4 ${
        llego ? 'border-amber-200 bg-amber-50' : 'border-ink/[0.04] bg-card shadow-elev-1'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-bold ${
            llego ? 'bg-amber-500 text-white' : 'bg-brand-soft text-brand-dark'
          }`}
          aria-hidden="true"
        >
          {inicial(data.driverName)}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
              llego ? 'text-amber-700' : 'text-ink-subtle'
            }`}
          >
            Tu motorizado
          </div>
          <div className="truncate font-display text-[17px] font-bold tracking-tight text-ink">
            {data.driverName}
          </div>
        </div>
        {!llego && (
          <Icon name="sports_motorsports" size={22} className="shrink-0 text-ink-subtle" />
        )}
      </div>

      {llego && (
        <div className="mt-3 border-amber-200 border-t pt-3">
          <p className="text-[13px] leading-relaxed text-amber-900">
            <strong>Ya está en tu domicilio</strong> y no logra ubicarte.
          </p>
          {whatsapp && (
            <Button
              size="sm"
              as="a"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              // Sin `bg-emerald-*`: el `Button` gana con su variante y esas
              // clases nunca llegaron a pintar nada. Se quitan en vez de
              // dejarlas mintiendo sobre el color del botón.
              className="mt-2.5 w-full"
            >
              <Icon name="chat" size={18} />
              Escribirle por WhatsApp
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
