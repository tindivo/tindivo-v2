'use client'

import type { CourierDebtItem } from '@tindivo/contracts'
import { Button, Card, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { useState } from 'react'
import { cuando, soles } from '@/lib/format'
import { remitCourierFee, useCourierDebt } from '../hooks/use-courier-debt'

/**
 * Lo que se le debe a Tindivo por Entregas, entrega por entrega (0237).
 *
 * EL MISMO FLUJO QUE EL EFECTIVO DE LOS RESTAURANTES: «Entregar» en cada línea,
 * la línea pasa a «Esperando confirmación» y sale de la lista cuando Jesús la
 * confirma en admin.
 *
 * TAMBIÉN EL YAPE. El Yape del transporte entra al QR del motorizado, así que
 * es plata de Tindivo que él tiene, igual que el efectivo. El método va en
 * cada línea para que el cuadre con su historial de Yape sea directo.
 */
export function TindivoDebtList() {
  const { items, loading, error, reload } = useCourierDebt()
  /** Enviadas cuya recarga aún no volvió: sin esto la línea parpadea a «Entregar». */
  const [enviadas, setEnviadas] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [errores, setErrores] = useState<Record<string, string>>({})

  async function entregar(id: string) {
    setErrores(({ [id]: _, ...resto }) => resto)
    setBusy((s) => new Set(s).add(id))
    try {
      await remitCourierFee(id)
      setEnviadas((s) => new Set(s).add(id))
      await reload()
    } catch (err) {
      setErrores((e) => ({ ...e, [id]: err instanceof Error ? err.message : 'Error' }))
    } finally {
      setBusy((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  if (loading) return <SkeletonList count={2} />

  const porEntregar = items.filter((o) => o.state === 'pending' && !enviadas.has(o.id))
  const enEspera = items.filter((o) => o.state !== 'pending' || enviadas.has(o.id))
  const total = porEntregar.reduce((s, o) => s + o.amount, 0)
  const yape = porEntregar.filter((o) => o.paymentMethod === 'yape').length
  const efectivo = porEntregar.length - yape

  return (
    <>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

      {porEntregar.length > 0 && (
        <Card className="mt-4 border-none bg-blue-600 p-5 text-white shadow-none">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            Debes a Tindivo
          </p>
          <p className="font-display mt-1 text-[38px] font-bold leading-none tracking-tight tabular-nums">
            {soles(total)}
          </p>
          <p className="mt-2 text-[12px] text-white/85">
            {porEntregar.length} {porEntregar.length === 1 ? 'entrega' : 'entregas'}
            {yape > 0 && ` · ${yape} Yape`}
            {efectivo > 0 && ` · ${efectivo} efectivo`}
          </p>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="local_shipping"
            heading="No le debes nada a Tindivo"
            description="Cuando cobres una entrega, por Yape o en efectivo, aparecerá aquí."
          />
        </div>
      ) : (
        <Card className="relative mt-5 overflow-hidden p-0">
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-blue-600" />
          <div className="flex items-center gap-2 px-[18px] pt-[18px]">
            <Icon name="local_shipping" size={18} filled className="text-blue-600" />
            <p className="font-semibold text-[16px]">Tindivo Entregas</p>
          </div>

          {porEntregar.length > 0 && (
            <ul className="mt-2.5 flex flex-col">
              {porEntregar.map((o) => (
                <DebtRow
                  key={o.id}
                  item={o}
                  busy={busy.has(o.id)}
                  error={errores[o.id]}
                  onEntregar={() => void entregar(o.id)}
                />
              ))}
            </ul>
          )}

          {enEspera.length > 0 && (
            <>
              <p className="font-mono mt-2 border-t border-ink/[0.06] px-[18px] pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                Esperando confirmación de Tindivo
              </p>
              <ul className="flex flex-col">
                {enEspera.map((o) => (
                  <DebtRow key={o.id} item={o} entregada />
                ))}
              </ul>
            </>
          )}
          <div className="h-[18px]" />
        </Card>
      )}

      {porEntregar.length === 0 && enEspera.length > 0 && (
        <p className="mt-4 text-center text-[13px] text-ink-muted">
          Ya entregaste todo. Falta que Jesús lo confirme.
        </p>
      )}
    </>
  )
}

/** Una entrega: quién · cuándo y cómo se cobró · monto · acción. */
function DebtRow({
  item,
  busy,
  error,
  onEntregar,
  entregada = false,
}: {
  item: CourierDebtItem
  busy?: boolean
  error?: string
  onEntregar?: () => void
  entregada?: boolean
}) {
  const t = cuando(item.collectedAt)
  const metodo =
    item.paymentMethod === 'yape' ? 'Yape' : item.paymentMethod === 'cash' ? 'Efectivo' : null

  return (
    <li className="border-t border-ink/[0.04] first:border-t-0">
      <div className="flex min-h-[52px] items-center gap-3 px-[18px] py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-ink">{item.requesterName}</p>
          <p className="font-mono text-[11px] text-ink-muted">
            {t?.dia && <span className="font-semibold text-amber-700">{t.dia} </span>}
            {t?.hora}
            {metodo && <span> · {metodo}</span>}
          </p>
        </div>

        <p
          className={`font-mono shrink-0 text-[15px] font-bold tabular-nums ${
            entregada ? 'text-ink-muted' : 'text-ink'
          }`}
        >
          {soles(item.amount)}
        </p>

        <div className="flex w-[104px] shrink-0 justify-end">
          {entregada ? (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
              Entregando…
            </span>
          ) : (
            <Button size="sm" disabled={busy} onClick={onEntregar}>
              {busy ? '…' : 'Entregar'}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="px-[18px] pb-2 text-[12px] text-danger">{error}</p>}
    </li>
  )
}
