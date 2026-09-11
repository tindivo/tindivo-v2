'use client'

import { type PerformanceTonight, plural, soles } from '@tindivo/core'
import { Card, Icon } from '@tindivo/ui'

/**
 * La jornada en curso, fuera de todas las medias.
 *
 * Existe por lo que la 0222 sacó del rango. Los rangos móviles del panel ahora
 * terminan AYER, porque incluir una noche que aún no ha pasado metía un −1/N
 * estructural en cada comparación — en prod le pintaba una flecha roja de
 * −3.3% al local que en realidad había subido un 11% por noche.
 *
 * Pero sacarla del promedio no puede significar que el dueño deje de verla: es
 * justamente lo que más mira. Va aquí, sola, con su propio rótulo y sin
 * porcentajes, porque una noche a medias no se compara con noches cerradas.
 *
 * EL ICONO SALE DE `icons.txt`. La fuente de negocios es un SUBCONJUNTO
 * auto-hospedado, así que un nombre que no esté en esa lista no tiene ligadura
 * y se lee como texto en pantalla — `bedtime`, que era el natural aquí, salía
 * como una «T» suelta. `schedule` ya está en el subset y dice lo mismo: algo en
 * curso, todavía sin cerrar.
 *
 * Se oculta cuando la noche está vacía Y el rango ya la incluye (el dueño eligió
 * un rango a mano que la contiene, así que repetirla sería contarla dos veces a
 * ojos de quien lee).
 */
export function TonightCard({ tonight }: { tonight: PerformanceTonight }) {
  const vacia = tonight.orders === 0 && tonight.active === 0
  if (vacia || tonight.inRange) return null

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5 sm:p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
        <Icon name="schedule" size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          Esta noche · va aparte
        </p>
        <p className="text-[13px] text-ink">
          {tonight.orders > 0 ? (
            <>
              <strong>{tonight.orders}</strong>{' '}
              {plural(tonight.orders, 'pedido entregado', 'pedidos entregados')} ·{' '}
              <strong>{soles(tonight.revenue)}</strong>
            </>
          ) : (
            'Todavía sin pedidos entregados'
          )}
          {tonight.active > 0 && (
            <>
              {' · '}
              <strong className="text-brand">{tonight.active} en curso</strong>
            </>
          )}
        </p>
      </div>
      <p className="w-full text-[11px] text-ink-muted sm:ml-auto sm:w-auto sm:max-w-[46%] sm:text-right">
        La noche no ha terminado, así que no entra en los promedios de arriba.
      </p>
    </Card>
  )
}
