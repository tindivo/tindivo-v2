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
  const [freshOrder, setFreshOrder] = useState<{
    id: string
    status: string
    payment_proof_status: string | null
    proof_attempt: number | null
    comprobante_prepago_url: string | null
    validation_context: string | null
  } | null>(null)
  // Marca QUÉ pedido ya resolvió su fetch de frescura (con éxito o con error).
  // No es un booleano de "cargando": guardar la identidad permite derivar el flag de
  // carga en cada render comparándola con la selección actual, de modo que sea correcto
  // ya en el PRIMER render —antes de que corra el efecto—. Un booleano almacenado no
  // puede lograrlo, porque solo se activa dentro del efecto, que corre tras el paint.
  const [freshSettledFor, setFreshSettledFor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPause, setShowPause] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supportWhatsapp, setSupportWhatsapp] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'support_whatsapp')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setSupportWhatsapp(String(data.value).replace(/"/g, ''))
        }
      })
  }, [])

  // Datos derivados del pedido seleccionado (para deps honestas del efecto).
  const selRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null
  const selSource = selRow?.source ?? null
  const selPaymentIntent = selRow?.payment_intent ?? null
  const selProofPath = selRow?.comprobante_prepago_url ?? null

  // Detalle: carga ligera de frescura de estado + items (Online) + comprobante firmado (prepago).
  useEffect(() => {
    let cancel = false
    setDetailItems(null)
    setDetailProofUrl(null)
    setFreshOrder(null)

    if (!selectedId) return

    const isPrepaid = selPaymentIntent === 'prepaid'

    const supabase = getSupabaseBrowser()
    void (async () => {
      let freshPath: string | null = selProofPath

      // Guard 2 — Frescura del estado para pedidos prepagados:
      // Fetch ligero del estado actual en DB para prevenir botones de estado viejo si la lista está stale.
      if (isPrepaid) {
        try {
          const { data } = await (
            supabase
              .from('orders')
              .select(
                'id, status, payment_proof_status, proof_attempt, comprobante_prepago_url, validation_context',
              ) as any
          )
            .eq('id', selectedId)
            .maybeSingle()

          if (!cancel && data) {
            const typedData = data as {
              id: string
              status: string
              payment_proof_status: string | null
              proof_attempt: number | null
              comprobante_prepago_url: string | null
              validation_context: string | null
            }
            setFreshOrder({
              id: String(typedData.id),
              status: String(typedData.status),
              payment_proof_status: typedData.payment_proof_status ?? null,
              proof_attempt:
                typedData.proof_attempt != null ? Number(typedData.proof_attempt) : null,
              comprobante_prepago_url: typedData.comprobante_prepago_url ?? null,
              validation_context: typedData.validation_context ?? null,
            })
            freshPath = typedData.comprobante_prepago_url ?? freshPath
          }
        } catch {
          /* fail-open: continuar con datos en memoria si la red falla */
        } finally {
          // Se marca como resuelto TAMBIÉN cuando el fetch falla: eso preserva el
          // fail-open de arriba. Si solo se derivara de `freshOrder`, un error de red
          // dejaría la guarda armada para siempre y los botones no aparecerían nunca.
          if (!cancel) setFreshSettledFor(selectedId)
        }
      }

      // Carga de items del pedido (Customer PWA)
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

      // Guard 1 — Fetch de la URL firmada del comprobante de prepago
      if (freshPath) {
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
  }, [selectedId, selSource, selPaymentIntent, selProofPath])

  const newOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'nuevos'), [vms])
  const cookingOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'cocina'), [vms])
  const routeOrders = useMemo(() => vms.filter((v) => getColumn(v.status) === 'reparto'), [vms])
  const history = useMemo(
    () => vms.filter((v) => getColumn(v.status) === 'entregados').slice(0, 40),
    [vms],
  )
  const selectedBase = selectedId ? (vms.find((v) => v.rowId === selectedId) ?? null) : null
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

  // Cómputo de la guardia doble para el detalle
  const activeProofPath = freshOrder ? freshOrder.comprobante_prepago_url : selProofPath
  const isPrepaidSelected = selected?.payment === 'prepaid'
  // DERIVADO, no almacenado: hay carga de frescura pendiente mientras el pedido prepago
  // seleccionado no coincida con el último que resolvió su fetch. En el primer render tras
  // abrir el detalle, `freshSettledFor` ya fue puesto a null por `onOpen` en el mismo lote
  // que `setSelectedId`, así que esto vale true SIN depender de que el efecto haya corrido.
  const isFreshLoading = isPrepaidSelected && freshSettledFor !== selectedId
  const isResolvingProof = isPrepaidSelected && activeProofPath !== null && detailProofUrl === null
  const isLoadingActions = isFreshLoading || isResolvingProof

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
        const isPrepaid = selected.payment === 'prepaid'

        // El tiempo de cocción viaja en TODAS las ramas. En prepago se guarda sin
        // arrancar el reloj; en contraentrega arranca de inmediato. Una sola
        // llamada por rama: antes eran dos POST secuenciales sin transacción y un
        // fallo entre ambos dejaba el pedido huérfano en `confirmed`.
        if (selected.status === 'validando') {
          // Antifraude: la cajera ya llamó y validó. validate_order ramifica por
          // payment_intent: prepaid → pending_acceptance, contraentrega → preparing.
          const res = (await post(`/business/orders/${id}/validate`, {
            pass: true,
            prepTimeMinutes: prep,
          })) as { status?: string }
          if (res?.status === 'pending_acceptance' || isPrepaid) {
            // Prepago: accept → awaiting_payment. El cliente debe pagar antes de preparar.
            await post(`/business/orders/${id}/transition`, {
              action: 'accept',
              prepTimeMinutes: prep,
            })
          }
          // Contraentrega: validate ya lo dejó en preparing. Nada más que hacer.
        } else {
          // accept lleva a awaiting_payment (prepago) o directo a preparing
          // (contraentrega), resolviendo los tres campos de tiempo en el backend.
          await post(`/business/orders/${id}/transition`, {
            action: 'accept',
            prepTimeMinutes: prep,
          })
        }

        setSelectedId(null)
        await refetchOrders()
      }),
    onReject: (code, text) =>
      run(async () => {
        if (!selected) return
        const id = selected.rowId
        // Discriminar por presencia de comprobante, NO por status.
        // proofAttempt >= 1 significa que el cliente ya subió un voucher → rechazo de COMPROBANTE.
        // proofAttempt = 0 significa que no hay comprobante → rechazo de DISPONIBILIDAD.
        const hasProof = selected.proofAttempt >= 1
        if (hasProof)
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
            cancelReasonDetail: code,
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
          cancelReasonDetail: code,
        })
        setSelectedId(null)
        await refetchOrders()
      }),
    onCallDriver: () => {
      if (!selected) return
      const phone = supportWhatsapp || '51906550166'
      const msg = encodeURIComponent(
        `Hola Tindivo, necesito un motorizado urgente para el pedido #${selected.id}. Lleva ${selected.bufferMinutes ?? '?'}min esperando.`,
      )
      window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank')
    },
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
    // Ambos setState caen en el mismo lote de React, así que el primer render tras abrir
    // ya ve `freshSettledFor === null`. El reset es imprescindible para reabrir el MISMO
    // pedido: sin él, la marca seguiría coincidiendo y la guarda nacería caída.
    onOpen: (o: { rowId: string }) => {
      setFreshSettledFor(null)
      setSelectedId(o.rowId)
    },
    selected,
    detailItems,
    detailProofUrl,
    qrUrl,
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
      <div className="flex flex-col flex-1 min-h-0 lg:hidden">
        <PedidosMobile {...viewProps} />
      </div>
      <div className="hidden lg:flex" style={{ flex: 1, minWidth: 0 }}>
        <PedidosDesktop {...viewProps} />
      </div>
    </>
  )
}
