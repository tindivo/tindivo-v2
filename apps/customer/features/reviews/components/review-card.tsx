'use client'

import { useState } from 'react'
import { ReviewSheet } from '@/features/reviews/components/review-sheet'
import { Stars } from '@/features/reviews/components/stars'
import type { PendingReviewState } from '@/features/reviews/hooks/use-pending-review'

/**
 * «¿Cómo estuvo tu pedido anterior?», mientras espera el de ahora.
 *
 * EL MOMENTO, que es la razón de que esto exista. Preguntar al entregar no
 * funciona: el cliente cierra la app y se va a comer. Se pregunta la siguiente
 * vez que pide, en la espera, que es el único rato en que mira la pantalla sin
 * tener nada que hacer. Y funciona porque su gente vuelve pronto: la brecha
 * entre pedidos del mismo cliente es de 2 días en mediana (medido en prod), así
 * que se acuerda perfectamente de cómo estuvo.
 *
 * TARJETA EN LÍNEA, NO HOJA MODAL. Ese instante ya lo ocupa la hoja del permiso
 * de avisos, que se abre a los 1,5 s y es operativa —si no se pide ahora, ya no
 * sirve para este pedido—. Una segunda modal encima se descarta por reflejo y
 * se lleva por delante a las dos. La tarjeta no interrumpe, y en una espera de
 * treinta minutos eso le basta: sigue ahí cuando el cliente baja la vista.
 *
 * NO SE PINTA MIENTRAS HAYA ALGO QUE HACER. Lo decide la página (ver
 * `app/pedido/[shortId]/page.tsx`): con el plazo de cancelar corriendo o un
 * prepago sin resolver, la atención tiene dueño.
 */
export function ReviewCard({ estado }: { estado: PendingReviewState }) {
  const [nota, setNota] = useState(0)
  const [abierta, setAbierta] = useState(false)

  if (!estado.pendiente) return null
  const { pendiente } = estado

  // El toque en la estrella ya es la respuesta: elige la nota y abre la hoja con
  // ella puesta. Empezar contestado es la diferencia entre una reseña y un
  // formulario.
  const elegir = (n: number) => {
    setNota(n)
    setAbierta(true)
  }

  return (
    <>
      <div className="mt-3 flex flex-col gap-3.5 rounded-[18px] border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          {pendiente.businessLogoUrl ? (
            <img
              src={pendiente.businessLogoUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[13px] object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-surface-low font-display font-bold text-[22px] text-ink-muted leading-none">
              {pendiente.businessName.charAt(0)}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-display font-bold text-lead leading-tight tracking-tight">
              ¿Cómo estuvo tu pedido?
            </p>
            <p className="truncate text-label text-ink-muted leading-relaxed">
              {pendiente.businessName} · lo recibiste hace poco
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

      <ReviewSheet
        open={abierta}
        pendiente={pendiente}
        notaInicial={nota === 0 ? 5 : nota}
        enviando={estado.enviando}
        error={estado.error}
        onClose={() => setAbierta(false)}
        onSubmit={estado.enviar}
      />
    </>
  )
}
