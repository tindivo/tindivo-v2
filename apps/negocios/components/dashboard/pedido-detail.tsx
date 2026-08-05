'use client'

import { cn, Icon } from '@tindivo/ui'

import { useEffect, useState } from 'react'
import { formatReadyDelta, type OrderVM } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import {
  CANCEL_REASONS,
  PREP_PRESETS,
  REJECT_REASONS_BASE,
  REJECT_REASONS_TAIL,
} from './pedido-detail/constants'
import { DetailRow } from './pedido-detail/detail-row'
import { PrepTimeModal, ReasonModal } from './pedido-detail/modals'
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
  const [prep, setPrep] = useState(20)
  const [modal, setModal] = useState<null | 'reject' | 'cancel'>(null)
  const [itemsOpen, setItemsOpen] = useState(order.status !== 'validando')
  const [showPrepModal, setShowPrepModal] = useState(false)
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
    isPrepaid &&
    !proofUrl &&
    !isLoadingActions &&
    (order.status === 'pending_acceptance' || order.status === 'validando')
  const isValidandoPrepaid = isPrepaid && Boolean(proofUrl) && !isLoadingActions
  const showPrepPicker = isPending && !isPrepaid

  const rejectReasons = isPrepaid
    ? [
        ...REJECT_REASONS_BASE,
        { code: 'invalid_proof', label: 'Comprobante de pago inválido' },
        ...REJECT_REASONS_TAIL,
      ]
    : [...REJECT_REASONS_BASE, ...REJECT_REASONS_TAIL]

  const content = (
    <div
      className="bg-white"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
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

      {/* Header flotante/fijo */}
      <div
        className="bg-white border-b border-border"
        style={{
          padding: mobile ? '10px 14px' : '12px 18px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        {mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            className="bg-ink/[0.06]"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon weight={500} name="arrow_back" size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              flexWrap: 'wrap',
              marginBottom: 3,
            }}
          >
            <span className="font-mono text-ink-muted" style={{ fontSize: 12, fontWeight: 700 }}>
              #{order.id}
            </span>
            {isPending ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="text-ink-muted" style={{ fontSize: 11 }}>
                  ·{' '}
                  {order.status === 'awaiting_payment'
                    ? 'paga antes de'
                    : order.status === 'validando'
                      ? 'revisa antes de'
                      : 'acepta antes de'}
                </span>
                <span
                  className={cn('font-mono', order.countdownSec < 60 ? 'text-danger' : 'text-ink')}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {mmss(order.countdownSec)}
                </span>
              </span>
            ) : order.readySec != null && order.readySec < 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger-soft px-2 py-0.5 rounded-full border border-danger/20">
                <Icon name="priority_high" size={12} weight={500} filled className="text-danger" />
                ¡Demorado! <span className="font-mono">{formatReadyDelta(order.readySec)}</span>
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SourceBadgeMini source={order.source} />
            <PayBadgeMini payment={order.payment} />
          </div>
        </div>
        <span
          className="font-mono text-ink"
          style={{
            fontSize: mobile ? 18 : 20,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {soles(order.total)}
        </span>
        {!mobile && (
          <button
            type="button"
            onClick={actions.onClose}
            className="bg-ink/[0.06]"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon weight={500} name="close" size={18} />
          </button>
        )}
      </div>

      {/* Driver arrived banner */}
      {order.state === 'waiting' && (
        <div
          className="bg-success text-white"
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <Icon weight={500} name="check_circle" size={20} filled />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {order.driver?.name ?? 'El motorizado'} llegó al local · Entregar pedido
            </div>
            {order.cashChange != null && order.cashChange > 0 && (
              <div style={{ fontSize: 12, marginTop: 2 }}>
                Prepara el vuelto:{' '}
                <span className="font-mono" style={{ fontWeight: 700 }}>
                  {soles(order.cashChange)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: mobile ? '14px 14px 28px' : '16px 18px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Banner de apelación: solo para proof_rejected_final */}
        {hasAppeal &&
          order.status === 'cancelled' &&
          order.cancelReasonCode === 'proof_rejected_final' && (
            <div
              className="bg-warning-soft border border-warning/50"
              style={{
                borderRadius: 12,
                padding: '12px 14px',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <Icon weight={500} name="gavel" size={18} filled className="text-warning" />
                <div className="text-warning" style={{ fontSize: 13, fontWeight: 700 }}>
                  El cliente apeló el rechazo de este pedido
                </div>
              </div>
              <div className="text-warning" style={{ fontSize: 12, lineHeight: 1.4 }}>
                Tindivo está revisando este caso. Te recomendamos verificar tu cuenta Yape/Plin por
                si el pago sí ingresó.
              </div>
            </div>
          )}

        {/* Cliente y Dirección */}
        {isValidandoPrepaid ? (
          <div
            className="bg-surface text-ink-muted"
            style={{
              borderRadius: 12,
              padding: '8px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px 8px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon weight={500} name="person" size={14} className="text-ink-muted" />
              <span className="text-ink" style={{ fontWeight: 700 }}>
                {order.customer ?? 'Cliente'}
              </span>
            </div>
            {order.phone && (
              <>
                <span>·</span>
                <a
                  href={`tel:${order.phone}`}
                  className="text-brand no-underline"
                  style={{
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Icon weight={500} name="call" size={12} filled /> {order.phone}
                </a>
              </>
            )}
            {order.addressRef && (
              <>
                <span>·</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    minWidth: 0,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                  title={order.addressRef}
                >
                  <Icon weight={500} name="location_on" size={12} className="text-brand" />
                  {order.addressRef}
                </span>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Cliente */}
            <div
              className="bg-surface"
              style={{
                borderRadius: 12,
                padding: '12px 14px',
                flexShrink: 0,
              }}
            >
              <div
                className="text-ink-muted"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 7,
                }}
              >
                Cliente
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 5 }}>
                {order.customer ?? 'Cliente'}
              </div>
              {order.phone && (
                <a
                  href={`tel:${order.phone}`}
                  className="text-brand no-underline"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Icon weight={500} name="call" size={15} filled /> {order.phone}
                </a>
              )}
            </div>

            {/* Dirección */}
            {order.addressRef && (
              <div
                className="bg-surface"
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
                  flexShrink: 0,
                }}
              >
                <div
                  className="text-ink-muted"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 7,
                  }}
                >
                  Dirección
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Icon
                    weight={500}
                    name="location_on"
                    size={16}
                    className="mt-0.5 shrink-0 text-brand"
                  />
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{order.addressRef}</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Items (Online) o Cobro (Directo) */}
        {isOnline && items && items.length > 0 ? (
          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            className="bg-surface"
            style={{
              borderRadius: 12,
              padding: isValidandoPrepaid ? '10px 12px' : '12px 14px',
              flexShrink: 0,
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                userSelect: 'none',
                listStyle: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon weight={500} name="shopping_bag" size={16} />
                <span>
                  Pedido ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="font-mono">{soles(order.total)}</span>
                <Icon
                  weight={500}
                  name={itemsOpen ? 'expand_less' : 'expand_more'}
                  size={18}
                  className="text-ink-muted"
                />
              </div>
            </summary>
            <div className="border-t border-border" style={{ marginTop: 8, paddingTop: 8 }}>
              {items.map((it, i) => (
                <div
                  key={i}
                  className={cn(
                    i < items.length - 1 ? 'border-b border-border' : 'border-b border-transparent',
                  )}
                  style={{ padding: '5px 0' }}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span
                      className="font-mono text-ink-muted"
                      style={{
                        width: 22,
                        flexShrink: 0,
                        fontWeight: 700,
                      }}
                    >
                      {it.qty}×
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                      {it.mods && (
                        <div className="text-ink-muted" style={{ fontSize: 12 }}>
                          {it.mods}
                        </div>
                      )}
                      {it.note && (
                        <div className="text-warning" style={{ fontSize: 12, marginTop: 2 }}>
                          <Icon weight={500} name="info" size={11} /> {it.note}
                        </div>
                      )}
                    </div>
                    <span
                      className="font-mono text-ink-muted"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {soles(it.price)}
                    </span>
                  </div>
                </div>
              ))}
              <div
                className="border-t border-border"
                style={{
                  marginTop: 10,
                  padding: '8px 0 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <DetailRow label="Subtotal" value={soles(order.subtotal)} mono />
                <DetailRow label="Delivery" value={soles(order.deliveryFee)} mono />
                <DetailRow label="Total" value={soles(order.total)} mono bold />
              </div>
            </div>
          </details>
        ) : (
          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            className="bg-surface"
            style={{
              borderRadius: 12,
              padding: isValidandoPrepaid ? '10px 12px' : '12px 14px',
              flexShrink: 0,
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                userSelect: 'none',
                listStyle: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon weight={500} name="payments" size={16} />
                <span>Cobro</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="font-mono">{soles(order.total)}</span>
                <Icon
                  weight={500}
                  name={itemsOpen ? 'expand_less' : 'expand_more'}
                  size={18}
                  className="text-ink-muted"
                />
              </div>
            </summary>
            <div
              className="border-t border-border"
              style={{
                marginTop: 8,
                paddingTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <DetailRow label="Total del pedido" value={soles(order.amount)} mono />
              <DetailRow label="Delivery" value={soles(order.deliveryFee)} mono />
              <div className="h-px bg-border" style={{ margin: '2px 0' }} />
              <DetailRow label="Total a cobrar" value={soles(order.total)} mono bold />
            </div>
          </details>
        )}

        {/* Sección de pago */}
        {order.payment === 'pending_cash' && <PaySectionCash order={order} />}
        {order.payment === 'pending_wallet' && <PaySectionWallet order={order} qrUrl={qrUrl} />}
        {order.payment === 'prepaid' && (
          <>
            {isLoadingActions ? (
              <div
                className="bg-ink/[0.06] border border-ink/[0.08] animate-pulse"
                style={{
                  borderRadius: 12,
                  padding: '12px 14px',
                  height: 64,
                }}
              />
            ) : (
              <>
                {/* 1. Esperando comprobante del cliente (pending_acceptance o validando sin comprobante aún) */}
                {isPrepaidAwaitingProof && (
                  <div
                    className="bg-brand-soft border border-brand/30"
                    style={{
                      borderRadius: 12,
                      padding: '12px 14px',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <Icon
                        weight={500}
                        name="qr_code_2"
                        size={18}
                        filled
                        className="text-brand-dark"
                      />
                      <div className="text-brand-dark" style={{ fontSize: 13, fontWeight: 700 }}>
                        Pago por Yape / Plin
                      </div>
                    </div>
                    <div className="text-brand-dark" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Confirma la disponibilidad de insumos para este pedido. Una vez aceptado, el
                      cliente tendrá 10 minutos para transferir por Yape/Plin y adjuntar el
                      comprobante.
                    </div>
                  </div>
                )}
                {/* 2. awaiting_payment: Banner de espera tras haber aceptado disponibilidad */}
                {order.status === 'awaiting_payment' && (
                  <div
                    className="bg-brand-soft border border-brand/30"
                    style={{
                      borderRadius: 12,
                      padding: '12px 14px',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <Icon
                        weight={500}
                        name="schedule"
                        size={18}
                        filled
                        className="text-brand-dark"
                      />
                      <div className="text-brand-dark" style={{ fontSize: 13, fontWeight: 700 }}>
                        Esperando pago del cliente
                      </div>
                    </div>
                    <div className="text-brand-dark" style={{ fontSize: 12, lineHeight: 1.4 }}>
                      Disponibilidad confirmada. El cliente tiene 10 minutos para realizar la
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

        {/* Prep picker (al aceptar) */}
        {showPrepPicker && (
          <div
            className="bg-surface"
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Tiempo de preparación
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                paddingBottom: 4,
              }}
            >
              {PREP_PRESETS.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setPrep(m)}
                  className={cn(
                    m === prep
                      ? 'bg-ink text-white border-transparent'
                      : 'bg-white text-ink border border-border',
                  )}
                  style={{
                    flexShrink: 0,
                    minWidth: 50,
                    fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
                    fontWeight: 700,
                    fontSize: 14,
                    padding: '10px 0',
                    borderRadius: 12,
                    cursor: 'pointer',
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Extensión de preparación */}
        {order.state === 'cooking' && !order.extensionUsed && (
          <div
            className="bg-surface"
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              ¿Necesitas más tiempo?
            </div>
            <button
              type="button"
              onClick={() => actions.onExtend()}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-3 py-2 text-[13px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Icon weight={500} name="add" size={14} /> +10 min
            </button>
            <div className="text-ink-muted" style={{ fontSize: 11, marginTop: 6 }}>
              Solo disponible una vez y antes de que llegue el motorizado.
            </div>
          </div>
        )}
        {order.state === 'cooking' && order.extensionUsed && (
          <div
            className="text-warning"
            style={{
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              padding: '4px 0',
              flexShrink: 0,
            }}
          >
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
          <div
            className="bg-surface border border-border"
            style={{
              borderRadius: 12,
              padding: '12px 14px',
              flexShrink: 0,
            }}
          >
            <div
              className="text-ink-muted"
              style={{
                fontSize: 10,
                fontWeight: 700,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
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
        <div
          className="bg-white border-t border-border shadow-elev-2"
          style={{
            padding: '12px 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {isLoadingActions ? (
            <div style={{ display: 'flex', gap: 10, opacity: 0.7 }} className="animate-pulse">
              <div
                className="bg-ink/[0.08]"
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                }}
              />
              <div
                className="bg-ink/[0.08]"
                style={{
                  flex: 2,
                  height: 44,
                  borderRadius: 12,
                }}
              />
            </div>
          ) : isValidandoPrepaid ? (
            <div style={{ display: 'flex', gap: 10 }}>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModal('cancel')}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-danger transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Icon weight={500} name="close" size={18} /> Cancelar
              </button>
              <div className="inline-flex flex-[2] cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink-subtle pointer-events-none">
                Esperando pago...
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
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
                  onClick={() => actions.onAccept(isPrepaid ? 20 : prep)}
                  disabled={acceptDisabled}
                  className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon weight={500} name="check" size={18} filled />
                  {isPrepaid ? 'Aceptar disponibilidad' : `Aceptar · ${prep}m`}
                </button>
              </div>
              {isPrepaid && (
                <div className="text-ink-muted" style={{ fontSize: 11, textAlign: 'center' }}>
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
        <div
          className="bg-white border-t border-border shadow-elev-2"
          style={{
            padding: '12px 14px 14px',
            flexShrink: 0,
          }}
        >
          {order.readyEarly ? (
            <div
              className="bg-success-soft border border-success"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 14,
              }}
            >
              <Icon weight={500} name="check_circle" size={20} filled className="text-success" />
              <span className="text-success" style={{ fontSize: 13, fontWeight: 600 }}>
                Comida lista. El motorizado ya lo sabe.
              </span>
            </div>
          ) : confirmReady ? (
            <div style={{ display: 'flex', gap: 8 }}>
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
    return (
      <div className="bg-white" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
        {content}
      </div>
    )
  }

  return (
    <div
      onClick={actions.onClose}
      className="bg-black/45"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backdropFilter: 'blur(2px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white shadow-elev-3"
        style={{
          width: 420,
          maxWidth: '100vw',
          height: '100vh',
          maxHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {content}
      </div>
    </div>
  )
}
