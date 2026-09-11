'use client'

import { Card, Icon } from '@tindivo/ui'
import type { ReviewRow } from '../hooks/use-reviews-list'

/** El día y la hora, que es como la cajera ubica una noche. */
function cuando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Estrellas({ nota }: { nota: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-0.5"
      role="img"
      aria-label={`${nota} de 5 estrellas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          size={15}
          filled={n <= nota}
          className={n <= nota ? 'text-warning' : 'text-border'}
        />
      ))}
    </span>
  )
}

/**
 * Una reseña por fila, la más reciente arriba.
 *
 * LAS BAJAS SE MARCAN, y no por dramatismo: en una lista de cincuenta filas de
 * estrellas todas se ven igual, y la que hay que mirar es la de 2. El borde de
 * color hace que se encuentre sin leerlas todas.
 *
 * La nota va con el NÚMERO DE PEDIDO y la hora, no con el nombre del cliente:
 * eso es lo que convierte «un 2» en «la noche que se cayó la moto». El detalle
 * de por qué, en `use-reviews-list.ts`.
 */
export function ReviewsList({
  rows,
  loading,
  etiquetas,
}: {
  rows: ReviewRow[]
  loading: boolean
  /** id → nombre, del catálogo de `app_settings`. */
  etiquetas: Map<string, string>
}) {
  if (loading && rows.length === 0) {
    return <Card className="h-64 animate-pulse p-4 sm:p-5" />
  }

  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink/[0.06] text-ink">
          <Icon name="format_list_bulleted" size={18} />
        </span>
        <div>
          <h3 className="font-bold text-ink text-sm">Una por una</h3>
          <p className="text-ink-muted text-xs">Con su pedido, para ubicar la noche</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-ink-muted text-xs">Sin reseñas en este rango.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((r) => {
            const baja = r.rating <= 2
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-xl border-l-[3px] bg-surface p-3 ${
                  baja ? 'border-l-danger' : 'border-l-transparent'
                }`}
              >
                <Estrellas nota={r.rating} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-subtle">
                    <span className="font-mono">#{r.shortId ?? '????????'}</span>
                    <span>·</span>
                    <span>{cuando(r.deliveredAt ?? r.createdAt)}</span>
                  </div>
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[11px] text-ink-muted"
                        >
                          {etiquetas.get(tag) ?? tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Se dice una vez, aquí abajo, y no en cada fila: si el comentario no se
          ve, la cajera va a suponer que nadie escribe. Escriben — lo lee un
          humano de Tindivo, y por eso escriben. */}
      <p className="mt-4 rounded-lg bg-surface p-2.5 text-[11px] text-ink-muted leading-relaxed">
        Si alguien escribe un comentario, lo lee el equipo de Tindivo y te avisamos si hay algo que
        resolver. Aquí ves la nota y las etiquetas.
      </p>
    </Card>
  )
}
