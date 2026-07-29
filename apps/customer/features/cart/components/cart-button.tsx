'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { CartSheet } from '@/features/cart/components/cart-sheet'
import type { CartButtonTone } from '@/features/cart/types'
import { useCart, useCartHydrated } from '@/lib/cart'

interface CartButtonProps {
  tone?: CartButtonTone
}

export function CartButton({ tone = 'light' }: CartButtonProps) {
  const [open, setOpen] = useState(false)
  const hydrated = useCartHydrated()
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0))
  const badge = hydrated ? count : 0
  const isDark = tone === 'dark'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative flex h-[42px] w-[42px] items-center justify-center rounded-full ${
          isDark ? 'border border-white/15 bg-black/45 text-white' : 'bg-ink/6 text-ink'
        }`}
        aria-label={badge > 0 ? `Mi bolsa, ${badge} ítems` : 'Mi bolsa'}
      >
        <Icon name="shopping_basket" size={20} />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 font-bold text-[10px] text-white tabular-nums">
            {badge}
          </span>
        )}
      </button>
      {open && <CartSheet onClose={() => setOpen(false)} />}
    </>
  )
}
