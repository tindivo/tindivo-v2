'use client'

import { ApiError } from '@tindivo/api-client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { OrderDetailResponse } from '@/lib/types'
import { AddressCaptureSheet } from './address-capture-sheet'
import { DeliverSheet } from './deliver-sheet'
import { PickupSheet } from './pickup-sheet'
import { ReleaseSheet } from './release-sheet'

/**
 * Qué hoja está abierta. La captura de dirección lleva su motivo dentro del
 * nombre porque decide qué pasa al cerrarla: si era el paso previo a cobrar, el
 * cobro sigue; si fue un ajuste voluntario, termina donde empezó.
 */
export type OrderSheet =
  | 'pickup'
  | 'deliver'
  | 'release'
  | 'capture:before_deliver'
  | 'capture:adjust'

/**
 * Las hojas de un pedido MÍO: recogida adelantada, cobro, soltar y captura de
 * dirección.
 *
 * LAS USAN DOS PANTALLAS —la ficha y «Míos»— y por eso viven aquí y no dentro de
 * ninguna. Eran parte de `pedido/[id]/page.tsx`, y llevarlas a la bandeja copiando
 * el cobro habría dado dos versiones del único formulario que toca dinero.
 *
 * NO EJECUTAN LA TRANSICIÓN: cada pantalla la resuelve a su manera (la ficha
 * repinta su detalle y sugiere WhatsApp; la bandeja refresca el board). Aquí solo
 * se pinta la hoja y se dice qué acción se pide. `onAct` devuelve `true` si salió
 * bien: entonces la hoja se cierra; si falla, se queda abierta para reintentar.
 */
export function OrderSheets({
  orderId,
  detail,
  sheet,
  onSheet,
  now,
  busy,
  onAct,
  onReload,
  onError,
}: {
  orderId: string
  detail: OrderDetailResponse
  sheet: OrderSheet | null
  onSheet: (next: OrderSheet | null) => void
  now: number
  busy: boolean
  onAct: (action: string, params?: Record<string, unknown>) => Promise<boolean>
  /** Vuelve a pedir el detalle (tras guardar la ubicación). */
  onReload: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [captureBusy, setCaptureBusy] = useState(false)
  if (!sheet) return null
  const { order } = detail

  /**
   * Guarda la ubicación en el directorio (0147).
   *
   * NO BLOQUEA LA ENTREGA, y es la regla que gobierna toda esta pieza: si algo
   * falla —red, permiso, coordenada rechazada— se avisa y se sigue igual al
   * cobro. El pedido es lo urgente; la dirección es la mejora de mañana.
   */
  async function saveAddress(captured: {
    lat: number
    lng: number
    accuracyM: number | null
    reference?: string
  }) {
    setCaptureBusy(true)
    onError(null)
    try {
      await api.post(`/driver/orders/${orderId}/address`, {
        lat: captured.lat,
        lng: captured.lng,
        accuracyM: captured.accuracyM,
        reference: captured.reference,
      })
      await onReload()
    } catch (err) {
      onError(
        err instanceof ApiError
          ? `No se guardó la ubicación: ${err.problem.detail ?? err.message}`
          : 'No se guardó la ubicación. El pedido se puede entregar igual.',
      )
    } finally {
      setCaptureBusy(false)
      // Solo se encadena al cobro cuando la captura fue el PASO PREVIO a
      // entregar. Un ajuste voluntario termina donde empezó: el motorizado
      // corrigió el pin y sigue con lo suyo.
      //
      // Y cuando sí encadena, lo hace PASE LO QUE PASE: que la dirección no se
      // guardara no puede dejarlo sin poder cerrar la entrega.
      onSheet(sheet === 'capture:before_deliver' ? 'deliver' : null)
    }
  }

  if (sheet === 'pickup') {
    return (
      <PickupSheet
        detail={detail}
        now={now}
        busy={busy}
        onConfirm={async ({ slots }) => {
          if (await onAct('pickup', { slots })) onSheet(null)
        }}
        onClose={() => onSheet(null)}
      />
    )
  }

  if (sheet === 'deliver') {
    return (
      <DeliverSheet
        detail={detail}
        busy={busy}
        // El cobro real viaja entero, no solo el método: los importes son lo
        // que decide el corte de caja (0140/0141).
        onConfirm={async (payment) => {
          if (await onAct('deliver', { ...payment })) onSheet(null)
        }}
        onNoShow={async () => {
          if (await onAct('no_show')) onSheet(null)
        }}
        onClose={() => onSheet(null)}
      />
    )
  }

  if (sheet === 'release') {
    return (
      <ReleaseSheet
        busy={busy}
        onConfirm={async (reason, note) => {
          await onAct('release', { reason, note })
          onSheet(null)
        }}
        onClose={() => onSheet(null)}
      />
    )
  }

  return (
    <AddressCaptureSheet
      initialLat={order.deliveryCoordinatesLat}
      initialLng={order.deliveryCoordinatesLng}
      initialReference={order.deliveryReference}
      hasDirectoryRow={order.addressDirectoryId != null}
      busy={captureBusy}
      onConfirm={saveAddress}
      // Omitir la ubicación NO cancela la entrega. Era el paso previo al cobro,
      // así que el cobro sigue.
      onSkip={() => onSheet(sheet === 'capture:before_deliver' ? 'deliver' : null)}
    />
  )
}
