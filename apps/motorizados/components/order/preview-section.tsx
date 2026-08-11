'use client'

import { Card, Icon } from '@tindivo/ui'
import { SourceChip } from '@/components/source-chip'
import { mapsDirToCoords, telLink } from '@/lib/deeplinks'
import { soles } from '@/lib/format'
import { changeDue } from '@/lib/payment'
import type { OrderDetailResponse } from '@/lib/types'
import { remainingParts } from '@/lib/urgency'

/**
 * Ficha de previsualización del pedido tomable (HU-D-015).
 *
 * ORDEN DELIBERADO. El motorizado decide esto de noche, con casco y el teléfono
 * en una mano, y la pantalla contesta cuatro preguntas en el orden en que las
 * necesita: de qué local es (el color se lee sin leer), a dónde va, cuánto
 * cobra, y si sale ya o espera.
 *
 * "Recoger en" ya no encabeza: con un solo restaurante en el piloto era el dato
 * menos informativo de la pantalla, y ocupaba el primer lugar.
 *
 * Los colores e iconos de pago son LOS MISMOS que en `order-card.tsx` a
 * propósito. Esta pantalla se abre tocando esa tarjeta; si el amarillo de allá
 * fuese otro acá, el motorizado tendría que releer lo que ya había leído.
 */

const BAND_LABEL: Record<string, string> = { near: 'Cerca', far: 'Lejos' }

/**
 * `987654123` -> `+51 987 654 123`. Los tríos no son estética: el motorizado
 * lee este número en voz alta o lo teclea con guantes, y agrupado se equivoca
 * menos.
 */
function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(-9)
  return d.length === 9 ? `+51 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : raw
}

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
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${
          tone === 'brand' ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink-muted'
        }`}
      >
        <Icon name={icon} size={18} filled />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </div>
  )
}

/**
 * Tile de cobro. El color codifica el MEDIO DE PAGO, no "dinero": morado Yape,
 * esmeralda efectivo — los mismos que `order-card.tsx`. Pintarlo todo de verde
 * se ve más armónico y le quita al motorizado la señal que distingue de un
 * vistazo por qué vía tiene que cobrar.
 */
function MoneyTile({
  tone,
  label,
  amount,
  sub,
  big = false,
}: {
  tone: 'yape' | 'cash'
  label: string
  amount: number
  sub?: string
  big?: boolean
}) {
  const styles =
    tone === 'yape'
      ? { bg: 'from-purple-600 to-purple-700', icon: 'qr_code_2' }
      : { bg: 'from-emerald-600 to-emerald-700', icon: 'payments' }
  return (
    <div className={`rounded-[16px] bg-gradient-to-br ${styles.bg} px-4 py-3 text-white`}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] opacity-90">
        <Icon name={styles.icon} size={14} filled />
        {label}
      </p>
      <p
        className={`mt-0.5 font-display font-bold leading-none tracking-tight tabular-nums ${
          big ? 'text-[32px]' : 'text-[22px]'
        }`}
      >
        {soles(amount)}
      </p>
      {sub && <p className="mt-1 text-[12px] opacity-90">{sub}</p>}
    </div>
  )
}

/** Cifra de apoyo: contorno, nunca relleno. No es lo que se cobra. */
function SupportChip({
  icon,
  label,
  amount,
  sub,
}: {
  icon: string
  label: string
  amount: number
  sub: string
}) {
  return (
    <div className="rounded-[16px] border border-ink/[0.09] px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/50">
        <Icon name={icon} size={13} />
        {label}
      </p>
      <p className="mt-0.5 font-display text-[19px] font-bold leading-none tracking-tight tabular-nums text-ink">
        {soles(amount)}
      </p>
      <p className="mt-1 text-[11.5px] text-ink-subtle">{sub}</p>
    </div>
  )
}

export function PreviewSection({ detail, now }: { detail: OrderDetailResponse; now: number }) {
  const { order, business } = detail
  const total = order.orderAmount + order.deliveryFee
  const accent = `#${business?.accentColor ?? 'f97316'}`

  // Lo vencido lo decide SOLO el reloj de la cocina, igual que en la bandeja.
  //
  // Aquí decía que `urgentSince` no lo escribía nadie en v2. Dejó de ser cierto:
  // la migración `0134` lo sella con el cron `OrderOverdue`. El motivo bueno
  // está en `lib/urgency.ts` — es OTRO reloj, el de la asignación, que salta a
  // los 5 minutos con la comida aún en el horno, y ese hecho ya lo avisa un push
  // vibrante. No pinta tablero.
  const remainingMs = order.estimatedReadyAt ? Date.parse(order.estimatedReadyAt) - now : null
  const band = order.deliveryDistanceBand ? BAND_LABEL[order.deliveryDistanceBand] : null
  const destination = order.deliveryReference ?? order.deliveryAddress
  const hasCoords = order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null

  // Misma regla que la tarjeta del board, en un solo sitio (`lib/payment.ts`).
  const vuelto = changeDue({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  return (
    <div>
      {/* ── Identidad del local ──────────────────────────────────────────────
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
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-85">
              Recoger en
            </p>
            <p className="mt-0.5 truncate font-display text-[19px] font-bold tracking-tight">
              {business?.name ?? 'Restaurante'}
            </p>
            {business?.address && (
              <p className="mt-0.5 flex items-center gap-1 text-[12.5px] opacity-90">
                <Icon name="location_on" size={14} filled />
                <span className="truncate">{business.address}</span>
              </p>
            )}
          </div>

          {/* El hero es identidad del local, y nada más.
              Aquí vivían dos distintivos —"Comida lista" y "Vencido"— que
              repetían tal cual lo que la tarjeta "Cuándo" ya dice más abajo, y
              con más contexto: allí "Comida lista" viene con "el local confirmó
              que ya salió de cocina", y lo vencido con los minutos exactos.
              Decir dos veces lo mismo no es énfasis, es ruido.

              El distintivo de origen sigue la misma regla que la tarjeta del
              board: solo aparece cuando el pedido viene de la app del cliente,
              porque hoy el 100% son manuales y un chip constante no informa. */}
          {order.source === 'customer_pwa' && (
            <span className="shrink-0">
              <SourceChip source={order.source} />
            </span>
          )}
        </div>
      </section>

      {/* ── ¿A dónde voy? ────────────────────────────────────────────────────
          Primera pregunta real del motorizado: decide distancia, si conoce el
          sitio y si le conviene. La referencia va COMPLETA — en la tarjeta del
          listado se corta a dos líneas, y es justo el dato que hay que leer
          entero antes de comprometerse. */}
      <Card className="mt-3 overflow-hidden">
        <div className="p-[18px]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              Entregar en
            </p>
            {band && (
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
                {band}
              </span>
            )}
          </div>

          <p className="mt-1 text-[20px] font-bold leading-tight tracking-tight">
            {order.customerName ?? 'Cliente'}
          </p>

          {destination ? (
            <InfoRow icon="pin_drop">
              <p className="text-[14.5px] leading-snug text-ink">{destination}</p>
            </InfoRow>
          ) : (
            <p className="mt-2 text-[13px] italic text-ink-subtle">Sin referencia de entrega</p>
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
                className="font-mono text-[14px] font-semibold tracking-tight text-ink-muted underline decoration-ink/20 underline-offset-4"
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
            className="flex items-center justify-center gap-2 border-ink/[0.07] border-t py-3 text-[14px] font-semibold text-brand-dark"
          >
            <Icon name="map" size={18} filled />
            Cómo llegar
          </a>
        )}
      </Card>

      {/* ── ¿Cuánto cobro y cómo? ──────────────────────────────────────────
          Un tile relleno con LA cifra que se cobra, y lo demás en chips de
          apoyo. Tres cifras del mismo peso (cobra / vuelto / paga con) es sopa
          de números, y confundirlas cuesta plata de verdad. */}
      <Card className="mt-3 p-[18px]">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          Cobro al cliente
        </p>

        {order.paymentIntent === 'prepaid' ? (
          <div className="mt-2 flex items-center gap-3 rounded-[16px] bg-success-soft px-4 py-3.5">
            <Icon name="verified" size={26} filled className="shrink-0 text-success" />
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-success/80">
                Ya pagó
              </p>
              <p className="text-[16px] font-bold text-success">No cobres nada. Solo entrega.</p>
            </div>
          </div>
        ) : order.paymentIntent === 'pending_mixed' ? (
          <>
            {/* El caso caro: dos cifras que hay que cobrar por vías distintas.
                Van lado a lado y con SU color, porque el error típico es
                cobrarlo todo por una sola vía. */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MoneyTile tone="yape" label="Cobra por Yape" amount={order.yapeAmount ?? 0} />
              <MoneyTile tone="cash" label="Cobra en efectivo" amount={order.cashAmount ?? 0} />
            </div>
            <p className="mt-2 text-center text-[12.5px] text-ink-muted tabular-nums">
              Total del pedido {soles(total)}
            </p>
          </>
        ) : (
          <div className="mt-2">
            <MoneyTile
              tone={
                order.paymentIntent === 'pending_yape' || order.paymentIntent === 'pending_wallet'
                  ? 'yape'
                  : 'cash'
              }
              label="Cobra"
              amount={total}
              sub={
                order.paymentIntent === 'pending_yape' || order.paymentIntent === 'pending_wallet'
                  ? 'por Yape / Plin'
                  : 'en efectivo'
              }
              big
            />
          </div>
        )}

        {/* Vuelto y billete: apoyo, no protagonistas. Se avisa ACÁ —antes de
            aceptar— porque llevar sencillo encima es una decisión que se toma
            al salir, no al llegar al domicilio. */}
        {vuelto != null && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SupportChip
              icon="currency_exchange"
              label="Vuelto"
              amount={vuelto}
              sub="que debes dar"
            />
            {order.clientPaysWith != null && (
              <SupportChip
                icon="payments"
                label="Paga con"
                amount={order.clientPaysWith}
                sub="billete del cliente"
              />
            )}
          </div>
        )}
      </Card>

      {/* ── ¿Salgo ya o espero? ──────────────────────────────────────────────
          Cronómetro, preparación y contacto unificados. La cuenta va HACIA
          ADELANTE (cuánto falta), no hacia atrás: al motorizado no le sirve
          saber cuánto lleva el pedido publicado, le sirve saber cuándo sale la
          comida. `readyEarlyUsed` gana siempre — es confirmación humana de la
          cajera y hace irrelevante la estimación. */}
      <Card className="mt-3 p-[18px]">
        {/* El rótulo sigue al dato. "Falta para que esté listo" encima de un
            "Esperando 04:53" se contradice: si ya se pasó, no falta nada. */}
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          {order.readyEarlyUsed
            ? 'Cuándo'
            : remainingMs != null && remainingMs < 0
              ? 'Se pasó del tiempo'
              : 'Falta para que esté listo'}
        </p>

        {order.readyEarlyUsed ? (
          <div className="mt-2 flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-success-soft text-success">
              <Icon name="check_circle" size={22} filled />
            </span>
            <div>
              <p className="text-[16px] font-bold text-success">Comida lista</p>
              <p className="text-[12.5px] text-ink-muted">
                El local confirmó que ya salió de cocina
              </p>
            </div>
          </div>
        ) : remainingMs != null ? (
          <div className="mt-2 flex items-center gap-2.5">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ${
                remainingMs < 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-amber-900'
              }`}
            >
              <Icon name={remainingMs < 0 ? 'priority_high' : 'schedule'} size={22} filled />
            </span>
            <div>
              <p
                className={`text-[16px] font-bold tabular-nums ${
                  remainingMs < 0 ? 'text-danger' : 'text-ink'
                }`}
              >
                {remainingMs < 0
                  ? `Esperando ${remainingParts(remainingMs).value}`
                  : remainingParts(remainingMs).value}
              </p>
              {order.prepTimeMinutes != null && (
                <p className="text-[12.5px] text-ink-muted">
                  Preparación de {order.prepTimeMinutes} min
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[13px] italic text-ink-subtle">Sin hora estimada</p>
        )}

        {business?.phone && (
          <a
            href={`tel:+51${business.phone}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-ink/[0.08] py-2.5 text-[14px] font-semibold text-ink"
          >
            <Icon name="call" size={17} filled />
            Llamar al local
          </a>
        )}
      </Card>
    </div>
  )
}
