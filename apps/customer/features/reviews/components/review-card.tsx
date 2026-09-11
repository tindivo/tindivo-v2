'use client'

import { useState } from 'react'
import { ReviewSheet } from '@/features/reviews/components/review-sheet'
import { Stars } from '@/features/reviews/components/stars'
import type { PendingReviewState } from '@/features/reviews/hooks/use-pending-review'

/**
 * Mismos cortes que `relativeDate` en `/pedidos` y `elapsedLabel` en
 * `ActiveOrderBanner`: no se comparte función porque cada una vive en un
 * contexto que no conoce a las otras dos, pero el TEXTO sí tiene que
 * coincidir en las tres.
 *
 * Hace falta calcularlo de verdad —y no dejar fijo «hace poco»— porque esta
 * tarjeta ya no vive solo en la espera de un pedido nuevo (brecha mediana de
 * 2 días, donde «hace poco» pasaba sin que nadie lo notara): desde que
 * también aparece en el inicio, el mismo pendiente puede seguir sin
 * responder hasta los 21 días de `windowDays`, y «hace poco» sería falso.
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
 * «¿Cómo estuvo tu pedido?», en las DOS redes que quedan tras la de salida
 * (`PostDeliveryExitLink`, en el tracking del pedido recién entregado):
 * mientras espera el siguiente pedido (`app/pedido/[shortId]/page.tsx`) y en
 * el inicio (`HomeShell`), para quien no calificó ni descartó en ninguna de
 * las dos anteriores. Mismo componente en las dos porque es el mismo
 * pendiente y la misma pregunta — solo cambia cuándo lo ve.
 *
 * EL MOMENTO, que es la razón de que exista la primera red. Preguntar al
 * entregar no funciona: el cliente cierra la app y se va a comer. La espera
 * del pedido siguiente es el rato en que mira la pantalla sin nada que hacer,
 * y funciona porque su gente vuelve pronto (brecha mediana de 2 días, medido
 * en prod). El inicio es la red de después: cubre a quien no vuelve a pedir
 * dentro de esa brecha, o cierra la app antes de que la tarjeta llegue a
 * pintarse.
 *
 * TARJETA EN LÍNEA, NO HOJA MODAL. En el tracking, ese instante ya lo ocupa la
 * hoja del permiso de avisos, que se abre a los 1,5 s y es operativa —si no se
 * pide ahora, ya no sirve para este pedido—. Una segunda modal encima se
 * descarta por reflejo y se lleva por delante a las dos.
 *
 * NO SE PINTA MIENTRAS HAYA ALGO QUE HACER. En el tracking lo decide la
 * página: con el plazo de cancelar corriendo o un prepago sin resolver, la
 * atención tiene dueño. En el inicio, `HomeShell` aplica la misma regla contra
 * un pedido activo.
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
