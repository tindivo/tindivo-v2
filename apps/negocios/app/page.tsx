'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DetailActions, DetailItem } from '@/components/dashboard/pedido-detail'
import { PedidosDesktop, PedidosMobile } from '@/components/dashboard/pedidos-view'
import { useDashboard } from '@/components/dashboard/shell'
import { api } from '@/lib/api'
import { getColumn } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export default function NegocioPedidosPage() {
  const {
    bizName,
    accent,
    qrUrl,
    paused,
    pauseMinLeft,
    blocked,
    blockReason,
    rows,
    vms,
    counts,
    soundOn,
    toggleSound,
    refetchOrders,
    refetchBiz,
  } = useDashboard()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailItems, setDetailItems] = useState<DetailItem[] | null>(null)
  const [detailProofUrl, setDetailProofUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPause, setShowPause] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Datos derivados del pedido seleccionado (para deps honestas del efecto).
  const selRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null
  const selSource = selRow?.source ?? null
  const selProofPath = selRow?.comprobante_prepago_url ?? null

  // Detalle: carga lazy de items (Online) + comprobante firmado (prepago).
  useEffect(() => {
    let cancel = false
    setDetailItems(null)
    setDetailProofUrl(null)
    if (!selectedId) return
    const supabase = getSupabaseBrowser()
    void (async () => {
      if (selSource === 'customer_pwa') {
        const { data } = await supabase
          .from('customer_order_items')
          .select(
            'item_name_snapshot,quantity,unit_price,line_total,note,customer_order_item_modifiers(option_name_snapshot)',
          )
          .eq('order_id', selectedId)
        if (!cancel)
          setDetailItems(
            (data ?? []).map((r) => {
              const mods = (
                (r.customer_order_item_modifiers ?? []) as { option_name_snapshot: string }[]
              )
                .map((m) => m.option_name_snapshot)
                .join(', ')
              return {
                qty: r.quantity as number,
                name: r.item_name_snapshot as string,
                price: Number(r.line_total ?? (r.unit_price as number) * (r.quantity as number)),
                note: (r.note as string | null) ?? null,
                mods: mods || null,
              }
            }),
          )
      }
      if (selProofPath) {
        try {
          const r = await api.get<{ data: { url: string | null } }>(
            `/business/orders/${selectedId}/prepay-proof`,
          )
          if (!cancel) setDetailProofUrl(r.data.url)
        } catch {
          /* sin comprobante todavía */
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [selectedId, selSource, selProofPath])

  const newOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'nuevos'), [vms])
  const cookingOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'cocina'), [vms])
  const routeOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'reparto'), [vms])
  const history = useMemo(
    () => vms.filter((v) => getColumn(v.status) === 'entregados').slice(0, 40),
    [vms],
  )
  const selected = selectedId ? (vms.find((v) => v.rowId === selectedId) ?? null) : null

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }, [])

  const post = (path: string, body: unknown) => api.post(path, body)

  const actions: DetailActions = {
    onClose: () => setSelectedId(null),
    onAccept: (prep) =>
      run(async () => {
        if (!selected) return
        const id = selected.rowId
        if (selected.status === 'validando')
          await post(`/business/orders/${id}/validate`, { pass: true })
        await post(`/business/orders/${id}/transition`, { action: 'accept' })
        await post(`/business/orders/${id}/transition`, {
          action: 'preparing',
          prepTimeMinutes: prep,
        })
        setSelectedId(null)
        await refetchOrders()
      }),
    onReject: (code, text) =>
      run(async () => {
        if (!selected) return
        const id = selected.rowId
        if (selected.status === 'validando')
          await post(`/business/orders/${id}/validate`, {
            pass: false,
            reason: text,
            reasonCode: code,
          })
        else
          await post(`/business/orders/${id}/transition`, {
            action: 'cancel',
            reason: 'business_cancelled',
            reasonCode: code,
            reasonText: text,
          })
        setSelectedId(null)
        await refetchOrders()
      }),
    onVerifyProof: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, { pass: true })
        await refetchOrders()
      }),
    onRejectProof: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/validate`, {
          pass: false,
          reason: 'Comprobante inválido',
          reasonCode: 'invalid_proof',
        })
        setSelectedId(null)
        await refetchOrders()
      }),
    onExtend: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/extend-prep`, {})
        await refetchOrders()
      }),
    onReady: () =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, { action: 'ready' })
        setSelectedId(null)
        await refetchOrders()
      }),
    onCancel: (code, text) =>
      run(async () => {
        if (!selected) return
        await post(`/business/orders/${selected.rowId}/transition`, {
          action: 'cancel',
          reason: 'business_cancelled',
          reasonCode: code,
          reasonText: text,
        })
        setSelectedId(null)
        await refetchOrders()
      }),
  }

  const onConfirmPause = (min: number | null) =>
    run(async () => {
      await post('/business/pause', { minutes: min })
      setShowPause(false)
      await refetchBiz()
    })
  const onResume = () =>
    run(async () => {
      await api.delete('/business/pause')
      await refetchBiz()
    })

  const viewProps = {
    bizName,
    accent,
    paused,
    pauseMinLeft,
    soundOn,
    onToggleSound: toggleSound,
    onOpenPause: () => setShowPause(true),
    onResume,
    counts,
    newOrders,
    cookingOrders,
    routeOrders,
    history,
    onOpen: (o: { rowId: string }) => setSelectedId(o.rowId),
    selected,
    detailItems,
    detailProofUrl,
    qrUrl,
    detailBusy: busy,
    actions,
    showPauseModal: showPause,
    onClosePause: () => setShowPause(false),
    onConfirmPause,
  }

  return (
    <>
      {(error || blocked) && (
        <div className="fixed top-2 left-1/2 z-[400] -translate-x-1/2 px-2">
          {blocked && (
            <p className="mb-1 rounded-xl bg-danger px-3 py-2 text-center text-[13px] text-white shadow">
              Tu cuenta está suspendida{blockReason ? ` (${blockReason})` : ''}.
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-ink px-3 py-2 text-center text-[13px] text-white shadow">
              {error}
            </p>
          )}
        </div>
      )}
      <div
        className="lg:hidden"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <PedidosMobile {...viewProps} />
      </div>
      <div className="hidden lg:flex" style={{ flex: 1, minWidth: 0 }}>
        <PedidosDesktop {...viewProps} />
      </div>
    </>
  )
}
