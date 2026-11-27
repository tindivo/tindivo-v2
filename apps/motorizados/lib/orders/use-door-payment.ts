'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { fetchOrderDetail } from '@/lib/orders/detail-cache'
import {
  type DoorEvent,
  type DoorPayment,
  type DoorState,
  doorPayment,
  doorReducer,
  initialDoorState,
  needsRecheck,
  recheckWithTimeout,
} from '@/lib/orders/door-payment'
import type { OrderDetailResponse } from '@/lib/types'

const RECHECK_TIMEOUT_MS = 4000

type DoorOrder = OrderDetailResponse['order']

export type RecheckResult = { door: DoorPayment; failed: boolean; aborted: boolean }

/**
 * El cobro en la puerta, siempre al día (dinero).
 *
 * El negocio puede confirmar el ingreso del pago único mientras el motorizado
 * camina, y tanto la tarjeta como la hoja se abrieron con un detalle de antes:
 * sin releer, le harían cobrar de nuevo algo que ya entró.
 *
 * Toda la lógica está en `doorReducer` (puro y probado); este hook solo lo
 * conecta: las respuestas se fusionan contra el estado vigente, nunca contra el
 * de cuando empezó la lectura.
 *
 * - `recheckNow()` repite la relectura (la hoja la usa al pulsar confirmar) y
 *   devuelve la `door` que salió de ese mismo cálculo, más `aborted` si la hoja
 *   ya se desmontó (entonces no se envía nada).
 * - `pollMs`: mientras haga falta releer y la pantalla esté visible, relee cada
 *   `pollMs` y al volver a verse (el QR no se queda desactualizado).
 *
 * Si la relectura falla o tarda, se sigue con lo que había y `checkFailed` lo
 * dice: la entrega (y la cola offline) nunca se bloquea por esto.
 */
export function useDoorPayment(
  order: DoorOrder,
  opts: { pollMs?: number } = {},
): {
  door: DoorPayment
  checking: boolean
  checkFailed: boolean
  recheckNow: () => Promise<RecheckResult>
} {
  const [state, dispatch] = useReducer(
    doorReducer,
    order,
    (o): DoorState => ({ ...initialDoorState(doorPayment(o)), checking: needsRecheck(o) }),
  )
  // Espejo síncrono del estado: el reducer es determinista, así que aplicar el
  // mismo evento aquí y en `dispatch` los mantiene iguales sin esperar al render.
  const stateRef = useRef(state)
  const orderRef = useRef(order)
  orderRef.current = order
  const mounted = useRef(true)
  const orderId = order.id

  const send = useCallback((event: DoorEvent) => {
    stateRef.current = doorReducer(stateRef.current, event)
    dispatch(event)
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // El detalle cambió (otra lectura trajo la confirmación, la captura…): se
  // recalcula desde él, sin que lo confirmado retroceda por un dato viejo.
  useEffect(() => {
    send({ type: 'props', door: doorPayment(order) })
  }, [
    order.paymentIntent,
    order.paymentVerifiedAt,
    order.hasPaymentProof,
    order.paymentProofStatus,
    order.isManual,
    send,
  ])

  const recheckNow = useCallback(async (): Promise<RecheckResult> => {
    if (!needsRecheck(orderRef.current)) {
      return { door: stateRef.current.door, failed: false, aborted: !mounted.current }
    }
    send({ type: 'recheck_start' })
    const gen = stateRef.current.gen
    const { door: fresh, failed } = await recheckWithTimeout(
      stateRef.current.door,
      () => fetchOrderDetail(orderId, { fresh: true }).then((d) => doorPayment(d.order)),
      RECHECK_TIMEOUT_MS,
    )
    const done: DoorEvent = { type: 'recheck_done', gen, door: fresh, failed }
    const next = doorReducer(stateRef.current, done)
    send(done)
    return {
      door: next.door,
      failed: failed && next.door.mode === 'collect',
      aborted: !mounted.current,
    }
  }, [orderId, send])

  // Al montar: solo el pago único que aún se cobra.
  useEffect(() => {
    if (needsRecheck(orderRef.current)) void recheckNow()
  }, [])

  const polling = opts.pollMs != null && needsRecheck(order)
  const pollMs = opts.pollMs
  useEffect(() => {
    if (!polling || !pollMs) return
    const tick = () => {
      if (document.visibilityState === 'visible' && !stateRef.current.checking) void recheckNow()
    }
    const id = setInterval(tick, pollMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [polling, pollMs, recheckNow])

  return { door: state.door, checking: state.checking, checkFailed: state.checkFailed, recheckNow }
}
