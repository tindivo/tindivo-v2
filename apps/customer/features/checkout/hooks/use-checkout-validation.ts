'use client'

import { ADDRESS_LINE_MIN, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
import { useCallback, useMemo } from 'react'
import { getLineError, isLineOk } from '@/components/address-fields'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'

export interface UseCheckoutValidationReturn {
  cashAmount: number
  cashChange: number
  goToPayment: () => void
  validate: () => boolean
}

export function useCheckoutValidation(checkout: CheckoutViewModel): UseCheckoutValidationReturn {
  const {
    setError,
    name,
    deliveryMethod,
    line,
    reference,
    selectedAddress,
    manualAddr,
    manualInside,
    phone,
    setStep,
    total,
    cashChoice,
    cashCustom,
    cart,
    validating,
  } = checkout

  const cashAmount = useMemo(
    () =>
      cashChoice === 'exact'
        ? total
        : cashChoice === 'custom'
          ? Number.parseFloat(cashCustom) || 0
          : Number(cashChoice),
    [cashChoice, cashCustom, total],
  )
  const cashChange = useMemo(
    () => Math.round((cashAmount - total) * 100) / 100,
    [cashAmount, total],
  )

  const validate = useCallback(() => {
    setError(null)
    if (cart.hasInvalidLines()) {
      setError(
        'Tu bolsa tiene productos que ya no están disponibles o cambiaron de precio. Revisa antes de continuar.',
      )
      return false
    }
    if (validating) {
      setError('Estamos verificando tu bolsa con el menú actual. Espera un momento.')
      return false
    }
    if (name.trim().length === 0) {
      setError('Ingresa tu nombre')
      return false
    }
    if (deliveryMethod === 'delivery') {
      if (!line || line.trim().length < ADDRESS_LINE_MIN) {
        setError(`Elige o agrega una dirección de al menos ${ADDRESS_LINE_MIN} caracteres`)
        return false
      }
      if (!isLineOk(line)) {
        setError(getLineError(line) ?? 'Ingresa una dirección válida')
        return false
      }
      if (reference.trim().length < ADDRESS_REFERENCE_MIN) {
        setError(
          `Elige o agrega una dirección con referencia de al menos ${ADDRESS_REFERENCE_MIN} caracteres`,
        )
        return false
      }
      if (!selectedAddress) {
        if (!manualAddr.coords) {
          setError('Marca tu ubicación en el mapa')
          return false
        }
        if (!manualInside) {
          setError('Esa ubicación está fuera de nuestra zona de reparto en San Jacinto')
          return false
        }
      }
    }
    if (!/^9\d{8}$/.test(phone)) {
      setError('Ingresa un celular válido (9 dígitos, empieza con 9)')
      return false
    }
    return true
  }, [
    setError,
    cart,
    validating,
    name,
    deliveryMethod,
    line,
    reference,
    selectedAddress,
    manualAddr,
    manualInside,
    phone,
  ])

  const goToPayment = useCallback(() => {
    if (validate()) {
      setStep('payment')
    }
  }, [validate, setStep])

  return { cashAmount, cashChange, goToPayment, validate }
}
