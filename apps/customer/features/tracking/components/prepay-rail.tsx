import { Icon } from '@tindivo/ui'
import type { PrepayStage } from '@/features/tracking/lib/prepay-stage'

interface PrepayRailProps {
  stage: PrepayStage
}

/**
 * Los turnos de las etiquetas, en el orden del riel. Segunda persona en el que
 * le toca al cliente y tercera en los otros dos: la diferencia entre «Pagas tú»
 * y «Confirman» es todo lo que hace falta para saber a quién se espera.
 */
const TURNOS = ['Confirman', 'Pagas tú', 'Verificamos'] as const

/**
 * De quién es el turno con el dinero, en tres nodos.
 *
 * QUÉ ARREGLA.
 *   El cliente elige prepago, ve «Pedido recibido» y se queda esperando un botón
 *   de pagar que no aparece hasta que el negocio confirme. La pantalla no le
 *   decía que todavía NO le tocaba hacer nada, y esa ausencia es donde se
 *   pierde. El riel se lo dice sin una sola frase.
 *
 * POR QUÉ NO ES `TrackingSteps` CON OTROS TEXTOS.
 *   Aquel proyecta el ciclo del pedido y colapsa las tres esperas del prepago en
 *   un único «Recibido» (ver `prepayStage`). Los dos conviven porque responden
 *   preguntas distintas —por dónde va mi comida, y a quién estamos esperando— y
 *   solo coinciden en pantalla durante los pocos estados en que el dinero está
 *   sin resolver.
 *
 * POR QUÉ VA SIN TARJETA.
 *   Porque `TrackingSteps` sí la lleva, y dos tarjetas con la misma forma a
 *   media pantalla de distancia se leen como la misma cosa repetida. Desnudo
 *   sobre la superficie funciona como pie del hero, que es lo que es.
 */
export function PrepayRail({ stage }: PrepayRailProps) {
  const actual = stage === 'done' ? 4 : stage

  return (
    <ol className="mt-3 flex px-1" aria-label="Estado de tu pago">
      {TURNOS.map((turno, i) => {
        const numero = i + 1
        const done = numero < actual
        const active = numero === actual
        const first = i === 0
        const last = i === TURNOS.length - 1

        return (
          <li
            key={turno}
            className="relative flex flex-1 flex-col items-center"
            aria-current={active ? 'step' : undefined}
          >
            {/* Conectores en dos mitades, como en `TrackingSteps`: así la línea
                se pinta de color solo hasta donde el pago ha llegado de verdad
                y no colorea el tramo que todavía falta. */}
            {!first && (
              <span
                className={`absolute top-[12px] right-1/2 left-0 h-0.5 ${
                  done || active ? 'bg-brand' : 'bg-ink/[0.08]'
                }`}
                aria-hidden="true"
              />
            )}
            {!last && (
              <span
                className={`absolute top-[12px] right-0 left-1/2 h-0.5 ${
                  done ? 'bg-brand' : 'bg-ink/[0.08]'
                }`}
                aria-hidden="true"
              />
            )}

            <span
              className={`relative z-[1] flex h-[25px] w-[25px] items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                done || active ? 'bg-brand text-white' : 'bg-ink/[0.08] text-ink-subtle'
              } ${active ? 'ring-4 ring-brand/20' : ''}`}
            >
              {done ? <Icon name="check" size={15} filled /> : numero}
            </span>

            <span
              className={`mt-1.5 px-0.5 text-center text-[11px] leading-tight ${
                active
                  ? 'font-bold text-ink'
                  : done
                    ? 'font-medium text-ink-muted'
                    : 'text-ink-subtle'
              }`}
            >
              {turno}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
