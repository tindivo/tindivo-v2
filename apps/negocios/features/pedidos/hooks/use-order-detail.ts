'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export interface DetailItem {
  qty: number
  name: string
  price: number
  note: string | null
  mods: string | null
}

export interface FreshOrder {
  id: string
  status: string
  payment_proof_status: string | null
  proof_attempt: number | null
  comprobante_prepago_url: string | null
  validation_context: string | null
}

export function useOrderDetail(
  selectedId: string | null,
  selSource: string | null,
  isPrepaid: boolean,
  selProofPath: string | null,
) {
  const [detailItems, setDetailItems] = useState<DetailItem[] | null>(null)
  const [detailProofUrl, setDetailProofUrl] = useState<string | null>(null)
  const [freshOrder, setFreshOrder] = useState<FreshOrder | null>(null)
  const [freshSettledFor, setFreshSettledFor] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setDetailItems(null)
    setDetailProofUrl(null)
    setFreshOrder(null)

    if (!selectedId) return

    const supabase = getSupabaseBrowser()
    void (async () => {
      let freshPath: string | null = selProofPath

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
            const typedData = data as FreshOrder
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
          if (!cancel) setFreshSettledFor(selectedId)
        }
      }

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
  }, [selectedId, selSource, isPrepaid, selProofPath])

  const activeProofPath = freshOrder ? freshOrder.comprobante_prepago_url : selProofPath
  const isFreshLoading = isPrepaid && freshSettledFor !== selectedId
  const isResolvingProof = isPrepaid && activeProofPath !== null && detailProofUrl === null
  const isLoadingActions = isFreshLoading || isResolvingProof

  return {
    detailItems,
    detailProofUrl,
    freshOrder,
    isLoadingActions,
    reset: () => setFreshSettledFor(null),
  }
}
