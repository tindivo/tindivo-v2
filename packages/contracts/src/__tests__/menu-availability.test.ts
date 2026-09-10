import { describe, expect, it } from 'vitest'
import {
  deriveDayparts,
  describeWindow,
  type ItemAvailabilityWindow,
  isWithinWindow,
  windowFitsSchedule,
} from '../menu-availability'
import type { ScheduleDayRow } from '../schedule'

// Lima = UTC-5 fijo (sin DST): los instantes se escriben con offset explícito.
// Semana de referencia: 2026-07-06 (lunes) .. 2026-07-12 (domingo), la misma de
// schedule.test.ts.
const MON = '2026-07-06'
const TUE = '2026-07-07'
const FRI = '2026-07-10'
const SAT = '2026-07-11'
const SUN = '2026-07-12'

const at = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`)

/** Sin restricción: lo que tienen hoy los 51 platos de prod. */
const SIEMPRE: ItemAvailabilityWindow = { days: null, from: null, to: null }

/** La carta de mediodía de La Florencia: sáb y dom, 11:00–15:00. */
const MEDIODIA: ItemAvailabilityWindow = { days: [5, 6], from: '11:00', to: '15:00' }

const win = (patch: Partial<ItemAvailabilityWindow>): ItemAvailabilityWindow => ({
  ...SIEMPRE,
  ...patch,
})

describe('isWithinWindow', () => {
  describe('sin restricción = siempre disponible', () => {
    it('los tres campos en null → true', () => {
      expect(isWithinWindow(SIEMPRE, at(TUE, '20:00'))).toBe(true)
    })

    it('null/undefined (plato viejo, API vieja) → true', () => {
      expect(isWithinWindow(null, at(TUE, '20:00'))).toBe(true)
      expect(isWithinWindow(undefined, at(TUE, '20:00'))).toBe(true)
    })

    it('los 7 días marcados y sin horas → true (no restringe nada)', () => {
      expect(isWithinWindow(win({ days: [0, 1, 2, 3, 4, 5, 6] }), at(TUE, '20:00'))).toBe(true)
    })
  })

  describe('la carta de mediodía (sáb y dom, 11:00–15:00)', () => {
    it('sábado a mediodía → true', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '12:00'))).toBe(true)
    })

    it('domingo a mediodía → true', () => {
      expect(isWithinWindow(MEDIODIA, at(SUN, '12:00'))).toBe(true)
    })

    it('borde de apertura inclusivo [from, to)', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '11:00'))).toBe(true)
      expect(isWithinWindow(MEDIODIA, at(SAT, '10:59'))).toBe(false)
    })

    it('borde de cierre exclusivo [from, to)', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '14:59'))).toBe(true)
      expect(isWithinWindow(MEDIODIA, at(SAT, '15:00'))).toBe(false)
    })

    it('sábado DE NOCHE → false (el sábado tiene dos turnos y este plato es del primero)', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '20:00'))).toBe(false)
    })

    it('martes a la misma hora → false (no es día de la franja)', () => {
      expect(isWithinWindow(MEDIODIA, at(TUE, '12:00'))).toBe(false)
    })

    it('martes de noche → false (el caso que hoy exige apagar 13 switches)', () => {
      expect(isWithinWindow(MEDIODIA, at(TUE, '20:00'))).toBe(false)
    })
  })

  describe('la dirección contraria: un plato que solo va de noche', () => {
    // La otra mitad del problema de La Florencia. Los 13 platos de mariscos son
    // solo de mediodía, pero parte de la carta de noche tampoco se sirve al
    // mediodía del sábado — y ahí el sábado está marcado en las DOS franjas, una
    // por turno. Que el mismo día pueda tener un plato de cada carta es
    // exactamente lo que `business_service_days` no sabe distinguir.
    const NOCHE: ItemAvailabilityWindow = { days: [0, 1, 2, 3, 4, 5], from: '18:00', to: '23:30' }

    it('lunes de noche → true', () => {
      expect(isWithinWindow(NOCHE, at(MON, '20:00'))).toBe(true)
    })

    it('sábado de noche → true, aunque el sábado también tenga turno de mediodía', () => {
      expect(isWithinWindow(NOCHE, at(SAT, '20:00'))).toBe(true)
    })

    it('sábado al MEDIODÍA → false (es el turno de la otra carta)', () => {
      expect(isWithinWindow(NOCHE, at(SAT, '12:00'))).toBe(false)
    })

    it('domingo de noche → false (el domingo La Florencia no abre de noche)', () => {
      expect(isWithinWindow(NOCHE, at(SUN, '20:00'))).toBe(false)
    })

    it('las dos cartas son complementarias en el sábado', () => {
      // Mediodía del sábado: entra el ceviche, no entra la hamburguesa.
      expect(isWithinWindow(MEDIODIA, at(SAT, '12:00'))).toBe(true)
      expect(isWithinWindow(NOCHE, at(SAT, '12:00'))).toBe(false)
      // Noche del sábado: al revés.
      expect(isWithinWindow(MEDIODIA, at(SAT, '20:00'))).toBe(false)
      expect(isWithinWindow(NOCHE, at(SAT, '20:00'))).toBe(true)
    })

    it('se describe con el rango de días colapsado', () => {
      expect(describeWindow(NOCHE)).toBe('Solo lun a sáb, de 18:00 a 23:30')
    })
  })

  describe('restricción parcial', () => {
    it('solo días, sin horas → todo el día en esos días', () => {
      const soloFinde = win({ days: [5, 6] })
      expect(isWithinWindow(soloFinde, at(SAT, '06:00'))).toBe(true)
      expect(isWithinWindow(soloFinde, at(SAT, '23:59'))).toBe(true)
      expect(isWithinWindow(soloFinde, at(FRI, '12:00'))).toBe(false)
    })

    it('solo horas, sin días → esa franja todos los días', () => {
      const soloTarde = win({ from: '11:00', to: '15:00' })
      expect(isWithinWindow(soloTarde, at(TUE, '12:00'))).toBe(true)
      expect(isWithinWindow(soloTarde, at(SAT, '12:00'))).toBe(true)
      expect(isWithinWindow(soloTarde, at(TUE, '20:00'))).toBe(false)
    })

    it('hora a medias (from sin to) → se ignora la hora, manda el día', () => {
      const aMedias = win({ days: [5, 6], from: '11:00', to: null })
      expect(isWithinWindow(aMedias, at(SAT, '20:00'))).toBe(true)
      expect(isWithinWindow(aMedias, at(TUE, '20:00'))).toBe(false)
    })
  })

  describe('cruce de medianoche (to <= from, la misma regla que los turnos)', () => {
    // La ventana pertenece al día en que EMPIEZA, igual que un turno de
    // business_schedule: un sábado 22:00–02:00 cubre la madrugada del domingo.
    const TRASNOCHE: ItemAvailabilityWindow = { days: [5], from: '22:00', to: '02:00' }

    it('la noche del propio día → true', () => {
      expect(isWithinWindow(TRASNOCHE, at(SAT, '23:00'))).toBe(true)
    })

    it('la madrugada del día siguiente, aunque ese día NO esté marcado → true', () => {
      expect(isWithinWindow(TRASNOCHE, at(SUN, '01:00'))).toBe(true)
    })

    it('pasado el final de la madrugada → false', () => {
      expect(isWithinWindow(TRASNOCHE, at(SUN, '02:00'))).toBe(false)
      expect(isWithinWindow(TRASNOCHE, at(SUN, '03:00'))).toBe(false)
    })

    it('antes de empezar → false', () => {
      expect(isWithinWindow(TRASNOCHE, at(SAT, '21:59'))).toBe(false)
    })
  })

  describe('margen de gracia', () => {
    it('extiende el cierre: 15:05 con 10 min de margen todavía entra', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '15:05'), 10)).toBe(true)
    })

    it('el margen también es exclusivo', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '15:10'), 10)).toBe(false)
    })

    it('NO adelanta la apertura (el fallo a cubrir es el del cliente que ya pulsó)', () => {
      expect(isWithinWindow(MEDIODIA, at(SAT, '10:55'), 10)).toBe(false)
    })

    it('un margen que cruza medianoche sigue contando', () => {
      const hastaMedianoche = win({ days: [5], from: '18:00', to: '23:59' })
      expect(isWithinWindow(hastaMedianoche, at(SUN, '00:05'), 10)).toBe(true)
    })
  })

  describe('zona horaria: el servidor puede correr en otra TZ', () => {
    it('un instante UTC que en Lima es el día anterior se juzga por Lima', () => {
      // 2026-07-12T03:00:00Z = sábado 11 a las 22:00 en Lima (domingo en UTC).
      const utcNow = new Date('2026-07-12T03:00:00Z')
      const sabadoNoche = win({ days: [5], from: '18:00', to: '23:00' })
      expect(isWithinWindow(sabadoNoche, utcNow)).toBe(true)
      // Y NO es domingo para la franja de domingo.
      expect(isWithinWindow(win({ days: [6], from: '18:00', to: '23:00' }), utcNow)).toBe(false)
    })
  })

  describe('fail-open: un dato roto nunca esconde un plato', () => {
    it('acepta el `time` de Postgres con segundos (11:00:00)', () => {
      const conSegundos = win({ days: [5, 6], from: '11:00:00', to: '15:00:00' })
      expect(isWithinWindow(conSegundos, at(SAT, '12:00'))).toBe(true)
      expect(isWithinWindow(conSegundos, at(TUE, '12:00'))).toBe(false)
    })

    it('array de días vacío → se trata como todos los días, no como ninguno', () => {
      expect(isWithinWindow(win({ days: [] }), at(TUE, '20:00'))).toBe(true)
    })

    it('hora ilegible → se ignora la hora en vez de esconder el plato', () => {
      expect(isWithinWindow(win({ from: 'media tarde', to: '15:00' }), at(TUE, '20:00'))).toBe(true)
    })

    it('día fuera de rango → se descarta ese día, no la franja entera', () => {
      expect(isWithinWindow(win({ days: [5, 6, 99] }), at(SAT, '12:00'))).toBe(true)
      expect(isWithinWindow(win({ days: [5, 6, 99] }), at(TUE, '12:00'))).toBe(false)
      // Si NO queda ningún día válido, vuelve a ser "siempre".
      expect(isWithinWindow(win({ days: [99] }), at(TUE, '12:00'))).toBe(true)
    })
  })
})

describe('describeWindow', () => {
  it('sin restricción → null (no hay nada que contarle a nadie)', () => {
    expect(describeWindow(SIEMPRE)).toBeNull()
    expect(describeWindow(null)).toBeNull()
  })

  it('la carta de mediodía, tal como la verá el cliente', () => {
    expect(describeWindow(MEDIODIA)).toBe('Solo sáb y dom, de 11:00 a 15:00')
  })

  it('solo días', () => {
    expect(describeWindow(win({ days: [5, 6] }))).toBe('Solo sáb y dom')
  })

  it('solo horas', () => {
    expect(describeWindow(win({ from: '11:00', to: '15:00' }))).toBe('Solo de 11:00 a 15:00')
  })

  it('los 7 días no se nombran: no aportan', () => {
    expect(describeWindow(win({ days: [0, 1, 2, 3, 4, 5, 6], from: '11:00', to: '15:00' }))).toBe(
      'Solo de 11:00 a 15:00',
    )
  })

  it('tres días o más seguidos se colapsan en un rango', () => {
    expect(describeWindow(win({ days: [0, 1, 2, 3, 4] }))).toBe('Solo lun a vie')
    expect(describeWindow(win({ days: [0, 1, 2] }))).toBe('Solo lun a mié')
  })

  it('dos días seguidos se nombran los dos', () => {
    expect(describeWindow(win({ days: [0, 1] }))).toBe('Solo lun y mar')
  })

  it('días sueltos se enumeran con coma y «y»', () => {
    expect(describeWindow(win({ days: [0, 2, 4] }))).toBe('Solo lun, mié y vie')
  })

  it('mezcla de rango y día suelto', () => {
    expect(describeWindow(win({ days: [0, 1, 2, 4] }))).toBe('Solo lun a mié y vie')
  })

  it('recorta los segundos del `time` de Postgres', () => {
    expect(describeWindow(win({ from: '11:00:00', to: '15:00:00' }))).toBe('Solo de 11:00 a 15:00')
  })

  it('una hora ilegible se omite en vez de mostrarse cruda', () => {
    expect(describeWindow(win({ days: [5, 6], from: 'media tarde', to: '15:00' }))).toBe(
      'Solo sáb y dom',
    )
  })
})

/** Fila de horario. day_of_week 0=Lunes..6=Domingo. */
const day = (dayOfWeek: number, patch: Partial<ScheduleDayRow> = {}): ScheduleDayRow => ({
  day_of_week: dayOfWeek,
  is_open: true,
  shift1_start: '18:00',
  shift1_end: '23:00',
  shift2_start: null,
  shift2_end: null,
  ...patch,
})

/**
 * El horario REAL de La Florencia en prod, leído el 2026-09-10. Los cierres
 * desiguales (23:00 / 23:15 / 23:30) son de verdad y son justo lo que hace que
 * los atajos no puedan agrupar por pares de horas idénticos.
 */
const LA_FLORENCIA: ScheduleDayRow[] = [
  day(0, { shift1_end: '23:30' }),
  day(1),
  day(2),
  day(3),
  day(4, { shift1_end: '23:15' }),
  day(5, {
    shift1_start: '11:00',
    shift1_end: '15:00',
    shift2_start: '18:00',
    shift2_end: '23:00',
  }),
  day(6, { shift1_start: '11:00', shift1_end: '15:00' }),
]

describe('deriveDayparts', () => {
  it('del horario real de La Florencia salen los dos atajos', () => {
    expect(deriveDayparts(LA_FLORENCIA)).toEqual([
      { kind: 'midday', window: { days: [5, 6], from: '11:00', to: '15:00' } },
      { kind: 'night', window: { days: [0, 1, 2, 3, 4, 5], from: '18:00', to: '23:30' } },
    ])
  })

  it('el atajo de noche se ensancha al cierre más tardío de la semana', () => {
    // Lunes cierra 23:30 y el resto antes: si el atajo propusiera 23:00, el
    // plato se escondería la última media hora del lunes, con el local abierto.
    const [, noche] = deriveDayparts(LA_FLORENCIA)
    expect(noche?.window.to).toBe('23:30')
  })

  it('lo que proponen los atajos cabe en el horario', () => {
    for (const preset of deriveDayparts(LA_FLORENCIA)) {
      expect(windowFitsSchedule(preset.window, LA_FLORENCIA)).toEqual([])
    }
  })

  it('un negocio solo de noche no ofrece atajo de mediodía', () => {
    const soloNoche = [day(0), day(1), day(2), day(3), day(4), day(5), day(6)]
    expect(deriveDayparts(soloNoche).map((p) => p.kind)).toEqual(['night'])
  })

  it('un día cerrado no aporta su turno al atajo', () => {
    const sinDomingo = [...LA_FLORENCIA.slice(0, 6), day(6, { is_open: false })]
    expect(deriveDayparts(sinDomingo)[0]?.window.days).toEqual([5])
  })

  it('sin horario no hay atajos que ofrecer', () => {
    expect(deriveDayparts([])).toEqual([])
  })

  it('un negocio abierto todo el día no ofrece atajos: no habría nada que restringir', () => {
    // Es el horario del mundo e2e y una forma normal de decir «siempre». Sin
    // este corte saldría un «Solo al mediodía, de 00:00 a 23:59» que es falso
    // en las dos mitades de la frase.
    const veinticuatroHoras = [0, 1, 2, 3, 4, 5, 6].map((d) =>
      day(d, { shift1_start: '00:00', shift1_end: '23:59' }),
    )
    expect(deriveDayparts(veinticuatroHoras)).toEqual([])
  })

  it('una jornada larga pero real sí da atajo', () => {
    const desayunoACena = [0, 1, 2, 3, 4].map((d) =>
      day(d, { shift1_start: '07:00', shift1_end: '23:00' }),
    )
    expect(deriveDayparts(desayunoACena)).toEqual([
      { kind: 'midday', window: { days: [0, 1, 2, 3, 4], from: '07:00', to: '23:00' } },
    ])
  })

  it('un turno que cruza medianoche cuenta como noche y no desborda la etiqueta', () => {
    const trasnoche = [day(0, { shift1_start: '20:00', shift1_end: '02:00' })]
    expect(deriveDayparts(trasnoche)).toEqual([
      { kind: 'night', window: { days: [0], from: '20:00', to: '02:00' } },
    ])
  })
})

describe('windowFitsSchedule', () => {
  it('la carta de mediodía cuadra con el horario real → sin días sueltos', () => {
    expect(windowFitsSchedule(MEDIODIA, LA_FLORENCIA)).toEqual([])
  })

  it('una franja de mediodía contra un negocio que solo abre de noche → avisa de los dos días', () => {
    const soloNoche = [day(5), day(6)]
    expect(windowFitsSchedule(MEDIODIA, soloNoche)).toEqual([5, 6])
  })

  it('un día que el negocio tiene cerrado se señala', () => {
    const sinDomingo = [...LA_FLORENCIA.slice(0, 6), day(6, { is_open: false })]
    expect(windowFitsSchedule(MEDIODIA, sinDomingo)).toEqual([6])
  })

  it('basta con que intersecte UNO de los dos turnos del día', () => {
    const nocheDelSabado = win({ days: [5], from: '19:00', to: '22:00' })
    expect(windowFitsSchedule(nocheDelSabado, LA_FLORENCIA)).toEqual([])
  })

  it('sin horas, basta con que el día tenga algún turno', () => {
    expect(windowFitsSchedule(win({ days: [5, 6] }), LA_FLORENCIA)).toEqual([])
  })

  it('sin horario configurado no se juzga nada (no se puede)', () => {
    expect(windowFitsSchedule(MEDIODIA, [])).toEqual([])
  })

  it('sin días marcados se revisan los siete', () => {
    const mediodiaTodaLaSemana = win({ from: '11:00', to: '15:00' })
    // Solo sábado y domingo tienen turno de mediodía.
    expect(windowFitsSchedule(mediodiaTodaLaSemana, LA_FLORENCIA)).toEqual([0, 1, 2, 3, 4])
  })
})
