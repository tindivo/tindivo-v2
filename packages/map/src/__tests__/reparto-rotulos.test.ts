import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Landmark } from '../landmarks'

// El reparto solo usa de Leaflet el tamaño del lienzo y la proyección: se
// sustituye el módulo para no necesitar un navegador.
vi.mock('leaflet', () => ({ default: {} }))
vi.mock('react-leaflet', () => ({
  Marker: () => null,
  useMap: () => null,
  useMapEvents: () => null,
}))

type Punto = { x: number; y: number }

const mapaFalso = (ancho: number, puntos: Record<string, Punto>) =>
  ({
    getSize: () => ({ x: ancho, y: 844 }),
    latLngToContainerPoint: ([lat]: [number, number]) => puntos[String(lat)],
  }) as never

const lm = (id: string, name: string): Landmark =>
  ({ id, name, category: 'gobierno', lat: Number(id), lng: 0 }) as unknown as Landmark

beforeAll(() => {
  // 6 px por letra: un nombre de 25 letras (150 px) pasa del tope de 116 y va a dos líneas.
  vi.stubGlobal('document', {
    body: {},
    createElement: () => ({
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 6 }) }),
    }),
  })
  vi.stubGlobal('getComputedStyle', () => ({ fontFamily: 'sans-serif' }))
})

/**
 * El caso medido en el E2E `mapa-reparto-de-rotulos.spec.ts`: «Comisaría PNP San
 * Jacinto» no cabe a la derecha y se voltea a la izquierda, donde su caja de dos
 * líneas (13 px a cada lado de su centro) queda a RAS —cero píxeles— de la chapa
 * de la Posta, que está 24 px más arriba (11 de radio + 13). Leaflet redondea la
 * posición de cada marcador a píxeles enteros, así que ese cero es en realidad
 * ±1 px y, según la corrida, el nombre pisa la chapa. Un rótulo que solo "no
 * choca" por cero píxeles de aire no está bien repartido.
 */
describe.each([360, 390])('repartirRotulos a %i px', (ancho) => {
  it('no escribe un nombre que roza la chapa de otro punto', async () => {
    const { repartirRotulos } = await import('../landmark-layer')
    const dx = ancho - 360
    const comisaria = lm('1', 'Comisaría PNP San Jacinto')
    const posta = lm('2', 'Posta Médica')
    const mapa = mapaFalso(ancho, {
      '1': { x: 255 + dx, y: 312 },
      '2': { x: 194.5 + dx, y: 288 },
    })

    const reparto = repartirRotulos(mapa, [comisaria, posta], true)
    const c = reparto.find((r) => r.landmark.id === '1')

    expect(c?.conNombre, 'a 0 px de la chapa de la Posta no hay sitio para el nombre').toBe(false)
  })

  it('con la chapa vecina a 10 px más de distancia, el nombre se conserva a la izquierda', async () => {
    const { repartirRotulos } = await import('../landmark-layer')
    const dx = ancho - 360
    const mapa = mapaFalso(ancho, {
      '1': { x: 255 + dx, y: 312 },
      '2': { x: 194.5 + dx, y: 278 },
    })

    const reparto = repartirRotulos(
      mapa,
      [lm('1', 'Comisaría PNP San Jacinto'), lm('2', 'Posta Médica')],
      true,
    )
    const c = reparto.find((r) => r.landmark.id === '1')

    expect(c?.conNombre).toBe(true)
    expect(c?.aLaIzquierda).toBe(true)
  })
})
