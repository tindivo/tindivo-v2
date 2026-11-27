'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrderDetail } from '@/lib/orders/detail-cache'
import {
  type DoorPayment,
  doorPayment,
  mergeDoor,
  recheckWithTimeout,
} from '@/lib/orders/door-payment'
import type { OrderDetailResponse } from '@/lib/types'

const RECHECK_TIMEOUT_MS = 4000

type DoorOrder = OrderDetailResponse['order']

function needsRecheck(order: DoorOrder, door: DoorPayment): boolean {
  return order.paymentIntent === 'pending_yape' && door.mode === 'collect'
}

/**
 * El cobro en la puerta, siempre al día (dinero).
 *
 * El negocio puede confirmar el ingreso del pago único mientras el motorizado
 * camina, y tanto la tarjeta como la hoja se abrieron con un detalle de antes:
 * sin releer, le harían cobrar de nuevo algo que ya entró.
 *
 * - Se recalcula cuando cambia el detalle que llega por props.
 * - En un `pending_yape` que se muestra como «cobra», relee al montar (tope de
 *   4 s) y cancela al desmontar.
 * - `recheckNow()` repite la relectura (la hoja la usa al pulsar confirmar) y
 *   devuelve lo que quedó.
 *
 * Si la relectura falla o tarda, se sigue con lo que había y `checkFailed` lo
 * dice: la entrega (y la cola offline) nunca se bloquea por esto.
 */
export function useDoorPayment(order: DoorOrder): {
  door: DoorPayment
  checking: boolean
  checkFailed: boolean
  recheckNow: () => Promise<{ door: DoorPayment; failed: boolean }>
} {
  const [door, setDoor] = useState<DoorPayment>(() => doorPayment(order))
  const [checking, setChecking] = useState(() => needsRecheck(order, doorPayment(order)))
  const [checkFailed, setCheckFailed] = useState(false)

  const doorRef = useRef(door)
  doorRef.current = door
  const mounted = useRef(true)
  const orderId = order.id

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // El detalle cambió (otra lectura trajo la confirmación, la captura…): se
  // recalcula desde él, sin que lo confirmado retroceda por un dato viejo.
  useEffect(() => {
    setDoor((prev) => mergeDoor(prev, doorPayment(order)))
  }, [
    order.paymentIntent,
    order.paymentVerifiedAt,
    order.hasPaymentProof,
    order.paymentProofStatus,
  ])

  const recheck = useCallback(async (): Promise<{ door: DoorPayment; failed: boolean }> => {
    const stale = doorRef.current
    const { door: next, failed } = await recheckWithTimeout(
      stale,
      () => fetchOrderDetail(orderId, { fresh: true }).then((d) => doorPayment(d.order)),
      RECHECK_TIMEOUT_MS,
    )
    if (mounted.current) {
      setDoor(next)
      setCheckFailed(failed)
    }
    return { door: next, failed }
  }, [orderId])

  const recheckNow = useCallback(async (): Promise<{ door: DoorPayment; failed: boolean }> => {
    if (mounted.current) setChecking(true)
    try {
      return await recheck()
    } finally {
      if (mounted.current) setChecking(false)
    }
  }, [recheck])

  // Al montar: solo el pago único que aún se cobra.
  useEffect(() => {
    if (!needsRecheck(order, doorRef.current)) {
      setChecking(false)
      return
    }
    void recheckNow()
  }, [])

  return { door, checking, checkFailed, recheckNow }
}
