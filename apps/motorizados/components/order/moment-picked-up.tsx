'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import type { OrderDetailResponse } from '@/lib/types'
import { CollectCard } from './collect-card'
import { CustomerCard } from './customer-card'
import { DestinationCard } from './destination-card'
import { WhatsAppSheet } from './whatsapp-sheet'

/** Momento 3 (picked_up): destino + cliente + cobro. Online = mapa; manual = referencia. */
export function MomentPickedUp({
  detail,
  onReport,
  onNoShow,
  busy,
}: {
  detail: OrderDetailResponse
  onReport: () => void
  onNoShow: () => void
  busy?: boolean
}) {
  const { order } = detail

  const [now, setNow] = useState(() => Date.now())
  const [whatsappOpen, setWhatsappOpen] = useState(false)

  useEffect(() => {
    if (!order.arrivedAtCustomerAt) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [order.arrivedAtCustomerAt])

  const arrivedAt = order.arrivedAtCustomerAt ? Date.parse(order.arrivedAtCustomerAt) : null
  const noShowDurationMs = 5 * 60 * 1000
  const remainingMs = arrivedAt ? Math.max(0, arrivedAt + noShowDurationMs - now) : 0
  const remainingSec = Math.ceil(remainingMs / 1000)
  const minLeft = Math.floor(remainingSec / 60)
  const secLeft = remainingSec % 60
  const countdownFormatted = `${minLeft}:${secLeft.toString().padStart(2, '0')}`
  const canNoShow = arrivedAt != null && remainingMs === 0

  return (
    <div>
      <CustomerCard order={order} onWhatsApp={() => setWhatsappOpen(true)} />

      {whatsappOpen && <WhatsAppSheet detail={detail} onClose={() => setWhatsappOpen(false)} />}

      {/* ÁMBAR OSCURO SOBRE ÁMBAR CLARO, no `text-warning`. */}
      {order.arrivedAtCustomerAt && (
        <Card className="mt-3 border-warning/30 bg-warning-soft p-4 shadow-none">
          <div className="flex items-center gap-2 font-semibold text-body text-amber-900">
            <Icon name="person_pin_circle" size={20} filled />
            Llegada registrada al domicilio
          </div>
          <p className="mt-1 text-caption text-amber-900/85">
            {canNoShow
              ? 'Se ha cumplido la ventana de espera de 5 minutos.'
              : `Esperando respuesta del cliente (${countdownFormatted} restante).`}
          </p>

          <Button
            size="sm"
            variant="ghost"
            disabled={!canNoShow || busy}
            onClick={onNoShow}
            className="mt-3 w-full border border-amber-900/25 bg-white/60 text-amber-900 hover:bg-white disabled:opacity-100 disabled:text-amber-900/70"
          >
            <Icon name={canNoShow ? 'person_off' : 'schedule'} size={18} />
            {canNoShow ? (
              'Reportar que no apareció'
            ) : (
              <>
                Cliente no responde{' '}
                <span className="font-mono tabular-nums">{countdownFormatted}</span>
              </>
            )}
          </Button>
        </Card>
      )}

      {/* Tarjeta de Ubicación de entrega unificada */}
      <DestinationCard detail={detail} />

      <div className="mt-3.5">
        <CollectCard detail={detail} />
      </div>

      {/* EN GRIS, NO EN ROJO. Es una salida de emergencia que casi nunca se
          usa; en rojo era una alarma permanente al pie de una pantalla que
          termina bien el 99% de las veces, y compite con el rojo que sí
          significa algo (el reloj pasado, el no-show armado). */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReport}
        className="mt-4 w-full text-ink-muted"
      >
        <Icon name="flag" size={18} />
        Reportar un problema
      </Button>
    </div>
  )
}
