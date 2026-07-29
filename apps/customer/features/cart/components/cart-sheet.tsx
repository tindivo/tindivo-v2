'use client'

import { CartSheetContent } from '@/features/cart/components/cart-sheet-content'

interface CartSheetProps {
  onClose: () => void
}

export function CartSheet({ onClose }: CartSheetProps) {
  return <CartSheetContent onClose={onClose} />
}
