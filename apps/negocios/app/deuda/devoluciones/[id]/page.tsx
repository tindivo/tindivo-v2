'use client'

import { LoadingState } from '@tindivo/ui'
import Link from 'next/link'
import { use } from 'react'
import { DashboardShell } from '@/components/dashboard/shell'
import { RefundDetailView } from '@/features/deuda/components/refund-detail-view'
import { useRefundDetail } from '@/features/deuda/hooks/use-refund-detail'

export default function DevolucionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error } = useRefundDetail(id)

  return (
    <DashboardShell
      active="deuda"
      title="Detalle de Devolución"
      subtitle={
        data?.order?.shortId ? `Pedido #${data.order.shortId}` : 'Información y transparencia'
      }
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <div>
          <Link
            href="/deuda"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline"
          >
            ← Volver a Mi cuenta
          </Link>
        </div>

        {loading ? (
          <LoadingState
            variant="card"
            label="Cargando detalle de la devolución…"
            icon="receipt_long"
            className="my-6"
          />
        ) : error || !data ? (
          <div className="rounded-2xl border border-danger/10 bg-danger-soft p-5 text-danger">
            <div className="text-[15px] font-bold">No se pudo cargar la devolución</div>
            <div className="mt-1 text-sm">{error || 'Información no disponible'}</div>
          </div>
        ) : (
          <RefundDetailView data={data} />
        )}
      </div>
    </DashboardShell>
  )
}
