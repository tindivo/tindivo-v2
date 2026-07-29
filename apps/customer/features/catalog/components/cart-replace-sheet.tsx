'use client'

import { BottomSheet } from '@/components/ui'
import type { CartLine } from '@/lib/cart'

interface CartReplaceSheetProps {
  currentBusinessName: string | null
  newBusinessName: string
  pending: Omit<CartLine, 'key'>
  onClose: () => void
  onConfirm: (line: Omit<CartLine, 'key'>) => void
}

export function CartReplaceSheet({
  currentBusinessName,
  newBusinessName,
  pending,
  onClose,
  onConfirm,
}: CartReplaceSheetProps) {
  return (
    <BottomSheet open onClose={onClose}>
      <div className="px-5 pt-6 pb-7">
        <div className="t-display text-[20px] leading-[1.15]">¿Empezar una bolsa nueva?</div>
        <p className="mt-2 text-[14px] text-black/65">
          Tu bolsa tiene productos de <span className="font-semibold">{currentBusinessName}</span>.
          Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para
          empezar en <span className="font-semibold">{newBusinessName}</span>.
        </p>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[14px] bg-black/[0.06] py-3.5 font-semibold text-[15px]"
          >
            Mantener
          </button>
          <button
            type="button"
            onClick={() => onConfirm(pending)}
            className="t-btn t-btn-primary flex-1"
          >
            Vaciar y empezar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
