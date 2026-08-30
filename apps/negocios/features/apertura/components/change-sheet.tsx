'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'

const PRESETS = [0, 20, 50, 100] as const

function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`
}

/**
 * Cuánto vuelto hay en caja esta noche.
 *
 * El sencillo lo adelanta la cajera de su propio bolsillo, así que es la única
 * que sabe si a las nueve quedan S/20 o S/80. Hasta ahora el techo era una
 * constante global de S/50 igual para todos y para siempre; esto lo baja al
 * sitio donde está el dato.
 *
 * Declarar es opcional a propósito. Sin declaración manda el global, que es
 * exactamente lo que pasaba antes, y por eso "Usar el de siempre" no guarda un
 * número: borra la declaración.
 */
export function ChangeSheet({
  current,
  fallback,
  saving,
  onClose,
  onSave,
}: {
  /** null = no declarado; manda `fallback`. Cero es un valor, no un vacío. */
  current: number | null
  fallback: number
  saving: boolean
  onClose: () => void
  onSave: (amount: number | null) => Promise<boolean>
}) {
  const [custom, setCustom] = useState(
    current !== null && !PRESETS.includes(current as (typeof PRESETS)[number])
      ? String(current)
      : '',
  )

  async function commit(amount: number | null) {
    if (await onSave(amount)) onClose()
  }

  const parsed = Number.parseFloat(custom)
  const customValid = Number.isFinite(parsed) && parsed >= 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="¿Cuánto vuelto tienes?"
      className="fixed inset-0 z-[320] flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-5"
    >
      <div className="w-full max-w-[420px] rounded-t-[20px] bg-card p-6 shadow-elev-4 sm:rounded-[20px]">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-bold text-ink">¿Cuánto vuelto tienes?</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 shrink-0 text-ink-subtle hover:text-ink"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="mb-5 text-[13px] leading-relaxed text-ink-muted">
          Los clientes no podrán pedir en efectivo con un billete que pase de tu vuelto. Vale solo
          para hoy: mañana vuelve a empezar.
        </p>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((amount) => {
            const sel = current === amount
            return (
              <button
                key={amount}
                type="button"
                disabled={saving}
                onClick={() => commit(amount)}
                className={`rounded-full px-4 py-2.5 text-[14px] font-bold transition-colors disabled:opacity-50 ${
                  sel
                    ? 'bg-brand text-white'
                    : 'border border-ink/[0.08] bg-surface-low text-ink hover:bg-ink/[0.06]'
                }`}
              >
                {amount === 0 ? 'No tengo' : soles(amount)}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-2xl border border-ink/[0.08] bg-surface-low px-3 py-3 font-mono text-[15px] text-ink-muted">
            S/
          </span>
          <input
            className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
            inputMode="decimal"
            placeholder="Otro monto"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))}
          />
          <button
            type="button"
            disabled={saving || !customValid}
            onClick={() => commit(Math.round(parsed * 100) / 100)}
            className="shrink-0 rounded-2xl bg-ink px-4 py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Guardar
          </button>
        </div>

        <button
          type="button"
          disabled={saving || current === null}
          onClick={() => commit(null)}
          className="mt-4 w-full text-[13px] font-semibold text-ink-subtle disabled:opacity-40"
        >
          Usar el de siempre ({soles(fallback)})
        </button>
      </div>
    </div>
  )
}
