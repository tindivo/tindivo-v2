'use client'

import { BottomSheet } from '@tindivo/ui'
import { useState } from 'react'
import { ReviewSheet } from '@/features/reviews/components/review-sheet'
import { Stars } from '@/features/reviews/components/stars'
import type { PendingReviewState } from '@/features/reviews/hooks/use-pending-review'

/**
 * Mismos cortes que `relativeDate` en `/pedidos`: no se comparte función
 * porque cada una vive en un contexto que no conoce a la otra, pero el TEXTO
 * sí tiene que coincidir.
 */
function relativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}

/**
 * «¿Cómo estuvo tu pedido?», como POPUP, en la red de después: el inicio.
 *
 * Vivía embebida en dos sitios — aquí y en el tracking del pedido SIGUIENTE,
 * mientras ese esperaba. Esa segunda ubicación se quitó: el cliente mira el
 * seguimiento en vivo de un pedido nuevo (a veces de OTRO negocio) y ahí en
 * medio aparecía una tarjeta pidiendo calificar uno viejo — dos pedidos
 * mezclados en la misma pantalla, y con razón se leía como un error. La
 * pregunta por el pedido de ayer ahora solo vive donde no compite con un
 * pedido de hoy: el instante en que se entrega (`PostDeliveryExitLink`) y,
 * si ahí no se contestó, aquí en el inicio.
 *
 * POPUP Y NO TARJETA EN LÍNEA, a propósito: es el mismo patrón que usan las
 * plataformas grandes (Rappi, Uber Eats) y el que pidió el propio piloto —
 * una pregunta puntual que se puede descartar, no un bloque que se queda
 * ocupando la pantalla de inicio.
 *
 * NO SE PINTA MIENTRAS HAYA UN PEDIDO ACTIVO. Lo decide `HomeShell`: con algo
 * en curso, la atención tiene dueño.
 */
export function ReviewCard({ estado }: { estado: PendingReviewState }) {
  const [nota, setNota] = useState(0)
  const [detalleAbierto, setDetalleAbierto] = useState(false)

  if (!estado.pendiente) return null
  const { pendiente } = estado

  // El toque en la estrella ya es la respuesta: elige la nota y abre la hoja con
  // ella puesta. Empezar contestado es la diferencia entre una reseña y un
  // formulario.
  const elegir = (n: number) => {
    setNota(n)
    setDetalleAbierto(true)
  }

  return (
    <>
      {/* Cerrar el popup —tocar fuera, la X, «Ahora no»— es la misma respuesta:
          «ahora no». Volver a abrir el detalle no vuelve a mostrarlo encima. */}
      <BottomSheet
        open={!detalleAbierto}
        onClose={() => void estado.descartar()}
        label={`¿Cómo estuvo tu pedido de ${pendiente.businessName}?`}
      >
        <div className="flex flex-col gap-4 px-5 pt-2 pb-6">
          <div className="flex items-center gap-3">
            {pendiente.businessLogoUrl ? (
              <img
                src={pendiente.businessLogoUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-[14px] object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-low font-display font-bold text-[24px] text-ink-muted leading-none">
                {pendiente.businessName.charAt(0)}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-display font-bold text-lead leading-tight tracking-tight">
                ¿Cómo estuvo tu pedido?
              </p>
              <p className="truncate text-label text-ink-muted leading-relaxed">
                {pendiente.businessName} · {relativo(pendiente.deliveredAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Stars value={nota} onChange={elegir} />
            <button
              type="button"
              onClick={() => void estado.descartar()}
              className="shrink-0 font-medium text-ink-muted text-label underline-offset-2 hover:underline"
            >
              Ahora no
            </button>
          </div>
        </div>
      </BottomSheet>

      <ReviewSheet
        open={detalleAbierto}
        pendiente={pendiente}
        notaInicial={nota === 0 ? 5 : nota}
        enviando={estado.enviando}
        error={estado.error}
        onClose={() => setDetalleAbierto(false)}
        onSubmit={estado.enviar}
      />
    </>
  )
}
