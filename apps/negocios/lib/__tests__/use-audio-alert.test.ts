import { describe, expect, it } from 'vitest'
import { newArrivals } from '../use-audio-alert'

/**
 * EL CASO QUE COSTÓ EL 11.6% DE LOS AVISOS DE LLEGADA.
 *
 * Mientras esto fue un booleano (`hasWaiting`), el segundo motorizado en llegar
 * al mismo local no sonaba: no había flanco que disparar. Los ids lo arreglan
 * porque cada llegada es un hecho distinto. Ver la cabecera de `newArrivals`.
 */
describe('newArrivals', () => {
  it('avisa de la llegada que cae encima de otra que sigue esperando', () => {
    // `CFNUT3CR` lleva esperando desde las 20:31:50; `59FRVDYV` llega a las 20:34:14.
    expect(newArrivals(['CFNUT3CR'], ['CFNUT3CR', '59FRVDYV'])).toEqual(['59FRVDYV'])
  })

  it('no repite el aviso mientras el mismo pedido sigue esperando', () => {
    expect(newArrivals(['CFNUT3CR'], ['CFNUT3CR'])).toEqual([])
  })

  it('no avisa cuando el motorizado recoge y la lista se vacía', () => {
    expect(newArrivals(['CFNUT3CR'], [])).toEqual([])
  })

  it('avisa de la primera llegada', () => {
    expect(newArrivals([], ['CFNUT3CR'])).toEqual(['CFNUT3CR'])
  })

  it('vuelve a avisar si el mismo pedido sale de la espera y regresa', () => {
    // Un traspaso: el pedido se suelta y otro motorizado lo lleva otra vez al
    // local. Es una llegada nueva, y la cajera tiene que enterarse otra vez.
    const enEspera = ['CFNUT3CR']
    const trasRecoger: string[] = []
    expect(newArrivals(enEspera, trasRecoger)).toEqual([])
    expect(newArrivals(trasRecoger, ['CFNUT3CR'])).toEqual(['CFNUT3CR'])
  })

  it('avisa de las dos cuando llegan juntas entre dos refrescos', () => {
    expect(newArrivals([], ['CFNUT3CR', '59FRVDYV'])).toHaveLength(2)
  })
})
