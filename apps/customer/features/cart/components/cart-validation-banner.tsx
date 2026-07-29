'use client'

import { Icon } from '@tindivo/ui'
import { useCart } from '@/lib/cart'

export function CartValidationBanner() {
  const cart = useCart()
  const invalid = cart.validation?.invalidLines ?? []
  if (invalid.length === 0) return null

  return (
    <div className="mb-3 rounded-[16px] border border-danger/15 bg-danger-soft p-3.5">
      <div className="flex items-start gap-2.5">
        <Icon name="warning" size={20} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[13px] text-ink">
            Revisa {invalid.length === 1 ? 'este producto' : 'estos productos'} antes de pagar
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {invalid.map((line) => (
              <li key={line.key} className="text-[12px] text-ink-subtle">
                <span className="font-medium text-ink">{line.name}</span>
                {' — '}
                {line.issues.map((i) => i.message).join(', ')}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => cart.removeInvalidLines()}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-danger px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-danger/90"
          >
            <Icon name="delete" size={14} />
            Eliminar {invalid.length === 1 ? 'producto' : 'productos'} afectados
          </button>
        </div>
      </div>
    </div>
  )
}
