import { describe, expect, it } from 'vitest'
import { crearTestigoDeVigencia } from '../use-latest-request'

/**
 * Se prueba la parte PURA (`crearTestigoDeVigencia`) y no el hook: en este
 * workspace no hay renderer de React —no existe `@testing-library/react` en
 * ninguna app— y meterlo para tres líneas de `useRef` sería el andamio más caro
 * que lo andamiado. Lo que el hook añade encima es no recrear el testigo, y eso
 * lo cubre el e2e del historial, que es donde de verdad se rompía.
 */
describe('crearTestigoDeVigencia', () => {
  it('la primera petición deja de ser vigente en cuanto se abre otra', () => {
    const abrir = crearTestigoDeVigencia()
    const primera = abrir()
    expect(primera()).toBe(true)

    const segunda = abrir()
    // Es la parte que importa: la vieja tiene que saber que ya no manda ANTES
    // de escribir, aunque su respuesta llegue después.
    expect(primera()).toBe(false)
    expect(segunda()).toBe(true)
  })

  it('con varias en el aire solo la última manda', () => {
    const abrir = crearTestigoDeVigencia()
    const testigos = [abrir(), abrir(), abrir(), abrir()]
    expect(testigos.map((v) => v())).toEqual([false, false, false, true])
  })

  it('preguntar no consume: se puede comprobar en el `then` y otra vez en el `finally`', () => {
    const abrir = crearTestigoDeVigencia()
    const vigente = abrir()
    expect(vigente()).toBe(true)
    expect(vigente()).toBe(true)
  })

  it('dos testigos no se pisan: cada hook lleva su propia cuenta', () => {
    const historial = crearTestigoDeVigencia()
    const rendimiento = crearTestigoDeVigencia()
    const suya = historial()
    rendimiento()
    rendimiento()
    // Que otra pantalla pida no invalida lo que esta tenía en el aire.
    expect(suya()).toBe(true)
  })
})
