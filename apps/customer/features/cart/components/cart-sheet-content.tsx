import { BottomSheet, Icon, ScreenHeader } from '@tindivo/ui'
import Link from 'next/link'
import { CartCtas } from '@/features/cart/components/cart-ctas'
import { CartEmpty } from '@/features/cart/components/cart-empty'
import { CartLineList } from '@/features/cart/components/cart-line-item'
import { CartValidationBanner } from '@/features/cart/components/cart-validation-banner'
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
      <ScreenHeader
        title="Mi bolsa"
        as="h2"
        onBack={onClose}
        right={
          count > 0 ? (
            <button
              type="button"
              onClick={() => cart.clear()}
              className="rounded-full px-2.5 py-1 font-semibold text-[13px] text-danger hover:bg-danger/8 active:scale-95 transition-all"
            >
              Vaciar
            </button>
          ) : null
        }
      />
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-4 scrollbar-hide">
        {count === 0 ? (
          <CartEmpty />
        ) : (
          <>
            {cart.businessName && (
              <div className="mb-1 flex items-center justify-between pt-1 pb-2 text-[13px] text-ink-muted">
                <div className="flex items-center gap-2 font-semibold">
                  <Icon name="store" size={18} /> {cart.businessName}
                </div>
                {cart.businessId && (
                  <Link
                    href={`/negocio/${cart.businessId}`}
                    onClick={onClose}
                    className="font-semibold text-brand hover:underline"
                  >
                    + Agregar más
                  </Link>
                )}
              </div>
            )}
            <CartValidationBanner />
            <CartLineList lines={lines} />
            {cart.businessId && (
              <div className="mt-3.5">
                <Link
                  href={`/negocio/${cart.businessId}`}
                  onClick={onClose}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 py-2.5 text-[13px] font-semibold text-ink/70 hover:border-brand/50 hover:bg-brand-soft/20 hover:text-brand active:scale-[0.99] transition-all"
                >
                  <Icon name="add" size={16} />
                  <span>Seguir agregando platos</span>
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {count > 0 && (
        <div className="flex items-center gap-3 border-t border-white/[0.08] bg-white/[0.90] px-4 pt-3.5 pb-6 shadow-elev-3 backdrop-blur-3xl">
          <div className="shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Subtotal
            </div>
            <div className="font-extrabold text-[18px] tabular-nums">{soles(subtotal)}</div>
          </div>
          <CartCtas layout="row" onNavigate={onClose} />
        </div>
      )}
    </BottomSheet>
  )
}
