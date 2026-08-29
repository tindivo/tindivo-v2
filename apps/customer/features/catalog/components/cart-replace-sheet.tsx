'use client'

import { BottomSheet, Button } from '@tindivo/ui'
import type { CartLine } from '@/lib/cart'

interface CartReplaceSheetProps {
  currentBusinessName: string | null
  newBusinessName: string
  pending: Omit<CartLine, 'key'>
  onClose: () => void
  onConfirm: (line: Omit<CartLine, 'key'>) => void
}

/** Una sola fuente para el título: lo pinta la pantalla y nombra el diálogo. */
const TITULO = '¿Empezar una bolsa nueva?'

export function CartReplaceSheet({
  currentBusinessName,
  newBusinessName,
  pending,
  onClose,
  onConfirm,
}: CartReplaceSheetProps) {
  return (
    <BottomSheet open label={TITULO} onClose={onClose}>
      <div className="px-5 pt-6 pb-7">
        <div className="font-display text-[20px] font-bold leading-[1.15] tracking-tight">
          {TITULO}
        </div>
        <p className="mt-2 text-[14px] text-ink/65">
          Tu bolsa tiene productos de <span className="font-semibold">{currentBusinessName}</span>.
          Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para
          empezar en <span className="font-semibold">{newBusinessName}</span>.
        </p>
        <div className="mt-5 flex gap-2.5">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Mantener
          </Button>
          <Button
            type="button"
            variant="brand"
            className="flex-1"
            onClick={() => onConfirm(pending)}
          >
            Vaciar y empezar
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
