'use client'

import { getOpenStatus, type ScheduleDayRow } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useState } from 'react'

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

interface ScheduleRowProps {
  schedule: ScheduleDayRow[]
  now: Date
}

export function ScheduleRow({ schedule, now }: ScheduleRowProps) {
  const [expanded, setExpanded] = useState(false)
  const status = getOpenStatus(schedule, now)
  if (status.kind === 'no_schedule') return null

  const todayIdx = limaDayIdx(now)
  const byDay = new Map(schedule.map((d) => [d.day_of_week, d]))
  const todayShifts = shiftsOf(byDay.get(todayIdx))
  const open = status.kind === 'open'
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
          data-expanded={expanded}
          className="flex min-h-[44px] w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <span className="text-ink/45">
            <Icon name="schedule" size={20} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">
            <span className="text-ink/55">Hoy: </span>
            <span className="font-semibold">{todayLabel}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-[11px] ${
              open ? 'bg-success/10 text-success' : 'bg-danger/8 text-danger'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-success' : 'bg-danger'}`}
            />
            {open ? 'Abierto' : 'Cerrado'}
          </span>
          <span
            data-expanded={expanded}
            className="text-ink/45 transition-transform duration-160 ease-out data-[expanded=true]:rotate-180"
          >
            <Icon name="expand_more" size={20} />
          </span>
        </button>

        {expanded && (
          <div className="border-t border-border px-4 py-3">
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
          </div>
        )}
      </div>
    </div>
  )
}
