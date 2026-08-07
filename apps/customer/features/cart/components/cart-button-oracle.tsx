'use client'

import { CartButton } from '@/features/cart/components/cart-button'
import { CartSidebar } from '@/features/cart/components/cart-sidebar'

interface CartButtonOracleProps {
  businessId: string
  businessName: string
}

export function CartButtonOracle({ businessId, businessName }: CartButtonOracleProps) {
  return (
    <>
      <div className="hidden lg:block">
        <CartSidebar businessId={businessId} businessName={businessName} />
      </div>
      <div className="lg:hidden">
        <CartButton />
      </div>
    </>
  )
}
