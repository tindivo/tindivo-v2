'use client'

import { ApiError } from '@tindivo/api-client'
import type { PaymentIntent } from '@tindivo/contracts'
import { useRef } from 'react'
import { saveAddress } from '@/components/auth-onboarding/persistence'
import type { CheckoutState } from '@/features/checkout/hooks/use-checkout-state'
import { cashError } from '@/features/checkout/lib/cash'
import type { GeoBlockKind, GpsValidationPayload, OrderResult } from '@/features/checkout/types'
import { deliveryPointQuality } from '@/lib/address-record'
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
    pickupTiming,
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
    refreshMaxChange,
    customerNote,
    hasDeliveryHistory,
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
    // EL RECOJO YA NO SE SALTA ESTO, Y LOS DOS TIPOS DE RECOJO NO SON IGUALES.
    //
    // Antes había un `deliveryMethod !== 'delivery'` aquí que devolvía `{}` sin
    // pedir nada. El efecto no era «pickup sin antifraude»: era el contrario.
    // `create_customer_order` evalúa `customer_contraentrega_decision` ANTES de
    // ramificar por método, así que un recojo en efectivo llegaba sin
    // coordenadas, `customer_gps_in_coverage` daba false, y el vecino sin
    // historial que quería recoger su comida se estrellaba contra «Pago
    // adelantado requerido». El canal estaba cerrado, no abierto.
    //
    //   · 'later' -> se comporta EXACTAMENTE como un delivery. La comida se
    //     hace sin nadie delante, y el GPS es lo único que distingue al vecino
    //     de alguien que encargó un plantón desde otra provincia.
    //
    //   · 'now'   -> se captura, pero NUNCA bloquea. La garantía de ese pedido
    //     es la cajera mirando al cliente, no la coordenada; y el mostrador es
    //     bajo techo, que es justo donde el GPS falla. Un `issue` aquí abriría
    //     `GeoBlockSheet` («paga por adelantado») a alguien que está de pie
    //     delante de la caja con el billete en la mano. La lectura se manda
    //     igual porque como EVIDENCIA vale —queda en el pedido—; lo que no hace
    //     es decidir.
    const recojoPresencial = deliveryMethod === 'pickup' && pickupTiming === 'now'
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

      // 0211: estos dos cortes protegen una relación de confianza YA GANADA —
      // una cuenta con `compra_previa` que de golpe reporta estar lejos, o con
      // señal mala, es sospechosa y merece el sheet de reintentar/prepagar.
      // Un cliente SIN historial no tiene esa confianza que proteger, y
      // `customer_gps_in_coverage` (servidor) SÍ acepta `gps_low_accuracy` para
      // su crédito de GPS (DECISIONS.md §8) — cortar aquí antes de mandarlo
      // dejaba ese camino inalcanzable desde la app real, aunque el backend y
      // los tests lo dieran por bueno. Para él, que decida el servidor.
      if (
        accuracyM > cfg.maxAccuracyM &&
        selectedPayment !== 'prepaid' &&
        hasDeliveryHistory &&
        !recojoPresencial
      ) {
        return { issue: 'low_accuracy' }
      }
      if (
        distance > cfg.warningRadiusKm &&
        selectedPayment !== 'prepaid' &&
        hasDeliveryHistory &&
        !recojoPresencial
      ) {
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
      // Un recojo presencial NO se cae por un GPS que no fija. Se registra el
      // intento fallido —`failed` es un hecho que vale guardar— y sigue: quien
      // decide es la cajera, y a ella no le hace falta una coordenada para ver
      // que tiene a alguien delante.
      if (recojoPresencial) return { payload: { method: 'failed' } }
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

    // `deliveryMethod !== 'pickup'`: en recojo no se pregunta el billete ni se
    // manda, así que este techo —que es el del sencillo del motorizado— no
    // tiene nada contra qué comparar. Ver el `cashPayingWith` de más abajo.
    if (selectedPayment === 'pending_cash' && deliveryMethod !== 'pickup') {
      // El techo se vuelve a PREGUNTAR aquí, no se reutiliza el que trajo la
      // pantalla al montar: entre que el cliente eligió su billete y tocó
      // confirmar, la cajera pudo declarar otro sencillo. Y la regla es la
      // misma función que pinta el selector — ver `lib/cash.ts`.
      const freshMaxChange = await refreshMaxChange()
      const mal = cashError(payingWithCash(), { total, maxCashBill, maxChange: freshMaxChange })
      if (mal) {
        setError(mal)
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
      // En recojo NO se manda: el billete es un dato del sencillo que la caja
      // le adelanta al motorizado (0146), y en el mostrador no hay tal adelanto.
      // Mandarlo dispararia los topes R2/R3 de `create_customer_order` contra un
      // vuelto que la propia caja tiene.
      cashPayingWith:
        selectedPayment === 'pending_cash' && deliveryMethod !== 'pickup'
          ? Math.round(Math.round(payingWithCash() / 0.5) * 0.5 * 100) / 100
          : undefined,
      /*
        EL ÚNICO CAMPO DE LOGÍSTICA QUE SE ESCAPABA.
        Sus cinco vecinos —`deliveryReference`, `customerNotes`,
        `deliveryPointQuality`, `coordinates`— ya estaban gateados por método
        desde la 0219; este no, y el spec lo pedía explícitamente (§2.2). El
        resultado era que un pedido de mostrador se guardaba con la dirección de
        casa de quien lo hizo: un dato que nadie va a usar, que la ficha del
        tablero llegaba a pintar, y que no hay motivo para tener ahí.
      */
      deliveryAddress:
        deliveryMethod === 'delivery'
          ? (selectedAddress?.line ?? (manualAddr.line.trim() || undefined))
          : undefined,
      deliveryReference: deliveryMethod === 'delivery' ? state.reference : undefined,
      // Solo tiene sentido con delivery: en un recojo no hay motorizado que la
      // lea. `undefined` y no `''` para que el contrato la trate como ausente.
      customerNotes: deliveryMethod === 'delivery' ? customerNote.trim() || undefined : undefined,
      /*
        LA CALIDAD DEL PUNTO, no la del GPS de quien pide (0207).

        Sale de la dirección elegida —o de la que se acaba de escribir a mano—,
        y el pedido se la queda como foto: si el cliente corrige su dirección
        tres días después, el pedido de anteayer no cambia de historia.

        En pickup no se manda: no hay punto de entrega ni motorizado que lo lea.
      */
      ...(deliveryMethod === 'delivery'
        ? deliveryPointQuality(selectedAddress, manualAddr, new Date().toISOString())
        : {}),
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
      // Obligatorio en recojo por contrato, prohibido en delivery. `null` (la
      // pregunta sin contestar) no llega aqui: `useCheckoutValidation` corta
      // antes con su propia falta.
      pickupTiming: deliveryMethod === 'pickup' ? (pickupTiming ?? undefined) : undefined,
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
