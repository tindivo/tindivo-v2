'use client'

import { ApiError } from '@tindivo/api-client'
import type { PaymentIntent } from '@tindivo/contracts'
import { useRef } from 'react'
import { saveAddress } from '@/components/auth-onboarding/persistence'
import type { CheckoutState } from '@/features/checkout/hooks/use-checkout-state'
import type { GeoBlockKind, GpsValidationPayload, OrderResult } from '@/features/checkout/types'
import { api } from '@/lib/api'
import { getLocationValidation, haversineKm } from '@/lib/coverage'
import { getCurrentPositionHA } from '@/lib/geolocation'

export interface CheckoutActions {
  getIdempotencyKey: () => string
  regenerateIdempotencyKey: () => string
  collectGpsValidation: (
    selectedPayment: PaymentIntent,
    skipGps: boolean,
  ) => Promise<{ payload?: GpsValidationPayload; issue?: GeoBlockKind }>
  placeOrder: (options?: { paymentIntent?: PaymentIntent; skipGps?: boolean }) => Promise<void>
}

/**
 * Qué pasa justo después de crear el pedido.
 *
 * Antes había una pantalla intermedia (`ConfirmedView`) con el código y un botón
 * «Ver seguimiento». Se quitó porque cobraba un clic por nada: el tracking ya
 * enseña el `#código` en su cabecera y además trae lo único que el cliente puede
 * necesitar en ese momento — **el botón de cancelar**, mientras el restaurante no
 * acepte. Quien enviaba un pedido «para probar» y volvía al inicio desde esa
 * pantalla no llegaba a saber que podía deshacerlo.
 *
 * En prepago también es el destino correcto: subir el comprobante de Yape vive
 * en el tracking (`tracking-prepay.tsx`), no en el checkout.
 *
 * `replace` y no `push`: el checkout se queda sin carrito en cuanto el pedido
 * existe (`cart.clear()`), así que dejarlo en el historial solo sirve para que
 * «atrás» lleve a una pantalla vacía que rebota sola.
 *
 * `setConfirmed` se mantiene aunque ya no pinte nada: es el guard que impide que
 * los efectos de «carrito vacío» y «negocio en modo catálogo» redirijan durante
 * el instante que va desde que se limpia el carrito hasta que la navegación
 * ocurre.
 */
export function useCheckoutActions(state: CheckoutState): CheckoutActions {
  const {
    cart,
    deliveryMethod,
    payment,
    cashChoice,
    cashCustom,
    total,
    selectedAddress,
    manualAddr,
    userId,
    phone,
    verifiedPhone,
    name,
    setError,
    setLoading,
    setLocating,
    setGeoBlock,
    setConfirmed,
    router,
    setBlocked,
    setShowOtpSheet,
    maxCashBill,
    maxChange,
    refreshMaxChange,
  } = state

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  function getIdempotencyKey(): string {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID()
    }
    return idempotencyKeyRef.current
  }

  function regenerateIdempotencyKey(): string {
    idempotencyKeyRef.current = crypto.randomUUID()
    return idempotencyKeyRef.current
  }

  async function collectGpsValidation(
    selectedPayment: PaymentIntent,
    skipGps: boolean,
  ): Promise<{ payload?: GpsValidationPayload; issue?: GeoBlockKind }> {
    if (deliveryMethod !== 'delivery') return {}
    if (skipGps) return { payload: { method: 'manual_skip_prepaid' } }

    try {
      const cfg = await getLocationValidation()
      const fix = await getCurrentPositionHA(cfg.timeoutMs)
      const distance = haversineKm(
        { lat: fix.lat, lng: fix.lng },
        { lat: cfg.centerLat, lng: cfg.centerLng },
      )
      const accuracyM = fix.accuracyM
      const method = accuracyM > cfg.maxAccuracyM ? 'gps_low_accuracy' : 'gps_high_accuracy'

      if (accuracyM > cfg.maxAccuracyM && selectedPayment !== 'prepaid') {
        return { issue: 'low_accuracy' }
      }
      if (distance > cfg.warningRadiusKm && selectedPayment !== 'prepaid') {
        return { issue: 'far' }
      }

      return {
        payload: {
          lat: fix.lat,
          lng: fix.lng,
          accuracyM,
          distanceToCenterKm: Math.round(distance * 1000) / 1000,
          method,
        },
      }
    } catch {
      if (selectedPayment === 'prepaid') return { payload: { method: 'manual_skip_prepaid' } }
      return { issue: 'unavailable' }
    }
  }

  function payingWithCash(): number {
    return cashChoice === 'exact'
      ? total
      : cashChoice === 'custom'
        ? Number.parseFloat(cashCustom) || 0
        : Number(cashChoice)
  }

  async function placeOrder(options?: { paymentIntent?: PaymentIntent; skipGps?: boolean }) {
    const selectedPayment = options?.paymentIntent ?? payment
    setError(null)

    // Validar cambio de teléfono
    const cleanPhone = phone.replace(/\D/g, '')
    const phoneChanged = cleanPhone !== verifiedPhone
    if (phoneChanged) {
      setShowOtpSheet(true)
      return
    }

    if (selectedPayment === 'pending_cash') {
      const paying = payingWithCash()
      if (paying < total) {
        setError('El monto con el que pagarás debe cubrir el total del pedido')
        return
      }
      if (paying > maxCashBill) {
        setError(`El monto máximo con el que puedes pagar es S/ ${maxCashBill.toFixed(2)}.`)
        return
      }
      const change = Math.round((paying - total) * 100) / 100
      const freshMaxChange = await refreshMaxChange()
      if (change > freshMaxChange) {
        if (freshMaxChange <= 0) {
          setError(
            `Esta noche el negocio no tiene vuelto: paga con S/ ${total.toFixed(2)} exactos o elige Yape.`,
          )
          return
        }
        const maxCash = Math.floor((total + freshMaxChange) * 100) / 100
        setError(
          `El vuelto sería S/ ${change.toFixed(2)} y esta noche hay hasta S/ ${freshMaxChange.toFixed(2)}. Paga con S/ ${maxCash.toFixed(2)} o menos, o elige Yape.`,
        )
        return
      }
    }

    setLoading(true)
    let gpsPayload: GpsValidationPayload | undefined

    // GPS antifraude: ubicación normal continúa, zona de advertencia va a
    // validación manual, y GPS fallido/incierto permite continuar con prepago.
    setLocating(true)
    try {
      const gps = await collectGpsValidation(selectedPayment, Boolean(options?.skipGps))
      if (gps.issue) {
        setGeoBlock(gps.issue)
        setLoading(false)
        return
      }
      gpsPayload = gps.payload
    } catch {
      // PERMISSION_DENIED / POSITION_UNAVAILABLE / TIMEOUT / sin API.
      setGeoBlock('unavailable')
      setLoading(false)
      return
    } finally {
      setLocating(false)
    }

    // Sin dirección guardada: persistir la ubicación capturada (mapa + referencia)
    // como "Casa" por defecto para reutilizarla. Best-effort: no bloquea el pedido.
    if (deliveryMethod === 'delivery' && !selectedAddress && manualAddr.coords && userId) {
      try {
        await saveAddress({
          userId,
          label: manualAddr.label,
          line: manualAddr.line,
          reference: manualAddr.reference,
          lat: manualAddr.coords.lat,
          lng: manualAddr.coords.lng,
          accuracyM: manualAddr.accuracyM,
        })
      } catch {
        // El pedido igual lleva las coordenadas; el guardado es secundario.
      }
    }

    const orderPayload = {
      businessId: cart.businessId,
      deliveryMethod,
      paymentIntent: selectedPayment,
      customerName: name.trim() || 'Cliente',
      customerPhone: phone,
      cashPayingWith:
        selectedPayment === 'pending_cash'
          ? Math.round(Math.round(payingWithCash() / 0.5) * 0.5 * 100) / 100
          : undefined,
      deliveryAddress: selectedAddress?.line ?? (manualAddr.line.trim() || undefined),
      deliveryReference: deliveryMethod === 'delivery' ? state.reference : undefined,
      coordinates:
        deliveryMethod !== 'delivery'
          ? undefined
          : selectedAddress?.coordinates_lat != null
            ? {
                lat: Number(selectedAddress.coordinates_lat),
                lng: Number(selectedAddress.coordinates_lng),
              }
            : manualAddr.coords
              ? { lat: manualAddr.coords.lat, lng: manualAddr.coords.lng }
              : undefined,
      gpsValidation: gpsPayload,
      items: cart.lines.map((l) => ({
        menuItemId: l.itemId,
        quantity: l.quantity,
        note: l.note ?? undefined,
        modifiers: l.modifiers.map((m) => m.optionId),
      })),
    }

    const currentKey = getIdempotencyKey()

    try {
      const res = await api.post<{ data: OrderResult }>(
        '/customer/orders',
        orderPayload,
        currentKey,
      )
      setConfirmed(res.data)
      cart.clear()
      regenerateIdempotencyKey()
      router.replace(`/pedido/${res.data.shortId}`)
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === 'idempotency_conflict' ||
          (err.status === 409 && err.message.toLowerCase().includes('idempotency'))
        ) {
          const freshKey = regenerateIdempotencyKey()
          try {
            const res = await api.post<{ data: OrderResult }>(
              '/customer/orders',
              orderPayload,
              freshKey,
            )
            setConfirmed(res.data)
            cart.clear()
            regenerateIdempotencyKey()
            router.replace(`/pedido/${res.data.shortId}`)
            return
          } catch (retryErr) {
            if (retryErr instanceof ApiError && retryErr.status >= 400 && retryErr.status < 500) {
              regenerateIdempotencyKey()
            }
            if (retryErr instanceof ApiError && /bloquead/i.test(retryErr.problem.detail ?? '')) {
              setBlocked(true)
              return
            }
            setError(
              retryErr instanceof ApiError
                ? (retryErr.problem.detail ?? retryErr.message)
                : 'No se pudo crear el pedido',
            )
            setLoading(false)
            return
          }
        }
        if (err.status >= 400 && err.status < 500) {
          // 4xx error (400, 403, 409 validation, 422) -> regenerar clave porque el servidor no creó nada
          regenerateIdempotencyKey()
        }
        if (/bloquead/i.test(err.problem.detail ?? '')) {
          setBlocked(true)
          return
        }
      }
      // 5xx / error de red -> conservar la clave (resultado desconocido)
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : 'No se pudo crear el pedido',
      )
      setLoading(false)
    }
  }

  return {
    getIdempotencyKey,
    regenerateIdempotencyKey,
    collectGpsValidation,
    placeOrder,
  }
}
