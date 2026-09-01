'use client'

import { cn, Icon } from '@tindivo/ui'
import { cashError, changeFor } from '@/features/checkout/lib/cash'
import { soles } from '@/features/checkout/lib/format'
import { CASH_CHIPS, CASH_STEP, type CashChoice } from '@/features/checkout/types'

interface CashSelectorProps {
  total: number
  cashChoice: CashChoice
  setCashChoice: (v: CashChoice) => void
  cashCustom: string
  setCashCustom: (v: string) => void
  cashAmount: number
  cashChange: number
  maxCashBill: number
  maxChange: number
  maxDeclarable: number
}

function roundToStep(n: number, step: number): number {
  return Math.round(n / step) * step
}

/** `col-span-N` no puede construirse a mano: Tailwind escanea clases literales. */
const SPAN: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
}

/**
 * CON CUÁNTO VA A PAGAR — y por tanto qué vuelto tiene que salir de la caja.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL MOTIVO VIAJA EN EL CHIP
 *
 *   Aquí había CUATRO mensajes sobre el vuelto para una decisión que en la
 *   calle es «pago con 50»: dos avisos de techo en 11 px sobre los chips
 *   («esta noche hay hasta S/50 de vuelto», «puedes pagar hasta con S/88»), el
 *   mensaje de validación al pie, y un quinto texto que aparecía al tocar un
 *   chip que no alcanzaba.
 *
 *   Ese quinto existía por una buena razón: el chip capado se veía apagado pero
 *   no decía por qué, y el motivo estaba en un `title`, que en un teléfono es
 *   no decir nada. La solución era escribirlo donde se mira. Ahora cada chip
 *   lleva debajo lo que produce —«vuelto S/ 12»— o por qué no vale —«sin vuelto
 *   hoy»—, así que el motivo llega ANTES de tocar, no después.
 *
 *   Con eso, el estado `capped` y su `useEffect` de limpieza sobran: no hay un
 *   mensaje diferido que pueda quedarse mintiendo cuando cambia el techo.
 *   `aria-disabled` en vez de `disabled` para que el chip siga siendo
 *   alcanzable y su nombre accesible —que incluye el «sin vuelto hoy»— se lea.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL TOTAL SE DICE AQUÍ
 *
 *   La pregunta era «¿Con cuánto pagarás?» y el número al que se refiere vivía
 *   en el CTA y en el desglose del fondo — los dos fuera de pantalla cuando se
 *   lee esto. Ahora la pregunta lleva el total dentro.
 */
export function CashSelector({
  total,
  cashChoice,
  setCashChoice,
  cashCustom,
  setCashCustom,
  cashAmount,
  cashChange,
  maxCashBill,
  maxChange,
  maxDeclarable,
}: CashSelectorProps) {
  const sinSencillo = maxChange <= 0
  const chips = CASH_CHIPS.filter((c) => c.amount === null || c.amount >= total)
  const resto = chips.length % 4
  const otroSpan = SPAN[resto === 0 ? 4 : 4 - resto]

  const error = cashError(cashAmount, { total, maxCashBill, maxChange })
  const otro = cashChoice === 'custom'

  function handleBlur() {
    if (!otro) return
    const n = Number.parseFloat(cashCustom)
    if (!Number.isNaN(n) && n > 0) setCashCustom(roundToStep(n, CASH_STEP).toFixed(2))
  }

  const tono = error ? 'danger' : cashChange > 0 ? 'success' : 'muted'

  return (
    <div className="mt-3 rounded-[18px] border border-ink/[0.04] bg-card p-4 shadow-elev-1">
      <p className="m-0 font-semibold text-[14px] text-ink">
        Tu total es <span className="font-extrabold tabular-nums">{soles(total)}</span>. ¿Con cuánto
        pagas?
      </p>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {chips.map((c) => {
          const vuelto = c.amount === null ? 0 : changeFor(c.amount, total)
          // Un chip «no alcanza» cuando el vuelto que produce pasa del que hay
          // esta noche. El de pago exacto nunca produce vuelto, así que nunca
          // se capa: es justamente la salida cuando no hay sencillo.
          const capado = c.amount !== null && (c.amount > maxDeclarable || vuelto > maxChange)
          const sel = cashChoice === c.value && !capado
          return (
            <button
              key={c.value}
              type="button"
              aria-disabled={capado || undefined}
              onClick={() => {
                if (!capado) setCashChoice(c.value)
              }}
              className={cn(
                'flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] px-1 py-2 transition-all',
                capado
                  ? 'cursor-not-allowed border-transparent bg-surface-low opacity-40'
                  : sel
                    ? 'border-brand bg-brand text-white shadow-[0_4px_14px_rgba(249,115,22,0.28)]'
                    : 'border-transparent bg-surface-low text-ink hover:bg-ink/[0.06]',
              )}
            >
              <span className="font-bold text-[13px] tabular-nums">{c.label}</span>
              <span
                className={cn(
                  'text-center text-[9.5px] leading-[1.15]',
                  sel ? 'text-white/85' : 'text-ink-muted',
                )}
              >
                {capado
                  ? 'sin vuelto hoy'
                  : c.amount === null
                    ? 'sin vuelto'
                    : `vuelto ${vuelto.toFixed(2)}`}
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setCashChoice('custom')}
          className={cn(
            otroSpan,
            'flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-[1.5px] px-1 py-2 transition-all',
            otro
              ? 'border-brand bg-brand text-white shadow-[0_4px_14px_rgba(249,115,22,0.28)]'
              : 'border-transparent bg-surface-low text-ink hover:bg-ink/[0.06]',
          )}
        >
          <span className="font-bold text-[13px]">Otro</span>
          <span
            className={cn('text-[9.5px] leading-[1.15]', otro ? 'text-white/85' : 'text-ink-muted')}
          >
            monto
          </span>
        </button>
      </div>

      {otro && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded-[14px] border border-ink/[0.08] bg-surface px-3 py-2.5 font-mono text-[14px] text-ink-muted">
            S/
          </span>
          <input
            className="w-full flex-1 rounded-[14px] border border-ink/[0.08] bg-surface px-3.5 py-2.5 font-semibold text-[16px] text-ink tabular-nums outline-none transition-colors placeholder:font-normal placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.06]"
            inputMode="decimal"
            aria-label="Monto con el que vas a pagar"
            placeholder={total.toFixed(2)}
            value={cashCustom}
            maxLength={String(maxDeclarable.toFixed(2)).length}
            onChange={(e) => setCashCustom(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={handleBlur}
          />
        </div>
      )}

      {/* UN mensaje, no cuatro. El techo solo se nombra cuando de verdad hace
          falta: al escribir un monto libre, o cuando no hay sencillo y la única
          salida es el pago exacto. */}
      <p
        aria-live="polite"
        className={cn(
          'mt-3 flex items-start gap-2 font-semibold text-[12.5px] leading-snug tabular-nums',
          tono === 'danger'
            ? 'text-danger'
            : tono === 'success'
              ? 'text-success'
              : 'text-ink-muted',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-px flex shrink-0 items-center justify-center rounded-full',
            tono === 'danger'
              ? 'text-danger'
              : tono === 'success'
                ? 'text-success'
                : 'text-ink-subtle',
          )}
        >
          <Icon
            name={tono === 'danger' ? 'error' : tono === 'success' ? 'check_circle' : 'info'}
            size={15}
          />
        </span>
        <span>
          {error ??
            (cashChange > 0
              ? `El motorizado sale con tu vuelto de ${soles(cashChange)} listo.`
              : sinSencillo
                ? 'Pago exacto: esta noche el negocio no tiene sencillo.'
                : 'Pago exacto, sin vuelto.')}
        </span>
      </p>

      {otro && !error && (
        <p className="mt-1.5 text-[11px] text-ink-subtle">
          Puedes pagar hasta con {soles(maxDeclarable)}.
        </p>
      )}
    </div>
  )
}
