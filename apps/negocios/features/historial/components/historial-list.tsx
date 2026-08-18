'use client'

import { Icon } from '@tindivo/ui'
import { useMemo, useState } from 'react'
import { DetailScreen } from '@/components/dashboard/pedido-detail'
import { useOrderDetail } from '@/features/pedidos/hooks/use-order-detail'
import { toOrderVM } from '@/lib/orders/view-model'
import { useHistory } from '../hooks/use-history'
import { toDisplay } from '../lib/format'
import type { HistDisplay, HistFilter } from '../types'
import { ClaimSheet } from './claim-sheet'
import { FilterChips } from './filter-chips'
import { HistoryList } from './history-list'
import { HistorySummary } from './history-summary'

function filterRows(rows: HistDisplay[], filter: HistFilter, search: string): HistDisplay[] {
  const byFilter = (r: HistDisplay) => {
    if (filter === 'delivered') return !r.isCancel
    if (filter === 'cancelled') return r.isCancel
    if (filter === 'web') return r.source === 'web'
    if (filter === 'manual') return r.source === 'manual'
    return true
  }

  const bySearch = (r: HistDisplay) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.customer.toLowerCase().includes(q) || r.shortId.toLowerCase().includes(q)
  }

  return rows.filter(byFilter).filter(bySearch)
}

export function HistorialList() {
  const { rows, loading, error } = useHistory()
  const [filter, setFilter] = useState<HistFilter>('all')
  const [search, setSearch] = useState('')
  const [claimOpen, setClaimOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selRow = useMemo(
    () => (selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null),
    [selectedId, rows],
  )
  const selectedVM = useMemo(() => (selRow ? toOrderVM(selRow) : null), [selRow])

  const { detailItems, detailProofUrl, isLoadingActions, reset } = useOrderDetail(
    selectedId,
    selRow?.source ?? null,
    selectedVM?.payment === 'prepaid',
    selRow?.comprobante_prepago_url ?? null,
  )

  function handleSelect(id: string) {
    reset()
    setSelectedId(id)
  }

  const allDisplayRows = rows.map(toDisplay)
  const visibleRows = useMemo(
    () => filterRows(allDisplayRows, filter, search),
    [allDisplayRows, filter, search],
  )

  const counts = useMemo(
    () => ({
      all: allDisplayRows.length,
      delivered: allDisplayRows.filter((r) => !r.isCancel).length,
      cancelled: allDisplayRows.filter((r) => r.isCancel).length,
      web: allDisplayRows.filter((r) => r.source === 'web').length,
      manual: allDisplayRows.filter((r) => r.source === 'manual').length,
    }),
    [allDisplayRows],
  )

  const cancelledRows = allDisplayRows.filter((r) => r.isCancel)

  if (loading) {
    return <div className="p-10 text-center text-ink-muted">Cargando…</div>
  }

  return (
    <>
      {selectedVM && (
        <DetailScreen
          order={selectedVM}
          items={detailItems}
          proofUrl={detailProofUrl}
          qrUrl={null}
          busy={false}
          isLoadingActions={isLoadingActions}
          actions={{
            onClose: () => setSelectedId(null),
            onAccept: () => {},
            onReject: () => {},
            onVerifyProof: () => {},
            onRejectProof: () => {},
            onExtend: () => {},
            onReady: () => {},
            onCancel: () => {},
          }}
        />
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>
      )}

      <div className="mb-4">
        <HistorySummary rows={allDisplayRows} />
      </div>

      {cancelledRows.length > 0 && (
        <button
          type="button"
          onClick={() => setClaimOpen(true)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-ink/[0.06] bg-card px-3 py-2 text-[13px] font-semibold text-ink shadow-elev-1 transition-all hover:bg-surface"
        >
          <Icon name="gavel" size={16} className="text-brand" /> Reclamar cobertura por fraude
        </button>
      )}
      <ClaimSheet orders={cancelledRows} open={claimOpen} onClose={() => setClaimOpen(false)} />

      {/* Desktop toolbar */}
      <div className="mb-3.5 hidden items-center gap-2.5 rounded-[14px] border border-ink/[0.04] bg-card p-2.5 lg:flex">
        <div className="flex flex-1 items-center gap-2 px-2">
          <Icon name="search" size={18} className="shrink-0 text-ink-muted" />
          <input
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
            placeholder="Buscar por nombre o #ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterChips active={filter} counts={counts} onChange={setFilter} />
      </div>

      {/* Mobile filters + search */}
      <div className="mb-2.5 lg:hidden">
        <FilterChips active={filter} counts={counts} onChange={setFilter} />
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/[0.04] bg-card p-2.5">
          <Icon name="search" size={18} className="shrink-0 text-ink-muted" />
          <input
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
            placeholder="Buscar por nombre o #ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <HistoryList rows={visibleRows} onSelect={handleSelect} />
    </>
  )
}
