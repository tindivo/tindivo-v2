'use client'

import { Card, Icon } from '@tindivo/ui'
import type { ReviewsSummary as Resumen } from '../hooks/use-reviews'

/** Por debajo de esto el promedio es anécdota, y decirlo es parte del panel. */
const MINIMO_PARA_LEER = 5

/**
 * Cómo te calificaron tus clientes, en el mismo rango que el resto del panel.
 *
 * LAS ETIQUETAS PESAN MÁS QUE LA NOTA, y el orden de la tarjeta lo dice. La
 * nota es una sola —comida y entrega juntas—, así que por sí sola no señala a
 * nadie: un 2 puede ser una cocina lenta o una moto que tardó. «Demoró ×4» sí
 * es accionable, y es lo único que distingue un problema tuyo de uno nuestro.
 *
 * EL COMENTARIO NO ESTÁ AQUÍ, Y NO ES UN OLVIDO. Al cliente se le promete que
 * lo que escriba lo lee solo el equipo de Tindivo, y eso lo hace cumplir un
 * GRANT por columna (0217): pedir `comment` desde aquí no devolvería el texto,
 * devolvería un error. Si alguna vez se abre, se abre en una migración que
 * explique por qué.
 *
 * CON POCAS RESEÑAS SE DICE QUE SON POCAS. Un 3.0 de dos reseñas pintado igual
 * que un 3.0 de cuarenta invita a tomar decisiones sobre ruido.
 */
export function ReviewsSummaryCard({ data, loading }: { data: Resumen | null; loading: boolean }) {
  if (loading && !data) {
    return <Card className="h-56 animate-pulse p-4 sm:p-5" />
  }
  if (!data) return null

  const { total, promedio, reparto, etiquetas } = data
  const maxEtiqueta = etiquetas[0]?.veces ?? 0

  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-soft text-warning">
          <Icon name="star" size={18} />
        </span>
        <div>
          <h3 className="font-bold text-ink text-sm">Cómo te calificaron</h3>
          <p className="text-ink-muted text-xs">Lo que dijeron tus clientes del periodo</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-col gap-2 py-6 text-center">
          <p className="text-ink-muted text-xs">Nadie ha calificado en este rango.</p>
          <p className="text-[11px] text-ink-subtle leading-relaxed">
            Se le pregunta al cliente la siguiente vez que pide, y solo a quien tiene cuenta en la
            app. Tarda en llenarse.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-bold text-[26px] text-ink leading-none tracking-tight tabular-nums">
              {promedio.toFixed(1)}
            </span>
            <span className="text-ink-muted text-xs">
              de 5 · {total} {total === 1 ? 'reseña' : 'reseñas'}
            </span>
          </div>

          {/* El reparto, de 5 a 1. Con una sola nota, ver dónde se acumulan las
              bajas dice más que el promedio: cuatro cincos y un uno da 4.2 y no
              es lo mismo que cinco cuatros. */}
          <div className="mt-3 flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((nota) => {
              const veces = reparto[nota - 1] ?? 0
              const pct = total > 0 ? (veces / total) * 100 : 0
              return (
                <div key={nota} className="flex items-center gap-2 text-xs">
                  <span className="w-6 shrink-0 font-mono text-ink-muted tabular-nums">
                    {nota}★
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <span
                      className="block h-full rounded-full bg-brand-dark"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right font-mono font-bold text-ink tabular-nums">
                    {veces}
                  </span>
                </div>
              )
            })}
          </div>

          {etiquetas.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5">
              <p className="font-semibold text-[11px] text-ink-muted uppercase tracking-wide">
                Lo que más marcaron
              </p>
              {etiquetas.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-ink">{tag.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-16 overflow-hidden rounded-full bg-surface">
                      <span
                        className="block h-full rounded-full bg-ink-subtle"
                        style={{
                          width: `${maxEtiqueta > 0 ? (tag.veces / maxEtiqueta) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className="w-5 text-right font-mono font-bold text-ink tabular-nums">
                      {tag.veces}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 rounded-lg bg-surface p-2.5 text-[11px] text-ink-muted">
            {total < MINIMO_PARA_LEER ? (
              <>
                Son <strong className="text-ink">pocas todavía</strong>. Con menos de{' '}
                {MINIMO_PARA_LEER} el promedio se mueve con cada una: mira las etiquetas, no el
                número.
              </>
            ) : promedio >= 4.5 ? (
              <>
                Vas <strong className="text-ink">muy bien</strong>. Lo que aparezca en las etiquetas
                es lo único que te queda por afinar.
              </>
            ) : promedio >= 3.5 ? (
              <>
                Estás <strong className="text-ink">bien</strong>, con algo que corregir. La etiqueta
                de arriba te dice por dónde empezar.
              </>
            ) : (
              <>
                Algo se está repitiendo. Mira la etiqueta de arriba:{' '}
                <strong className="text-ink">{etiquetas[0]?.label ?? 'las notas bajas'}</strong> es
                lo que más marcaron.
              </>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
