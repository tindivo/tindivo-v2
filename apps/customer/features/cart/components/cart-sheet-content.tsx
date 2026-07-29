import { Icon, ScreenHeader } from '@tindivo/ui'
import { BottomSheet } from '@/components/ui'
import { CartCtas } from '@/features/cart/components/cart-ctas'
import { CartEmpty } from '@/features/cart/components/cart-empty'
import { CartLineList } from '@/features/cart/components/cart-line-item'
import { soles } from '@/features/cart/lib/format'
import { useCart } from '@/lib/cart'

interface CartSheetContentProps {
  onClose: () => void
}

export function CartSheetContent({ onClose }: CartSheetContentProps) {
  const cart = useCart()
  const lines = cart.lines
  const count = cart.count()
  const subtotal = cart.subtotal()

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title="Mi bolsa" onBack={onClose} />
      <div className="t-scroll flex-1 px-4 pt-1 pb-4">
        {count === 0 ? (
          <CartEmpty />
        ) : (
          <>
            {cart.businessName && (
              <div className="mb-1 flex items-center gap-2 pt-1 pb-2 font-semibold text-[13px] text-ink-muted">
                <Icon name="store" size={18} /> {cart.businessName}
              </div>
            )}
            <CartLineList lines={lines} />
          </>
        )}
      </div>

      {count > 0 && (
        <div className="t-glass-strong flex items-center gap-3 border-t border-ink/[0.04] px-4 pt-3.5 pb-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Subtotal</div>
            <div className="font-extrabold text-[18px] tabular-nums">{soles(subtotal)}</div>
          </div>
          <CartCtas layout="row" onNavigate={onClose} />
        </div>
      )}
    </BottomSheet>
  )
}
