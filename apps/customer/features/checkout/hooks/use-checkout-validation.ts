'use client'

import { ADDRESS_LINE_MIN, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
import { useCallback, useMemo, useState } from 'react'
import { getLineError, isLineOk } from '@/components/address-fields'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'
import { cashError, changeFor } from '@/features/checkout/lib/cash'
import type { CheckoutField, CheckoutIssue } from '@/features/checkout/types'

export interface UseCheckoutValidationReturn {
  cashAmount: number
  cashChange: number
  /**
   * Lo que falta para poder confirmar, o `null` si el pedido ya puede salir.
   * Se recalcula en cada render, NO al tocar el botón: el CTA tiene que poder
   * decir qué falta antes de que el cliente lo intente.
   */
  issue: CheckoutIssue | null
  /**
   * A dónde llevar al cliente. `tick` sube en cada intento fallido para que la
   * pantalla vuelva a llevarlo aunque falle DOS VECES EL MISMO CAMPO: sin él,
   * el segundo toque no cambia el objeto y el efecto de scroll no corre.
   */
  focus: { field: CheckoutField; tick: number } | null
  /** ¿Ya intentó confirmar? Hasta entonces las filas no se pintan en rojo. */
  attempted: boolean
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
    payment,
    cart,
    validating,
    maxCashBill,
    maxChange,
  } = checkout

  const [focus, setFocus] = useState<{ field: CheckoutField; tick: number } | null>(null)
  const [attempted, setAttempted] = useState(false)

  const cashAmount = useMemo(
    () =>
      cashChoice === 'exact'
        ? total
        : cashChoice === 'custom'
          ? Number.parseFloat(cashCustom) || 0
          : Number(cashChoice),
    [cashChoice, cashCustom, total],
  )
  const cashChange = useMemo(() => changeFor(cashAmount, total), [cashAmount, total])

  /**
   * El orden de las ramas ES la prioridad con la que se atiende al cliente, y
   * va de arriba abajo de la pantalla: la bolsa antes que la entrega, la
   * entrega antes que el pago. Llevarlo primero a la parte de abajo y luego
   * hacerlo subir sería peor que no llevarlo.
   */
  const issue = useMemo((): CheckoutIssue | null => {
    if (cart.hasInvalidLines()) {
      return {
        field: 'cart',
        message:
          'Tu bolsa tiene productos que ya no están disponibles o cambiaron de precio. Revísala antes de continuar.',
        cta: 'Revisa tu bolsa',
      }
    }
    if (name.trim().length === 0) {
      return { field: 'name', message: 'Ingresa tu nombre', cta: 'Agrega tu nombre' }
    }
    if (deliveryMethod === 'delivery') {
      if (!line || line.trim().length < ADDRESS_LINE_MIN) {
        return {
          field: 'address',
          message: `Elige o agrega una dirección de al menos ${ADDRESS_LINE_MIN} caracteres`,
          cta: selectedAddress ? 'Completa tu dirección' : 'Agrega tu dirección',
        }
      }
      if (!isLineOk(line)) {
        return {
          field: 'address',
          message: getLineError(line) ?? 'Ingresa una dirección válida',
          cta: 'Corrige tu dirección',
        }
      }
      if (reference.trim().length < ADDRESS_REFERENCE_MIN) {
        return {
          field: 'address',
          message: `Agrega una referencia de al menos ${ADDRESS_REFERENCE_MIN} caracteres para que el motorizado te encuentre`,
          cta: 'Agrega una referencia',
        }
      }
      if (!selectedAddress) {
        if (!manualAddr.coords) {
          return {
            field: 'address',
            message: 'Marca tu ubicación en el mapa',
            cta: 'Marca tu ubicación',
          }
        }
        if (!manualInside) {
          return {
            field: 'address',
            message: 'Esa ubicación está fuera de nuestra zona de reparto en San Jacinto',
            cta: 'Cambia tu dirección',
          }
        }
      }
    }
    if (!/^9\d{8}$/.test(phone)) {
      return {
        field: 'phone',
        message: 'Ingresa un celular válido (9 dígitos, empieza con 9)',
        cta: 'Revisa tu celular',
      }
    }
    // El vuelto sale de `lib/cash`, la misma función que pinta el mensaje del
    // selector y que vuelve a correr en `placeOrder` con el techo fresco del
    // servidor. Aquí NO se vuelve a escribir la regla.
    if (payment === 'pending_cash') {
      const mal = cashError(cashAmount, { total, maxCashBill, maxChange })
      if (mal) return { field: 'cash', message: mal, cta: 'Revisa con cuánto pagas' }
    }
    return null
  }, [
    cart,
    name,
    deliveryMethod,
    line,
    reference,
    selectedAddress,
    manualAddr,
    manualInside,
    phone,
    payment,
    cashAmount,
    total,
    maxCashBill,
    maxChange,
  ])

  const validate = useCallback(() => {
    setError(null)
    // `validating` no es una falta del cliente: no hay nada que corregir ni a
    // dónde llevarlo, solo esperar. Por eso vive fuera de `issue` — si entrara,
    // el CTA diría «Revisa tu bolsa» durante el segundo que tarda el catálogo.
    if (validating) {
      setError('Estamos verificando tu bolsa con el menú actual. Espera un momento.')
      return false
    }
    if (issue) {
      setAttempted(true)
      setError(issue.message)
      setFocus((prev) => ({ field: issue.field, tick: (prev?.tick ?? 0) + 1 }))
      return false
    }
    return true
  }, [setError, validating, issue])

  const goToPayment = useCallback(() => {
    if (validate()) setStep('payment')
  }, [validate, setStep])

  return { cashAmount, cashChange, issue, focus, attempted, goToPayment, validate }
}
