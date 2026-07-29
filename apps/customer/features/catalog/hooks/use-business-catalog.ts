'use client'

import { type ApiEnvelope, ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import type { BusinessDetail } from '@/features/catalog/types'
import { api } from '@/lib/api'

export function useBusinessCatalog(id: string) {
  const [data, setData] = useState<BusinessDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    api
      .get<ApiEnvelope<BusinessDetail>>(`/public/businesses/${id}`)
      .then((res) => {
        if (!on) return
        setData(res.data)
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
