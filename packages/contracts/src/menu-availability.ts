/**
 * FRANJA HORARIA DE UN PLATO. «El ceviche solo se sirve sábados y domingos de
 * 11:00 a 15:00.»
 *
 * La Florencia sirve dos cartas: mediodía los sábados y domingos (11:00–15:00)
 * y noche el resto. Hasta la migración que trajo estas columnas eso no se podía
 * decir, y el coste está escrito en prod: sus 11 platos de PESCADOS Y MARISCOS
 * y los 2 de RECOMENDACIÓN DEL CHEF llevaban desde el 7 de septiembre de 2026
 * con `is_available = false` — invisibles las 24 horas de los 7 días— porque
 * encenderlos el sábado a las 11:00 y apagarlos a las 15:00 son 26 toques de
 * switch por fin de semana y nadie los da.
 *
 * DOS HECHOS DISTINTOS, DOS COLUMNAS DISTINTAS. `is_available` significa «se
 * acabó» y lo pone la cajera a mano; la franja significa «no es su turno» y es
 * una regla. La disponibilidad efectiva es la AND de las dos. Si compartieran
 * columna —que es lo que haría un cron que apaga platos a las 15:00— el cambio
 * de turno borraría el «se acabó el ceviche» que la cajera puso a las 12:30.
 * Por eso esto se DERIVA en lectura y no hay ningún proceso que escriba nada.
 *
 * Convención de días: **0=Lunes..6=Domingo**, la de `business_schedule` y de
 * `schedule.ts`. NO es `Date.getDay()`, que cuenta desde el domingo. Aquí nunca
 * se usa getDay: el día sale de `limaParts`, en `America/Lima`.
 *
 * FAIL-OPEN EN TODO. Un campo ausente, un array vacío, una hora ilegible o un
 * día fuera de rango hacen que el plato se vea, nunca que desaparezca. Esconder
 * un plato por un dato roto es una venta perdida que nadie llega a diagnosticar.
 */

import {
  DAY_MIN,
  limaParts,
  parseTimeToMinutes,
  type ScheduleDayRow,
  shiftsForDay,
} from './schedule'

/**
 * La franja de un plato, tal como vive en `menu_items`. Los tres campos en
 * `null` —lo que tienen todos los platos que nunca se tocaron— significa
 * «disponible siempre que el local esté abierto».
 *
 * Una franja NO amplía el horario: se intersecta con él. El local cerrado ya
 * bloquea el pedido entero, así que un plato con franja de mediodía en un día
 * que el negocio no abre no se vende igualmente.
 */
export interface ItemAvailabilityWindow {
  /** 0=Lunes..6=Domingo. `null` o vacío = todos los días. */
  days: number[] | null
  /** 'HH:MM' o 'HH:MM:SS' (columna `time`). `null` = desde que abre. */
  from: string | null
  /** `null` = hasta que cierra. */
  to: string | null
}

const DAY_LABELS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const

/**
 * Los días que la franja restringe de verdad, o `null` si no restringe ninguno.
 *
 * Devuelve `null` tanto para un array vacío como para los siete días marcados:
 * en los dos casos la franja no discrimina por día, y tratarlos igual evita que
 * un array vacío escrito por error deje un plato sin días válidos y por tanto
 * invisible para siempre.
 */
function effectiveDays(days: number[] | null | undefined): number[] | null {
  if (!days || days.length === 0) return null
  const uniq = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  )
  if (uniq.length === 0 || uniq.length === 7) return null
  return uniq
}

/**
 * La franja en minutos desde medianoche, o `null` si no hay hora que valga.
 *
 * Hace falta que estén las DOS horas: con media franja («desde las 11:00» sin
 * hasta) no se puede saber cuándo acaba, y se prefiere ignorar la hora y
 * respetar los días a inventarse un final.
 */
function timeSpan(window: ItemAvailabilityWindow): { start: number; span: number } | null {
  const from = parseTimeToMinutes(window.from)
  const to = parseTimeToMinutes(window.to)
  if (from === null || to === null) return null
  // `to <= from` = cruza medianoche, la misma regla que `crossesMidnight` usa
  // para los turnos. Incluye el caso `to == from`, que son 24 horas.
  return { start: from, span: (to <= from ? to + DAY_MIN : to) - from }
}

/**
 * ¿Se sirve este plato en el instante `now`?
 *
 * `graceMinutes` estira SOLO el cierre. Cubre al cliente que pulsó «Pedir» a
 * las 14:59:50 y cuyo pedido entra a las 15:00:02: rechazarlo sería un pedido
 * perdido por dos segundos. No estira la apertura, porque pedir ceviche a las
 * 10:50 no es un accidente que haya que perdonar: la cocina todavía no lo tiene.
 *
 * Semántica `[from, to)`, la de los turnos: la hora de apertura entra, la de
 * cierre no.
 */
export function isWithinWindow(
  window: ItemAvailabilityWindow | null | undefined,
  now: Date,
  graceMinutes = 0,
): boolean {
  if (!window) return true

  const days = effectiveDays(window.days)
  const span = timeSpan(window)

  // Sin días y sin horas no hay restricción: el plato se sirve siempre.
  if (days === null && span === null) return true

  const { dayIdx, minutes } = limaParts(now)

  // Solo días: cualquier hora de esos días.
  if (span === null) return days?.includes(dayIdx) ?? false

  const end = span.start + span.span + graceMinutes

  // La ventana pertenece al día en que EMPIEZA, igual que un turno: un sábado
  // 22:00–02:00 cubre la madrugada del domingo aunque el domingo no esté
  // marcado. De ahí el paso por ayer — que también recoge un margen de gracia
  // que se pasa de medianoche.
  for (const back of [0, 1]) {
    const day = (dayIdx - back + 7) % 7
    if (days !== null && !days.includes(day)) continue
    const mins = minutes + back * DAY_MIN
    if (mins >= span.start && mins < end) return true
  }
  return false
}

const label = (day: number): string => DAY_LABELS[day] ?? ''

/** Agrupa días ya ordenados en rachas consecutivas: [0,1,2,4] → [[0,1,2],[4]]. */
function runsOf(days: number[]): number[][] {
  const runs: number[][] = []
  for (const day of days) {
    const last = runs[runs.length - 1]
    const tail = last?.[last.length - 1]
    if (last && tail !== undefined && day === tail + 1) last.push(day)
    else runs.push([day])
  }
  return runs
}

/** 'sáb y dom', 'lun a vie', 'lun a mié y vie'. Las rachas de 3+ se colapsan. */
function describeDays(days: number[]): string {
  const tokens: string[] = []
  for (const run of runsOf(days)) {
    const first = run[0]
    const last = run[run.length - 1]
    if (first === undefined || last === undefined) continue
    // Un rango de dos («lun a mar») no ahorra nada y se lee peor que «lun y mar».
    if (run.length >= 3) tokens.push(`${label(first)} a ${label(last)}`)
    else for (const day of run) tokens.push(label(day))
  }
  const ultimo = tokens[tokens.length - 1]
  if (tokens.length <= 1 || ultimo === undefined) return tokens.join(', ')
  return `${tokens.slice(0, -1).join(', ')} y ${ultimo}`
}

/** 'HH:MM:SS' → 'HH:MM'. Los segundos de una columna `time` no se muestran. */
function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * La franja en una frase, o `null` si el plato no tiene restricción.
 *
 * UNA SOLA FUENTE PARA LAS DOS CARAS. Lo lee el cliente en la card del plato
 * —donde sustituye al «Agotado» que mentía: el ceviche no se acabó, es que no es
 * su turno, y el cliente necesita saber cuándo volver— y lo lee la cajera en el
 * panel para comprobar que configuró lo que quería.
 */
export function describeWindow(window: ItemAvailabilityWindow | null | undefined): string | null {
  if (!window) return null
  const days = effectiveDays(window.days)
  const span = timeSpan(window)
  if (days === null && span === null) return null

  const horas = span ? `de ${hhmm(span.start)} a ${hhmm((span.start + span.span) % DAY_MIN)}` : null
  const dias = days ? describeDays(days) : null

  if (dias && horas) return `Solo ${dias}, ${horas}`
  return `Solo ${dias ?? horas}`
}

/**
 * LA FRONTERA ENTRE MEDIODÍA Y NOCHE, EN MINUTOS.
 *
 * Un turno que empieza antes es de mediodía; desde ahí, de noche. No está en
 * `app_settings` porque no decide nada operativo: no mueve dinero, ni tiempos,
 * ni el estado de un pedido. Solo AGRUPA los turnos del horario para ofrecer el
 * atajo correcto, y si alguna vez agrupara mal, el peor caso es que la cajera
 * tenga que marcar los días a mano — que es lo que hacía antes de existir.
 */
export const DAYPART_SPLIT_MIN = 16 * 60

/**
 * A partir de aquí un turno cubre «prácticamente todo el día» y ya no
 * discrimina nada, así que no da pie a un atajo. 20 horas deja fuera el
 * 00:00–23:59 de quien usa el horario para decir «siempre» y deja dentro
 * cualquier jornada de verdad, por larga que sea.
 */
const NEARLY_ALL_DAY_MIN = 20 * 60

/** Un atajo para rellenar la franja de un plato, sacado del horario del negocio. */
export interface DaypartPreset {
  kind: 'midday' | 'night'
  window: ItemAvailabilityWindow
}

/**
 * LOS ATAJOS, DERIVADOS DEL HORARIO QUE EL NEGOCIO YA TIENE PUESTO.
 *
 * La Florencia tiene que marcar los 13 platos de mariscos como carta de
 * mediodía y una veintena de la carta de noche como lo contrario. Teclear
 * «18:00» y «23:30» veinticinco veces invita a una errata que no da la cara
 * hasta que un cliente no ve un plato, así que los atajos se calculan de su
 * propio horario: con el de prod salen «sáb y dom de 11:00 a 15:00» y «lun a
 * sáb de 18:00 a 23:30».
 *
 * Rellenan el formulario y se guardan en las columnas del plato, así que
 * cambiar el horario después NO mueve las franjas ya puestas — solo cambia lo
 * que el atajo propone la próxima vez. Es deliberado: una carta no se reordena
 * a espaldas de nadie porque el sábado se cierre un cuarto de hora antes.
 *
 * Las horas se ensanchan al turno más amplio de su grupo (la apertura más
 * temprana y el cierre más tardío), porque una franja más estrecha que el turno
 * escondería el plato en los minutos que sobran, y ahí sí está abierto.
 */
export function deriveDayparts(scheduleDays: ScheduleDayRow[]): DaypartPreset[] {
  const buckets: Record<'midday' | 'night', { days: number[]; start: number; end: number } | null> =
    { midday: null, night: null }

  for (let day = 0; day <= 6; day++) {
    for (const shift of shiftsForDay(scheduleDays, day)) {
      const span = timeSpan({ days: null, from: shift.startLabel, to: shift.endLabel })
      if (!span) continue
      const kind = span.start < DAYPART_SPLIT_MIN ? 'midday' : 'night'
      const acc = buckets[kind]
      const end = span.start + span.span
      if (!acc) {
        buckets[kind] = { days: [day], start: span.start, end }
        continue
      }
      if (!acc.days.includes(day)) acc.days.push(day)
      acc.start = Math.min(acc.start, span.start)
      acc.end = Math.max(acc.end, end)
    }
  }

  const out: DaypartPreset[] = []
  for (const kind of ['midday', 'night'] as const) {
    const acc = buckets[kind]
    if (!acc) continue
    // UN ATAJO QUE NO RESTRINGE NADA NO SE OFRECE. Un negocio abierto de 00:00 a
    // 23:59 —una forma normal de decir «siempre»— generaría un «Solo al
    // mediodía, de 00:00 a 23:59» que es falso de cabo a rabo: ni es mediodía ni
    // es «solo». Se ve en el mundo e2e, cuyo horario es exactamente ese.
    if (acc.end - acc.start >= NEARLY_ALL_DAY_MIN) continue
    out.push({
      kind,
      window: {
        days: acc.days.sort((a, b) => a - b),
        from: hhmm(acc.start),
        to: hhmm(acc.end % DAY_MIN),
      },
    })
  }
  return out
}

/**
 * Los días de la franja en los que el negocio NO tiene ningún turno que la
 * cubra. Vacío = la franja cabe en el horario.
 *
 * AVISA, NO BLOQUEA. El editor del panel lo usa para decir «los domingos
 * cierras a las 15:00, este plato no se vería después», pero configurar la
 * franja antes de cambiar el horario es una secuencia legítima y no se puede
 * prohibir. Sin horario configurado no se juzga nada: no hay con qué.
 */
export function windowFitsSchedule(
  window: ItemAvailabilityWindow | null | undefined,
  scheduleDays: ScheduleDayRow[],
): number[] {
  if (!window || scheduleDays.length === 0) return []
  const days = effectiveDays(window.days) ?? [0, 1, 2, 3, 4, 5, 6]
  const span = timeSpan(window)
  const out: number[] = []

  for (const day of days) {
    const shifts = shiftsForDay(scheduleDays, day)
    // Día cerrado (o sin turnos legibles): la franja no se sirve nunca ahí.
    if (shifts.length === 0) {
      out.push(day)
      continue
    }
    // Sin horas basta con que el día abra; no hay franja que comparar.
    if (span === null) continue

    const end = span.start + span.span
    const solapa = shifts.some((sh) => {
      const shSpan = timeSpan({ days: null, from: sh.startLabel, to: sh.endLabel })
      if (!shSpan) return false
      return span.start < shSpan.start + shSpan.span && shSpan.start < end
    })
    if (!solapa) out.push(day)
  }
  return out
}
