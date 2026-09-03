'use client'

import type { ScheduleDayRow } from '@tindivo/contracts'

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface Shift {
  start: string
  end: string
}

function shiftsOf(row: ScheduleDayRow | undefined): Shift[] {
  if (!row?.is_open) return []
  const out: Shift[] = []
  if (row.shift1_start && row.shift1_end) out.push({ start: row.shift1_start, end: row.shift1_end })
  if (row.shift2_start && row.shift2_end) out.push({ start: row.shift2_start, end: row.shift2_end })
  return out.sort((a, b) => (a.start < b.start ? -1 : 1))
}

const shiftLabel = (shifts: Shift[]): string =>
  shifts.map((s) => `${s.start} – ${s.end}`).join(' y ')

function limaDayIdx(now: Date): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    weekday: 'short',
  }).format(now)
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday)
  return idx === -1 ? 0 : idx
}

interface ScheduleWeekProps {
  schedule: ScheduleDayRow[]
  now: Date
}

/**
 * Los siete días con sus turnos. Es lo que se despliega al tocar el estado en
 * `BusinessIdentity`.
 *
 * Antes vivía dentro de `ScheduleRow`, una tarjeta propia de 60 px que repetía
 * el «Abierto» que el hero ya decía justo encima. Aquí solo queda la parte que
 * aportaba algo: la semana. El estado y la hora de cierre los lleva el título.
 */
export function ScheduleWeek({ schedule, now }: ScheduleWeekProps) {
  const todayIdx = limaDayIdx(now)
  const byDay = new Map(schedule.map((d) => [d.day_of_week, d]))

  return (
    <div className="flex flex-col gap-1.5">
      {DAY_NAMES.map((name, idx) => {
        const shifts = shiftsOf(byDay.get(idx))
        const isToday = idx === todayIdx
        return (
          <div
            key={name}
            className={`flex items-baseline justify-between gap-3 text-[13px] ${
              isToday ? 'font-bold' : 'text-ink/65'
            }`}
          >
            <span>{name}</span>
            <span className="tabular-nums">
              {shifts.length > 0 ? shiftLabel(shifts) : 'Cerrado'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
