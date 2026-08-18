'use client'

import { Card, EmptyState, Icon } from '@tindivo/ui'
import { PAYMENT_META, SourceBadgeMini, soles } from '@/components/dashboard/primitives'
import type { HistDisplay } from '../types'

export function HistoryList({
  rows,
  onSelect,
}: {
  rows: HistDisplay[]
  onSelect?: (id: string) => void
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="history"
        heading="Sin pedidos registrados hoy"
        description="Los pedidos entregados y cancelados de la jornada aparecerán aquí."
      />
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2 lg:hidden">
        {rows.map((row) => (
          <MobileOrderRow key={row.id} row={row} onSelect={onSelect} />
        ))}
      </div>

      <div className="hidden lg:block">
        <DesktopTable rows={rows} onSelect={onSelect} />
      </div>
    </>
  )
}

function MobileOrderRow({ row, onSelect }: { row: HistDisplay; onSelect?: (id: string) => void }) {
  const payMeta = PAYMENT_META[row.payment] ?? PAYMENT_META.pending_cash

  return (
    <button
      type="button"
      onClick={() => onSelect?.(row.id)}
      className="w-full text-left transition-all active:scale-[0.99] focus:outline-none"
    >
      <Card className="flex items-center gap-2.5 p-3 transition-colors hover:border-brand/40">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
            row.isCancel ? 'bg-surface text-ink-subtle' : 'bg-success-soft text-success'
          }`}
        >
          <Icon name={row.isCancel ? 'cancel' : 'check_circle'} size={20} filled />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold text-ink">{row.customer}</span>
            <SourceBadgeMini source={row.source} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="font-mono">#{row.shortId}</span>
            {row.closedAt && (
              <>
                <span>·</span>
                <span>{row.closedAt}</span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Icon name={payMeta.icon} size={11} /> {payMeta.short}
            </span>
            {row.isCancel && row.cancelReason && (
              <>
                <span>·</span>
                <span className="text-danger">{row.cancelReason}</span>
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div
            className={`font-mono text-[15px] font-bold ${
              row.isCancel ? 'text-ink-subtle line-through' : 'text-ink'
            }`}
          >
            {soles(row.total)}
          </div>
          <div
            className={`mt-0.5 text-[10px] font-semibold ${
              row.isCancel ? 'text-danger' : 'text-success'
            }`}
          >
            {row.isCancel ? 'Cancelado' : 'Entregado'}
          </div>
        </div>
      </Card>
    </button>
  )
}

/** Rejilla de la tabla de historial. Como clase, no como estilo inline. */
const COLS = 'grid-cols-[36px_1fr_120px_100px_120px_80px]'

function DesktopTable({
  rows,
  onSelect,
}: {
  rows: HistDisplay[]
  onSelect?: (id: string) => void
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={`grid gap-3 border-b border-ink/[0.04] bg-surface px-4 py-2.5 ${COLS}`}>
        {(['', 'CLIENTE', 'ORIGEN', 'PAGO', 'HORA', 'TOTAL'] as const).map((h) => (
          <div
            key={h}
            className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
          >
            {h}
          </div>
        ))}
      </div>

      {rows.map((row, i) => {
        const payMeta = PAYMENT_META[row.payment] ?? PAYMENT_META.pending_cash
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect?.(row.id)}
            className={`grid w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-low/70 focus:outline-none ${COLS} ${
              i < rows.length - 1 ? 'border-b border-ink/[0.04]' : ''
            } ${row.isCancel ? 'bg-surface-low/30' : 'bg-card'}`}
          >
            <div>
              <Icon
                name={row.isCancel ? 'cancel' : 'check_circle'}
                size={18}
                filled
                className={row.isCancel ? 'text-ink-subtle' : 'text-success'}
              />
            </div>

            <div>
              <div className="text-[14px] font-semibold text-ink">{row.customer}</div>
              <div className="font-mono text-[11px] text-ink-muted">#{row.shortId}</div>
            </div>

            <div>
              <SourceBadgeMini source={row.source} />
            </div>

            <div>
              <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                <Icon name={payMeta.icon} size={13} /> {payMeta.short}
              </span>
            </div>

            <div>
              {row.closedAt && (
                <div className="font-mono text-[13px] font-semibold text-ink">{row.closedAt}</div>
              )}
              {row.isCancel && row.cancelReason && (
                <div className="text-[11px] text-danger">{row.cancelReason}</div>
              )}
            </div>

            <div
              className={`font-mono text-right text-[14px] font-bold ${
                row.isCancel ? 'text-ink-subtle line-through' : 'text-ink'
              }`}
            >
              {soles(row.total)}
            </div>
          </button>
        )
      })}
    </Card>
  )
}
