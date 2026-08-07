'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button, Spinner } from '@tindivo/ui'
import Link from 'next/link'
import { type ReactNode, use, useCallback, useEffect, useState } from 'react'
import { EmptyState, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { duracion, limaDateTime, limaTime, num, soles } from '@/lib/format'
import {
  ACTIVE_STATUSES,
  CANCEL_LABEL,
  CHARGE_TYPE_LABEL,
  ORDER_STATUS,
  PAYMENT_INTENT_LABEL,
  PAYMENT_REAL_LABEL,
} from '@/lib/labels'
import { entryLabel, type OrderDetailResponse, PROOF_STATUS } from '@/lib/order-detail'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-ink">{value}</span>
    </div>
  )
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : v == null ? null : String(v)
const iso = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [d, setD] = useState<OrderDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<OrderDetailResponse>>(`/admin/orders/${id}`)
      .then((r) => setD(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // La URL firmada caduca a los 120s (el TTL del patrón existente), así que se
  // pide aparte del detalle y se vuelve a pedir en cada refresco: si Yolvi deja
  // la pestaña abierta, la imagen se recarga en vez de romperse.
  const tieneComprobante =
    d?.order.payment_intent === 'prepaid' && Boolean(d?.order.comprobante_prepago_url)
  useEffect(() => {
    if (!tieneComprobante) {
      setProofUrl(null)
      return
    }
    api
      .get<ApiEnvelope<{ url: string | null }>>(`/admin/orders/${id}/prepay-proof`)
      .then((r) => setProofUrl(r.data.url))
      .catch(() => setProofUrl(null))
  }, [tieneComprobante, id])

  // Un pedido vivo cambia mientras Yolvi lo mira. Se refresca solo cada 15s
  // mientras esté activo y se detiene al cerrarse: un pedido entregado ya no
  // cambia, y seguir preguntando por él es ruido.
  const activo = d ? ACTIVE_STATUSES.has(d.order.status) : false
  useEffect(() => {
    if (!activo) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [activo, load])

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionHeader eyebrow="Operación" title="Pedido" />
        <p className="text-[14px] text-danger">{error}</p>
        <Link href="/orders" className="text-[13px] text-brand-dark">
          ← Volver a pedidos
        </Link>
      </div>
    )
  }

  if (!d) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-24 animate-pulse rounded-[28px] bg-ink/[0.05]" />
        <div className="h-72 animate-pulse rounded-[28px] bg-ink/[0.05]" />
      </div>
    )
  }

  const o = d.order
  const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'neutral' as const }
  const total = Number(o.order_amount ?? 0) + Number(o.delivery_fee ?? 0)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SectionHeader
        eyebrow="Operación"
        title={`#${o.short_id}`}
        description={`Pedido ${num(o.order_number)} · ${o.businesses?.name ?? 'Negocio'} · creado ${
          iso(o.created_at) ? limaDateTime(iso(o.created_at) as string) : '—'
        } (Lima)`}
        right={
          <>
            <StatusBadge label={st.label} tone={st.tone} />
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
            <Link href="/orders" className="text-[13px] text-brand-dark">
              ← Pedidos
            </Link>
          </>
        }
      />

      {o.status === 'cancelled' && (
        <div className="rounded-[16px] border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger">
          Cancelado: <strong>{CANCEL_LABEL[str(o.cancel_reason) ?? ''] ?? 'sin motivo'}</strong>
          {str(o.cancel_note) && <span> · {str(o.cancel_note)}</span>}
          {str(o.cancel_reason_detail) && <span> ({str(o.cancel_reason_detail)})</span>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Pedido">
          <Row label="Negocio" value={o.businesses?.name} />
          <Row label="Monto" value={soles(Number(o.order_amount ?? 0))} />
          <Row label="Envío" value={soles(Number(o.delivery_fee ?? 0))} />
          <Row label="Total" value={<strong>{soles(total)}</strong>} />
          <Row
            label="Pago previsto"
            value={PAYMENT_INTENT_LABEL[str(o.payment_intent) ?? ''] ?? str(o.payment_intent)}
          />
          <Row
            label="Pago real"
            value={
              str(o.payment_real)
                ? (PAYMENT_REAL_LABEL[str(o.payment_real) as string] ?? str(o.payment_real))
                : 'Aún sin cobrar'
            }
          />
          <Row label="Entrega" value={str(o.delivery_method)} />
          <Row label="Origen" value={str(o.source)} />
          {o.client_pays_with != null && (
            <Row
              label="Paga con"
              value={`${soles(Number(o.client_pays_with))} · vuelto ${soles(Number(o.change_to_give ?? 0))}`}
            />
          )}
        </Card>

        <Card title="Cliente">
          <Row label="Nombre" value={str(o.customer_name)} />
          <Row
            label="Teléfono"
            value={
              str(o.customer_phone) ? (
                <a
                  href={`tel:+51${String(o.customer_phone).replace(/\D/g, '')}`}
                  className="underline"
                >
                  {str(o.customer_phone)}
                </a>
              ) : null
            }
          />
          <Row label="Dirección" value={str(o.delivery_address)} />
          <Row label="Referencia" value={str(o.delivery_reference)} />
          {o.delivery_coordinates_lat != null && (
            <Row
              label="Ubicación"
              value={
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${o.delivery_coordinates_lat},${o.delivery_coordinates_lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  Abrir en Maps
                </a>
              }
            />
          )}
        </Card>

        {tieneComprobante && (
          <Card title="Comprobante de prepago">
            <Row
              label="Estado"
              value={(() => {
                const ps = PROOF_STATUS[str(o.payment_proof_status) ?? '']
                return ps ? (
                  <StatusBadge label={ps.label} tone={ps.tone} />
                ) : (
                  (str(o.payment_proof_status) ?? 'Sin revisar')
                )
              })()}
            />
            <Row
              label="Intentos"
              value={o.proof_attempt != null ? num(Number(o.proof_attempt)) : null}
            />
            <Row
              label="Verificado"
              value={
                iso(o.payment_verified_at)
                  ? limaDateTime(iso(o.payment_verified_at) as string)
                  : null
              }
            />
            <Row
              label="Por"
              value={d.verifiedBy ? (d.verifiedBy.full_name ?? d.verifiedBy.email) : null}
            />
            {proofUrl ? (
              <a href={proofUrl} target="_blank" rel="noreferrer noopener" className="mt-2 block">
                {/* <img> y no next/image: la URL es firmada y caduca a los 120s, así que
                    el optimizador la revalidaría contra un host que ya no existe. */}
                <img
                  src={proofUrl}
                  alt="Comprobante de pago enviado por el cliente"
                  className="max-h-80 w-full rounded-xl border border-ink/10 object-contain"
                />
              </a>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-muted">
                <Spinner size="xs" variant="muted" />
                <span>Cargando la imagen…</span>
              </div>
            )}
          </Card>
        )}

        {o.drivers && (
          <Card title="Motorizado">
            <Row label="Nombre" value={o.drivers.full_name} />
            <Row label="Teléfono" value={o.drivers.phone} />
          </Card>
        )}

        <Card title="Tiempos operativos">
          <Row
            label="Preparación"
            value={o.prep_time_minutes ? `${o.prep_time_minutes} min` : null}
          />
          <Row
            label="Lista estimada"
            value={iso(o.estimated_ready_at) ? limaTime(iso(o.estimated_ready_at) as string) : null}
          />
          <Row
            label="Entra a la cola"
            value={
              iso(o.appears_in_queue_at) ? limaTime(iso(o.appears_in_queue_at) as string) : null
            }
          />
          <Row
            label="Llegó al domicilio"
            value={
              iso(o.arrived_at_customer_at)
                ? limaTime(iso(o.arrived_at_customer_at) as string)
                : null
            }
          />
          <Row label="Marcó listo antes" value={o.ready_early_used ? 'Sí' : null} />
          <Row
            label="Liquidación de efectivo"
            value={str(o.cash_settlement_id) ? String(o.cash_settlement_id).slice(0, 8) : null}
          />
        </Card>
      </div>

      {d.strikes.length > 0 && (
        <Card title="Strikes generados por este pedido">
          <ul className="space-y-1 text-[13px]">
            {d.strikes.map((s) => (
              <li key={s.created_at} className="flex justify-between gap-3">
                <span className="text-ink">
                  {s.reason}
                  {s.delivery_reference && (
                    <span className="text-ink-subtle"> · {s.delivery_reference}</span>
                  )}
                </span>
                <span className="font-mono text-ink-subtle">{limaTime(s.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.items.length > 0 && (
        <Card title="Ítems">
          <ul className="space-y-2 text-[13px]">
            {d.items.map((it) => (
              <li key={`${it.item_name_snapshot}-${it.line_total}`}>
                <div className="flex justify-between gap-3">
                  <span className="text-ink">
                    <span className="font-mono text-ink-subtle">{it.quantity}×</span>{' '}
                    {it.item_name_snapshot}
                  </span>
                  <span className="font-mono tabular-nums">{soles(Number(it.line_total))}</span>
                </div>
                {it.customer_order_item_modifiers.length > 0 && (
                  <p className="pl-6 text-[12px] text-ink-subtle">
                    {it.customer_order_item_modifiers.map((m) => m.option_name_snapshot).join(', ')}
                  </p>
                )}
                {it.note && <p className="pl-6 text-[12px] text-ink-subtle">Nota: {it.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Cargos al negocio">
        {d.charges.length === 0 ? (
          <EmptyState title="Sin cargos" hint="Se generan al entregar el pedido." />
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {d.charges.map((c) => (
              <li key={`${c.charge_type}-${c.created_at}`} className="flex justify-between gap-3">
                <span className="text-ink-muted">
                  {CHARGE_TYPE_LABEL[c.charge_type] ?? c.charge_type}
                  <span className="ml-2 text-[11px] text-ink-subtle">
                    {c.status === 'settled' ? 'liquidado' : 'pendiente'}
                  </span>
                </span>
                <span className="font-mono tabular-nums">{soles(Number(c.amount))}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-ink/10 border-t pt-1.5">
              <span className="text-ink">Total</span>
              <span className="font-mono tabular-nums">
                <strong>{soles(d.charges.reduce((a, c) => a + Number(c.amount), 0))}</strong>
              </span>
            </li>
          </ul>
        )}
      </Card>

      <Card title="Línea de tiempo">
        {d.timeline.length === 0 ? (
          <EmptyState title="Sin eventos registrados" />
        ) : (
          <ol className="space-y-0">
            {d.timeline.map((e, i) => {
              const { label, tone } = entryLabel(e)
              const gap = duracion(e.elapsedSec)
              return (
                <li key={`${e.at}-${e.code}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                        e.kind === 'status' ? 'bg-brand' : 'bg-ink/25'
                      }`}
                    />
                    {i < d.timeline.length - 1 && <span className="w-px flex-1 bg-ink/10" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                      {e.kind === 'status' ? (
                        <StatusBadge label={label} tone={tone} />
                      ) : (
                        <span className="text-[13px] text-ink">{label}</span>
                      )}
                      <span className="font-mono text-[12px] text-ink-subtle tabular-nums">
                        {limaTime(e.at)}
                      </span>
                      {gap && (
                        <span className="text-[12px] text-ink-subtle">
                          +{gap}
                          {e.elapsedSec != null && e.elapsedSec >= 600 && (
                            <span className="ml-1 text-warning">⟵ se detuvo aquí</span>
                          )}
                        </span>
                      )}
                    </div>
                    {e.note && <p className="mt-0.5 text-[12px] text-ink-subtle">{e.note}</p>}
                    {e.actorRole && (
                      <p className="mt-0.5 text-[11px] text-ink-subtle">por {e.actorRole}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
    </div>
  )
}
