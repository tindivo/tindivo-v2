'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { DataTable, EmptyState, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { limaDateTime, soles } from '@/lib/format'

type Band = 'near' | 'far'

interface PendingBandOrderRow {
  id: string
  short_id: string
  delivered_at: string | null
  delivery_reference: string | null
  delivery_distance_band: Band | null
  delivery_fee_charged: number | null
  commission_amount: number | null
  order_amount: number | null
}

const BAND_LABEL: Record<Band, string> = { near: 'Cerca', far: 'Lejos' }

export default function AdminPendingBandOrdersPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = use(params)

  const [rows, setRows] = useState<PendingBandOrderRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .get<ApiEnvelope<PendingBandOrderRow[]>>(
        `/admin/businesses/${businessId}/pending-band-orders`,
      )
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  async function corregirBanda(orderId: string, band: Band) {
    setSavingId(orderId)
    setError(null)
    try {
      await api.patch(`/admin/orders/${orderId}/distance-band`, { band })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSavingId(null)
    }
  }

  const totalPendiente = (rows ?? []).reduce(
    (s, r) => s + Number(r.delivery_fee_charged ?? 0) + Number(r.commission_amount ?? 0),
    0,
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/cobros"
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink"
        >
          ← Volver a cobros
        </Link>
        <SectionHeader
          eyebrow="Auditoría de banda"
          title="Carreras pendientes de cobro"
          description={
            rows
              ? `${rows.length} carrera${rows.length === 1 ? '' : 's'} sin liquidar · ${soles(totalPendiente)} en total`
              : 'Cargando…'
          }
        />
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-[14px] text-danger">
          {error}
        </div>
      )}

      <div className="t-card">
        {!rows ? (
          <div className="h-28 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : (
          <DataTable
            rows={rows}
            getRowKey={(r) => r.id}
            empty={
              <EmptyState
                title="Sin carreras pendientes"
                hint="Este negocio no tiene cargos de envío sin liquidar."
              />
            }
            columns={[
              {
                key: 'fecha',
                header: 'Fecha',
                mono: true,
                render: (r) => (
                  <span className="text-[12px] text-ink-muted">
                    {r.delivered_at ? limaDateTime(r.delivered_at) : '—'}
                  </span>
                ),
              },
              {
                key: 'pedido',
                header: 'Pedido',
                render: (r) => (
                  <Link href={`/orders/${r.id}`} className="font-mono text-[13px] underline">
                    #{r.short_id}
                  </Link>
                ),
              },
              {
                key: 'referencia',
                header: 'Referencia',
                render: (r) => (
                  <span className="text-[12px] text-ink-subtle">{r.delivery_reference ?? '—'}</span>
                ),
              },
              {
                key: 'banda',
                header: 'Banda',
                render: (r) => (
                  <select
                    className="t-field h-8 py-0 text-[12px]"
                    value={r.delivery_distance_band ?? ''}
                    disabled={savingId === r.id}
                    onChange={(e) => corregirBanda(r.id, e.target.value as Band)}
                  >
                    <option value="near">{BAND_LABEL.near}</option>
                    <option value="far">{BAND_LABEL.far}</option>
                  </select>
                ),
              },
              {
                key: 'envio',
                header: 'Envío',
                align: 'right',
                mono: true,
                render: (r) => soles(Number(r.delivery_fee_charged ?? 0)),
              },
              {
                key: 'comision',
                header: 'Comisión',
                align: 'right',
                mono: true,
                render: (r) => soles(Number(r.commission_amount ?? 0)),
              },
              {
                key: 'total',
                header: 'Total',
                align: 'right',
                mono: true,
                render: (r) => (
                  <strong>
                    {soles(Number(r.delivery_fee_charged ?? 0) + Number(r.commission_amount ?? 0))}
                  </strong>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
