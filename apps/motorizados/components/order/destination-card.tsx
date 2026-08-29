'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { mapsCenterSanJacinto } from '@/lib/deeplinks'
import { BAND_LABEL } from '@/lib/orders/presentation'
import type { OrderDetailResponse } from '@/lib/types'
import { MapSheet } from './map-sheet'

/**
 * Componente unificado de la ubicación de entrega del cliente.
 * Se reutiliza con paridad visual idéntica en los 3 estados (VOY, LOCAL y CAMINO).
 */
export function DestinationCard({ detail }: { detail: OrderDetailResponse }) {
  const { order } = detail
  const [mapOpen, setMapOpen] = useState(false)

  if (order.deliveryMethod === 'pickup') return null

  // Filtramos la dirección en pedidos manuales cuando viene como 'Pedido manual' de relleno.
  const rawAddress = order.deliveryAddress?.trim() || null
  const cleanAddress =
    rawAddress && !(order.isManual && rawAddress.toLowerCase() === 'pedido manual')
      ? rawAddress
      : null

  const reference = order.deliveryReference?.trim() || null
  const hasCoords = order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null
  const band = order.deliveryDistanceBand ? BAND_LABEL[order.deliveryDistanceBand] : null

  // Si no hay ni dirección ni referencia ni coordenadas, omitir.
  if (!cleanAddress && !reference && !hasCoords) return null

  return (
    <>
      <Card className="mt-3.5 p-[18px]">
        {/* Rótulo principal con chip de banda si existe */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Entregar en
          </span>
          {band && (
            <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 font-mono text-micro font-semibold text-ink-muted">
              {band}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {/* 1. Dirección (si existe) */}
          {cleanAddress && (
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06] text-ink-muted">
                <Icon name="home" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Dirección
                </span>
                <p className="mt-0.5 text-body font-semibold leading-snug text-ink">
                  {cleanAddress}
                </p>
              </div>
            </div>
          )}

          {/* 2. Referencia (si existe) */}
          {reference && (
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
                <Icon name="location_on" size={17} filled />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Referencia
                </span>
                <p className="mt-0.5 text-body-lg font-bold leading-snug text-ink">{reference}</p>
              </div>
            </div>
          )}

          {/* Fallback si no hay ni dirección ni referencia */}
          {!cleanAddress && !reference && (
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06] text-ink-muted">
                <Icon name="location_on" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Ubicación
                </span>
                <p className="mt-0.5 text-body italic text-ink-muted">
                  Sin referencia registrada — coordinar con el cliente
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 3. Botón de mapa: "Ir a la ubicación del cliente" si hay GPS, o "Ubicarse en Google Maps" si no hay */}
        {hasCoords ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-3.5 w-full"
            onClick={() => setMapOpen(true)}
          >
            <Icon name="near_me" size={18} />
            Ir a la ubicación del cliente
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-3.5 w-full"
            as="a"
            href={mapsCenterSanJacinto()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="map" size={18} />
            Ubicarse en Google Maps
          </Button>
        )}
      </Card>

      {/* Sheet interactivo de Leaflet al presionar "Ir a la ubicación del cliente" */}
      {mapOpen && hasCoords && (
        <MapSheet
          lat={order.deliveryCoordinatesLat as number}
          lng={order.deliveryCoordinatesLng as number}
          title={reference ?? cleanAddress ?? 'Ubicación de entrega'}
          subtitle={cleanAddress && reference ? cleanAddress : null}
          onClose={() => setMapOpen(false)}
        />
      )}
    </>
  )
}
