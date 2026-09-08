'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import type { OrderVM } from '@/lib/orders/view-model'
import {
  customerWhatsappDigits,
  normalizeSupportPhone,
  pickupReadyMessage,
  supportWhatsappUrl,
  urgentDriverMessage,
} from '@/lib/support'

export interface OrderActionsDeps {
  selected: OrderVM | null
  supportWhatsapp: string | null
  bizName: string
  refetchOrders: () => Promise<void>
  onDone?: () => void
}

export interface OrderActions {
  onClose: () => void
  /**
   * Aceptar el pedido y mandarlo a cocina.
   *
   * `paymentReal` SOLO viaja en un recojo «ahora» que no sea prepago: ahí el
   * cliente está de pie en la caja y `advance_order` exige el cobro para
   * aceptar (0224). En todo lo demás va `undefined` y la RPC ni lo mira.
   */
  onAccept: (prepTimeMinutes: number, paymentReal?: 'paid_cash' | 'paid_yape') => Promise<void>
  onReject: (code: string, text: string) => Promise<void>
  onVerifyProof: () => Promise<void>
  onRejectProof: () => Promise<void>
  onConfirmDirectPayment: (prepTimeMinutes: number) => Promise<void>
  onExtend: () => Promise<void>
  onReady: () => Promise<void>
  /**
   * RECOJO · el cliente vino y se llevo su pedido.
   *
   * Es el `deliver` del mostrador.
   *
   * `paymentReal` va SOLO cuando el cobro pasa aqui, o sea cuando nadie lo
   * declaro antes: un recojo manual que la cajera toma por telefono y cobra al
   * entregar. En un recojo «ahora» el dinero entro al aceptar (0224) y en un
   * prepago llego antes, asi que se manda `undefined` y la RPC usa lo que ya
   * hay en la fila.
   *
   * NO se manda un valor de relleno. Pasar 'paid_cash' por defecto acertaria
   * solo porque el COALESCE de la RPC lo descarta — y el dia que ese orden
   * cambie, un cobro por Yape quedaria registrado como efectivo sin que nadie
   * lo note hasta cuadrar la caja.
   */
  onHandover: (paymentReal?: 'paid_cash' | 'paid_yape') => Promise<void>
  /**
   * RECOJO · nadie vino por la comida.
   *
   * Cancela y escribe el strike. La espera minima la impone `advance_order`
   * (`noShowWaitMinutes`) y su rechazo llega como texto: NO se replica aqui un
   * contador que tendria que envejecer a la vez que el de la base.
   */
  onPickupNoShow: () => Promise<void>
  /**
   * RECOJO · avisar al cliente por WhatsApp que su pedido ya esta listo (0221).
   *
   * `null` cuando el pedido no tiene un movil peruano al que escribir: la UI
   * ensena el estado alternativo en vez de un boton que abre un chat con nadie.
   * Mismo criterio que `onCallDriver` con el numero de soporte.
   */
  onNotifyPickup: (() => Promise<void>) | null
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
    onAccept: async (prep, paymentReal) => {
      await run(async () => {
        if (!selected) return
        const id = selected.rowId

        if (selected.status === 'validando') {
          const res = (await post(`/business/orders/${id}/validate`, {
            pass: true,
            prepTimeMinutes: prep,
          })) as { status?: string }
          if (res?.status === 'pending_acceptance') {
            await post(`/business/orders/${id}/transition`, {
              action: 'accept',
              prepTimeMinutes: prep,
              paymentReal,
            })
          }
        } else {
          await post(`/business/orders/${id}/transition`, {
            action: 'accept',
            prepTimeMinutes: prep,
            paymentReal,
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
    onHandover: async (paymentReal) => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, {
          action: 'handover',
          paymentReal,
        })
        onDone?.()
        await refetchOrders()
      })
    },
    onPickupNoShow: async () => {
      await run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, {
          action: 'pickup_no_show',
        })
        onDone?.()
        await refetchOrders()
      })
    },
    /**
     * EL CHAT SE ABRE PRIMERO, Y EL SELLO VA DESPUES.
     *
     * `window.open` tiene que salir del gesto del dedo o el navegador lo trata
     * como popup y lo bloquea; un `await` por delante rompe esa cadena. Asi que
     * primero se abre WhatsApp —que es lo que la cajera fue a hacer— y luego se
     * sella, sin `run()`: si el sello falla, ella ya tiene el chat delante y un
     * error rojo en la ficha solo la confundiria sobre algo que si funciono.
     * Lo unico que se pierde es la marca «Avisado hh:mm».
     */
    onNotifyPickup: (() => {
      if (!selected) return null
      const digits = customerWhatsappDigits(selected.phone)
      if (!digits) return null
      const id = selected.rowId
      return async () => {
        window.open(
          supportWhatsappUrl(
            digits,
            pickupReadyMessage({
              bizName,
              shortId: selected.id,
              customerName: selected.customer,
              // Un prepago ya esta pagado: recordarle el monto es invitarlo a
              // pagarlo dos veces.
              totalACobrar: selected.payment === 'prepaid' ? null : selected.total,
            }),
          ),
          '_blank',
          'noopener,noreferrer',
        )
        try {
          await post(`/business/orders/${id}/notify-pickup`, {})
          await refetchOrders()
        } catch {
          // El aviso ya salio. El sello es contabilidad, no el trabajo.
        }
      }
    })(),
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
