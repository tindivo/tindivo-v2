'use client'

import { cn, Icon } from '@tindivo/ui'
import { prefetchProofUrl } from '@/features/pedidos/lib/proof-url'
import { useBusinessTimers } from '@/hooks/use-queue-lead'
import { buildNegociosCardVM, type CardTone } from '@/lib/orders/card-view-model'
import type { OrderVM } from '@/lib/orders/view-model'

type CardProps = {
  order: OrderVM
  onOpen?: (o: OrderVM) => void
  compact?: boolean
  supportPhone?: string | null
  onCallDriver?: (o: OrderVM) => void
}

const TONE_BORDER: Record<CardTone, string> = {
  neutral: 'border border-border bg-white',
  warning: 'border border-[#FDBA74] bg-white',
  danger: 'border border-danger/45 bg-white',
  brand: 'border-2 border-brand bg-white shadow-sm',
}

const CLOCK_TONE: Record<CardTone, string> = {
  neutral: 'text-ink-muted',
  warning: 'text-amber-700',
  danger: 'text-danger font-black',
  brand: 'text-brand-dark',
}

function clickProps(order: OrderVM, onOpen?: (o: OrderVM) => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    // Al APRETAR, no al soltar. Entre el `pointerdown` y el `click` que abre la
    // ficha hay unas decenas de milisegundos regalados; con ellos la URL
    // firmada del comprobante ya va en camino cuando la ficha monta. Solo
    // prepagados: son los únicos que tienen comprobante que mirar.
    onPointerDown: () => {
      if (order.payment === 'prepaid') prefetchProofUrl(order.rowId, order.proofUrl)
    },
    onClick: () => onOpen?.(order),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen?.(order)
      }
    },
  }
}

/**
 * Componente Base de Tarjeta para la Cajera.
 * Consume `buildNegociosCardVM` para desacoplar completamente la lógica visual del JSX.
 */
function NegociosBaseCard({
  order,
  onOpen,
  compact = false,
  supportPhone,
  onCallDriver,
}: CardProps) {
  const { queueLeadMinutes, deliveryLateMinutes } = useBusinessTimers()
  const vm = buildNegociosCardVM(order, {
    queueLeadMin: queueLeadMinutes,
    deliveryLateMin: deliveryLateMinutes,
    supportPhone,
  })

  return (
    <div
      {...clickProps(order, onOpen)}
      className={cn(
        'group relative cursor-pointer rounded-xl border transition-all duration-150 hover:shadow-elev-2 text-left overflow-hidden shrink-0',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        TONE_BORDER[vm.tone],
      )}
    >
      {/* ── EL AURA · GRAVEDAD ──
          Se queda QUIETA. Antes latía, y latía en todo lo que pusiera el reloj
          en rojo: también en el reparto que se pasa de veinte minutos y en el
          prepago al que le queda un minuto de ventana. Ninguna de las dos es
          cosa de la cajera —una está en la calle y la otra la tiene el
          cliente—, así que el movimiento se gastaba en avisos que ella no puede
          atender y dejaba de significar «atiende esto». El aura pesa; no pide. */}
      {vm.clock?.tone === 'danger' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-xl shadow-[0_0_20px_6px_rgba(220,38,38,0.55)]"
        />
      )}

      {/* ── EL LATIDO · DE QUIÉN ES LA PELOTA ──
          El anillo respira exactamente cuando el pedido la reclama a ella (ver
          `CardPulse`, y `demandsCashier` para la condición, que es la misma que
          enciende la alarma). El anillo va POR DENTRO porque la tarjeta recorta
          lo que se salga (`overflow-hidden`), y con `motion-reduce` se queda
          encendido y fijo: quien pidió no ver animaciones sigue viendo cuál es.

          Late en `pending_acceptance`, se calla al aceptar mientras el cliente
          paga, y vuelve a latir cuando sube el comprobante (`validando`). En
          contraentrega no hay segunda vuelta: se acepta y se va a cocina. */}
      {vm.pulse !== 'none' && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 z-10 rounded-xl motion-reduce:animate-none',
            vm.pulse === 'urgent'
              ? 'shadow-[inset_0_0_0_2px_var(--color-danger),inset_0_0_18px_rgba(220,38,38,0.35)] animate-[t-attention-hard_900ms_ease-in-out_infinite]'
              : 'shadow-[inset_0_0_0_2px_var(--color-brand),inset_0_0_18px_rgba(249,115,22,0.28)] animate-[t-attention_2s_ease-in-out_infinite]',
          )}
        />
      )}
      {/* ── 1 · Cejilla Superior ──
          Solo lleva lo que DISTINGUE. Las insignias de origen y de método salen
          únicamente cuando son la excepción (ver `buildNegociosCardVM`): antes
          iban las cuatro siempre y la tarjeta típica gastaba su primera línea
          en repetir "Manual · Delivery", que es lo que son todas. */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        {/* El código NO se repite cuando ya es la identidad de la tarjeta. */}
        {!vm.identityIsCode && (
          <span className="font-mono font-bold text-ink-muted">#{vm.shortId}</span>
        )}

        {vm.sourceBadge && (
          <span
            className={cn(
              'inline-flex items-center gap-[3px] rounded-full px-2 py-0.5 text-[10px]',
              vm.sourceBadge.className,
            )}
          >
            <Icon name={vm.sourceBadge.icon} size={10} weight={500} />
            {vm.sourceBadge.label}
          </span>
        )}

        {vm.methodBadge && (
          <span className="inline-flex items-center gap-[3px] rounded-full bg-ink/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
            <Icon name={vm.methodBadge.icon} size={10} weight={500} />
            {vm.methodBadge.label}
          </span>
        )}

        <div className="flex-1 min-w-[4px]" />

        {/* Badge de Estado del Pedido */}
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-[3px] rounded-full px-2 py-0.5 text-[10px] font-bold',
            vm.stateBadge.className,
          )}
        >
          <Icon name={vm.stateBadge.icon} size={11} weight={500} />
          {vm.stateBadge.label}
        </span>
      </div>

      {/* ── 2 · Identidad + EL RELOJ ──
          EL RELOJ PASA A 17px MONO. Estaba a 13px, o sea más pequeño que el
          importe (16px), y para la cajera que vigila la cocina el número que
          decide algo es el tiempo, no el precio: el precio ya está cobrado o se
          cobra en la puerta, y no cambia nada de lo que ella hace ahora.
          `DECISIONS §24 N3` ya lo había decidido —"Democión de Jerarquía del
          Precio", el total a caption para liberar la esquina al monitoreo
          operacional— y había quedado sin aplicar. */}
      {/* NOMBRE Y DIRECCIÓN SON UNA SOLA COLUMNA; EL RELOJ ES OTRA.
          Estaban en dos filas apiladas, y una fila de flex crece hasta la altura
          de su hijo MÁS ALTO: el reloj (cifra de 17px + rótulo) mide bastante
          más que un nombre de 15px, así que la fila del nombre se estiraba a la
          altura del reloj y la dirección arrancaba al final de ese estirón. El
          hueco no era margen —por eso no se iba tocando márgenes—: era el nombre
          flotando arriba de una fila más alta que él.

          Con las dos líneas dentro de la MISMA columna, la dirección va pegada
          al nombre y el reloj ocupa a su derecha el alto de las dos. El sobrante
          vertical, si lo hay, queda ahora en la columna del reloj, que es donde
          no separa nada.

          El rótulo del reloj sigue haciendo falta: `05:31` a secas no dice si
          son los minutos que faltan, los que sobran o los que lleva el
          motorizado en la calle, y en esta pantalla el mismo número significa
          las tres cosas según la columna. */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[15px] text-ink tracking-tight">
            {vm.customerName}
          </p>

          {/* Destino: dirección + referencia. Dos líneas en los pedidos online
              (el cliente da las dos), una en los manuales (la cajera escribe una
              sola). Ver `CardDestination`. */}
          {vm.destination && (
            <div className="mt-0.5 flex items-start gap-1 text-[12px] leading-snug text-ink-muted">
              <Icon
                name="location_on"
                size={13}
                weight={500}
                className="mt-px shrink-0 text-ink-subtle"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2">{vm.destination.primary}</p>
                {vm.destination.secondary && (
                  <p className="truncate text-[11px] text-ink-subtle">{vm.destination.secondary}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {vm.clock && (
          <div className="flex shrink-0 flex-col items-end">
            <div className="flex items-center gap-1">
              {vm.clock.readyBadge && (
                <Icon name="check_circle" size={15} weight={500} filled className="text-success" />
              )}
              <span
                className={cn(
                  'font-mono text-[17px] font-bold leading-none tabular-nums',
                  CLOCK_TONE[vm.clock.tone],
                )}
              >
                {vm.clock.text}
              </span>
            </div>
            {vm.clock.label && (
              <span className="mt-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-subtle">
                {vm.clock.label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 4 · Cobro ──
          La franja contesta QUÉ HACER CON LA PLATA, no cuál fue el método. Un
          prepago sin verificar y uno verificado ya no se parecen. Ver
          `MoneyStatus`. */}
      <div className="mt-2 border-t border-ink/[0.04] pt-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              vm.money.paymentClassName,
            )}
          >
            <Icon name={vm.money.paymentIcon} size={12} weight={500} filled />
            <span className="truncate">{vm.money.paymentLabel}</span>
          </span>
          {/* 14px, por debajo del reloj (17px). El importe sigue siendo legible
              —la cajera lo canta por teléfono— pero deja de competir por la
              mirada con el único dato que le pide actuar. §24 N3.
              Y desaparece cuando no hay nada que cobrar: ver `showTotal`. */}
          {vm.money.showTotal && (
            <span className="shrink-0 font-mono text-[14px] font-bold text-ink-muted tracking-tight">
              {vm.money.totalHeadline}
            </span>
          )}
        </div>

        {vm.money.breakdown && (
          <p className="mt-1 font-mono text-[11px] text-ink-muted tabular-nums">
            {vm.money.breakdown}
          </p>
        )}
      </div>

      {/* El vuelto sale de la caja del negocio: es plata que la cajera adelanta,
          y por eso tiene bloque propio en vez de ser un renglón más. Junto a
          "paga con" para que ella misma pueda comprobar la resta. */}
      {(vm.money.cashChangeText || vm.money.paysWithText) && (
        <div className="mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
          <Icon name="payments" size={13} weight={500} className="text-emerald-700" />
          {vm.money.paysWithText && <span>{vm.money.paysWithText}</span>}
          {vm.money.paysWithText && vm.money.cashChangeText && (
            <span aria-hidden className="text-emerald-600">
              ·
            </span>
          )}
          {vm.money.cashChangeText && <span className="font-bold">{vm.money.cashChangeText}</span>}
        </div>
      )}

      {/* Alerta de Riesgo */}
      {vm.riskLabel && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-warning-soft border border-orange-200 px-2 py-1 text-[11px] font-bold text-brand-dark">
          <Icon name="shield" size={13} weight={500} filled />
          {vm.riskLabel}
        </div>
      )}

      {/* ── 5 · Botón de Acción 1-Tap ── */}
      {vm.primaryAction && (
        <div className="mt-2.5">
          {vm.primaryAction.type === 'callDriver' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCallDriver?.(order)
              }}
              className={cn(
                'inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold transition-transform active:scale-[0.98]',
                vm.primaryAction.isUrgent
                  ? 'animate-pulse bg-danger text-white'
                  : 'bg-brand text-white',
              )}
            >
              <Icon name="call" size={15} weight={500} filled />
              {vm.primaryAction.label}
            </button>
          ) : (
            <div
              className={cn(
                'inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold text-white shadow-sm',
                vm.primaryAction.isUrgent ? 'bg-emerald-600' : 'bg-brand',
              )}
            >
              <Icon name="local_shipping" size={15} filled />
              {vm.primaryAction.label}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Exportaciones para el Kanban (compatibles con pedidos-view.tsx) ───────────

export function CocinaCard(props: CardProps) {
  return <NegociosBaseCard {...props} />
}

export function NuevoCard(props: CardProps) {
  return <NegociosBaseCard {...props} />
}

export function RepartoCard(props: CardProps) {
  return <NegociosBaseCard {...props} />
}

export function CookingStatusLine({ order }: { order: OrderVM }) {
  const { queueLeadMinutes } = useBusinessTimers()
  const vm = buildNegociosCardVM(order, { queueLeadMin: queueLeadMinutes })
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
      <Icon name={vm.stateBadge.icon} size={12} weight={500} />
      <span>{vm.stateBadge.label}</span>
    </div>
  )
}
