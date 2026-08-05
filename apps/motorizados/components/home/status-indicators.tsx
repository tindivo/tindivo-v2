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
 * Estado de disponibilidad y de avisos, SOLO lectura.
 *
 * Sustituye a la tarjeta que antes también servía de interruptor. Las dos
 * cosas se cambian ahora en /perfil y en un único sitio: tener el mismo toggle
 * en dos pantallas obliga a mantener dos versiones de la misma verdad, y en la
 * home el motorizado viene a mirar pedidos, no a configurarse.
 *
 * El "Actívalo en Perfil" es texto plano a propósito: la navegación ya la hace
 * la barra inferior, y un enlace aquí compite con ella.
 */
export function StatusIndicators() {
  const availability = useAvailability()
  const push = usePushSubscription()

  // Misma altura que la fila real: sin esto la lista de pedidos da un salto al
  // resolver la primera carga.
  if (availability.loading) {
    return <div className="mb-4 h-[20px] animate-pulse rounded-lg bg-surface-low" />
  }

  const availLabel = availability.available
    ? 'Disponible'
    : availability.blocked
      ? 'Fuera de horario'
      : 'No disponible · Actívalo en Perfil'
  const availColor = availability.available ? GREEN : availability.blocked ? AMBER : GREY

  const pushSubscribed = push.status === 'subscribed'
  // En un navegador sin soporte no hay nada que activar: el indicador solo
  // sería una promesa que el motorizado no puede cumplir.
  const showPush = push.status !== 'unsupported'

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-ink-subtle">
      <span className="flex items-center gap-1.5">
        <ColorDot color={availColor} size={7} />
        <span className={availability.available ? 'font-medium text-ink-muted' : undefined}>
          {availLabel}
        </span>
      </span>

      {showPush && (
        <span className="flex items-center gap-1.5">
          <ColorDot color={pushSubscribed ? GREEN : GREY} size={7} />
          <span className={pushSubscribed ? 'font-medium text-ink-muted' : undefined}>
            {pushSubscribed ? 'Avisos activos' : 'Avisos apagados · Actívalos en Perfil'}
          </span>
        </span>
      )}
    </div>
  )
}
