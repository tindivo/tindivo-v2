'use client'

import { cn, Icon } from '@tindivo/ui'
import { useQueueLeadMinutes } from '@/hooks/use-queue-lead'
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
  const queueLeadMin = useQueueLeadMinutes()
  const vm = buildNegociosCardVM(order, { queueLeadMin, supportPhone })

  return (
    <div
      {...clickProps(order, onOpen)}
      className={cn(
        'group relative cursor-pointer rounded-xl border transition-all duration-150 hover:shadow-elev-2 text-left overflow-hidden',
        compact ? 'px-3 py-2.5' : 'px-3.5 py-3',
        TONE_BORDER[vm.tone],
      )}
    >
      {/* ── 1 · Cejilla Superior ── */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-mono font-bold text-ink-muted">#{vm.shortId}</span>

        {/* Badge de Origen ultra-visible: MANUAL vs ONLINE */}
        <span
          className={cn(
            'inline-flex items-center gap-[3px] rounded-full px-2 py-0.5 text-[10px]',
            vm.sourceBadge.className,
          )}
        >
          <Icon name={vm.sourceBadge.icon} size={10} weight={500} />
          {vm.sourceBadge.label}
        </span>

        {/* Badge de Método de entrega */}
        <span className="inline-flex items-center gap-[3px] rounded-full bg-ink/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
          <Icon name={vm.methodBadge.icon} size={10} weight={500} />
          {vm.methodBadge.label}
        </span>

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

      {/* ── 2 · Identidad + El Reloj ── */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-semibold text-[15px] text-ink tracking-tight flex-1">
          {vm.customerName}
        </span>

        {vm.clock && (
          <div className="flex shrink-0 items-center gap-1">
            {vm.clock.readyBadge && (
              <Icon name="check_circle" size={14} weight={500} filled className="text-success" />
            )}
            <span
              className={cn(
                'font-mono text-[13px] font-bold tabular-nums',
                CLOCK_TONE[vm.clock.tone],
              )}
            >
              {vm.clock.text}
            </span>
          </div>
        )}
      </div>

      {/* ── 3 · Referencia de Dirección / Recojo ── */}
      {vm.reference && (
        <div className="mb-1.5 flex items-start gap-1 text-[12px] leading-snug text-ink-muted line-clamp-2">
          <Icon
            name="location_on"
            size={13}
            weight={500}
            className="mt-0.5 shrink-0 text-ink-subtle"
          />
          <span>{vm.reference}</span>
        </div>
      )}

      {/* ── 4 · Cobro & Destacado de Vuelto ── */}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-1.5 border-t border-ink/[0.04] pt-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[16px] font-bold text-ink tracking-tight">
            {vm.money.totalHeadline}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              vm.money.paymentClassName,
            )}
          >
            {vm.money.paymentLabel}
          </span>
        </div>
      </div>

      {/* Destacado de Vuelto para la cajera */}
      {vm.money.cashChangeText && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-1 text-[11px] font-bold text-emerald-900">
          <Icon name="payments" size={13} weight={500} className="text-emerald-700" />
          {vm.money.cashChangeText}
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
  const queueLeadMin = useQueueLeadMinutes()
  const vm = buildNegociosCardVM(order, { queueLeadMin })
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
      <Icon name={vm.stateBadge.icon} size={12} weight={500} />
      <span>{vm.stateBadge.label}</span>
    </div>
  )
}
