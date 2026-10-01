'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import type { AdminCourierRemittanceItem } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { limaDateTime, soles } from '@/lib/format'

const METODO: Record<string, string> = { yape: 'Yape', cash: 'Efectivo' }

/**
 * Lo que los motorizados le deben a Tindivo por Entregas (0237), y el
 * «Confirmar» de Jesús.
 *
 * El motorizado toca «Entregar» en su pantalla de Deuda cuando te da la plata
 * (o te pasa el Yape); aquí aparece en «Por confirmar». Lo que todavía no
 * marcó se ve debajo, apagado: es deuda, pero aún no hay nada que confirmar.
 */
export default function DeudaEntregasPage() {
  const [rows, setRows] = useState<AdminCourierRemittanceItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<AdminCourierRemittanceItem[]>>('/admin/courier-remittances')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function confirmar(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await api.post(`/admin/courier-remittances/${id}/confirm`, {})
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  const porDriver = new Map<string, AdminCourierRemittanceItem[]>()
  for (const r of rows ?? []) {
    porDriver.set(r.driverName, [...(porDriver.get(r.driverName) ?? []), r])
  }
  const total = (rows ?? []).reduce((s, r) => s + r.amount, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Conciliación"
        title="Deuda de entregas"
        description={
          rows
            ? `${soles(total)} cobrados por Entregas sin confirmar · ${rows.length} entregas`
            : 'Lo que los motorizados cobraron por Entregas.'
        }
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!rows ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : rows.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.truck className="h-5 w-5" />}
            title="Nadie le debe nada a Tindivo"
            hint="Todo lo cobrado por Entregas está confirmado."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {[...porDriver.entries()].map(([driver, items]) => {
            const porConfirmar = items.filter((i) => i.state === 'delivering')
            const sinEntregar = items.filter((i) => i.state === 'pending')
            return (
              <li key={driver} className="t-card">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-[16px]">{driver}</p>
                  <p className="font-mono text-[18px] font-bold tabular-nums">
                    {soles(items.reduce((s, i) => s + i.amount, 0))}
                  </p>
                </div>

                {porConfirmar.length > 0 && (
                  <>
                    <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Por confirmar · dice que ya te lo dio
                    </p>
                    <ul className="mt-1">
                      {porConfirmar.map((i) => (
                        <Linea key={i.id} item={i}>
                          <Button
                            size="sm"
                            disabled={busyId === i.id}
                            onClick={() => void confirmar(i.id)}
                          >
                            {busyId === i.id ? '…' : 'Confirmar'}
                          </Button>
                        </Linea>
                      ))}
                    </ul>
                  </>
                )}

                {sinEntregar.length > 0 && (
                  <>
                    <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Todavía no te lo entrega
                    </p>
                    <ul className="mt-1 opacity-70">
                      {sinEntregar.map((i) => (
                        <Linea key={i.id} item={i} />
                      ))}
                    </ul>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Linea({
  item,
  children,
}: {
  item: AdminCourierRemittanceItem
  children?: React.ReactNode
}) {
  return (
    <li className="flex min-h-[44px] items-center gap-3 border-t border-ink/[0.05] py-1.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-ink">
          {item.requesterName}{' '}
          <span className="font-mono text-[12px] text-ink-muted">#{item.shortId}</span>
        </p>
        <p className="font-mono text-[11px] text-ink-muted">
          {limaDateTime(item.collectedAt)}
          {item.paymentMethod && ` · ${METODO[item.paymentMethod]}`}
        </p>
      </div>
      <p className="font-mono shrink-0 text-[14px] font-bold tabular-nums">{soles(item.amount)}</p>
      <div className="flex w-[104px] shrink-0 justify-end">{children}</div>
    </li>
  )
}
