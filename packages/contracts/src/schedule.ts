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
  | {
      kind: 'closed'
      opensAt: string | null
      opensToday: boolean
      /**
       * Presente solo cuando el cierre NO se explica por el horario: su horario
       * dice que abre, pero nadie del local ha confirmado que hoy atienden. El
       * cliente necesita ahí un mensaje distinto al de un día no laborable.
       *
       * Ausente = cerrado por horario, que es el caso normal y no necesita
       * etiqueta.
       */
      reason?: 'not_confirmed'
    }

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
 *
 * `openingConfirmed` es la declaración de la jornada (migración 0154). El
 * horario dice cuándo PODRÍA abrir; esto, si abrió. Con `false` el negocio
 * queda cerrado aunque el horario diga lo contrario, que es justo el caso del
 * día que no atienden y nadie se acordó de cambiar el horario semanal.
 *
 * `undefined`/`null` = no se sabe (llamada antigua o consulta fallida) y manda
 * solo el horario, para que un fallo transitorio no cierre a nadie.
 */
export function getOpenStatus(
  days: ScheduleDayRow[],
  now: Date,
  openingConfirmed?: boolean | null,
): OpenStatus {
  const byScheduleOnly = statusFromSchedule(days, now)

  // Sin horario configurado la confirmación no aplica: ese negocio no tiene
  // jornada que declarar y se sigue tratando como siempre abierto.
  if (byScheduleOnly.kind === 'no_schedule') return byScheduleOnly

  // Cerrado por horario: se devuelve tal cual, sin `reason`. Etiquetarlo no
  // aporta nada y cambiaría la forma del objeto para todos los consumidores.
  if (byScheduleOnly.kind === 'closed') return byScheduleOnly

  // Está dentro de su horario, pero hoy nadie ha levantado la persiana.
  if (openingConfirmed === false) {
    return { kind: 'closed', opensAt: null, opensToday: false, reason: 'not_confirmed' }
  }
  return byScheduleOnly
}

function statusFromSchedule(days: ScheduleDayRow[], now: Date): OpenStatus {
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

/**
 * EL TURNO, QUE NO ES EL DÍA. Y LA JORNADA, QUE TAMPOCO.
 *
 * `getOpenStatus` contesta "¿está abierto AHORA?" y con eso basta para el
 * cliente. Al panel del negocio le falta otra pregunta, y es la que costó dinero:
 * "¿esto que declaró la cajera sigue valiendo?".
 *
 * La declaración de apertura (`business_service_days`) lleva UNA FILA POR
 * `service_date`. La Florencia atiende los sábados en dos turnos —11:00 a 15:00
 * y 18:00 a 23:00— y esa fila no sabe distinguirlos: si a las 15:00 la cajera
 * pulsa «Cerrar por hoy», el sábado entero queda cerrado y el panel NO vuelve a
 * preguntar nada, porque el modal solo aparece cuando `status` es `null`.
 *
 * Lo que pasó en producción está en la propia tabla. Los días de un solo turno
 * el negocio confirma a las 18:13, 18:14, 18:21, 18:22, 18:25, 18:27 — o sea, en
 * cuanto abre. Los sábados confirma a las 19:52, 20:17 y 21:30: entre dos y tres
 * horas y media de local cerrado para el cliente porque nadie se percató. No es
 * que la cajera no quisiera abrir; es que nadie se lo preguntó.
 *
 * Estas funciones dan el vocabulario que faltaba, y viven aquí y no en el panel
 * porque son horario puro: mismo módulo, mismos turnos, mismos tests.
 */

/** Un turno tal como se guardó, con sus etiquetas `HH:MM`. */
export interface ShiftView {
  startLabel: string
  endLabel: string
}

/** Turnos de la última semana, medidos en minutos hacia atrás desde `now`. */
interface RelShift extends ShiftView {
  /** Minutos desde que empezó. Negativo = todavía no empieza. */
  startAgo: number
  /** Minutos desde que terminó. Negativo = todavía no termina. */
  endAgo: number
}

function shiftsBackFrom(days: ScheduleDayRow[], now: Date): RelShift[] {
  const byDay = new Map(days.map((d) => [d.day_of_week, d]))
  const { dayIdx, minutes } = limaParts(now)
  const out: RelShift[] = []
  // Ocho días hacia atrás: cubre la semana entera aunque solo haya un día
  // configurado, y de paso el turno de ayer que cruza medianoche.
  for (let back = 0; back <= 8; back++) {
    for (const sh of shiftsOf(byDay.get((dayIdx - back + 14) % 7))) {
      // Un turno que cruza medianoche termina al día siguiente: su fin se mide
      // sumándole el día, no recortándolo.
      const endMin = crossesMidnight(sh) ? sh.end + DAY_MIN : sh.end
      out.push({
        startAgo: minutes - sh.start + back * DAY_MIN,
        endAgo: minutes - endMin + back * DAY_MIN,
        startLabel: sh.startLabel,
        endLabel: sh.endLabel,
      })
    }
  }
  return out
}

/**
 * El turno que está corriendo AHORA, o `null` si el negocio está fuera de
 * horario. Semántica `[start, end)`, la misma que `getOpenStatus`.
 *
 * Lo usa el panel para poder NOMBRAR el turno en la pregunta de apertura: «tu
 * turno de la noche, 18:00 a 23:00» dice muchísimo más que «¿abren hoy?» a
 * alguien que ya abrió esta mañana.
 */
export function currentShift(days: ScheduleDayRow[], now: Date): ShiftView | null {
  const enCurso = shiftsBackFrom(days, now).find((sh) => sh.startAgo >= 0 && sh.endAgo < 0)
  return enCurso ? { startLabel: enCurso.startLabel, endLabel: enCurso.endLabel } : null
}

/**
 * Minutos desde que terminó el ÚLTIMO turno que ya acabó. `null` si no hay
 * ninguno en la última semana (negocio sin horario, o recién configurado).
 *
 * Es la frontera de validez de una declaración: lo que la cajera dijo DESPUÉS de
 * que acabara el turno anterior sigue hablando del turno de ahora. Lo que dijo
 * antes hablaba de otro turno, y ya no vale.
 */
export function minutesSinceLastShiftEnd(days: ScheduleDayRow[], now: Date): number | null {
  let masReciente: number | null = null
  for (const sh of shiftsBackFrom(days, now)) {
    if (sh.endAgo > 0 && (masReciente === null || sh.endAgo < masReciente)) {
      masReciente = sh.endAgo
    }
  }
  return masReciente
}

/**
 * ¿LA DECLARACIÓN DE APERTURA HABLA DE OTRO TURNO?
 *
 * `true` = hay que volver a preguntar. Ocurre exactamente cuando la cajera
 * declaró antes de que terminara el turno anterior al de ahora: el sábado a las
 * 18:00, lo que dijo a las 11:00 (o el «cerrar» de las 15:00) ya no responde a
 * la pregunta de si atienden esta noche.
 *
 * SE MIDE CONTRA EL FIN DEL TURNO ANTERIOR Y NO CONTRA EL INICIO DEL ACTUAL,
 * para no castigar a quien se adelanta: confirmar a las 17:55 tiene que valer
 * para el turno de las 18:00, no disparar la pregunta cinco minutos después.
 *
 * Sin horario configurado NUNCA es obsoleta: ese negocio no tiene turnos que
 * distinguir, y preguntarle dos veces sería ruido sin información.
 */
export function declarationIsStale(days: ScheduleDayRow[], now: Date, confirmedAt: Date): boolean {
  const desde = minutesSinceLastShiftEnd(days, now)
  if (desde === null) return false
  return (now.getTime() - confirmedAt.getTime()) / 60_000 > desde
}

/**
 * ¿QUEDA OTRO TURNO MÁS TARDE HOY?
 *
 * Lo pregunta el botón de cerrar del panel, que decía «Cerrar por hoy» también
 * el sábado a las 15:00 —con el turno de la noche entero por delante—. Cerrar un
 * turno y cerrar el día son dos cosas distintas y el botón tiene que saber cuál
 * está haciendo.
 *
 * «Hoy» es el día natural en Lima, no la jornada de servicio: lo que se está
 * decidiendo es si el local vuelve a levantar la persiana esta misma tarde, y
 * eso se lee en el reloj de la pared.
 */
export function hasLaterShiftToday(days: ScheduleDayRow[], now: Date): boolean {
  const { minutes } = limaParts(now)
  const quedaDeHoy = DAY_MIN - minutes
  return shiftsBackFrom(days, now).some((sh) => sh.startAgo < 0 && -sh.startAgo < quedaDeHoy)
}
