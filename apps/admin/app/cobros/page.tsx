'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { DataTable, EmptyState, SectionHeader } from '@/components/admin'
import { SettlementModal } from '@/components/cobros/settlement-modal'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

interface BusinessSummaryRow {
  id: string
  name: string
  logoUrl: string | null
  accentColor: string | null
  yapeNumber: string | null
  balanceDue: number
  totalCommissions: number
  totalDeliveryFees: number
  totalRefunds: number
  orderCount: number
}

interface PaymentHistoryRow {
  id: string
  businessId: string
  businessName: string
  amount: number
  paymentMethod: string
  paidAt: string
  note: string | null
  settledChargeCount: number
  orderCount: number
}

export default function CobrosPage() {
  const [summaries, setSummaries] = useState<BusinessSummaryRow[] | null>(null)
  const [history, setHistory] = useState<PaymentHistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessSummaryRow | null>(null)

  const loadData = useCallback(() => {
    setError(null)
    // Cargar resumenes de deuda
    api
      .get<ApiEnvelope<BusinessSummaryRow[]>>('/admin/charges/summary')
      .then((r) => setSummaries(r.data))
      .catch((e) => setError(errMsg(e)))

    // Cargar historial de pagos
    api
      .get<ApiEnvelope<PaymentHistoryRow[]>>('/admin/charges/history')
      .then((r) => setHistory(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalAccumulatedDebt = (summaries ?? []).reduce((s, b) => s + b.balanceDue, 0)
  const activeDebtBusinessCount = (summaries ?? []).filter((b) => b.balanceDue > 0).length

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SectionHeader
        eyebrow="Finanzas"
        title="Cobros y Liquidaciones"
        description="Gestión de saldo deudor de negocios y registro de pagos parciales/totales."
        right={
          <Button size="sm" variant="outline" onClick={loadData}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="text-[14px] text-danger">{error}</p>}

      {/* Tarjeta de Resumen Global */}
      <div className="t-card flex items-center justify-between border border-brand/20 bg-brand/5 p-5">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
            Deuda Total Acumulada
          </p>
          <p className="text-[28px] font-bold text-ink font-mono mt-1">
            {soles(totalAccumulatedDebt)}
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-[13px] font-bold text-red-700">
            {activeDebtBusinessCount} negocio{activeDebtBusinessCount === 1 ? '' : 's'} con deuda activa
          </span>
        </div>
      </div>

      {/* Tabla de Restaurantes con Deuda Activa */}
      <div className="t-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="t-display text-[15px] text-ink font-bold">
            Restaurantes pendientes de cobro
          </p>
        </div>

        {!summaries ? (
          <div className="h-28 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : (
          <DataTable
            rows={summaries}
            getRowKey={(r) => r.id}
            empty={<EmptyState title="Sin deudas pendientes 🎉" hint="Todos los restaurantes están al día." />}
            columns={[
              {
                key: 'name',
                header: 'Restaurante',
                render: (r) => (
                  <div>
                    <span className="font-bold text-ink text-[14px]">{r.name}</span>
                    {r.yapeNumber && (
                      <span className="block text-[11px] text-ink-subtle">Yape: {r.yapeNumber}</span>
                    )}
                  </div>
                ),
              },
              {
                key: 'commissions',
                header: 'Comisiones',
                align: 'right',
                mono: true,
                render: (r) => soles(r.totalCommissions),
              },
              {
                key: 'delivery',
                header: 'Delivery Fees',
                align: 'right',
                mono: true,
                render: (r) => soles(r.totalDeliveryFees),
              },
              {
                key: 'refunds',
                header: 'Devoluciones',
                align: 'right',
                mono: true,
                render: (r) => (r.totalRefunds > 0 ? soles(r.totalRefunds) : '—'),
              },
              {
                key: 'total',
                header: 'Total Deuda',
                align: 'right',
                mono: true,
                render: (r) => (
                  <span className="font-bold text-danger">{soles(r.balanceDue)}</span>
                ),
              },
              {
                key: 'accion',
                header: '',
                align: 'right',
                render: (r) =>
                  r.balanceDue > 0 ? (
                    <Button size="sm" onClick={() => setSelectedBusiness(r)}>
                      + Liquidar
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </div>

      {/* Historial de Pagos Registrados */}
      <div className="t-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="t-display text-[15px] text-ink font-bold">
            Historial de Pagos Registrados
          </p>
        </div>

        {!history ? (
          <div className="h-28 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : (
          <DataTable
            rows={history}
            getRowKey={(h) => h.id}
            empty={<EmptyState title="Sin pagos registrados" hint="No se han registrado pagos aún." />}
            columns={[
              {
                key: 'fecha',
                header: 'Fecha',
                mono: true,
                render: (h) => (
                  <span className="text-[12px] text-ink-muted">
                    {new Date(h.paidAt).toLocaleString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                ),
              },
              {
                key: 'business',
                header: 'Restaurante',
                render: (h) => <span className="font-semibold text-ink">{h.businessName}</span>,
              },
              {
                key: 'metodo',
                header: 'Método',
                render: (h) => (
                  <span className="inline-flex rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-[11px] font-semibold text-ink uppercase">
                    {h.paymentMethod}
                  </span>
                ),
              },
              {
                key: 'pedidos',
                header: 'Ítems / Pedidos',
                align: 'right',
                mono: true,
                render: (h) => `${h.settledChargeCount} cargos (${h.orderCount} ped.)`,
              },
              {
                key: 'monto',
                header: 'Monto',
                align: 'right',
                mono: true,
                render: (h) => <span className="font-bold text-success">{soles(h.amount)}</span>,
              },
              {
                key: 'nota',
                header: 'Nota',
                render: (h) => (
                  <span className="text-[12px] italic text-ink-subtle truncate max-w-[150px] inline-block">
                    {h.note ?? '—'}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      {/* Modal de Liquidación Parcial/Total */}
      {selectedBusiness && (
        <SettlementModal
          businessId={selectedBusiness.id}
          businessName={selectedBusiness.name}
          balanceDue={selectedBusiness.balanceDue}
          onClose={() => setSelectedBusiness(null)}
          onSuccess={() => {
            setSelectedBusiness(null)
            loadData()
          }}
        />
      )}
    </div>
  )
}
