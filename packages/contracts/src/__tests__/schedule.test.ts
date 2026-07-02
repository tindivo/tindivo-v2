import { describe, expect, it } from 'vitest'
import { getOpenStatus, type ScheduleDayRow } from '../schedule'

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
