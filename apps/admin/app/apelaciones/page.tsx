'use client'

import type { AdminAppealDto } from '@tindivo/contracts'
import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

type Tab = 'pending' | 'refund_pending' | 'resolved'

const TAB_CONFIG: { key: Tab; label: string; query: Record<string, string> }[] = [
  { key: 'pending', label: 'Por resolver', query: { appeal_status: 'pending' } },
  { key: 'refund_pending', label: 'Devolución pendiente', query: { appeal_status: 'approved', refund_status: 'pending' } },
  { key: 'resolved', label: 'Resueltas', query: {} },
]

const soles = (n: number) => `S/ ${n.toFixed(2)}`

interface AppealListData {
  items: AdminAppealDto[]
  total: number
  page: number
  perPage: number
}

export default function ApelacionesPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [appeals, setAppeals] = useState<AdminAppealDto[] | null>(null)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<Tab, number>>({ pending: 0, refund_pending: 0, resolved: 0 })
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<any[] | null>(null)
  const [refundForm, setRefundForm] = useState<{ id: string; amount: number } | null>(null)
  const [refundFile, setRefundFile] = useState<File | null>(null)
  const [refundUploading, setRefundUploading] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const config = TAB_CONFIG.find((t) => t.key === tab)!
      const params = new URLSearchParams(config.query)
      const res = await api.get<ApiEnvelope<AppealListData>>(`/admin/appeals?${params.toString()}`)
      setAppeals(res.data.items)
      setTotal(res.data.total)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [tab])

  const loadCounts = useCallback(async () => {
    try {
      const [pending, refundPending] = await Promise.all([
        api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=pending&per_page=1'),
        api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=approved&refund_status=pending&per_page=1'),
      ])
      setCounts({ pending: pending.data.total, refund_pending: refundPending.data.total, resolved: 0 })
    } catch {}
  }, [])

  useEffect(() => { load(); loadCounts() }, [load, loadCounts])

  async function markInReview(id: string) {
    setBusyId(id)
    try {
      await api.post(`/admin/appeals/${id}/review`, {})
      await load()
      await loadCounts()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  async function resolve(id: string, resolution: 'favor_cliente' | 'favor_restaurante') {
    setBusyId(id)
    try {
      await api.post(`/admin/appeals/${id}/resolve`, { resolution })
      await load()
      await loadCounts()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  async function submitRefund(reportId: string) {
    if (!refundFile || !refundForm) return
    setRefundUploading(true)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión no encontrada')

      const ext = refundFile.name.split('.').pop() || 'jpg'
      const path = `refunds/${reportId}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, refundFile, { upsert: true })
      if (upErr) throw new Error(upErr.message)

      await api.post(`/admin/appeals/${reportId}/refund`, {
        refundProofPath: path,
        amount: refundForm.amount,
      })

      setRefundForm(null)
      setRefundFile(null)
      await load()
      await loadCounts()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRefundUploading(false)
    }
  }

  async function loadTimeline(orderId: string) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('order_event_log')
        .select('event_type, actor_role, created_at, data')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })

      setTimeline(data ?? [])
    } catch {}
  }

  function toggleExpand(appeal: AdminAppealDto) {
    if (expandedId === appeal.id) {
      setExpandedId(null)
      setTimeline(null)
    } else {
      setExpandedId(appeal.id)
      loadTimeline(appeal.orderId)
    }
  }

  const pendingCount = counts.pending + counts.refund_pending

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Antifraude"
        title="Apelaciones"
        description={pendingCount > 0 ? `${pendingCount} caso${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''}` : 'Sin pendientes'}
        right={<Button size="sm" variant="outline" onClick={() => { load(); loadCounts() }}>Refrescar</Button>}
      />

      <div className="mb-4 flex gap-1 rounded-[14px] bg-ink/[0.04] p-1">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-[10px] py-2 text-center text-[13px] font-semibold transition-colors ${tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!appeals ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : appeals.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.shield className="h-5 w-5" />}
            title={tab === 'pending' ? 'Sin apelaciones pendientes' : tab === 'refund_pending' ? 'Sin devoluciones pendientes' : 'Sin apelaciones resueltas'}
            hint="🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {appeals.map((a) => (
            <li key={a.id} className="t-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={
                        a.appealStatus === 'pending' ? 'Pendiente'
                          : a.appealStatus === 'in_review' ? 'En revisión'
                          : a.appealStatus === 'approved' ? (a.refundStatus === 'completed' ? 'Devuelto' : 'Aprobado')
                          : 'Rechazado'
                      }
                      tone={
                        a.appealStatus === 'rejected' ? 'danger'
                          : a.appealStatus === 'approved' && a.refundStatus === 'completed' ? 'success'
                          : 'warning'
                      }
                    />
                    {a.orderShortId && <span className="font-mono text-[13px] text-ink-muted">#{a.orderShortId}</span>}
                  </div>
                  <p className="mt-1.5 text-[14px] text-ink">{a.description}</p>
                  {a.customerPhone && <p className="mt-0.5 text-[13px] text-ink-subtle">📞 {a.customerPhone}</p>}

                  {a.evidenceUrl && (
                    <a href={a.evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-[13px] text-brand hover:underline">
                      <Ico.eye className="h-3.5 w-3.5" /> Ver comprobante del cliente
                    </a>
                  )}

                  <button type="button" onClick={() => toggleExpand(a)} className="mt-2 block text-[12px] text-ink-subtle hover:underline">
                    {expandedId === a.id ? '▲ Ocultar historial' : '▼ Ver historial del pedido'}
                  </button>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {a.appealStatus === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => markInReview(a.id)}>
                        Marcar en revisión
                      </Button>
                      <Button size="sm" disabled={busyId === a.id} onClick={() => resolve(a.id, 'favor_cliente')}>
                        A favor del cliente
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => resolve(a.id, 'favor_restaurante')}>
                        A favor del restaurante
                      </Button>
                    </>
                  )}
                  {a.appealStatus === 'in_review' && (
                    <>
                      <Button size="sm" disabled={busyId === a.id} onClick={() => resolve(a.id, 'favor_cliente')}>
                        A favor del cliente
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => resolve(a.id, 'favor_restaurante')}>
                        A favor del restaurante
                      </Button>
                    </>
                  )}
                  {a.appealStatus === 'approved' && a.refundStatus === 'pending' && (
                    <Button size="sm" onClick={() => setRefundForm({ id: a.id, amount: a.refundAmount ?? 0 })}>
                      Registrar devolución
                    </Button>
                  )}
                </div>
              </div>

              {expandedId === a.id && timeline && (
                <div className="mt-4 border-t pt-3" style={{ borderColor: 'rgba(26,22,20,0.08)' }}>
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-subtle">Historial</div>
                  {timeline.length === 0 ? (
                    <p className="text-[12px] text-ink-subtle">Sin eventos registrados.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {timeline.map((ev, i) => (
                        <div key={`${ev.created_at}-${i}`} className="flex gap-2 text-[12px]">
                          <span className="shrink-0 font-mono text-ink-subtle">
                            {new Date(ev.created_at).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                          </span>
                          <span className="text-ink-muted">
                            {ev.event_type.replace('order.', '')}
                            {ev.actor_role ? ` (${ev.actor_role})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {refundForm?.id === a.id && (
                <div className="mt-4 border-t pt-3" style={{ borderColor: 'rgba(26,22,20,0.08)' }}>
                  <div className="mb-2 text-[13px] font-semibold text-ink">Registrar devolución</div>
                  <div className="flex flex-col gap-2.5">
                    <div>
                      <label className="text-[12px] text-ink-subtle">Monto a devolver</label>
                      <input
                        type="number"
                        step="0.01"
                        value={refundForm.amount}
                        onChange={(e) => setRefundForm({ ...refundForm, amount: Number(e.target.value) })}
                        className="mt-1 w-full rounded-[10px] border border-border bg-white px-3 py-2 text-[14px]"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-ink-subtle">Captura del Yape de devolución</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setRefundFile(e.target.files?.[0] ?? null)}
                        className="mt-1 block w-full text-[13px]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!refundFile || refundUploading} onClick={() => submitRefund(a.id)}>
                        {refundUploading ? 'Subiendo...' : 'Confirmar devolución'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRefundForm(null); setRefundFile(null) }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
