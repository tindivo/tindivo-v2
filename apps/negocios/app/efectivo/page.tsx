'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending_confirmation: { label: 'Por confirmar', cls: 'bg-warning/15 text-warning' },
  confirmed: { label: 'Confirmado', cls: 'bg-success/15 text-success' },
  disputed: { label: 'En disputa', cls: 'bg-danger/15 text-danger' },
  resolved: { label: 'Resuelto', cls: 'bg-info/15 text-info' },
  auto_assumed_confirmed: { label: 'Confirmado (auto)', cls: 'bg-success/15 text-success' },
}

interface CashRow {
  id: string
  settlement_date: string
  total_cash: number
  delivered_amount: number | null
  confirmed_amount: number | null
  reported_amount: number | null
  status: string
}

export default function NegocioEfectivoPage() {
  const router = useRouter()
  const [rows, setRows] = useState<CashRow[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await getSupabaseBrowser()
      .from('cash_settlements')
      .select(
        'id,settlement_date,total_cash,delivered_amount,confirmed_amount,reported_amount,status',
      )
      .order('created_at', { ascending: false })
      .limit(50)
    if (e) setError(e.message)
    else setRows(data as CashRow[])
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      load()
      setReady(true)
    })
    const channel = supabase
      .channel('biz-cash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
        load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [router, load])

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>

  const pending = rows.filter((r) => r.status === 'pending_confirmation')

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
        ← Pedidos
      </Link>
      <h1 className="mt-2 mb-5 font-display font-semibold text-[24px] text-ink">
        Efectivo del motorizado
      </h1>
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      {pending.length > 0 && (
        <p className="mb-3 rounded-xl bg-warning/15 px-3 py-2 text-[14px] text-warning">
          Cuenta el dinero físicamente antes de confirmar.
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-8 text-center text-ink-subtle">
              Aún no hay entregas de efectivo del motorizado.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <CashRowCard row={r} onDone={load} setError={setError} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CashRowCard({
  row,
  onDone,
  setError,
}: {
  row: CashRow
  onDone: () => void
  setError: (s: string | null) => void
}) {
  const s = STATUS_LABEL[row.status] ?? { label: row.status, cls: 'bg-card text-ink-muted' }
  const [mode, setMode] = useState<'idle' | 'dispute'>('idle')
  const [reported, setReported] = useState(String((row.delivered_amount ?? 0).toFixed(2)))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = row.status === 'pending_confirmation'

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/business/cash-settlements/${row.id}/confirm`, {
        confirmedAmount: row.delivered_amount ?? 0,
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function dispute(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/business/cash-settlements/${row.id}/dispute`, {
        reportedAmount: Number(reported),
        note: note.trim(),
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-[15px] text-ink">
              El motorizado entregó <span className="font-mono">{soles(row.delivered_amount)}</span>
            </p>
            <p className="text-[13px] text-ink-muted">
              {row.settlement_date} · esperado{' '}
              <span className="font-mono">{soles(row.total_cash)}</span>
              {row.reported_amount != null && <> · reportaste {soles(row.reported_amount)}</>}
            </p>
          </div>
          <span className={`rounded-lg px-2 py-0.5 text-[12px] ${s.cls}`}>{s.label}</span>
        </div>

        {editable && mode === 'idle' && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={confirm}>
              Confirmar {soles(row.delivered_amount)}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode('dispute')}>
              Reportar diferencia
            </Button>
          </div>
        )}

        {editable && mode === 'dispute' && (
          <form onSubmit={dispute} className="mt-3 space-y-2 border-border border-t pt-3">
            <label className="flex items-center gap-1 text-[13px] text-ink-muted">
              Conté S/
              <input
                className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-center font-mono outline-none focus:border-brand"
                inputMode="decimal"
                value={reported}
                onChange={(e) => setReported(e.target.value)}
              />
            </label>
            <input
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[14px] outline-none focus:border-brand"
              placeholder="Motivo de la diferencia (obligatorio)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="danger" disabled={busy || !note.trim()}>
                Enviar diferencia
              </Button>
              <button
                type="button"
                className="text-[13px] text-ink-subtle"
                onClick={() => setMode('idle')}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
