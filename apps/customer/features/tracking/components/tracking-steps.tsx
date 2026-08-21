import { Icon } from '@tindivo/ui'
import { STEPS } from '@/features/tracking/lib/format'

interface TrackingStepsProps {
  currentIdx: number
}

/**
 * Los cuatro pasos, en horizontal.
 *
 * Antes era una lista vertical que repetía, uno por uno, la etiqueta y el
 * subtítulo del paso actual — exactamente el mismo texto que ya está en el hero,
 * a dos dedos de distancia. Decía la verdad dos veces y a cambio empujaba bajo el
 * pliegue todo lo que el cliente sí necesita: el detalle, el motorizado, el
 * botón de cancelar.
 *
 * En horizontal ocupa una quinta parte del alto y hace lo único que un hero no
 * puede hacer: enseñar el camino entero de un vistazo. El detalle del paso en
 * curso se queda donde ya estaba, arriba.
 */
export function TrackingSteps({ currentIdx }: TrackingStepsProps) {
  return (
    <ol className="mt-3.5 flex rounded-[22px] border border-ink/[0.04] bg-card px-3 py-4 shadow-elev-1">
      {STEPS.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const first = i === 0
        const last = i === STEPS.length - 1

        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center">
            {/* Conectores: dos mitades por paso, para que la línea se pinte de
                color solo hasta donde el pedido ha llegado de verdad. */}
            {!first && (
              <span
                className={`absolute top-[13px] right-1/2 left-0 h-0.5 ${
                  done || active ? 'bg-brand' : 'bg-ink/[0.08]'
                }`}
                aria-hidden="true"
              />
            )}
            {!last && (
              <span
                className={`absolute top-[13px] right-0 left-1/2 h-0.5 ${
                  done ? 'bg-brand' : 'bg-ink/[0.08]'
                }`}
                aria-hidden="true"
              />
            )}

            <span
              className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-white ${
                done || active ? 'bg-brand' : 'bg-ink/[0.08]'
              } ${active ? 'shadow-focus-ring' : ''}`}
            >
              {done ? (
                <Icon name="check" size={15} filled />
              ) : (
                <span
                  className={`h-[7px] w-[7px] rounded-full ${
                    active ? 'animate-pulse bg-white' : 'bg-ink/[0.35]'
                  }`}
                />
              )}
            </span>

            <span
              className={`mt-1.5 px-0.5 text-center text-[11px] leading-tight ${
                active
                  ? 'font-bold text-brand'
                  : done
                    ? 'font-medium text-ink-muted'
                    : 'text-ink-subtle'
              }`}
            >
              {s.short}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
