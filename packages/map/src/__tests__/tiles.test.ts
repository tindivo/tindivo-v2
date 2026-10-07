import { describe, expect, it } from 'vitest'
import { OSM_TILES, streetTiles } from '../tiles'

describe('streetTiles', () => {
  it('en producción usa CARTO con la key', () => {
    const t = streetTiles('abc', true)
    expect(t.url).toContain('basemaps.cartocdn.com')
    expect(t.url).toContain('?key=abc')
  })

  it('en producción sigue en CARTO aunque falte la key: el letrero delata el despliegue roto', () => {
    expect(streetTiles(undefined, true).url).toContain('basemaps.cartocdn.com')
  })

  it('en desarrollo sin key cae a OpenStreetMap', () => {
    expect(streetTiles(undefined, false).url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
  })

  it('en desarrollo con key usa CARTO', () => {
    expect(streetTiles('abc', false).url).toContain('basemaps.cartocdn.com')
  })
})

describe('OSM_TILES', () => {
  it('es el mapa estándar de OpenStreetMap, sin CARTO ni key, en cualquier entorno', () => {
    expect(OSM_TILES.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(OSM_TILES.url).not.toContain('cartocdn')
    expect(OSM_TILES.attribution).toContain('OpenStreetMap')
  })
})
