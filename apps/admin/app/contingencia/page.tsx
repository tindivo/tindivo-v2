'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { EmptyState, Field, fieldSm, Hero, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'
import { ADVANCE_REASONS, ADVANCE_STATUS } from '@/lib/labels'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AdvanceRow {
  id: string
  amount: number
  reason: string
  actor_charged: string
  status: string
  proof_url: string | null
  dispute_note: string | null
  created_at: string
  customer_phone: string | null
  orders: { short_id: string; businesses: { name: string } | null } | null
}
interface FundInfo {
  current: number
  initial: number
  disputeWindowHours?: number
}

export default function ContingenciaPage() {
  const [advances, setAdvances] = useState<AdvanceRow[] | null>(null)
  const [fund, setFund] = useState<FundInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resAmounts, setResAmounts] = useState<Record<string, string>>({})
  const [resNotes, setResNotes] = useState<Record<string, string>>({})

  const [shortId, setShortId] = useState('')
  const [reasonIdx, setReasonIdx] = useState(0)
  const [customReason, setCustomReason] = useState('')
  const [actor, setActor] = useState<'restaurante' | 'tindivo'>('restaurante')
  const [amount, setAmount] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ advances: AdvanceRow[]; fund: FundInfo | null }>>('/admin/contingency')
      .then((r) => {
        setAdvances(r.data.advances)
        setFund(r.data.fund)
      })
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  function pickReason(i: number) {
    setReasonIdx(i)
    const r = ADVANCE_REASONS[i]
    if (r) setActor(r.actor)
  }

  const isOtherReason = reasonIdx === ADVANCE_REASONS.length - 1

  async function submitAdvance(e: FormEvent) {
    e.preventDefault()
    setFormMsg(null)
    const reason = isOtherReason ? customReason.trim() : (ADVANCE_REASONS[reasonIdx]?.reason ?? '')
    const amt = Number(amount)
    if (!shortId.trim() || !reason || !proofUrl.trim() || !(amt > 0)) {
      setFormMsg({ ok: false, text: 'Completa código, monto (>0), motivo y captura.' })
      return
    }
    setSubmitting(true)
    try {
      const { data: order } = await getSupabaseBrowser()
        .from('orders')
        .select('id')
        .eq('short_id', shortId.trim().toUpperCase())
        .maybeSingle()
      if (!order) throw new Error('No existe un pedido con ese código.')
      await api.post('/admin/contingency', {
        orderId: order.id,
        amount: amt,
        reason,
        actorCharged: actor,
        proofUrl: proofUrl.trim(),
      })
      setFormMsg({ ok: true, text: 'Adelanto registrado.' })
      setShortId('')
      setAmount('')
      setProofUrl('')
      setCustomReason('')
      load()
    } catch (err) {
      setFormMsg({
        ok: false,
        text: errMsg(err) === 'Error' ? (err as Error).message : errMsg(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function resolve(row: AdvanceRow) {
    const note = (resNotes[row.id] ?? '').trim()
    const amt = Number(resAmounts[row.id] ?? row.amount)
    if (!note) {
      setError('La nota de resolución es obligatoria.')
      return
    }
    setBusyId(row.id)
    setError(null)
    try {
      await api.post(`/admin/contingency/${row.id}/resolve`, { resolvedAmount: amt, note })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionHeader
        eyebrow="Riesgo"
        title="Contingencia"
        description="Fondo de adelantos y disputas."
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      <Hero variant="orange" eyebrow="Fondo de contingencia">
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <p className="t-display text-[36px] leading-none tabular-nums">
            {fund ? soles(fund.current) : '—'}
          </p>
          <p className="text-[13px] text-white/80">
            {fund ? `de ${soles(fund.initial)} inicial` : ''}
          </p>
        </div>
      </Hero>

      <div className="t-card">
        <p className="t-display mb-3 text-[16px] text-ink">Registrar adelanto</p>
        <form onSubmit={submitAdvance} className="grid gap-3 sm:grid-cols-2">
          <Field label="Código de pedido">
            <input
              className="t-field"
              value={shortId}
              onChange={(e) => setShortId(e.target.value)}
              placeholder="ABCDEFGH"
              required
            />
          </Field>
          <Field label="Monto adelantado (S/)">
            <input
              className="t-field"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Motivo" className="sm:col-span-2">
            <select
              className="t-field"
              value={reasonIdx}
              onChange={(e) => pickReason(Number(e.target.value))}
            >
              {ADVANCE_REASONS.map((r, i) => (
                <option key={r.reason} value={i}>
                  {r.reason}
                </option>
              ))}
            </select>
          </Field>
          {isOtherReason && (
            <Field label="Especifica el motivo" className="sm:col-span-2">
              <input
                className="t-field"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </Field>
          )}
          <Field label="Carga la pérdida">
            <select
              className="t-field"
              value={actor}
              onChange={(e) => setActor(e.target.value as 'restaurante' | 'tindivo')}
            >
              <option value="restaurante">Restaurante (suma a su deuda)</option>
              <option value="tindivo">Tindivo absorbe</option>
            </select>
          </Field>
          <Field label="Captura del Yape/Plin (URL)">
            <input
              className="t-field"
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="Link o referencia"
              required
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" className="t-btn t-btn-primary t-btn-block" disabled={submitting}>
              {submitting ? 'Registrando…' : 'Registrar adelanto'}
            </button>
          </div>
          {formMsg && (
            <p
              className={`text-[14px] sm:col-span-2 ${formMsg.ok ? 'text-success' : 'text-danger'}`}
            >
              {formMsg.text}
            </p>
          )}
        </form>
      </div>

      {error && <p className="text-[14px] text-danger">{error}</p>}

      <div className="t-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="t-display text-[15px] text-ink">{advances?.length ?? 0} adelantos</p>
        </div>
        {!advances ? (
          <div className="h-24 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : advances.length === 0 ? (
          <EmptyState title="Sin adelantos registrados" />
        ) : (
          <ul className="space-y-3">
            {advances.map((a) => {
              const s = ADVANCE_STATUS[a.status] ?? { label: a.status, tone: 'neutral' as const }
              return (
                <li key={a.id} className="rounded-[16px] border border-ink/5 bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={s.label} tone={s.tone} />
                    <span className="font-mono font-semibold text-[15px]">{soles(a.amount)}</span>
                    {a.orders?.short_id && (
                      <span className="font-mono text-[13px] text-ink-muted">
                        #{a.orders.short_id}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[14px] text-ink">{a.reason}</p>
                  <p className="mt-0.5 text-[13px] text-ink-subtle">
                    {a.orders?.businesses?.name ?? '—'} · carga: {a.actor_charged}
                  </p>
                  {a.dispute_note && (
                    <p className="mt-1 text-[13px] text-warning">Disputa: “{a.dispute_note}”</p>
                  )}
                  {a.status === 'disputado' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                        Resolver S/
                        <input
                          className={`${fieldSm} w-24 text-center font-mono`}
                          inputMode="decimal"
                          placeholder={String(a.amount)}
                          value={resAmounts[a.id] ?? ''}
                          onChange={(e) => setResAmounts({ ...resAmounts, [a.id]: e.target.value })}
                        />
                      </label>
                      <input
                        className={`${fieldSm} flex-1`}
                        placeholder="Nota (0 = a favor del negocio)"
                        value={resNotes[a.id] ?? ''}
                        onChange={(e) => setResNotes({ ...resNotes, [a.id]: e.target.value })}
                      />
                      <Button size="sm" disabled={busyId === a.id} onClick={() => resolve(a)}>
                        Resolver
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
