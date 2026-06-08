'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, fieldSm, Ico, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

interface CashDisputeRow {
  id: string
  settlement_date: string
  total_cash: number
  delivered_amount: number | null
  reported_amount: number | null
  status: string
  dispute_note: string | null
  businesses: { name: string } | null
  drivers: { full_name: string } | null
}

export default function EfectivoPage() {
  const [rows, setRows] = useState<CashDisputeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<CashDisputeRow[]>>('/admin/cash-settlements?status=disputed')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function resolve(row: CashDisputeRow) {
    const note = (notes[row.id] ?? '').trim()
    const amount = Number(amounts[row.id] ?? row.reported_amount ?? row.delivered_amount ?? 0)
    if (!note) {
      setError('La nota de resolución es obligatoria.')
      return
    }
    setBusyId(row.id)
    setError(null)
    try {
      await api.post(`/admin/cash-settlements/${row.id}/resolve`, { resolvedAmount: amount, note })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Conciliación"
        title="Efectivo"
        description={
          rows ? `${rows.length} disputas de efectivo abiertas` : 'Disputas de cuadre de efectivo.'
        }
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!rows ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : rows.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.cash className="h-5 w-5" />}
            title="Sin disputas"
            hint="Todos los cuadres de efectivo están conciliados. 🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="t-card">
              <p className="font-medium text-[15px] text-ink">
                {r.businesses?.name ?? '—'} ↔ {r.drivers?.full_name ?? 'Motorizado'}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {r.settlement_date} · driver declaró {soles(r.delivered_amount)} · negocio contó{' '}
                {soles(r.reported_amount)} · esperado {soles(r.total_cash)}
              </p>
              {r.dispute_note && (
                <p className="mt-1 text-[13px] text-ink-subtle">“{r.dispute_note}”</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                  Resolver S/
                  <input
                    className={`${fieldSm} w-24 text-center font-mono`}
                    inputMode="decimal"
                    placeholder={String(r.reported_amount ?? r.delivered_amount ?? '')}
                    value={amounts[r.id] ?? ''}
                    onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })}
                  />
                </label>
                <input
                  className={`${fieldSm} flex-1`}
                  placeholder="Nota de resolución (obligatoria)"
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
                <Button size="sm" disabled={busyId === r.id} onClick={() => resolve(r)}>
                  Resolver
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
