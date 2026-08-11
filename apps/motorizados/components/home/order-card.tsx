'use client'

import { Card, cn, Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { SourceChip } from '@/components/source-chip'
import { useQueueLeadMinutes } from '@/hooks/use-queue-lead'
import { getTransferRemaining } from '@/hooks/use-team'
import { mmss } from '@/lib/format'
import {
  buildCardVM,
  type CardVariant,
  type StateTone,
  type Tone,
} from '@/lib/orders/card-view-model'
import type { CardOrder, TeamResponse } from '@/lib/types'

type IncomingRequest = TeamResponse['receivedRequests'][number]

/**
 * Tarjeta del board, de arriba abajo por orden de lectura real:
 *
 *   1. Cejilla   — local · código en gris pequeño, y EL RELOJ en la esquina.
 *   2. Identidad — el nombre, en grande, con la insignia de estado a su altura.
 *   3. Referencia— dónde va. En un pueblo sin numeración, esto ES la dirección.
 *   4. Verbo     — solo en "Míos".
 *   5. Cobro     — una línea, método al frente.
 *
 * EL RELOJ ARRIBA Y EL ESTADO ABAJO NO ES DECORACIÓN: son dos hechos distintos
 * que tienen que poder verse a la vez. Un intento anterior los fundió en una
 * sola ranura "con la verdad más urgente" y eso escondía el contador en cuanto
 * la cajera marcaba la comida lista — exactamente la regresión que `DECISIONS
 * §23` había arreglado y prohibido por escrito. Separados, "Lista" y el reloj
 * conviven, que es lo que hacía el legacy.
 *
 * SOBRE EL AIRE. Una primera versión bajó a ~107px y entraban cuatro tarjetas,
 * pero se leían amontonadas. Se cambia la cuarta tarjeta por respiración: el
 * espaciado vuelve a ser cómodo y quedan tres cómodas en lugar de cuatro
 * apretadas. El punto de partida eran DOS.
 *
 * Las decisiones de QUÉ se dice viven en `lib/orders/card-view-model`, con
 * tests. Aquí solo se pinta.
 */

/**
 * EL BORDE MARCA LA EMERGENCIA, Y NADA MÁS. No es un termómetro.
 *
 * Tenía un escalón ámbar y otro rojo, o sea un TERCER canal de color repitiendo
 * lo que el reloj ya dice con los mismos dos tonos — y encima su ámbar se
 * confundía con la franja naranja del local, que está a tres píxeles. La
 * pregunta "¿qué significa el marrón?" es la prueba: si hay que preguntarlo, no
 * está comunicando.
 *
 * Ahora el reloj lleva la escala completa (neutro → ámbar → rojo) y el borde
 * solo se enciende en el último escalón, para que una tarjeta urgente siga
 * siendo localizable de un vistazo mientras se hace scroll. Un solo nivel, un
 * solo significado: "esta ya".
 *
 * Se mantiene la doctrina de `urgency.ts`: la urgencia mueve el hairline, nunca
 * el relleno. Los fondos semánticos del rediseño anterior aplanaban el
 * contraste de todo lo que hay dentro justo en la tarjeta que más urge leer, y
 * uno era del 2% de opacidad, invisible al sol.
 */
const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-ink/10',
  success: 'border-ink/10',
  warning: 'border-ink/10',
  danger: 'border-danger/45',
}

/**
 * El reloj, a la altura del nombre. Lleva el peso porque es el dato que decide
 * si te da tiempo. Sin caja: el tamaño y el color ya lo destacan, y una píldora
 * ahí compite con el nombre.
 */
const CLOCK_TONE: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  success: 'text-ink-muted',
  warning: 'text-amber-800',
  danger: 'text-danger',
}

/**
 * La insignia, arriba en la cejilla. Pequeña y con caja: es una palabra que se
 * busca de un vistazo, no un número que se lee.
 *
 * GAMA CATEGÓRICA, Y SIN ÁMBAR NI ROJO. Esos dos son el idioma del reloj en
 * esta tarjeta —"se te está pasando", "ya se pasó"— y son lo único que
 * significa urgencia. Un estado normal pintado de ámbar sería indistinguible de
 * una alarma y el color dejaría de querer decir nada. Aquí el color solo
 * identifica la fase.
 *
 * Los pares 50/800 no son un capricho: todos quedan por encima de 8:1 sobre su
 * propio fondo (el naranja, con los tokens de marca, en ~5,9:1). Bien por
 * encima del mínimo AA, que es justo lo que hace falta en una pantalla que se
 * lee en la calle.
 */
const BADGE_TONE: Record<StateTone, string> = {
  idle: 'bg-ink/[0.05] text-ink-muted',
  ready: 'bg-emerald-50 text-emerald-800',
  transit: 'bg-sky-50 text-sky-800',
  onsite: 'bg-brand-soft text-brand-dark',
  carrying: 'bg-violet-50 text-violet-800',
  done: 'bg-ink/[0.05] text-ink-muted',
}

function IncomingRequestStrip({ request, now }: { request: IncomingRequest; now: number }) {
  const { remainingSec, expired } = getTransferRemaining(request, now)

  if (expired) {
    return (
      <p className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-meta font-bold text-amber-900">
        <Icon name="sync" size={14} filled />
        Traspaso en curso a {request.requesterName}
      </p>
    )
  }

  return (
    <p className="mb-2.5 flex animate-pulse items-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-meta font-bold text-danger">
      <Icon name="swap_horiz" size={14} filled />
      {request.requesterName} te lo está pidiendo
      <span className="ml-auto font-mono tabular-nums">{mmss(remainingSec)}</span>
    </p>
  )
}

export function OrderCard({
  order,
  now,
  variant = 'available',
  blocked = false,
  blockedReason,
  incomingRequest = null,
  ownerName,
}: {
  order: CardOrder
  now: number
  variant?: CardVariant
  ownerName?: string
  incomingRequest?: IncomingRequest | null
  blocked?: boolean
  blockedReason?: string
}) {
  const router = useRouter()
  const queueLeadMinutes = useQueueLeadMinutes()
  const vm = buildCardVM({
    order,
    now,
    variant,
    queueLeadMinutes,
    ownerName,
    blocked,
    blockedReason,
  })
  const accent = `#${order.business?.accent_color ?? 'f97316'}`

  return (
    <Card
      as="div"
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border bg-card py-3.5 pr-3.5 pl-4 text-left transition-shadow duration-200',
        TONE_BORDER[vm.tone],
        vm.muted && 'opacity-70',
        // `Card` mete `hover:shadow-elev-2` en su base incondicionalmente, así
        // que las tarjetas que NO se pueden pulsar —Equipo, y las bloqueadas de
        // "En espera"— se levantaban al pasar el cursor fingiendo ser
        // clicables. `twMerge` deja ganar a la última del mismo grupo.
        !vm.interactive && 'hover:shadow-elev-1',
      )}
    >
      {/* Franja de acento del local. Sin glow: `overflow-hidden` lo recortaba
          entero, así que era una sombra pagada y nunca vista. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: accent }}
      />

      {/*
        UN SOLO OBJETIVO TÁCTIL, y encima de todo.

        Antes la tarjeta ENTERA era un `<button>` con `<p>` y `<div>` dentro:
        HTML inválido, y un lector de pantalla anunciaba las ~40 palabras del
        contenido como una sola etiqueta. Ahora el contenedor es un `div`
        normal y la interacción la lleva este botón transparente estirado, con
        una etiqueta corta que dice de qué pedido se trata.
      */}
      {vm.interactive && (
        <button
          type="button"
          onClick={() => router.push(`/pedido/${order.id}`)}
          aria-label={`Ver pedido de ${vm.identity} · ${vm.businessName}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 active:scale-[0.99]"
        />
      )}

      {variant === 'mine' && incomingRequest && (
        <IncomingRequestStrip request={incomingRequest} now={now} />
      )}

      {/* ── 1 · Cejilla, con la INSIGNIA DE ESTADO en la esquina ──
          MAYÚSCULAS Y NEGRITA, PERO EN GRIS. Es el patrón de cejilla que ya usa
          la app (`upcoming-orders-section`) y el que traía el legacy: la
          versalita da estructura y peso de rótulo sin robarle protagonismo al
          nombre, porque el gris lo mantiene en segundo plano. En negro
          competiría; en gris minúscula se perdía. */}
      <div className="flex items-center gap-1.5 text-micro text-ink-muted">
        <span className="truncate font-bold uppercase tracking-[0.1em]">{vm.businessName}</span>
        {vm.shortId && <span className="shrink-0 font-mono">#{vm.shortId}</span>}
        {vm.slotsNote && (
          <span className="shrink-0 rounded-full bg-warning-soft px-1.5 font-semibold text-amber-900">
            {vm.slotsNote}
          </span>
        )}
        {vm.showSourceChip && <SourceChip source={order.source} />}

        {vm.badge && (
          <span
            className={cn(
              'ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
              BADGE_TONE[vm.badge.tone],
            )}
          >
            <Icon name={vm.badge.icon} size={12} filled />
            {vm.badge.text}
          </span>
        )}
      </div>

      {/* ── 2 · Identidad + EL RELOJ ──
          El reloj cae aquí, a la altura del nombre, porque es donde va la vista
          y porque es el número que decide si te da tiempo. */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {vm.identityIcon && (
            <Icon name={vm.identityIcon} size={17} className="shrink-0 text-ink-muted" />
          )}
          <span className="truncate font-semibold text-lead text-ink tracking-tight">
            {vm.identity}
          </span>
        </span>

        {vm.clock && (
          <span className="flex shrink-0 items-center gap-1">
            {/* El visto de comida lista viaja CON el reloj, no en la insignia:
                con el pedido ya tomado el estado habla del viaje del motorizado
                (`ready` no cambia el status cuando hay dueño, 0128:156-159), así
                que "lista" no cabe arriba sin pisarlo. Y es el reloj de la
                comida: su visto bueno pertenece aquí. */}
            {vm.clock.ready && (
              <Icon name="check_circle" size={15} filled className="text-success" />
            )}
            <span
              className={cn(
                'font-mono text-body-lg font-bold tabular-nums',
                CLOCK_TONE[vm.clock.tone],
              )}
            >
              {vm.clock.text}
            </span>
          </span>
        )}
      </div>

      {/* ── 3 · Referencia, PEGADA AL NOMBRE ──
          Van juntos porque son la misma cosa: a quién y dónde. Separarlos con
          aire los convertía en dos datos sueltos.

          SIN ICONO: es la única línea de texto libre de la tarjeta, así que no
          hace falta un pin para saber que es la dirección — y el pin le robaba
          ancho justo a la línea que más se desborda, la referencia larga de
          pueblo.

          `line-clamp-2` y no altura fija: una referencia rural truncada es una
          entrega equivocada, así que las tarjetas con dirección larga miden más
          y está bien que así sea. */}
      {vm.reference && (
        <p className="mt-0.5 line-clamp-2 text-caption leading-snug text-ink-muted">
          {vm.reference}
        </p>
      )}

      {/* ── 4 · Cobro, o el motivo del bloqueo en su lugar ──
          AQUÍ VIVÍA EL VERBO ("Recoger pedido", "Ir al local"). Se fue: con el
          estado del pedido en la insignia, era el mismo hecho dos veces —"En el
          local" y "Recoger pedido" son la misma frase— y dejaba dos estados
          conviviendo en la tarjeta. */}
      {vm.blockedReason ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption font-medium text-ink-muted">
          <Icon name="lock" size={14} className="shrink-0" />
          {vm.blockedReason}
        </p>
      ) : (
        vm.money && (
          <div className="mt-3">
            {/* LA CIFRA, EN GRANDE. Es lo que se lee en la puerta del cliente,
                con prisa y con casco, y hasta ahora pesaba lo mismo que la
                palabra "efectivo" que la acompaña.

                `--text-title` y no `--text-display`: en mono los dígitos ya
                ocupan más de lo que dice su talla, así que a 22px el importe
                pesa como el nombre a 17px sin llegar a destronarlo — y el nombre
                sigue siendo la identidad de la tarjeta. */}
            <p
              className={cn(
                'font-mono text-title font-bold leading-none tracking-tight tabular-nums',
                vm.money.tone === 'success' ? 'text-success' : 'text-ink',
              )}
            >
              {vm.money.headline}
            </p>
            {/* `ink-muted` y NO `ink-subtle`: aquí vive el vuelto, y
                `--color-ink-subtle` da 2,5:1 sobre blanco — por debajo del
                mínimo legible, en la calle y con casco. */}
            {vm.money.detail && (
              <p
                className={cn(
                  'mt-1 text-caption font-medium',
                  vm.money.tone === 'success' ? 'text-success' : 'text-ink-muted',
                )}
              >
                {vm.money.detail}
              </p>
            )}
          </div>
        )
      )}
    </Card>
  )
}
