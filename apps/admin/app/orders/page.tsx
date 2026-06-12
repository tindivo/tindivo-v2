'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { DataTable, EmptyState, fieldSm, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'
import { ACTIVE_STATUSES, ORDER_STATUS, PAYMENT_INTENT_LABEL } from '@/lib/labels'
import type { OrderRow } from '@/lib/types'

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelShort, setCancelShort] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<OrderRow[]>>('/admin/orders')
      .then((r) => setOrders(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function doCancel() {
    if (!cancelId || note.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/admin/orders/${cancelId}/cancel`, { note: note.trim() })
      setCancelId(null)
      setNote('')
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        eyebrow="Operación"
        title="Pedidos"
        description={orders ? `${orders.length} pedidos recientes` : 'Últimos pedidos recibidos.'}
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {cancelId && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[16px] border border-danger/30 bg-danger/5 p-3">
          <span className="text-[13px] text-danger">Cancelar #{cancelShort}:</span>
          <input
            className={`${fieldSm} flex-1`}
            placeholder="Motivo (obligatorio)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            variant="danger"
            disabled={busy || note.trim().length < 3}
            onClick={doCancel}
          >
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCancelId(null)}>
            Cerrar
          </Button>
        </div>
      )}

      <div className="t-card">
        {!orders ? (
          <div className="h-40 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : (
          <DataTable
            rows={orders}
            getRowKey={(o) => o.id}
            empty={
              <EmptyState icon={<Ico.orders className="h-5 w-5" />} title="Aún no hay pedidos" />
            }
            columns={[
              { key: 'short', header: 'Código', mono: true, render: (o) => `#${o.short_id}` },
              { key: 'cliente', header: 'Cliente', render: (o) => o.customer_name ?? '—' },
              {
                key: 'estado',
                header: 'Estado',
                render: (o) => {
                  const s = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'neutral' as const }
                  return <StatusBadge label={s.label} tone={s.tone} />
                },
              },
              {
                key: 'pago',
                header: 'Pago',
                render: (o) => (
                  <span>
                    {PAYMENT_INTENT_LABEL[o.payment_intent] ?? o.payment_intent}
                    {o.payment_intent === 'pending_cash' && o.client_pays_with != null && (
                      <span className="block text-[11px] text-ink-subtle tabular-nums">
                        paga con {soles(Number(o.client_pays_with))} · vuelto{' '}
                        {soles(Number(o.change_to_give ?? 0))}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'monto',
                header: 'Monto',
                align: 'right',
                mono: true,
                render: (o) => soles(o.order_amount),
              },
              {
                key: 'comision',
                header: 'Comisión',
                align: 'right',
                mono: true,
                render: (o) => soles(o.tindivo_commission),
              },
              {
                key: 'accion',
                header: '',
                align: 'right',
                render: (o) =>
                  ACTIVE_STATUSES.has(o.status) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelId(o.id)
                        setCancelShort(o.short_id)
                        setNote('')
                      }}
                      className="rounded-lg px-2 py-1 text-[12px] text-danger transition-colors hover:bg-danger/10"
                    >
                      Cancelar
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
