'use client'

import { ApiError } from '@tindivo/api-client'
import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import { api } from '@/lib/api'
import type { HistDisplay } from '../types'

export function ClaimSheet({
  orders,
  open,
  onClose,
}: {
  orders: HistDisplay[]
  open: boolean
  onClose: () => void
}) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '')
  const [amount, setAmount] = useState(String(orders[0]?.total ?? ''))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function pick(id: string) {
    setOrderId(id)
    const o = orders.find((x) => x.id === id)
    if (o) setAmount(String(o.total))
  }

  async function submit() {
    if (!orderId || reason.trim().length < 4) return
    setBusy(true)
    setErr(null)
    try {
      await api.post(
        '/business/fraud-claims',
        { orderId, amount: Number(amount) || 0, reason: reason.trim() },
        crypto.randomUUID(),
      )
      setDone(true)
    } catch (e) {
      setErr(
        e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo enviar el reclamo',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-4 pb-6">
        {done ? (
          <div className="py-3 text-center">
            <Icon name="verified" size={36} filled className="mx-auto text-success" />
            <div className="mt-2 text-[17px] font-bold">Reclamo enviado</div>
            <div className="mt-1 text-[13px] text-ink-muted">
              Tindivo lo revisará. Si se aprueba, se descuenta de tu próxima liquidación.
            </div>
            <Button variant="secondary" className="mt-4 w-full" onClick={onClose}>
              Listo
            </Button>
          </div>
        ) : (
          <>
            <div className="text-[17px] font-bold">Reclamar cobertura por fraude</div>
            <div className="mb-4 text-[13px] text-ink-muted">
              Si perdiste dinero por un pedido cancelado, solicita cobertura del fondo.
            </div>

            <label className="mb-3 block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                Pedido cancelado
              </span>
              <select
                value={orderId}
                onChange={(e) => pick(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-ink outline-none focus:border-brand"
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.shortId} · {o.customer} · {soles(o.total)}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                Monto a reclamar (S/)
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-ink outline-none focus:border-brand"
              />
            </label>

            <label className="mb-4 block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                Motivo
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Describe qué pasó (preparaste el pedido, el cliente no recibió, etc.)"
                className="mt-1 w-full resize-y rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] text-ink outline-none focus:border-brand"
              />
            </label>

            {err && <p className="mb-3 text-[13px] text-danger">{err}</p>}

            <Button
              className="w-full"
              disabled={busy || !orderId || reason.trim().length < 4}
              onClick={submit}
            >
              {busy ? 'Enviando…' : 'Enviar reclamo'}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
