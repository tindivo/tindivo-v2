'use client'

import { getOpenStatus, type ScheduleDayRow } from '@tindivo/contracts'
import { useState } from 'react'
import { Icon } from '@/components/ui'

// Mismo orden e índices que el editor del panel de negocios (0=Lunes..6=Domingo).
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface Shift {
  start: string
  end: string
}

/** Turnos válidos del día, ordenados por hora de inicio (el editor guarda el 2º turno
 *  del mediodía DESPUÉS del turno 1 de la noche). */
function shiftsOf(row: ScheduleDayRow | undefined): Shift[] {
  if (!row?.is_open) return []
  const out: Shift[] = []
  if (row.shift1_start && row.shift1_end) out.push({ start: row.shift1_start, end: row.shift1_end })
  if (row.shift2_start && row.shift2_end) out.push({ start: row.shift2_start, end: row.shift2_end })
  return out.sort((a, b) => (a.start < b.start ? -1 : 1))
}

const shiftLabel = (shifts: Shift[]): string =>
  shifts.map((s) => `${s.start} – ${s.end}`).join(' y ')

/** Día actual con la convención del horario (0=Lunes), en America/Lima. */
function limaDayIdx(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    weekday: 'short',
  }).format(now)
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday)
  return idx === -1 ? 0 : idx
}

/**
 * Fila de horario de atención: colapsada muestra el horario de HOY + chip
 * Abierto/Cerrado; expandida lista los 7 días. Sin horario configurado no
 * renderiza nada (= siempre abierto). En modo catálogo (WhatsApp) es SOLO
 * informativa: nunca gatilla estados deshabilitados.
 */
export function ScheduleRow({ schedule, now }: { schedule: ScheduleDayRow[]; now: Date }) {
  const [expanded, setExpanded] = useState(false)
  const status = getOpenStatus(schedule, now)
  if (status.kind === 'no_schedule') return null

  const todayIdx = limaDayIdx(now)
  const byDay = new Map(schedule.map((d) => [d.day_of_week, d]))
  const todayShifts = shiftsOf(byDay.get(todayIdx))
  const open = status.kind === 'open'
  // Coherencia con el chip: si estamos abiertos por el cruce de medianoche de
  // AYER y hoy no tiene turnos propios, "Hoy: Cerrado" contradiría al chip.
  const todayLabel =
    todayShifts.length > 0
      ? shiftLabel(todayShifts)
      : status.kind === 'open'
        ? `Abierto hasta ${status.closesAt}`
        : 'Cerrado'

  return (
    <div className="px-4 pt-3">
      <div className="rounded-[20px] border border-border bg-white">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex min-h-[44px] w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <span style={{ color: 'rgba(26,22,20,0.45)' }}>
            <Icon.Clock />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">
            <span style={{ color: 'rgba(26,22,20,0.55)' }}>Hoy: </span>
            <span className="font-semibold">{todayLabel}</span>
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-[11px]"
            style={
              open
                ? { background: 'rgba(22,163,74,0.1)', color: '#15803D' }
                : { background: 'rgba(220,38,38,0.08)', color: '#DC2626' }
            }
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: open ? '#16A34A' : '#DC2626' }}
            />
            {open ? 'Abierto' : 'Cerrado'}
          </span>
          <span
            aria-hidden
            style={{
              color: 'rgba(26,22,20,0.45)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 160ms ease',
            }}
          >
            <Icon.ChevronDown />
          </span>
        </button>

        {expanded && (
          <div className="border-border border-t px-4 py-3">
            <div className="flex flex-col gap-1.5">
              {DAY_NAMES.map((name, idx) => {
                const shifts = shiftsOf(byDay.get(idx))
                const isToday = idx === todayIdx
                return (
                  <div
                    key={name}
                    className={`flex items-baseline justify-between gap-3 text-[13px]${
                      isToday ? ' font-bold' : ''
                    }`}
                    style={isToday ? undefined : { color: 'rgba(26,22,20,0.65)' }}
                  >
                    <span>{name}</span>
                    <span className="tabular-nums">
                      {shifts.length > 0 ? shiftLabel(shifts) : 'Cerrado'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
