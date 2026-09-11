'use client'

import { BottomSheet, Button } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { ETIQUETA_NOTA, Stars } from '@/features/reviews/components/stars'
import type { PendingReview } from '@/features/reviews/lib/pending'

const MAX_COMENTARIO = 400

interface ReviewSheetProps {
  open: boolean
  pendiente: PendingReview
  /** La nota con la que se abrió: el toque en la tarjeta ya la eligió. */
  notaInicial: number
  enviando: boolean
  error: string | null
  onClose: () => void
  onSubmit: (rating: number, tags: string[], comment: string) => Promise<boolean>
}

/**
 * El detalle de la reseña. Todo lo de aquí es opcional menos la nota, que ya
 * viene puesta desde la tarjeta.
 *
 * LAS ETIQUETAS SON EL CAMPO QUE IMPORTA, no el comentario. Con una sola nota
 * —comida y entrega juntas—, la etiqueta es lo único que dice si fue la cocina
 * o la moto: «Llegó fría» y «Demoró» apuntan a sitios distintos y a personas
 * distintas. Un párrafo lo escribe uno de cada veinte y no se puede contar; un
 * chip lo toca la mayoría y se agrega solo.
 *
 * EL CATÁLOGO VIENE DE `app_settings`, no de este archivo. Se edita en vivo sin
 * desplegar, y por eso viaja dentro del pendiente (0216).
 *
 * EL COMENTARIO VA EL ÚLTIMO Y SIN PEDIRLO. Un campo de texto arriba convierte
 * la pregunta en un trámite; abajo y en gris, lo usa quien tiene algo que decir.
 */
export function ReviewSheet({
  open,
  pendiente,
  notaInicial,
  enviando,
  error,
  onClose,
  onSubmit,
}: ReviewSheetProps) {
  const [nota, setNota] = useState(notaInicial)
  const [tags, setTags] = useState<string[]>([])
  const [comentario, setComentario] = useState('')

  // La hoja no se desmonta al cerrarse, así que sin esto la segunda apertura
  // heredaría la nota de la primera.
  useEffect(() => {
    if (open) setNota(notaInicial)
  }, [open, notaInicial])

  const alternarTag = (id: string) =>
    setTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))

  const enviar = async () => {
    const ok = await onSubmit(nota, tags, comentario)
    if (ok) {
      setTags([])
      setComentario('')
      onClose()
    }
  }

  const titulo = `¿Cómo estuvo tu pedido de ${pendiente.businessName}?`

  return (
    <BottomSheet open={open} onClose={enviando ? undefined : onClose} label={titulo}>
      <div className="flex flex-col gap-5 px-5 pt-2 pb-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display font-bold text-[22px] leading-tight tracking-tight">
            {titulo}
          </h2>
          {/* Lo que frena a alguien de poner un 2 no es que el negocio vea su
              nota: es que lea su párrafo. Y no lo lee — lo impide un GRANT por
              columna, no este texto (0217). Decirlo así quita el frío donde
              estaba sin prometer un anonimato que no se puede sostener: el
              pedido lleva el teléfono del cliente y el negocio lo tiene
              delante. */}
          <p className="text-body text-ink-muted leading-relaxed">
            Tu nota la ve {pendiente.businessName}. Lo que escribas lo lee solo el equipo de
            Tindivo.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Stars value={nota} onChange={setNota} tamano="sheet" disabled={enviando} />
          <p className="font-semibold text-label text-ink-muted">{ETIQUETA_NOTA[nota]}</p>
        </div>

        {pendiente.tags.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <p className="font-semibold text-label text-ink-muted">¿Algo que destacar?</p>
            <div className="flex flex-wrap gap-2">
              {pendiente.tags.map((tag) => {
                const activo = tags.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={activo}
                    disabled={enviando}
                    onClick={() => alternarTag(tag.id)}
                    className={`h-10 rounded-[13px] border px-3.5 font-medium text-body transition-colors disabled:opacity-50 ${
                      activo
                        ? 'border-brand bg-brand/[0.1] text-brand-dark'
                        : 'border-border bg-card text-ink-muted'
                    }`}
                  >
                    {tag.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="review-comment" className="font-semibold text-label text-ink-muted">
            ¿Quieres contarnos algo más? <span className="font-normal">(opcional)</span>
          </label>
          <textarea
            id="review-comment"
            value={comentario}
            maxLength={MAX_COMENTARIO}
            disabled={enviando}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            className="resize-none rounded-[14px] border border-border bg-card p-3 text-body leading-relaxed outline-none placeholder:text-ink-muted focus:border-brand disabled:opacity-50"
            placeholder="Lo que quieras que sepan"
          />
        </div>

        {error && <p className="text-danger text-label leading-relaxed">{error}</p>}

        <Button size="lg" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
    </BottomSheet>
  )
}
