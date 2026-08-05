'use client'

import { EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { useCashSettlements } from '../hooks/use-cash-settlements'
import { CashSummary } from './cash-summary'
import { PendingDriversList } from './pending-drivers-list'
import { SettlementCard } from './settlement-card'

export function EfectivoList() {
  const { rows, pendingCash, loading, error, reload } = useCashSettlements()

  if (loading) {
    return <SkeletonList count={3} />
  }

  const pending = rows.filter((r) => r.status === 'pending_confirmation')
  const disputed = rows.filter((r) => r.status === 'disputed')
  const settled = rows.filter((r) => r.status !== 'pending_confirmation' && r.status !== 'disputed')
  const totalToday = rows.reduce((sum, r) => sum + (r.delivered_amount ?? 0), 0)

  return (
    <>
      {error && (
        <div className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>
      )}

      <CashSummary
        totalToday={totalToday}
        pendingCount={pending.length}
        disputedCount={disputed.length}
        pendingAmount={pending.reduce((s, r) => s + (r.delivered_amount ?? 0), 0)}
        totalCount={rows.length}
      />

      {/* Pending alert banner */}
      {pending.length > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-warning-soft p-3 text-sm font-semibold text-amber-900">
          <Icon name="warning" size={18} filled />
          <div className="flex-1">
            Tienes <strong>{pending.length}</strong>{' '}
            {pending.length === 1 ? 'cierre pendiente' : 'cierres pendientes'} de confirmar
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && pendingCash.length === 0 && (
        <EmptyState
          icon="payments"
          heading="Sin cierres de efectivo"
          description="Aparecerán aquí cuando el motorizado entregue efectivo."
        />
      )}

      {/* Pendiente del motorizado */}
      {pendingCash.length > 0 && <PendingDriversList drivers={pendingCash} />}

      {/* Por confirmar ahora */}
      {pending.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2.5">
            <Icon name="warning" size={20} filled className="text-warning" />
            <div className="text-base font-bold">Por confirmar ahora</div>
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-amber-900">
              {pending.length}
            </span>
            <div className="flex-1" />
            <div className="text-xs text-ink-muted">
              Cuenta el efectivo y confirma. No se confirman solas.
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {pending.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={reload} />
            ))}
          </div>
        </div>
      )}

      {/* En disputa */}
      {disputed.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2.5">
            <Icon name="gavel" size={20} className="text-danger" />
            <div className="text-base font-bold">En disputa</div>
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">
              {disputed.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {disputed.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={reload} />
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      {settled.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2.5">
            <Icon name="history" size={20} className="text-ink-muted" />
            <div className="text-base font-bold">Historial</div>
          </div>
          <div className="flex flex-col gap-3">
            {settled.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={reload} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
