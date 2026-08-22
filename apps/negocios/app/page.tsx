'use client'

import { useEffect, useMemo, useState } from 'react'
import { PedidosDesktop, PedidosMobile } from '@/components/dashboard/pedidos-view'
import { useDashboard } from '@/components/dashboard/shell'
import { useOrderActions } from '@/features/pedidos/hooks/use-order-actions'
import { useOrderDetail } from '@/features/pedidos/hooks/use-order-detail'
import { useSupportPhone } from '@/features/pedidos/hooks/use-support-phone'
import { getColumn } from '@/lib/orders/view-model'

export default function NegocioPedidosPage() {
  const {
    bizName,
    accent,
    paymentQrs,
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
  } = useDashboard()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPause, setShowPause] = useState(false)
  const supportWhatsapp = useSupportPhone()

  const newOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'nuevos'), [vms])
  const cookingOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'cocina'), [vms])
  const routeOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'reparto'), [vms])
  const history = useMemo(
    // SIN RECORTE. El `.slice(0, 40)` que había aquí hacía de tapadera de una
    // consulta sin ventana: traía cerrados de días y luego escondía todos menos
    // los 40 primeros, mientras el chip de arriba anunciaba el total sin
    // recortar. Dos números distintos para la misma lista. Ahora la consulta
    // trae solo la jornada, que es una lista corta y completa; el contenedor ya
    // scrollea.
    () => vms.filter((v) => getColumn(v.status) === 'entregados'),
    [vms],
  )

  const selectedBase = selectedId ? (vms.find((v) => v.rowId === selectedId) ?? null) : null
  const selRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null
  const { detailItems, detailProofUrl, freshOrder, isLoadingActions, reset } = useOrderDetail(
    selectedId,
    selRow?.source ?? null,
    selectedBase?.payment === 'prepaid',
    selRow?.comprobante_prepago_url ?? null,
  )

  const selected = useMemo(() => {
    if (!selectedBase) return null
    if (!freshOrder || freshOrder.id !== selectedBase.rowId) return selectedBase
    return {
      ...selectedBase,
      status: freshOrder.status,
      proofStatus: freshOrder.payment_proof_status,
      proofAttempt: freshOrder.proof_attempt ?? selectedBase.proofAttempt,
    }
  }, [selectedBase, freshOrder])

  // Si el pedido seleccionado vence o es cancelado (sale del flujo activo),
  // cerramos el sidebar automáticamente para evitar que la cajera quede atrapada
  // en un pedido que ya no existe en el tablero.
  useEffect(() => {
    if (!selectedId) return
    if (!selectedBase || selected?.status === 'cancelled') {
      setSelectedId(null)
    }
  }, [selectedId, selectedBase, selected?.status])

  const { actions, busy, error, supportPhone, onConfirmPause, onResume } = useOrderActions({
    selected,
    supportWhatsapp,
    bizName,
    refetchOrders,
    onDone: () => setSelectedId(null),
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
    onOpen: (o: { rowId: string }) => {
      reset()
      setSelectedId(o.rowId)
    },
    supportPhone,
    onCallDriver: actions.onCallDriver,
    selected,
    detailItems,
    detailProofUrl,
    paymentQrs,
    detailBusy: busy,
    detailLoadingActions: isLoadingActions,
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
      <div className="flex flex-1 min-h-0 flex-col lg:hidden">
        <PedidosMobile {...viewProps} />
      </div>
      <div className="hidden min-w-0 min-h-0 flex-1 flex-col lg:flex">
        <PedidosDesktop {...viewProps} />
      </div>
    </>
  )
}
