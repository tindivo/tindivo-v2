import { Icon } from '@tindivo/ui'
import type { PrepayTimers } from '@/features/checkout/types'

interface PrepayExplainerProps {
  timers: PrepayTimers
}

/**
 * Qué pasa después de tocar «Confirmar pedido» si pagas por adelantado.
 *
 * EL PROBLEMA QUE RESUELVE
 *   El cliente elige prepago esperando pagar ahí mismo, no encuentra dónde, y
 *   se queda atascado. Y cuando por fin llega al seguimiento se encuentra un
 *   «Pedido recibido» que tampoco le dice que todavía no le toca. La causa está
 *   aquí, un paso antes: la pantalla de pago nunca dijo que el pago llega
 *   DESPUÉS, ni cuánto hay que esperar.
 *
 * POR QUÉ TRES ICONOS Y NO UN PÁRRAFO
 *   Porque en el checkout nadie lee. La primera versión de esto eran noventa
 *   palabras explicando los tres pasos con su matiz cada uno, y era exactamente
 *   el tipo de bloque que el ojo salta. Quedan tres celdas de dos palabras y una
 *   sola frase completa —«No pagas nada ahora»—, que es la única que de verdad
 *   contesta la duda que trae el cliente a esta pantalla: ¿me toca hacer algo ya?
 *
 * LOS MINUTOS NO ESTÁN ESCRITOS AQUÍ
 *   Entran por `timers`, que sale de `app_settings.timers` (whitelisted para
 *   lectura pública en la `0193`). Clavarlos no fallaría hoy: fallaría el día
 *   que alguien toque /admin/configuracion, que es literalmente lo que pasó con
 *   el umbral de prepago —ver `lib/prepay.ts`— y con `acceptanceMinutes` en la
 *   `0172`.
 */
export function PrepayExplainer({ timers }: PrepayExplainerProps) {
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
    <div className="mt-2.5 rounded-[18px] border border-ink/[0.04] bg-card p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
        Lo que va a pasar
      </div>

      <ol className="mt-3 grid grid-cols-3 gap-2">
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

      {/* La única frase entera de la tarjeta, y la que contesta la duda real. */}
      <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] border border-success/25 bg-success-soft px-3 py-2.5">
        <Icon name="check" size={17} className="shrink-0 text-success" filled />
        <span className="text-[13px] font-bold text-emerald-900">No pagas nada ahora</span>
      </div>
    </div>
  )
}
