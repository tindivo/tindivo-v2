/**
 * Horario semanal del negocio (`business_schedule`) y cálculo de "abierto ahora".
 *
 * Convención de días: 0=Lunes..6=Domingo — la del editor del panel de negocios.
 * OJO: distinta de `Date.getDay()` (0=Domingo); aquí nunca se usa getDay.
 *
 * La columna `crosses_midnight` de la DB se IGNORA a propósito: el editor la
 * deriva solo del turno 1 al guardar, así que no cubre un turno 2 que cruce ni
 * filas escritas por otras vías. El cruce se deriva por turno: `end <= start`.
 */

export interface ScheduleDayRow {
  /** 0=Lunes..6=Domingo (convención del editor; NO Date.getDay()). */
  day_of_week: number
  is_open: boolean
  shift1_start: string | null
  shift1_end: string | null
  shift2_start: string | null
  shift2_end: string | null
}

export type OpenStatus =
  | { kind: 'no_schedule' }
  | { kind: 'open'; closesAt: string }
  | { kind: 'closed'; opensAt: string | null; opensToday: boolean }

const HHMM_RE = /^(\d{2}):(\d{2})$/

/** 'HH:MM' → minutos desde medianoche; null si es inválido o ausente. */
function toMinutes(v: string | null): number | null {
  if (!v) return null
  const m = HHMM_RE.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

const WEEKDAY_TO_IDX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

const limaFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Día (0=Lunes) y minuto del instante en America/Lima — el server puede correr en otra TZ. */
function limaParts(now: Date): { dayIdx: number; minutes: number } {
  let weekday = ''
  let hour = 0
  let minute = 0
  for (const p of limaFmt.formatToParts(now)) {
    if (p.type === 'weekday') weekday = p.value
    else if (p.type === 'hour') hour = Number(p.value)
    else if (p.type === 'minute') minute = Number(p.value)
  }
  return { dayIdx: WEEKDAY_TO_IDX[weekday] ?? 0, minutes: hour * 60 + minute }
}

interface Shift {
  start: number
  end: number
  startLabel: string
  endLabel: string
}

/** Turnos válidos de una fila; un día is_open=false no aporta turnos. */
function shiftsOf(row: ScheduleDayRow | undefined): Shift[] {
  if (!row?.is_open) return []
  const pairs: [string | null, string | null][] = [
    [row.shift1_start, row.shift1_end],
    [row.shift2_start, row.shift2_end],
  ]
  const out: Shift[] = []
  for (const [s, e] of pairs) {
    const start = toMinutes(s)
    const end = toMinutes(e)
    if (start === null || end === null) continue
    out.push({ start, end, startLabel: s as string, endLabel: e as string })
  }
  return out
}

const crossesMidnight = (sh: Shift): boolean => sh.end <= sh.start

const DAY_MIN = 24 * 60

/**
 * Estado de atención del negocio en el instante `now` (America/Lima).
 * Sin filas → `no_schedule` (se trata como siempre abierto y sin UI de horario).
 * Semántica de turno: `[start, end)` — apertura inclusiva, cierre exclusivo.
 */
export function getOpenStatus(days: ScheduleDayRow[], now: Date): OpenStatus {
  if (days.length === 0) return { kind: 'no_schedule' }
  const byDay = new Map(days.map((d) => [d.day_of_week, d]))
  const { dayIdx, minutes } = limaParts(now)

  // Spillover: un turno de AYER que cruza medianoche cubre la madrugada de hoy,
  // aunque la fila de HOY esté cerrada.
  const yesterday = (dayIdx + 6) % 7
  for (const sh of shiftsOf(byDay.get(yesterday))) {
    if (crossesMidnight(sh) && minutes < sh.end) return { kind: 'open', closesAt: sh.endLabel }
  }
  // Turnos de hoy (lado mismo-día; un turno que cruza cubre [start, 24:00)).
  for (const sh of shiftsOf(byDay.get(dayIdx))) {
    const sameDayEnd = crossesMidnight(sh) ? DAY_MIN : sh.end
    if (minutes >= sh.start && minutes < sameDayEnd) return { kind: 'open', closesAt: sh.endLabel }
  }

  // Cerrado: próxima apertura. offset 0 = hoy (solo turnos que aún no empiezan);
  // offset 7 = el mismo día de la próxima semana (wrap con un solo día configurado).
  for (let offset = 0; offset <= 7; offset++) {
    const candidates = shiftsOf(byDay.get((dayIdx + offset) % 7))
      .filter((sh) => offset !== 0 || sh.start > minutes)
      .sort((a, b) => a.start - b.start)
    const next = candidates[0]
    if (next) return { kind: 'closed', opensAt: next.startLabel, opensToday: offset === 0 }
  }
  return { kind: 'closed', opensAt: null, opensToday: false }
}
