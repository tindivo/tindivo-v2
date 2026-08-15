'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import type { BusinessDetail } from '@/features/catalog/types'
import { api } from '@/lib/api'
import { useCart } from '@/lib/cart'

interface UseBusinessCatalogOptions {
  initialData?: BusinessDetail | null
}

export function useBusinessCatalog(id: string, options: UseBusinessCatalogOptions = {}) {
  const [data, setData] = useState<BusinessDetail | null>(options.initialData ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    api
      .get<ApiEnvelope<BusinessDetail>>(`/public/businesses/${id}`)
      .then((res) => {
        if (!on) return
        setData(res.data)
        // Valida el carrito persistido contra el catálogo recién cargado.
        const cart = useCart.getState()
        if (cart.businessId === res.data.business.id && cart.lines.length > 0) {
          cart.validateAgainst(res.data)
        }
      })
      .catch(
        (e) =>
          on &&
          setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo cargar'),
      )
    return () => {
      on = false
    }
  }, [id])

  return { data, error }
}
