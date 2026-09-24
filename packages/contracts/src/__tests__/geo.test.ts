import { describe, expect, it } from 'vitest'
import { haversineMeters } from '../geo'

describe('haversineMeters', () => {
  it('da 0 para el mismo punto', () => {
    expect(haversineMeters({ lat: -9.146, lng: -78.278 }, { lat: -9.146, lng: -78.278 })).toBe(0)
  })

  it('un grado de latitud son ~111.2 km', () => {
    const a = { lat: 0, lng: 0 }
    const b = { lat: 1, lng: 0 }
    const d = haversineMeters(a, b)
    expect(d).toBeGreaterThan(111_000)
    expect(d).toBeLessThan(111_400)
  })

  it('es simétrica', () => {
    const a = { lat: -9.146, lng: -78.278 }
    const b = { lat: -9.15, lng: -78.27 }
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })

  it('dos puntos típicos de San Jacinto separados ~1.2 km dan un resultado razonable', () => {
    // Elmer (recojo) y "tu casa" (entrega) del diseño: ~1,2 km, como se ve en
    // el badge de distancia de Main.dc.html.
    const elmer = { lat: -9.146, lng: -78.278 }
    const casa = { lat: -9.1565, lng: -78.278 }
    const d = haversineMeters(elmer, casa)
    expect(d).toBeGreaterThan(900)
    expect(d).toBeLessThan(1500)
  })
})
