'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import type { OrderVM } from '@/lib/orders/view-model'
import { normalizeSupportPhone, supportWhatsappUrl, urgentDriverMessage } from '@/lib/support'

export interface OrderActionsDeps {
  selected: OrderVM | null
  supportWhatsapp: string | null
  bizName: string
  refetchOrders: () => Promise<void>
  onDone?: () => void
}

export interface OrderActions {
  onClose: () => void
  onAccept: (prepTimeMinutes: number) => Promise<void>
  onReject: (code: string, text: string) => Promise<void>
  onVerifyProof: () => Promise<void>
  onRejectProof: () => Promise<void>
  onConfirmDirectPayment: (prepTimeMinutes: number) => Promise<void>
  onExtend: () => Promise<void>
  onReady: () => Promise<void>
  onCancel: (code: string, text: string) => Promise<void>
  onCallDriver?: (o: OrderVM) => void
  /** La cajera corrigio el pedido (0190). */
  onEdited?: () => void
}

export function useOrderActions({
  selected,
  supportWhatsapp,
  bizName,
  refetchOrders,
  onDone,
}: OrderActionsDeps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }, [])

  const post = useCallback((path: string, body: unknown) => api.post(path, body), [])

  const supportPhone = normalizeSupportPhone(supportWhatsapp)

  const actions: OrderActions = {
    onClose: () => onDone?.(),
    onAccept: async (prep) => {
      await run(async () => {
        if (!selected) return
        const id = selected.rowId
        const isPrepaid = selected.payment === 'prepaid'

        if (selected.status === 'validando') {
          const res = (await post(`/business/orders/${id}/validate`, {
            pass: true,
            prepTimeMinutes: prep,
          })) as { status?: string }
          if (res?.status === 'pending_acceptance') {
            await post(`/business/orders/${id}/transition`, {
              action: 'accept',
              prepTimeMinutes: prep,
            })
          }
        } else {
          await post(`/business/orders/${id}/transition`, {
            action: 'accept',
            prepTimeMinutes: prep,
          })
        }
        onDone?.()
        await refetchOrders()
      })
    },
    onReject: async (code, text) => {
      await run(async () => {
        if (!selected) return
        const id = selected.rowId
        const hasProof = selected.proofAttempt >= 1
        if (hasProof)
          await post(`/business/orders/${id}/validate`, {
            pass: false,
            reason: text,
            reasonCode: code,
          })
        else
          await post(`/business/orders/${id}/transition`, {
            action: 'cancel',
            reason: 'business_cancelled',
            reasonCode: code,
            reasonText: text,
            cancelReasonDetail: code,
          })
        onDone?.()
        await refetchOrders()
      })
    },
    onVerifyProof: async () => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, { pass: true })
        await refetchOrders()
      })
    },
    /**
     * Confirmación directa del prepago desde `awaiting_payment`: el mismo
     * endpoint de validación, que desde la 0181 acepta ese estado y manda el
     * pedido a cocina marcando el pago como verificado.
     *
     * `onDone?.()` cierra el detalle: el pedido cambia de columna y quedarse
     * mirando la ficha vieja es la vía rápida a pulsar dos veces.
     */
    onConfirmDirectPayment: async (prep) => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, {
          pass: true,
          prepTimeMinutes: prep,
        })
        onDone?.()
        await refetchOrders()
      })
    },
    onRejectProof: async () => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, {
          pass: false,
          reason: 'Comprobante inválido',
          reasonCode: 'invalid_proof',
        })
        onDone?.()
        await refetchOrders()
      })
    },
    onExtend: async () => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/extend-prep`, {})
        await refetchOrders()
      })
    },
    onReady: async () => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, { action: 'ready' })
        onDone?.()
        await refetchOrders()
      })
    },
    onCancel: async (code, text) => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, {
          action: 'cancel',
          reason: 'business_cancelled',
          reasonCode: code,
          reasonText: text,
          cancelReasonDetail: code,
        })
        onDone?.()
        await refetchOrders()
      })
    },
    onCallDriver: supportPhone
      ? (o: OrderVM) => {
          const url = supportWhatsappUrl(
            supportPhone,
            urgentDriverMessage({
              bizName,
              shortId: o.id,
              minutesWaiting: o.bufferMinutes,
              addressRef: o.addressRef,
            }),
          )
          window.open(url, '_blank', 'noopener,noreferrer')
        }
      : undefined,

    // El modal ya guardo cuando esto corre: solo hay que traer la fila nueva.
    // Sin esto la cajera cierra el modal y sigue viendo el importe viejo
    // hasta el siguiente sondeo, dudando de si se guardo.
    onEdited: () => {
      void refetchOrders()
    },
  }

  const onConfirmPause = useCallback(
    async (min: number | null) => {
      await run(async () => {
        await post('/business/pause', { minutes: min })
        await refetchOrders()
      })
    },
    [run, post, refetchOrders],
  )

  const onResume = useCallback(async () => {
    await run(async () => {
      await api.delete('/business/pause')
      await refetchOrders()
    })
  }, [run, refetchOrders])

  return {
    actions,
    busy,
    error,
    supportPhone,
    onConfirmPause,
    onResume,
  }
}
