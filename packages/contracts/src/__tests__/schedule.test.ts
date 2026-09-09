import { describe, expect, it } from 'vitest'
import {
  currentShift,
  declarationIsStale,
  getOpenStatus,
  hasLaterShiftToday,
  minutesSinceLastShiftEnd,
  type ScheduleDayRow,
} from '../schedule'

// Lima = UTC-5 fijo (sin DST): los instantes se escriben con offset explícito.
// Semana de referencia: 2026-07-06 (lunes) .. 2026-07-12 (domingo).
const MON = '2026-07-06'
const TUE = '2026-07-07'
const WED = '2026-07-08'
const SAT = '2026-07-11'
const SUN = '2026-07-12'

const at = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`)

/** Fila con defaults: abierto, turno único 18:00–23:00. day_of_week 0=Lunes..6=Domingo. */
const day = (dayOfWeek: number, patch: Partial<ScheduleDayRow> = {}): ScheduleDayRow => ({
  day_of_week: dayOfWeek,
  is_open: true,
  shift1_start: '18:00',
  shift1_end: '23:00',
  shift2_start: null,
  shift2_end: null,
  ...patch,
})

describe('getOpenStatus', () => {
  it('sin filas → no_schedule (negocio sin horario = siempre abierto, sin UI)', () => {
    expect(getOpenStatus([], at(MON, '20:00'))).toEqual({ kind: 'no_schedule' })
  })

  it('abierto dentro del turno', () => {
    expect(getOpenStatus([day(0)], at(MON, '20:00'))).toEqual({ kind: 'open', closesAt: '23:00' })
  })

  it('borde de apertura inclusivo [start, end)', () => {
    expect(getOpenStatus([day(0)], at(MON, '18:00')).kind).toBe('open')
  })

  it('borde de cierre exclusivo [start, end)', () => {
    expect(getOpenStatus([day(0)], at(MON, '23:00')).kind).toBe('closed')
  })

  it('1 minuto antes de abrir → closed con opensAt de hoy', () => {
    expect(getOpenStatus([day(0)], at(MON, '17:59'))).toEqual({
      kind: 'closed',
      opensAt: '18:00',
      opensToday: true,
    })
  })

  it('tras el cierre, abre mañana → opensToday false', () => {
    expect(getOpenStatus([day(0), day(1)], at(MON, '23:30'))).toEqual({
      kind: 'closed',
      opensAt: '18:00',
      opensToday: false,
    })
  })

  it('tras el cierre con UN solo día configurado → próxima semana, mismo día (wrap offset 7)', () => {
    expect(getOpenStatus([day(0)], at(MON, '23:30'))).toEqual({
      kind: 'closed',
      opensAt: '18:00',
      opensToday: false,
    })
  })

  it('is_open=false manda sobre las horas definidas', () => {
    expect(getOpenStatus([day(0, { is_open: false })], at(MON, '20:00')).kind).toBe('closed')
  })

  describe('dos turnos (el editor pre-rellena el 2º ANTES del 1º: s1 18–23, s2 12–15)', () => {
    const twoShifts = [day(0, { shift2_start: '12:00', shift2_end: '15:00' })]

    it('dentro del turno del mediodía', () => {
      expect(getOpenStatus(twoShifts, at(MON, '13:00'))).toEqual({
        kind: 'open',
        closesAt: '15:00',
      })
    })

    it('en el hueco entre turnos → opensAt del turno de la noche', () => {
      expect(getOpenStatus(twoShifts, at(MON, '16:00'))).toEqual({
        kind: 'closed',
        opensAt: '18:00',
        opensToday: true,
      })
    })

    it('antes de ambos turnos → opensAt del más temprano', () => {
      expect(getOpenStatus(twoShifts, at(MON, '11:00'))).toEqual({
        kind: 'closed',
        opensAt: '12:00',
        opensToday: true,
      })
    })

    it('borde exacto del fin del primer turno del día → cerrado (hueco)', () => {
      expect(getOpenStatus(twoShifts, at(MON, '15:00'))).toEqual({
        kind: 'closed',
        opensAt: '18:00',
        opensToday: true,
      })
    })
  })

  describe('cruce de medianoche (sábado 20:00–02:00; day_of_week 5=Sábado, 6=Domingo)', () => {
    const satNight = [day(5, { shift1_start: '20:00', shift1_end: '02:00' })]

    it('lado noche del mismo día', () => {
      expect(getOpenStatus(satNight, at(SAT, '23:59'))).toEqual({
        kind: 'open',
        closesAt: '02:00',
      })
    })

    it('madrugada del día siguiente (cubierta por el turno del sábado)', () => {
      expect(getOpenStatus(satNight, at(SUN, '01:00'))).toEqual({
        kind: 'open',
        closesAt: '02:00',
      })
    })

    it('borde del fin del cruce → cerrado', () => {
      expect(getOpenStatus(satNight, at(SUN, '02:00')).kind).toBe('closed')
    })

    it('spillover aplica aunque el día siguiente esté is_open=false', () => {
      const sched = [
        day(5, { shift1_start: '20:00', shift1_end: '02:00' }),
        day(6, { is_open: false }),
      ]
      expect(getOpenStatus(sched, at(SUN, '01:00')).kind).toBe('open')
    })

    it('día anterior cerrado (is_open=false) NO genera spillover', () => {
      const sched = [day(5, { is_open: false, shift1_start: '20:00', shift1_end: '02:00' })]
      const res = getOpenStatus(sched, at(SUN, '01:00'))
      expect(res).toEqual({ kind: 'closed', opensAt: null, opensToday: false })
    })

    it('start == end se trata como cruce (regla del editor: end <= start) → cobertura 24h', () => {
      // Martes 18:00–18:00 cubre [mar 18:00, mié 18:00).
      const sched = [day(1, { shift1_start: '18:00', shift1_end: '18:00' })]
      expect(getOpenStatus(sched, at(WED, '10:00')).kind).toBe('open')
    })

    it('turno 2 que cruza medianoche (la columna crosses_midnight solo mira el turno 1)', () => {
      const sched = [
        day(0, {
          shift1_start: '12:00',
          shift1_end: '15:00',
          shift2_start: '22:00',
          shift2_end: '01:00',
        }),
      ]
      expect(getOpenStatus(sched, at(TUE, '00:30'))).toEqual({ kind: 'open', closesAt: '01:00' })
    })
  })

  it('todos los días cerrados → opensAt null', () => {
    const sched = Array.from({ length: 7 }, (_, d) => day(d, { is_open: false }))
    expect(getOpenStatus(sched, at(MON, '20:00'))).toEqual({
      kind: 'closed',
      opensAt: null,
      opensToday: false,
    })
  })

  it('is_open=true con turnos null → día sin atención, sin throw', () => {
    const sched = [day(0, { shift1_start: null, shift1_end: null })]
    expect(getOpenStatus(sched, at(MON, '20:00'))).toEqual({
      kind: 'closed',
      opensAt: null,
      opensToday: false,
    })
  })

  it('filas dispersas: hoy sin fila → opensAt del próximo día configurado', () => {
    const sched = [day(4), day(5)] // solo viernes y sábado
    expect(getOpenStatus(sched, at(WED, '20:00'))).toEqual({
      kind: 'closed',
      opensAt: '18:00',
      opensToday: false,
    })
  })

  it('domingo usa el índice 6 (mata el bug de Date.getDay, que usa 0=Domingo)', () => {
    const sched = [day(6, { shift1_start: '10:00', shift1_end: '14:00' })]
    expect(getOpenStatus(sched, at(SUN, '11:00'))).toEqual({ kind: 'open', closesAt: '14:00' })
  })

  it('wrap semanal: domingo por la noche, solo lunes configurado', () => {
    expect(getOpenStatus([day(0)], at(SUN, '23:30'))).toEqual({
      kind: 'closed',
      opensAt: '18:00',
      opensToday: false,
    })
  })

  it('timezone: el instante se evalúa en America/Lima, no en UTC', () => {
    // 2026-07-07T02:00:00Z = lunes 21:00 en Lima (martes 02:00 UTC).
    const utcNow = new Date('2026-07-07T02:00:00Z')
    expect(getOpenStatus([day(0)], utcNow)).toEqual({ kind: 'open', closesAt: '23:00' })
  })
})

describe('getOpenStatus · apertura declarada del día', () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d))

  it('dentro del horario pero sin confirmar → cerrado, con motivo', () => {
    // El caso del jueves sin luz: el horario dice que atiende, pero nadie
    // levantó la persiana.
    expect(getOpenStatus(week, at(MON, '20:00'), false)).toEqual({
      kind: 'closed',
      opensAt: null,
      opensToday: false,
      reason: 'not_confirmed',
    })
  })

  it('dentro del horario y confirmado → abierto', () => {
    expect(getOpenStatus(week, at(MON, '20:00'), true)).toEqual({
      kind: 'open',
      closesAt: '23:00',
    })
  })

  it('sin dato de confirmación manda solo el horario', () => {
    // `undefined` (llamada antigua) y `null` (consulta fallida) no pueden
    // cerrar a nadie: un fallo transitorio dejaría al negocio sin vender.
    expect(getOpenStatus(week, at(MON, '20:00')).kind).toBe('open')
    expect(getOpenStatus(week, at(MON, '20:00'), null).kind).toBe('open')
  })

  it('fuera del horario, confirmar no abre nada', () => {
    const status = getOpenStatus(week, at(MON, '15:00'), true)
    expect(status.kind).toBe('closed')
    // Sin `reason`: el cierre se explica por el horario y no necesita etiqueta.
    if (status.kind === 'closed') expect(status.reason).toBeUndefined()
  })

  it('sin horario configurado la confirmación no aplica', () => {
    expect(getOpenStatus([], at(MON, '20:00'), false)).toEqual({ kind: 'no_schedule' })
  })
})

/**
 * EL SÁBADO DE LA FLORENCIA, que es el caso real y no un supuesto.
 *
 * Horario de producción: turno de mediodía 11:00–15:00 y turno de noche
 * 18:00–23:00. Los sábados el negocio confirmaba su apertura a las 19:52, 20:17
 * y 21:30 —contra las 18:13/18:14/18:22 de los días de un solo turno— porque
 * nadie le preguntaba otra vez al empezar el segundo turno.
 */
const laFlorenciaSabado: ScheduleDayRow[] = [
  day(4, { shift1_start: '18:00', shift1_end: '23:15' }),
  day(5, {
    shift1_start: '11:00',
    shift1_end: '15:00',
    shift2_start: '18:00',
    shift2_end: '23:00',
  }),
  day(6, { shift1_start: '11:00', shift1_end: '15:00' }),
]

describe('currentShift · nombrar el turno que corre', () => {
  it('distingue el de mediodía del de la noche el mismo sábado', () => {
    expect(currentShift(laFlorenciaSabado, at(SAT, '12:00'))).toEqual({
      startLabel: '11:00',
      endLabel: '15:00',
    })
    expect(currentShift(laFlorenciaSabado, at(SAT, '19:00'))).toEqual({
      startLabel: '18:00',
      endLabel: '23:00',
    })
  })

  it('en el hueco entre turnos no hay turno', () => {
    expect(currentShift(laFlorenciaSabado, at(SAT, '16:30'))).toBeNull()
  })

  it('el turno que cruza medianoche sigue siendo el de anoche', () => {
    const cruzando = [day(0, { shift1_start: '18:00', shift1_end: '01:00' })]
    expect(currentShift(cruzando, at(TUE, '00:30'))).toEqual({
      startLabel: '18:00',
      endLabel: '01:00',
    })
  })

  it('sin horario no hay turno que nombrar', () => {
    expect(currentShift([], at(SAT, '19:00'))).toBeNull()
  })
})

describe('declarationIsStale · volver a preguntar al empezar el segundo turno', () => {
  const declaradaA = (fecha: string, hora: string) => at(fecha, hora)
  /** Semana de un solo turno diario, 18:00-23:00: el resto de días del piloto. */
  const unSoloTurno = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d))

  it('LO QUE SE DIJO AL MEDIODÍA NO RESPONDE POR LA NOCHE', () => {
    // El caso que costó las noches de sábado: abrió a las 11:05 y cerró a las
    // 14:55. A las 18:00 el panel tiene que volver a preguntar.
    const alAbrirLaNoche = at(SAT, '18:00')
    expect(declarationIsStale(laFlorenciaSabado, alAbrirLaNoche, declaradaA(SAT, '11:05'))).toBe(
      true,
    )
    expect(declarationIsStale(laFlorenciaSabado, alAbrirLaNoche, declaradaA(SAT, '14:55'))).toBe(
      true,
    )
  })

  it('lo declarado ya dentro del turno de noche vale toda la noche', () => {
    expect(declarationIsStale(laFlorenciaSabado, at(SAT, '22:30'), declaradaA(SAT, '18:04'))).toBe(
      false,
    )
  })

  it('adelantarse no se castiga: confirmar a las 17:55 vale para las 18:00', () => {
    // Se mide contra el FIN del turno anterior (15:00), no contra el inicio del
    // actual: si no, el que confirma cinco minutos antes recibe la pregunta otra
    // vez cinco minutos después.
    expect(declarationIsStale(laFlorenciaSabado, at(SAT, '18:05'), declaradaA(SAT, '17:55'))).toBe(
      false,
    )
  })

  it('un día de un solo turno se pregunta una vez y no vuelve a molestar', () => {
    // Lunes 18:00–23:00: confirmó a las 18:13 y a las 22:00 sigue valiendo.
    expect(declarationIsStale(unSoloTurno, at(MON, '22:00'), declaradaA(MON, '18:13'))).toBe(false)
  })

  it('lo de ayer no vale para hoy', () => {
    expect(declarationIsStale(unSoloTurno, at(TUE, '19:00'), declaradaA(MON, '18:13'))).toBe(true)
  })

  it('sin horario configurado nunca se vuelve a preguntar', () => {
    // Ese negocio no tiene turnos que distinguir; repetir la pregunta sería
    // ruido sin información.
    expect(declarationIsStale([], at(SAT, '19:00'), declaradaA(SAT, '11:00'))).toBe(false)
  })
})

describe('minutesSinceLastShiftEnd · la frontera de validez', () => {
  it('el sábado a las 18:30 el turno anterior acabó hace tres horas y media', () => {
    expect(minutesSinceLastShiftEnd(laFlorenciaSabado, at(SAT, '18:30'))).toBe(210)
  })

  it('el sábado a mediodía la frontera es el turno del viernes', () => {
    // Viernes (day_of_week 4) cierra a las 23:15; el sábado a las 12:00 son
    // 12h45m = 765 minutos.
    expect(minutesSinceLastShiftEnd(laFlorenciaSabado, at(SAT, '12:00'))).toBe(765)
  })

  it('sin horario no hay frontera', () => {
    expect(minutesSinceLastShiftEnd([], at(SAT, '12:00'))).toBeNull()
  })
})

describe('hasLaterShiftToday · cerrar un turno no es cerrar el día', () => {
  it('el sábado a mediodía todavía queda la noche', () => {
    expect(hasLaterShiftToday(laFlorenciaSabado, at(SAT, '12:00'))).toBe(true)
  })

  it('el sábado por la noche ya no queda nada: eso sí cierra el día', () => {
    expect(hasLaterShiftToday(laFlorenciaSabado, at(SAT, '19:00'))).toBe(false)
  })

  it('el domingo, de un solo turno, cerrar es cerrar el día', () => {
    expect(hasLaterShiftToday(laFlorenciaSabado, at(SUN, '12:00'))).toBe(false)
  })

  it('sin horario no hay turnos que queden', () => {
    expect(hasLaterShiftToday([], at(SAT, '12:00'))).toBe(false)
  })
})
