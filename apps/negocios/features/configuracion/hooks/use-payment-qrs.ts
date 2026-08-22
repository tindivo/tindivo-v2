'use client'

import { ApiError } from '@tindivo/api-client'
import type { PaymentQrView } from '@tindivo/contracts'
import { useCallback, useEffect, useState } from 'react'
import { notifySuccess } from '@/components/dashboard/toast'
import { api } from '@/lib/api'

interface PaymentQrsPayload {
  defaultSlot: number
  maxSlots: number
  items: PaymentQrView[]
}

export interface PaymentQrDraft {
  slot: number
  wallet: 'yape' | 'plin'
  accountNumber: string
  accountName: string
  qrUrl: string | null
}

function message(err: unknown, fallback: string): string {
  if (err instanceof ApiError)
    return err.problem.errors?.[0]?.message ?? err.problem.detail ?? err.message
  return fallback
}

/**
 * Los métodos de cobro del negocio (0184): hasta dos, y cuál se enseña primero.
 *
 * Toda escritura devuelve la lista completa ya ordenada por la API, así que el
 * estado se reemplaza con la respuesta en vez de parchearse a mano: quién es el
 * principal lo decide el servidor —incluido el repunte automático cuando se
 * borra justo el que lo era— y adivinarlo aquí solo abriría la puerta a que el
 * panel enseñe un principal distinto del que ve el motorizado.
 */
export function usePaymentQrs() {
  const [items, setItems] = useState<PaymentQrView[]>([])
  const [defaultSlot, setDefaultSlot] = useState(1)
  const [maxSlots, setMaxSlots] = useState(2)
  const [loading, setLoading] = useState(true)
  const [busySlot, setBusySlot] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const absorb = useCallback((payload: PaymentQrsPayload) => {
    setItems(payload.items)
    setDefaultSlot(payload.defaultSlot)
    setMaxSlots(payload.maxSlots)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get<{ data: PaymentQrsPayload }>('/business/payment-qrs')
        absorb(r.data)
      } catch (err) {
        setError(message(err, 'No pudimos cargar tus cuentas de cobro.'))
      } finally {
        setLoading(false)
      }
    })()
  }, [absorb])

  const save = useCallback(
    async (draft: PaymentQrDraft): Promise<boolean> => {
      setBusySlot(draft.slot)
      setError(null)
      try {
        const r = await api.put<{ data: PaymentQrsPayload }>('/business/payment-qrs', draft)
        absorb(r.data)
        notifySuccess('Cuenta de cobro guardada')
        return true
      } catch (err) {
        setError(message(err, 'No se pudo guardar la cuenta.'))
        return false
      } finally {
        setBusySlot(null)
      }
    },
    [absorb],
  )

  const remove = useCallback(
    async (slot: number) => {
      setBusySlot(slot)
      setError(null)
      try {
        const r = await api.delete<{ data: PaymentQrsPayload }>(
          `/business/payment-qrs?slot=${slot}`,
        )
        absorb(r.data)
        notifySuccess('Cuenta eliminada')
      } catch (err) {
        setError(message(err, 'No se pudo eliminar la cuenta.'))
      } finally {
        setBusySlot(null)
      }
    },
    [absorb],
  )

  const makeDefault = useCallback(
    async (slot: number) => {
      setBusySlot(slot)
      setError(null)
      try {
        const r = await api.patch<{ data: PaymentQrsPayload }>('/business/payment-qrs', {
          defaultSlot: slot,
        })
        absorb(r.data)
        notifySuccess('Listo: es tu cuenta principal')
      } catch (err) {
        setError(message(err, 'No se pudo cambiar la cuenta principal.'))
      } finally {
        setBusySlot(null)
      }
    },
    [absorb],
  )

  /** El primer hueco libre, o `null` si ya están todos ocupados. */
  const freeSlot = (() => {
    for (let s = 1; s <= maxSlots; s++) if (!items.some((i) => i.slot === s)) return s
    return null
  })()

  return {
    items,
    defaultSlot,
    maxSlots,
    freeSlot,
    loading,
    busySlot,
    error,
    save,
    remove,
    makeDefault,
  }
}
