'use client'

import { Icon } from '@tindivo/ui'
import { CartCtas } from '@/features/cart/components/cart-ctas'
import { CartEmpty } from '@/features/cart/components/cart-empty'
import { CartLineList } from '@/features/cart/components/cart-line-item'
import { soles } from '@/features/cart/lib/format'
import { useCart, useCartHydrated } from '@/lib/cart'

interface CartSidebarProps {
  businessId: string
  businessName: string
}

export function CartSidebar({ businessId, businessName }: CartSidebarProps) {
  const hydrated = useCartHydrated()
  const cart = useCart()
  const subtotal = cart.subtotal()
  const count = cart.count()
  const ownLines = cart.businessId === businessId ? cart.lines : []
  const showCart = hydrated && ownLines.length > 0

  return (
    <div className="rounded-[28px] border border-border bg-card p-5 shadow-elev-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[18px] font-bold tracking-tight">Mi bolsa</span>
        {showCart && (
          <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand px-1.5 font-bold text-[12px] text-white tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 font-semibold text-[13px] text-ink/60">
        <Icon name="store" size={20} /> {businessName}
      </div>

      {showCart ? (
        <>
          <div className="mt-3">
            <CartLineList lines={ownLines} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-[13px] text-ink/55">Subtotal</span>
            <span className="font-bold text-[18px] tabular-nums">{soles(subtotal)}</span>
          </div>
          <CartCtas layout="block" />
        </>
      ) : (
        <CartEmpty />
      )}
    </div>
  )
}
