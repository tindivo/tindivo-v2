'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useRef } from 'react'
import { tituloVentaPerdida, totalPerdido } from '@/lib/orders/lost-sales'
import type { OrderVM } from '@/lib/orders/view-model'
import { playLostSaleTone, speak } from '@/lib/use-audio-alert'

/**
 * «OYE, SE TE ESCAPÓ UNA VENTA.»
 *
 * El único aviso del panel que habla de algo que YA PASÓ. Todos los demás piden
 * hacer algo a tiempo; este no salva el pedido que murió —ese no vuelve— sino
 * el siguiente, contándole a la cajera que el mostrador se quedó sordo.
 *
 * ES INTERRUPTIVO A PROPÓSITO, y puede permitírselo porque casi nunca aparece:
 * seis veces en sesenta días en todo el piloto. Un aviso raro puede ser
 * escandaloso; uno frecuente no, porque se aprende a cerrarlo sin leerlo.
 *
 * LO PRIMERO QUE OFRECE ES PROBAR EL SONIDO, no «entendido». Si un pedido se
 * murió sin que nadie lo tocara, la pregunta útil no es si se ha enterado ahora:
 * es si se va a enterar del siguiente. Ver `SoundCheck`.
 */

/** Cada cuánto insiste mientras el aviso siga en pantalla. */
const REPETIR_MS = 20_000
/** Cuántas veces suena como mucho. Cinco repeticiones = un minuto y medio. */
const MAX_REPETICIONES = 5

export function LostSaleAlert({
  perdidas,
  onTestSound,
  onDismiss,
}: {
  perdidas: readonly OrderVM[]
  onTestSound: () => void
  onDismiss: () => void
}) {
  const repeticiones = useRef(0)

  // El sonido va aquí y no en el tablero porque la condición de sonar es
  // exactamente «este aviso está en pantalla»: mismo invariante que
  // `attentionState`, sonar y verse salen de la misma expresión.
  useEffect(() => {
    repeticiones.current = 0
    const sonar = () => {
      playLostSaleTone()
      repeticiones.current += 1
    }
    sonar()
    speak(
      perdidas.length === 1
        ? 'Se escapó un pedido por no atenderlo a tiempo'
        : `Se escaparon ${perdidas.length} pedidos por no atenderlos a tiempo`,
      900,
    )
    const t = setInterval(() => {
      if (repeticiones.current >= MAX_REPETICIONES) return
      sonar()
    }, REPETIR_MS)
    return () => clearInterval(t)
  }, [perdidas.length])

  const total = totalPerdido(perdidas)

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={tituloVentaPerdida(perdidas)}
      className="fixed inset-0 z-[340] flex items-center justify-center bg-ink/70 p-5"
    >
      <div className="w-full max-w-[400px] overflow-hidden rounded-[20px] bg-card shadow-elev-4">
        <div className="bg-danger px-6 py-5 text-center text-white">
          <span className="mx-auto mb-3 flex h-[56px] w-[56px] items-center justify-center rounded-2xl bg-white/20">
            <Icon name="priority_high" size={30} filled />
          </span>
          <h3 className="text-[19px] font-bold">{tituloVentaPerdida(perdidas)}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/85">
            {perdidas.length === 1
              ? 'Se canceló solo porque nadie lo aceptó a tiempo.'
              : 'Se cancelaron solos porque nadie los aceptó a tiempo.'}
          </p>
        </div>

        <div className="p-5">
          <ul className="mb-4 space-y-2">
            {perdidas.map((o) => (
              <li
                key={o.rowId}
                className="flex items-center justify-between gap-3 rounded-xl bg-danger-soft px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-ink">
                    #{o.id}
                    {o.customer ? ` · ${o.customer}` : ''}
                  </span>
                  {o.createdAtFormatted && (
                    <span className="block text-[12px] font-semibold text-ink-muted tabular-nums">
                      Entró a las {o.createdAtFormatted}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[14px] font-bold text-danger tabular-nums">
                  S/{o.total.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>

          {perdidas.length > 1 && (
            <p className="mb-4 text-center text-[13px] font-bold text-ink">
              Se dejaron de vender S/{total.toFixed(2)}
            </p>
          )}

          <div className="flex flex-col gap-2.5">
            {/* Primero el remedio, después el acuse. Ver la cabecera. */}
            <button
              type="button"
              onClick={onTestSound}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-bold text-white transition-all active:scale-[0.97]"
            >
              <Icon name="notifications_active" size={18} filled />
              Probar que el sonido funciona
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
