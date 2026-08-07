'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { useEffect, useRef, useState } from 'react'
import type { BusinessDetail } from '@/features/catalog/types'
import { api } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { isValidationStale } from '@/lib/cart-validation'

export interface UseCheckoutCartValidationReturn {
  /** true mientras se descarga el catálogo para validar. */
  validating: boolean
  /** Error al descargar el catálogo (no invalida el carrito, solo no se pudo verificar). */
  validationError: string | null
}

/**
 * En el checkout profundo (acceso directo a /checkout) no siempre tenemos el catálogo
 * del negocio en caché. Este hook carga el catálogo y valida el carrito contra él.
 * Si el usuario llegó desde la página del negocio, la validación ya se habrá hecho
 * allí y solo se refrescará si es vieja.
 */
export function useCheckoutCartValidation(enabled: boolean): UseCheckoutCartValidationReturn {
  const cart = useCart()
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const lastBusinessId = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !cart.businessId || cart.lines.length === 0) return

    // Evita revalidar repetidamente si no cambia el negocio ni pasa el tiempo.
    if (lastBusinessId.current === cart.businessId && !isValidationStale(cart.validation, 60_000)) {
      return
    }

    let on = true
    setValidating(true)
    setValidationError(null)

    api
      .get<ApiEnvelope<BusinessDetail>>(`/public/businesses/${cart.businessId}`)
      .then((res) => {
        if (!on) return
        lastBusinessId.current = cart.businessId
        cart.validateAgainst(res.data)
        setValidating(false)
      })
      .catch((e) => {
        if (!on) return
        setValidationError(
          e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo verificar el menú',
        )
        setValidating(false)
      })

    return () => {
      on = false
    }
  }, [enabled, cart.businessId, cart.lines.length, cart.validation])

  return { validating, validationError }
}
