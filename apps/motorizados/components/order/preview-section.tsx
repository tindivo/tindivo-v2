'use client'

import { Card, cn, Icon } from '@tindivo/ui'
import { SourceChip } from '@/components/source-chip'
import { mapsDirToCoords, telLink } from '@/lib/deeplinks'
import { mmss, prettyPhone, soles } from '@/lib/format'
import { BAND_LABEL, moneyLine } from '@/lib/orders/presentation'
import { changeDue } from '@/lib/payment'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Ficha de previsualización del pedido tomable (HU-D-015).
 *
 * ORDEN DELIBERADO. El motorizado decide esto de noche, con casco y el teléfono
 * en una mano, y la pantalla contesta cuatro preguntas en el orden en que las
 * necesita: de qué local es (el color se lee sin leer), a dónde va, cuánto
 * cobra, y si sale ya o espera.
 *
 * NO SIGUE EL LAYOUT DE LAS PANTALLAS OPERATIVAS, y es a propósito: aquí no se
 * ejecuta nada, se DECIDE. La referencia va completa —en la tarjeta del listado
 * se corta a dos líneas y es justo el dato que hay que leer entero antes de
 * comprometerse— y el vuelto pesa más que en ningún otro sitio, porque llevar
 * sencillo encima se decide al salir, no al llegar.
 *
 * Lo que SÍ comparte con el resto de la app es el vocabulario: las palabras del
 * cobro y el formato del reloj salen de `lib/orders/presentation`. Tenía los
 * suyos —«Cobra por Yape / Plin», tiles morados y esmeralda— con un comentario
 * que juraba que eran «los mismos que order-card.tsx». Habían dejado de serlo:
 * la tarjeta reserva el color para la urgencia y deja que la palabra diga el
 * método. Dos copias de un criterio divergen.
 */

/** Fila de dato con icono relleno. Un solo nivel de tarjeta: el icono ya
 *  etiqueta, así que no se repite un "TELÉFONO"/"DIRECCIÓN" encima. */
function InfoRow({
  icon,
  children,
  tone = 'brand',
}: {
  icon: string
  children: React.ReactNode
  tone?: 'brand' | 'muted'
}) {
  return (
    <div className="mt-2.5 flex items-start gap-2.5">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]',
          tone === 'brand' ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink-muted',
        )}
      >
        <Icon name={icon} size={18} filled />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </div>
  )
}

/** Rótulo de sección. Siempre igual en toda la ficha. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
      {children}
    </p>
  )
}

export function PreviewSection({ detail, now }: { detail: OrderDetailResponse; now: number }) {
  const { order, business } = detail
  const total = order.orderAmount + order.deliveryFee
  const accent = `#${business?.accentColor ?? 'f97316'}`

  // Lo vencido lo decide SOLO el reloj de la cocina, igual que en la bandeja.
  // El motivo de no mirar `urgentSince` está en `lib/urgency.ts`: es otro reloj,
  // el de la asignación, y ese hecho ya lo avisa un push.
  const remainingMs = order.estimatedReadyAt ? Date.parse(order.estimatedReadyAt) - now : null
  const late = remainingMs != null && remainingMs < 0
  const band = order.deliveryDistanceBand ? BAND_LABEL[order.deliveryDistanceBand] : null
  const destination = order.deliveryReference ?? order.deliveryAddress
  const hasCoords = order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null

  const money = moneyLine({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    yapeAmount: order.yapeAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })
  const prepaid = order.paymentIntent === 'prepaid'

  // Se calcula aparte del `detail` porque aquí el vuelto NO es un apunte al
  // final de una línea: es una de las cosas que deciden si aceptas.
  const vuelto = changeDue({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  return (
    <div>
      {/* ── Identidad del local ──
          Va arriba y con el color de marca: es lo único que se reconoce sin
          leer, y continúa la franja de color de la tarjeta del listado. */}
      <section
        className="relative mt-1 overflow-hidden rounded-[20px] p-[18px] text-white"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
          boxShadow: `0 14px 34px -14px ${accent}99`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.24) 0%, transparent 60%)',
          }}
        />
        <div className="relative flex items-start gap-3">
          {business?.logoUrl ? (
            <img
              src={business.logoUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[14px] bg-white/90 object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/20">
              <Icon name="storefront" size={22} filled />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="font-mono text-micro font-semibold uppercase tracking-[0.18em] opacity-85">
              Recoger en
            </p>
            <p className="mt-0.5 truncate font-display text-lead font-bold tracking-tight">
              {business?.name ?? 'Restaurante'}
            </p>
            {business?.address && (
              <p className="mt-0.5 flex items-center gap-1 text-caption opacity-90">
                <Icon name="location_on" size={14} filled />
                <span className="truncate">{business.address}</span>
              </p>
            )}
          </div>

          {/* El hero es identidad del local, y nada más. Los distintivos de
              "Comida lista" y "vencido" viven abajo, en la tarjeta "Cuándo", y
              allí vienen con contexto. Decir dos veces lo mismo no es énfasis.

              El de origen sigue la regla de la tarjeta del board: solo cuando el
              pedido viene de la app, porque hoy el 100% son manuales y un chip
              constante no informa. */}
          {order.source === 'customer_pwa' && (
            <span className="shrink-0">
              <SourceChip source={order.source} />
            </span>
          )}
        </div>
      </section>

      {/* ── ¿A dónde voy? ──
          Primera pregunta real: decide distancia, si conoce el sitio y si le
          conviene. */}
      <Card className="mt-3 overflow-hidden">
        <div className="p-[18px]">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Entregar en</Eyebrow>
            {band && (
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-meta font-semibold text-ink-muted">
                {band}
              </span>
            )}
          </div>

          <p className="mt-1 text-title font-bold leading-tight tracking-tight">
            {order.customerName ?? 'Cliente'}
          </p>

          {destination ? (
            <InfoRow icon="pin_drop">
              <p className="text-body leading-snug text-ink">{destination}</p>
            </InfoRow>
          ) : (
            <p className="mt-2 text-caption italic text-ink-muted">Sin referencia de entrega</p>
          )}

          {/* El teléfono va en gris y sin peso: acá todavía se está DECIDIENDO.
              Llamar es un `tel:` por si la referencia no se entiende, pero no
              compite con la dirección. El WhatsApp de "voy en camino" vive en
              las pantallas de después — mandarlo antes de aceptar le promete al
              cliente un motorizado que quizá no vaya. */}
          {order.customerPhone && (
            <InfoRow icon="call" tone="muted">
              <a
                href={telLink(order.customerPhone)}
                className="font-mono text-body font-semibold tracking-tight text-ink-muted underline decoration-ink/20 underline-offset-4"
              >
                {prettyPhone(order.customerPhone)}
              </a>
            </InfoRow>
          )}
        </div>

        {/* Solo con coordenadas reales. Sin ellas, `mapsSearchAddress` mandaría
            a Google a buscar "frente a la bodega de Lucho" y aterrizaría en
            cualquier sitio: un botón que miente es peor que no tenerlo, y en el
            pueblo la referencia ES la navegación. */}
        {hasCoords && (
          <a
            href={mapsDirToCoords(
              order.deliveryCoordinatesLat as number,
              order.deliveryCoordinatesLng as number,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border-ink/[0.07] border-t py-3 text-body font-semibold text-brand-dark"
          >
            <Icon name="map" size={18} filled />
            Cómo llegar
          </a>
        )}
      </Card>

      {/* ── ¿Cuánto cobro y cómo? ──
          Misma jerarquía que en el resto de la app: la cifra grande y debajo el
          método. El vuelto NO va en esa línea aquí, sino en su propia caja: en
          la tarjeta es un apunte y aquí es una de las cosas que deciden. */}
      <Card className="mt-3 p-[18px]">
        <Eyebrow>{prepaid ? 'Ya pagado' : 'Cobro al cliente'}</Eyebrow>

        <p
          className={cn(
            'mt-1.5 font-mono text-display font-bold leading-none tracking-tight tabular-nums',
            prepaid ? 'text-success' : 'text-ink',
          )}
        >
          {money.headline}
        </p>
        {money.detail && (
          <p
            className={cn(
              'mt-1.5 text-caption font-medium',
              prepaid ? 'text-success' : 'text-ink-muted',
            )}
          >
            {money.detail}
          </p>
        )}

        {vuelto != null && vuelto > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-[16px] bg-warning-soft px-3.5 py-3">
            <Icon name="currency_exchange" size={20} className="shrink-0 text-amber-900" />
            <div className="min-w-0">
              <p className="text-body font-semibold text-amber-900">
                Necesitas {soles(vuelto)} de vuelto
              </p>
              <p className="mt-0.5 text-caption text-amber-900">
                Paga con {soles(order.clientPaysWith)} · llévalo encima
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── ¿Salgo ya o espero? ──
          La cuenta va HACIA ADELANTE (cuánto falta), no hacia atrás: no sirve
          saber cuánto lleva publicado, sirve saber cuándo sale la comida.
          `readyEarlyUsed` gana siempre: es confirmación humana de la cajera y
          hace irrelevante la estimación. */}
      <Card className="mt-3 p-[18px]">
        {/* El rótulo sigue al dato. "Falta para que esté listo" encima de un
            "Esperando 04:53" se contradice: si ya se pasó, no falta nada. */}
        <Eyebrow>
          {order.readyEarlyUsed ? 'Cuándo' : late ? 'Se pasó del tiempo' : 'Falta para que esté'}
        </Eyebrow>

        {order.readyEarlyUsed ? (
          <div className="mt-2 flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-success-soft text-success">
              <Icon name="check_circle" size={22} filled />
            </span>
            <div>
              <p className="text-body-lg font-bold text-success">Comida lista</p>
              <p className="text-caption text-ink-muted">
                El local confirmó que ya salió de cocina
              </p>
            </div>
          </div>
        ) : remainingMs != null ? (
          <div className="mt-2 flex items-center gap-2.5">
            {/* Negro o rojo, como el reloj de la tarjeta: el número ya dice
                cuánto, así que al color le basta con decir si se pasó. */}
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]',
                late ? 'bg-danger-soft text-danger' : 'bg-ink/[0.06] text-ink-muted',
              )}
            >
              <Icon name={late ? 'priority_high' : 'schedule'} size={22} filled />
            </span>
            <div>
              <p
                className={cn(
                  'font-mono text-body-lg font-bold tabular-nums',
                  late ? 'text-danger' : 'text-ink',
                )}
              >
                {mmss(Math.abs(remainingMs) / 1000)}
              </p>
              {order.prepTimeMinutes != null && (
                <p className="text-caption text-ink-muted">
                  Preparación de {order.prepTimeMinutes} min
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-caption italic text-ink-muted">Sin hora estimada</p>
        )}

        {business?.phone && (
          <a
            href={telLink(business.phone)}
            className="mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-ink/[0.08] py-2.5 text-body font-semibold text-ink"
          >
            <Icon name="call" size={17} filled />
            Llamar al local
          </a>
        )}
      </Card>
    </div>
  )
}
