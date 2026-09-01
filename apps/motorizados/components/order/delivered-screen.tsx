'use client'

import { Button, Card, cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import {
  isValidPePhone,
  mapsCenterSanJacinto,
  mapsDirToCoords,
  mapsSearchAddress,
  telLink,
} from '@/lib/deeplinks'
import { formatDeliveryDate, hourOf, prettyPhone, soles } from '@/lib/format'
import { BAND_LABEL } from '@/lib/orders/presentation'
import type { OrderDetailResponse } from '@/lib/types'
import { MapSheet } from './map-sheet'
import { OrderDetail } from './order-detail'
import { WhatsAppSheet } from './whatsapp-sheet'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
      {children}
    </span>
  )
}

/**
 * Pantalla rica e informativa de pedido entregado (modo lectura del historial).
 * Proporciona el rastro completo del pedido: cliente, teléfono, llamadas,
 * WhatsApp, dirección, referencia, mapa, local, cobro/rendición, items y tiempos.
 */
export function DeliveredScreen({
  detail,
}: {
  detail: OrderDetailResponse
  justDelivered?: boolean
}) {
  const { order, business } = detail
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  const total = order.orderAmount + order.deliveryFee

  // Filtramos la dirección en pedidos manuales cuando viene como 'Pedido manual' de relleno.
  const rawAddress = order.deliveryAddress?.trim() || null
  const cleanAddress =
    rawAddress && !(order.isManual && rawAddress.toLowerCase() === 'pedido manual')
      ? rawAddress
      : null

  const reference = order.deliveryReference?.trim() || null
  const hasCoords = order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null
  const band = order.deliveryDistanceBand ? BAND_LABEL[order.deliveryDistanceBand] : null

  const canWhatsApp = isValidPePhone(order.customerPhone)

  // Duración en ruta (desde recogida hasta entrega)
  let routeDurationMin: number | null = null
  if (order.pickedUpAt && order.deliveredAt) {
    const durationMs = new Date(order.deliveredAt).getTime() - new Date(order.pickedUpAt).getTime()
    if (durationMs > 0) {
      routeDurationMin = Math.max(1, Math.round(durationMs / 60_000))
    }
  }

  // Identificación del método de pago real
  const paymentMethodLabel =
    order.paymentReal === 'paid_cash'
      ? 'Cobrado en efectivo'
      : order.paymentReal === 'paid_yape'
        ? 'Cobrado por Yape'
        : order.paymentReal === 'paid_mixed'
          ? 'Pago mixto'
          : order.paymentIntent === 'prepaid'
            ? 'Pagado online (Yape)'
            : order.paymentIntent === 'pending_cash'
              ? 'Efectivo'
              : order.paymentIntent === 'pending_yape'
                ? 'Yape'
                : 'Pagado'

  const businessMapsHref =
    business?.coordinatesLat != null && business?.coordinatesLng != null
      ? mapsDirToCoords(business.coordinatesLat, business.coordinatesLng)
      : business?.address
        ? mapsSearchAddress(business.address)
        : null

  return (
    <div className="space-y-3.5 pb-10">
      {/* ── 1. Hero de Entrega Completada ── */}
      <Card className="mt-2 overflow-hidden border-success/30 bg-card p-[18px]">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success text-white shadow-sm">
            <Icon name="check" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-meta font-bold text-emerald-800">
                <Icon name="check_circle" size={12} filled />
                Entregado
              </span>
              {order.isManual && (
                <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-meta font-semibold text-ink-muted">
                  Manual
                </span>
              )}
            </div>
            <p className="mt-1 font-display text-title font-bold tracking-tight text-ink">
              Pedido #{order.shortId}
            </p>
            <p className="mt-0.5 text-caption font-medium text-ink-muted">
              {order.deliveredAt ? formatDeliveryDate(order.deliveredAt) : 'Completado'}
            </p>
          </div>
        </div>

        {/* Métrica de ruta si existe */}
        {routeDurationMin != null && (
          <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-ink/[0.04] px-3 py-2 text-caption font-medium text-ink">
            <Icon name="timer" size={16} className="text-brand shrink-0" />
            <span>
              Tiempo en ruta: <strong>{routeDurationMin} min</strong> (desde recogida hasta entrega)
            </span>
          </div>
        )}
      </Card>

      {/* ── 2. Cliente y Canales de Contacto ── */}
      <Card className="p-[18px]">
        <div className="flex items-center justify-between">
          <Eyebrow>Cliente</Eyebrow>
          <span className="text-micro font-medium text-ink-muted">Destinatario</span>
        </div>

        <div className="mt-2 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
            <Icon name="person" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-lg font-bold text-ink">{order.customerName ?? 'Cliente'}</p>
            {order.customerPhone ? (
              <p className="mt-0.5 font-mono text-body font-semibold tracking-tight text-ink">
                {prettyPhone(order.customerPhone)}
              </p>
            ) : (
              <p className="mt-0.5 text-caption italic text-ink-muted">Sin teléfono registrado</p>
            )}
          </div>
        </div>

        {order.customerPhone && (
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              as="a"
              href={telLink(order.customerPhone)}
            >
              <Icon name="phone" size={18} />
              Llamar
            </Button>
            {canWhatsApp && (
              <Button
                type="button"
                size="sm"
                onClick={() => setWhatsappOpen(true)}
                className="w-full bg-none bg-[#25D366] text-white shadow-none hover:bg-[#1ebd5a]"
              >
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 fill-current"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                WhatsApp
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* ── 3. Ubicación y Destino de Entrega ── */}
      {(cleanAddress || reference || hasCoords) && (
        <Card className="p-[18px]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Eyebrow>Entregado en</Eyebrow>
            {band && (
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 font-mono text-micro font-semibold text-ink-muted">
                {band}
              </span>
            )}
          </div>

          <div className="space-y-3">
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
          </div>

          {/* Botón de mapa */}
          {hasCoords ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3.5 w-full"
              onClick={() => setMapOpen(true)}
            >
              <Icon name="near_me" size={18} />
              Ver ubicación en el mapa
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
      )}

      {/* ── 4. Restaurante / Local ── */}
      {business && (
        <Card className="p-[18px]">
          <Eyebrow>Local de origen</Eyebrow>
          <div className="mt-2 flex items-start gap-3">
            {business.logoUrl ? (
              <img
                src={business.logoUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-[14px] bg-ink/[0.04] object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand/10 text-brand-dark">
                <Icon name="storefront" size={22} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lead font-semibold leading-tight text-ink">{business.name}</p>
              {business.address && (
                <p className="mt-0.5 text-caption leading-snug text-ink-muted">
                  {business.address}
                </p>
              )}
              {business.phone && (
                <p className="mt-0.5 font-mono text-caption text-ink-muted">
                  {prettyPhone(business.phone)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {business.phone && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                as="a"
                href={telLink(business.phone)}
              >
                <Icon name="phone" size={18} />
                Llamar
              </Button>
            )}
            {businessMapsHref && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                as="a"
                href={businessMapsHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="location_on" size={18} />
                Maps
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── 5. Resumen Financiero y Rendición de Cobro ── */}
      <Card className="p-[18px]">
        <div className="flex items-center justify-between">
          <Eyebrow>Cobro y rendición</Eyebrow>
          <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-meta font-bold text-ink">
            {paymentMethodLabel}
          </span>
        </div>

        <div className="mt-3 flex items-baseline justify-between border-b border-ink/[0.06] pb-3">
          <span className="text-body font-semibold text-ink">Total del pedido</span>
          <span className="font-mono text-title font-bold text-ink tabular-nums">
            {soles(total)}
          </span>
        </div>

        <div className="mt-2.5 space-y-1.5 text-caption">
          <div className="flex justify-between text-ink-muted tabular-nums">
            <span>Productos</span>
            <span>{soles(order.orderAmount)}</span>
          </div>
          <div className="flex justify-between text-ink-muted tabular-nums">
            <span>Tarifa de delivery</span>
            <span>{soles(order.deliveryFee)}</span>
          </div>

          {/* Desglose según método */}
          {order.paymentReal === 'paid_cash' && (
            <>
              {order.clientPaysWith != null && order.clientPaysWith > 0 && (
                <div className="flex justify-between text-ink-muted tabular-nums">
                  <span>Cliente pagó con</span>
                  <span>{soles(order.clientPaysWith)}</span>
                </div>
              )}
              {order.changeToGive != null && order.changeToGive > 0 && (
                <div className="flex justify-between text-ink-muted tabular-nums">
                  <span>Vuelto entregado</span>
                  <span>{soles(order.changeToGive)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-amber-950">
                <span className="font-semibold text-caption">Efectivo a rendir en caja</span>
                <span className="font-mono font-bold text-body tabular-nums">
                  {soles(order.cashOwedAtDelivery ?? total)}
                </span>
              </div>
            </>
          )}

          {order.paymentReal === 'paid_mixed' && (
            <>
              <div className="flex justify-between text-ink-muted tabular-nums">
                <span>Efectivo cobrado</span>
                <span>{soles(order.cashAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-ink-muted tabular-nums">
                <span>Yape cobrado</span>
                <span>{soles(order.yapeAmount ?? 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-amber-950">
                <span className="font-semibold text-caption">Efectivo a rendir en caja</span>
                <span className="font-mono font-bold text-body tabular-nums">
                  {soles(order.cashOwedAtDelivery ?? order.cashAmount ?? 0)}
                </span>
              </div>
            </>
          )}

          {(order.paymentReal === 'paid_yape' || order.paymentIntent === 'prepaid') && (
            <div className="mt-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-900 text-caption font-medium">
              Pagado digitalmente · Sin efectivo que rendir en caja
            </div>
          )}
        </div>
      </Card>

      {/* ── 6. Detalle de Productos e Items ── */}
      <OrderDetail detail={detail} defaultOpen />

      {/* ── 7. Línea de Tiempo de Entrega ── */}
      <Card className="p-[18px]">
        <Eyebrow>Tiempos del pedido</Eyebrow>
        <div className="mt-3 space-y-2.5">
          <TimelineItem icon="receipt" label="Pedido creado" time={order.createdAt} isComplete />
          {order.headingAt && (
            <TimelineItem
              icon="two_wheeler"
              label="En camino al local"
              time={order.headingAt}
              isComplete
            />
          )}
          {order.waitingAtRestaurantAt && (
            <TimelineItem
              icon="storefront"
              label="Llegada al local"
              time={order.waitingAtRestaurantAt}
              isComplete
            />
          )}
          {order.pickedUpAt && (
            <TimelineItem
              icon="shopping_bag"
              label="Pedido recogido"
              time={order.pickedUpAt}
              isComplete
            />
          )}
          {order.arrivedAtCustomerAt && (
            <TimelineItem
              icon="pin_drop"
              label="Llegada al domicilio"
              time={order.arrivedAtCustomerAt}
              isComplete
            />
          )}
          {order.deliveredAt && (
            <TimelineItem
              icon="check_circle"
              label="Entregado al cliente"
              time={order.deliveredAt}
              isComplete
              isLast
              tone="success"
            />
          )}
        </div>
      </Card>

      {/* Modales / Sheets */}
      {whatsappOpen && <WhatsAppSheet detail={detail} onClose={() => setWhatsappOpen(false)} />}

      {mapOpen && hasCoords && (
        <MapSheet
          lat={order.deliveryCoordinatesLat as number}
          lng={order.deliveryCoordinatesLng as number}
          title={reference ?? cleanAddress ?? 'Ubicación de entrega'}
          subtitle={cleanAddress && reference ? cleanAddress : null}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  )
}

function TimelineItem({
  icon,
  label,
  time,
  isComplete,
  isLast,
  tone = 'neutral',
}: {
  icon: string
  label: string
  time: string
  isComplete?: boolean
  isLast?: boolean
  tone?: 'neutral' | 'success'
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption',
          tone === 'success'
            ? 'bg-success text-white'
            : isComplete
              ? 'bg-ink/[0.08] text-ink'
              : 'bg-ink/[0.04] text-ink-muted',
        )}
      >
        <Icon name={icon} size={15} filled={isLast} />
      </span>
      <span className="min-w-0 flex-1 text-body font-medium text-ink">{label}</span>
      <span className="font-mono text-caption font-semibold text-ink-muted tabular-nums">
        {hourOf(time)}
      </span>
    </div>
  )
}
