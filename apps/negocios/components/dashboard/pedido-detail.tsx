'use client'

import { cn, Icon } from '@tindivo/ui'

import { useEffect, useState } from 'react'
import { formatReadyDelta, type OrderVM } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { CANCEL_REASONS, REJECT_REASONS_BASE, REJECT_REASONS_TAIL } from './pedido-detail/constants'
import { DetailRow } from './pedido-detail/detail-row'
import {
  ComandaModal,
  ConfirmDirectPaymentModal,
  PrepTimeModal,
  ReasonModal,
} from './pedido-detail/modals'
import { PaySectionCash, PaySectionMixed, PaySectionWallet } from './pedido-detail/pay-sections'
import type { DetailItem, RejectReason } from './pedido-detail/types'
import { mmss, PayBadgeMini, SourceBadgeMini, soles } from './primitives'

export { PausarModal } from './pedido-detail/modals'
export type { DetailItem, RejectReason }

export interface DetailActions {
  onClose: () => void
  onAccept: (prepMinutes: number) => void | Promise<void>
  onReject: (code: string, text: string) => void | Promise<void>
  onVerifyProof: () => void | Promise<void>
  onRejectProof: () => void | Promise<void>
  /** La cajera ya vio el dinero en su cuenta y confirma sin esperar la captura. */
  onConfirmDirectPayment: (prepMinutes: number) => void | Promise<void>
  onExtend: () => void | Promise<void>
  onReady: () => void | Promise<void>
  onCancel: (code: string, text: string) => void | Promise<void>
  /** Escala a Tindivo por WhatsApp. Recibe el pedido: también lo llama la
   *  tarjeta del tablero, donde no hay ningún detalle abierto. */
  onCallDriver?: (o: OrderVM) => void
}

// ── Payment sections ──────────────────────────────────────────────────────────

function PaySectionPrepaid({ order, proofUrl }: { order: OrderVM; proofUrl: string | null }) {
  const [zoom, setZoom] = useState(false)
  const isSecondAttempt = (order.proofAttempt ?? 0) >= 2
  const verified =
    order.proofStatus === 'verified' ||
    order.status === 'confirmed' ||
    order.status === 'preparing' ||
    order.status === 'waiting_driver' ||
    order.status === 'picked_up' ||
    order.status === 'delivered'

  return (
    <>
      {zoom && proofUrl && (
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/85 p-5 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute right-5 top-5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-transparent bg-white shadow-elev-3"
          >
            <Icon weight={500} name="close" size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proofUrl}
            alt="Comprobante ampliado"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-elev-4"
          />
          <div className="mt-3 text-[13px] font-semibold text-white">
            Comprobante de pago — {order.customer ?? 'Cliente'} ({soles(order.total)})
          </div>
        </div>
      )}

      <div
        className={cn(
          'shrink-0 overflow-hidden rounded-xl border-[1.5px] shadow-elev-2',
          verified && 'border-success/60',
          !verified && isSecondAttempt && 'border-danger/40',
          !verified && !isSecondAttempt && 'border-info/60',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-3.5 py-2.5',
            verified ? 'bg-success/10' : isSecondAttempt ? 'bg-danger-soft' : 'bg-info/10',
          )}
        >
          <div className="flex items-center gap-2">
            <Icon
              weight={500}
              name={verified ? 'verified' : 'schedule'}
              size={18}
              filled
              className={verified ? 'text-success' : isSecondAttempt ? 'text-danger' : 'text-info'}
            />
            <div
              className={cn(
                'text-[13px] font-bold',
                verified ? 'text-success' : isSecondAttempt ? 'text-danger' : 'text-info',
              )}
            >
              {verified ? 'Pago verificado' : 'Verificar comprobante de pago'}
            </div>
          </div>
          {isSecondAttempt && !verified && (
            <span className="rounded-full border border-danger/40 bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">
              Segundo y último intento
            </span>
          )}
        </div>

        <div className="bg-white p-3 px-3.5">
          {/* Guía de validación */}
          {!verified && (
            <div className="mb-2.5 rounded-[10px] border border-border bg-surface p-2.5 text-xs">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
                DATOS DE VALIDACIÓN
              </div>
              <div className="mb-1.5 grid grid-cols-[1fr_1fr_1.2fr] gap-2">
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] text-ink-muted">Monto</span>
                  <span className="font-mono text-[13px] font-bold text-success">
                    {soles(order.total)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="mb-0.5 text-[10px] text-ink-muted">Hora pedido</span>
                  <span className="font-mono text-[13px] font-bold">
                    {order.createdAtFormatted ?? '—'}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="mb-0.5 text-[10px] text-ink-muted">Cliente</span>
                  <span className="truncate text-[13px] font-bold">
                    {order.customer ?? 'Cliente'}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 border-t border-dashed border-border pt-1.5 text-[10px] leading-tight text-ink-muted">
                Verifica pago posterior a{' '}
                <strong>{order.createdAtFormatted ?? 'la hora del pedido'}</strong> por{' '}
                <strong>{soles(order.total)}</strong>.
              </div>
            </div>
          )}

          <DetailRow label="Total pagado" value={soles(order.total)} mono bold />
          <div className="mt-2.5 mb-1">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted">
              COMPROBANTE DEL CLIENTE
            </div>
            {proofUrl ? (
              <div
                onClick={() => setZoom(true)}
                className="relative cursor-pointer overflow-hidden rounded-[10px] border border-border bg-surface-low"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Comprobante del cliente"
                  className="block w-full max-h-80 bg-surface object-contain"
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-ink/95 px-3 py-1.5 text-[11px] font-semibold text-white shadow-elev-2 backdrop-blur-sm">
                  <Icon weight={500} name="zoom_in" size={15} /> Ampliar comprobante
                </div>
                {verified && (
                  <div className="absolute inset-0 flex items-center justify-center bg-success/15">
                    <Icon
                      weight={500}
                      name="check_circle"
                      size={44}
                      filled
                      className="text-success"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="relative h-[130px] w-full overflow-hidden rounded-[10px] bg-surface-low">
                <span className="absolute inset-0 flex items-center justify-center px-1.5 text-center text-[10px] uppercase tracking-wide text-ink/50">
                  El cliente aún no ha subido el comprobante
                </span>
              </div>
            )}
          </div>
          {verified && (
            <div className="mt-2 text-center text-xs font-semibold text-success">
              Comprobante verificado · pago registrado
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Detail screen ─────────────────────────────────────────────────────────────
export function DetailScreen({
  order,
  items,
  proofUrl,
  qrUrl,
  busy,
  isLoadingActions = false,
  mobile = false,
  actions,
}: {
  order: OrderVM
  items: DetailItem[] | null
  proofUrl: string | null
  qrUrl: string | null
  busy: boolean
  isLoadingActions?: boolean
  mobile?: boolean
  actions: DetailActions
}) {
  const [modal, setModal] = useState<null | 'reject' | 'cancel'>(null)
  const [showPrepModal, setShowPrepModal] = useState(false)
  const [showDirectPayModal, setShowDirectPayModal] = useState(false)
  const [showComandaModal, setShowComandaModal] = useState(false)
  const [hasAppeal, setHasAppeal] = useState(false)
  // Confirmación en dos pasos antes de declarar la comida lista, como en prod:
  // avisar al motorizado de que entre a recoger y que no esté lista se paga en
  // minutos de moto parada.
  const [confirmReady, setConfirmReady] = useState(false)

  useEffect(() => {
    const origOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = origOverflow
    }
  }, [])

  useEffect(() => {
    if (order.status === 'cancelled') {
      const supabase = getSupabaseBrowser()
      supabase
        .from('reports')
        .select('id')
        .eq('order_id', order.rowId)
        .eq('type', 'rejected_proof_disputed')
        .maybeSingle()
        .then(({ data }) => setHasAppeal(Boolean(data)))
    } else {
      setHasAppeal(false)
    }
  }, [order.rowId, order.status])

  const isPending =
    !isLoadingActions &&
    (order.status === 'pending_acceptance' ||
      order.status === 'awaiting_payment' ||
      order.status === 'validando')
  const isPrepaid = order.payment === 'prepaid'
  const isOnline = order.source === 'web'
  const acceptDisabled = busy || isLoadingActions
  const isPrepaidAwaitingProof =
    isPrepaid && !proofUrl && !isLoadingActions && order.status === 'pending_acceptance'
  const isValidandoPrepaid =
    isPrepaid && (Boolean(proofUrl) || order.status === 'validando') && !isLoadingActions

  const rejectReasons = isPrepaid
    ? [
        ...REJECT_REASONS_BASE,
        { code: 'invalid_proof', label: 'Comprobante de pago inválido' },
        ...REJECT_REASONS_TAIL,
      ]
    : [...REJECT_REASONS_BASE, ...REJECT_REASONS_TAIL]

  const content = (
    <div className="relative flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-white">
      {modal === 'reject' && (
        <ReasonModal
          title="Rechazar pedido"
          subtitle="Motivo del rechazo"
          reasons={rejectReasons}
          confirmLabel="Confirmar rechazo"
          cancelLabel="Cancelar"
          order={order}
          onClose={() => setModal(null)}
          onConfirm={(code, text) => {
            setModal(null)
            actions.onReject(code, text)
          }}
        />
      )}
      {modal === 'cancel' && (
        <ReasonModal
          title="Cancelar pedido"
          subtitle="Motivo"
          reasons={CANCEL_REASONS}
          confirmLabel="Confirmar cancelación"
          cancelLabel="Cancelar acción"
          order={order}
          onClose={() => setModal(null)}
          onConfirm={(code, text) => {
            setModal(null)
            actions.onCancel(code, text)
          }}
        />
      )}
      {showPrepModal && (
        <PrepTimeModal
          order={order}
          onClose={() => setShowPrepModal(false)}
          onConfirm={(prepTime) => {
            setShowPrepModal(false)
            actions.onAccept(prepTime)
          }}
        />
      )}
      {showDirectPayModal && (
        <ConfirmDirectPaymentModal
          order={order}
          onClose={() => setShowDirectPayModal(false)}
          onConfirm={(prepTime) => {
            setShowDirectPayModal(false)
            actions.onConfirmDirectPayment(prepTime)
          }}
        />
      )}
      {showComandaModal && items && (
        <ComandaModal order={order} items={items} onClose={() => setShowComandaModal(false)} />
      )}

      {/* Header flotante/fijo */}
      <div
        className={cn(
          'sticky top-0 z-10 flex shrink-0 items-center gap-2.5 border-b border-border bg-white',
          mobile ? 'px-3.5 py-2.5' : 'px-[18px] py-3',
        )}
      >
        {mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-none bg-ink/[0.06]"
          >
            <Icon weight={500} name="arrow_back" size={20} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* IDENTIDAD PRIMERO, Y LA IDENTIDAD ES EL NOMBRE.
              La cabecera abría con `#P9JV3PZV`, un código que nadie reconoce,
              y el nombre del cliente no salía en toda la franja superior — la
              cajera tiene que bajar a la tarjeta «Cliente» para saber de quién
              es el pedido que está mirando. Ahora el nombre manda y el código
              baja a acompañarlo: sigue estando (hace falta para cotejar con el
              motorizado) pero deja de liderar.
              Es la misma regla que ya sigue la tarjeta del board del
              motorizado: el nombre es identidad y el short_id es repuesto. */}
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[15px] font-bold leading-tight text-ink">
              {order.customer ?? 'Cliente'}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-bold text-ink-muted">
              #{order.id}
            </span>
          </div>
          <div className="mt-[3px] mb-[3px] flex flex-wrap items-center gap-[5px]">
            {isPending ? (
              <span className="flex items-center gap-[3px]">
                <span className="text-[11px] text-ink-muted">
                  ·{' '}
                  {order.status === 'awaiting_payment'
                    ? 'paga antes de'
                    : order.status === 'validando'
                      ? 'revisa antes de'
                      : 'acepta antes de'}
                </span>
                <span
                  className={cn(
                    'font-mono text-[12px] font-bold',
                    order.countdownSec < 60 ? 'text-danger' : 'text-ink',
                  )}
                >
                  {mmss(order.countdownSec)}
                </span>
              </span>
            ) : order.readySec != null && order.readySec < 0 ? (
              /* §23: con la comida YA declarada lista, el retraso no es de la
                 cocina sino del reparto. Decía "¡Demorado!" en los dos casos, y
                 eso mandaba a la cajera a apurar a un cocinero que ya terminó.
                 El copy —y el color— siguen a quien tiene la pelota. */
              order.comidaLista ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                  <Icon
                    name="check_circle"
                    size={12}
                    weight={500}
                    filled
                    className="text-success"
                  />
                  Lista · esperando moto{' '}
                  <span className="font-mono">{formatReadyDelta(-order.readySec)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger-soft px-2 py-0.5 rounded-full border border-danger/20">
                  <Icon
                    name="priority_high"
                    size={12}
                    weight={500}
                    filled
                    className="text-danger"
                  />
                  ¡Demorado! <span className="font-mono">{formatReadyDelta(order.readySec)}</span>
                </span>
              )
            ) : null}
          </div>
          {/* El chip de origen SOLO cuando el pedido viene de la app.
              Hoy el 100% del piloto son manuales, así que «Directo» salía en
              todas las cabeceras: un distintivo constante no distingue nada, y
              aquí competía con el de urgencia, que sí decide. Es el criterio
              que ya aplica la tarjeta del motorizado con `showSourceChip`.
              El de pago se queda: ese sí varía y cambia lo que hay que hacer. */}
          <div className="flex items-center gap-1.5">
            {order.source !== 'manual' && <SourceBadgeMini source={order.source} />}
            <PayBadgeMini payment={order.payment} />
          </div>
        </div>
        <div className="shrink-0 flex items-center">
          <span
            className={cn(
              'font-mono font-extrabold text-ink tracking-tight',
              mobile ? 'text-[20px]' : 'text-[24px]',
            )}
          >
            {soles(order.total)}
          </span>
        </div>
        {!mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[9px] border-none bg-ink/[0.06]"
          >
            <Icon weight={500} name="close" size={18} />
          </button>
        )}
      </div>

      {/* Driver arrived banner */}
      {order.state === 'waiting' && (
        <div className="flex shrink-0 items-center gap-2.5 bg-success px-4 py-2.5 text-white">
          <Icon weight={500} name="check_circle" size={20} filled />
          <div>
            <div className="text-[14px] font-bold">
              {order.driver?.name ?? 'El motorizado'} llegó al local · Entregar pedido
            </div>
            {order.cashChange != null && order.cashChange > 0 && (
              <div className="mt-0.5 text-[12px]">
                Prepara el vuelto:{' '}
                <span className="font-mono font-bold">{soles(order.cashChange)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll content */}
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [-webkit-overflow-scrolling:touch]',
          mobile ? 'px-3.5 pb-7 pt-3.5' : 'px-[18px] pb-8 pt-4',
        )}
      >
        {/* Banner de apelación: solo para proof_rejected_final */}
        {hasAppeal &&
          order.status === 'cancelled' &&
          order.cancelReasonCode === 'proof_rejected_final' && (
            <div className="shrink-0 rounded-md border border-warning/50 bg-warning-soft px-3.5 py-3">
              <div className="mb-1 flex items-center gap-[7px]">
                <Icon weight={500} name="gavel" size={18} filled className="text-warning" />
                <div className="text-[13px] font-bold text-warning">
                  El cliente apeló el rechazo de este pedido
                </div>
              </div>
              <div className="text-[12px] leading-[1.4] text-warning">
                Tindivo está revisando este caso. Te recomendamos verificar tu cuenta Yape/Plin por
                si el pago sí ingresó.
              </div>
            </div>
          )}

        {/* Cliente y Dirección */}
        {isValidandoPrepaid ? (
          <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface px-3 py-2 text-[12px] text-ink-muted">
            <div className="flex items-center gap-1">
              <Icon weight={500} name="person" size={14} className="text-ink-muted" />
              <span className="font-bold text-ink">{order.customer ?? 'Cliente'}</span>
            </div>
            {order.phone && (
              <>
                <span>·</span>
                <a
                  href={`tel:${order.phone}`}
                  className="inline-flex items-center gap-[3px] font-semibold text-brand no-underline"
                >
                  <Icon weight={500} name="call" size={12} filled /> {order.phone}
                </a>
              </>
            )}
            {order.addressRef && (
              <>
                <span>·</span>
                <span
                  className="inline-flex min-w-0 items-center gap-[3px] overflow-hidden text-ellipsis whitespace-nowrap"
                  title={order.addressRef}
                >
                  <Icon weight={500} name="location_on" size={12} className="text-brand" />
                  {order.addressRef}
                </span>
              </>
            )}
          </div>
        ) : (
          /* UNA SOLA TARJETA, no «Cliente» y «Dirección» por separado.
             Eran dos rótulos y dos cajas para un único hecho: a quién le
             llevas el pedido y adónde. Nadie mira la dirección sin mirar de
             quién es, así que separarlas solo añadía un salto de lectura y un
             borde en una columna que ya va apretada.
             Los dos datos siguen distinguiéndose por el icono —teléfono y
             pin—, que es lo que de verdad los etiquetaba; el rótulo
             «DIRECCIÓN» encima no aportaba nada que el pin no dijera ya. */
          <div className="shrink-0 rounded-md bg-surface px-3.5 py-3">
            <div className="mb-[7px] text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
              Cliente
            </div>
            <div className="text-[16px] font-bold">{order.customer ?? 'Cliente'}</div>

            {order.phone && (
              <a
                href={`tel:${order.phone}`}
                className="mt-[5px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand no-underline"
              >
                <Icon weight={500} name="call" size={15} filled /> {order.phone}
              </a>
            )}

            {/* En los online el cliente da DOS datos —la dirección que eligió y
                la referencia que escribió— y el detalle solo enseñaba la
                referencia, igual que la tarjeta. `OrderVM.address` ya viene
                limpio del relleno 'Pedido manual', así que la segunda línea
                aparece sola cuando existe de verdad. */}
            {(order.addressRef || order.address) && (
              <div className="mt-2.5 flex gap-2 border-t border-ink/[0.06] pt-2.5">
                <Icon
                  weight={500}
                  name="location_on"
                  size={16}
                  className="mt-0.5 shrink-0 text-brand"
                />
                <div className="min-w-0">
                  <div className="text-[14px] leading-normal">
                    {order.addressRef ?? order.address}
                  </div>
                  {order.addressRef && order.address && (
                    <div className="text-[12px] leading-normal text-ink-muted">{order.address}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Items (Online) o Cobro (Directo) */}
        {isOnline && items && items.length > 0 ? (
          <div
            className={cn(
              'shrink-0 rounded-xl border border-border/80 bg-white p-3.5 shadow-xs',
              isValidandoPrepaid ? 'p-3' : 'p-3.5',
            )}
          >
            <div className="mb-2.5 flex items-center justify-between border-b border-border/70 pb-2">
              <div className="flex items-center gap-1.5">
                <Icon weight={500} name="restaurant_menu" size={16} className="text-brand" />
                <span className="text-[13px] font-bold text-ink">
                  Comanda ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowComandaModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:bg-surface-high hover:text-ink"
              >
                <Icon weight={500} name="fullscreen" size={14} />
                <span>Ver en grande</span>
              </button>
            </div>
            <div className="flex flex-col divide-y divide-border/60">
              {items.map((it, i) => (
                <div key={i} className="py-2.5 first:pt-0.5 last:pb-0.5">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-md bg-ink px-1.5 font-mono text-[12px] font-bold text-white shadow-xs">
                      {it.qty}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold leading-snug text-ink">{it.name}</div>
                      {it.mods && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="inline-block rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-muted border border-border/50">
                            {it.mods}
                          </span>
                        </div>
                      )}
                      {it.note && (
                        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-300/80 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 shadow-xs">
                          <Icon
                            weight={500}
                            name="priority_high"
                            size={14}
                            className="mt-0.5 shrink-0 text-amber-700"
                          />
                          <span className="leading-tight">Nota: {it.note}</span>
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[13px] font-semibold text-ink-muted">
                      {soles(it.price)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="mt-2.5 flex flex-col gap-1 border-t border-dashed border-border pt-2.5">
                <DetailRow label="Subtotal" value={soles(order.subtotal)} mono />
                <DetailRow label="Delivery" value={soles(order.deliveryFee)} mono />
                <div className="mt-1 flex items-center justify-between border-t border-ink/10 pt-2 text-[15px]">
                  <span className="font-bold text-ink">Total</span>
                  <span className="font-mono text-[18px] font-extrabold text-ink">
                    {soles(order.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="shrink-0 rounded-xl border border-border/80 bg-white p-3.5 shadow-xs">
            <div className="flex items-center gap-1.5 border-b border-border/70 pb-2 text-[13px] font-bold text-ink">
              <Icon weight={500} name="payments" size={16} className="text-brand" />
              <span>Cobro</span>
            </div>
            <div className="mt-2 flex flex-col gap-[5px]">
              <DetailRow label="Total del pedido" value={soles(order.amount)} mono />
              <DetailRow label="Delivery" value={soles(order.deliveryFee)} mono />
              <div className="mt-1 flex items-center justify-between border-t border-ink/10 pt-2 text-[15px]">
                <span className="font-bold text-ink">Total a cobrar</span>
                <span className="font-mono text-[18px] font-extrabold text-ink">
                  {soles(order.total)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Sección de pago */}
        {order.payment === 'pending_cash' && <PaySectionCash order={order} />}
        {order.payment === 'pending_wallet' && <PaySectionWallet qrUrl={qrUrl} />}
        {order.payment === 'prepaid' && (
          <>
            {isLoadingActions ? (
              <div className="h-16 animate-pulse rounded-md border border-ink/[0.08] bg-ink/[0.06] px-3.5 py-3" />
            ) : (
              <>
                {/* 1. Esperando comprobante del cliente (pending_acceptance o validando sin comprobante aún) */}
                {isPrepaidAwaitingProof && (
                  <div className="shrink-0 rounded-md border border-brand/30 bg-brand-soft px-3.5 py-3">
                    <div className="mb-1 flex items-center gap-[7px]">
                      <Icon
                        weight={500}
                        name="qr_code_2"
                        size={18}
                        filled
                        className="text-brand-dark"
                      />
                      <div className="text-[13px] font-bold text-brand-dark">
                        Pago por Yape / Plin
                      </div>
                    </div>
                    <div className="text-[12px] leading-[1.4] text-brand-dark">
                      Confirma la disponibilidad de insumos para este pedido. Una vez aceptado, el
                      cliente tendrá 15 minutos para transferir por Yape/Plin y adjuntar el
                      comprobante.
                    </div>
                  </div>
                )}
                {/* 2. awaiting_payment: Banner de espera tras haber aceptado disponibilidad */}
                {order.status === 'awaiting_payment' && (
                  <div className="shrink-0 rounded-md border border-brand/30 bg-brand-soft px-3.5 py-3">
                    <div className="mb-1 flex items-center gap-[7px]">
                      <Icon
                        weight={500}
                        name="schedule"
                        size={18}
                        filled
                        className="text-brand-dark"
                      />
                      <div className="text-[13px] font-bold text-brand-dark">
                        Esperando pago del cliente
                      </div>
                    </div>
                    <div className="text-[12px] leading-[1.4] text-brand-dark">
                      Disponibilidad confirmada. El cliente tiene 15 minutos para realizar la
                      transferencia por Yape/Plin y adjuntar el comprobante.
                    </div>
                  </div>
                )}
                {/* 3. Con comprobante subido: Guía de validación + comprobante + botones */}
                {isValidandoPrepaid && <PaySectionPrepaid order={order} proofUrl={proofUrl} />}
              </>
            )}
          </>
        )}
        {order.payment === 'pending_mixed' && <PaySectionMixed order={order} qrUrl={qrUrl} />}

        {/* Extensión de preparación */}
        {order.state === 'cooking' && !order.extensionUsed && (
          <div className="shrink-0 rounded-md bg-surface px-3.5 py-3">
            <div className="mb-2 text-[13px] font-semibold">¿Necesitas más tiempo?</div>
            <button
              type="button"
              onClick={() => actions.onExtend()}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-3 py-2 text-[13px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="add" size={14} /> +10 min
            </button>
            <div className="mt-1.5 text-[11px] text-ink-muted">
              Solo disponible una vez y antes de que llegue el motorizado.
            </div>
          </div>
        )}
        {order.state === 'cooking' && order.extensionUsed && (
          <div className="shrink-0 py-1 text-center text-[12px] font-semibold text-warning">
            Prórroga +{order.extensionMin}m usada · no se puede volver a extender
          </div>
        )}

        {/* Buffer p3: llamar motorizado */}
        {order.state === 'buffer_p3' && actions.onCallDriver && (
          <button
            type="button"
            onClick={() => actions.onCallDriver?.(order)}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-danger px-3 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Icon weight={500} name="call" size={15} /> Llamar a un motorizado manualmente
          </button>
        )}

        {/* Otras acciones */}
        {!isPending && order.state !== 'picked_up' && (
          <div className="shrink-0 rounded-md border border-border bg-surface px-3.5 py-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
              Otras acciones
            </div>
            <button
              type="button"
              onClick={() => setModal('cancel')}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-danger bg-transparent px-3 py-2 text-[13px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="cancel" size={14} /> Cancelar este pedido
            </button>
          </div>
        )}
      </div>

      {/* Footer de acciones (pendiente) */}
      {(isPending || isLoadingActions) && (
        <div className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-white px-3.5 pb-3.5 pt-3 shadow-elev-2">
          {isLoadingActions ? (
            <div className="flex animate-pulse gap-2.5 opacity-70">
              <div className="h-11 flex-1 rounded-md bg-ink/[0.08]" />
              <div className="h-11 flex-[2] rounded-md bg-ink/[0.08]" />
            </div>
          ) : isValidandoPrepaid ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => actions.onRejectProof()}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-danger/30 bg-danger-soft px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="cancel" size={18} /> Inválido
              </button>
              <button
                type="button"
                onClick={() => setShowPrepModal(true)}
                disabled={busy}
                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="check_circle" size={18} filled /> Confirmar pago
              </button>
            </div>
          ) : order.status === 'awaiting_payment' && isPrepaid ? (
            /* Esperar la captura era la ÚNICA salida y aquí había un botón
               muerto que lo decía. Pero el dinero llega a la cuenta del negocio
               antes que la foto: cuando la cajera ya lo vio, la captura solo
               sirve para hacerle perder el turno al cliente — y si tarda más de
               `paymentMinutes`, el barrido cancela un pedido ya pagado.
               El botón le da la salida que el mostrador ya usaba por WhatsApp. */
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setModal('cancel')}
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="close" size={18} /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setShowDirectPayModal(true)}
                  disabled={busy}
                  className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="check_circle" size={18} filled /> Confirmar pago recibido
                </button>
              </div>
              <div className="text-center text-[11px] text-ink-muted">
                Solo si ya viste el dinero en tu cuenta de Yape/Plin. Si no, espera su comprobante.
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setModal('reject')}
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="close" size={18} /> Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPrepaid) {
                      actions.onAccept(20)
                    } else {
                      setShowPrepModal(true)
                    }
                  }}
                  disabled={acceptDisabled}
                  className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="check" size={18} filled />
                  {isPrepaid ? 'Aceptar disponibilidad' : 'Aceptar pedido'}
                </button>
              </div>
              {isPrepaid && (
                <div className="text-center text-[11px] text-ink-muted">
                  Confirmas disponibilidad para preparar. El cliente procederá a realizar el pago
                  por Yape/Plin.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer cocina: declarar la comida lista.
          Visible en los cuatro estados en los que la comida puede seguir en
          cocina, no solo en `preparing`: desde que el motorizado toma el pedido
          con 10 minutos por delante, el caso normal es que llegue antes de que
          la comida salga. */}
      {(order.canMarkReady || order.readyEarly) && (
        <div className="shrink-0 border-t border-border bg-white px-3.5 pb-3.5 pt-3 shadow-elev-2">
          {order.readyEarly ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-success bg-success-soft px-3.5 py-3">
              <Icon weight={500} name="check_circle" size={20} filled className="text-success" />
              <span className="text-[13px] font-semibold text-success">
                Comida lista. El motorizado ya lo sabe.
              </span>
            </div>
          ) : confirmReady ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReady(false)}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await actions.onReady()
                  setConfirmReady(false)
                }}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="check_circle" size={18} filled /> Sí, está lista
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReady(true)}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="inventory_2" size={18} filled /> Listo — llamar moto
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (mobile) {
    return <div className="fixed inset-0 z-[200] bg-white">{content}</div>
  }

  return (
    <div
      onClick={actions.onClose}
      className="fixed inset-0 z-[200] flex justify-end bg-black/45 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-screen max-h-screen w-[440px] max-w-[100vw] flex-col overflow-hidden bg-white shadow-elev-3"
      >
        {content}
      </div>
    </div>
  )
}
