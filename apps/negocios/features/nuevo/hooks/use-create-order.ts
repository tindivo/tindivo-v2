'use client'

import { ApiError } from '@tindivo/api-client'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useDashboard } from '@/components/dashboard/chrome'
import { api } from '@/lib/api'
import {
  clearIdempotencyKey,
  getOrCreateIdempotencyKey,
  mapFormError,
  num,
  regenerateIdempotencyKey,
} from '../lib/format'
import type { Payment } from '../types'

/** Banda de distancia. `null` = la cajera todavía no eligió. */
export type DistanceBand = 'near' | 'far'

export interface CreateOrderPayload {
  prep: number
  name: string
  phone: string
  reference: string
  payment: Payment
  /**
   * TOTAL con envío incluido, tal como la cajera se lo dijo al cliente. La
   * comida la deduce el RPC restando el envío de la banda (0129); esta pantalla
   * no resta nada, a propósito — el envío sale de una cadena de fallback que
   * solo la función de la DB resuelve, y un navegador que reste mal cobraría el
   * envío dos veces sin dejar rastro.
   */
  amount: string
  paysWith: string
  walletPart: string
  cashPart: string
  /**
   * SIN valor por defecto a propósito. El endpoint la exige (zod sin
   * `.optional()`), así que un pedido sin banda se rechaza con 422 en vez de
   * colarse como `near`. El selector de los dos botones se construye en la
   * Parte E; hasta entonces esto es el contrato, no la interacción.
   */
  band: DistanceBand | null
  /**
   * Fila del directorio que la cajera confirmó en el popup, o `null`.
   *
   * Es lo que le dice al motorizado a QUÉ fila escribirle el GPS al entregar.
   * Va `null` cuando el cliente es nuevo, cuando eligió "escribir dirección
   * nueva" o cuando editó el texto y se desvinculó — y en esos casos el RPC
   * CREA la fila a partir del teléfono y la referencia, así que la próxima vez
   * ya sale sola.
   */
  addressDirectoryId: string | null
}

export function useCreateOrder() {
  const router = useRouter()
  const submittingRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * CREAR ES LA ÚNICA MUTACIÓN QUE NO REFRESCABA EL TABLERO, Y POR ESO EL
   * PEDIDO RECIÉN HECHO "NO ESTABA".
   *
   * Las nueve acciones de `use-order-actions.ts` llaman a `refetchOrders()`
   * después de mutar. Esta no: hacía `router.replace('/')` y ya. Y como el
   * chrome del dashboard —que es quien tiene el estado `rows`— vive en el
   * LAYOUT, navegar `/nuevo → /` no lo remonta ni dispara ninguna consulta. El
   * tablero se quedaba tal cual estaba antes de abrir el formulario.
   *
   * Así que el pedido solo aparecía si llegaba el evento de Realtime. Y
   * Realtime se deja eventos por el camino: correlacionando en los logs de
   * producción la hora de cada pedido manual con el siguiente refresco del
   * tablero, del mismo negocio y en la misma sesión, unos salieron en ~1s y
   * otros tardaron 97s y 393s — el tiempo que tardaba el poll de respaldo en
   * pasar por ahí. El motorizado mientras tanto sí lo veía, porque su app
   * sondea cada 15s y recibe push.
   *
   * Esto lo vuelve determinista: el pedido está en `rows` ANTES de que el
   * tablero se pinte, sin depender de que llegue ningún evento.
   */
  const { refetchOrders } = useDashboard()

  const submit = async (payload: CreateOrderPayload, canSubmit: boolean) => {
    if (submittingRef.current || !canSubmit) return
    submittingRef.current = true
    setBusy(true)
    setError(null)

    const deliveryMethod = 'delivery'
    const amountN = num(payload.amount)
    const isCashish = payload.payment === 'pending_cash' || payload.payment === 'pending_mixed'
    const cleanPhone = payload.phone.replace(/\D/g, '')

    const idempotencyKey = getOrCreateIdempotencyKey()
    const orderPayload = {
      deliveryMethod,
      paymentIntent: payload.payment === 'pending_wallet' ? 'pending_yape' : payload.payment,
      // Sin `|| undefined`: el endpoint lo exige y el formulario no deja
      // enviar vacío. Mandar `undefined` aquí solo convertiría un aviso claro
      // en un 422.
      customerName: payload.name.trim(),
      customerPhone: cleanPhone || undefined,
      deliveryReference: payload.reference.trim() || undefined,
      deliveryDistanceBand: payload.band,
      prepTimeMinutes: payload.prep,
      totalAmount: amountN,
      clientPaysWith: isCashish && num(payload.paysWith) > 0 ? num(payload.paysWith) : undefined,
      yapeAmount: payload.payment === 'pending_mixed' ? num(payload.walletPart) : undefined,
      cashAmount: payload.payment === 'pending_mixed' ? num(payload.cashPart) : undefined,
      addressDirectoryId: payload.addressDirectoryId ?? undefined,
    }

    try {
      await api.post('/business/orders', orderPayload, idempotencyKey)
      clearIdempotencyKey()
      // `force` porque el cooldown de 1s no aplica aquí: acabamos de escribir y
      // sabemos que el servidor ya lo tiene. `refetchOrders` no rechaza nunca
      // —`usePolledQuery` se traga sus propios errores—, así que un fallo de red
      // deja el tablero como estaba pero NO atrapa a la cajera en el formulario.
      await refetchOrders({ force: true })
      router.replace('/')
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'idempotency_conflict' ||
          (err.status === 409 && err.message.toLowerCase().includes('idempotency'))
        ) {
          const freshKey = regenerateIdempotencyKey()
          try {
            await api.post('/business/orders', orderPayload, freshKey)
            clearIdempotencyKey()
            await refetchOrders({ force: true })
            router.replace('/')
            return
          } catch (retryErr) {
            if (retryErr instanceof ApiError && retryErr.status >= 400 && retryErr.status < 500) {
              regenerateIdempotencyKey()
            }
            setError(mapFormError(retryErr))
            setBusy(false)
            submittingRef.current = false
            return
          }
        }
        if (err.status >= 400 && err.status < 500) {
          regenerateIdempotencyKey()
        }
      }
      setError(mapFormError(err))
      setBusy(false)
      submittingRef.current = false
    }
  }

  return { submit, busy, error }
}
