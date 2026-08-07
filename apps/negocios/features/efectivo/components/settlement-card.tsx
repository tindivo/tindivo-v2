'use client'

import { Badge, Button, Card, Icon } from '@tindivo/ui'
import { type FormEvent, useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { CashRow } from '../hooks/use-cash-settlements'
import { useConfirmCash } from '../hooks/use-confirm-cash'
import { useDisputeCash } from '../hooks/use-dispute-cash'

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})
const horaDe = (iso: string) => horaLima.format(Date.parse(iso))

export function SettlementCard({ row, onDone }: { row: CashRow; onDone: () => void }) {
  const isPending = row.status === 'pending_confirmation'
  const isDisputed = row.status === 'disputed'
  const isConfirmed = row.status === 'confirmed' || row.status === 'auto_assumed_confirmed'

  const expectedCash = row.total_cash
  const reportedCash = row.delivered_amount ?? 0
  const diff = reportedCash - expectedCash
  const hasDiff = diff !== 0 && row.delivered_amount != null

  const [mode, setMode] = useState<'idle' | 'dispute'>('idle')
  const [counted, setCounted] = useState(String(reportedCash.toFixed(2)))
  const [note, setNote] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const { confirm, busy: confirming } = useConfirmCash()
  const { dispute, busy: disputing } = useDisputeCash()
  const busy = confirming || disputing

  async function handleConfirm() {
    setLocalError(null)
    try {
      await confirm(row.id, row.delivered_amount ?? 0)
      onDone()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Error')
    }
  }

  async function handleDispute(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setLocalError(null)
    try {
      await dispute(row.id, Number(counted), note)
      setMode('idle')
      setNote('')
      onDone()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Error')
    }
  }

  const borderClass = isPending
    ? 'border-warning'
    : isDisputed
      ? 'border-danger'
      : 'border-ink/[0.04]'

  return (
    <Card className={`overflow-hidden ${borderClass}`}>
      {/* Status banner */}
      {isPending && (
        <div className="flex items-center gap-2 bg-warning px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-950">
          <Icon name="payments" size={14} filled />
          <span className="flex-1">Cuenta el efectivo físicamente antes de confirmar</span>
        </div>
      )}
      {isDisputed && (
        <div className="flex items-center gap-2 bg-danger px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
          <Icon name="gavel" size={14} filled />
          En disputa · esperando soporte
        </div>
      )}

      <div className="p-3.5">
        {/* Header row */}
        <div className="mb-3 flex items-start gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
            <Icon name="delivery_dining" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">
              {row.drivers?.full_name ?? 'Motorizado'}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="font-mono">
                {row.settlement_date}
                {row.delivered_at_ts ? ` · ${horaDe(row.delivered_at_ts)}` : ''}
              </span>
              {row.order_count != null && (
                <span>
                  · {row.order_count} pedido{row.order_count === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          {isConfirmed && (
            <Badge variant="success" size="sm">
              <Icon name="check_circle" size={13} filled /> Confirmado
            </Badge>
          )}
        </div>

        {/* Dual amount grid */}
        <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border">
          <div className="bg-card p-2.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Sistema espera
            </div>
            <div className="font-mono text-xl font-bold leading-none">{soles(expectedCash)}</div>
          </div>
          <div className="bg-card p-2.5">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Moto reporta
            </div>
            <div
              className={`font-mono text-xl font-bold leading-none ${
                hasDiff ? 'text-danger' : 'text-ink'
              }`}
            >
              {row.delivered_amount != null ? soles(reportedCash) : '—'}
            </div>
          </div>
        </div>

        {/* Difference alert */}
        {hasDiff && isPending && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-warning-soft p-2.5 text-xs font-semibold text-amber-900">
            <Icon name="info" size={14} filled />
            Diferencia de {soles(Math.abs(diff))} entre lo que el sistema espera y lo que reporta la
            moto.
          </div>
        )}

        {/* Dispute info */}
        {isDisputed && row.reported_amount != null && (
          <div className="mb-3 rounded-xl bg-danger-soft p-2.5 text-xs text-red-900">
            <div className="font-bold">Tú contaste: {soles(row.reported_amount)}</div>
          </div>
        )}

        {/* Actions */}
        {isPending && mode === 'idle' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setMode('dispute')}>
              <Icon name="report_problem" size={18} /> Reportar diferencia
            </Button>
            <Button disabled={busy} onClick={handleConfirm}>
              <Icon name="check" size={18} /> Confirmo {soles(reportedCash)}
            </Button>
          </div>
        )}

        {isPending && mode === 'dispute' && (
          <form
            onSubmit={handleDispute}
            className="mt-1 flex flex-col gap-2.5 border-t border-ink/[0.04] pt-3"
          >
            <label className="flex items-center gap-2 text-sm text-ink">
              <span className="font-mono text-[13px] text-ink-muted">Conté S/</span>
              <input
                className="w-24 rounded-xl border border-ink/[0.08] bg-card px-3 py-2 text-center font-mono text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </label>
            <input
              className="rounded-xl border border-ink/[0.08] bg-card px-3 py-2.5 text-sm outline-none placeholder:text-ink/45 focus:border-brand focus:ring-2 focus:ring-brand/40"
              placeholder="Motivo de la diferencia (obligatorio)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button variant="danger" size="sm" disabled={busy || !note.trim()}>
                Enviar diferencia
              </Button>
              <button
                type="button"
                className="text-sm text-ink-subtle underline-offset-2 hover:underline"
                onClick={() => setMode('idle')}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {localError && <p className="mt-2 text-[13px] text-danger">{localError}</p>}
      </div>
    </Card>
  )
}
