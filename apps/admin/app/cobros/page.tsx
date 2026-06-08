'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { DataTable, EmptyState, Field, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'
import { STATEMENT_STATUS } from '@/lib/labels'

interface SettlementRow {
  id: string
  period_start: string
  period_end: string
  order_count: number
  total_amount: number
  status: string
  due_date: string
  businesses: { name: string } | null
}

/** Lunes y domingo de la semana pasada + viernes de esta semana como vencimiento. */
function defaultPeriod() {
  const now = new Date()
  const diffToMon = (now.getDay() + 6) % 7
  const thisMon = new Date(now)
  thisMon.setDate(now.getDate() - diffToMon)
  const lastMon = new Date(thisMon)
  lastMon.setDate(thisMon.getDate() - 7)
  const lastSun = new Date(lastMon)
  lastSun.setDate(lastMon.getDate() + 6)
  const fri = new Date(thisMon)
  fri.setDate(thisMon.getDate() + 4)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(lastMon), end: fmt(lastSun), due: fmt(fri) }
}

export default function CobrosPage() {
  const init = defaultPeriod()
  const [period, setPeriod] = useState({ start: init.start, end: init.end, due: init.due })
  const [rows, setRows] = useState<SettlementRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<SettlementRow[]>>('/admin/settlements')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      await api.post('/admin/settlements', {
        periodStart: period.start,
        periodEnd: period.end,
        dueDate: period.due,
      })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setGenerating(false)
    }
  }

  async function pay(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await api.post(`/admin/settlements/${id}/pay`, { method: 'yape' })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  const totalPending = (rows ?? [])
    .filter((r) => r.status === 'pending' || r.status === 'overdue')
    .reduce((s, r) => s + Number(r.total_amount), 0)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionHeader
        eyebrow="Finanzas"
        title="Cobros"
        description="Liquidaciones semanales de comisión a los negocios."
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      <div className="t-card">
        <p className="t-display mb-3 text-[16px] text-ink">Generar liquidaciones de la semana</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Desde">
            <input
              type="date"
              className="t-field"
              value={period.start}
              onChange={(e) => setPeriod({ ...period, start: e.target.value })}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              className="t-field"
              value={period.end}
              onChange={(e) => setPeriod({ ...period, end: e.target.value })}
            />
          </Field>
          <Field label="Vence">
            <input
              type="date"
              className="t-field"
              value={period.due}
              onChange={(e) => setPeriod({ ...period, due: e.target.value })}
            />
          </Field>
          <Button onClick={generate} disabled={generating}>
            {generating ? 'Generando…' : 'Generar'}
          </Button>
        </div>
      </div>

      {error && <p className="text-[14px] text-danger">{error}</p>}

      <div className="t-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="t-display text-[15px] text-ink">
            {rows?.length ?? 0} liquidaciones · por cobrar{' '}
            <span className="font-mono tabular-nums">{soles(totalPending)}</span>
          </p>
        </div>
        {!rows ? (
          <div className="h-24 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : (
          <DataTable
            rows={rows}
            getRowKey={(r) => r.id}
            empty={<EmptyState title="Aún no hay liquidaciones" />}
            columns={[
              { key: 'name', header: 'Negocio', render: (r) => r.businesses?.name ?? '—' },
              {
                key: 'periodo',
                header: 'Período',
                mono: true,
                render: (r) => (
                  <span className="text-[12px] text-ink-muted">
                    {r.period_start} → {r.period_end}
                  </span>
                ),
              },
              {
                key: 'count',
                header: 'Pedidos',
                align: 'right',
                mono: true,
                render: (r) => r.order_count,
              },
              {
                key: 'monto',
                header: 'Monto',
                align: 'right',
                mono: true,
                render: (r) => soles(r.total_amount),
              },
              {
                key: 'estado',
                header: 'Estado',
                render: (r) => {
                  const s = STATEMENT_STATUS[r.status] ?? {
                    label: r.status,
                    tone: 'neutral' as const,
                  }
                  return <StatusBadge label={s.label} tone={s.tone} />
                },
              },
              {
                key: 'accion',
                header: '',
                align: 'right',
                render: (r) =>
                  r.status === 'pending' || r.status === 'overdue' ? (
                    <Button size="sm" disabled={busyId === r.id} onClick={() => pay(r.id)}>
                      Marcar pagado
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
