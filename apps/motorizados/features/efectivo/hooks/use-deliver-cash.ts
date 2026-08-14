'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Entrega el efectivo de UN pedido.
 *
 * `busy` es por pedido, no global: con una línea por cliente, un `busy`
 * compartido apagaba todos los botones de la pantalla mientras se resolvía uno
 * solo, y el motorizado —que está nombrando clientes uno tras otro delante de la
 * cajera— tenía que esperar entre tap y tap.
 */
export function useDeliverCash() {
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())

  const deliver = useCallback(async (orderId: string): Promise<void> => {
    setBusyIds((prev) => new Set(prev).add(orderId))
    try {
      await api.post('/driver/cash-settlements', { orderId })
    } catch (e) {
      throw new Error(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'Error')
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }, [])

  return { deliver, busyIds }
}
