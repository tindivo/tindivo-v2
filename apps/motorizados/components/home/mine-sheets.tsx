'use client'

import { ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import { notifyDriverSuccess } from '@/components/driver-toast'
import { type OrderSheet, OrderSheets } from '@/components/order/order-sheets'
import { deliveredMessage } from '@/lib/orders/delivered-message'
import { fetchOrderDetail, invalidateOrderDetail } from '@/lib/orders/detail-cache'
import { createDriverAudioTrigger } from '@/lib/sound'
import { postTransition } from '@/lib/transitions'
import type { OrderDetailResponse } from '@/lib/types'

/** Qué pidió el gesto. Cada intención abre la hoja que le corresponde. */
export type MineSheetIntent = 'recoger' | 'cobrar' | 'soltar'
export interface MineSheetTarget {
  orderId: string
  intent: MineSheetIntent
}

/**
 * La hoja que le toca a la intención, según en qué paso está el pedido AHORA.
 *
 * Se decide con el detalle recién pedido y no con lo que dijo la tarjeta: entre
 * el gesto y la respuesta el pedido pudo cambiar (lo transfirieron, lo soltó
 * otro dispositivo). Si ya no está en ese paso, no se abre nada — mejor no
 * mostrar una hoja que el servidor va a rechazar.
 */
function sheetFor(intent: MineSheetIntent, detail: OrderDetailResponse): OrderSheet | null {
  const { order } = detail
  if (intent === 'recoger') return order.status === 'waiting_at_restaurant' ? 'pickup' : null
  if (intent === 'soltar') {
    return order.status === 'heading_to_restaurant' || order.status === 'waiting_at_restaurant'
      ? 'release'
      : null
  }
  if (order.status !== 'picked_up' || !order.arrivedAtCustomerAt) return null
  // EL GATE DE LA DIRECCIÓN, igual que en la ficha: solo en pedidos MANUALES sin
  // ubicación guardada. Ver `OrderSheets`.
  const needsCapture =
    order.isManual && (order.deliveryCoordinatesLat == null || order.deliveryCoordinatesLng == null)
  return needsCapture ? 'capture:before_deliver' : 'deliver'
}

/**
 * Las hojas de cobro, soltar y recogida adelantada, DENTRO de «Míos».
 *
 * Antes el gesto navegaba a la ficha y esperaba su carga para abrir la hoja: el
 * paso con más fricción del viaje. Ahora la hoja se abre sobre la bandeja, con el
 * detalle ya pedido desde que empezó el arrastre (`fetchOrderDetail`), y al
 * cerrarla sigues donde estabas.
 *
 * Los formularios son los de la ficha (`OrderSheets`): una sola versión del que
 * toca dinero. Lo único propio de aquí es qué pasa DESPUÉS de la transición:
 * refrescar el board en vez de repintar una ficha.
 */
export function MineSheets({
  target,
  now,
  onClose,
  onChanged,
}: {
  target: MineSheetTarget | null
  now: number
  onClose: () => void
  /** Refresca el board: el pedido cambió de paso, o dejó de ser mío. */
  onChanged: () => Promise<void>
}) {
  const [detail, setDetail] = useState<OrderDetailResponse | null>(null)
  const [sheet, setSheet] = useState<OrderSheet | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const orderId = target?.orderId
  const intent = target?.intent

  useEffect(() => {
    if (!orderId || !intent) {
      setDetail(null)
      setSheet(null)
      return
    }
    let cancelled = false
    fetchOrderDetail(orderId)
      .then((d) => {
        if (cancelled) return
        const next = sheetFor(intent, d)
        if (!next) {
          onClose()
          return
        }
        setDetail(d)
        setSheet(next)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? (err.problem.detail ?? err.message)
            : 'No se pudo abrir el pedido',
        )
        onClose()
      })
    return () => {
      cancelled = true
    }
  }, [orderId, intent, onClose])

  // El aviso de error no debe quedarse para siempre: se lee y se va.
  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(null), 5000)
    return () => window.clearTimeout(t)
  }, [error])

  async function act(action: string, params: Record<string, unknown> = {}): Promise<boolean> {
    if (!orderId || !detail) return false
    // El audio del navegador exige un gesto reciente: se arma ANTES del await.
    const trigger = action === 'deliver' ? createDriverAudioTrigger('orderDelivered') : null
    setBusy(true)
    setError(null)
    try {
      await postTransition(orderId, action, params)
      invalidateOrderDetail(orderId)
      if (action === 'deliver') {
        trigger?.()
        notifyDriverSuccess(deliveredMessage(detail.order, params))
      }
      await onChanged()
      return true
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo completar',
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="fixed inset-x-4 top-[calc(56px+env(safe-area-inset-top))] z-[70] mx-auto max-w-[448px] rounded-2xl bg-danger-soft px-4 py-3 text-caption font-semibold text-danger shadow-lg"
        >
          {error}
        </p>
      )}
      {orderId && detail && (
        <OrderSheets
          orderId={orderId}
          detail={detail}
          sheet={sheet}
          onSheet={(next) => {
            setSheet(next)
            if (next === null) onClose()
          }}
          now={now}
          busy={busy}
          onAct={act}
          onReload={async () => {
            setDetail(await fetchOrderDetail(orderId, { fresh: true }))
          }}
          onError={setError}
        />
      )}
    </>
  )
}
