'use client'

import {
  type CheckoutActions,
  useCheckoutActions,
} from '@/features/checkout/hooks/use-checkout-actions'
import { useCheckoutAuth } from '@/features/checkout/hooks/use-checkout-auth'
import {
  type UseCheckoutCartValidationReturn,
  useCheckoutCartValidation,
} from '@/features/checkout/hooks/use-checkout-cart-validation'
import { type CheckoutState, useCheckoutState } from '@/features/checkout/hooks/use-checkout-state'

export type CheckoutViewModel = CheckoutState & CheckoutActions & UseCheckoutCartValidationReturn

export function useCheckout(): CheckoutViewModel {
  const state = useCheckoutState()
  useCheckoutAuth(state)
  const actions = useCheckoutActions(state)
  const cartValidation = useCheckoutCartValidation(state.cartHydrated && !state.confirmed)
  return { ...state, ...actions, ...cartValidation }
}
