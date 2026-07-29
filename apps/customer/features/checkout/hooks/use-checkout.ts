'use client'

import {
  type CheckoutActions,
  useCheckoutActions,
} from '@/features/checkout/hooks/use-checkout-actions'
import { useCheckoutAuth } from '@/features/checkout/hooks/use-checkout-auth'
import { type CheckoutState, useCheckoutState } from '@/features/checkout/hooks/use-checkout-state'

export type CheckoutViewModel = CheckoutState & CheckoutActions

export function useCheckout(): CheckoutViewModel {
  const state = useCheckoutState()
  useCheckoutAuth(state)
  const actions = useCheckoutActions(state)
  return { ...state, ...actions }
}
