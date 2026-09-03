'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { soles } from '@/features/checkout/lib/format'
import { useCart } from '@/lib/cart'

/**
 * Las líneas de la bolsa, editables.
 *
 * YA NO TRAE CABECERA NI ACORDEÓN PROPIOS. Los tenía —una `Card` con su botón
 * «Detalle del pedido» y su propio `useState(open)`— y se renderizaba DENTRO
 * del acordeón de «Tu pedido» del checkout, que es su único sitio de uso. El
 * resultado eran dos cabeceras y dos flechas para abrir la misma cosa: se
 * desplegaba una tarjeta cuyo contenido era otra tarjeta cerrada.
 *
 * Ahora el acordeón es uno solo y vive en quien lo abre.
 */
export function OrderDetail() {
  const cart = useCart()
  if (cart.count() === 0) return null

  return (
    <div className="border-ink/[0.04] border-t px-3.5 pt-1 pb-3.5">
      {cart.lines.map((line) => (
        <div
          key={line.key}
          className="flex items-start gap-3 border-ink/[0.04] border-t pt-3.5 first:border-t-0"
        >
          {/* Placeholder de color por `hue` (mismo estándar visual que el modal
              de producto). */}
          <span
            aria-hidden
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.92_0.04_${line.hue})] font-bold text-[18px] text-[oklch(0.42_0.12_${line.hue})]`}
          >
            {line.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold text-[14px] leading-snug">
                <span className="tabular-nums">{line.quantity}×</span> {line.name}
              </div>
              <div className="shrink-0 font-semibold text-[14px] tabular-nums">
                {soles(line.unitPrice * line.quantity)}
              </div>
            </div>

            {line.modifiers.length > 0 && (
              <div className="mt-1 flex flex-col gap-0.5">
                {line.modifiers.map((m) => (
                  <div
                    key={`${line.key}-${m.optionId}`}
                    className="flex justify-between gap-2 text-[12px] text-ink-muted"
                  >
                    <span className="min-w-0">
                      <span className="text-ink-subtle">{m.groupName}: </span>
                      {m.optionName}
                    </span>
                    {m.price > 0 && (
                      <span className="shrink-0 tabular-nums">+{soles(m.price)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {line.note && (
              <div className="mt-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand-dark">
                <span className="font-semibold">Nota: </span>
                {line.note}
              </div>
            )}

            <div className="mt-2.5 flex items-center justify-between">
              <div className="inline-flex origin-left scale-90 items-center rounded-full bg-ink/[0.06] p-1">
                <IconButton
                  type="button"
                  size="sm"
                  onClick={() => cart.setQty(line.key, line.quantity - 1)}
                  disabled={line.quantity <= 1}
                  aria-label={`Quitar uno de ${line.name}`}
                  className="h-8 w-8 hover:bg-ink/[0.08]"
                >
                  <Icon name="remove" size={20} />
                </IconButton>
                <span className="min-w-7 text-center font-semibold tabular-nums">
                  {line.quantity}
                </span>
                <IconButton
                  type="button"
                  size="sm"
                  onClick={() => cart.setQty(line.key, line.quantity + 1)}
                  aria-label={`Agregar uno de ${line.name}`}
                  className="h-8 w-8 hover:bg-ink/[0.08]"
                >
                  <Icon name="add" size={20} />
                </IconButton>
              </div>
              <button
                type="button"
                onClick={() => cart.remove(line.key)}
                className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-3 py-1.5 font-semibold text-[12px] text-danger transition-colors hover:bg-danger/10"
              >
                <Icon name="delete" size={14} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
