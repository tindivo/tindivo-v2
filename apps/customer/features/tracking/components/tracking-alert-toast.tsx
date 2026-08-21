'use client'

import { Icon } from '@tindivo/ui'
import { useEffect } from 'react'
import type { TrackingAlert } from '@/features/tracking/lib/alerts'

interface TrackingAlertToastProps {
  alerta: TrackingAlert | null
  onClose: () => void
}

const ESTILO: Record<TrackingAlert['tone'], { fondo: string; icono: string }> = {
  good: { fondo: 'bg-ink text-white', icono: 'check_circle' },
  action: { fondo: 'bg-amber-500 text-white', icono: 'notifications_active' },
  bad: { fondo: 'bg-danger text-white', icono: 'error' },
}

/**
 * El aviso visual del cambio de estado.
 *
 * Va arriba y no abajo porque en el celular la mitad inferior de esta pantalla
 * la ocupa la acción del momento (subir el comprobante, escribir al motorizado),
 * y un toast encima de un botón que hay que pulsar es un obstáculo.
 *
 * `role="status"` y no `alert`: los lectores de pantalla lo anuncian al terminar
 * la frase en curso en vez de interrumpirla. Es el equivalente accesible de los
 * otros tres canales del aviso (sonido, vibración, título de la pestaña).
 *
 * Los de acción no se van solos. «Ya puedes pagar» y «el motorizado está en tu
 * puerta» piden que el cliente haga algo, y desvanecerlos a los cinco segundos
 * es perder justo el aviso que costaba más perder.
 */
export function TrackingAlertToast({ alerta, onClose }: TrackingAlertToastProps) {
  const tone = alerta?.tone
  useEffect(() => {
    if (!tone || tone === 'action') return
    const id = setTimeout(onClose, 5000)
    return () => clearTimeout(id)
  }, [tone, onClose])

  if (!alerta) return null
  const estilo = ESTILO[alerta.tone]

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-2 z-90 flex justify-center px-3"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-[420px] items-center gap-2.5 rounded-[16px] px-3.5 py-3 shadow-lg animate-[t-fade-in_220ms_ease] ${estilo.fondo}`}
      >
        <Icon name={estilo.icono} size={20} filled className="shrink-0" />
        <p className="flex-1 text-[13px] font-semibold leading-snug">{alerta.message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="-mr-1 shrink-0 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  )
}
