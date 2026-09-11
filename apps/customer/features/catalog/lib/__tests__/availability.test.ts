import { describe, expect, it } from 'vitest'
import { itemWindowState } from '../availability'

// Lima = UTC-5 fijo. Semana de referencia: 2026-07-06 (lunes) .. 2026-07-12 (domingo).
const at = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`)
const TUE = '2026-07-07'
const SAT = '2026-07-11'

/** La carta de mediodía de La Florencia, tal como llega de la API. */
const CEVICHE = { available_days: [5, 6], available_from: '11:00:00', available_to: '15:00:00' }

describe('itemWindowState', () => {
  it('un plato sin franja nunca dice nada', () => {
    const state = itemWindowState(
      { available_days: null, available_from: null, available_to: null },
      at(TUE, '20:00'),
    )
    expect(state).toEqual({ outOfWindow: false, label: null })
  })

  it('campos ausentes (api vieja) = sin franja', () => {
    expect(itemWindowState({}, at(TUE, '20:00'))).toEqual({ outOfWindow: false, label: null })
  })

  it('fuera de su turno: bloquea Y dice cuándo volver', () => {
    expect(itemWindowState(CEVICHE, at(TUE, '20:00'))).toEqual({
      outOfWindow: true,
      label: 'Solo sáb y dom, de 11:00 a 15:00',
    })
  })

  it('DENTRO de su turno no dice nada, aunque tenga franja', () => {
    // Anunciar «Solo sáb y dom» un sábado a mediodía, con el plato pedible,
    // solo siembra la duda de si se puede pedir.
    expect(itemWindowState(CEVICHE, at(SAT, '12:00'))).toEqual({
      outOfWindow: false,
      label: null,
    })
  })

  it('el sábado de noche SÍ bloquea: el sábado tiene dos turnos y este es del primero', () => {
    expect(itemWindowState(CEVICHE, at(SAT, '20:00')).outOfWindow).toBe(true)
  })

  it('recorta los segundos que manda PostgREST para una columna `time`', () => {
    expect(itemWindowState(CEVICHE, at(TUE, '20:00')).label).not.toContain(':00:00')
  })

  it('un plato que solo va de noche se bloquea al mediodía del sábado', () => {
    const hamburguesa = {
      available_days: [0, 1, 2, 3, 4, 5],
      available_from: '18:00:00',
      available_to: '23:30:00',
    }
    expect(itemWindowState(hamburguesa, at(SAT, '12:00'))).toEqual({
      outOfWindow: true,
      label: 'Solo lun a sáb, de 18:00 a 23:30',
    })
    expect(itemWindowState(hamburguesa, at(SAT, '20:00')).outOfWindow).toBe(false)
  })
})
