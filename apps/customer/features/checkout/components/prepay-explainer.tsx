import { Icon } from '@tindivo/ui'
import { useId, useState } from 'react'
import type { PrepayTimers } from '@/features/checkout/types'

interface PrepayExplainerProps {
  timers: PrepayTimers
}

/**
 * Cómo funciona el pago adelantado — para quien quiera saberlo.
 *
 * QUÉ HACE Y QUÉ NO
 *   NO carga con el mensaje importante. La única frase que el cliente tiene que
 *   leer sí o sí —«No pagas nada ahora»— vive DENTRO de la opción marcada, en
 *   `unified-checkout`, y se ve sin tocar nada. Esto es el detrás: la secuencia
 *   completa, plegada.
 *
 * POR QUÉ PLEGADO
 *   Porque en el checkout la mayoría no lee: marca y manda. Una tarjeta abierta
 *   con tres iconos, tres títulos, tres pies y un recuadro verde era, para ese
 *   cliente, un muro que saltar — y para el que sí quería entender, información
 *   que igual estaba disponible un toque más allá. Cerrado, la pantalla queda en
 *   una línea; abierto, contesta entero.
 *
 *   Y cerrado por defecto, no abierto-la-primera-vez: un bloque que aparece solo
 *   la primera vez es el que menos se entiende, porque llega justo cuando el
 *   cliente todavía no sabe que tiene una duda.
 *
 * LOS MINUTOS NO ESTÁN ESCRITOS AQUÍ
 *   Entran por `timers`, que sale de `app_settings.timers` (whitelisted para
 *   lectura pública en la `0193`). Clavarlos no fallaría hoy: fallaría el día
 *   que alguien toque /admin/configuracion, que es literalmente lo que pasó con
 *   el umbral de prepago —ver `lib/prepay.ts`— y con `acceptanceMinutes` en la
 *   `0172`.
 */
export function PrepayExplainer({ timers }: PrepayExplainerProps) {
  const [abierto, setAbierto] = useState(false)
  const panelId = useId()

  const pasos = [
    {
      icono: 'schedule',
      titulo: 'Confirman',
      pie: `${timers.acceptance} min`,
      fondo: 'bg-surface-low text-ink-muted',
      mono: true,
    },
    {
      icono: 'notifications_active',
      titulo: 'Te avisamos',
      pie: 'suena tu celu',
      fondo: 'bg-success-soft text-success',
      mono: false,
    },
    {
      icono: 'account_balance_wallet',
      titulo: 'Ahí pagas',
      pie: `${timers.payment} min`,
      fondo: 'bg-brand-soft text-brand-dark',
      mono: true,
    },
  ]

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:bg-surface-low"
      >
        <Icon name="help" size={16} className="shrink-0 text-ink-subtle" />
        <span className="flex-1 text-[13px] font-semibold text-ink-muted">¿Cómo funciona?</span>
        <Icon
          name="expand_more"
          size={18}
          className={`shrink-0 text-ink-subtle transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <ol
          id={panelId}
          className="mt-1 grid grid-cols-3 gap-2 rounded-[16px] border border-ink/[0.04] bg-card px-3 py-4"
        >
          {pasos.map((p) => (
            <li key={p.titulo} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full ${p.fondo}`}
                aria-hidden="true"
              >
                <Icon name={p.icono} size={21} />
              </span>
              <span className="text-[13px] font-bold leading-tight">{p.titulo}</span>
              <span
                className={`text-[11px] text-ink-subtle ${p.mono ? 'font-mono tabular-nums' : ''}`}
              >
                {p.pie}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
