'use client'

import { ApiError } from '@tindivo/api-client'
import type { ProblemDetails } from '@tindivo/contracts'
import { cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { OrderVM } from '@/lib/orders/view-model'
import { soles } from '../primitives'

/**
 * Corregir un pedido manual ya tomado (0190).
 *
 * DOS VENTANAS, NO UNA. El dinero se congela cuando el motorizado llega al
 * local, un estado ANTES que el resto, porque ahí es donde la cajera le da el
 * sencillo en mano —lo dice su propia pantalla: «Lleva S/X de vuelto,
 * consíguelo aquí antes de salir»—. Editar el billete después de entregarlo
 * dejaría al motorizado con un adelanto distinto del que se le va a rendir, y
 * el descuadre no aparecería hasta el corte de caja.
 *
 * EL FORMULARIO NO SE LIMPIA NUNCA. Si otra pestaña —o el propio motorizado—
 * movió el pedido mientras ella escribía, la respuesta trae el pedido fresco y
 * aquí se pinta el conflicto ENCIMA de lo que tecleó.
 *
 * EL LENGUAJE VISUAL ES EL DE «PEDIR MOTO» (`features/nuevo`), a propósito: es
 * la misma persona corrigiendo lo que acaba de teclear en aquella pantalla, y
 * dos gramáticas distintas para el mismo dato la obligan a releer. De ahí las
 * tarjetas agrupadas, las micro-etiquetas en mono, el dinero en mono-bold y el
 * método de pago como pastillas en vez de un `<select>`.
 */

type Intent = 'pending_cash' | 'pending_yape' | 'pending_mixed' | 'prepaid'

/** Lo que la ruta devuelve en el 409 para poder pintar el conflicto. */
interface Fresco {
  status: string
  order_amount: number
  delivery_fee: number
  payment_intent: string
  client_pays_with: number | null
  customer_name: string | null
  customer_phone: string | null
  delivery_reference: string | null
  updated_at: string
}

interface Conflicto {
  fresco: Fresco
  /** Campos que cambiaron en el servidor Y que ella también tocó. */
  colisiones: string[]
}

/**
 * Los métodos que la edición ofrece, con el mismo tratamiento de color que
 * `features/nuevo/lib/constants.ts` — verde dinero, violeta billetera, azul
 * para el que ya pagó. El mixto NO está: se toma en la pantalla de creación y
 * cambiarlo aquí exigiría teclear las dos partes, que es un formulario dentro
 * de otro. Un mixto que hay que rehacer se cancela, como hasta ahora.
 */
const METODOS: { id: Intent; icon: string; label: string; sub: string; tile: string }[] = [
  {
    id: 'pending_cash',
    icon: 'payments',
    label: 'Efectivo',
    sub: 'El motorizado cobra al entregar',
    tile: 'bg-[linear-gradient(135deg,var(--color-success),#4ade80)]',
  },
  {
    id: 'pending_yape',
    icon: 'qr_code_2',
    label: 'Billetera digital',
    sub: 'Yape o Plin — el moto muestra el QR',
    tile: 'bg-[linear-gradient(135deg,#7c3aed,#a78bfa)]',
  },
  {
    id: 'prepaid',
    icon: 'verified',
    label: 'Ya pagó',
    sub: 'El motorizado solo entrega',
    tile: 'bg-[linear-gradient(135deg,var(--color-info),#38bdf8)]',
  },
]

const ETIQUETA: Record<string, string> = {
  total: 'Total',
  paymentIntent: 'Método de pago',
  customerName: 'Nombre',
  customerPhone: 'Teléfono',
  deliveryReference: 'Dirección',
}

const MICRO = 'block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted'
const TARJETA = 'rounded-2xl border border-border bg-card p-4'
const INPUT =
  'h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-ink outline-none transition-all focus:border-brand'
const INPUT_MONEY = `${INPUT} font-mono text-xl font-bold`
const INPUT_OFF =
  'h-11 w-full cursor-not-allowed rounded-xl border border-dashed border-border bg-ink/[0.04] px-3 text-ink-muted'

export function EditarPedidoModal({
  order,
  onClose,
  onSaved,
}: {
  order: OrderVM
  onClose: () => void
  onSaved: () => void
}) {
  const [total, setTotal] = useState(order.total.toFixed(2))
  const [intent, setIntent] = useState<Intent>(order.payment as Intent)
  const [paysWith, setPaysWith] = useState(order.paysWith?.toFixed(2) ?? '')
  const [name, setName] = useState(order.customer ?? '')
  const [phone, setPhone] = useState(order.phone ?? '')
  const [ref, setRef] = useState(order.addressRef ?? '')

  const [token, setToken] = useState(order.updatedAt)
  const [conflicto, setConflicto] = useState<Conflicto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dineroVivo = order.canEditMoney && !conflictoCierraDinero(conflicto)

  const num = (raw: string) => {
    const n = Number.parseFloat(raw.replace(',', '.').replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
  }
  const totalN = num(total)
  const paysN = num(paysWith)
  const esEfectivo = intent === 'pending_cash'

  // El vuelto EN VIVO, mientras teclea: es el número que va a tener que sacar de
  // la caja, y verlo antes de guardar es la mitad del valor de esta pantalla.
  const vuelto = esEfectivo && paysN > totalN ? Math.round((paysN - totalN) * 100) / 100 : 0
  const billeteCorto = esEfectivo && paysN > 0 && paysN < totalN

  const hayCambios =
    totalN !== order.total ||
    intent !== order.payment ||
    (esEfectivo && paysN > 0 ? paysN : null) !== (order.paysWith ?? null) ||
    name.trim() !== (order.customer ?? '') ||
    phone.trim() !== (order.phone ?? '') ||
    ref.trim() !== (order.addressRef ?? '')

  const puedeGuardar = !busy && totalN > 0 && !billeteCorto && hayCambios

  async function guardar() {
    if (!puedeGuardar) return
    setBusy(true)
    setError(null)
    try {
      // `api` y no `fetch` a pelo: el API vive en OTRO origen (:3001 en local,
      // apiv2.tindivo.com en prod) y el cliente compartido es quien pone la base
      // y el Bearer. Con una URL relativa esto pegaba contra el propio Next de
      // negocios y moría en un 404 disfrazado de «revisa tu conexión».
      await api.patch(`/business/orders/${order.rowId}`, {
        expectedUpdatedAt: token,
        totalAmount: totalN,
        paymentIntent: intent,
        customerName: name.trim() || null,
        customerPhone: phone.trim() || null,
        deliveryReference: ref.trim() || null,
        clientPaysWith: esEfectivo && paysN > 0 ? paysN : null,
      })
      onSaved()
    } catch (e) {
      // El 409 no es un fallo: es el conflicto de versión, y trae el pedido
      // fresco dentro del propio Problem Details para pintarlo sin volver a
      // preguntar. `ApiError.problem` es el cuerpo entero.
      if (e instanceof ApiError && e.status === 409) {
        const fresco = (e.problem as ProblemDetails & { current?: Fresco | null }).current
        if (fresco) {
          setConflicto({
            fresco,
            colisiones: colisionesDe(fresco, order, { totalN, intent, name, phone, ref }),
          })
          setToken(fresco.updated_at)
          return
        }
      }
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar. Revisa tu conexión.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-surface shadow-elev-4 sm:rounded-3xl">
        {/* Cabecera fija: el importe vivo manda, como en el detalle */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-display text-[17px] font-bold leading-tight text-ink">
              Corregir pedido
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-muted">#{order.id}</p>
          </div>
          <div className="text-right">
            <p className={MICRO}>Total</p>
            <p className="font-mono text-[22px] font-bold leading-none text-ink">
              {soles(totalN || order.total)}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {conflicto && <AvisoConflicto conflicto={conflicto} order={order} />}

          {!order.canEditMoney && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-warning/35 bg-warning-soft p-3.5 text-[13px] text-amber-900">
              <Icon name="two_wheeler" size={20} filled className="mt-0.5 shrink-0" />
              <p>
                <span className="font-semibold">El motorizado ya está en el local</span> con el
                vuelto en la mano, así que el dinero no se puede cambiar. Dile lo que cambió y él lo
                registra al entregar.
              </p>
            </div>
          )}

          {/* ── Dinero ─────────────────────────────────────────────────── */}
          <div className={cn(TARJETA, !dineroVivo && 'opacity-60')}>
            <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Monto del pedido
            </div>

            <label className={MICRO} htmlFor="editar-total">
              Total a cobrar · delivery + comida (S/)
            </label>
            <input
              id="editar-total"
              inputMode="decimal"
              value={total}
              disabled={!dineroVivo}
              onChange={(e) => setTotal(e.target.value)}
              className={cn(
                'mt-1',
                dineroVivo ? INPUT_MONEY : `${INPUT_OFF} font-mono text-xl font-bold`,
              )}
            />
            <p className="mt-1 text-xs text-ink-muted">
              Incluye el envío de {soles(order.deliveryFee)}. Es lo que va a cobrar el motorizado.
            </p>

            {esEfectivo && (
              <div className="mt-3">
                <label className={MICRO} htmlFor="editar-paga-con">
                  Cliente paga con (S/)
                </label>
                <input
                  id="editar-paga-con"
                  inputMode="decimal"
                  value={paysWith}
                  disabled={!dineroVivo}
                  onChange={(e) => setPaysWith(e.target.value)}
                  placeholder="0.00"
                  className={cn(
                    'mt-1',
                    dineroVivo ? INPUT_MONEY : `${INPUT_OFF} font-mono text-xl font-bold`,
                  )}
                />
              </div>
            )}

            {billeteCorto && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-danger">
                <Icon name="error" size={14} filled />
                El billete de {soles(paysN)} no cubre los {soles(totalN)} del pedido
              </div>
            )}

            {vuelto > 0 && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-success-soft p-3 text-sm text-green-900">
                <Icon name="payments" size={20} filled className="mt-0.5 shrink-0" />
                <p className="font-semibold">
                  Entrega <span className="font-mono">{soles(vuelto)}</span> de vuelto al motorizado
                  junto con el pedido
                </p>
              </div>
            )}
          </div>

          {/* ── Método de pago ─────────────────────────────────────────── */}
          <div className={cn(TARJETA, !dineroVivo && 'opacity-60')}>
            <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Método de pago
            </div>
            {order.payment === 'pending_mixed' ? (
              <p className="text-[13px] text-ink-muted">
                Este pedido es <span className="font-semibold text-ink">mixto</span>. Cambiar el
                reparto entre billetera y efectivo se hace creando el pedido de nuevo.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {METODOS.map((o) => {
                  const activo = intent === o.id
                  return (
                    <button
                      type="button"
                      key={o.id}
                      disabled={!dineroVivo}
                      aria-pressed={activo}
                      onClick={() => setIntent(o.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98]',
                        !dineroVivo
                          ? 'cursor-not-allowed border-dashed border-border bg-ink/[0.04]'
                          : activo
                            ? 'border-brand/45 bg-brand-soft shadow-[0_8px_22px_-8px_rgba(249,115,22,0.3)]'
                            : 'border-border bg-card hover:bg-surface',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white transition-opacity',
                          o.tile,
                          (!activo || !dineroVivo) && 'opacity-55',
                        )}
                      >
                        <Icon name={o.icon} size={20} filled />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink">{o.label}</div>
                        <div className="text-xs text-ink-muted">{o.sub}</div>
                      </div>
                      {activo && (
                        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white">
                          <Icon name="check" size={14} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Cliente ────────────────────────────────────────────────── */}
          <div className={TARJETA}>
            <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Datos del cliente
            </div>

            <label className={MICRO} htmlFor="editar-telefono">
              Teléfono del cliente
            </label>
            <input
              id="editar-telefono"
              inputMode="numeric"
              maxLength={9}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="987654321"
              className={cn('mt-1 font-mono', INPUT)}
            />

            <div className="mt-3">
              <label className={MICRO} htmlFor="editar-nombre">
                Nombre
              </label>
              <input
                id="editar-nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn('mt-1', INPUT)}
              />
            </div>

            <div className="mt-3">
              <label className={MICRO} htmlFor="editar-ref">
                Dirección o referencia
              </label>
              <textarea
                id="editar-ref"
                rows={2}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card p-3 text-[15px] text-ink outline-none transition-all focus:border-brand"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-[13px] text-danger">
              <Icon name="error" size={18} filled className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Pie fijo */}
        <div className="flex shrink-0 gap-2.5 border-t border-border bg-white px-4 pb-4 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-card py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!puedeGuardar}
            onClick={guardar}
            className="flex-[2] rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] py-3 text-[15px] font-semibold text-white shadow-elev-2 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? 'Guardando…' : conflicto ? 'Revisar y guardar' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * El aviso del conflicto.
 *
 * Lo que lo hace útil es la distinción: los campos que cambiaron en los DOS
 * lados son los únicos donde hace falta que un humano decida. Los que solo tocó
 * ella siguen abajo tal cual, sin nada que resolver.
 */
function AvisoConflicto({ conflicto, order }: { conflicto: Conflicto; order: OrderVM }) {
  const f = conflicto.fresco
  const totalFresco = Number(f.order_amount) + Number(f.delivery_fee)
  const cierraDinero = conflictoCierraDinero(conflicto)
  const etiquetaMetodo = (v: string) => METODOS.find((m) => m.id === v)?.label ?? v

  return (
    <div className="rounded-2xl border border-warning/45 bg-warning-soft p-3.5">
      <div className="flex items-center gap-2">
        <Icon name="sync_problem" size={18} filled className="shrink-0 text-amber-900" />
        <p className="text-[13px] font-semibold text-amber-900">
          El pedido cambió mientras lo editabas
        </p>
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-amber-900">
        {totalFresco !== order.total && (
          <li
            className={cn(
              'flex items-center gap-1.5',
              conflicto.colisiones.includes('total') && 'font-semibold text-danger',
            )}
          >
            <Icon name="arrow_right_alt" size={14} />
            Total: <span className="font-mono">{soles(order.total)}</span> →{' '}
            <span className="font-mono">{soles(totalFresco)}</span>
            {conflicto.colisiones.includes('total') && ' · tú también lo cambiaste'}
          </li>
        )}
        {f.payment_intent !== order.payment && (
          <li className="flex items-center gap-1.5">
            <Icon name="arrow_right_alt" size={14} />
            Método: {etiquetaMetodo(order.payment)} → {etiquetaMetodo(f.payment_intent)}
          </li>
        )}
        {conflicto.colisiones
          .filter((c) => c !== 'total')
          .map((c) => (
            <li key={c} className="flex items-center gap-1.5 font-semibold text-danger">
              <Icon name="arrow_right_alt" size={14} />
              {ETIQUETA[c] ?? c}: lo cambiaron los dos
            </li>
          ))}
      </ul>
      <p className="mt-2 text-[12px] text-amber-900">
        {cierraDinero
          ? 'Además el motorizado llegó al local, así que el dinero quedó bloqueado. Lo demás sigue como lo escribiste.'
          : 'Tus cambios siguen abajo. Revísalos y vuelve a guardar.'}
      </p>
    </div>
  )
}

/**
 * ¿El conflicto además cerró la ventana del dinero?
 *
 * Pasa cuando lo que cambió fue el estado a `waiting_at_restaurant`: ella
 * estaba editando el total y, entre medias, el motorizado llegó al local. Sin
 * decirlo con esas palabras, se quedaría mirando un formulario que rechaza su
 * total sin explicar por qué.
 */
function conflictoCierraDinero(c: Conflicto | null): boolean {
  return c?.fresco.status === 'waiting_at_restaurant'
}

function colisionesDe(
  f: Fresco,
  original: OrderVM,
  tecleado: { totalN: number; intent: Intent; name: string; phone: string; ref: string },
): string[] {
  const out: string[] = []
  const totalFresco = Number(f.order_amount) + Number(f.delivery_fee)

  // Colisión = el servidor lo movió Y ella también. Si solo cambió uno de los
  // dos lados no hay nada que decidir.
  if (totalFresco !== original.total && tecleado.totalN !== original.total) out.push('total')
  if (f.payment_intent !== original.payment && tecleado.intent !== original.payment) {
    out.push('paymentIntent')
  }
  if (
    (f.customer_name ?? '') !== (original.customer ?? '') &&
    tecleado.name !== (original.customer ?? '')
  ) {
    out.push('customerName')
  }
  if (
    (f.customer_phone ?? '') !== (original.phone ?? '') &&
    tecleado.phone !== (original.phone ?? '')
  ) {
    out.push('customerPhone')
  }
  if (
    (f.delivery_reference ?? '') !== (original.addressRef ?? '') &&
    tecleado.ref !== (original.addressRef ?? '')
  ) {
    out.push('deliveryReference')
  }
  return out
}
