import { describe, expect, it } from 'vitest'
import type { CourierPoint } from '../../types'
import { searchPoints } from '../point-search'

const landmarks = [
  { id: 'l1', name: 'BÓTICA Santa Rosa', category: 'salud' as const, lat: -9.1, lng: -78.2 },
  { id: 'l2', name: 'Colegio San Jacinto', category: 'educacion' as const, lat: -9.2, lng: -78.3 },
  { id: 'l3', name: 'Ojo', category: 'otro' as const, lat: -9.3, lng: -78.4 },
]

const recent: CourierPoint = {
  contactName: 'María',
  contactPhone: '912345678',
  coordinates: { lat: -9.15, lng: -78.25 },
  accuracyM: null,
  referenceText: 'Casa celeste, frente a la botica',
  label: 'María',
}

const home = {
  referenceText: 'Puerta verde, al lado del grifo',
  coordinates: { lat: -9.12, lng: -78.22 },
}

describe('searchPoints', () => {
  it('sin escribir nada: «Mi dirección» (solo en la entrega) y los recientes, sin lugares', () => {
    const forDestination = searchPoints({
      query: '',
      which: 'destination',
      landmarks,
      recents: [recent],
      home,
    })
    expect(forDestination.map((o) => o.kind)).toEqual(['home', 'recent'])

    const forOrigin = searchPoints({
      query: '',
      which: 'origin',
      landmarks,
      recents: [recent],
      home,
    })
    expect(forOrigin.map((o) => o.kind)).toEqual(['recent'])
  })

  it('al escribir busca sin tildes ni mayúsculas, en recientes y lugares', () => {
    const out = searchPoints({
      query: 'botica',
      which: 'origin',
      landmarks,
      recents: [recent],
      home,
    })
    expect(out.map((o) => o.title)).toEqual(['María', 'BÓTICA Santa Rosa'])
  })

  it('un reciente trae su contacto; un lugar solo el punto y la referencia', () => {
    const out = searchPoints({ query: 'a', which: 'origin', landmarks, recents: [recent], home })
    const r = out.find((o) => o.kind === 'recent')
    const l = out.find((o) => o.title === 'Colegio San Jacinto')
    expect(r?.point.contactPhone).toBe('912345678')
    expect(l?.point).toEqual({
      coordinates: { lat: -9.2, lng: -78.3 },
      referenceText: 'Colegio San Jacinto',
      label: 'Colegio San Jacinto',
    })
  })

  it('un lugar de nombre corto completa la referencia', () => {
    const [o] = searchPoints({ query: 'ojo', which: 'origin', landmarks, recents: [], home: null })
    expect(o?.point.referenceText).toBe('Frente a Ojo')
  })

  it('«Mi dirección» también sale si se escribe «casa» o «mi»', () => {
    const out = searchPoints({ query: 'casa', which: 'destination', landmarks, recents: [], home })
    expect(out[0]?.kind).toBe('home')
  })

  it('sin dirección guardada no hay «Mi dirección»', () => {
    const out = searchPoints({
      query: '',
      which: 'destination',
      landmarks,
      recents: [],
      home: null,
    })
    expect(out).toEqual([])
  })
})
