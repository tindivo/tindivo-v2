'use client'

import { type OrderStatus, OrderStatusSchema } from '@tindivo/contracts'
import { useEffect, useState } from 'react'
import { getProofUrl } from '@/features/pedidos/lib/proof-url'
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
  /**
   * El estado CANÓNICO. Era `string`, y ese string acababa pisando el
   * `status` del view-model en `app/page.tsx` — o sea que por aquí entraba al
   * tablero un estado sin validar, saltándose la exhaustividad de `getColumn`.
   * Se valida al rehidratar (ver abajo) en vez de castear a ciegas.
   */
  status: OrderStatus
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
  const [proofSettledFor, setProofSettledFor] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    setDetailItems(null)
    setDetailProofUrl(null)
    setFreshOrder(null)
    setProofSettledFor(null)

    if (!selectedId) return

    const supabase = getSupabaseBrowser()
    const id = selectedId

    /**
     * Pide la URL firmada y la deja lista. Se marca `settled` PASE LO QUE PASE:
     * antes, un fallo aquí dejaba `detailProofUrl` en `null` para siempre y con
     * él `isLoadingActions` en `true`, o sea los botones de aceptar y rechazar
     * deshabilitados hasta que la cajera cerrara y volviera a abrir.
     */
    async function resolveProof(path: string) {
      try {
        const url = await getProofUrl(id, path)
        if (!cancel) setDetailProofUrl(url)
      } catch {
        /* sin comprobante todavía */
      } finally {
        if (!cancel) setProofSettledFor(id)
      }
    }

    /*
      LAS TRES PETICIONES SALEN A LA VEZ, y antes iban en fila.

      La imagen del comprobante era la última de la cola: no empezaba a bajar
      hasta que habían vuelto la relectura del pedido y la lista de items — que
      no tienen nada que ver con ella— y solo entonces se pedía la URL firmada.
      Tres viajes de ida y vuelta antes del primer byte de la foto, con la
      cajera mirando un hueco gris y los botones apagados.

      La URL firmada no necesita la relectura: la fila de la tarjeta ya trae
      `comprobante_prepago_url`. Se pide de entrada y la relectura solo la
      rehace si resulta que el cliente subió un intento más nuevo.
    */
    const proofUpFront = isPrepaid && selProofPath ? resolveProof(selProofPath) : null

    const readFresh = async () => {
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
              // `parse` y no un cast. Un estado que esta versión del front no
              // conozca hace saltar el `catch` de abajo, que es fail-open: se
              // sigue con los datos que ya había en memoria. Eso es mejor que
              // meterlo en el view-model, donde `getUiState` lo pintaría como
              // CANCELADO —tachado y en gris— sobre un pedido que sigue vivo.
              status: OrderStatusSchema.parse(typedData.status),
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
          if (!cancel) setFreshSettledFor(id)
        }
      }

      // El cliente pudo subir un intento MÁS NUEVO que el que traía la tarjeta.
      // Solo entonces hay que volver a firmar; si coincide, la petición que ya
      // salió arriba vale.
      if (freshPath && freshPath !== selProofPath) await resolveProof(freshPath)
      else if (!freshPath && !cancel) setProofSettledFor(id)
    }

    const readItems = async () => {
      try {
        const { data } = await supabase
          .from('customer_order_items')
          .select(
            'item_name_snapshot,quantity,unit_price,line_total,note,customer_order_item_modifiers(option_name_snapshot)',
          )
          .eq('order_id', selectedId)
        if (!cancel && data && data.length > 0) {
          setDetailItems(
            data.map((r) => {
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
      } catch {
        /* fail-open */
      }
    }

    void Promise.all([proofUpFront, readFresh(), readItems()])

    return () => {
      cancel = true
    }
  }, [selectedId, selSource, isPrepaid, selProofPath])

  const activeProofPath = freshOrder ? freshOrder.comprobante_prepago_url : selProofPath
  const isFreshLoading = isPrepaid && freshSettledFor !== selectedId
  // Se mira si la petición TERMINÓ, no si trajo URL. Con `detailProofUrl ===
  // null` como condición, un fallo de red dejaba los botones deshabilitados
  // para siempre — no había segundo intento que pudiera desbloquearlos.
  const isResolvingProof = isPrepaid && activeProofPath !== null && proofSettledFor !== selectedId
  const isLoadingActions = isFreshLoading || isResolvingProof

  return {
    detailItems,
    detailProofUrl,
    freshOrder,
    isLoadingActions,
    reset: () => setFreshSettledFor(null),
  }
}
