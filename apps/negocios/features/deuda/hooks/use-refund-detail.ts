'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLatestRequest } from '@/hooks/use-latest-request'
import { api } from '@/lib/api'
import { errMsg } from '../lib/format'
import type { RefundDetail } from '../types'

/**
 * El testigo de vigencia va aquí por la misma razón que en `useHistory`, aunque
 * este llegue por otro camino: el `id` no lo cambia un control de la pantalla
 * sino navegar de una devolución a otra, así que la carrera es mucho menos
 * alcanzable. Se pone igual porque cuesta una línea y el modo de fallo es el
 * mismo —el detalle de una devolución bajo el encabezado de otra—, y ese es un
 * sitio donde equivocarse habla de plata que se devuelve.
 */
export function useRefundDetail(id: string) {
  const [data, setData] = useState<RefundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abrirPeticion = useLatestRequest()

  const load = useCallback(async () => {
    const vigente = abrirPeticion()
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: RefundDetail }>(`/business/account/refunds/${id}`)
      if (!vigente()) return
      setData(res.data)
    } catch (e) {
      if (!vigente()) return
      setError(errMsg(e))
    } finally {
      if (vigente()) setLoading(false)
    }
  }, [id, abrirPeticion])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}
