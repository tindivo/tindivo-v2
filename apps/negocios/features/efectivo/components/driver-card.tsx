'use client'

import { serviceDate } from '@tindivo/contracts'
import { Badge, Button, Card, Icon } from '@tindivo/ui'
import { type FormEvent, useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { CashLine, DriverCash } from '../hooks/use-cash-settlements'
import { jornadaActual } from '../hooks/use-cash-settlements'
import { useConfirmCash } from '../hooks/use-confirm-cash'
import { useDisputeCash } from '../hooks/use-dispute-cash'

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})
const diaLima = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Lima',
})
/**
 * La hora del pedido, y el día SOLO cuando no es de esta noche.
 *
 * Lo entregado y sin confirmar no se evapora a medianoche: la confirmación es
 * humana y nada la fuerza a las 24h. Pero mezclado con lo de esta noche y
 * mostrando solo «19:40», se lee como de hoy. El día lo separa sin sacarlo.
 *
 * SE COMPARA POR JORNADA, NO POR FECHA DE CALENDARIO. Con la fecha natural, a
 * las 00:00 y con la cajera todavía trabajando, todo lo de esa misma noche
 * empezaba a rotularse «ayer» — que es exactamente la confusión que esta función
 * existe para evitar, servida al revés. `serviceDate` corta a las 05:00.
 */
function cuando(iso: string | null): { hora: string; dia: string | null } | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const suyo = serviceDate(new Date(t))
  if (suyo === jornadaActual()) return { hora: horaLima.format(t), dia: null }
  const ayer = serviceDate(new Date(Date.now() - 86_400_000))
  return { hora: horaLima.format(t), dia: suyo === ayer ? 'ayer' : diaLima.format(t) }
}

/**
 * Un motorizado y todo su efectivo, en una tarjeta.
 *
 * Reemplaza a la pareja «Pendiente del motorizado» + «Por confirmar», que eran
 * dos secciones separadas de la página: para saber si Ernesto le debía algo, la
 * cajera miraba arriba, luego abajo, y cruzaba el nombre a ojo. Aquí lo tiene
 * junto, en el orden en que le importa — lo que exige acción primero.
 */
export function DriverCard({ driver, onDone }: { driver: DriverCash; onDone: () => void }) {
  const hayAccion = driver.porConfirmar.length > 0

  return (
    <Card className={`overflow-hidden p-0 ${hayAccion ? 'border-warning' : ''}`}>
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
          <Icon name="delivery_dining" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{driver.name}</div>
          <div className="text-xs text-ink-muted">
            {hayAccion
              ? `Te entregó ${soles(driver.totalPorConfirmar)}`
              : driver.porEntregar.length > 0
                ? 'Todavía no te ha entregado nada'
                : 'Sin efectivo pendiente'}
          </div>
        </div>
        {driver.phone && (
          <Button
            as="a"
            variant="outline"
            size="sm"
            href={`tel:+51${driver.phone.replace(/\D/g, '')}`}
          >
            <Icon name="call" size={15} /> Llamar
          </Button>
        )}
      </div>

      {/* El arrastre va arriba y con nombre propio: es dinero que lleva más de
          una noche sin cerrar, y la cajera no tiene forma de deducirlo mirando
          las horas. */}
      {driver.arrastre > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[12px] font-semibold text-amber-900">
          <Icon name="history" size={15} filled className="shrink-0" />
          Hay {soles(driver.arrastre)} de noches anteriores sin confirmar.
        </div>
      )}

      {driver.porConfirmar.length > 0 && (
        <Bloque titulo="Te entregó · cuenta el efectivo y confirma" tono="accion">
          {driver.porConfirmar.map((l) => (
            <LineaPorConfirmar key={l.orderId} line={l} onDone={onDone} />
          ))}
        </Bloque>
      )}

      {driver.enDisputa.length > 0 && (
        <Bloque titulo="En disputa · Tindivo lo está revisando" tono="disputa">
          {driver.enDisputa.map((l) => (
            <LineaSimple
              key={l.orderId}
              line={l}
              nota={`Contaste ${soles(l.reportedAmount ?? 0)}`}
            />
          ))}
        </Bloque>
      )}

      {driver.porEntregar.length > 0 && <BloqueEnLaMoto lines={driver.porEntregar} />}

      {driver.confirmadoHoy.count > 0 && (
        <div className="flex items-center gap-2 border-t border-ink/[0.04] px-4 py-2.5 text-[12px] text-ink-muted">
          <Icon name="check_circle" size={15} filled className="text-success" />
          Confirmados hoy · {driver.confirmadoHoy.count} ·{' '}
          <span className="font-mono font-semibold tabular-nums">
            {soles(driver.confirmadoHoy.total)}
          </span>
        </div>
      )}
      {driver.confirmadoHoy.count === 0 && <div className="h-3" />}
    </Card>
  )
}

/**
 * Lo que el motorizado todavía lleva encima.
 *
 * PLEGABLE, y abierto solo cuando es corto. Es el bloque menos accionable de la
 * tarjeta —no hay nada que la cajera pueda hacer con él— y a la vez el que más
 * crece: en una noche movida son ocho líneas empujando hacia abajo justo lo que
 * sí exige acción. Con tres o menos cabe sin estorbar y se deja abierto, que es
 * el caso normal del piloto.
 */
function BloqueEnLaMoto({ lines }: { lines: CashLine[] }) {
  const [abierto, setAbierto] = useState(lines.length <= 3)
  const total = lines.reduce((s, l) => s + l.cashOwed, 0)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="font-mono mt-3 flex w-full items-center gap-2 border-t border-ink/[0.06] px-4 pt-2.5 pb-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50"
      >
        Todavía lo tiene él
        <span className="tabular-nums normal-case tracking-normal">
          · {soles(total)} · {lines.length}
        </span>
        <span className="flex-1" />
        <Icon name={abierto ? 'expand_less' : 'expand_more'} size={16} />
      </button>
      {abierto && (
        <ul className="flex flex-col">
          {lines.map((l) => (
            <LineaSimple key={l.orderId} line={l} />
          ))}
        </ul>
      )}
    </>
  )
}

function Bloque({
  titulo,
  tono,
  children,
}: {
  titulo: string
  tono: 'accion' | 'disputa' | 'apagado'
  children: React.ReactNode
}) {
  const color =
    tono === 'accion' ? 'text-amber-900' : tono === 'disputa' ? 'text-danger' : 'text-ink/50'
  return (
    <>
      <p
        className={`font-mono mt-3 border-t border-ink/[0.06] px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${color}`}
      >
        {titulo}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </>
  )
}

/** Nombre · cuándo · monto, en la misma retícula en las tres secciones. Que la
 *  columna de importes esté siempre en el mismo sitio es lo que permite
 *  recorrerla de arriba abajo mientras se cuenta el fajo. */
function Identidad({ line }: { line: CashLine }) {
  const t = cuando(line.deliveredAt)
  const nombre = line.customerName?.trim()
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[14px] text-ink">{nombre || `#${line.shortId}`}</p>
      {t && (
        <p className="font-mono text-[11px] text-ink-muted">
          {t.dia && <span className="font-semibold text-amber-700">{t.dia} </span>}
          {t.hora}
        </p>
      )}
    </div>
  )
}

function LineaSimple({ line, nota }: { line: CashLine; nota?: string }) {
  return (
    <li className="border-t border-ink/[0.04] first:border-t-0">
      <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
        <Identidad line={line} />
        <p className="font-mono shrink-0 text-[14px] font-bold tabular-nums text-ink-muted">
          {soles(line.cashOwed)}
        </p>
        {line.state === 'pending' && (
          <Badge variant="default" size="sm">
            Por entregar
          </Badge>
        )}
        {line.state === 'disputed' && (
          <Badge variant="danger" size="sm">
            En revisión
          </Badge>
        )}
      </div>
      {nota && <p className="px-4 pb-2 text-[12px] text-ink-muted">{nota}</p>}
    </li>
  )
}

/**
 * La línea accionable: el botón lleva el importe.
 *
 * `Confirmar S/ 30` y no un `Confirmar` genérico, porque lo que se confirma es
 * un número contado, no una fila de una lista. Y «Reportar diferencia» baja a
 * enlace: eran dos botones al 50/50, lo que le decía a la cajera que ambas cosas
 * pasan igual de seguido. No es cierto — y ahora, con la diferencia atribuida a
 * un cliente concreto, todavía menos.
 */
function LineaPorConfirmar({ line, onDone }: { line: CashLine; onDone: () => void }) {
  const [modo, setModo] = useState<'idle' | 'disputa'>('idle')
  const [contado, setContado] = useState(String(line.cashOwed.toFixed(2)))
  const [nota, setNota] = useState('')
  const [errorLocal, setErrorLocal] = useState<string | null>(null)

  const { confirm, busy: confirmando } = useConfirmCash()
  const { dispute, busy: disputando } = useDisputeCash()
  const busy = confirmando || disputando

  async function confirmar() {
    if (!line.settlementId) return
    setErrorLocal(null)
    try {
      await confirm(line.settlementId)
      onDone()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error')
    }
  }

  async function reportar(e: FormEvent) {
    e.preventDefault()
    if (!line.settlementId || !nota.trim()) return
    setErrorLocal(null)
    try {
      await dispute(line.settlementId, Number(contado), nota)
      setModo('idle')
      setNota('')
      onDone()
    } catch (err) {
      setErrorLocal(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <li className="border-t border-ink/[0.04] first:border-t-0">
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Identidad line={line} />
        <p className="font-mono shrink-0 text-[15px] font-bold tabular-nums">
          {soles(line.cashOwed)}
        </p>
        <Button variant="success" size="sm" disabled={busy} onClick={confirmar}>
          <Icon name="check" size={16} /> Confirmar {soles(line.cashOwed)}
        </Button>
      </div>

      {modo === 'idle' ? (
        <button
          type="button"
          className="px-4 pb-2 text-left text-[12px] text-ink-subtle underline-offset-2 hover:underline"
          onClick={() => setModo('disputa')}
        >
          No cuadra — reportar diferencia
        </button>
      ) : (
        <form onSubmit={reportar} className="flex flex-col gap-2 px-4 pb-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <span className="font-mono text-[13px] text-ink-muted">Conté S/</span>
            <input
              className="w-24 rounded-xl border border-ink/[0.08] bg-card px-3 py-2 text-center font-mono text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
              inputMode="decimal"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
            />
          </label>
          <input
            className="rounded-xl border border-ink/[0.08] bg-card px-3 py-2.5 text-sm outline-none placeholder:text-ink/45 focus:border-brand focus:ring-2 focus:ring-brand/40"
            placeholder="Motivo de la diferencia (obligatorio)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" disabled={busy || !nota.trim()}>
              Enviar diferencia
            </Button>
            <button
              type="button"
              className="text-sm text-ink-subtle underline-offset-2 hover:underline"
              onClick={() => setModo('idle')}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {errorLocal && <p className="px-4 pb-2 text-[12px] text-danger">{errorLocal}</p>}
    </li>
  )
}
