import { describe, expect, it } from 'vitest'
import { recentPoints, recentRoutes } from '../routes'

function row(over: Partial<Parameters<typeof recentRoutes>[0][number]> = {}) {
  return {
    origin_name: 'Botica Santa Rosa',
    origin_phone: '+51987654321',
    origin_lat: -9.1468,
    origin_lng: -78.2786,
    origin_reference_text: 'Botica Santa Rosa',
    destination_name: 'María',
    destination_phone: '912345678',
    destination_lat: -9.1495,
    destination_lng: -78.2795,
    destination_reference_text: 'Casa celeste, segundo piso',
    item_description: 'Medicinas',
    payer: 'destination' as const,
    status: 'delivered',
    ...over,
  }
}

describe('recentRoutes', () => {
  it('arma la ruta completa, con el celular en 9 dígitos', () => {
    const [r] = recentRoutes([row()])
    expect(r?.origin).toEqual({
      contactName: 'Botica Santa Rosa',
      contactPhone: '987654321',
      coordinates: { lat: -9.1468, lng: -78.2786 },
      accuracyM: null,
      referenceText: 'Botica Santa Rosa',
      label: 'Botica Santa Rosa',
    })
    expect(r?.destination.contactPhone).toBe('912345678')
    expect(r?.destination.referenceText).toBe('Casa celeste, segundo piso')
    expect(r?.itemDescription).toBe('Medicinas')
    expect(r?.payer).toBe('destination')
  })

  it('la misma ruta repetida sale una sola vez, la más reciente', () => {
    const routes = recentRoutes([
      row({ item_description: 'Lo de hoy' }),
      row({ item_description: 'Lo de ayer', origin_lat: -9.14681 }), // ~1 m: es el mismo sitio
      row({ item_description: 'Cuadrícula', origin_lat: -9.14685001 }), // cruza un redondeo, ~5 m
      row({ destination_lat: -9.16, destination_reference_text: 'Otra casa, por el colegio' }),
    ])
    expect(routes).toHaveLength(2)
    expect(routes[0]?.itemDescription).toBe('Lo de hoy')
    expect(routes[1]?.destination.referenceText).toBe('Otra casa, por el colegio')
  })

  it('dos puertas a más de 15 m son rutas distintas', () => {
    const routes = recentRoutes([row(), row({ destination_lat: -9.1497 })]) // ~22 m
    expect(routes).toHaveLength(2)
  })

  it('dos casas vecinas (a ~11 m) con otra referencia y otro celular no se funden', () => {
    const routes = recentRoutes([
      row(),
      row({
        destination_lat: -9.1496,
        destination_name: 'Daniel',
        destination_phone: '944444444',
        destination_reference_text: 'Puerta azul, al lado',
      }),
    ])
    expect(routes).toHaveLength(2)
  })

  it('a lo más tres', () => {
    const rows = [0, 1, 2, 3, 4].map((i) => row({ destination_lat: -9.14 - i * 0.01 }))
    expect(recentRoutes(rows)).toHaveLength(3)
  })

  it('solo ofrece repetir las que se entregaron', () => {
    expect(recentRoutes([row({ status: 'cancelled' }), row({ status: 'requested' })])).toEqual([])
  })

  it('ignora filas sin coordenadas', () => {
    expect(recentRoutes([row({ origin_lat: null, origin_lng: null })])).toEqual([])
  })
})

describe('recentPoints', () => {
  it('junta recojos y entregas sin repetir el mismo sitio, del más reciente al más antiguo', () => {
    const points = recentPoints([
      row(),
      row({ status: 'cancelled', destination_lat: -9.16, destination_name: 'Pedro' }),
    ])
    expect(points.map((p) => p.contactName)).toEqual(['María', 'Botica Santa Rosa', 'Pedro'])
  })

  it('una vecina a ~11 m con otro celular sigue saliendo', () => {
    const points = recentPoints([
      row(),
      row({
        destination_lat: -9.1496,
        destination_name: 'Daniel',
        destination_phone: '944444444',
        destination_reference_text: 'Puerta azul, al lado',
      }),
    ])
    expect(points.map((p) => p.contactName)).toContain('Daniel')
  })

  it('un punto sin nombre se rotula con su referencia', () => {
    const [p] = recentPoints([row({ destination_name: '' })])
    expect(p?.label).toBe('Casa celeste, segundo piso')
  })

  it('a lo más seis', () => {
    const rows = [0, 1, 2, 3, 4].map((i) =>
      row({ origin_lat: -9.1 - i * 0.01, destination_lat: -9.2 - i * 0.01 }),
    )
    expect(recentPoints(rows)).toHaveLength(6)
  })
})
