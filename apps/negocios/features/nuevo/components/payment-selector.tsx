'use client'

import { cn, Icon } from '@tindivo/ui'
import { PAYMENTS } from '../lib/constants'
import type { Payment } from '../types'

/**
 * Selector de método de pago del pedido manual.
 *
 * El activo NO se marca en negro. Antes era `bg-ink` + `border-ink`, y con
 * cuatro opciones apiladas la tarjeta entera se leía como un bloque oscuro.
 * Ahora el color lo lleva la pastilla del icono —uno por método, ver `tile` en
 * `constants.ts`— y el activo se señala con fondo cálido de marca y un halo
 * suave, como hace tindivo-delivery en esta misma pantalla.
 *
 * EXCEPCIÓN CONSCIENTE a `pnpm check:ds`: estos `<button>` pintan su propia
 * superficie y el guardarraíl los marca, con razón. No son CTA, son filas de
 * opción excluyentes (icono + título + subtítulo + check), un patrón que
 * `<Button>` no modela y que forzarlo empeoraría. El mismo patrón está en
 * `band-selector.tsx`: si aparece un tercer caso, toca extraer un
 * `<OptionRow>` a `packages/ui` en vez de seguir sumando excepciones.
 */

export function PaymentSelector({
  value,
  onChange,
}: {
  value: Payment
  onChange: (p: Payment) => void
}) {
  return (
    <div data-testid="payment-selector" className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Método de pago
      </div>
      <div className="flex flex-col gap-2">
        {PAYMENTS.map((o) => {
          const active = value === o.id
          return (
            <button
              type="button"
              key={o.id}
              aria-pressed={active}
              onClick={() => onChange(o.id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98]',
                active
                  ? 'border-brand/45 bg-brand-soft shadow-[0_8px_22px_-8px_rgba(249,115,22,0.3)]'
                  : 'border-border bg-card hover:bg-surface',
              )}
            >
              {/* La pastilla lleva su color SIEMPRE, no solo al estar activa:
                  así se distinguen los cuatro métodos sin tener que leerlos. */}
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white transition-opacity',
                  o.tile,
                  !active && 'opacity-55',
                )}
              >
                <Icon name={o.icon} size={20} filled />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{o.label}</div>
                <div className="text-xs text-ink-muted">{o.sub}</div>
              </div>
              {active && (
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white">
                  <Icon name="check" size={14} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
