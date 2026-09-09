'use client'

import type { ShiftView } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { useOpeningDay } from '../hooks/use-opening-day'
import { ChangeSheet } from './change-sheet'

/**
 * Apertura de la jornada: la pregunta del principio y la franja para cambiar
 * de idea después.
 *
 * Los dos van juntos en un componente porque comparten el hook —y con él, una
 * sola lectura a la base— y porque el estado de uno decide el del otro: el
 * modal solo aparece mientras no haya declaración PARA ESTE TURNO, y la franja
 * está siempre que el negocio esté en su horario.
 *
 * Nada de esto se muestra fuera del horario semanal. A las diez de la mañana
 * la cajera está cambiando precios, no abriendo el local.
 */

/**
 * CUÁNTO DURA «DECIDIR MÁS TARDE», Y POR QUÉ AHORA DURA ALGO.
 *
 * Era para siempre: un `useState(false)` que apagaba la pregunta hasta la
 * siguiente recarga de la página. En un panel que se queda abierto toda la
 * noche, «más tarde» significaba «nunca», y el negocio se pasaba el turno sin
 * declarar —o sea, invisible para el cliente— sin que nada volviera a avisar.
 *
 * Cinco minutos es lo que dura una comanda. Vuelve a preguntar, y seguirá
 * volviendo: es la única pregunta del panel que no se puede dejar sin
 * contestar, porque mientras no se conteste no entra un solo pedido.
 */
const APLAZAMIENTO_MS = 5 * 60_000

export function OpeningControls() {
  const {
    status,
    changeAvailable,
    defaultChange,
    withinSchedule,
    shift,
    moreShiftsToday,
    mustAsk,
    askingForNewShift,
    loading,
    saving,
    error,
    declare,
    setChange,
  } = useOpeningDay()
  /** Instante hasta el que la pregunta está aplazada. Ver `APLAZAMIENTO_MS`. */
  const [postponedUntil, setPostponedUntil] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const [editingChange, setEditingChange] = useState(false)

  // El aplazamiento tiene que CADUCAR solo, sin depender de que algo repinte el
  // panel: sin pedidos activos el tablero puede estar minutos sin renderizar.
  useEffect(() => {
    if (postponedUntil === 0) return
    const t = setInterval(() => setAhora(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [postponedUntil])

  // Un turno nuevo cancela el aplazamiento del anterior: lo que se aplazó al
  // mediodía no puede seguir callando la pregunta de la noche.
  const turno = shift ? `${shift.startLabel}-${shift.endLabel}` : ''
  useEffect(() => {
    setPostponedUntil(0)
  }, [turno])

  if (loading || !withinSchedule) return null

  const aplazada = postponedUntil > ahora
  const preguntando = mustAsk && !aplazada

  return (
    <>
      {preguntando && (
        <OpeningAsk
          shift={shift}
          forNewShift={askingForNewShift}
          previousStatus={status}
          saving={saving}
          error={error}
          onDeclare={declare}
          onPostpone={() => {
            setAhora(Date.now())
            setPostponedUntil(Date.now() + APLAZAMIENTO_MS)
          }}
        />
      )}

      <OpeningBar
        status={status}
        pendingAnswer={mustAsk}
        saving={saving}
        onChange={declare}
        change={changeAvailable ?? defaultChange}
        onEditChange={() => setEditingChange(true)}
        shift={shift}
        moreShiftsToday={moreShiftsToday}
      />

      {editingChange && (
        <ChangeSheet
          current={changeAvailable}
          fallback={defaultChange}
          saving={saving}
          onClose={() => setEditingChange(false)}
          onSave={setChange}
        />
      )}
    </>
  )
}

/**
 * La pregunta de apertura. Sabe de qué turno habla.
 *
 * «¿Abren hoy?» a las seis de la tarde, a quien ya atendió al mediodía y cerró
 * a las tres, es una pregunta que no se entiende: hoy ya abrieron. Por eso
 * cuando la pregunta viene de un turno nuevo se nombra el turno y se recuerda
 * qué se declaró antes — que es exactamente el dato que la cajera no tiene en
 * la cabeza tres horas después.
 */
function OpeningAsk({
  shift,
  forNewShift,
  previousStatus,
  saving,
  error,
  onDeclare,
  onPostpone,
}: {
  shift: ShiftView | null
  forNewShift: boolean
  previousStatus: 'open' | 'closed' | null
  saving: boolean
  error: string | null
  onDeclare: (next: 'open' | 'closed') => void
  onPostpone: () => void
}) {
  const franja = shift ? `${shift.startLabel} a ${shift.endLabel}` : null
  const titulo = forNewShift ? `Empieza tu turno de ${nombreDelTurno(shift)}` : '¿Abren hoy?'
  const detalle = forNewShift
    ? previousStatus === 'closed'
      ? 'Cerraste el turno anterior. Los clientes te ven cerrado hasta que confirmes este.'
      : 'Es un turno nuevo. Confirma que atienden para que los clientes te vean abierto.'
    : 'Los clientes te verán abierto solo si lo confirmas.'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-[320] flex items-center justify-center bg-ink/45 p-5"
    >
      <div className="w-full max-w-[380px] rounded-[20px] bg-card p-6 text-center shadow-elev-4">
        <span className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Icon name={forNewShift ? 'schedule' : 'store'} size={26} filled />
        </span>

        <h3 className="mb-2 text-[17px] font-bold text-ink">{titulo}</h3>
        {franja && <p className="mb-2 text-[13px] font-bold text-brand tabular-nums">{franja}</p>}
        <p className="mb-5 text-[14px] leading-relaxed text-ink-muted">{detalle}</p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => onDeclare('open')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Icon name="check_circle" size={18} filled />
            {forNewShift ? 'Sí, atendemos este turno' : 'Sí, abrimos hoy'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onDeclare('closed')}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1] disabled:opacity-50"
          >
            {forNewShift ? 'Este turno no atendemos' : 'Hoy no atendemos'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onPostpone}
            className="mt-0.5 text-[13px] font-semibold text-ink-subtle disabled:opacity-50"
          >
            Decidir en 5 minutos
          </button>
        </div>

        {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
      </div>
    </div>
  )
}

/** «la noche», «el mediodía»… sale de la hora de inicio del turno. */
function nombreDelTurno(shift: ShiftView | null): string {
  const hora = Number(shift?.startLabel.slice(0, 2) ?? Number.NaN)
  if (!Number.isFinite(hora)) return 'trabajo'
  if (hora < 12) return 'la mañana'
  if (hora < 17) return 'el mediodía'
  return 'la noche'
}

/**
 * Franja de estado. Existe para que la declaración no sea irreversible: si a
 * media tarde se va la luz, cerrar tiene que costar un toque, no una llamada.
 */
function OpeningBar({
  status,
  pendingAnswer,
  saving,
  onChange,
  change,
  onEditChange,
  shift,
  moreShiftsToday,
}: {
  status: 'open' | 'closed' | null
  /** La pregunta sigue sin contestarse (aplazada): la franja no puede decir «abierto». */
  pendingAnswer: boolean
  saving: boolean
  onChange: (next: 'open' | 'closed') => void
  /** Vuelto vigente esta noche: el declarado, o el global si no se declaró. */
  change: number
  onEditChange: () => void
  shift: ShiftView | null
  moreShiftsToday: boolean
}) {
  if (status === 'open' && !pendingAnswer) {
    return (
      <div className="flex items-center justify-between gap-2 bg-success-soft px-4 py-2 text-[13px] font-semibold text-emerald-900">
        <span className="flex items-center gap-2">
          <Icon name="check_circle" size={16} filled />
          Atendiendo{shift ? ` hasta las ${shift.endLabel}` : ' hoy'}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* El vuelto se toca a media faena, que es cuando se acaba: por eso
              vive en la franja y no dentro del modal de apertura, que la cajera
              ya cerró hace tres horas. */}
          <button
            type="button"
            disabled={saving}
            onClick={onEditChange}
            className="inline-flex items-center gap-1 rounded-full bg-ink/[0.06] px-3 py-1 font-bold text-ink transition-colors hover:bg-ink/[0.12] disabled:opacity-50"
          >
            <Icon name="payments" size={14} filled />
            {change <= 0 ? 'Sin vuelto' : `Vuelto S/${change.toFixed(0)}`}
          </button>
          {/* CERRAR UN TURNO NO ES CERRAR EL DÍA, y el botón tiene que decirlo.
              El sábado a las 15:00 «Cerrar por hoy» se leía como el final de la
              jornada cuando quedaba el turno de la noche entero por delante. */}
          <button
            type="button"
            disabled={saving}
            onClick={() => onChange('closed')}
            className="rounded-full bg-ink/[0.06] px-3 py-1 font-bold text-ink transition-colors hover:bg-ink/[0.12] disabled:opacity-50"
          >
            {moreShiftsToday ? 'Cerrar este turno' : 'Cerrar por hoy'}
          </button>
        </span>
      </div>
    )
  }

  const isClosed = status === 'closed'
  return (
    <div className="flex items-center justify-between gap-2 bg-warning-soft px-4 py-2 text-[13px] font-semibold text-amber-900">
      <span className="flex items-center gap-2">
        <Icon name="info" size={16} filled />
        {isClosed && !pendingAnswer
          ? 'Hoy no atienden. No entran pedidos.'
          : 'Sin confirmar. No entran pedidos.'}
      </span>
      <button
        type="button"
        disabled={saving}
        onClick={() => onChange('open')}
        className="shrink-0 rounded-full bg-ink px-3 py-1 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isClosed && !pendingAnswer ? 'Reabrir' : 'Confirmar apertura'}
      </button>
    </div>
  )
}
