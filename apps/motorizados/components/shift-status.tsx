'use client'

import { ColorDot } from '@tindivo/ui'
import { useAvailability } from '@/hooks/use-availability'
import { usePushSubscription } from '@/hooks/use-push-subscription'

// ColorDot recibe un color, no clases, así que usamos los valores hex de los
// tokens definidos en packages/ui/src/theme.css.
const GREEN = '#16a34a'
const AMBER = '#f59e0b'
const GREY = '#a8a29e'

/**
 * El estado del turno, en el renglón fijo de la barra superior.
 *
 * DE DÓNDE VIENE. Esto vivía en `StatusIndicators`, dentro del scroll de la
 * home: se perdía al bajar por la bandeja, no existía en Efectivo ni en
 * Historial, y el hueco fijo de arriba lo ocupaba «TINDIVO / Motorizado» —
 * decirle en qué app está a quien ya la abrió desde su escritorio. Se
 * intercambian: la marca baja a un chip y el turno sube al renglón.
 *
 * SOLO LECTURA, igual que antes. El interruptor sigue viviendo en /perfil y en
 * un único sitio: tener el mismo toggle en dos pantallas obliga a mantener dos
 * versiones de la misma verdad. Ahora /perfil está a un toque en la barra
 * inferior, así que tampoco hace falta el «Actívalo en Perfil» que llevaba el
 * texto — la navegación ya la hace la barra.
 *
 * Mantiene la anatomía que `GlassTopBar` ya usaba (cejilla mono en versalitas
 * sobre una línea de 13px), así que la altura de la cabecera no se mueve.
 */
export function ShiftStatus({ name }: { name: string | null }) {
  const availability = useAvailability()
  const push = usePushSubscription()

  const firstName = name?.split(' ')[0] ?? null

  const state = availability.available
    ? { label: 'Disponible', color: GREEN, ink: 'text-success' }
    : availability.blocked
      ? { label: 'Fuera de horario', color: AMBER, ink: 'text-amber-800' }
      : { label: 'No disponible', color: GREY, ink: 'text-ink-muted' }

  // En un navegador sin soporte no hay nada que activar: el aviso solo sería
  // una promesa que el motorizado no puede cumplir.
  const showPush = push.status !== 'unsupported'
  const pushOn = push.status === 'subscribed'

  return (
    <div className="min-w-0">
      {availability.loading ? (
        // Placeholder de la cejilla, no de todo el bloque: el nombre ya se sabe
        // y esconderlo movería la línea de abajo al resolver.
        <div className="h-[13px] w-[92px] animate-pulse rounded bg-ink/[0.06]" />
      ) : (
        <div className="flex items-center gap-1.5">
          <ColorDot color={state.color} size={7} />
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${state.ink}`}
          >
            {state.label}
          </span>
        </div>
      )}
      <p className="mt-px max-w-[190px] truncate text-[13px] font-semibold text-ink">
        {firstName ?? 'Motorizado'}
        {showPush &&
          (pushOn ? (
            <span className="font-medium text-ink-muted"> · avisos activos</span>
          ) : (
            <span className="font-semibold text-danger"> · avisos apagados</span>
          ))}
      </p>
    </div>
  )
}
