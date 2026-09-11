'use client'

import {
  fmtOrders,
  type GoalState,
  type PerformanceGoal,
  type PerformanceTown,
  plural,
} from '@tindivo/core'
import { Card } from '@tindivo/ui'

/**
 * La meta del periodo, y la referencia del pueblo debajo.
 *
 * LA META ES SU PROPIO RÉCORD, no una cifra puesta por Tindivo. Es la única
 * vara que se puede defender delante del dueño: ya la consiguió una vez, con su
 * local, su carta y su pueblo. Un objetivo inventado por la plataforma no
 * significa nada para él, y el día que no lo alcance esta pantalla pasa a ser
 * algo que evita abrir.
 *
 * BARRA Y NO ANILLO. En el teléfono, a la hora a la que se mira esto, una barra
 * se lee de un vistazo y de izquierda a derecha; un anillo obliga a interpretar
 * un ángulo. Y la barra deja sitio para lo que de verdad mueve: «te faltan 3».
 */
const STATE: Record<GoalState, { emoji: string; fill: string; track: string; label: string }> = {
  record: {
    emoji: '🏆',
    fill: 'bg-success',
    track: 'bg-success/15',
    label: 'Récord batido',
  },
  tied: { emoji: '🎯', fill: 'bg-success', track: 'bg-success/15', label: 'Récord igualado' },
  close: { emoji: '🔥', fill: 'bg-brand', track: 'bg-brand/15', label: 'A un paso' },
  onTrack: { emoji: '💪', fill: 'bg-brand', track: 'bg-brand/12', label: 'En camino' },
  behind: { emoji: '🌱', fill: 'bg-warning', track: 'bg-warning/20', label: 'Hay margen' },
  noBaseline: { emoji: '🌱', fill: 'bg-brand', track: 'bg-brand/12', label: 'Sin marca aún' },
}

export function GoalCard({
  goal,
  town,
  days,
  ordersPerNight,
  nights,
}: {
  goal: PerformanceGoal
  town: PerformanceTown
  days: number
  /** Pedidos entregados del periodo, para la comparación con el pueblo. */
  ordersPerNight: number
  nights: number
}) {
  const s = STATE[goal.state]

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg leading-none">
          🎯
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink">Tu meta de {days} días</h3>
          <p className="text-xs text-ink-muted">Tu propio récord, no el de nadie más</p>
        </div>
      </div>

      {goal.state === 'noBaseline' ? (
        <p className="mt-4 rounded-xl bg-surface p-3 text-xs leading-relaxed text-ink-muted">
          Todavía no tienes una racha de {days} días completa con la que compararte. En cuanto
          acumules un poco más de historial aparece aquí tu mejor marca y cuánto te falta para
          batirla.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[30px] font-bold leading-none tracking-tight text-ink">
              {goal.orders}
            </span>
            <span className="text-sm text-ink-muted">
              de {goal.target} {plural(goal.target, 'pedido', 'pedidos')}
            </span>
            <span
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.track} text-ink`}
            >
              <span aria-hidden>{s.emoji}</span>
              {s.label}
            </span>
          </div>

          <div
            className={`mt-3 h-2.5 w-full overflow-hidden rounded-full ${s.track}`}
            role="progressbar"
            aria-valuenow={Math.round(goal.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goal.orders} de ${goal.target} pedidos`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${s.fill}`}
              style={{ width: `${Math.max(2, goal.progress * 100)}%` }}
            />
          </div>

          <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
            {goal.missing > 0 ? (
              <>
                Te faltan{' '}
                <strong className="text-ink">
                  {goal.missing} {plural(goal.missing, 'pedido', 'pedidos')}
                </strong>{' '}
                para igualar tu mejor racha ({goal.target} del {goal.window?.start} al{' '}
                {goal.window?.end}).
              </>
            ) : (
              <>
                Tu mejor marca anterior eran{' '}
                <strong className="text-ink">{goal.target} pedidos</strong> ({goal.window?.start} al{' '}
                {goal.window?.end}). Esta vez la {goal.state === 'record' ? 'pasaste' : 'igualaste'}
                .
              </>
            )}
          </p>
        </>
      )}

      <TownRow town={town} mine={ordersPerNight} nights={nights} />
    </Card>
  )
}

/**
 * La referencia del pueblo, agregada y sin nombres.
 *
 * Se calla con menos de tres locales activos: con dos, «la mediana de San
 * Jacinto» ES la caja del vecino con otro nombre, y eso no se enseña. También
 * se calla si el negocio no trabajó ninguna noche, porque entonces su propia
 * cifra no existe y la comparación sería contra cero.
 *
 * Y se enseña con la barra del pueblo SIEMPRE debajo de la propia, gane quien
 * gane: es una referencia, no un marcador. Al que va por debajo se le dice
 * dónde está el techo del pueblo, que es una noticia buena disfrazada de mala
 * — significa que esa demanda ya existe y no hay que crearla.
 */
function TownRow({ town, mine, nights }: { town: PerformanceTown; mine: number; nights: number }) {
  if (town.businesses < 3 || town.ordersPerNight <= 0 || nights === 0) return null

  const techo = Math.max(mine, town.ordersPerNight)
  const mio = Math.max(2, (mine / techo) * 100)
  const pueblo = Math.max(2, (town.ordersPerNight / techo) * 100)
  const porEncima = mine >= town.ordersPerNight

  return (
    <div className="mt-4 border-t border-ink/[0.06] pt-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        Pedidos por noche en San Jacinto
      </p>
      <div className="mt-2.5 flex flex-col gap-2">
        <Bar label="Tu local" value={mine} width={mio} fill="bg-brand" strong />
        <Bar
          label="El local típico del pueblo"
          value={town.ordersPerNight}
          width={pueblo}
          fill="bg-ink/25"
        />
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-muted">
        {porEncima
          ? 'Estás por encima del local típico del pueblo. Bien ahí.'
          : 'Esa demanda ya existe en el pueblo: es un techo real, no una cifra inventada.'}
      </p>
    </div>
  )
}

function Bar({
  label,
  value,
  width,
  fill,
  strong,
}: {
  label: string
  value: number
  width: number
  fill: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`w-[42%] shrink-0 truncate text-[11px] ${strong ? 'font-bold text-ink' : 'text-ink-muted'}`}
      >
        {label}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
        <span className={`block h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
      </span>
      <span
        className={`w-9 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums ${strong ? 'text-ink' : 'text-ink-muted'}`}
      >
        {fmtOrders(value)}
      </span>
    </div>
  )
}
